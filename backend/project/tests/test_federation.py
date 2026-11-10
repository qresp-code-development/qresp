"""Reading a record from another Qresp server: which servers, and how.

The endpoint behaviour is in test_related_research.py. What is pinned here is
the boundary itself -- every URL shape that must be refused, the allowlist the
refusals are measured against, the bounds on the request, and the promise that
only published scientific metadata survives the copy out of a peer's answer.

Nothing in this file makes a real request: `federation.requests` is stubbed in
every test that reaches transport.
"""
import io
import json
import os
import re
import unittest
from unittest import mock

from project import federation

PEER = "https://peer.example.org"
OTHER_PEER = "https://second.example.org"
REGISTRY = [{"qresp_server_url": PEER, "isActive": "Yes"},
            {"qresp_server_url": OTHER_PEER, "isActive": "Yes"}]


class FakeResponse:
    """Enough of `requests.Response` for federation._get_json."""

    def __init__(self, payload=None, status_code=200, body=None, chunks=None):
        self.status_code = status_code
        if chunks is not None:
            self._chunks = list(chunks)
        elif body is not None:
            self._chunks = [body]
        else:
            self._chunks = [json.dumps(payload).encode("utf-8")]
        self.closed = False

    def iter_content(self, size):
        for chunk in self._chunks:
            yield chunk

    def close(self):
        self.closed = True


class RequestsStub:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append(dict(kwargs, url=url))
        if self.error is not None:
            raise self.error
        return self.response


class FederationTestCase(unittest.TestCase):
    def setUp(self):
        # The allowlist, registry, and DNS verdicts are cached per process;
        # every test starts cold so one test's registry can never authorise
        # another's request.
        federation._allowlist = {"origins": frozenset(), "at": None}
        federation._registry_cache = {"entries": None, "at": None}
        federation._dns_cache.clear()
        # No test resolves a real name. Every hostname is answered with one
        # public address unless a test says otherwise.
        self._dns = mock.patch.object(federation, "_resolve_addresses",
                                      side_effect=self.resolve)
        self._dns.start()
        self.addCleanup(self._dns.stop)
        self.dns_answers = {}

    def resolve(self, hostname):
        # A genuinely global address: 203.0.113.0/24 is documentation
        # space, which `ipaddress` correctly reports as not global.
        return self.dns_answers.get(hostname, {"93.184.216.34"})

    def tearDown(self):
        federation._allowlist = {"origins": frozenset(), "at": None}
        federation._registry_cache = {"entries": None, "at": None}
        federation._dns_cache.clear()

    def allowing(self, servers=REGISTRY):
        return mock.patch.object(federation, "_registry_servers",
                                 return_value=servers)


# --------------------------------------------------------------- URL shapes

class TestOriginParsing(FederationTestCase):
    def test_a_plain_origin_is_canonical(self):
        self.assertEqual(PEER, federation.parse_origin(PEER))
        self.assertEqual(PEER, federation.parse_origin(PEER + "/"))
        self.assertEqual(PEER, federation.parse_origin("  " + PEER + "  "))

    def test_host_case_is_folded_but_the_scheme_is_not_invented(self):
        self.assertEqual(PEER, federation.parse_origin(
            "https://PEER.Example.ORG"))
        self.assertEqual("http://peer.example.org",
                         federation.parse_origin("http://peer.example.org"))

    def test_a_default_port_is_dropped_and_a_real_one_is_kept(self):
        self.assertEqual(PEER, federation.parse_origin(PEER + ":443"))
        self.assertEqual(PEER + ":8443",
                         federation.parse_origin(PEER + ":8443"))

    def test_credentials_in_the_url_are_refused(self):
        # The "@" is also what hides the real host from a reader.
        self.assertIsNone(federation.parse_origin(
            "https://user:secret@peer.example.org"))
        self.assertIsNone(federation.parse_origin(
            "https://peer.example.org@evil.example.net"))

    def test_a_query_or_fragment_is_refused(self):
        self.assertIsNone(federation.parse_origin(PEER + "?next=/x"))
        self.assertIsNone(federation.parse_origin(PEER + "#/x"))

    def test_a_path_is_refused(self):
        self.assertIsNone(federation.parse_origin(PEER + "/api"))
        self.assertIsNone(federation.parse_origin(PEER + "/../etc"))

    def test_other_schemes_are_refused(self):
        for raw in ("file:///etc/passwd", "ftp://peer.example.org",
                    "javascript:alert(1)", "gopher://peer.example.org",
                    "//peer.example.org", "peer.example.org"):
            self.assertIsNone(federation.parse_origin(raw), raw)

    def test_a_non_ascii_lookalike_host_is_refused(self):
        # Cyrillic "о" in "uchicago" -- indistinguishable to a reader, and a
        # different host entirely.
        self.assertIsNone(federation.parse_origin(
            "https://paperstack.uchicagо.edu"))

    def test_percent_encoding_and_stray_characters_in_a_host_are_refused(self):
        for raw in ("https://peer%2eexample.org", "https://peer_example.org",
                    "https://peer..example.org/", "https://-peer.example.org",
                    "https://peer.example.org\\@evil.example.net"):
            self.assertIsNone(federation.parse_origin(raw), raw)

    def test_junk_and_oversized_input_is_refused(self):
        for raw in (None, 42, "", "   ", "https://",
                    "https://" + ("a" * 300) + ".example.org"):
            self.assertIsNone(federation.parse_origin(raw), repr(raw))


# ----------------------------------------------------------------- allowlist

class TestAllowlist(FederationTestCase):
    def test_the_allowlist_includes_the_existing_federated_registry(self):
        with self.allowing():
            origins = set(federation.allowed_origins())
        self.assertTrue({PEER, OTHER_PEER} <= origins)

    def test_a_registry_outage_falls_back_to_the_shipped_list(self):
        # The registry URL in config.ini currently answers 404, so this is the
        # normal case, not the exotic one: without the shipped list the
        # allowlist would be permanently empty and this server could federate
        # with nobody.
        with mock.patch.object(federation, "_registry_servers",
                               return_value=[]):
            origins = federation.allowed_origins()
        self.assertTrue(origins)
        self.assertEqual(origins, federation._origins_from_entries(
            federation._shipped_servers()))

    def test_a_registry_adds_to_the_shipped_list_rather_than_replacing_it(self):
        with self.allowing([{"qresp_server_url": PEER}]):
            origins = federation.allowed_origins()
        self.assertIn(PEER, origins)
        for shipped in federation._origins_from_entries(
                federation._shipped_servers()):
            self.assertIn(shipped, origins)

    def test_an_unreadable_shipped_list_still_fails_closed(self):
        # Nothing to fall back to must mean nothing is authorised -- never
        # "anything".
        with mock.patch.object(federation, "_registry_servers",
                               return_value=[]):
            with mock.patch.object(federation, "_shipped_servers",
                                   return_value=[]):
                self.assertEqual(frozenset(), federation.allowed_origins())
                self.assertEqual((federation.REFUSED, None),
                                 federation.resolve_server(PEER))

    def test_the_environment_overrides_every_other_source(self):
        # An operator naming servers means those servers, not those plus
        # whatever else is lying around.
        with mock.patch.dict(
                'os.environ', {"QRESP_FEDERATION_SERVERS": OTHER_PEER}):
            with self.allowing([{"qresp_server_url": PEER}]):
                origins = federation.allowed_origins()
        self.assertEqual({OTHER_PEER}, set(origins))

    def test_the_environment_can_switch_federation_off_entirely(self):
        with mock.patch.dict('os.environ',
                             {"QRESP_FEDERATION_SERVERS": " , "}):
            with self.allowing():
                self.assertEqual(frozenset(), federation.allowed_origins())

    def test_the_shipped_list_matches_the_one_the_frontend_uses(self):
        """Two copies of the federation list, one per container. This is what
        stops them drifting apart unnoticed."""
        here = os.path.dirname(os.path.abspath(federation.__file__))
        frontend = os.path.join(here, "..", "..", "frontend", "data",
                                "qresp_servers.js")
        if not os.path.exists(frontend):
            self.skipTest("frontend checkout not present")
        with io.open(frontend, encoding="utf-8") as source:
            text = source.read()
        theirs = set(re.findall(r'qresp_server_url:\s*"([^"]+)"', text))
        ours = {entry["qresp_server_url"]
                for entry in federation._shipped_servers()}
        self.assertEqual(theirs, ours)
        # ...and so do the LABELS. The Explorer tags every record with the
        # node it came from, and the two containers reading different names
        # for the same node is exactly the drift this test exists to catch.
        their_names = set(re.findall(r'qresp_server_name:\s*"([^"]+)"', text))
        our_names = {entry.get("qresp_server_name")
                     for entry in federation._shipped_servers()
                     if entry.get("qresp_server_name")}
        self.assertEqual(their_names, our_names)

    def test_every_shipped_server_has_a_name_to_tag_records_with(self):
        # A record shows where it came from. Without a name the tag falls back
        # to the host, which is true but not what a reader recognises.
        for entry in federation._shipped_servers():
            self.assertTrue((entry.get("qresp_server_name") or "").strip(),
                            entry.get("qresp_server_url"))

    def test_the_published_list_carries_the_name_of_each_server(self):
        with self.allowing():
            body, status = federation.federation_servers()
        self.assertEqual(200, status)
        self.assertTrue(body["servers"])
        names = {entry["qresp_server_url"]: entry["qresp_server_name"]
                 for entry in body["servers"]}
        shipped = {entry["qresp_server_url"]: entry["qresp_server_name"]
                   for entry in federation._shipped_servers()}
        for origin, name in shipped.items():
            self.assertEqual(name, names.get(origin), origin)

    def test_a_server_with_no_published_name_gets_an_empty_one(self):
        # Empty, never invented: the Explorer falls back to the host itself
        # rather than guessing a label from the URL.
        with mock.patch.object(federation, "_shipped_servers",
                               return_value=[{"qresp_server_url": PEER}]):
            with self.allowing():
                body, _status = federation.federation_servers()
        published = {entry["qresp_server_url"]: entry["qresp_server_name"]
                     for entry in body["servers"]}
        self.assertEqual("", published.get(PEER))

    def test_a_server_name_is_bounded(self):
        # The registry is not this server's to control, so a name from it
        # cannot push an essay into every record card in the Explorer.
        with mock.patch.object(
                federation, "_shipped_servers",
                return_value=[{"qresp_server_url": PEER,
                               "qresp_server_name": "N" * 500}]):
            names = federation._server_names()
        self.assertEqual(federation.MAX_SERVER_NAME_CHARS,
                         len(names[PEER]))

    def test_registry_entries_go_through_the_same_url_rules(self):
        entries = [{"qresp_server_url": "http://plain.example.org"},
                   {"qresp_server_url": "not a url"},
                   {"qresp_server_url": PEER},
                   "a bare string",
                   {"no_url_key": True}]
        self.assertEqual({"http://plain.example.org", PEER},
                         federation._origins_from_entries(entries))
        with self.allowing(entries):
            origins = set(federation.allowed_origins())
        self.assertNotIn("not a url", origins)
        self.assertIn(PEER, origins)

    def test_the_registry_is_not_fetched_once_per_request(self):
        registry = mock.Mock(return_value=REGISTRY)
        with mock.patch.object(federation, "_registry_servers", registry):
            for _ in range(5):
                federation.allowed_origins()
        self.assertEqual(1, registry.call_count)


# ------------------------------------------------------------ what is local

class TestLocalTargets(FederationTestCase):
    def test_no_server_is_local(self):
        self.assertEqual((federation.LOCAL, None),
                         federation.resolve_server(None))
        self.assertEqual((federation.LOCAL, None),
                         federation.resolve_server("   "))

    def test_loopback_is_local_and_is_never_fetched(self):
        for raw in ("https://localhost:8443", "http://127.0.0.1:5000",
                    "https://app.localhost", "http://[::1]:8000"):
            self.assertEqual((federation.LOCAL, None),
                             federation.resolve_server(raw), raw)

    def test_this_very_server_is_local(self):
        self.assertEqual(
            (federation.LOCAL, None),
            federation.resolve_server("https://qresp.example.edu",
                                      local_hostname="qresp.example.edu"))

    def test_a_local_target_needs_no_allowlist_and_no_registry(self):
        # Deciding "this is us" must not depend on a remote registry being up.
        registry = mock.Mock(side_effect=AssertionError("must not be asked"))
        with mock.patch.object(federation, "_registry_servers", registry):
            self.assertEqual((federation.LOCAL, None),
                             federation.resolve_server("https://localhost"))


# ----------------------------------------------------------------- refusals

class TestRemoteRefusals(FederationTestCase):
    def test_an_allowlisted_https_peer_is_accepted(self):
        with self.allowing():
            self.assertEqual((federation.REMOTE, PEER),
                             federation.resolve_server(PEER + "/"))

    def test_a_server_that_is_not_in_the_registry_is_refused(self):
        with self.allowing():
            self.assertEqual((federation.REFUSED, None),
                             federation.resolve_server(
                                 "https://evil.example.net"))

    def test_a_subdomain_or_suffix_of_an_allowed_host_is_refused(self):
        # Exact origin match only: no prefix, suffix or subdomain rule that a
        # lookalike could satisfy.
        with self.allowing():
            for raw in ("https://peer.example.org.evil.net",
                        "https://evil.peer.example.org",
                        "https://peer.example.org:8443",
                        "http://peer.example.org"):
                self.assertEqual((federation.REFUSED, None),
                                 federation.resolve_server(raw), raw)

    def test_plaintext_to_a_peer_is_refused_even_if_the_registry_allows_it(self):
        with self.allowing([{"qresp_server_url": "http://plain.example.org"}]):
            self.assertEqual((federation.REFUSED, None),
                             federation.resolve_server(
                                 "http://plain.example.org"))

    def test_private_and_metadata_addresses_are_refused_before_the_allowlist(self):
        # Even a compromised or mistaken registry cannot make this server
        # fetch a link-local, private or reserved address.
        targets = ["https://169.254.169.254", "https://10.0.0.5",
                   "https://192.168.1.1", "https://172.16.0.9",
                   "https://[fd00::1]", "https://0.0.0.0"]
        with self.allowing([{"qresp_server_url": t} for t in targets]):
            for raw in targets:
                self.assertEqual((federation.REFUSED, None),
                                 federation.resolve_server(raw), raw)

    def test_an_allowlisted_name_that_resolves_privately_is_refused(self):
        # The allowlist controls NAMES; DNS controls where a name points. An
        # allowlisted host answering 127.0.0.1 or the cloud metadata address
        # is the standard way an allowlist becomes a request against the
        # machine itself.
        for address in ("127.0.0.1", "169.254.169.254", "10.1.2.3",
                        "192.168.5.5", "172.20.0.1", "::1", "fd00::1"):
            federation._dns_cache.clear()
            self.dns_answers = {"peer.example.org": {address}}
            with self.allowing():
                self.assertEqual((federation.REFUSED, None),
                                 federation.resolve_server(PEER), address)

    def test_one_private_address_among_several_is_enough_to_refuse(self):
        federation._dns_cache.clear()
        self.dns_answers = {"peer.example.org": {"93.184.216.34", "127.0.0.1"}}
        with self.allowing():
            self.assertEqual((federation.REFUSED, None),
                             federation.resolve_server(PEER))

    def test_a_name_that_does_not_resolve_is_refused(self):
        federation._dns_cache.clear()
        self.dns_answers = {"peer.example.org": None}
        with self.allowing():
            self.assertEqual((federation.REFUSED, None),
                             federation.resolve_server(PEER))

    def test_dns_is_not_resolved_once_per_request(self):
        resolver = mock.Mock(return_value={"93.184.216.34"})
        with mock.patch.object(federation, "_resolve_addresses", resolver):
            with self.allowing():
                for _ in range(5):
                    federation.resolve_server(PEER)
        self.assertEqual(1, resolver.call_count)

    def test_a_refusal_is_never_silently_downgraded_to_local(self):
        # REFUSED must be its own answer: falling back to the local database
        # would answer about a different record that happens to share an id.
        with self.allowing():
            kind, origin = federation.resolve_server("https://evil.example.net")
        self.assertEqual(federation.REFUSED, kind)
        self.assertIsNone(origin)


# --------------------------------------------------------------- cache keys

class TestCacheKey(FederationTestCase):
    def test_a_local_key_is_the_bare_id(self):
        # Backward compatibility: every entry written before federation
        # existed is still a hit.
        self.assertEqual("5983afce759061384c1aae48",
                         federation.cache_key(None, "5983afce759061384c1aae48"))
        self.assertEqual("abc", federation.cache_key("", "abc"))

    def test_the_same_id_on_two_servers_is_two_keys(self):
        keys = {federation.cache_key(None, "abc"),
                federation.cache_key(PEER, "abc"),
                federation.cache_key(OTHER_PEER, "abc")}
        self.assertEqual(3, len(keys))

    def test_a_remote_key_names_its_origin(self):
        self.assertEqual("%s|abc" % PEER, federation.cache_key(PEER, "abc"))


# --------------------------------------------------------------- transport

class TestTransport(FederationTestCase):
    def fetch(self, response=None, error=None, origin=PEER, paper_id="abc123"):
        stub = RequestsStub(response=response, error=error)
        with mock.patch.object(federation, "requests", stub):
            record, outcome = federation.fetch_record(origin, paper_id)
        return record, outcome, stub

    def test_a_record_is_read_from_the_peers_public_paper_endpoint(self):
        record, outcome, stub = self.fetch(FakeResponse(
            {"id": "abc123", "title": "A federated paper",
             "abstract": "About things.", "doi": "10.1000/fed",
             "year": 2021, "authors": "Ada Lovelace, Alan Turing",
             "tags": ["things"], "collections": ["MICCOM"]}))
        self.assertEqual(federation.FOUND, outcome)
        self.assertEqual("A federated paper", record["reference"]["title"])
        self.assertEqual("%s/api/paper/abc123" % PEER, stub.calls[0]["url"])

    def test_the_request_is_bounded_and_does_not_follow_redirects(self):
        _, _, stub = self.fetch(FakeResponse({"title": "x", "id": "abc123"}))
        call = stub.calls[0]
        self.assertEqual(federation.REQUEST_TIMEOUT_SECONDS, call["timeout"])
        self.assertFalse(call["allow_redirects"])
        self.assertTrue(call["stream"])

    def test_a_redirect_is_a_non_answer(self):
        for status in (301, 302, 303, 307, 308):
            _, outcome, _ = self.fetch(FakeResponse({}, status_code=status))
            self.assertEqual(federation.UNAVAILABLE, outcome, status)

    def test_a_peer_404_or_400_means_no_such_record(self):
        for status in (400, 404):
            _, outcome, _ = self.fetch(FakeResponse({}, status_code=status))
            self.assertEqual(federation.NOT_FOUND, outcome, status)

    def test_a_timeout_or_connection_error_is_a_non_answer(self):
        for error in (IOError("timed out"), ValueError("boom")):
            record, outcome, _ = self.fetch(error=error)
            self.assertIsNone(record)
            self.assertEqual(federation.UNAVAILABLE, outcome)

    def test_invalid_json_is_a_non_answer(self):
        _, outcome, _ = self.fetch(FakeResponse(body=b"<html>nope</html>"))
        self.assertEqual(federation.UNAVAILABLE, outcome)

    def test_a_5xx_is_a_non_answer(self):
        for status in (429, 500, 502, 503):
            _, outcome, _ = self.fetch(FakeResponse({}, status_code=status))
            self.assertEqual(federation.UNAVAILABLE, outcome, status)

    def test_an_oversized_body_is_refused_rather_than_buffered(self):
        chunk = b"x" * (1024 * 1024)
        chunks = [chunk] * (federation.MAX_RESPONSE_BYTES // len(chunk) + 2)
        _, outcome, _ = self.fetch(FakeResponse(chunks=chunks))
        self.assertEqual(federation.UNAVAILABLE, outcome)

    def test_a_record_shaped_like_something_else_is_a_non_answer(self):
        # A 200 that is not a Qresp record must not be read as an empty one.
        for payload in ({"unexpected": "shape"}, [], 7, {"title": ""}):
            _, outcome, _ = self.fetch(FakeResponse(payload))
            self.assertEqual(federation.UNAVAILABLE, outcome, payload)

    def test_a_bare_error_string_is_read_as_no_such_record(self):
        # `/api/paper` answers with a plain string on its own error path.
        _, outcome, _ = self.fetch(FakeResponse("Exception in paper api"))
        self.assertEqual(federation.NOT_FOUND, outcome)

    def test_an_id_that_is_not_an_id_never_reaches_the_wire(self):
        for paper_id in ("../../etc/passwd", "a/b", "abc?x=1", "", "a" * 100):
            record, outcome, stub = self.fetch(FakeResponse({}),
                                               paper_id=paper_id)
            self.assertEqual(federation.NOT_FOUND, outcome, paper_id)
            self.assertEqual([], stub.calls, paper_id)

    def test_a_corpus_is_read_from_the_peers_public_search_endpoint(self):
        stub = RequestsStub(FakeResponse([
            {"_Search__id": "r1", "_Search__title": "First",
             "_Search__abstract": "One.", "_Search__tags": ["a"],
             "_Search__authors": "Ada Lovelace", "_Search__doi": "10.1/1",
             "_Search__year": 2020, "_Search__collections": ["MICCOM"]},
            {"_Search__id": "", "_Search__title": "No id"},
            "not a record",
        ]))
        with mock.patch.object(federation, "requests", stub):
            records, outcome = federation.fetch_corpus(PEER)
        self.assertEqual(federation.FOUND, outcome)
        self.assertEqual("%s/api/search" % PEER, stub.calls[0]["url"])
        self.assertEqual(1, len(records))
        self.assertEqual("r1", records[0]["_id"])

    def test_a_corpus_that_is_not_a_list_is_a_non_answer(self):
        stub = RequestsStub(FakeResponse({"papers": []}))
        with mock.patch.object(federation, "requests", stub):
            records, outcome = federation.fetch_corpus(PEER)
        self.assertIsNone(records)
        self.assertEqual(federation.UNAVAILABLE, outcome)


# ------------------------------------------------------- what is copied out

class TestOnlyPublishedMetadataIsCopied(FederationTestCase):
    """A peer's `/api/paper` answer carries the curator's identity and the
    record's file-server paths. None of it may cross this boundary."""

    PAYLOAD = {
        "id": "abc123",
        "title": "A federated paper",
        "abstract": "About things.",
        "doi": "10.1000/fed",
        "year": "2021",
        "authors": "Ada Lovelace, Alan Turing",
        "tags": ["things", "other things"],
        "collections": ["MICCOM"],
        "charts": [{"caption": "A figure", "properties": ["density"],
                    "imageFile": "fig1.png",
                    "files": ["/data/secret/fig1.png"]}],
        "datasets": [{"readme": "A dataset", "keywords": ["md"],
                      "files": ["/data/secret/run.h5"]}],
        "scripts": [{"readme": "A script", "keywords": ["python"]}],
        "tools": [{"packageName": "Qbox", "facilityName": "RCC",
                   "measurement": "DFT", "description": "unused here"}],
        # Everything below must not survive.
        "firstName": "Curator", "lastName": "Person",
        "emailId": "curator@example.edu", "affiliation": "Somewhere",
        "serverPath": "https://rcc.example.edu/files/secret",
        "fileServerPath": "https://files.example.edu/secret",
        "folderAbsolutePath": "/home/curator/secret",
        "downloadPath": "https://files.example.edu/secret.zip",
        "notebookPath": "https://notebook.example.edu/secret",
        "notebookFile": "secret.ipynb",
        "timeStamp": "2021-01-01 00:00:00", "license": "cc-by",
        "PIs": "Principal Person", "heads": [], "workflows": {},
    }

    SECRETS = ("curator@example.edu", "Somewhere", "rcc.example.edu",
               "files.example.edu", "/home/curator/secret", "secret.ipynb",
               "notebook.example.edu", "/data/secret/fig1.png",
               "/data/secret/run.h5")

    def record(self):
        return federation.record_from_details(self.PAYLOAD, "abc123")

    def test_the_published_metadata_is_kept(self):
        record = self.record()
        self.assertEqual("abc123", record["_id"])
        self.assertEqual("A federated paper", record["reference"]["title"])
        self.assertEqual("About things.",
                         record["reference"]["publishedAbstract"])
        self.assertEqual("10.1000/fed", record["reference"]["DOI"])
        self.assertEqual(2021, record["reference"]["year"])
        self.assertEqual(["things", "other things"], record["tags"])
        self.assertEqual(["MICCOM"], record["collections"])
        self.assertEqual("A figure", record["charts"][0]["caption"])
        self.assertEqual(["density"], record["charts"][0]["properties"])
        self.assertEqual(["md"], record["datasets"][0]["keywords"])
        self.assertEqual("Qbox", record["tools"][0]["packageName"])
        self.assertEqual("RCC", record["tools"][0]["facilityName"])

    def test_no_curator_identity_no_rcc_url_and_no_file_path_survives(self):
        serialized = json.dumps(self.record())
        for secret in self.SECRETS:
            self.assertNotIn(secret, serialized, secret)

    def test_artifacts_keep_only_the_fields_the_score_reads(self):
        record = self.record()
        self.assertEqual({"caption", "properties"},
                         set(record["charts"][0]))
        self.assertEqual({"readme", "keywords"}, set(record["datasets"][0]))
        self.assertEqual({"packageName", "facilityName", "measurement"},
                         set(record["tools"][0]))

    def test_authors_arrive_in_the_shape_a_stored_record_uses(self):
        # A peer joins authors into one string; scoring and the cache
        # fingerprint both read the {firstName, middleName, lastName} shape.
        record = self.record()
        self.assertEqual(
            [{"firstName": "", "middleName": "", "lastName": "Ada Lovelace"},
             {"firstName": "", "middleName": "", "lastName": "Alan Turing"}],
            record["reference"]["authors"])

    def test_a_field_a_peer_invents_is_dropped(self):
        record = federation.record_from_details(
            dict(self.PAYLOAD, surprise="new field",
                 charts=[{"caption": "c", "surprise": "x"}]), "abc123")
        self.assertNotIn("surprise", record)
        self.assertNotIn("surprise", record["charts"][0])

    def test_a_record_with_no_title_is_not_a_record(self):
        self.assertIsNone(federation.record_from_details({"id": "x"}, "x"))
        self.assertIsNone(federation.record_from_details("nope", "x"))

    def test_a_search_entry_is_reduced_the_same_way(self):
        record = federation.record_from_search_entry({
            "_Search__id": "r1", "_Search__title": "First",
            "_Search__abstract": "One.", "_Search__tags": ["a"],
            "_Search__authors": "Ada Lovelace",
            "_Search__doi": "10.1/1", "_Search__year": 2020,
            "_Search__collections": ["MICCOM"],
            "_Search__serverPath": "https://rcc.example.edu/files/secret",
            "_Search__fileServerPath": "https://files.example.edu/secret",
            "_Search__folderAbsolutePath": "/home/curator/secret",
        })
        serialized = json.dumps(record)
        for secret in ("rcc.example.edu", "files.example.edu",
                       "/home/curator/secret"):
            self.assertNotIn(secret, serialized, secret)
        self.assertEqual("First", record["reference"]["title"])
        self.assertEqual(["a"], record["tags"])


class TestDefaultExplorerServer(FederationTestCase):
    """Which server the Explorer searches when the curator has not chosen.

    The Explorer used to open on a node picker, so "which server" was always
    an answer the user had typed. Now the page goes straight to results, which
    means the SERVER has to name a default -- and it has to be a default the
    same server will actually let anyone contact. A default outside the
    allowlist would send every visitor into a 400 on their first click.
    """

    ENV = federation.DEFAULT_SERVER_ENV

    def setUp(self):
        super(TestDefaultExplorerServer, self).setUp()
        self._previous = os.environ.pop(self.ENV, None)
        self.addCleanup(self._restore)

    def _restore(self):
        os.environ.pop(self.ENV, None)
        if self._previous is not None:
            os.environ[self.ENV] = self._previous

    def test_the_default_is_published_alongside_the_list(self):
        with self.allowing():
            body, status = federation.federation_servers()
        self.assertEqual(200, status)
        # Additive: the existing key is untouched, so an older Explorer that
        # only reads `servers` keeps working.
        self.assertIn("servers", body)
        self.assertIn("default_server", body)
        self.assertIn(body["default_server"],
                      [entry["qresp_server_url"] for entry in body["servers"]])

    def test_without_the_env_it_is_the_first_listed_server(self):
        # Deterministic, and the SAME order the list is published in, so the
        # default is always visibly the first row rather than an unrelated
        # pick.
        with self.allowing():
            body, _status = federation.federation_servers()
        self.assertEqual(body["servers"][0]["qresp_server_url"],
                         body["default_server"])

    def test_the_env_chooses_the_default(self):
        os.environ[self.ENV] = OTHER_PEER
        with self.allowing():
            body, _status = federation.federation_servers()
        self.assertEqual(OTHER_PEER, body["default_server"])

    def test_the_env_is_normalized_like_any_other_origin(self):
        # A trailing slash, a mixed-case host and a default port are the same
        # origin; the published default has to be the canonical spelling or
        # the Explorer will send a string the allowlist does not match.
        os.environ[self.ENV] = "HTTPS://Second.Example.ORG:443/"
        with self.allowing():
            body, _status = federation.federation_servers()
        self.assertEqual(OTHER_PEER, body["default_server"])

    def test_a_default_outside_the_allowlist_is_refused(self):
        # The whole point. Naming an unfederated server here must not make it
        # reachable, and must not strand the Explorer either.
        os.environ[self.ENV] = "https://not-federated.example.com"
        with self.allowing():
            body, _status = federation.federation_servers()
        self.assertEqual(body["servers"][0]["qresp_server_url"],
                         body["default_server"])
        self.assertNotIn("not-federated", json.dumps(body))

    def test_a_plaintext_default_is_refused(self):
        os.environ[self.ENV] = "http://peer.example.org"
        with self.allowing():
            body, _status = federation.federation_servers()
        self.assertNotEqual("http://peer.example.org", body["default_server"])

    def test_a_malformed_default_is_refused(self):
        for value in ("not a url", "javascript:alert(1)", "://x", "   "):
            os.environ[self.ENV] = value
            with self.allowing():
                body, _status = federation.federation_servers()
            self.assertEqual(body["servers"][0]["qresp_server_url"],
                             body["default_server"], value)

    def test_no_federated_servers_means_no_default(self):
        # Federation switched off is an answer, not a failure. The Explorer
        # has to be able to tell "nothing configured" from "server down", and
        # an empty string is not a server it should try to search.
        with mock.patch.object(federation, "_registry_servers",
                               return_value=[]), \
                mock.patch.object(federation, "_shipped_servers",
                                  return_value=[]):
            body, status = federation.federation_servers()
        self.assertEqual(200, status)
        self.assertEqual([], body["servers"])
        self.assertEqual("", body["default_server"])

    def test_the_default_never_widens_the_allowlist(self):
        os.environ[self.ENV] = "https://not-federated.example.com"
        with self.allowing():
            federation.federation_servers()
            self.assertNotIn("https://not-federated.example.com",
                             federation.allowed_origins())

    def test_the_helper_agrees_with_the_endpoint(self):
        os.environ[self.ENV] = OTHER_PEER
        with self.allowing():
            self.assertEqual(OTHER_PEER, federation.default_server())


if __name__ == "__main__":
    unittest.main()
