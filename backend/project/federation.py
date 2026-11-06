"""Reading a published record from ANOTHER Qresp server.

Qresp has always been federated, but only in the browser: the Explorer lets a
reader pick servers, `pages/search.js` fetches `/api/search` from each one, and
`pages/paperdetails/[id].js` fetches `/api/paper/{id}` from whichever server the
`?server=` query names. The backend was never part of that -- every handler it
has answers from its own MongoDB and nothing else.

That is fine while a page only needs to DISPLAY a remote record. It stops being
fine the moment a backend feature has to REASON about one: Related Research
scores a record against a corpus, so asking this server about a record it does
not hold can only ever be a 404.

This module is the missing half. It answers two questions, and nothing else:

  1. May this server be contacted at all?  (`resolve_server`)
  2. What does it say about a record, and about its corpus?
     (`fetch_record`, `fetch_corpus`)

What it deliberately does NOT do
--------------------------------
* It never writes. A federated record is read, scored and discarded; it is
  never saved to this server's MongoDB, so a Qresp node can never accumulate
  shadow copies of another node's records.
* It never copies a whole payload. `/api/paper/{id}` carries the curator's
  name, e-mail and affiliation, the RCC server path, the file-server path and
  the download/notebook paths. Only the published SCIENTIFIC metadata listed
  in the allowlists below is copied out; everything else is dropped at the
  boundary and cannot reach a profile, a cache entry or a response.
* It never takes a URL from the caller on trust. The only servers reachable
  through here are the ones the federated registry already names -- the same
  list the Explorer and the publish flow use.
"""
import io
import ipaddress
import json
import os
import re
import socket
import time
from urllib.parse import quote, urlsplit

import requests

from project import relatedcache
from project.config import Config

# Identifies Qresp politely, exactly as the other outbound callers do.
FEDERATION_HEADERS = {"User-Agent": "Qresp/2.0 (research data curation)"}

# One federated read is a page-blocking call on somebody else's server, so it
# is kept short. A slow peer degrades this one section, it does not hold a
# request open.
REQUEST_TIMEOUT_SECONDS = 8
# A corpus response is the biggest thing read here: every active record's
# title, abstract, tags and authors. Generous for a real Qresp node, and still
# a hard stop, so a hostile or broken peer cannot stream this process out of
# memory. Enforced while reading, not from Content-Length, which a peer
# controls and may simply omit.
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
# A server URL is an origin. Anything longer is not one.
MAX_SERVER_URL_CHARS = 200

# Hostnames are matched as plain ASCII. This is what refuses the lookalike
# host: a unicode homoglyph, a percent-encoded byte or an embedded slash
# cannot survive this pattern, so `https://paperstack.uchicagо.edu` (Cyrillic
# о) is rejected here rather than compared against the allowlist and missed.
# Dot-separated labels, each starting and ending alphanumeric: an empty label
# ("peer..example.org") is not a hostname either.
HOSTNAME_RE = re.compile(
    r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$")
# Qresp ids are Mongo ObjectIds. Bounding the shape keeps anything that could
# change the meaning of a URL path out of one.
PAPER_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

# The federated registry is refreshed at most this often. Without this, every
# Related Research request on a remote record would first fetch the registry.
ALLOWLIST_TTL_SECONDS = 300

# How long a hostname's DNS verdict is trusted. Short, because the whole point
# of the check is that an answer can change; long enough that it is not one
# lookup per page view.
DNS_CACHE_SECONDS = 120
# A refusal is remembered for less time than an approval: a transient resolver
# failure must not lock a legitimate peer out for two minutes.
DNS_FAILURE_CACHE_SECONDS = 30

_dns_cache = relatedcache.TTLCache(max_entries=64)

# Raw entries from the federated registry, cached so that the two callers
# (_server_names and allowed_origins) share a single outbound fetch instead of
# each making an independent 8-second-timeout request on every page load.
_registry_cache = {"entries": None, "at": None}

# The outcome of ONE outbound call, shared by every remote read in Qresp.
#
#   FOUND        the peer answered and the answer is usable
#   NOT_FOUND    the peer answered, and the answer is "no such thing" -- a
#                real 404. A fact about the record, not about the peer.
#   UNAVAILABLE  the peer did not answer: timeout, connection error, 429, 5xx,
#                a redirect, an oversized or unreadable body, or a 200 whose
#                shape is not what the endpoint documents. Says NOTHING about
#                the record, so it must never be recorded as one.
#
# Collapsing the last two is the classic bug: a timing-out peer gets written
# down as "this record does not exist".
FOUND = "found"
NOT_FOUND = "not_found"
UNAVAILABLE = "unavailable"

# ----------------------------------------------------------------- allowlist
#
# Cached per process, not per request.
_allowlist = {"origins": frozenset(), "at": None}


def _monotonic():
    return time.monotonic()


def parse_origin(raw):
    """`raw` -> the canonical origin `scheme://host[:port]`, or None.

    None means "this is not a Qresp server URL", and the caller must refuse --
    never fall back to a default, and never repair the input. Every rejection
    below is a shape that has been used to turn a URL parameter into a request
    somewhere the author did not intend:

    * credentials in the URL (`https://user:pass@host`) -- the "@" also hides
      the real host from a careless reader;
    * a query or a fragment -- neither belongs in an origin, and both are how
      a crafted path gets smuggled past a prefix check;
    * a path -- this module builds `origin + "/api/..."`, so a base path is
      never needed and would only be a place to hide traversal;
    * any scheme other than http/https -- no file:, no ftp:, no javascript:;
    * a hostname that is not plain ASCII (see HOSTNAME_RE);
    * a port outside 1..65535.

    http is parsed, not accepted: only a LOCAL target may be http, and a local
    target is answered from this server's own database without any request.
    `is_remote_candidate` is what refuses plaintext to a peer.
    """
    if not isinstance(raw, str):
        return None
    raw = raw.strip()
    if not raw or len(raw) > MAX_SERVER_URL_CHARS:
        return None
    try:
        parts = urlsplit(raw)
    except ValueError:
        return None
    if parts.scheme not in ("http", "https"):
        return None
    if parts.query or parts.fragment:
        return None
    if parts.path not in ("", "/"):
        return None
    if "@" in parts.netloc or parts.username or parts.password:
        return None
    hostname = (parts.hostname or "").lower()
    if not hostname:
        return None
    # An IPv6 literal is bracketed in a URL and would fail HOSTNAME_RE; it is
    # accepted only as a parsable address, and `is_remote_candidate` still has
    # to agree that the address is a public one.
    if hostname.startswith("[") or ":" in hostname:
        try:
            ipaddress.ip_address(hostname.strip("[]"))
        except ValueError:
            return None
        host_part = "[%s]" % hostname.strip("[]")
    else:
        if not HOSTNAME_RE.match(hostname):
            return None
        host_part = hostname
    try:
        port = parts.port
    except ValueError:
        return None
    if port is not None and not (0 < port < 65536):
        return None
    default_port = 443 if parts.scheme == "https" else 80
    if port and port != default_port:
        host_part = "%s:%d" % (host_part, port)
    return "%s://%s" % (parts.scheme, host_part)


def origin_hostname(origin):
    """Hostname of an origin already through `parse_origin`."""
    return (urlsplit(origin).hostname or "").lower()


def is_local_hostname(hostname):
    """Is this name THIS machine, rather than a peer?

    Loopback in every spelling, plus the `.localhost` suffix reserved for it.
    A local target is served from this server's own database, so it is never
    fetched -- which is also why loopback can never become an SSRF target
    here.
    """
    hostname = (hostname or "").lower().strip("[]")
    if hostname == "localhost" or hostname.endswith(".localhost"):
        return True
    try:
        return ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        return False


def _resolve_addresses(hostname):
    """Every IP `hostname` currently resolves to. Replaced in tests, which
    must not depend on DNS."""
    try:
        infos = socket.getaddrinfo(hostname, None)
    except Exception as e:
        print("Federated server hostname did not resolve: %s"
              % type(e).__name__)
        return None
    return {info[4][0] for info in infos if info[4]}


def resolves_to_public_addresses(hostname):
    """Does this NAME currently point somewhere a peer is allowed to be?

    Refusing literal private addresses is not enough on its own: an allowlisted
    hostname whose DNS answer is `127.0.0.1` or `169.254.169.254` would still
    be fetched, which is the standard way an allowlist is turned into a
    request against the machine itself. Every resolved address must be
    public, and a name that does not resolve at all is refused rather than
    attempted.

    Cached briefly so this costs one lookup per host per DNS_CACHE_SECONDS
    rather than one per page view.

    Residual risk, stated rather than papered over: this is a check followed
    by a separate connection, so a name that changes its answer in between
    (DNS rebinding) is not defeated by it. Closing that needs the connection
    itself to be pinned to the address that was checked, which `requests` does
    not expose.
    """
    hostname = (hostname or "").lower().strip("[]")
    if not hostname:
        return False
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        # Already a literal; `is_public_address` is the whole answer.
        return is_public_address(hostname)

    cached, state = _dns_cache.get(hostname)
    if state != "miss":
        return cached
    addresses = _resolve_addresses(hostname)
    allowed = bool(addresses) and all(is_public_address(a) for a in addresses)
    if not allowed and addresses:
        print("Federated server resolves to a non-public address; refused")
    _dns_cache.set(hostname, allowed,
                   DNS_CACHE_SECONDS if allowed else DNS_FAILURE_CACHE_SECONDS)
    return allowed


def is_public_address(hostname):
    """False for an address a peer must never be: loopback, private, link-local
    (169.254.169.254 -- the cloud metadata service), unique-local, multicast,
    reserved or unspecified.

    A NAME is not judged here: `is_global` only means something for a literal.
    Names are constrained by the allowlist instead, and the residual risk (a
    registry name that resolves into a private range) is recorded in
    docs/product/related-research.md rather than papered over.
    """
    hostname = (hostname or "").lower().strip("[]")
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        return True
    return bool(address.is_global)


def _origins_from_entries(entries):
    """Registry-shaped entries -> canonical origins. Every entry goes through
    the same `parse_origin` a request parameter does, so a bad entry is
    dropped rather than trusted for being in a list."""
    origins = set()
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue
        origin = parse_origin(entry.get("qresp_server_url"))
        if origin:
            origins.add(origin)
    return origins


def _shipped_servers():
    """The federation list Qresp ships with, mirroring the one the Explorer
    already uses (`frontend/data/qresp_servers.js`).

    This exists because the registry URL in config.ini
    (`GLOBAL/QRESP_SERVER_URL`) currently answers 404. Without a shipped list
    here, a backend allowlist built only from the registry would be
    permanently empty and this server could federate with nobody.

    `project/tests/test_federation.py` asserts this file and the frontend's
    stay in step, so the two lists cannot drift apart unnoticed.
    """
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "data", "qresp_servers.json")
    try:
        with io.open(path, encoding="utf-8") as source:
            return json.load(source)
    except Exception as e:
        print("Shipped Qresp server list unreadable: %s" % type(e).__name__)
        return []


def _server_names():
    """origin -> the short human label that list gives it ("UChicago").

    Read from the SAME entries the allowlist is built from, so a name is a
    fact this deployment already holds rather than something inferred from a
    hostname. The Explorer shows several nodes' records in one list, and a
    reader has to be able to tell which node a record came from; deriving
    "UChicago" from a URL containing `uchicago.edu` would be a guess that
    breaks the moment a node is renamed or a second node shares a domain.

    A server with no name simply has none here, and the caller falls back to
    the origin itself -- never to an invented label.
    """
    names = {}
    for entry in list(_shipped_servers()) + list(_registry_servers()):
        if not isinstance(entry, dict):
            continue
        origin = parse_origin(entry.get("qresp_server_url"))
        name = str(entry.get("qresp_server_name") or "").strip()
        if origin and name and origin not in names:
            names[origin] = name[:MAX_SERVER_NAME_CHARS]
    return names


# A label, not a description. Bounded so a registry this server does not
# control cannot push an essay into every record card in the Explorer.
MAX_SERVER_NAME_CHARS = 40


def _registry_servers():
    """The federated registry, fetched WITH certificate verification.

    This list decides what this server may contact, so an unverified fetch
    could let an attacker add itself to the allowlist. The registry is read
    directly with TLS verification and redirects refused, while retaining the
    same URL, shape, and fail-soft behavior.

    Results are cached for ALLOWLIST_TTL_SECONDS so that callers that run
    within the same request (allowed_origins and _server_names) share a single
    outbound fetch rather than each making an independent 8-second-timeout call.
    """
    now = _monotonic()
    if (_registry_cache["at"] is not None
            and now - _registry_cache["at"] < ALLOWLIST_TTL_SECONDS):
        return _registry_cache["entries"]
    try:
        url = (Config.get_setting('GLOBAL', 'QRESP_SERVER_URL') or "").strip()
    except Exception:
        return []
    origin = parse_origin_of(url)
    # HTTPS ONLY, and no request at all otherwise. This list decides what this
    # server may contact, so reading it over plaintext would let anyone on the
    # path add themselves to the outbound allowlist -- the exact thing
    # verifying the certificate is meant to prevent. A misconfigured registry
    # therefore degrades to "no registry", and the shipped list still applies.
    #
    # The URL is never logged: it comes from config.ini and may name an
    # internal host.
    if not origin or not origin.startswith("https://"):
        print("Federated server registry is not an https URL; ignored")
        _registry_cache["entries"] = []
        _registry_cache["at"] = now
        return []
    try:
        response = requests.get(url, headers=FEDERATION_HEADERS,
                                timeout=REQUEST_TIMEOUT_SECONDS,
                                allow_redirects=False)
        if response.status_code != 200:
            print("Federated server registry unavailable: HTTP %s"
                  % response.status_code)
            _registry_cache["entries"] = []
            _registry_cache["at"] = now
            return []
        entries = response.json()
    except Exception as e:
        print("Federated server registry unavailable: %s" % type(e).__name__)
        _registry_cache["entries"] = []
        _registry_cache["at"] = now
        return []
    result = entries if isinstance(entries, list) else []
    _registry_cache["entries"] = result
    _registry_cache["at"] = now
    return result


def parse_origin_of(url):
    """The origin of a full URL (which, unlike a server entry, may have a
    path). Used to sanity-check the configured registry URL."""
    try:
        parts = urlsplit(str(url or ""))
    except ValueError:
        return None
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return None
    return parse_origin("%s://%s" % (parts.scheme, parts.netloc))


FEDERATION_SERVERS_ENV = "QRESP_FEDERATION_SERVERS"


def _configured_servers():
    """`QRESP_FEDERATION_SERVERS`: a comma-separated list of origins.

    Returns None when the variable is ABSENT, and a (possibly empty) list when
    it is present. That distinction is the whole point, and it is decided by
    `os.environ` membership -- never by whether the value looks empty.

    When present it is the ONLY source: an operator naming servers means those
    servers, not those plus whatever else is lying around, and an operator
    setting it to nothing means NOBODY. Setting it to "", " " or "," switches
    federation off completely.

    The bug this replaced: the value was stripped and an empty result was read
    as "not set", so `QRESP_FEDERATION_SERVERS=" "` -- the documented way to
    turn federation off -- silently restored the shipped list instead. An
    operator disabling a feature got it enabled.
    """
    if FEDERATION_SERVERS_ENV not in os.environ:
        return None
    raw = os.environ[FEDERATION_SERVERS_ENV] or ""
    return [{"qresp_server_url": part.strip()}
            for part in raw.split(",") if part.strip()]


def allowed_origins(refresh=False):
    """The origins this server may contact.

    Three sources, in order of authority:

    1. `QRESP_FEDERATION_SERVERS`, when set -- exclusive; see above.
    2. the federated registry the publish flow already uses
       (`GLOBAL/QRESP_SERVER_URL`), plus
    3. the list Qresp ships with, which is what the Explorer federates with
       today.

    2 and 3 are unioned because they answer the same question and either may
    be empty: the registry is currently unreachable, and a deployment that
    fixes it should not have to also edit the shipped file.

    Whatever the source, an origin still has to survive `parse_origin`, the
    HTTPS rule and the literal-address rule in `resolve_server` before
    anything is fetched. Being on a list is necessary, never sufficient.
    """
    now = _monotonic()
    if (not refresh and _allowlist["at"] is not None
            and now - _allowlist["at"] < ALLOWLIST_TTL_SECONDS):
        return _allowlist["origins"]
    configured = _configured_servers()
    if configured is not None:
        origins = _origins_from_entries(configured)
    else:
        origins = _origins_from_entries(
            _registry_servers()) | _origins_from_entries(_shipped_servers())
    _allowlist["origins"] = frozenset(origins)
    _allowlist["at"] = now
    return _allowlist["origins"]


DEFAULT_SERVER_ENV = "QRESP_DEFAULT_EXPLORER_SERVER"


def default_server(origins=None):
    """The origin the Explorer searches when nobody has chosen one.

    The Explorer opens on results now instead of on a node picker, so "which
    server" stopped being something a visitor types and became something this
    deployment has to answer. It is answered HERE, beside the allowlist,
    because a default the allowlist would refuse is worse than no default: it
    sends every first-time visitor into a 400 that names a server they never
    picked.

    `QRESP_DEFAULT_EXPLORER_SERVER` names it. The value is canonicalized by
    the same `parse_origin` every other origin goes through -- so a trailing
    slash, a mixed-case host or an explicit :443 all resolve to the spelling
    the allowlist actually holds -- and it is then CHECKED for membership.
    Anything that fails either step is ignored, never obeyed: naming a server
    here can pick among the federated ones, and can never add one.

    Without the variable, the first origin in the published order. That is
    deterministic (the list is sorted) and visibly the first row, rather than
    an unrelated pick a reader would have to go looking for.

    An empty federation yields "" -- "nothing is configured", which the
    Explorer must be able to tell apart from "the server is down".
    """
    allowed = sorted(allowed_origins() if origins is None else origins)
    configured = parse_origin((os.environ.get(DEFAULT_SERVER_ENV) or "").strip())
    if configured and configured in allowed:
        return configured
    if configured:
        # Say so once: a deployment that names a server it does not federate
        # with has a configuration bug, and silently searching a different one
        # is how that stays unnoticed.
        print("%s names a server this deployment does not federate with; "
              "using the first federated server instead" % DEFAULT_SERVER_ENV)
    return allowed[0] if allowed else ""


def federation_servers():
    """
    The Qresp servers this deployment federates with
    Handler for GET: /api/federation/servers

    ONE list, published by the server that enforces it. The Explorer used to
    ship its own copy in `frontend/data/qresp_servers.js`, so the list a
    reader could pick from and the list the backend would actually contact
    were two files that nobody kept in step -- a server could be offered in
    the UI and then refused with a 400, or the reverse.

    This is the same set `resolve_server` allows, rendered in the shape the
    registry has always used, so the Explorer needs no new vocabulary. It is
    public, read-only and derived: no credential, no per-user data, and
    nothing here decides anything on its own -- every origin still has to
    survive the HTTPS, literal-address and DNS checks at request time.
    """
    origins = sorted(allowed_origins())
    names = _server_names()
    return {
        # `qresp_server_name` is ADDITIVE, and empty for a server this
        # deployment holds no name for. The Explorer labels each record with
        # the node it came from, and that label has to be data: it is read
        # from the federation list, never inferred from the hostname.
        "servers": [{"qresp_server_url": origin,
                     "qresp_server_name": names.get(origin, ""),
                     "isActive": "Yes",
                     "qresp_maintainer_emails": []}
                    for origin in origins],
        # ADDITIVE. An older Explorer reads `servers` and never sees this;
        # the current one opens straight onto this server's results instead
        # of asking the visitor to pick a node. Always one of `servers`, or
        # "" when this deployment federates with nobody.
        "default_server": default_server(origins),
    }, 200


LOCAL = "local"
REMOTE = "remote"
REFUSED = "refused"


def resolve_server(raw, local_hostname=None):
    """Decide what `?server=` means. Returns (kind, origin).

    LOCAL    absent, unparseable-as-remote-but-ours, loopback, or this very
             server -- answer from the local database exactly as before.
    REMOTE   an allowlisted peer; `origin` is canonical and safe to build a
             URL from.
    REFUSED  anything else. The caller must return an error, NOT fall back to
             the local database: silently answering about a different record
             that happens to share an id is worse than an error.

    The order matters. Shape is checked first, then "is this us", then HTTPS,
    then the literal-address rule, and only then the allowlist -- so a private
    address can never be reached even if a compromised registry names one.
    """
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return LOCAL, None
    origin = parse_origin(raw)
    if origin is None:
        return REFUSED, None
    hostname = origin_hostname(origin)
    if is_local_hostname(hostname):
        return LOCAL, None
    if local_hostname and hostname == str(local_hostname).lower():
        # The reader is on this server and the URL says so. Same records, no
        # request: the loop back through nginx would be pure cost.
        return LOCAL, None
    if not origin.startswith("https://"):
        # Plaintext to a peer would put a reader's browsing on the wire; the
        # registry lists https origins, so this can only be a crafted value.
        return REFUSED, None
    if not is_public_address(hostname):
        return REFUSED, None
    if origin not in allowed_origins():
        return REFUSED, None
    # LAST, and still before any request leaves this process: an allowlisted
    # NAME must not currently resolve somewhere a peer may not be.
    if not resolves_to_public_addresses(hostname):
        return REFUSED, None
    return REMOTE, origin


def cache_key(origin, paper_id):
    """The identity of a record ACROSS servers.

    A local record keeps its bare id, so every cache entry written before
    federation existed is still a hit -- that is the whole migration. A remote
    record is namespaced by its origin, so `<peer>/5983afce...` and a local
    `5983afce...` are two different rows and can never serve each other's
    answers.
    """
    if not origin:
        return str(paper_id)
    return "%s|%s" % (origin, paper_id)


# ---------------------------------------------------------------- transport

def _read_capped(response):
    """The body, or None if it is larger than MAX_RESPONSE_BYTES.

    Read incrementally and stopped at the cap, so an oversized answer costs
    the cap and not the whole stream.
    """
    chunks = []
    total = 0
    for chunk in response.iter_content(65536):
        if not chunk:
            continue
        total += len(chunk)
        if total > MAX_RESPONSE_BYTES:
            print("Federated Qresp server answer exceeded the size limit")
            return None
        chunks.append(chunk)
    return b"".join(chunks)


def _get_json(url, not_found_statuses=(404,)):
    """One bounded GET at a federated peer. Returns (payload, outcome).

    `not_found_statuses` is which codes mean the peer ANSWERED "no such
    thing". 404 always does; `/api/paper/{id}` additionally answers 400 for an
    id it cannot look up, which is why its caller widens the set rather than
    letting a missing record look like an outage.

    Redirects are NOT followed. A redirect is how an allowlisted origin would
    otherwise be turned into a request somewhere else, and there is no reason
    for a Qresp API to issue one, so it is treated as "the peer did not
    answer".

    Nothing about the failure other than its kind and status code is logged:
    a peer's error body is not this server's to print.
    """
    try:
        response = requests.get(url, headers=FEDERATION_HEADERS,
                                timeout=REQUEST_TIMEOUT_SECONDS,
                                allow_redirects=False, stream=True)
    except Exception as e:
        print("Federated Qresp server unreachable: %s" % type(e).__name__)
        return None, UNAVAILABLE
    try:
        if response.status_code in not_found_statuses:
            return None, NOT_FOUND
        if response.status_code != 200:
            print("Federated Qresp server error: HTTP %s"
                  % response.status_code)
            return None, UNAVAILABLE
        body = _read_capped(response)
        if body is None:
            return None, UNAVAILABLE
        try:
            payload = json.loads(body.decode("utf-8"))
        except Exception:
            print("Federated Qresp server returned an unreadable response")
            return None, UNAVAILABLE
    finally:
        try:
            response.close()
        except Exception:
            pass
    return payload, FOUND


# ----------------------------------------------------------- field allowlists
#
# EXACTLY the ARTIFACT fields `relatedness.build_internal_profile` reads, and
# therefore exactly the artifact fields `relatedness.metadata_fingerprint`
# hashes. Keeping the lists identical is what makes a federated record score
# the same way a local one does; adding a field to the profile without adding
# it here would silently make remote results weaker than local ones.
#
# The correspondence is exact for artifacts and deliberately NOT exact at the
# top level, in both directions:
#
#   * `collections` and the reference `authors` are copied out of a peer's
#     answer because a reader is shown them, and are read by neither the
#     profile nor the fingerprint -- they decide nothing;
#   * `facilityName` is hashed by the fingerprint but never becomes a term:
#     it decides which terms are excluded as organisational, so editing it
#     can change an answer.
CHART_FIELDS = ("caption", "properties")
DATASET_FIELDS = ("readme", "keywords")
SCRIPT_FIELDS = ("readme", "keywords")
TOOL_FIELDS = ("packageName", "programName", "facilityname", "facilityName",
               "measurement", "readme")

# Never copied out of a peer's answer, whatever it sends: insertedBy /
# firstName / lastName / emailId / affiliation (the curator), serverPath /
# fileServerPath / folderAbsolutePath / downloadPath / notebookPath /
# notebookFile (RCC URLs and file paths), files, workflows, heads, timeStamp,
# license, cite. The allowlists above are positive, so a field a peer invents
# is dropped by construction rather than by a blocklist that has to keep up.


def _text(value):
    return "" if value is None else str(value)


def _string_list(value, limit=200):
    if isinstance(value, str):
        items = [part.strip() for part in value.split(",")]
    elif isinstance(value, (list, tuple)):
        items = [_text(item).strip() for item in value]
    else:
        return []
    return [item for item in items if item][:limit]


def _people(value):
    """Author names -> the `{firstName, middleName, lastName}` shape a stored
    record uses.

    A peer's `/api/search` and `/api/paper` both join authors into one string
    ("Ada Lovelace, Alan Turing"); a stored record keeps them apart. The whole
    name goes in `lastName` because splitting a human name on whitespace is a
    guess, and nothing downstream needs the parts -- `_people` in
    relatedness.py joins them straight back together, and the fingerprint
    hashes the triple either way.
    """
    return [{"firstName": "", "middleName": "", "lastName": name}
            for name in _string_list(value, limit=100)]


def _artifacts(value, fields, limit=200):
    kept = []
    for item in (value or [])[:limit]:
        if not isinstance(item, dict):
            continue
        copied = {}
        for field in fields:
            if field not in item:
                continue
            raw = item[field]
            if isinstance(raw, (list, tuple)):
                copied[field] = _string_list(raw)
            else:
                copied[field] = _text(raw)
        if copied:
            kept.append(copied)
    return kept


def _record(paper_id, title, abstract, doi, year, authors, tags, collections,
            charts=None, datasets=None, scripts=None, tools=None):
    try:
        year = int(year) if year not in (None, "") else None
    except (TypeError, ValueError):
        year = None
    return {
        "_id": str(paper_id),
        "reference": {
            "title": _text(title).strip(),
            "publishedAbstract": _text(abstract),
            "DOI": _text(doi).strip(),
            "year": year,
            "authors": _people(authors),
        },
        "tags": _string_list(tags),
        "collections": _string_list(collections),
        "charts": _artifacts(charts, CHART_FIELDS),
        "datasets": _artifacts(datasets, DATASET_FIELDS),
        "scripts": _artifacts(scripts, SCRIPT_FIELDS),
        "tools": _artifacts(tools, TOOL_FIELDS),
    }


def record_from_details(payload, paper_id):
    """A peer's `/api/paper/{id}` answer -> a record dict shaped like one this
    server stores. Allowlisted; see the note above."""
    if not isinstance(payload, dict):
        return None
    record = _record(
        paper_id,
        payload.get("title"), payload.get("abstract"), payload.get("doi"),
        payload.get("year"), payload.get("authors"), payload.get("tags"),
        payload.get("collections"), payload.get("charts"),
        payload.get("datasets"), payload.get("scripts"), payload.get("tools"))
    if not record["reference"]["title"]:
        # A record with no title is not one this endpoint can reason about,
        # and is far more likely to be a different API answering.
        return None
    return record


def _search_field(entry, name):
    """`/api/search` serializes a `util.Search`, whose attributes are private,
    so every key arrives name-mangled as `_Search__title`. The plain name is
    accepted too, so a future peer that cleans this up keeps working."""
    if ("_Search__" + name) in entry:
        return entry["_Search__" + name]
    return entry.get(name)


def record_from_search_entry(entry):
    """One entry of a peer's `/api/search` -> a corpus record.

    A search entry carries no artifacts, so a federated corpus is scored on
    title, abstract, tags, collections, authors and DOI alone. That is a real
    difference from the local corpus and is documented as such; it makes
    remote scoring slightly more conservative, never more permissive.
    """
    if not isinstance(entry, dict):
        return None
    paper_id = _text(_search_field(entry, "id")).strip()
    title = _text(_search_field(entry, "title")).strip()
    if not paper_id or not title:
        return None
    return _record(paper_id, title, _search_field(entry, "abstract"),
                   _search_field(entry, "doi"), _search_field(entry, "year"),
                   _search_field(entry, "authors"),
                   _search_field(entry, "tags"),
                   _search_field(entry, "collections"))


# ------------------------------------------------------------------- reads

def fetch_record(origin, paper_id):
    """One published record from a peer. Returns (record, outcome).

    Qresp's own `/api/paper/{id}` answers 400 for an id it cannot look up and
    404 for one it will not show, so both are the peer ANSWERING "not this
    record" rather than failing.
    """
    if not PAPER_ID_RE.match(str(paper_id or "")):
        return None, NOT_FOUND
    url = "%s/api/paper/%s" % (origin, quote(str(paper_id), safe=""))
    payload, outcome = _get_json(url, not_found_statuses=(400, 404))
    if outcome == UNAVAILABLE:
        return None, UNAVAILABLE
    if outcome == NOT_FOUND:
        return None, NOT_FOUND
    if isinstance(payload, str):
        # `/api/paper` returns a bare string on its own error path.
        return None, NOT_FOUND
    record = record_from_details(payload, paper_id)
    if record is None:
        print("Federated Qresp server returned an unexpected record shape")
        return None, UNAVAILABLE
    return record, FOUND


def fetch_corpus(origin):
    """A peer's public, active corpus, via the same `/api/search` the Explorer
    uses. Returns (records, outcome).

    Only active records are in that answer -- the peer applies its own
    visibility rules -- so this server never has to guess at another server's
    publication state.
    """
    payload, outcome = _get_json("%s/api/search" % origin)
    if outcome != FOUND:
        return None, outcome
    if not isinstance(payload, list):
        print("Federated Qresp server returned an unexpected corpus shape")
        return None, UNAVAILABLE
    records = []
    for entry in payload:
        record = record_from_search_entry(entry)
        if record:
            records.append(record)
    return records, FOUND
