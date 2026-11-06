"""In-memory caching for Related Research: TTL, single-flight, stale-while-
revalidate, and a short negative cache.

Why in memory, and why here
---------------------------
Related Research already has ONE persistent cache: `RelatedResearchCache`,
which stores what Semantic Scholar said. That is the expensive, slow-moving,
third-party answer, and it belongs in MongoDB.

Everything this module caches is different in kind:

* a federated peer's copy of a record and its corpus -- another server's data,
  which Qresp must not persist (see project/federation.py);
* the computed response -- cheap to rebuild, and invalid the moment the
  scoring code changes.

Persisting either would mean a second durable copy of data that already has an
owner, so these live in the process, bounded, and disappear on restart. There
is deliberately no second Mongo collection.

What it prevents
----------------
Before this, every page view of a federated record made two requests to the
peer -- one for the record, one for its whole corpus -- and recomputed
everything. A reader pressing reload five times cost the peer ten requests,
and five readers arriving together cost it ten more, all for one answer.
"""
import threading
import time

# Bounded so a long-running process cannot grow without limit. When a store is
# full the OLDEST entry by insertion is dropped -- Related Research traffic
# follows whatever detail pages are being read, so recency is the right thing
# to keep and an exact LRU is not worth the bookkeeping.
DEFAULT_MAX_ENTRIES = 256


class TTLCache(object):
    """A bounded {key: value} store with per-entry expiry, safe to share
    between threads.

    Entries carry two deadlines, not one:

      `fresh_until`  after this the value is STALE: still returnable, but a
                     refresh should be started.
      `expires_at`   after this the value is gone.

    The gap between them is what makes stale-while-revalidate possible: a
    reader gets the previous answer immediately while the new one is computed,
    instead of waiting for a peer that may be slow.
    """

    def __init__(self, max_entries=DEFAULT_MAX_ENTRIES, clock=time.time):
        self._entries = {}
        self._lock = threading.RLock()
        self._max_entries = max_entries
        self._clock = clock

    def get(self, key):
        """Returns (value, state) where state is 'miss', 'fresh' or 'stale'.

        A caller that gets 'stale' has a usable value AND an obligation to
        consider refreshing it -- that is the whole contract.
        """
        now = self._clock()
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None, "miss"
            value, fresh_until, expires_at = entry
            if expires_at is not None and now >= expires_at:
                del self._entries[key]
                return None, "miss"
            if fresh_until is not None and now >= fresh_until:
                return value, "stale"
            return value, "fresh"

    def set(self, key, value, ttl, stale_ttl=0.0):
        """Store `value` for `ttl` seconds fresh, then `stale_ttl` more
        seconds during which it may still be served while being refreshed."""
        now = self._clock()
        with self._lock:
            if key not in self._entries and len(self._entries) >= self._max_entries:
                oldest = next(iter(self._entries), None)
                if oldest is not None:
                    del self._entries[oldest]
            self._entries[key] = (value, now + ttl, now + ttl + stale_ttl)

    def invalidate(self, key):
        with self._lock:
            self._entries.pop(key, None)

    def clear(self):
        with self._lock:
            self._entries.clear()

    def __len__(self):
        with self._lock:
            return len(self._entries)


class SingleFlight(object):
    """One computation per key at a time.

    Five readers opening the same detail page at the same moment must cost the
    peer -- and Semantic Scholar -- ONE round of work, not five. The first
    caller for a key runs `produce`; the others block on the same lock and
    then read what it stored, so the expensive path runs once.

    Deliberately NOT a global lock: two different records must not queue
    behind each other.
    """

    def __init__(self):
        self._locks = {}
        self._guard = threading.Lock()

    def _lock_for(self, key):
        with self._guard:
            lock = self._locks.get(key)
            if lock is None:
                lock = self._locks[key] = threading.Lock()
            return lock

    def _release(self, key):
        with self._guard:
            lock = self._locks.get(key)
            # Drop the lock object once nobody is waiting on it, so the map
            # does not grow with every record ever viewed.
            if lock is not None and not lock.locked():
                self._locks.pop(key, None)

    def run(self, key, produce, already_done=None):
        """Run `produce()` for `key`, once.

        `already_done` is re-checked after the lock is acquired: a caller that
        waited is very likely waiting for exactly the value that has just been
        stored, and re-running the work would defeat the point. It returns
        (found, value).
        """
        lock = self._lock_for(key)
        lock.acquire()
        try:
            if already_done is not None:
                found, value = already_done()
                if found:
                    return value
            return produce()
        finally:
            lock.release()
            self._release(key)


class RefreshGuard(object):
    """At most one BACKGROUND refresh per key, plus a cooldown after failure.

    `SingleFlight` above serialises callers that are all waiting for the same
    answer. This is the other half: work that nobody waits for. A stale entry
    is returned to every reader immediately, so nothing blocks -- but without
    a guard, every one of those readers would also start a refresh, and five
    readers arriving together on an expired record would each read the peer.

    Two states per key:

      ACTIVE     a refresh is running; `acquire` refuses until it finishes.
      COOLDOWN   the last refresh FAILED; `acquire` refuses until the cooldown
                 expires, so one unreachable peer cannot be re-tried by every
                 page view. After it expires, exactly one new attempt is let
                 through.

    Bounded by construction: an entry exists only while a refresh is in
    flight or a cooldown is unexpired. Successful releases drop the key
    entirely, and expired cooldowns are pruned on every call, so the maps
    track concurrent work rather than every record ever viewed.
    """

    def __init__(self, clock=time.monotonic, max_cooldowns=DEFAULT_MAX_ENTRIES):
        self._active = set()
        self._cooldowns = {}
        self._lock = threading.Lock()
        self._clock = clock
        self._max_cooldowns = max_cooldowns

    def _prune(self, now):
        expired = [key for key, until in self._cooldowns.items() if until <= now]
        for key in expired:
            del self._cooldowns[key]
        # A pathological number of distinct failing keys must not accumulate
        # either; the oldest deadlines go first.
        if len(self._cooldowns) > self._max_cooldowns:
            for key in sorted(self._cooldowns, key=self._cooldowns.get)[
                    :len(self._cooldowns) - self._max_cooldowns]:
                del self._cooldowns[key]

    def acquire(self, key):
        """True if the caller may refresh `key` now, and False otherwise.

        A caller that gets True MUST call `release`."""
        now = self._clock()
        with self._lock:
            self._prune(now)
            if key in self._active:
                return False
            if self._cooldowns.get(key, 0) > now:
                return False
            self._active.add(key)
            return True

    def release(self, key, failed=False, cooldown=0.0):
        """Hand the key back. `failed` starts a cooldown; success clears one."""
        now = self._clock()
        with self._lock:
            self._active.discard(key)
            if failed and cooldown > 0:
                self._cooldowns[key] = now + cooldown
            else:
                self._cooldowns.pop(key, None)
            self._prune(now)

    def holders(self):
        with self._lock:
            return set(self._active)

    def clear(self):
        with self._lock:
            self._active.clear()
            self._cooldowns.clear()

    def __len__(self):
        with self._lock:
            return len(self._active) + len(self._cooldowns)


def spawn_background(function):
    """Run `function()` off the request path, never letting it raise into the
    process.

    Replaced wholesale in tests, so a stale-while-revalidate refresh can be
    made synchronous and its provider calls counted deterministically.
    """
    def guarded():
        try:
            function()
        except Exception as e:  # a refresh failure must never crash a thread
            print("Related research background refresh failed: %s"
                  % type(e).__name__)

    thread = threading.Thread(target=guarded, daemon=True,
                              name="related-research-refresh")
    thread.start()
    return thread
