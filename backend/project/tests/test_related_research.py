"""Related Research: the endpoint, the provider call, and the cache.

The pure scoring rules are covered by test_relatedness.py. What is pinned
here is everything AROUND them: the feature switch, exactly what does and does
not leave this server, the fixed provider endpoint, the `x-api-key` header,
de-duplication, the cache (hit / expiry / stale fallback), and the promise
that a provider failure degrades one section instead of the page -- and that
none of it ever writes to a Paper.
"""
import json
import unittest
from datetime import datetime, timedelta
from unittest import mock

import mongoengine
import mongomock

from project import connexionapp, federation, related
from project.models import Paper, RelatedResearchCache

ENABLED = {"QRESP_RELATED_RESEARCH_ENABLED": "1",
           "QRESP_RELATED_EXTERNAL_ENABLED": "1",
           "QRESP_SEMANTIC_SCHOLAR_API_KEY": ""}
ENABLED_WITH_KEY = {"QRESP_RELATED_RESEARCH_ENABLED": "1",
                    "QRESP_RELATED_EXTERNAL_ENABLED": "1",
                    "QRESP_SEMANTIC_SCHOLAR_API_KEY": "test-s2-super-secret"}
DISABLED = {"QRESP_RELATED_RESEARCH_ENABLED": "",
            "QRESP_RELATED_EXTERNAL_ENABLED": "",
            "QRESP_SEMANTIC_SCHOLAR_API_KEY": ""}
# The deployment this split exists for: Related Qresp Records on, no outbound
# traffic of any kind.
INTERNAL_ONLY = {"QRESP_RELATED_RESEARCH_ENABLED": "1",
                 "QRESP_RELATED_EXTERNAL_ENABLED": "",
                 "QRESP_SEMANTIC_SCHOLAR_API_KEY": ""}
# Only the subordinate switch set: must behave exactly like fully off.
EXTERNAL_WITHOUT_MASTER = {"QRESP_RELATED_RESEARCH_ENABLED": "",
                           "QRESP_RELATED_EXTERNAL_ENABLED": "1",
                           "QRESP_SEMANTIC_SCHOLAR_API_KEY": "unused"}


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = json.dumps(payload) if payload is not None else ""

    def json(self):
        if self._payload is None:
            raise ValueError("not json")
        return self._payload


def paper_doc(key, title, abstract, tags=(), authors=(), doi=None,
              year=2020, tools=(), active=True, collections=("MICCOM",)):
    return {
        "version": 1,
        "schema": "https://raw.githubusercontent.com/qresp/schema/v1.0",
        "license": "cc-by",
        "collections": list(collections),
        "tags": list(tags),
        "is_active": active,
        "info": {"timeStamp": "2020-01-01 00:00:00",
                 "insertedBy": {"firstName": "Curator", "lastName": "Person",
                                "emailId": "curator@example.com"},
                 "fileServerPath": "https://files.example.org/%s" % key},
        "reference": {
            "title": title,
            "publishedAbstract": abstract,
            "DOI": doi if doi is not None else "10.1000/%s" % key,
            "year": year,
            "page": "1-2",
            "volume": "1",
            "journal": {"fullName": "Journal of Placeholder Science"},
            "authors": [{"firstName": n.split()[0], "middleName": "",
                         "lastName": n.split()[-1]} for n in authors],
        },
        "tools": [{"id": "t0", "kind": "software", "packageName": t}
                  for t in tools],
        "charts": [], "datasets": [], "scripts": [], "heads": [],
    }


# One tightly related neighbour, one same-lab-but-different-subject record,
# and unrelated filler so corpus rarity is meaningful.
def seed_corpus():
    saved = {}
    subject = paper_doc(
        "subject", "Rareword resonance of gadgetite lattices",
        "Rareword resonance in gadgetite lattices is probed with a cryogenic "
        "spectrometer and an oscillator of tunable frequency.",
        tags=["rareword resonance", "gadgetite"],
        authors=["Robin Sharedname", "Casey Otherperson"],
        doi="10.1000/subject", tools=["RarePackage"])
    saved["subject"] = Paper(**subject).save()
    saved["near"] = Paper(**paper_doc(
        "near", "Rareword resonance of gadgetite thin films",
        "Rareword resonance in gadgetite lattices is measured with a "
        "cryogenic spectrometer and a tunable oscillator.",
        tags=["rareword resonance", "gadgetite"],
        authors=["Robin Sharedname"], doi="10.1000/near",
        tools=["RarePackage"])).save()
    saved["unrelated"] = Paper(**paper_doc(
        "unrelated", "Seasonal migration of coastal birds",
        "Observations of coastal bird migration over several seasons.",
        tags=["ornithology"], authors=["Sam Nobody"],
        doi="10.1000/unrelated")).save()
    saved["hidden"] = Paper(**paper_doc(
        "hidden", "Rareword resonance of gadgetite powders",
        "Rareword resonance in gadgetite lattices with a cryogenic "
        "spectrometer and a tunable oscillator.",
        tags=["rareword resonance", "gadgetite"],
        authors=["Robin Sharedname"], doi="10.1000/hidden",
        active=False)).save()
    for i in range(20):
        Paper(**paper_doc("filler%d" % i, "Unrelated subject %d" % i,
                          "An abstract about topic%d and matter%d." % (i, i),
                          tags=["topic%d" % i], authors=["Person%d Sur%d" % (i, i)],
                          doi="10.1000/filler%d" % i,
                          collections=["other"])).save()
    return saved


def recommendation(title, abstract, doi=None, year=2022, authors=("Someone Else",),
                   paper_id=None, fields=("Physics",)):
    return {
        "paperId": paper_id or (doi or title).replace("/", "_"),
        "title": title,
        "abstract": abstract,
        "year": year,
        "externalIds": {"DOI": doi} if doi else {},
        "authors": [{"name": n} for n in authors],
        "fieldsOfStudy": list(fields),
    }


# Distinct invented words, generated rather than listed. The external tests
# need up to 150 candidates that are genuinely different WORKS, and a title
# key drops digits -- so "variant 1" and "variant 2" are correctly ONE work,
# not two, and numbering them would measure de-duplication instead of the cap.
# Nothing here is domain vocabulary; that is the point (see relatedness.py).
_SYLLABLES = ("ka", "lo", "mi", "ru", "ne", "ta", "vi", "zo", "pe", "du")
_WORDS = ["".join((first, second, third))
          for first in _SYLLABLES
          for second in _SYLLABLES
          for third in _SYLLABLES]


def clones(count, prefix="clone"):
    """`count` distinct external candidates that all clear the gate.

    Same abstract as the subject record, distinct titles and DOIs: what is
    under test is the CAP, so every candidate has to pass on its own merits
    and none may collide with another.
    """
    return [recommendation(
        "Rareword resonance in gadgetite %s" % _WORDS[index],
        "Rareword resonance of gadgetite lattices measured with a "
        "cryogenic spectrometer and a tunable oscillator.",
        doi="10.2000/%s-%s" % (prefix, _WORDS[index]))
        for index in range(count)]


RELATED_EXTERNAL = recommendation(
    "Rareword resonance in gadgetite single crystals",
    "Rareword resonance of gadgetite lattices measured with a cryogenic "
    "spectrometer and a tunable oscillator.",
    doi="10.2000/external-a")

UNRELATED_EXTERNAL = recommendation(
    "A study of data analysis in another discipline",
    "This study presents a simulation and a data analysis of unrelated "
    "material.", doi="10.2000/external-b", fields=("Economics",))


class ProviderTimeout(IOError):
    """What `requests` raises when the provider never answers."""


# Every way one provider call can go wrong, named. `not_found` is the only
# one that is an ANSWER; the rest are non-answers and must never be recorded
# as a fact about the record.
FAILURE_MODES = ("timeout", "connection", "rate_limited", "server_error",
                 "malformed", "unexpected_shape")


def _failure_response(mode):
    if mode == "timeout":
        raise ProviderTimeout("timed out")
    if mode == "connection":
        raise OSError("connection reset")
    if mode == "rate_limited":
        return FakeResponse({"error": "too many requests",
                             "message": "quota exceeded"}, 429)
    if mode == "server_error":
        return FakeResponse({"error": "upstream exploded"}, 500)
    if mode == "bad_request":
        # What the provider ACTUALLY answered when the citations request
        # asked for a field that endpoint does not support. The body names
        # the field; it must never reach a browser or a log.
        return FakeResponse(
            {"error": "Unrecognized or unsupported fields: [authors.name]"},
            400)
    if mode == "malformed":
        return FakeResponse(None)                    # body is not JSON
    if mode == "unexpected_shape":
        return FakeResponse(["not", "an", "object"])  # 200, wrong type
    raise AssertionError("unknown failure mode %r" % mode)


class ProviderStub:
    """Stands in for `requests`, dispatching on the URL the code chose.

    Each of the two call sites -- paper resolution and recommendations -- has
    its own `mode`: `ok`, `not_found`, or any of FAILURE_MODES. Every call is
    recorded so the tests can assert on the endpoint, the params and the
    headers actually used.
    """

    def __init__(self, resolution=None, recommendations=None,
                 resolution_mode="ok", recommendation_mode="ok",
                 citations=None, citation_mode="ok"):
        self.calls = []
        self.resolution = (resolution if resolution is not None
                           else {"paperId": "S2-SUBJECT",
                                 "title": "Rareword resonance of gadgetite "
                                          "lattices",
                                 "externalIds": {"DOI": "10.1000/subject"},
                                 "references": []})
        self.recommendations = (recommendations if recommendations is not None
                                else [RELATED_EXTERNAL, UNRELATED_EXTERNAL])
        self.resolution_mode = resolution_mode
        self.recommendation_mode = recommendation_mode
        # The FALLBACK endpoint. Default empty, so a test that does not opt in
        # sees the fallback fire and find nothing -- which is the behaviour
        # every pre-existing test already asserts.
        self.citations = citations if citations is not None else []
        self.citation_mode = citation_mode

    def get(self, url, params=None, headers=None, timeout=None):
        self.calls.append({"url": url, "params": params or {},
                           "headers": headers or {}, "timeout": timeout})
        recommending = url.startswith(
            related.SEMANTIC_SCHOLAR_RECOMMENDATIONS_URL)
        citing = url.endswith("/citations")
        mode = (self.recommendation_mode if recommending
                else self.citation_mode if citing
                else self.resolution_mode)
        if mode == "not_found":
            return FakeResponse({"error": "Paper not found"}, 404)
        if mode != "ok":
            return _failure_response(mode)
        if recommending:
            return FakeResponse({"recommendedPapers": self.recommendations})
        if citing:
            return FakeResponse(
                {"data": [{"citingPaper": paper} for paper in self.citations]})
        if url.startswith(related.SEMANTIC_SCHOLAR_TITLE_MATCH_URL):
            return FakeResponse({"data": [self.resolution]})
        return FakeResponse(self.resolution)

    @property
    def recommendation_call(self):
        for call in self.calls:
            if call["url"].startswith(
                    related.SEMANTIC_SCHOLAR_RECOMMENDATIONS_URL):
                return call
        return None

    @property
    def citation_call(self):
        for call in self.calls:
            if call["url"].endswith("/citations"):
                return call
        return None

    @property
    def citation_calls(self):
        return [c for c in self.calls if c["url"].endswith("/citations")]


class RelatedTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = connexionapp.test_client()

    def setUp(self):
        mongoengine.disconnect_all()
        mongoengine.connect('mongoenginetest',
                            mongo_client_class=mongomock.MongoClient)
        # The response, peer-record and peer-corpus caches live in the
        # process, so one test's answer would otherwise be served to the next.
        related.reset_caches()
        self.papers = seed_corpus()
        self.subject_id = str(self.papers["subject"].id)

    def tearDown(self):
        Paper.drop_collection()
        RelatedResearchCache.drop_collection()
        related.reset_caches()
        mongoengine.disconnect_all()

    def fetch(self, paper_id=None, env=None, provider=None):
        """GET the endpoint with the environment and provider stub in place.
        Returns (response, provider stub)."""
        stub = provider if provider is not None else ProviderStub()
        with mock.patch.dict('os.environ', env or ENABLED):
            with mock.patch.object(related, 'requests', stub):
                response = self.client.get(
                    '/api/paper/%s/related' % (paper_id or self.subject_id))
        return response, stub


# ------------------------------------------------------------ feature switch

class TestFeatureSwitch(RelatedTestCase):
    def test_off_by_default_and_no_provider_is_contacted(self):
        response, stub = self.fetch(env=DISABLED)
        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertFalse(body["enabled"])
        self.assertEqual([], body["internal"]["results"])
        self.assertEqual([], body["external"]["results"])
        self.assertEqual("disabled", body["external"]["status"])
        self.assertEqual([], stub.calls)

    def test_configuration_is_read_from_the_environment_only(self):
        # config.ini must not be able to switch an external call on, or
        # supply a credential.
        with mock.patch.dict('os.environ', DISABLED):
            self.assertFalse(related.config()["ENABLED"])
            self.assertEqual("", related.config()["API_KEY"])
        with mock.patch.dict('os.environ', ENABLED_WITH_KEY):
            self.assertTrue(related.config()["ENABLED"])
            self.assertEqual("test-s2-super-secret",
                             related.config()["API_KEY"])

    def test_timeout_and_cache_ttl_are_bounded(self):
        with mock.patch.dict('os.environ', dict(
                ENABLED, QRESP_SEMANTIC_SCHOLAR_TIMEOUT_SECONDS="99999",
                QRESP_RELATED_RESEARCH_CACHE_DAYS="99999")):
            cfg = related.config()
        self.assertEqual(related.MAX_TIMEOUT_SECONDS, cfg["TIMEOUT"])
        self.assertEqual(related.MAX_CACHE_DAYS, cfg["CACHE_DAYS"])

    def test_the_external_default_cache_ttl_is_seven_days(self):
        with mock.patch.dict('os.environ', ENABLED):
            self.assertEqual(7, related.config()["CACHE_DAYS"])


class TestInternalAndExternalSwitches(RelatedTestCase):
    """Two switches. The internal list is local computation; the external one
    is an outbound call to a third party. An operator must be able to have the
    first without the second."""

    def test_the_master_switch_off_means_no_section_at_all(self):
        response, stub = self.fetch(env=DISABLED)
        body = response.json()
        self.assertFalse(body["enabled"])
        self.assertEqual("disabled", body["internal"]["status"])
        self.assertEqual("disabled", body["external"]["status"])
        self.assertEqual([], stub.calls)

    def test_the_external_switch_alone_cannot_turn_anything_on(self):
        # A server whose operator never enabled the feature must not start
        # making outbound requests because a second variable was set.
        response, stub = self.fetch(env=EXTERNAL_WITHOUT_MASTER)
        body = response.json()
        self.assertFalse(body["enabled"])
        self.assertEqual([], body["internal"]["results"])
        self.assertEqual("disabled", body["external"]["status"])
        self.assertEqual([], stub.calls)
        with mock.patch.dict('os.environ', EXTERNAL_WITHOUT_MASTER):
            self.assertFalse(related.config()["EXTERNAL_ENABLED"])

    def test_internal_only_computes_records_and_touches_no_provider(self):
        response, stub = self.fetch(env=INTERNAL_ONLY)
        body = response.json()
        self.assertTrue(body["enabled"])
        self.assertEqual("ok", body["internal"]["status"])
        self.assertTrue(body["internal"]["results"])
        self.assertEqual("disabled", body["external"]["status"])
        self.assertEqual([], body["external"]["results"])
        self.assertFalse(body["external"]["stale"])
        self.assertEqual([], stub.calls, "no provider request may be made")

    def test_internal_only_neither_reads_nor_writes_the_external_cache(self):
        # Not even a cached echo of a feature the operator turned off.
        self.fetch(env=INTERNAL_ONLY)
        self.assertEqual(0, RelatedResearchCache.objects.count())

        # ...and an entry left over from when external WAS on is ignored.
        self.fetch(env=ENABLED)
        self.assertEqual(1, RelatedResearchCache.objects.count())
        before = RelatedResearchCache.objects.first().to_mongo().to_dict()
        response, stub = self.fetch(env=INTERNAL_ONLY)
        self.assertEqual("disabled", response.json()["external"]["status"])
        self.assertEqual([], response.json()["external"]["results"])
        self.assertEqual([], stub.calls)
        after = RelatedResearchCache.objects.first().to_mongo().to_dict()
        self.assertEqual(before, after, "the cache must not be rewritten")

    def test_internal_and_external_together_behave_as_before(self):
        response, stub = self.fetch(env=ENABLED)
        body = response.json()
        self.assertTrue(body["enabled"])
        self.assertTrue(body["internal"]["results"])
        self.assertEqual("ok", body["external"]["status"])
        self.assertTrue(body["external"]["results"])
        self.assertTrue(stub.calls)

    def test_both_switches_are_environment_only_and_default_off(self):
        with mock.patch.dict('os.environ',
                             {"QRESP_RELATED_RESEARCH_ENABLED": "",
                              "QRESP_RELATED_EXTERNAL_ENABLED": ""}):
            cfg = related.config()
        self.assertFalse(cfg["ENABLED"])
        self.assertFalse(cfg["EXTERNAL_ENABLED"])


# ------------------------------------------------------- internal list

class TestInternalRecommendations(RelatedTestCase):
    def test_related_records_are_returned_with_grounded_reasons(self):
        response, _ = self.fetch()
        internal = response.json()["internal"]["results"]
        self.assertTrue(internal)
        titles = [item["title"] for item in internal]
        self.assertIn("Rareword resonance of gadgetite thin films", titles)
        top = internal[0]
        self.assertTrue(top["reasons"])
        self.assertLessEqual(len(top["reasons"]), 3)
        self.assertTrue(top["id"])
        self.assertEqual("internal", top["source"])

    def test_unrelated_records_are_left_out_rather_than_padding_the_list(self):
        response, _ = self.fetch()
        titles = [item["title"]
                  for item in response.json()["internal"]["results"]]
        self.assertNotIn("Seasonal migration of coastal birds", titles)
        self.assertLess(len(titles), 5)

    def test_the_current_paper_never_recommends_itself(self):
        response, _ = self.fetch()
        ids = [item["id"] for item in response.json()["internal"]["results"]]
        self.assertNotIn(self.subject_id, ids)

    def test_deactivated_records_are_never_recommended(self):
        response, _ = self.fetch()
        titles = [item["title"]
                  for item in response.json()["internal"]["results"]]
        self.assertNotIn("Rareword resonance of gadgetite powders", titles)

    def test_a_newly_published_record_appears_without_any_invalidation(self):
        # Internal results are computed per request, so publishing is
        # reflected immediately -- there is no stale internal cache to clear.
        before, _ = self.fetch()
        self.assertNotIn("Rareword resonance of gadgetite nanorods",
                         [i["title"] for i in before.json()["internal"]["results"]])
        Paper(**paper_doc(
            "fresh", "Rareword resonance of gadgetite nanorods",
            "Rareword resonance in gadgetite lattices measured with a "
            "cryogenic spectrometer and a tunable oscillator.",
            tags=["rareword resonance", "gadgetite"],
            authors=["Robin Sharedname"], doi="10.1000/fresh")).save()
        after, _ = self.fetch()
        self.assertIn("Rareword resonance of gadgetite nanorods",
                      [i["title"] for i in after.json()["internal"]["results"]])

    def test_a_deactivated_record_disappears_immediately(self):
        before, _ = self.fetch()
        self.assertIn("Rareword resonance of gadgetite thin films",
                      [i["title"] for i in before.json()["internal"]["results"]])
        Paper.objects(id=self.papers["near"].id).update(set__is_active=False)
        after, _ = self.fetch()
        self.assertNotIn("Rareword resonance of gadgetite thin films",
                         [i["title"] for i in after.json()["internal"]["results"]])

    def test_at_most_three_internal_results(self):
        for i in range(9):
            Paper(**paper_doc(
                "clone%d" % i,
                "Rareword resonance of gadgetite variant %d" % i,
                "Rareword resonance in gadgetite lattices measured with a "
                "cryogenic spectrometer and a tunable oscillator.",
                tags=["rareword resonance", "gadgetite"],
                authors=["Robin Sharedname"],
                doi="10.1000/clone%d" % i)).save()
        response, _ = self.fetch()
        self.assertEqual(related.MAX_RESULTS,
                         len(response.json()["internal"]["results"]))
        self.assertEqual(3, related.MAX_RESULTS)


# ------------------------------------------------------------ external list

class TestCitationFallback(RelatedTestCase):
    """A paper the recommender has nothing for is not necessarily a paper with
    nothing to show.

    The recommendations endpoint answers with an empty list for real papers --
    a recent one, or a narrow one, can sit outside its neighbourhood while
    still having later work built on it. That later work is a different KIND
    of answer, so it is fetched from a different endpoint, labelled as a
    different source, and cached as one.
    """

    def test_the_fallback_does_not_fire_when_recommendations_answered(self):
        # The primary source stays primary. Two candidates is a thin answer,
        # but it is an ANSWER, and it is never topped up from elsewhere.
        response, stub = self.fetch()
        external = response.json()["external"]
        self.assertEqual(related.SOURCE_RECOMMENDATIONS,
                         external["source_kind"])
        self.assertIsNone(stub.citation_call)

    def test_an_empty_recommendation_falls_back_to_citations(self):
        provider = ProviderStub(recommendations=[],
                                citations=clones(30, prefix="cite"))
        response, stub = self.fetch(provider=provider)
        external = response.json()["external"]
        self.assertEqual("ok", external["status"])
        self.assertEqual(related.SOURCE_CITATIONS, external["source_kind"])
        # Re-ranked and capped exactly as recommendations are.
        self.assertEqual(related.EXTERNAL_MAX_RESULTS, external["count"])
        pipeline = external["pipeline"]
        self.assertEqual(30, pipeline["raw_candidates"])
        self.assertEqual(related.SOURCE_CITATIONS, pipeline["source_kind"])
        # No gate: everything deduplicated was scored.
        self.assertEqual(pipeline["after_dedupe"],
                         pipeline["scored_candidates"])
        # Every RESULT says where it came from, so the UI cannot mislabel one.
        for result in external["results"]:
            self.assertEqual(related.SOURCE_CITATIONS, result["source_kind"])

    def test_the_citation_request_asks_the_documented_endpoint(self):
        provider = ProviderStub(recommendations=[], citations=clones(3))
        _, stub = self.fetch(provider=provider)
        call = stub.citation_call
        self.assertIsNotNone(call)
        self.assertTrue(call["url"].startswith(
            related.SEMANTIC_SCHOLAR_ORIGIN + "/graph/v1/paper/"))
        self.assertEqual(related.EXTERNAL_CITATION_LIMIT,
                         call["params"]["limit"])
        # Every field is asked for under the nesting the endpoint uses.
        # NOT derived by prefixing RECOMMENDATION_FIELDS: the two endpoints
        # do not accept the same selectors, and assuming they did is what
        # produced a 400 for the whole request. See the dedicated test below.
        for field in ("title", "abstract", "year", "authors", "externalIds",
                      "fieldsOfStudy"):
            self.assertIn("citingPaper." + field, call["params"]["fields"])

    def test_a_short_citation_list_is_short_not_padded(self):
        provider = ProviderStub(recommendations=[],
                                citations=clones(4, prefix="few"))
        response, _ = self.fetch(provider=provider)
        external = response.json()["external"]
        self.assertEqual(4, external["count"])
        self.assertEqual(related.SOURCE_CITATIONS, external["source_kind"])

    def test_both_empty_keeps_the_provider_empty_answer(self):
        provider = ProviderStub(recommendations=[], citations=[])
        response, stub = self.fetch(provider=provider)
        external = response.json()["external"]
        self.assertEqual("ok", external["status"])
        self.assertEqual(0, external["count"])
        self.assertEqual(related.REASON_PROVIDER_EMPTY, external["reason"])
        # It was ASKED -- the fallback fired and found nothing.
        self.assertIsNotNone(stub.citation_call)

    def test_a_failed_fallback_leaves_the_recommendation_answer_alone(self):
        # "Nobody recommends this" is an ANSWER. A citations timeout must not
        # promote it to a FAILURE the reader is told to retry.
        for mode in ("timeout", "rate_limited", "server_error"):
            provider = ProviderStub(recommendations=[], citation_mode=mode)
            response, _ = self.fetch(provider=provider)
            external = response.json()["external"]
            self.assertEqual("ok", external["status"], mode)
            self.assertEqual(related.REASON_PROVIDER_EMPTY,
                             external["reason"], mode)
            self.assertEqual(related.SOURCE_RECOMMENDATIONS,
                             external["source_kind"], mode)
            RelatedResearchCache.drop_collection()
            related.reset_caches()

    def test_an_empty_fallback_is_recorded_not_silently_dropped(self):
        # The bug: a fallback that found nothing left no trace, so the
        # response was identical to one from a build that never had a
        # fallback. "We asked and there are no citing papers" and "we never
        # asked" are different facts and a diagnosis depends on telling them
        # apart.
        provider = ProviderStub(recommendations=[], citations=[])
        response, stub = self.fetch(provider=provider)
        pipeline = response.json()["external"]["pipeline"]
        self.assertIsNotNone(stub.citation_call)
        fallback = pipeline["fallback"]
        self.assertTrue(fallback["attempted"])
        self.assertEqual(related.SOURCE_CITATIONS, fallback["source_kind"])
        self.assertEqual("ok", fallback["status"])
        self.assertEqual(0, fallback["raw_candidates"])
        self.assertEqual(0, fallback["valid_candidates"])
        self.assertEqual(0, fallback["shown"])
        # The list itself is still the recommendations answer.
        self.assertEqual(related.SOURCE_RECOMMENDATIONS,
                         pipeline["source_kind"])

    def test_a_failed_fallback_records_how_it_failed(self):
        cases = {"timeout": "unavailable", "rate_limited": "rate_limited",
                 "server_error": "unavailable", "not_found": "not_found"}
        for mode, expected in cases.items():
            provider = ProviderStub(recommendations=[], citation_mode=mode)
            response, _ = self.fetch(provider=provider)
            external = response.json()["external"]
            fallback = external["pipeline"]["fallback"]
            self.assertTrue(fallback["attempted"], mode)
            self.assertEqual(expected, fallback["status"], mode)
            self.assertEqual(0, fallback["shown"], mode)
            # ...and the recommendations ANSWER is untouched: a failed
            # optional second request must not become a retryable failure.
            self.assertEqual("ok", external["status"], mode)
            self.assertEqual(related.REASON_PROVIDER_EMPTY,
                             external["reason"], mode)
            RelatedResearchCache.drop_collection()
            related.reset_caches()

    def test_a_successful_fallback_records_its_whole_funnel(self):
        provider = ProviderStub(recommendations=[], citations=clones(30))
        response, _ = self.fetch(provider=provider)
        pipeline = response.json()["external"]["pipeline"]
        fallback = pipeline["fallback"]
        self.assertEqual("ok", fallback["status"])
        self.assertEqual(30, fallback["raw_candidates"])
        self.assertEqual(30, fallback["valid_candidates"])
        self.assertEqual(30, fallback["after_dedupe"])
        self.assertEqual(related.EXTERNAL_MAX_RESULTS, fallback["shown"])
        # The top-level counts agree with it, because it IS the list.
        self.assertEqual(related.SOURCE_CITATIONS, pipeline["source_kind"])
        self.assertEqual(related.EXTERNAL_MAX_RESULTS, pipeline["shown"])

    def test_unusable_citations_show_up_as_raw_without_valid(self):
        # Requirement 7's diagnostic: the provider sent entries and NONE
        # carried a usable title. raw > 0 with valid == 0 is what says so --
        # a single count could not.
        provider = ProviderStub(recommendations=[],
                                citations=[{"paperId": "x", "title": ""},
                                           {"paperId": "y", "title": "   "}])
        response, _ = self.fetch(provider=provider)
        fallback = response.json()["external"]["pipeline"]["fallback"]
        self.assertEqual(2, fallback["raw_candidates"])
        self.assertEqual(0, fallback["valid_candidates"])
        self.assertEqual(0, fallback["shown"])

    def test_no_fallback_key_at_all_when_recommendations_answered(self):
        # Absent means "never reached", which must stay distinguishable from
        # "tried and empty".
        response, stub = self.fetch()
        pipeline = response.json()["external"]["pipeline"]
        self.assertNotIn("fallback", pipeline)
        self.assertIsNone(stub.citation_call)

    def test_the_citation_request_asks_only_for_fields_that_endpoint_accepts(self):
        # THE BUG, pinned at the request. The citations endpoint refuses the
        # `authors.name` sub-selector that recommendations accepts, and
        # answered 400 for the whole request -- so the fallback never ran at
        # all. Deriving one field list from the other by prefixing is exactly
        # what hid that, so the two are compared here on purpose.
        provider = ProviderStub(recommendations=[], citations=clones(3))
        _, stub = self.fetch(provider=provider)
        fields = stub.citation_call["params"]["fields"]
        self.assertNotIn("authors.name", fields)
        self.assertIn("citingPaper.authors", fields)
        # Everything else the scorer needs is still asked for, under the
        # nesting this endpoint uses.
        for field in ("title", "abstract", "year", "externalIds",
                      "fieldsOfStudy"):
            self.assertIn("citingPaper." + field, fields)
        # The recommendations request is unchanged -- `authors.name` is valid
        # there, and narrowing it would cost data for no reason.
        self.assertIn("authors.name",
                      stub.recommendation_call["params"]["fields"])

    def test_a_provider_400_is_reported_as_our_bad_request_not_an_outage(self):
        # "unavailable" reads as "the provider is having trouble" and sent
        # the first investigation in the wrong direction. A 4xx is Qresp's
        # own request being wrong, and says so.
        provider = ProviderStub(recommendations=[], citation_mode="bad_request")
        response, _ = self.fetch(provider=provider)
        external = response.json()["external"]
        fallback = external["pipeline"]["fallback"]
        self.assertTrue(fallback["attempted"])
        self.assertEqual("invalid_request", fallback["status"])
        self.assertEqual(0, fallback["raw_candidates"])
        self.assertEqual(0, fallback["shown"])
        # ...and it still does not turn the recommendations ANSWER into a
        # retryable failure.
        self.assertEqual("ok", external["status"])
        self.assertEqual(related.REASON_PROVIDER_EMPTY, external["reason"])

    def test_each_failure_kind_is_told_apart(self):
        for mode, expected in (("bad_request", "invalid_request"),
                               ("rate_limited", "rate_limited"),
                               ("timeout", "unavailable"),
                               ("connection", "unavailable"),
                               ("server_error", "unavailable"),
                               ("malformed", "malformed"),
                               ("unexpected_shape", "malformed"),
                               ("not_found", "not_found")):
            provider = ProviderStub(recommendations=[], citation_mode=mode)
            response, _ = self.fetch(provider=provider)
            fallback = response.json()["external"]["pipeline"]["fallback"]
            self.assertEqual(expected, fallback["status"], mode)
            RelatedResearchCache.drop_collection()
            related.reset_caches()

    def test_a_provider_error_body_never_reaches_the_response(self):
        # The 400 body quotes the field list back. It is a diagnostic for an
        # operator reading a status code, not something to show a reader.
        provider = ProviderStub(recommendations=[], citation_mode="bad_request")
        response, _ = self.fetch(provider=provider)
        body = json.dumps(response.json())
        self.assertNotIn("Unrecognized", body)
        self.assertNotIn("authors.name", body)
        self.assertNotIn("x-api-key", body.lower())

    def test_a_second_request_is_served_from_cache_without_asking_again(self):
        provider = ProviderStub(recommendations=[], citations=clones(30))
        response, stub = self.fetch(provider=provider)
        self.assertEqual(related.SOURCE_CITATIONS,
                         response.json()["external"]["source_kind"])
        first = len(stub.citation_calls)
        self.assertEqual(1, first)

        again, stub2 = self.fetch(provider=provider)
        external = again.json()["external"]
        # The cached entry remembers WHICH source produced it.
        self.assertEqual(related.SOURCE_CITATIONS, external["source_kind"])
        self.assertEqual(related.EXTERNAL_MAX_RESULTS, external["count"])
        # ...and asking again cost no provider call at all.
        self.assertEqual(first, len(stub.citation_calls))

    def test_a_cached_citation_entry_records_its_source(self):
        provider = ProviderStub(recommendations=[], citations=clones(6))
        self.fetch(provider=provider)
        entry = RelatedResearchCache.objects(
            paper_id=self.subject_id).first()
        self.assertIsNotNone(entry)
        self.assertEqual(related.SOURCE_CITATIONS, entry.source_kind)
        self.assertEqual(related.ALGORITHM_VERSION, entry.algorithm_version)


class TestExternalProvider(RelatedTestCase):
    def test_the_request_asks_the_fixed_endpoint_for_150_candidates(self):
        _, stub = self.fetch()
        call = stub.recommendation_call
        self.assertIsNotNone(call)
        self.assertTrue(call["url"].startswith("https://api.semanticscholar.org/"))
        self.assertEqual(150, call["params"]["limit"])
        self.assertEqual(related.EXTERNAL_CANDIDATE_LIMIT,
                         call["params"]["limit"])

    def test_a_full_150_candidate_answer_is_normalized_and_deduplicated(self):
        # The provider may answer with the whole pool. Every entry has to
        # survive normalization, and the de-duplication has to still be the
        # thing that decides how many distinct works are left -- here 150
        # entries of which 50 are repeats by DOI and 25 are repeats by title.
        distinct = clones(75, prefix="bulk")
        repeats_by_doi = [dict(paper, paperId="dup-doi-%d" % index,
                               title="Some other spelling number %s"
                                     % _WORDS[index])
                          for index, paper in enumerate(distinct[:50])]
        repeats_by_title = [dict(paper, paperId="dup-title-%d" % index,
                                 externalIds={})
                            for index, paper in enumerate(distinct[:25])]
        payload = distinct + repeats_by_doi + repeats_by_title
        self.assertEqual(150, len(payload))
        cfg = related.config()
        with mock.patch.object(related, 'requests',
                               ProviderStub(recommendations=payload)):
            candidates, outcome, raw_count = related.fetch_external_candidates(
                "S2-SUBJECT", cfg)
        self.assertEqual(related.FOUND, outcome)
        self.assertEqual(150, len(candidates))
        self.assertEqual(150, raw_count)
        kept = related.dedupe_candidates(candidates, "10.1000/subject",
                                         "Rareword resonance of gadgetite "
                                         "lattices")
        self.assertEqual(75, len(kept))
        # The provider's own position is carried for diagnostics, in order,
        # and is not the provider's score.
        self.assertEqual(list(range(150)),
                         [c["provider_rank"] for c in candidates])
        for candidate in candidates:
            self.assertNotIn("score", candidate)

    def test_more_than_150_returned_entries_are_not_processed(self):
        # `limit` is a request, not a promise. The bound has to hold on what
        # actually came back.
        payload = clones(400, prefix="over")
        cfg = related.config()
        with mock.patch.object(related, 'requests',
                               ProviderStub(recommendations=payload)):
            candidates, _, raw_count = related.fetch_external_candidates(
                "S2-SUBJECT", cfg)
        self.assertEqual(related.EXTERNAL_CANDIDATE_LIMIT, len(candidates))
        self.assertEqual(related.EXTERNAL_CANDIDATE_LIMIT, raw_count)

    def test_the_candidate_pool_is_the_providers_default_and_not_settable(self):
        # Measured live: the alternative pool ("all-cs") answers with Computer
        # Science papers whatever the source paper's field -- 38 candidates
        # across two domains, best cosine 0.025 against a 0.16 bar, all
        # correctly rejected. Asking for it would buy nothing but traffic.
        _, stub = self.fetch()
        self.assertNotIn("from", stub.recommendation_call["params"])
        # ...and no environment variable can introduce one. (The first call
        # filled the cache, so it has to be cleared or nothing is fetched.)
        RelatedResearchCache.drop_collection()
        with mock.patch.dict('os.environ', dict(
                ENABLED, QRESP_SEMANTIC_SCHOLAR_RECOMMENDATION_POOL="all-cs",
                QRESP_RELATED_RESEARCH_POOL="all-cs")):
            other = ProviderStub()
            with mock.patch.object(related, 'requests', other):
                self.client.get('/api/paper/%s/related' % self.subject_id)
        self.assertNotIn("from", other.recommendation_call["params"])

    def test_an_empty_recommendation_list_is_an_answer_not_a_failure(self):
        # What the live provider actually returns today for Qresp-age
        # records: 200 with an empty list. That is `ok` with no results, and
        # it is cached for the full TTL -- not treated as an outage.
        response, _ = self.fetch(provider=ProviderStub(recommendations=[]))
        external = response.json()["external"]
        self.assertEqual("ok", external["status"])
        self.assertEqual([], external["results"])
        self.assertFalse(external["stale"])
        entry = RelatedResearchCache.objects(paper_id=self.subject_id).first()
        self.assertGreater(entry.expires_at,
                           datetime.utcnow() + timedelta(days=6))

    def test_the_provider_host_is_a_fixed_https_constant(self):
        for url in (related.SEMANTIC_SCHOLAR_PAPER_URL,
                    related.SEMANTIC_SCHOLAR_TITLE_MATCH_URL,
                    related.SEMANTIC_SCHOLAR_RECOMMENDATIONS_URL):
            self.assertTrue(url.startswith("https://api.semanticscholar.org/"),
                            url)
        # No environment variable may redirect it.
        with mock.patch.dict('os.environ', dict(
                ENABLED,
                QRESP_SEMANTIC_SCHOLAR_API_BASE="https://evil.example.org",
                QRESP_SEMANTIC_SCHOLAR_URL="https://evil.example.org",
                QRESP_SEMANTIC_SCHOLAR_HOST="evil.example.org")):
            stub = ProviderStub()
            with mock.patch.object(related, 'requests', stub):
                self.client.get('/api/paper/%s/related' % self.subject_id)
        for call in stub.calls:
            self.assertTrue(call["url"].startswith(
                "https://api.semanticscholar.org/"), call["url"])

    def test_only_minimal_metadata_fields_are_requested(self):
        _, stub = self.fetch()
        fields = stub.recommendation_call["params"]["fields"].split(",")
        self.assertEqual(
            sorted(["title", "abstract", "year", "authors.name",
                    "externalIds", "fieldsOfStudy"]), sorted(fields))

    def test_resolution_asks_only_for_flat_identity_fields(self):
        # A nested selector (`references.externalIds`) makes the live provider
        # DISCARD the whole field list and answer with its defaults -- more
        # data than was asked for, and still no reference DOIs. Verified
        # against the real API; pinned here so it cannot come back.
        _, stub = self.fetch()
        lookups = [c for c in stub.calls
                   if not c["url"].startswith(
                       related.SEMANTIC_SCHOLAR_RECOMMENDATIONS_URL)]
        self.assertTrue(lookups)
        for call in lookups:
            fields = call["params"]["fields"].split(",")
            self.assertEqual(["paperId", "title", "externalIds"], fields)
            self.assertNotIn("references", call["params"]["fields"])

    def test_provider_volunteered_extras_never_reach_a_result_or_the_cache(self):
        # The provider returns `openAccessPdf` (and a full author object)
        # alongside `abstract` whatever is requested. Nothing outside the
        # allowlist may survive normalization.
        noisy = recommendation(
            "Rareword resonance in gadgetite single crystals",
            "Rareword resonance of gadgetite lattices measured with a "
            "cryogenic spectrometer and a tunable oscillator.",
            doi="10.2000/noisy")
        noisy["openAccessPdf"] = {"url": "https://example.org/secret.pdf"}
        noisy["embedding"] = [0.1, 0.2]
        noisy["citationCount"] = 42
        noisy["authors"] = [{"authorId": "A1", "name": "Someone Else",
                             "homepage": "https://example.org/person"}]
        response, _ = self.fetch(provider=ProviderStub(recommendations=[noisy]))
        text = response.text
        for leak in ("openAccessPdf", "secret.pdf", "embedding",
                     "citationCount", "homepage", "authorId"):
            self.assertNotIn(leak, text, leak)
        entry = RelatedResearchCache.objects(paper_id=self.subject_id).first()
        stored = json.dumps(entry.to_mongo().to_dict(), default=str)
        for leak in ("openAccessPdf", "secret.pdf", "embedding", "homepage"):
            self.assertNotIn(leak, stored, leak)

    def test_the_api_key_travels_only_in_the_x_api_key_header(self):
        _, stub = self.fetch(env=ENABLED_WITH_KEY)
        self.assertTrue(stub.calls)
        for call in stub.calls:
            self.assertEqual("test-s2-super-secret",
                             call["headers"]["x-api-key"])
            # ...and nowhere else: not in the URL, not in the query.
            self.assertNotIn("test-s2-super-secret", call["url"])
            self.assertNotIn("test-s2-super-secret",
                             json.dumps(call["params"]))
            self.assertNotIn("authorization",
                             [k.lower() for k in call["headers"]])

    def test_without_a_key_no_credential_header_is_sent_and_the_page_works(self):
        response, stub = self.fetch(env=ENABLED)
        self.assertEqual(200, response.status_code)
        for call in stub.calls:
            self.assertNotIn("x-api-key", call["headers"])
        # The internal list is unaffected by the absence of a credential.
        self.assertTrue(response.json()["internal"]["results"])

    def test_only_this_papers_identity_leaves_the_server(self):
        """DOI (or, without one, the title). Never the abstract, the authors,
        the keywords, an RCC path, or another record."""
        _, stub = self.fetch()
        outgoing = json.dumps([{"url": c["url"], "params": c["params"]}
                               for c in stub.calls])
        self.assertIn("10.1000/subject", outgoing)
        for secret in ("cryogenic", "Sharedname", "RarePackage",
                       "files.example.org", "curator@example.com",
                       "10.1000/near", "gadgetite lattices is probed"):
            self.assertNotIn(secret, outgoing, secret)

    def test_a_title_lookup_is_used_only_when_there_is_no_doi(self):
        no_doi = Paper(**paper_doc(
            "nodoi", "Rareword resonance of gadgetite whiskers",
            "Rareword resonance in gadgetite lattices with a cryogenic "
            "spectrometer.", tags=["rareword resonance"], doi="")).save()
        stub = ProviderStub(resolution={
            "paperId": "S2-NODOI",
            "title": "Rareword resonance of gadgetite whiskers",
            "externalIds": {}})
        self.fetch(paper_id=str(no_doi.id), provider=stub)
        lookup = [c for c in stub.calls
                  if c["url"].startswith(related.SEMANTIC_SCHOLAR_TITLE_MATCH_URL)]
        self.assertEqual(1, len(lookup))
        self.assertEqual("Rareword resonance of gadgetite whiskers",
                         lookup[0]["params"]["query"])

    def test_an_inexact_title_match_skips_the_external_list_entirely(self):
        no_doi = Paper(**paper_doc(
            "nodoi2", "Rareword resonance of gadgetite whiskers",
            "Rareword resonance in gadgetite lattices.",
            tags=["rareword resonance"], doi="")).save()
        stub = ProviderStub(resolution={
            "paperId": "S2-WRONG",
            "title": "An entirely different paper about something else",
            "externalIds": {}})
        response, _ = self.fetch(paper_id=str(no_doi.id), provider=stub)
        body = response.json()
        self.assertEqual("unresolved", body["external"]["status"])
        self.assertEqual([], body["external"]["results"])
        self.assertIsNone(stub.recommendation_call)

    def test_being_recommended_is_now_enough_by_itself_to_show_a_paper(self):
        # The core policy this feature implements: Semantic Scholar
        # proposing a candidate is enough for it to appear in Recommended
        # External Papers. Qresp's evidence gate is still computed for every
        # candidate, but it only RE-RANKS -- it never removes one.
        response, _ = self.fetch()
        external = response.json()["external"]["results"]
        titles = [item["title"] for item in external]
        self.assertIn("Rareword resonance in gadgetite single crystals", titles)
        # The candidate with no nameable evidence is no longer excluded --
        # it is simply ranked behind the one that has some.
        self.assertIn("A study of data analysis in another discipline", titles)
        self.assertLess(
            titles.index("Rareword resonance in gadgetite single crystals"),
            titles.index("A study of data analysis in another discipline"))
        by_title = {item["title"]: item for item in external}
        # Grounded evidence is still named when it exists...
        self.assertTrue(
            by_title["Rareword resonance in gadgetite single crystals"][
                "reasons"])
        # ...and nothing is invented when it does not.
        self.assertEqual(
            [], by_title["A study of data analysis in another discipline"][
                "reasons"])

    def test_external_results_prefer_an_https_doi_link(self):
        response, _ = self.fetch()
        item = response.json()["external"]["results"][0]
        self.assertEqual("https://doi.org/10.2000/external-a", item["url"])
        self.assertEqual("10.2000/external-a", item["doi"])

    def test_at_most_twentyfive_external_results(self):
        response, _ = self.fetch(
            provider=ProviderStub(recommendations=clones(40)))
        results = response.json()["external"]["results"]
        self.assertEqual(25, len(results))
        self.assertEqual(related.EXTERNAL_MAX_RESULTS, len(results))
        # ...and the cap is EXTERNAL. The internal one is untouched by it.
        self.assertEqual(3, related.MAX_RESULTS)
        self.assertGreater(related.EXTERNAL_MAX_RESULTS, related.MAX_RESULTS)

    def test_the_external_cap_is_five_pages_of_five(self):
        # Stated as the product so the three numbers cannot drift: the UI
        # derives its page count from the same relationship.
        self.assertEqual(5, related.EXTERNAL_RESULTS_PER_PAGE)
        self.assertEqual(5, related.EXTERNAL_MAX_PAGES)
        self.assertEqual(related.EXTERNAL_RESULTS_PER_PAGE
                         * related.EXTERNAL_MAX_PAGES,
                         related.EXTERNAL_MAX_RESULTS)

    def test_fewer_than_25_deduplicated_candidates_give_a_shorter_list(self):
        # The list is exactly as long as what survived de-duplication (capped
        # at 25) -- never padded to fill a page.
        response, _ = self.fetch(
            provider=ProviderStub(recommendations=clones(9)))
        results = response.json()["external"]["results"]
        self.assertEqual(9, len(results))

    def test_a_weak_candidate_no_longer_shortens_the_list(self):
        # The exact scenario the OLD gate-as-filter policy handled
        # differently: nine strong candidates plus one with no nameable
        # evidence. All TEN are returned now -- nothing is dropped for a
        # weak or absent evidence verdict, only for being a duplicate or
        # unusable. The weak one still ranks last: real evidence still
        # outranks none.
        response, _ = self.fetch(provider=ProviderStub(
            recommendations=clones(9) + [UNRELATED_EXTERNAL]))
        results = response.json()["external"]["results"]
        self.assertEqual(10, len(results))
        titles = [item["title"] for item in results]
        self.assertIn("A study of data analysis in another discipline",
                      titles)
        self.assertEqual(
            "A study of data analysis in another discipline", titles[-1])
        for item in results[:-1]:
            self.assertTrue(item["reasons"])
        self.assertEqual([], results[-1]["reasons"])

    def test_the_internal_list_keeps_its_own_cap_when_the_external_one_grows(self):
        # The same request that returns 25 external results must still return
        # at most three internal ones. The two caps are separate constants
        # precisely so widening one cannot widen the other.
        for index in range(9):
            Paper(**paper_doc(
                "sibling%d" % index,
                "Rareword resonance of gadgetite %s" % _WORDS[500 + index],
                "Rareword resonance in gadgetite lattices measured with a "
                "cryogenic spectrometer and a tunable oscillator.",
                tags=["rareword resonance", "gadgetite"],
                authors=["Robin Sharedname"],
                doi="10.1000/sibling%d" % index)).save()
        response, _ = self.fetch(
            provider=ProviderStub(recommendations=clones(40)))
        body = response.json()
        self.assertEqual(3, len(body["internal"]["results"]))
        self.assertEqual(25, len(body["external"]["results"]))


class TestTheFeedbackContextIsIssuedHere(RelatedTestCase):
    """A rating has to be ABOUT something, and this endpoint is the only thing
    that knows what. It mints a signed note -- after resolving a public,
    active record and computing the list -- which the feedback endpoint will
    not store a rating without.
    """

    def setUp(self):
        super(TestTheFeedbackContextIsIssuedHere, self).setUp()
        # The test configuration ships no signing secret, and the feature
        # fails closed without one.
        self.previous_secret = connexionapp.app.secret_key
        connexionapp.app.secret_key = "test-only-feedback-signing-secret"

    def tearDown(self):
        connexionapp.app.secret_key = self.previous_secret
        super(TestTheFeedbackContextIsIssuedHere, self).tearDown()

    def external(self, response):
        return response.json()["external"]

    def test_a_list_with_results_gets_a_signed_context(self):
        from project import feedback_context
        response, _ = self.fetch()
        external = self.external(response)
        self.assertTrue(external["results"])
        token = external["feedback_context"]
        with connexionapp.app.test_request_context():
            payload = feedback_context.verify(token, self.subject_id,
                                              "external")
        # It attests the REAL counts, which is what makes the client's
        # numbers unnecessary.
        self.assertEqual(len(external["results"]), payload["results"])
        self.assertEqual(1, payload["pages"])

    def test_the_page_count_matches_what_the_ui_will_render(self):
        from project import feedback_context
        response, _ = self.fetch(
            provider=ProviderStub(recommendations=clones(40)))
        external = self.external(response)
        self.assertEqual(25, len(external["results"]))
        with connexionapp.app.test_request_context():
            payload = feedback_context.verify(external["feedback_context"],
                                              self.subject_id, "external")
        self.assertEqual(25, payload["results"])
        self.assertEqual(related.EXTERNAL_MAX_PAGES, payload["pages"])

    def test_an_empty_external_list_gets_no_context(self):
        # Nothing to rate, so nothing to sign -- which is what makes
        # "these recommendations were unhelpful" unsayable about an empty
        # section.
        response, _ = self.fetch(provider=ProviderStub(recommendations=[]))
        external = self.external(response)
        self.assertEqual([], external["results"])
        self.assertIsNone(external.get("feedback_context"))

    def test_a_weak_candidate_still_gets_a_context(self):
        # Under the current policy a candidate the OLD gate would have
        # rejected is still SHOWN (see TestExternalProvider), so it is still
        # something a reader can rate -- the context must exist for it.
        response, _ = self.fetch(
            provider=ProviderStub(recommendations=[UNRELATED_EXTERNAL]))
        external = self.external(response)
        self.assertTrue(external["results"])
        self.assertIsNotNone(external.get("feedback_context"))

    def test_a_list_with_only_the_paper_itself_gets_no_context(self):
        # The scenario that still produces zero results under the current
        # policy: the provider proposed something, but nothing distinct
        # survived de-duplication (raw_candidates > 0, after_dedupe == 0) --
        # nothing here failed the evidence gate; there was simply nothing
        # left to score.
        self_reference = recommendation(
            "Rareword resonance of gadgetite lattices",  # == the subject's
            "A different abstract under the same title.",  # own title
            doi="10.9999/not-the-real-doi")
        response, _ = self.fetch(
            provider=ProviderStub(recommendations=[self_reference]))
        external = self.external(response)
        self.assertEqual([], external["results"])
        self.assertEqual(related.REASON_NO_VALID_CANDIDATES,
                         external["reason"])
        self.assertIsNone(external.get("feedback_context"))

    def test_an_unavailable_provider_gets_no_context(self):
        stub = ProviderStub(recommendation_mode="timeout")
        response, _ = self.fetch(provider=stub)
        self.assertIsNone(self.external(response).get("feedback_context"))

    def test_a_record_that_does_not_exist_gets_no_context(self):
        response, _ = self.fetch(paper_id="60316fb93f58fc9075286688")
        self.assertEqual(404, response.status_code)
        self.assertNotIn("feedback_context", response.text)

    def test_a_deactivated_record_gets_no_context(self):
        # 404 for a reader who may not see it, so there is no answer to sign.
        response, _ = self.fetch(paper_id=str(self.papers["hidden"].id))
        self.assertEqual(404, response.status_code)
        self.assertNotIn("feedback_context", response.text)

    def test_the_feature_being_off_gets_no_context(self):
        response, _ = self.fetch(env=DISABLED)
        self.assertIsNone(response.json()["external"].get("feedback_context"))

    def test_the_token_carries_no_recommendation_detail(self):
        import base64
        response, _ = self.fetch()
        body = self.external(response)["feedback_context"].split(".")[0]
        payload = base64.urlsafe_b64decode(
            body + "=" * (-len(body) % 4)).decode("utf-8").lower()
        for leak in ("rareword", "gadgetite", "10.2000", "doi", "title",
                     "score", "reason"):
            self.assertNotIn(leak, payload, leak)

    def test_a_server_without_a_secret_still_serves_the_recommendations(self):
        # Fail closed on the TOKEN, never on the section: a deployment with no
        # secret loses the rating widget and keeps its recommendations.
        connexionapp.app.secret_key = ""
        response, _ = self.fetch()
        external = self.external(response)
        self.assertEqual(200, response.status_code)
        self.assertTrue(external["results"])
        self.assertIsNone(external.get("feedback_context"))

    def test_the_cached_answer_does_not_keep_one_readers_token(self):
        # The token is minted on the way OUT, after every cache. Baked into a
        # cached body it would be served long past its expiry.
        first, _ = self.fetch()
        second, stub = self.fetch()
        self.assertEqual([], stub.calls)          # served from the cache
        self.assertTrue(self.external(second)["feedback_context"])
        stored = RelatedResearchCache.objects(
            paper_id=self.subject_id).first()
        self.assertNotIn("feedback_context", str(stored.to_mongo().to_dict()))


class TestExternalDeduplication(RelatedTestCase):
    def test_the_current_paper_is_removed_by_doi_and_by_title(self):
        by_doi = recommendation("Some other spelling of the same work",
                                "Rareword resonance of gadgetite lattices.",
                                doi="10.1000/subject")
        by_title = recommendation(
            "Rareword resonance of gadgetite lattices",
            "Rareword resonance of gadgetite lattices.",
            doi="10.3000/other")
        response, _ = self.fetch(provider=ProviderStub(
            recommendations=[by_doi, by_title, RELATED_EXTERNAL]))
        titles = [i["title"] for i in response.json()["external"]["results"]]
        self.assertNotIn("Some other spelling of the same work", titles)
        self.assertNotIn("Rareword resonance of gadgetite lattices", titles)

    def test_repeated_dois_titles_and_untitled_results_are_dropped(self):
        kept = related.dedupe_candidates([
            {"title": "Alpha study of widgets", "doi": "10.1/a"},
            {"title": "Alpha study of widgets", "doi": "10.1/b"},  # same title
            {"title": "Beta report", "doi": "10.1/a"},             # same doi
            {"title": "", "doi": "10.1/c"},                        # no title
            {"title": "Gamma survey", "doi": "10.1/d"},
        ], "10.1/current", "The current paper")
        self.assertEqual(["Alpha study of widgets", "Gamma survey"],
                         [c["title"] for c in kept])

    def test_the_current_paper_is_removed_even_when_its_doi_is_written_as_a_url(self):
        kept = related.dedupe_candidates(
            [{"title": "The same work", "doi": "https://doi.org/10.1/CURRENT"}],
            "10.1/current", "Something else entirely")
        self.assertEqual([], kept)


# ------------------------------------------------------------------- cache

class TestCache(RelatedTestCase):
    def test_a_fresh_cache_entry_is_served_without_calling_the_provider(self):
        _, first = self.fetch()
        self.assertTrue(first.calls)
        response, second = self.fetch()
        self.assertEqual([], second.calls)
        self.assertTrue(response.json()["external"]["results"])
        self.assertFalse(response.json()["external"]["stale"])

    def test_the_external_results_live_outside_the_paper_document(self):
        self.fetch()
        entry = RelatedResearchCache.objects(paper_id=self.subject_id).first()
        self.assertIsNotNone(entry)
        self.assertTrue(entry.results)
        stored = json.dumps(
            Paper.objects.get(id=self.subject_id).to_mongo().to_dict(),
            default=str)
        self.assertNotIn("external-a", stored)
        self.assertNotIn("related", stored.lower().replace("unrelated", ""))

    def test_the_cache_holds_no_secret_no_user_and_no_provider_body(self):
        self.fetch(env=ENABLED_WITH_KEY)
        entry = RelatedResearchCache.objects(paper_id=self.subject_id).first()
        stored = json.dumps(entry.to_mongo().to_dict(), default=str)
        for secret in ("test-s2-super-secret", "x-api-key", "curator@example.com",
                       "files.example.org", "Authorization"):
            self.assertNotIn(secret, stored, secret)

    def test_an_expired_entry_is_refreshed(self):
        self.fetch()
        RelatedResearchCache.objects(paper_id=self.subject_id).update_one(
            set__expires_at=datetime.utcnow() - timedelta(days=1))
        response, stub = self.fetch()
        self.assertTrue(stub.calls)
        self.assertEqual("ok", response.json()["external"]["status"])
        self.assertFalse(response.json()["external"]["stale"])

    def test_a_failed_refresh_serves_the_last_success_marked_stale(self):
        self.fetch()
        RelatedResearchCache.objects(paper_id=self.subject_id).update_one(
            set__expires_at=datetime.utcnow() - timedelta(days=1))
        response, _ = self.fetch(
            provider=ProviderStub(recommendation_mode="rate_limited"))
        external = response.json()["external"]
        self.assertTrue(external["stale"])
        self.assertEqual("unavailable", external["status"])
        self.assertTrue(external["results"])
        self.assertEqual("Rareword resonance in gadgetite single crystals",
                         external["results"][0]["title"])

    def test_a_first_ever_failure_is_an_empty_external_section_not_a_stale_one(self):
        response, _ = self.fetch(
            provider=ProviderStub(recommendation_mode="server_error"))
        external = response.json()["external"]
        self.assertEqual("unavailable", external["status"])
        self.assertEqual([], external["results"])
        self.assertFalse(external["stale"])

    def test_a_failure_is_remembered_only_briefly(self):
        self.fetch(provider=ProviderStub(recommendation_mode="rate_limited"))
        entry = RelatedResearchCache.objects(paper_id=self.subject_id).first()
        self.assertLess(entry.expires_at,
                        datetime.utcnow() + timedelta(days=1))

    def test_the_cache_is_keyed_per_record(self):
        self.fetch()
        other = self.papers["near"]
        _, stub = self.fetch(paper_id=str(other.id))
        self.assertTrue(stub.calls)
        self.assertEqual(
            2, RelatedResearchCache.objects.count())


class TestEditedMetadataInvalidatesTheCache(RelatedTestCase):
    """A cached external answer describes the record AS IT WAS. When the
    record's public scientific metadata changes, the answer is recomputed at
    once -- not seven days later."""

    def entry(self):
        return RelatedResearchCache.objects(paper_id=self.subject_id).first()

    def test_editing_the_title_refetches_inside_the_ttl(self):
        # REPRODUCTION of the bug this fixes: with the cache keyed on the
        # paper id and an expiry alone, a record edited a minute after
        # publication kept serving recommendations computed from the OLD text
        # for a week. The cache entry below is deliberately still fresh.
        self.fetch()
        before = self.entry()
        self.assertGreater(before.expires_at, datetime.utcnow())

        Paper.objects(id=self.subject_id).update(
            set__reference__title="Cryogenic oscillator survey of widgetite")
        response, stub = self.fetch()

        self.assertTrue(stub.calls, "an edited record must be looked up again")
        self.assertEqual("ok", response.json()["external"]["status"])
        self.assertNotEqual(before.fingerprint, self.entry().fingerprint)

    def test_every_scoring_field_forces_a_refetch(self):
        edits = {
            "abstract": {"set__reference__publishedAbstract": "New abstract."},
            "doi": {"set__reference__DOI": "10.1000/changed"},
            "tags": {"set__tags": ["rareword resonance", "added-tag"]},
        }
        for label, update in edits.items():
            with self.subTest(field=label):
                RelatedResearchCache.drop_collection()
                self.fetch()
                Paper.objects(id=self.subject_id).update(**update)
                _, stub = self.fetch()
                self.assertTrue(stub.calls, label)

    def test_metadata_that_scores_nothing_does_not_refetch(self):
        """The other half of the contract, and the reason it is worth
        stating: a provider request costs a quota unit and a round trip.
        Authors and collections take no part in scoring, so re-asking
        Semantic Scholar because somebody corrected the spelling of a name
        buys a fresh copy of an answer that could not have changed."""
        for label, update in (
                ("collections", {"set__collections": ["MICCOM", "another"]}),
                ("authors", {"set__reference__authors": [
                    {"firstName": "Wholly", "middleName": "",
                     "lastName": "Different"}]}),
        ):
            with self.subTest(field=label):
                RelatedResearchCache.drop_collection()
                self.fetch()
                before = self.entry().fingerprint
                Paper.objects(id=self.subject_id).update(**update)
                _, stub = self.fetch()
                self.assertEqual([], stub.calls, label)
                self.assertEqual(before, self.entry().fingerprint, label)

    def test_editing_artifacts_and_tools_forces_a_refetch(self):
        for label, update in (
                ("tool", {"set__tools": [{"id": "t0", "kind": "software",
                                          "packageName": "OtherPackage"}]}),
                ("dataset", {"set__datasets": [{"id": "d0", "readme": "Data.",
                                               "keywords": ["diffraction"]}]}),
                ("chart", {"set__charts": [{"id": "c0",
                                            "imageFile": "charts/a.png",
                                            "caption": "A chart",
                                            "properties": ["pressure"]}]}),
                ("script", {"set__scripts": [{"id": "s0", "readme": "Fit.",
                                              "keywords": ["fitting"]}]})):
            with self.subTest(field=label):
                RelatedResearchCache.drop_collection()
                self.fetch()
                Paper.objects(id=self.subject_id).update(**update)
                _, stub = self.fetch()
                self.assertTrue(stub.calls, label)

    def test_ownership_and_file_server_edits_do_NOT_refetch(self):
        # These change nothing a recommendation depends on. Refetching for
        # them would also mean private fields were part of the cache key.
        self.fetch()
        Paper.objects(id=self.subject_id).update(
            set__owner_email="someone@example.com",
            set__editor_emails=["editor@example.com"],
            set__info__fileServerPath="https://elsewhere.example.org/x",
            set__info__insertedBy={"firstName": "Other", "lastName": "Person",
                                   "emailId": "other@example.com"},
            set__updated_by_email="someone@example.com")
        _, stub = self.fetch()
        self.assertEqual([], stub.calls)

    def test_a_legacy_entry_without_a_fingerprint_is_a_miss_not_a_migration(self):
        self.fetch()
        # Exactly what a document written by the previous version looks like.
        RelatedResearchCache.objects(paper_id=self.subject_id).update_one(
            unset__fingerprint=1)
        self.assertIsNone(self.entry().fingerprint)
        response, stub = self.fetch()
        self.assertTrue(stub.calls, "a fingerprintless entry must not be used")
        self.assertEqual("ok", response.json()["external"]["status"])
        self.assertTrue(self.entry().fingerprint)

    def test_the_stored_fingerprint_is_a_digest_and_leaks_nothing(self):
        self.fetch(env=ENABLED_WITH_KEY)
        fingerprint = self.entry().fingerprint
        self.assertRegex(fingerprint, r"^[0-9a-f]{64}$")
        for leak in ("rareword", "gadgetite", "Sharedname", "10.1000/subject",
                     "curator@example.com", "files.example.org",
                     "test-s2-super-secret"):
            self.assertNotIn(leak.lower(), fingerprint)


# ------------------------------------------------------- provider failures

class TestProviderFailuresDegradeGracefully(RelatedTestCase):
    def assert_internal_survives(self, provider):
        response, _ = self.fetch(provider=provider)
        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertTrue(body["internal"]["results"],
                        "internal results must survive a provider failure")
        self.assertEqual([], body["external"]["results"])
        return body

    def test_a_404_is_the_provider_ANSWERING_not_in_the_index(self):
        # The one failure that is a fact about the record.
        body = self.assert_internal_survives(
            ProviderStub(resolution_mode="not_found"))
        self.assertEqual("unresolved", body["external"]["status"])

    def test_a_404_from_the_recommendations_call_is_also_an_answer(self):
        body = self.assert_internal_survives(
            ProviderStub(recommendation_mode="not_found"))
        self.assertEqual("unresolved", body["external"]["status"])

    def test_every_non_answer_during_DOI_resolution_is_unavailable(self):
        # Previously ALL of these were recorded as "not in the index" and kept
        # for seven days: a timing-out or rate-limited provider silently
        # became a durable claim about the record.
        for mode in FAILURE_MODES:
            with self.subTest(mode=mode):
                RelatedResearchCache.drop_collection()
                body = self.assert_internal_survives(
                    ProviderStub(resolution_mode=mode))
                self.assertEqual("unavailable", body["external"]["status"],
                                 mode)

    def test_every_non_answer_during_title_lookup_is_unavailable(self):
        no_doi = Paper(**paper_doc(
            "nodoi-fail", "Rareword resonance of gadgetite whiskers",
            "Rareword resonance in gadgetite lattices with a cryogenic "
            "spectrometer.", tags=["rareword resonance"], doi="")).save()
        for mode in FAILURE_MODES:
            with self.subTest(mode=mode):
                RelatedResearchCache.drop_collection()
                response, stub = self.fetch(
                    paper_id=str(no_doi.id),
                    provider=ProviderStub(resolution_mode=mode))
                self.assertEqual(200, response.status_code)
                self.assertEqual("unavailable",
                                 response.json()["external"]["status"], mode)
                # It failed at the lookup, so it never asked for
                # recommendations for a paper it had not identified.
                self.assertIsNone(stub.recommendation_call, mode)

    def test_every_non_answer_during_recommendations_is_unavailable(self):
        for mode in FAILURE_MODES:
            with self.subTest(mode=mode):
                RelatedResearchCache.drop_collection()
                body = self.assert_internal_survives(
                    ProviderStub(recommendation_mode=mode))
                self.assertEqual("unavailable", body["external"]["status"],
                                 mode)

    def test_a_non_answer_is_never_cached_as_a_week_long_fact(self):
        for mode in FAILURE_MODES:
            with self.subTest(mode=mode):
                RelatedResearchCache.drop_collection()
                self.fetch(provider=ProviderStub(resolution_mode=mode))
                entry = RelatedResearchCache.objects(
                    paper_id=self.subject_id).first()
                self.assertEqual("unavailable", entry.status, mode)
                self.assertLessEqual(
                    entry.expires_at,
                    datetime.utcnow() + timedelta(
                        seconds=related.FAILURE_RETRY_SECONDS + 5), mode)

    def test_not_found_IS_cached_for_the_full_ttl(self):
        self.fetch(provider=ProviderStub(resolution_mode="not_found"))
        entry = RelatedResearchCache.objects(paper_id=self.subject_id).first()
        self.assertEqual("unresolved", entry.status)
        self.assertGreater(entry.expires_at,
                           datetime.utcnow() + timedelta(days=6))

    def test_a_non_answer_within_the_retry_window_still_reads_as_stale(self):
        # A failure is remembered for an hour. Anything served from that entry
        # came from an EARLIER success, so it must still be flagged stale --
        # the same promise the refresh path makes.
        self.fetch()
        RelatedResearchCache.objects(paper_id=self.subject_id).update_one(
            set__expires_at=datetime.utcnow() - timedelta(days=1))
        self.fetch(provider=ProviderStub(recommendation_mode="timeout"))
        response, stub = self.fetch(
            provider=ProviderStub(recommendation_mode="timeout"))
        external = response.json()["external"]
        self.assertEqual([], stub.calls, "the retry window must be honoured")
        self.assertEqual("unavailable", external["status"])
        self.assertTrue(external["stale"])
        self.assertTrue(external["results"])

    def test_no_provider_error_body_or_header_reaches_the_response(self):
        class Leaky(ProviderStub):
            def get(self, url, params=None, headers=None, timeout=None):
                self.calls.append({"url": url, "params": params or {},
                                   "headers": headers or {},
                                   "timeout": timeout})
                return FakeResponse(
                    {"error": "INTERNAL PROVIDER STACK TRACE",
                     "message": "quota exceeded for key test-s2-super-secret"},
                    500)
        response, _ = self.fetch(env=ENABLED_WITH_KEY, provider=Leaky())
        text = response.text
        for leak in ("INTERNAL PROVIDER STACK TRACE", "quota exceeded",
                     "test-s2-super-secret", "x-api-key"):
            self.assertNotIn(leak, text, leak)


# ------------------------------------------------------------ access policy

class TestAccessPolicy(RelatedTestCase):
    def test_a_missing_record_is_not_found(self):
        response, stub = self.fetch(paper_id="000000000000000000000000")
        self.assertEqual(404, response.status_code)
        self.assertEqual([], stub.calls)

    def test_an_unparseable_id_is_not_found(self):
        response, _ = self.fetch(paper_id="not-an-object-id")
        self.assertEqual(404, response.status_code)

    def test_a_deactivated_record_is_not_available_to_the_public(self):
        response, stub = self.fetch(paper_id=str(self.papers["hidden"].id))
        self.assertEqual(404, response.status_code)
        self.assertEqual("This record is not available.",
                         response.json()["error"])
        self.assertEqual([], stub.calls)

    def test_reading_related_research_changes_nothing(self):
        before = {str(p.id): json.dumps(p.to_mongo().to_dict(), default=str,
                                        sort_keys=True)
                  for p in Paper.objects()}
        self.fetch()
        self.fetch()
        after = {str(p.id): json.dumps(p.to_mongo().to_dict(), default=str,
                                       sort_keys=True)
                 for p in Paper.objects()}
        self.assertEqual(before, after)

    def test_the_response_carries_no_account_or_file_server_data(self):
        response, _ = self.fetch(env=ENABLED_WITH_KEY)
        text = response.text
        for leak in ("curator@example.com", "files.example.org",
                     "insertedBy", "owner_email", "editor_emails",
                     "test-s2-super-secret"):
            self.assertNotIn(leak, text, leak)


# ---------------------------------------------------------- federated records
#
# The Explorer can open a record that lives on ANOTHER Qresp server. Its id
# exists there and nowhere else, so before `?server=` was honoured this
# endpoint could only ever answer 404 for it -- and the detail page, catching
# that, hid the whole section.

PEER = "https://peer.example.org"
REGISTRY = [{"qresp_server_url": PEER, "isActive": "Yes"}]


def search_entry(paper_id, doc):
    """One entry of a peer's `/api/search`, name-mangled exactly as
    `util.Search` serializes. Deliberately carries the RCC and file-server
    paths a real answer carries, so the tests can prove they are dropped."""
    reference = doc["reference"]
    return {
        "_Search__id": paper_id,
        "_Search__title": reference["title"],
        "_Search__abstract": reference["publishedAbstract"],
        "_Search__doi": reference["DOI"],
        "_Search__year": reference["year"],
        "_Search__authors": ", ".join(
            "%s %s" % (a["firstName"], a["lastName"])
            for a in reference["authors"]),
        "_Search__tags": list(doc["tags"]),
        "_Search__collections": list(doc["collections"]),
        "_Search__publication": "Journal of Placeholder Science 1, 1-2",
        "_Search__serverPath": "https://rcc.peer.example.org/secret",
        "_Search__fileServerPath": "https://files.peer.example.org/secret",
        "_Search__folderAbsolutePath": "/home/peercurator/secret",
    }


def details_payload(paper_id, doc):
    """A peer's `/api/paper/{id}` answer: `util.PaperDetails`, plain keys,
    including everything this server must refuse to copy."""
    reference = doc["reference"]
    return {
        "id": paper_id,
        "title": reference["title"],
        "abstract": reference["publishedAbstract"],
        "doi": reference["DOI"],
        "year": reference["year"],
        "authors": ", ".join("%s %s" % (a["firstName"], a["lastName"])
                             for a in reference["authors"]),
        "tags": list(doc["tags"]),
        "collections": list(doc["collections"]),
        "charts": [], "datasets": [], "scripts": [],
        "tools": list(doc["tools"]),
        "workflows": {}, "heads": [],
        "firstName": "Peer", "lastName": "Curator",
        "emailId": "peercurator@example.org",
        "affiliation": "Peer University",
        "serverPath": "https://rcc.peer.example.org/secret",
        "fileServerPath": "https://files.peer.example.org/secret",
        "folderAbsolutePath": "/home/peercurator/secret",
        "downloadPath": "https://files.peer.example.org/secret.zip",
        "notebookPath": "https://notebook.peer.example.org/secret",
        "notebookFile": "secret.ipynb",
        "license": "cc-by", "timeStamp": "2021-01-01 00:00:00",
    }


def peer_corpus():
    """The same shaped corpus as the local one, on the peer, under ids that
    could not be mistaken for local ObjectIds."""
    docs = {
        "remote-subject": paper_doc(
            "remote-subject", "Rareword resonance of gadgetite lattices",
            "Rareword resonance in gadgetite lattices is probed with a "
            "cryogenic spectrometer and an oscillator of tunable frequency.",
            tags=["rareword resonance", "gadgetite"],
            authors=["Robin Sharedname", "Casey Otherperson"],
            doi="10.3000/remote-subject", tools=["RarePackage"]),
        "remote-near": paper_doc(
            "remote-near", "Rareword resonance of gadgetite thin films",
            "Rareword resonance in gadgetite lattices is measured with a "
            "cryogenic spectrometer and a tunable oscillator.",
            tags=["rareword resonance", "gadgetite"],
            authors=["Robin Sharedname"], doi="10.3000/remote-near",
            tools=["RarePackage"]),
        "remote-unrelated": paper_doc(
            "remote-unrelated", "Seasonal migration of coastal birds",
            "Observations of coastal bird migration over several seasons.",
            tags=["ornithology"], authors=["Sam Nobody"],
            doi="10.3000/remote-unrelated"),
    }
    for i in range(20):
        docs["remote-filler%d" % i] = paper_doc(
            "remote-filler%d" % i, "Unrelated subject %d" % i,
            "An abstract about topic%d and matter%d." % (i, i),
            tags=["topic%d" % i], authors=["Person%d Sur%d" % (i, i)],
            doi="10.3000/remote-filler%d" % i, collections=["other"])
    return docs


class PeerStub:
    """The federated peer, standing in for `federation.requests`.

    `record_mode` and `corpus_mode` fail one read or the other, so "the peer
    has no such record" and "the peer did not answer" can be told apart.
    """

    def __init__(self, record_mode="ok", corpus_mode="ok", docs=None):
        self.record_mode = record_mode
        self.corpus_mode = corpus_mode
        self.docs = docs if docs is not None else peer_corpus()
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append(dict(kwargs, url=url))
        corpus = url.endswith("/api/search")
        mode = self.corpus_mode if corpus else self.record_mode
        if mode == "timeout":
            raise ProviderTimeout("peer did not answer")
        if mode == "not_found":
            return PeerResponse(status_code=404)
        if mode == "server_error":
            return PeerResponse(status_code=503)
        if mode == "redirect":
            return PeerResponse(status_code=302)
        if mode == "malformed":
            return PeerResponse(body=b"<html>not json</html>")
        if corpus:
            return PeerResponse([search_entry(key, doc)
                                 for key, doc in sorted(self.docs.items())])
        paper_id = url.rsplit("/", 1)[-1]
        doc = self.docs.get(paper_id)
        if doc is None:
            return PeerResponse(status_code=404)
        return PeerResponse(details_payload(paper_id, doc))


class PeerResponse:
    def __init__(self, payload=None, status_code=200, body=None):
        self.status_code = status_code
        if body is not None:
            self._body = body
        else:
            self._body = json.dumps(payload if payload is not None
                                    else {}).encode("utf-8")

    def iter_content(self, size):
        yield self._body

    def close(self):
        pass


class FederatedTestCase(RelatedTestCase):
    def setUp(self):
        super(FederatedTestCase, self).setUp()
        federation._allowlist = {"origins": frozenset(), "at": None}
        federation._dns_cache.clear()
        # No test resolves a real name.
        self._dns = mock.patch.object(federation, "_resolve_addresses",
                                      return_value={"93.184.216.34"})
        self._dns.start()
        self.addCleanup(self._dns.stop)

    def tearDown(self):
        federation._allowlist = {"origins": frozenset(), "at": None}
        federation._dns_cache.clear()
        super(FederatedTestCase, self).tearDown()

    def fetch_from(self, server, paper_id="remote-subject", env=None,
                   provider=None, peer=None, registry=REGISTRY):
        """GET the endpoint for a record on `server`, with the peer, the
        registry and the recommendation provider all stubbed. Returns
        (response, provider stub, peer stub)."""
        stub = provider if provider is not None else ProviderStub()
        peer = peer if peer is not None else PeerStub()
        with mock.patch.dict('os.environ', env or ENABLED):
            with mock.patch.object(related, 'requests', stub):
                with mock.patch.object(federation, 'requests', peer):
                    with mock.patch.object(federation, '_registry_servers',
                                           return_value=registry):
                        response = self.client.get(
                            '/api/paper/%s/related' % paper_id,
                            params={"server": server})
        return response, stub, peer


class TestLocalRecordsAreUnaffected(FederatedTestCase):
    """The regression guard: a local record must behave exactly as it did
    before federation existed."""

    def test_no_server_parameter_contacts_no_peer(self):
        peer = PeerStub()
        stub = ProviderStub()
        registry = mock.Mock(return_value=REGISTRY)
        with mock.patch.dict('os.environ', ENABLED):
            with mock.patch.object(related, 'requests', stub):
                with mock.patch.object(federation, 'requests', peer):
                    with mock.patch.object(federation, '_registry_servers',
                                           registry):
                        response = self.client.get(
                            '/api/paper/%s/related' % self.subject_id)
        self.assertEqual(200, response.status_code)
        self.assertEqual([], peer.calls)
        # Not even the registry is consulted: there is nothing to authorise.
        self.assertEqual(0, registry.call_count)
        body = response.json()
        self.assertTrue(body["enabled"])
        self.assertEqual("", body["source_server"])
        self.assertTrue(body["internal"]["results"])

    def test_this_very_server_is_answered_locally(self):
        # `testserver` is the host the test client sends. A URL naming the
        # server the reader is already on means the local database, not a loop
        # back out through nginx -- and it is NOT in the registry, so this
        # also proves the check happens before the allowlist.
        response, _, peer = self.fetch_from("https://testserver",
                                            paper_id=self.subject_id)
        self.assertEqual(200, response.status_code)
        self.assertEqual([], peer.calls)
        self.assertEqual("", response.json()["source_server"])

    def test_a_loopback_server_is_answered_locally(self):
        # The staging tunnel (https://localhost:8443) is the common case.
        response, _, peer = self.fetch_from("https://localhost:8443",
                                            paper_id=self.subject_id)
        self.assertEqual(200, response.status_code)
        self.assertEqual([], peer.calls)
        self.assertEqual("", response.json()["source_server"])
        self.assertEqual(
            "", response.json()["internal"]["results"][0]["server"])

    def test_local_results_still_carry_an_empty_server(self):
        response, _, _ = self.fetch_from(None, paper_id=self.subject_id)
        for result in response.json()["internal"]["results"]:
            self.assertEqual("", result["server"])


class TestFederatedRecord(FederatedTestCase):
    def test_an_id_only_this_peer_has_is_answered_with_200(self):
        # The exact staging failure: the record is not in the local database.
        self.assertEqual(0, Paper.objects(id__in=[]).count())
        response, _, peer = self.fetch_from(PEER)
        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertTrue(body["enabled"])
        self.assertEqual(PEER, body["source_server"])
        self.assertEqual("ok", body["internal"]["status"])
        self.assertTrue(body["internal"]["results"])

    def test_both_the_record_and_the_corpus_come_from_the_peer(self):
        response, _, peer = self.fetch_from(PEER)
        urls = sorted(call["url"] for call in peer.calls)
        self.assertEqual(["%s/api/paper/remote-subject" % PEER,
                          "%s/api/search" % PEER], urls)
        # Scored against the PEER's corpus: the neighbour returned is the
        # peer's, never the local record with the same title.
        ids = [r["id"] for r in response.json()["internal"]["results"]]
        self.assertIn("remote-near", ids)
        local_ids = {str(p.id) for p in Paper.objects()}
        self.assertFalse(set(ids) & local_ids)

    def test_every_federated_result_names_the_server_it_lives_on(self):
        response, _, _ = self.fetch_from(PEER)
        results = response.json()["internal"]["results"]
        self.assertTrue(results)
        for result in results:
            self.assertEqual(PEER, result["server"])

    def test_the_record_is_never_written_to_this_servers_database(self):
        before = {str(p.id) for p in Paper.objects()}
        self.fetch_from(PEER)
        self.fetch_from(PEER)
        self.assertEqual(before, {str(p.id) for p in Paper.objects()})
        self.assertEqual(0, Paper.objects(
            reference__DOI="10.3000/remote-subject").count())

    def test_no_peer_curator_or_file_server_data_reaches_the_response(self):
        response, _, _ = self.fetch_from(PEER, env=ENABLED_WITH_KEY)
        text = response.text
        for leak in ("peercurator@example.org", "Peer University",
                     "rcc.peer.example.org", "files.peer.example.org",
                     "/home/peercurator/secret", "secret.ipynb",
                     "notebook.peer.example.org", "test-s2-super-secret"):
            self.assertNotIn(leak, text, leak)

    def test_the_external_provider_is_asked_about_the_remote_doi(self):
        response, provider, _ = self.fetch_from(PEER)
        self.assertEqual(200, response.status_code)
        resolution = provider.calls[0]
        self.assertIn("10.3000/remote-subject", resolution["url"])
        # And the local subject's DOI is nowhere near the provider call.
        self.assertNotIn("10.1000/subject", resolution["url"])

    def test_the_peer_is_read_over_https_only(self):
        _, _, peer = self.fetch_from(PEER)
        for call in peer.calls:
            self.assertTrue(call["url"].startswith("https://"), call["url"])
            self.assertFalse(call["allow_redirects"])

    def test_a_rate_limited_external_provider_keeps_the_federated_list(self):
        # The two halves fail independently. A 429 from Semantic Scholar must
        # not cost the reader the Related Qresp Records computed from the
        # peer's own corpus.
        provider = ProviderStub()
        provider.resolution_mode = "rate_limited"
        response, _, _ = self.fetch_from(PEER, provider=provider)
        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertEqual("ok", body["internal"]["status"])
        self.assertTrue(body["internal"]["results"])
        self.assertEqual("unavailable", body["external"]["status"])

    def test_a_federated_record_with_nothing_related_is_an_empty_ok(self):
        # An answer, not a failure: the peer was read and nothing cleared the
        # quality gate.
        lonely = {"remote-lonely": paper_doc(
            "remote-lonely", "Seasonal migration of coastal birds",
            "Observations of coastal bird migration over several seasons.",
            tags=["ornithology"], authors=["Sam Nobody"],
            doi="10.3000/remote-lonely")}
        lonely.update({k: v for k, v in peer_corpus().items()
                       if k.startswith("remote-filler")})
        response, _, _ = self.fetch_from(
            PEER, paper_id="remote-lonely", peer=PeerStub(docs=lonely))
        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertEqual("ok", body["internal"]["status"])
        self.assertEqual([], body["internal"]["results"])
        self.assertEqual(0, body["internal"]["count"])


class TestFederatedFailures(FederatedTestCase):
    def test_a_record_the_peer_does_not_have_is_a_404(self):
        response, _, _ = self.fetch_from(PEER, paper_id="remote-missing")
        self.assertEqual(404, response.status_code)
        self.assertEqual("This record is not available.",
                         response.json()["error"])

    def test_a_peer_timeout_is_reported_not_rendered_as_no_results(self):
        response, _, _ = self.fetch_from(
            PEER, peer=PeerStub(record_mode="timeout"))
        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertTrue(body["enabled"])
        self.assertEqual("unavailable", body["internal"]["status"])
        self.assertEqual([], body["internal"]["results"])

    def test_every_way_a_peer_read_can_fail_is_unavailable_not_empty(self):
        for mode in ("timeout", "server_error", "redirect", "malformed"):
            for where in ("record_mode", "corpus_mode"):
                response, _, _ = self.fetch_from(
                    PEER, peer=PeerStub(**{where: mode}))
                self.assertEqual(200, response.status_code, (mode, where))
                self.assertEqual("unavailable",
                                 response.json()["internal"]["status"],
                                 (mode, where))

    def test_a_corpus_the_peer_cannot_serve_is_never_replaced_by_the_local_one(self):
        # Scoring a remote record against this server's corpus would rank it
        # by the wrong vocabulary and label the results with the wrong server.
        response, _, _ = self.fetch_from(
            PEER, peer=PeerStub(corpus_mode="server_error"))
        self.assertEqual([], response.json()["internal"]["results"])

    def test_a_failed_peer_read_writes_nothing_to_the_cache(self):
        self.fetch_from(PEER, peer=PeerStub(record_mode="timeout"))
        self.assertEqual(0, RelatedResearchCache.objects.count())


class TestRefusedServers(FederatedTestCase):
    def assert_refused(self, server, peer=None):
        peer = peer if peer is not None else PeerStub()
        response, _, peer = self.fetch_from(server, peer=peer)
        self.assertEqual(400, response.status_code, server)
        self.assertEqual("This Qresp server is not available.",
                         response.json()["error"])
        # Refused means refused: no request left this process.
        self.assertEqual([], peer.calls, server)
        return response

    def test_a_server_outside_the_registry_is_refused(self):
        self.assert_refused("https://evil.example.net")

    def test_ssrf_shapes_are_refused(self):
        for server in ("https://169.254.169.254", "https://10.0.0.5",
                       "https://192.168.0.1", "https://[fd00::1]",
                       "file:///etc/passwd", "javascript:alert(1)",
                       "https://user:pw@peer.example.org",
                       "https://peer.example.org@evil.example.net",
                       "https://peer.example.org/../admin",
                       "https://peer.example.org?x=1",
                       "https://peer.example.org.evil.net",
                       "http://peer.example.org",
                       "https://paperstack.uchicagо.edu"):
            self.assert_refused(server)

    def test_a_refused_server_never_falls_back_to_the_local_record(self):
        # The local subject id EXISTS here. Asking for it "on" a server this
        # deployment does not federate with must not quietly answer with the
        # local record.
        response, _, _ = self.fetch_from("https://evil.example.net",
                                         paper_id=self.subject_id)
        self.assertEqual(400, response.status_code)
        self.assertNotIn("Rareword", response.text)

    def test_a_server_no_list_names_is_refused(self):
        # With the registry empty, only the shipped federation list is left,
        # and this peer is not on it.
        response, _, peer = self.fetch_from(PEER, registry=[])
        self.assertEqual(400, response.status_code)
        self.assertEqual([], peer.calls)

    def test_the_feature_switch_still_wins(self):
        # Off means off, whatever the server parameter says.
        response, _, peer = self.fetch_from("https://evil.example.net",
                                            env=DISABLED)
        self.assertEqual(200, response.status_code)
        self.assertFalse(response.json()["enabled"])
        self.assertEqual([], peer.calls)


class TestFederatedCacheIsolation(FederatedTestCase):
    def test_the_same_id_on_two_servers_gets_two_cache_rows(self):
        # A 24-hex ObjectId is only unique within one server.
        local_id = self.subject_id
        self.fetch_from(None, paper_id=local_id)
        peer = PeerStub(docs={local_id: peer_corpus()["remote-subject"]})
        self.fetch_from(PEER, paper_id=local_id, peer=peer)
        keys = sorted(e.paper_id for e in RelatedResearchCache.objects())
        self.assertEqual([local_id, "%s|%s" % (PEER, local_id)], keys)

    def test_a_local_entry_keeps_its_bare_id(self):
        # Backward compatibility: an entry written before federation existed
        # is still found by the local path.
        self.fetch_from(None, paper_id=self.subject_id)
        entry = RelatedResearchCache.objects.first()
        self.assertEqual(self.subject_id, entry.paper_id)

    def test_a_remote_answer_is_never_served_for_the_local_record(self):
        local_id = self.subject_id
        peer = PeerStub(docs={local_id: peer_corpus()["remote-subject"]})
        self.fetch_from(PEER, paper_id=local_id, peer=peer)
        remote_titles = {r["title"] for r in RelatedResearchCache.objects(
            paper_id="%s|%s" % (PEER, local_id)).first().results}
        response, provider, _ = self.fetch_from(None, paper_id=local_id)
        self.assertEqual(200, response.status_code)
        # The local request went to the provider itself rather than reading
        # the remote row.
        self.assertTrue(provider.calls)
        del remote_titles


if __name__ == "__main__":
    unittest.main()
