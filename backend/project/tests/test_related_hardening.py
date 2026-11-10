"""Pre-deployment hardening: four contracts that were not what they claimed.

Each class here reproduces one defect first and then pins the fixed
behaviour. Nothing in this file makes a real request -- the peer, the
provider, the registry and DNS are all stubbed.
"""
import os
import threading
import time
import unittest
from unittest import mock

from project import federation, related, relatedcache
from project.models import RelatedResearchCache
from project.tests.test_related_cache import CacheTestCase
from project.tests.test_related_research import (ENABLED, INTERNAL_ONLY, PEER,
                                                 REGISTRY, PeerStub,
                                                 ProviderStub)


# ------------------------------------------------------- 1. the env contract

class TestFederationEnvironmentIsAuthoritative(unittest.TestCase):
    """`QRESP_FEDERATION_SERVERS` has to be able to say "nobody".

    It could not. The value was `.strip()`ed and an empty result was read as
    "the variable is not set", so an operator switching federation off got the
    shipped list back instead -- the opposite of what they asked for. Presence
    is now decided by `os.environ` membership; only the CONTENT decides what
    is allowed.
    """

    def setUp(self):
        federation._allowlist = {"origins": frozenset(), "at": None}
        self.addCleanup(lambda: setattr(
            federation, "_allowlist", {"origins": frozenset(), "at": None}))
        registry = mock.patch.object(federation, "_registry_servers",
                                     return_value=[])
        registry.start()
        self.addCleanup(registry.stop)
        dns = mock.patch.object(federation, "_resolve_addresses",
                                return_value={"93.184.216.34"})
        dns.start()
        self.addCleanup(dns.stop)

    def origins(self, value=None):
        federation._allowlist = {"origins": frozenset(), "at": None}
        environment = dict(os.environ)
        environment.pop("QRESP_FEDERATION_SERVERS", None)
        if value is not None:
            environment["QRESP_FEDERATION_SERVERS"] = value
        with mock.patch.dict("os.environ", environment, clear=True):
            return set(federation.allowed_origins())

    def test_unset_falls_back_to_the_registry_and_shipped_list(self):
        origins = self.origins(None)
        self.assertTrue(origins)
        self.assertEqual(origins, set(federation._origins_from_entries(
            federation._shipped_servers())))

    def test_valid_origins_are_the_only_ones_allowed(self):
        self.assertEqual({PEER}, self.origins(PEER))
        self.assertEqual({PEER, "https://second.example.org"},
                         self.origins("%s, https://second.example.org" % PEER))

    def test_an_explicit_list_hides_the_shipped_one(self):
        shipped = set(federation._origins_from_entries(
            federation._shipped_servers()))
        self.assertTrue(shipped)
        self.assertFalse(shipped & self.origins(PEER))

    def test_empty_whitespace_and_commas_all_mean_federate_with_nobody(self):
        for value in ("", " ", "   ", ",", " , , ", "\t\n"):
            self.assertEqual(frozenset(), self.origins(value),
                             "%r must switch federation off" % value)

    def test_an_empty_allowlist_never_becomes_an_open_one(self):
        federation._allowlist = {"origins": frozenset(), "at": None}
        with mock.patch.dict("os.environ",
                             {"QRESP_FEDERATION_SERVERS": " "}):
            for candidate in (PEER, "https://paperstack.uchicago.edu",
                              "https://anything.example.net"):
                self.assertEqual((federation.REFUSED, None),
                                 federation.resolve_server(candidate),
                                 candidate)

    def test_junk_entries_are_dropped_without_opening_the_list(self):
        # A value of pure junk is still an explicit instruction, and it names
        # nothing usable -- so it means nobody, not "fall back".
        self.assertEqual(frozenset(), self.origins("not a url, ftp://x"))


# --------------------------------------------- 2. stale refresh single-flight

class TestStaleRefreshRunsOnce(CacheTestCase):
    """A stale entry must be served instantly to everyone, and refreshed by
    exactly one of them."""

    def stale_entry(self):
        """Prime the cache, then age it into the stale window with the peer
        caches expired too, so a refresh really does have to read the peer.

        The result cache AND the refresh guard share one fake clock, so a
        cooldown can be stepped over deliberately instead of waited out.
        """
        clock = {"now": 1000.0}
        cache = relatedcache.TTLCache(clock=lambda: clock["now"])
        guard = relatedcache.RefreshGuard(clock=lambda: clock["now"])
        for name, value in (("_result_cache", cache),
                            ("_refresh_guard", guard)):
            patcher = mock.patch.object(related, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        peer = PeerStub()
        self.views(1, peer=peer)
        self.assertEqual(2, len(peer.calls))
        clock["now"] += related.RESULT_TTL_SECONDS + 1
        related._remote_record_cache.clear()
        related._remote_corpus_cache.clear()
        peer.calls[:] = []
        return peer, clock

    def concurrent_views(self, peer, count=5, paper_id="remote-subject"):
        errors = []
        start = threading.Barrier(count)

        def view():
            try:
                start.wait(timeout=10)
                response = self.client.get(
                    '/api/paper/%s/related' % paper_id,
                    params={"server": PEER})
                self.assertEqual(200, response.status_code)
            except Exception as e:  # pragma: no cover - surfaced below
                errors.append(e)

        with mock.patch.dict('os.environ', INTERNAL_ONLY):
            with mock.patch.object(related, 'requests', ProviderStub()):
                with mock.patch.object(federation, 'requests', peer):
                    with mock.patch.object(federation, '_registry_servers',
                                           return_value=REGISTRY):
                        threads = [threading.Thread(target=view)
                                   for _ in range(count)]
                        for thread in threads:
                            thread.start()
                        for thread in threads:
                            thread.join(timeout=30)
        self.assertEqual([], errors)

    def test_five_concurrent_stale_readers_refresh_once(self):
        peer, _ = self.stale_entry()
        spawned = []
        real = relatedcache.spawn_background

        def counting(function):
            spawned.append(function)
            return real(function)

        with mock.patch.object(relatedcache, "spawn_background", counting):
            self.concurrent_views(peer)
            # Let whichever thread won finish its work.
            deadline = time.time() + 20
            while time.time() < deadline and len(peer.calls) < 2:
                time.sleep(0.05)
        # One record read and one corpus read, for all five readers.
        self.assertEqual(2, len(peer.calls), [c["url"] for c in peer.calls])
        self.assertEqual(1, len(spawned))

    def test_different_keys_refresh_independently(self):
        peer, _ = self.stale_entry()
        spawned = []
        with mock.patch.object(relatedcache, "spawn_background",
                               side_effect=lambda f: spawned.append(f)):
            self.views(1, peer=peer)
            self.views(1, paper_id="remote-near", peer=peer)
        # The second record is a cold miss, not a stale hit, so only the first
        # spawns a refresh -- but the guard did not block it.
        self.assertEqual(1, len(spawned))

    def test_the_guard_is_released_even_when_a_refresh_raises(self):
        peer, _ = self.stale_entry()
        related._refresh_guard.clear()
        with mock.patch.object(related, "_compute",
                               side_effect=RuntimeError("boom")):
            with mock.patch.object(relatedcache, "spawn_background",
                                   side_effect=lambda f: f()):
                self.views(1, peer=peer)
        self.assertFalse(related._refresh_guard.holders())

    def test_a_failed_refresh_keeps_the_last_good_answer(self):
        peer, _ = self.stale_entry()
        good = related._result_cache.get(
            related._result_key(PEER, "remote-subject"))[0]
        self.assertTrue(good[0]["internal"]["results"])

        broken = PeerStub(record_mode="timeout")
        with mock.patch.object(relatedcache, "spawn_background",
                               side_effect=lambda f: f()):
            served, _ = self.views(1, peer=broken)
        value, _state = related._result_cache.get(
            related._result_key(PEER, "remote-subject"))
        # The stale-but-real answer survives; it is NOT replaced by the
        # unavailable response the failed refresh produced.
        self.assertEqual("ok", value[0]["internal"]["status"])
        self.assertTrue(value[0]["internal"]["results"])

    def test_a_failed_refresh_is_not_retried_for_the_cooldown(self):
        peer, clock = self.stale_entry()
        broken = PeerStub(record_mode="timeout")
        with mock.patch.object(relatedcache, "spawn_background",
                               side_effect=lambda f: f()):
            self.views(1, peer=broken)
            self.assertEqual(1, len(broken.calls))
            # Every further reader inside the cooldown gets the stale answer
            # and starts nothing. The peer caches are cleared each time, so
            # this measures the GUARD and not the peer negative cache.
            for _ in range(4):
                related._remote_record_cache.clear()
                related._remote_corpus_cache.clear()
                self.views(1, peer=broken)
        self.assertEqual(1, len(broken.calls))
        # ...and what they were served is still the good answer.
        value, _state = related._result_cache.get(
            related._result_key(PEER, "remote-subject"))
        self.assertTrue(value[0]["internal"]["results"])

    def test_after_the_cooldown_one_new_attempt_is_made(self):
        peer, clock = self.stale_entry()
        broken = PeerStub(record_mode="timeout")
        with mock.patch.object(relatedcache, "spawn_background",
                               side_effect=lambda f: f()):
            self.views(1, peer=broken)
            self.assertEqual(1, len(broken.calls))
            clock["now"] += related.NEGATIVE_TTL_SECONDS + 1
            related._remote_record_cache.clear()
            related._remote_corpus_cache.clear()
            self.views(1, peer=broken)
            # Exactly one more attempt -- the cooldown restarts, it does not
            # open the door.
            self.assertEqual(2, len(broken.calls))
            related._remote_record_cache.clear()
            related._remote_corpus_cache.clear()
            self.views(1, peer=broken)
        self.assertEqual(2, len(broken.calls))

    def test_the_guard_does_not_grow_without_bound(self):
        # One entry per key IN FLIGHT, never one per key ever seen.
        for index in range(50):
            related._refresh_guard.acquire("key-%d" % index)
            related._refresh_guard.release("key-%d" % index)
        self.assertEqual(0, len(related._refresh_guard))


# ------------------------------------------------- 3. pipeline correctness

class TestExternalPipelineCounts(CacheTestCase):
    def test_scored_equals_after_dedupe_and_can_exceed_shown(self):
        # Forty candidates are deduplicated and SCORED (none removed for a
        # low or absent evidence verdict); twenty-five are shown. The old
        # code counted the gate-filtered list here, so `after_gate` and
        # `shown` were always equal and the cap was invisible. Under the
        # current policy `scored_candidates` is deliberately identical to
        # `after_dedupe` -- that equality IS the proof nothing was filtered
        # -- and it is `shown`, not `scored_candidates`, that the cap acts on.
        from project.tests.test_related_research import clones
        section = self.external(
            provider=ProviderStub(recommendations=clones(40)))
        pipeline = section["pipeline"]
        self.assertEqual(40, pipeline["raw_candidates"])
        self.assertEqual(40, pipeline["valid_candidates"])
        self.assertEqual(40, pipeline["after_dedupe"])
        self.assertEqual(40, pipeline["scored_candidates"])
        self.assertEqual(pipeline["after_dedupe"], pipeline["scored_candidates"])
        self.assertEqual(related.EXTERNAL_MAX_RESULTS, pipeline["shown"])
        self.assertGreater(pipeline["scored_candidates"], pipeline["shown"])
        self.assertEqual(related.EXTERNAL_MAX_RESULTS, len(section["results"]))

    def test_the_funnel_counts_are_distinguishable_at_every_stage(self):
        # raw > valid > after_dedupe > shown. `after_dedupe` and
        # `scored_candidates` are the ONE deliberate exception -- see the
        # test above -- so this proves the OTHER three stages still remove
        # something real: two entries with no title at all (dropped by
        # normalization, before de-duplication even runs) and two exact
        # repeats (dropped by de-duplication).
        from project.tests.test_related_research import (UNRELATED_EXTERNAL,
                                                         clones)
        passing = clones(30)
        payload = (passing + passing[:2]
                   + [dict(UNRELATED_EXTERNAL, paperId="no-title-1", title=""),
                      dict(UNRELATED_EXTERNAL, paperId="no-title-2",
                           title="   ")])
        section = self.external(provider=ProviderStub(recommendations=payload))
        pipeline = section["pipeline"]
        self.assertEqual(34, pipeline["raw_candidates"])
        self.assertEqual(32, pipeline["valid_candidates"])
        self.assertEqual(30, pipeline["after_dedupe"])
        self.assertEqual(30, pipeline["scored_candidates"])
        self.assertEqual(25, pipeline["shown"])
        self.assertEqual(25, len(section["results"]))

    def test_shown_is_never_more_than_the_cap_and_never_more_than_scored(self):
        from project.tests.test_related_research import clones
        for provider in (ProviderStub(), ProviderStub(recommendations=[]),
                         ProviderStub(recommendations=clones(40))):
            section = self.external(provider=provider)
            pipeline = section["pipeline"]
            self.assertLessEqual(pipeline["shown"],
                                 related.EXTERNAL_MAX_RESULTS)
            self.assertLessEqual(pipeline["shown"],
                                 pipeline["scored_candidates"])
            self.assertEqual(len(section["results"]), pipeline["shown"])

    def test_a_cache_hit_reports_the_same_reason_and_pipeline(self):
        live = self.external()
        cached = self.external()
        self.assertEqual(live["reason"], cached["reason"])
        self.assertEqual(live["pipeline"], cached["pipeline"])
        # ...and the second view really did come from the stored answer.
        self.assertEqual(1, RelatedResearchCache.objects.count())

    def test_a_legacy_entry_without_a_pipeline_still_serves(self):
        self.external()
        RelatedResearchCache.objects.update(unset__pipeline=1)
        related.reset_caches()
        section = self.external()
        # No crash, and the answer is still usable...
        self.assertEqual("ok", section["status"])
        self.assertIn("reason", section)
        # ...with the counts absent rather than invented.
        self.assertIsNone(section.get("pipeline"))

    def test_a_legacy_entry_is_refilled_by_the_next_real_refresh(self):
        self.external()
        RelatedResearchCache.objects.update(unset__pipeline=1,
                                            unset__expires_at=1)
        related.reset_caches()
        section = self.external()
        self.assertIsNotNone(section.get("pipeline"))
        self.assertIsNotNone(RelatedResearchCache.objects.first().pipeline)

    def test_the_stored_pipeline_carries_counts_only(self):
        self.external()
        stored = RelatedResearchCache.objects.first().pipeline
        # An exact set, so a new key has to be added here deliberately -- this
        # is what stops provider payload drifting into the cache.
        self.assertEqual({"resolved", "provider_status", "raw_candidates",
                          "valid_candidates", "after_dedupe",
                          "scored_candidates", "shown",
                          "source_kind"}, set(stored))
        for key, value in stored.items():
            self.assertIsInstance(value, (bool, int, str), key)
        # Nothing from the provider's payload.
        text = str(stored)
        for leak in ("Rareword", "abstract", "x-api-key", "10.2000"):
            self.assertNotIn(leak, text, leak)


# ------------------------------------------------- 4. HTTPS-only registry

class TestRegistryMustBeHttps(unittest.TestCase):
    """The registry decides what this server may contact. Reading it over
    plaintext would let anyone on the path add themselves to the allowlist,
    so an http:// registry is not fetched at all."""

    def registry_with(self, url):
        stub = mock.Mock()
        with mock.patch.object(federation.Config, "get_setting",
                               return_value=url):
            with mock.patch.object(federation, "requests", stub):
                entries = federation._registry_servers()
        return entries, stub

    def test_an_http_registry_is_never_requested(self):
        entries, stub = self.registry_with(
            "http://registry.example.org/servers.json")
        self.assertEqual([], entries)
        self.assertEqual(0, stub.get.call_count)

    def test_an_https_registry_is_requested(self):
        entries, stub = self.registry_with(
            "https://registry.example.org/servers.json")
        self.assertEqual(1, stub.get.call_count)

    def test_other_schemes_are_never_requested(self):
        for url in ("ftp://registry.example.org/x.json", "file:///etc/passwd",
                    "registry.example.org/x.json", "", None):
            entries, stub = self.registry_with(url)
            self.assertEqual([], entries, url)
            self.assertEqual(0, stub.get.call_count, url)

    def test_the_request_keeps_its_existing_protections(self):
        _, stub = self.registry_with("https://registry.example.org/s.json")
        kwargs = stub.get.call_args.kwargs
        self.assertFalse(kwargs["allow_redirects"])
        self.assertEqual(federation.REQUEST_TIMEOUT_SECONDS, kwargs["timeout"])
        self.assertNotIn("verify", kwargs)   # i.e. verification left ON

    def test_the_shipped_fallback_still_applies(self):
        federation._allowlist = {"origins": frozenset(), "at": None}
        try:
            with mock.patch.object(federation.Config, "get_setting",
                                   return_value="http://registry.example.org/s"):
                with mock.patch.object(federation, "requests", mock.Mock()):
                    origins = federation.allowed_origins()
            self.assertEqual(origins, frozenset(
                federation._origins_from_entries(
                    federation._shipped_servers())))
        finally:
            federation._allowlist = {"origins": frozenset(), "at": None}

    def test_the_registry_url_is_not_logged(self):
        printed = []
        with mock.patch("builtins.print", side_effect=printed.append):
            self.registry_with("http://secret-registry.example.org/s.json")
        self.assertNotIn("secret-registry",
                         " ".join(str(line) for line in printed))


if __name__ == "__main__":
    unittest.main()
