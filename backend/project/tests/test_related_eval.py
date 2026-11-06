"""The read-only domain-quality evaluation CLI.

Nothing here touches the network: the Qresp reader and the Semantic Scholar
provider are both stubbed, and one test asserts that a run without --live
cannot make an external request at all.

The privacy assertions matter as much as the arithmetic. This tool reads a
real instance's public API, and the payloads it reads carry curator names,
emails, file-server paths and file names that must never reach a file it
writes.
"""
import io
import json
import os
import shutil
import tempfile
import unittest
from unittest import mock

from project import related
from project import relatedness as R
from project.tools import eval_core as core
from project.tools import related_eval


# --------------------------------------------------------------- fixtures

def search_record(index, title, abstract, doi=None, tags=(), collections=(),
                  publication="Journal of Placeholder Science", year=2020,
                  authors="Robin Sharedname, Casey Otherperson"):
    """A record in the LEGACY /api/search shape, name-mangled keys and all."""
    return {
        "_Search__id": "id%02d" % index,
        "_Search__title": title,
        "_Search__abstract": abstract,
        "_Search__doi": doi if doi is not None else "10.1000/id%02d" % index,
        "_Search__tags": list(tags),
        "_Search__collections": list(collections) or ["MICCOM"],
        "_Search__publication": publication,
        "_Search__year": year,
        "_Search__authors": authors,
        # Everything below is in the real payload and must never come out.
        "_Search__serverPath": "https://notebook.rcc.uchicago.edu/files/x",
        "_Search__fileServerPath": "https://files.example.org/secret",
        "_Search__folderAbsolutePath": "/project/secret/folder",
        "_Search__downloadPath": "https://internal.example.org/download",
        "_Search__notebookPath": "notebooks/private.ipynb",
        "_Search__notebookFile": "private-notebook.ipynb",
    }


def rich_corpus(count=6):
    """Records that genuinely relate to each other, so the gate has something
    to accept."""
    records = []
    for i in range(count):
        records.append(search_record(
            i,
            "Rareword resonance of gadgetite lattices variant %s"
            % "abcdefgh"[i],
            "Rareword resonance in gadgetite lattices is probed with a "
            "cryogenic spectrometer and a tunable oscillator of adjustable "
            "frequency across a wide temperature range. The resonance "
            "linewidth narrows monotonically as the gadgetite lattice cools, "
            "and the oscillator tracks the shift without recalibration.",
            tags=["rareword resonance", "gadgetite"],
            collections=["MICCOM" if i % 2 else "Other"]))
    return records


DETAILS = {
    "title": "Rareword resonance of gadgetite lattices variant a",
    "abstract": "Rareword resonance in gadgetite lattices.",
    "doi": "10.1000/id00",
    "tags": ["rareword resonance"],
    "collections": ["MICCOM"],
    "charts": [{"caption": "Resonance sweep", "properties": ["frequency"],
                "imageFile": "charts/secret-image.png",
                "files": ["charts/private.csv"]}],
    "datasets": [{"readme": "Sweep data", "keywords": ["diffraction"],
                  "files": ["datasets/private.dat"],
                  "URLs": ["https://notebook.rcc.uchicago.edu/files/x"]}],
    "scripts": [],
    "tools": [{"packageName": "RarePackage", "measurement": "spectroscopy",
               "URLs": ["https://internal.example.org/tool"]}],
    # Curator identity, present in the real details payload.
    "firstName": "Curator", "lastName": "Person",
    "emailId": "curator@example.com", "affiliation": "Somewhere",
    "fileServerPath": "https://files.example.org/secret",
    "downloadPath": "https://internal.example.org/download",
    "notebookFile": "private-notebook.ipynb",
}


class FakeResponse:
    def __init__(self, payload, status_code=200, headers=None):
        self._payload = payload
        self.status_code = status_code
        self.headers = headers or {}

    def json(self):
        if self._payload is None:
            raise ValueError("not json")
        return self._payload


class FakeQrespSession:
    """Stands in for the single `requests.Session` a run uses.

    Production points that one session at both Qresp and the provider (the
    provider calls arrive wrapped in PolitesClient), so the fake routes on
    host exactly the same way.
    """

    def __init__(self, records, details=None, provider=None):
        self.records = records
        self.details = details if details is not None else DETAILS
        self.provider = provider
        self.calls = []

    def get(self, url, params=None, headers=None, timeout=None, verify=True):
        self.calls.append(url)
        if url.startswith(related.SEMANTIC_SCHOLAR_ORIGIN):
            if self.provider is None:
                return FakeResponse({}, 503)
            return self.provider.get(url, params=params, headers=headers,
                                     timeout=timeout)
        if url.endswith("/api/search"):
            return FakeResponse(self.records)
        if "/api/paper/" in url:
            return FakeResponse(dict(self.details))
        return FakeResponse({}, 404)


def recommendation(title, abstract, doi=None, paper_id=None, year=2022):
    return {
        "paperId": paper_id or (doi or title).replace("/", "_"),
        "title": title,
        "abstract": abstract,
        "year": year,
        "externalIds": {"DOI": doi} if doi else {},
        "authors": [{"name": "Someone Else", "authorId": "A1",
                     "homepage": "https://example.org/person"}],
        "fieldsOfStudy": ["Physics"],
        # Volunteered by the real provider; must not survive.
        "openAccessPdf": {"url": "https://example.org/secret.pdf"},
        "citationCount": 42,
        "embedding": [0.1, 0.2],
    }


class FakeProvider:
    """Stands in for `project.related.requests`."""

    def __init__(self, candidates=None):
        self.calls = []
        self.candidates = candidates if candidates is not None else [
            recommendation(
                "Rareword resonance in gadgetite single crystals",
                "Rareword resonance of gadgetite lattices measured with a "
                "cryogenic spectrometer and a tunable oscillator across a "
                "wide temperature range.",
                doi="10.2000/external-a"),
            recommendation(
                "A study of data analysis in another discipline",
                "This study presents a simulation and a data analysis.",
                doi="10.2000/external-b"),
        ]

    def get(self, url, params=None, headers=None, timeout=None):
        self.calls.append({"url": url, "params": params or {},
                           "headers": headers or {}})
        if url.startswith(related.SEMANTIC_SCHOLAR_RECOMMENDATIONS_URL):
            return FakeResponse({"recommendedPapers": self.candidates})
        if url.startswith(related.SEMANTIC_SCHOLAR_TITLE_MATCH_URL):
            return FakeResponse({"data": [{
                "paperId": "S2-TITLE",
                "title": (params or {}).get("query", ""),
                "externalIds": {}}]})
        return FakeResponse({"paperId": "S2-DOI", "title": "x",
                             "externalIds": {}})


# ------------------------------------------------------------- normalization

class TestNormalization(unittest.TestCase):
    def test_legacy_search_keys_are_understood(self):
        record = core.normalize_search_record(search_record(
            1, "A title", "An abstract", doi="10.1/x", tags=["alpha"],
            collections=["MICCOM"], year=2019))
        self.assertEqual("id01", record["id"])
        self.assertEqual("A title", record["title"])
        self.assertEqual("An abstract", record["abstract"])
        self.assertEqual("10.1/x", record["doi"])
        self.assertEqual(["alpha"], record["tags"])
        self.assertEqual(["MICCOM"], record["collections"])
        self.assertEqual(2019, record["year"])

    def test_plain_keys_are_understood_too(self):
        record = core.normalize_search_record({
            "id": "abc", "title": "A title", "abstract": "An abstract",
            "doi": "10.1/x", "tags": ["alpha"], "collections": ["MICCOM"],
            "year": "2019", "authors": "A One, B Two"})
        self.assertEqual("abc", record["id"])
        self.assertEqual(2019, record["year"])
        self.assertEqual(["A One", "B Two"], record["authors"])

    def test_the_canonical_record_is_what_the_gate_expects(self):
        canonical, _ = core.to_canonical_record(
            search_record(1, "Widget dynamics", "About widgets."), DETAILS)
        profile = R.build_internal_profile(canonical)
        self.assertTrue(profile.title)
        self.assertIn("widget", profile.all_terms)
        # The fingerprint must be computable from it as well.
        self.assertRegex(R.metadata_fingerprint(canonical), r"^[0-9a-f]{64}$")

    def test_private_fields_never_enter_the_canonical_record(self):
        canonical, _ = core.to_canonical_record(
            search_record(1, "Widget dynamics", "About widgets."), DETAILS)
        blob = json.dumps(canonical).lower()
        for leak in ("curator@example.com", "rcc.uchicago", "files.example",
                     "internal.example", "notebook", "ipynb", "secret",
                     "folderabsolute", "downloadpath", "imagefile",
                     "private.csv", "private.dat", "affiliation"):
            self.assertNotIn(leak, blob, leak)
        # ...while the scientific artifact metadata IS carried across.
        self.assertEqual([{"caption": "Resonance sweep",
                           "properties": ["frequency"]}], canonical["charts"])
        self.assertEqual("RarePackage", canonical["tools"][0]["packageName"])


# ------------------------------------------------------------------- triage

class TestTriage(unittest.TestCase):
    def triage(self, **kwargs):
        record = core.normalize_search_record(search_record(1, **kwargs))
        return core.triage_record(record)

    def test_a_healthy_record_passes(self):
        status, flags = self.triage(
            title="Rareword resonance of gadgetite lattices",
            abstract="Rareword resonance in gadgetite lattices is probed "
                     "with a cryogenic spectrometer and a tunable oscillator "
                     "over a wide temperature range. The resonance linewidth "
                     "narrows monotonically as the gadgetite lattice cools, "
                     "and the tuned oscillator tracks the shift throughout.")
        self.assertEqual(core.STATUS_OK, status)
        self.assertEqual([], flags)

    def test_obvious_test_records_are_flagged_with_a_reason_not_dropped(self):
        for title in ("STAGING TEST record", "QA placeholder",
                      "asdf", "Untitled draft"):
            status, flags = self.triage(
                title=title, abstract="An abstract with plenty of real words "
                                      "about resonance in lattices measured "
                                      "carefully over temperature ranges.")
            self.assertEqual(core.STATUS_EXCLUDED, status, title)
            codes = {flag["code"] for flag in flags}
            self.assertTrue(codes & {"test_title", "thin_title"}, title)
            # A reason a human can read, always.
            self.assertTrue(all(flag["reason"] for flag in flags), title)

    def test_a_title_and_abstract_from_different_papers_are_flagged(self):
        status, flags = self.triage(
            title="Rareword resonance of gadgetite lattices",
            abstract="Seasonal migration patterns among coastal birds were "
                     "observed across several breeding periods using visual "
                     "counts from fixed stations.")
        self.assertEqual(core.STATUS_EXCLUDED, status)
        self.assertIn("title_abstract_mismatch",
                      {flag["code"] for flag in flags})

    def test_keyboard_mash_tags_are_flagged(self):
        status, flags = self.triage(
            title="Rareword resonance of gadgetite lattices",
            abstract="Rareword resonance in gadgetite lattices probed with a "
                     "cryogenic spectrometer and a tunable oscillator over a "
                     "wide temperature range in this work.",
            tags=["asdf"])
        self.assertEqual(core.STATUS_EXCLUDED, status)
        self.assertIn("test_tags", {flag["code"] for flag in flags})

    def test_a_missing_doi_is_only_worth_reviewing(self):
        status, flags = self.triage(
            title="Rareword resonance of gadgetite lattices", doi="",
            abstract="Rareword resonance in gadgetite lattices probed with a "
                     "cryogenic spectrometer and a tunable oscillator over a "
                     "wide temperature range in this work.")
        self.assertEqual(core.STATUS_REVIEW, status)
        self.assertIn("no_doi", {flag["code"] for flag in flags})


# ------------------------------------------------------------------ sampling

class TestSampling(unittest.TestCase):
    def test_the_sample_is_deterministic(self):
        records = rich_corpus(8)
        first, _ = core.select_sample(records, 4)
        second, _ = core.select_sample(list(reversed(records)), 4)
        self.assertEqual([e["normalized"]["id"] for e in first],
                         [e["normalized"]["id"] for e in second])

    def test_metadata_rich_records_are_preferred(self):
        thin = search_record(90, "Sparse widget note", "", doi="")
        rich = search_record(
            91, "Rareword resonance of gadgetite lattices",
            "Rareword resonance in gadgetite lattices probed with a "
            "cryogenic spectrometer and a tunable oscillator over a wide "
            "temperature range in this careful work.",
            tags=["rareword resonance", "gadgetite"])
        chosen, _ = core.select_sample([thin, rich], 1)
        self.assertEqual(["id91"], [e["normalized"]["id"] for e in chosen])

    def test_one_collection_cannot_crowd_out_the_rest(self):
        crowd = [search_record(
            i, "Rareword resonance of gadgetite variant %d" % i,
            "Rareword resonance in gadgetite lattices probed with a "
            "cryogenic spectrometer and a tunable oscillator over a wide "
            "temperature range.", collections=["Crowded"]) for i in range(10)]
        lonely = search_record(
            50, "Thermal transport in amorphous widgetite ribbons",
            "Thermal transport in amorphous widgetite ribbons studied by "
            "molecular dynamics over a wide temperature range in this "
            "careful work.", collections=["Rare"])
        chosen, _ = core.select_sample(crowd + [lonely], 3)
        strata = [core._stratum(e["normalized"]) for e in chosen]
        self.assertIn("collection:rare", strata)

    def test_flagged_records_are_set_aside_with_their_reasons(self):
        good = rich_corpus(2)
        bad = search_record(80, "STAGING TEST", "placeholder", tags=["asdf"])
        chosen, skipped = core.select_sample(good + [bad], 5)
        self.assertNotIn("id80", [e["normalized"]["id"] for e in chosen])
        flagged = [e for e in skipped if e["normalized"]["id"] == "id80"]
        self.assertEqual(1, len(flagged))
        self.assertTrue(flagged[0]["flags"])
        # ...and can be opted back in rather than being gone for good.
        chosen, _ = core.select_sample(good + [bad], 5, include_flagged=True)
        self.assertIn("id80", [e["normalized"]["id"] for e in chosen])


# ------------------------------------------------------- gate explanations

class TestGateExplanations(unittest.TestCase):
    def build(self):
        records = rich_corpus(6)
        entries = [core.to_canonical_record(r)[0] for r in records]
        stats = R.CorpusStats([R.build_internal_profile(e) for e in entries])
        return entries, stats

    def test_an_accepted_candidate_has_no_rejection_reason(self):
        entries, stats = self.build()
        assessment = R.assess(R.build_internal_profile(entries[0]),
                              R.build_internal_profile(entries[1]), stats)
        self.assertTrue(assessment.passes)
        self.assertEqual("", core.rejection_reason(assessment))

    def test_a_rejected_candidate_explains_itself_in_the_gates_terms(self):
        entries, stats = self.build()
        unrelated, _ = core.to_canonical_record(search_record(
            99, "Seasonal migration of coastal birds",
            "Observations of coastal bird migration over several seasons "
            "using visual counts from fixed stations."))
        assessment = R.assess(R.build_internal_profile(entries[0]),
                              R.build_internal_profile(unrelated), stats)
        self.assertFalse(assessment.passes)
        reason = core.rejection_reason(assessment)
        self.assertTrue(reason)
        self.assertIn("similarity", reason)

    def test_components_come_from_the_assessment_not_a_recomputation(self):
        entries, stats = self.build()
        assessment = R.assess(R.build_internal_profile(entries[0]),
                              R.build_internal_profile(entries[1]), stats)
        components = core.gate_components(assessment)
        self.assertEqual(round(assessment.score, 4), components["score"])
        self.assertEqual(round(assessment.similarity, 4),
                         components["similarity"])
        self.assertEqual(len(assessment.shared_terms),
                         components["shared_specific_terms"])
        self.assertEqual(round(assessment.shared_weight, 4),
                         components["shared_term_weight"])


# ----------------------------------------------------------- review file I/O

class TestReviewFile(unittest.TestCase):
    def rows(self):
        return [{
            "record_id": "id00",
            "record_title": "Rareword resonance",
            "internal": [
                {"source": "internal", "rank": 0, "title": "Accepted one",
                 "gate_score": 9.0, "gate_decision": "accepted",
                 "rejection_reason": "", "reasons": ["a reason"],
                 "in_top5": True},
                {"source": "internal", "rank": 1, "title": "Rejected one",
                 "gate_score": 1.0, "gate_decision": "rejected",
                 "rejection_reason": "no evidence at all: ...",
                 "reasons": [], "in_top5": False},
            ],
            "external": {},
        }]

    def test_human_rating_is_always_written_empty(self):
        rows = core.tsv_rows(self.rows())
        self.assertEqual(core.TSV_COLUMNS, rows[0])
        for row in rows[1:]:
            self.assertEqual("", row[core.TSV_COLUMNS.index("human_rating")])
            self.assertEqual("", row[core.TSV_COLUMNS.index("human_note")])

    def test_rejected_candidates_are_included_so_false_negatives_are_findable(self):
        title_at = core.TSV_COLUMNS.index("candidate_title")
        titles = [row[title_at] for row in core.tsv_rows(self.rows())[1:]]
        self.assertIn("Accepted one", titles)
        self.assertIn("Rejected one", titles)

    def test_only_what_is_shown_plus_near_misses_reaches_the_review_file(self):
        # On a real corpus the gate accepts most pairs but shows five. Rating
        # hundreds of accepted-but-never-displayed rows buys nothing, so the
        # file carries the shown ones and the best few behind them.
        record = {
            "record_id": "id00", "record_title": "A record", "external": {},
            "internal": [
                {"source": "internal", "rank": i, "title": "shown %d" % i,
                 "gate_score": 100 - i, "gate_decision": "accepted",
                 "rejection_reason": "", "reasons": ["r"], "in_top5": True}
                for i in range(5)
            ] + [
                {"source": "internal", "rank": 5 + i,
                 "title": "not shown %d" % i, "gate_score": 50 - i,
                 "gate_decision": "accepted", "rejection_reason": "",
                 "reasons": ["r"], "in_top5": False}
                for i in range(40)
            ],
        }
        title_at = core.TSV_COLUMNS.index("candidate_title")
        titles = [row[title_at] for row in
                  core.tsv_rows([record], rejected_per_source=5)[1:]]
        self.assertEqual(10, len(titles))
        for i in range(5):
            self.assertIn("shown %d" % i, titles)
        self.assertIn("not shown 0", titles)
        self.assertNotIn("not shown 39", titles)

    def test_tabs_and_newlines_cannot_break_a_row(self):
        rows = self.rows()
        rows[0]["record_title"] = "Title\twith\ttabs\nand a newline"
        rendered = core.render_tsv(core.tsv_rows(rows))
        # Split on newlines only: a bare strip() would eat the trailing empty
        # cells, which is precisely where the blank human rating lives.
        for line in [l for l in rendered.split("\n") if l]:
            self.assertEqual(len(core.TSV_COLUMNS), len(line.split("\t")))

    def test_only_the_three_ratings_are_accepted(self):
        header = "\t".join(core.TSV_COLUMNS)
        base = ["pair0001", "id00", "A record", "internal", "A candidate",
                "why", "9.0", "accepted"]
        for rating in ("related", "partial", "unrelated", "RELATED", " partial ",
                       ""):
            text = header + "\n" + "\t".join(base + [rating, ""])
            rows, errors = core.parse_tsv(text)
            self.assertEqual([], errors, rating)
            self.assertEqual(rating.strip().lower(), rows[0]["human_rating"])
        for rating in ("yes", "maybe", "3", "related-ish"):
            text = header + "\n" + "\t".join(base + [rating, ""])
            rows, errors = core.parse_tsv(text)
            self.assertTrue(errors, rating)
            self.assertEqual([], rows, rating)

    def test_a_wrong_header_is_refused_rather_than_guessed_at(self):
        rows, errors = core.parse_tsv("a\tb\nc\td\n")
        self.assertEqual([], rows)
        self.assertTrue(errors)


# ------------------------------------------------------------------ metrics

class TestMetrics(unittest.TestCase):
    def row(self, **kwargs):
        base = {"record_id": "id00", "record_title": "t", "source": "internal",
                "candidate_title": "c", "reasons": "", "gate_score": "1",
                "gate_decision": "accepted", "human_rating": "related",
                "human_note": ""}
        base.update(kwargs)
        return base

    def test_unrated_rows_are_excluded_and_counted(self):
        rows = [self.row(candidate_title="a"),
                self.row(candidate_title="b", human_rating=""),
                self.row(candidate_title="c", human_rating="")]
        metrics = core.score_ratings(rows)
        self.assertEqual(3, metrics["rows_total"])
        self.assertEqual(1, metrics["rows_rated"])
        self.assertEqual(2, metrics["rows_unrated"])
        self.assertEqual(2, metrics["rows_unrated_excluded_from_metrics"])
        self.assertEqual(1, metrics["accepted"]["rated"])

    def test_precision_at_5_counts_only_what_a_visitor_would_see(self):
        rows = [
            self.row(candidate_title="shown-related", human_rating="related"),
            self.row(candidate_title="shown-partial", human_rating="partial"),
            self.row(candidate_title="not-shown", human_rating="unrelated"),
        ]
        top5 = {("id00", "internal", "shown-related"),
                ("id00", "internal", "shown-partial")}
        metrics = core.score_ratings(rows, top5)
        self.assertEqual(2, metrics["shown_rows_rated"])
        self.assertEqual(0.5, metrics["precision_at_5"])
        self.assertEqual(1.0, metrics["precision_at_5_lenient"])

    def test_false_positives_and_false_negatives(self):
        rows = [
            self.row(candidate_title="fp", gate_decision="accepted",
                     human_rating="unrelated"),
            self.row(candidate_title="fn", gate_decision="rejected",
                     human_rating="related"),
            self.row(candidate_title="fn2", gate_decision="rejected",
                     human_rating="partial"),
            self.row(candidate_title="tn", gate_decision="rejected",
                     human_rating="unrelated"),
            self.row(candidate_title="tp", gate_decision="accepted",
                     human_rating="related"),
        ]
        metrics = core.score_ratings(rows)
        self.assertEqual(1, metrics["false_positives"])
        self.assertEqual(2, metrics["false_negatives"])
        self.assertEqual(1, metrics["false_negatives_strict"])

    def test_pools_are_compared_separately(self):
        rows = [
            self.row(source="internal", candidate_title="a",
                     human_rating="related"),
            self.row(source="recommendations_all_cs", candidate_title="b",
                     human_rating="unrelated"),
        ]
        metrics = core.score_ratings(rows)
        self.assertEqual(1.0, metrics["pools"]["internal"]["precision_strict"])
        self.assertEqual(
            0.0, metrics["pools"]["recommendations_all_cs"]["precision_strict"])

    def test_record_coverage_reports_partially_reviewed_sets(self):
        rows = [self.row(record_id="a", human_rating="related"),
                self.row(record_id="b", human_rating=""),
                self.row(record_id="c", human_rating="")]
        metrics = core.score_ratings(rows)
        self.assertEqual(3, metrics["record_coverage"]["records_in_review"])
        self.assertEqual(
            1, metrics["record_coverage"]["records_with_at_least_one_rating"])


# ------------------------------------------------------------ rate limiting

class TestPolitesClient(unittest.TestCase):
    class Session:
        def __init__(self, responses):
            self.responses = list(responses)
            self.calls = 0

        def get(self, url, params=None, headers=None, timeout=None):
            self.calls += 1
            return self.responses.pop(0) if self.responses else FakeResponse({})

    def client(self, responses, clock=None, **kwargs):
        self.slept = []
        session = self.Session(responses)
        # A clock that never advances: every call arrives "immediately after"
        # the last one, which is what the pacing has to handle.
        clock = clock or (lambda: 0.0)
        return session, related_eval.PolitesClient(
            session, sleep=self.slept.append, clock=clock, **kwargs)

    def test_a_429_is_retried_a_bounded_number_of_times(self):
        responses = [FakeResponse({}, 429, {"Retry-After": "2"})] * 10
        session, client = self.client(responses, max_retries=2, rate_limit=0)
        response = client.get("https://example.org/x")
        self.assertEqual(429, response.status_code)
        self.assertEqual(3, session.calls)      # initial + 2 retries
        self.assertEqual(2, client.retries)

    def test_retry_after_is_respected_and_capped(self):
        responses = [FakeResponse({}, 429, {"Retry-After": "5"}),
                     FakeResponse({"ok": True})]
        _, client = self.client(responses, max_retries=3, rate_limit=0)
        client.get("https://example.org/x")
        self.assertEqual([5], self.slept)

        responses = [FakeResponse({}, 429, {"Retry-After": "99999"}),
                     FakeResponse({"ok": True})]
        _, client = self.client(responses, max_retries=3, rate_limit=0)
        client.get("https://example.org/x")
        self.assertEqual([related_eval.MAX_RETRY_SLEEP], self.slept)

    def test_a_missing_retry_after_backs_off_anyway(self):
        responses = [FakeResponse({}, 429), FakeResponse({"ok": True})]
        _, client = self.client(responses, max_retries=3, rate_limit=0)
        client.get("https://example.org/x")
        self.assertEqual([1], self.slept)

    def test_requests_are_paced(self):
        session, client = self.client([FakeResponse({})] * 3, rate_limit=1.0)
        for _ in range(3):
            client.get("https://example.org/x")
        self.assertTrue(self.slept, "the rate limit must actually sleep")

    def test_a_success_is_never_retried(self):
        session, client = self.client([FakeResponse({"ok": True})],
                                      rate_limit=0)
        client.get("https://example.org/x")
        self.assertEqual(1, session.calls)
        self.assertEqual(0, client.retries)


# ---------------------------------------------------------------- end to end

class TestCollect(unittest.TestCase):
    def setUp(self):
        self.output = tempfile.mkdtemp(prefix="related-eval-")
        self.records = rich_corpus(6)

    def tearDown(self):
        shutil.rmtree(self.output, ignore_errors=True)

    def run_collect(self, live=False, provider=None, records=None,
                    extra=()):
        provider = provider if provider is not None else FakeProvider()
        session = FakeQrespSession(
            records if records is not None else self.records,
            provider=provider)
        argv = ["collect", "--api-base", "https://qresp.example.org",
                "--output-dir", self.output, "--sample-size", "4"]
        if live:
            argv.append("--live")
        argv.extend(extra)
        with mock.patch("requests.Session", return_value=session):
            code = related_eval.main(argv)
        return code, session, provider

    def read(self, name):
        with io.open(os.path.join(self.output, name), encoding="utf-8") as f:
            return f.read()

    def lines(self, name):
        """Split on newlines only. `str.strip()` would eat the trailing empty
        TSV cells, which is exactly where the (deliberately blank) human
        rating lives."""
        return [line for line in self.read(name).split("\n") if line]

    def test_without_live_no_external_request_is_made(self):
        provider = FakeProvider()
        code, _, _ = self.run_collect(live=False, provider=provider)
        self.assertEqual(0, code)
        self.assertEqual([], provider.calls)
        summary = json.loads(self.read("summary.json"))
        self.assertFalse(summary["live"])
        self.assertEqual(0, summary["provider_requests"]["calls"])

    def test_the_offline_client_refuses_rather_than_silently_skipping(self):
        with self.assertRaises(RuntimeError):
            related_eval.OfflineClient().get("https://example.org")

    def test_a_live_run_collects_each_pool_separately(self):
        code, _, provider = self.run_collect(live=True)
        self.assertEqual(0, code)
        self.assertTrue(provider.calls)
        lines = [json.loads(l) for l in
                 self.read("raw-results.jsonl").strip().split("\n")]
        self.assertTrue(lines)
        for line in lines:
            self.assertEqual(sorted(related_eval.EXTERNAL_POOLS),
                             sorted(line["external"]))

    def test_the_production_related_endpoint_is_never_called(self):
        _, session, _ = self.run_collect(live=True)
        for url in session.calls:
            self.assertNotIn("/related", url)

    def test_raw_results_carry_only_allowlisted_candidate_keys(self):
        self.run_collect(live=True)
        for line in self.read("raw-results.jsonl").strip().split("\n"):
            record = json.loads(line)
            self.assertEqual(sorted(core.RECORD_KEYS), sorted(record))
            candidates = list(record["internal"])
            for pool in record["external"].values():
                candidates.extend(pool)
            for candidate in candidates:
                self.assertEqual(sorted(core.CANDIDATE_KEYS),
                                 sorted(candidate))

    def test_no_secret_or_path_or_identity_reaches_any_output_file(self):
        with mock.patch.dict("os.environ",
                             {"QRESP_SEMANTIC_SCHOLAR_API_KEY": "s2-secret"}):
            self.run_collect(live=True)
        blob = "\n".join(self.read(name) for name in
                         ("raw-results.jsonl", "human-review.tsv",
                          "summary.json")).lower()
        for leak in ("s2-secret", "x-api-key", "authorization",
                     "curator@example.com", "rcc.uchicago", "files.example",
                     "internal.example", "notebook", "ipynb",
                     "openaccesspdf", "secret.pdf", "embedding",
                     "citationcount", "homepage", "private.csv"):
            self.assertNotIn(leak, blob, leak)

    def test_the_api_key_is_reported_only_as_a_boolean(self):
        with mock.patch.dict("os.environ",
                             {"QRESP_SEMANTIC_SCHOLAR_API_KEY": "s2-secret"}):
            self.run_collect(live=True)
        summary = json.loads(self.read("summary.json"))
        self.assertIs(True, summary["api_key_present"])

    def test_the_review_file_is_ready_for_a_person_and_empty_of_ratings(self):
        self.run_collect(live=True)
        lines = self.lines("human-review.tsv")
        self.assertEqual("\t".join(core.TSV_COLUMNS), lines[0])
        self.assertGreater(len(lines), 1)
        for line in lines[1:]:
            cells = line.split("\t")
            self.assertEqual(len(core.TSV_COLUMNS), len(cells))
            self.assertEqual("", cells[core.TSV_COLUMNS.index("human_rating")])
            self.assertEqual("", cells[core.TSV_COLUMNS.index("human_note")])

    def test_the_summary_reports_coverage_and_rejection_reasons(self):
        self.run_collect(live=True)
        summary = json.loads(self.read("summary.json"))
        self.assertEqual(4, summary["sample_size"])
        self.assertIn("pools", summary)
        self.assertIn("internal", summary["pools"])
        self.assertIn("gate_pass_rate", summary)
        self.assertIn("zero_candidate_ratio", summary)
        self.assertIsInstance(summary["rejection_reason_frequency"], dict)

    def test_short_internal_lists_are_not_padded_to_five(self):
        # One usable record plus unrelated ones: nothing may be invented.
        lonely = [search_record(
            0, "Rareword resonance of gadgetite lattices",
            "Rareword resonance in gadgetite lattices probed with a "
            "cryogenic spectrometer and a tunable oscillator over a wide "
            "temperature range in this careful work.")]
        lonely += [search_record(
            i, "Seasonal migration of coastal birds number %d" % i,
            "Observations of coastal bird migration over several seasons "
            "using visual counts from fixed stations at the shoreline.")
            for i in range(1, 4)]
        self.run_collect(live=False, records=lonely)
        for line in self.read("raw-results.jsonl").strip().split("\n"):
            record = json.loads(line)
            shown = [c for c in record["internal"] if c["in_top5"]]
            self.assertLessEqual(len(shown), related.MAX_RESULTS)
            for candidate in shown:
                self.assertEqual("accepted", candidate["gate_decision"])

    def test_flagged_records_are_reported_in_the_summary(self):
        records = rich_corpus(3) + [
            search_record(80, "STAGING TEST placeholder", "asdf",
                          tags=["asdf"])]
        self.run_collect(live=False, records=records)
        summary = json.loads(self.read("summary.json"))
        self.assertGreaterEqual(summary["records_flagged"], 1)
        self.assertIn("test_title", summary["flag_reasons"])
        # A record that was simply not drawn into the sample is NOT a finding
        # about the corpus and is counted separately.
        self.assertIn("records_not_sampled", summary)


class TestSummarizeCommand(unittest.TestCase):
    def setUp(self):
        self.output = tempfile.mkdtemp(prefix="related-eval-sum-")

    def tearDown(self):
        shutil.rmtree(self.output, ignore_errors=True)

    def write(self, name, text):
        path = os.path.join(self.output, name)
        with io.open(path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
        return path

    def test_it_scores_a_reviewed_file(self):
        header = "\t".join(core.TSV_COLUMNS)
        rows = [
            ["p1", "id00", "A record", "internal", "Good one", "why", "9.0",
             "accepted", "related", ""],
            ["p2", "id00", "A record", "internal", "Bad one", "why", "8.0",
             "accepted", "unrelated", ""],
            ["p3", "id00", "A record", "internal", "Missed one", "", "1.0",
             "rejected", "related", "the gate should have kept this"],
            ["p4", "id00", "A record", "internal", "Not yet rated", "", "1.0",
             "rejected", "", ""],
        ]
        self.write("human-review.tsv",
                   header + "\n" + "\n".join("\t".join(r) for r in rows) + "\n")
        self.write("raw-results.jsonl", json.dumps({
            "record_id": "id00",
            "internal": [
                {"source": "internal", "title": "Good one", "in_top5": True},
                {"source": "internal", "title": "Bad one", "in_top5": True},
                {"source": "internal", "title": "Missed one",
                 "in_top5": False},
            ],
            "external": {},
        }) + "\n")

        code = related_eval.main(["summarize", "--output-dir", self.output])
        self.assertEqual(0, code)
        with io.open(os.path.join(self.output, "metrics.json"),
                     encoding="utf-8") as handle:
            metrics = json.load(handle)
        self.assertEqual(4, metrics["rows_total"])
        self.assertEqual(3, metrics["rows_rated"])
        self.assertEqual(1, metrics["rows_unrated"])
        self.assertEqual(0.5, metrics["precision_at_5"])
        self.assertEqual(1, metrics["false_positives"])
        self.assertEqual(1, metrics["false_negatives"])

    def test_an_invalid_rating_stops_the_scoring(self):
        header = "\t".join(core.TSV_COLUMNS)
        self.write("human-review.tsv", header + "\n" + "\t".join(
            ["id00", "t", "internal", "c", "", "1.0", "accepted", "sort of",
             ""]) + "\n")
        self.assertEqual(
            2, related_eval.main(["summarize", "--output-dir", self.output]))

    def test_a_missing_review_file_is_reported_not_crashed_on(self):
        self.assertEqual(
            2, related_eval.main(["summarize", "--output-dir", self.output]))


class TestIdsFile(unittest.TestCase):
    """Reading the --ids-file.

    The bug this guards: `Set-Content -Encoding utf8` on Windows PowerShell
    5.1 writes a BOM. Read as plain UTF-8 the BOM arrives glued to the first
    id, which then matches no record -- so the first paper vanishes from the
    sample and nothing anywhere says so.

    Fixtures write real bytes. Putting a literal "\\ufeff" in a Python string
    would test the escape, not the file.
    """

    UTF8_BOM = b"\xef\xbb\xbf"
    FIRST = "60316fb93f58fc9075286688"
    SECOND = "6927175d9bd76c2c6bf77364"

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="ids-file-")

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def write_bytes(self, payload, name="ids.txt"):
        path = os.path.join(self.dir, name)
        with open(path, "wb") as handle:
            handle.write(payload)
        return path

    def test_a_bom_and_crlf_file_reads_exactly_like_a_plain_one(self):
        # Byte-for-byte what PowerShell 5.1 produces: BOM, then CRLF lines.
        path = self.write_bytes(
            self.UTF8_BOM
            + ("%s\r\n%s\r\n" % (self.FIRST, self.SECOND)).encode("utf-8"))
        ids = related_eval._read_ids(path)
        self.assertEqual({self.FIRST, self.SECOND}, ids)
        for value in ids:
            self.assertFalse(value.startswith("﻿"), repr(value))
            self.assertNotIn("﻿", value, repr(value))
            self.assertNotIn("\r", value, repr(value))
        # The first id specifically -- that is the one a BOM corrupts.
        self.assertIn(self.FIRST, ids)

    def test_a_plain_utf8_file_without_a_bom_is_unchanged(self):
        path = self.write_bytes(
            ("%s\n%s\n" % (self.FIRST, self.SECOND)).encode("utf-8"))
        self.assertEqual({self.FIRST, self.SECOND},
                         related_eval._read_ids(path))

    def test_the_two_encodings_give_identical_results(self):
        body = "%s\n%s\n" % (self.FIRST, self.SECOND)
        with_bom = self.write_bytes(self.UTF8_BOM + body.encode("utf-8"),
                                    "with-bom.txt")
        without = self.write_bytes(body.encode("utf-8"), "without-bom.txt")
        self.assertEqual(related_eval._read_ids(without),
                         related_eval._read_ids(with_bom))

    def test_blank_lines_comments_whitespace_and_duplicates(self):
        path = self.write_bytes(self.UTF8_BOM + (
            "# a leading comment\r\n"
            "\r\n"
            "   %s   \r\n"
            "\t\r\n"
            "   # an indented comment\r\n"
            "%s\r\n"
            "%s\r\n"          # duplicate of the line above
            "\r\n"
         % (self.FIRST, self.SECOND, self.SECOND)).encode("utf-8"))
        self.assertEqual({self.FIRST, self.SECOND},
                         related_eval._read_ids(path))

    def test_a_comment_on_the_very_first_line_is_still_a_comment(self):
        # With a BOM, a first-line comment used to read as "﻿# ...",
        # which is not a comment and became an id.
        path = self.write_bytes(self.UTF8_BOM
                                + ("# only a comment\n%s\n" % self.FIRST)
                                .encode("utf-8"))
        self.assertEqual({self.FIRST}, related_eval._read_ids(path))


class TestIdsFileDrivesCollect(unittest.TestCase):
    """The integration the bug actually broke: a BOM'd ids file must select
    the first record, not silently drop it."""

    UTF8_BOM = b"\xef\xbb\xbf"

    def setUp(self):
        self.output = tempfile.mkdtemp(prefix="ids-collect-")

    def tearDown(self):
        shutil.rmtree(self.output, ignore_errors=True)

    def collect_with_ids(self, payload):
        ids_path = os.path.join(self.output, "ids.txt")
        with open(ids_path, "wb") as handle:
            handle.write(payload)
        session = FakeQrespSession(rich_corpus(6), provider=FakeProvider())
        argv = ["collect", "--api-base", "https://qresp.example.org",
                "--output-dir", self.output, "--ids-file", ids_path]
        with mock.patch("requests.Session", return_value=session):
            code = related_eval.main(argv)
        records = []
        path = os.path.join(self.output, "raw-results.jsonl")
        if os.path.isfile(path):
            with io.open(path, encoding="utf-8") as handle:
                records = [json.loads(l) for l in handle if l.strip()]
        return code, records

    def test_a_bom_prefixed_ids_file_still_selects_the_first_record(self):
        code, records = self.collect_with_ids(
            self.UTF8_BOM + b"id00\r\nid02\r\n")
        self.assertEqual(0, code)
        self.assertEqual(["id00", "id02"],
                         sorted(r["record_id"] for r in records))

    def test_the_result_matches_a_bomless_file(self):
        _, with_bom = self.collect_with_ids(self.UTF8_BOM + b"id00\r\nid02\r\n")
        shutil.rmtree(self.output, ignore_errors=True)
        self.output = tempfile.mkdtemp(prefix="ids-collect-")
        _, without = self.collect_with_ids(b"id00\nid02\n")
        self.assertEqual(sorted(r["record_id"] for r in without),
                         sorted(r["record_id"] for r in with_bom))


class TestCliSurface(unittest.TestCase):
    def test_no_production_url_is_hardcoded(self):
        source = io.open(related_eval.__file__, encoding="utf-8").read()
        source += io.open(core.__file__, encoding="utf-8").read()
        for host in ("qresp.org", "paperstack", "uchicago", "localhost:8443"):
            self.assertNotIn(host, source, host)

    def test_api_base_is_required(self):
        with self.assertRaises(SystemExit):
            related_eval.build_parser().parse_args(
                ["collect", "--output-dir", "x"])

    def test_ids_file_and_sample_size_are_mutually_exclusive(self):
        with self.assertRaises(SystemExit):
            related_eval.build_parser().parse_args(
                ["collect", "--api-base", "https://x", "--output-dir", "y",
                 "--ids-file", "a", "--sample-size", "5"])


# ------------------------------- the external list a reader is actually shown

def external_clones(count):
    """`count` distinct provider candidates that all clear the gate."""
    return [recommendation(
        "Rareword resonance in gadgetite %s" % word,
        "Rareword resonance of gadgetite lattices measured with a cryogenic "
        "spectrometer and a tunable oscillator across a wide temperature "
        "range.",
        doi="10.2000/paged-%s" % word)
        for word in ["w%03d" % index for index in range(count)]]


def rejected_clones(count):
    """`count` distinct provider candidates the gate rejects.

    A different subject entirely, so nothing the gate can name is shared.
    These are what a false-negative measurement needs: a sheet of accepted
    candidates alone cannot contain one.
    """
    return [recommendation(
        "Seasonal migration of coastal birds near %s" % word,
        "Observations of coastal bird migration over several seasons using "
        "visual counts from fixed stations along the shoreline.",
        doi="10.3000/offtopic-%s" % word)
        for word in ["u%03d" % index for index in range(count)]]


class TestExternalDisplayModelling(unittest.TestCase):
    """The evaluator has to model the PRODUCT, not just the gate.

    Production shows at most 25 external results, five to a page. "The gate
    accepted it" and "a reader will see it" are therefore different facts, and
    an evaluation that records only the first cannot answer the question the
    feature is judged on.
    """

    def setUp(self):
        self.output = tempfile.mkdtemp(prefix="related-eval-display-")

    def tearDown(self):
        shutil.rmtree(self.output, ignore_errors=True)

    def collect(self, candidates, extra=()):
        session = FakeQrespSession(rich_corpus(6),
                                   provider=FakeProvider(candidates))
        argv = ["collect", "--api-base", "https://qresp.example.org",
                "--output-dir", self.output, "--sample-size", "2", "--live"]
        argv.extend(extra)
        with mock.patch("requests.Session", return_value=session):
            code = related_eval.main(argv)
        self.assertEqual(0, code)
        with io.open(os.path.join(self.output, "raw-results.jsonl"),
                     encoding="utf-8") as handle:
            return [json.loads(line) for line in handle if line.strip()]

    def read(self, name):
        with io.open(os.path.join(self.output, name), encoding="utf-8") as f:
            return f.read()

    def production(self, record):
        return record["external"][related_eval.POOL_DEFAULT]

    def test_display_rank_and_page_describe_the_paginated_list(self):
        records = self.collect(external_clones(40))
        for record in records:
            visible = [c for c in self.production(record) if c["visible"]]
            self.assertEqual(related.EXTERNAL_MAX_RESULTS, len(visible))
            ranks = sorted(c["display_rank"] for c in visible)
            self.assertEqual(list(range(1, 26)), ranks)
            for candidate in visible:
                expected = ((candidate["display_rank"] - 1)
                            // related.EXTERNAL_RESULTS_PER_PAGE) + 1
                self.assertEqual(expected, candidate["display_page"])
                self.assertLessEqual(candidate["display_page"],
                                     related.EXTERNAL_MAX_PAGES)
            # Five to a page, every page full when 25 are shown.
            per_page = {}
            for candidate in visible:
                per_page[candidate["display_page"]] = per_page.get(
                    candidate["display_page"], 0) + 1
            self.assertEqual({1: 5, 2: 5, 3: 5, 4: 5, 5: 5}, per_page)

    def test_a_candidate_below_the_cap_is_accepted_but_not_visible(self):
        records = self.collect(external_clones(40))
        for record in records:
            hidden = [c for c in self.production(record)
                      if c["gate_decision"] == "accepted" and not c["visible"]]
            self.assertTrue(hidden, "the cap has to discard something here")
            for candidate in hidden:
                self.assertIsNone(candidate["display_rank"])
                self.assertIsNone(candidate["display_page"])

    def test_a_short_list_is_short_rather_than_padded(self):
        records = self.collect(external_clones(7))
        for record in records:
            visible = [c for c in self.production(record) if c["visible"]]
            self.assertEqual(7, len(visible))
            self.assertEqual({1, 2}, {c["display_page"] for c in visible})

    def test_the_internal_list_keeps_its_own_smaller_cap(self):
        records = self.collect(external_clones(40))
        for record in records:
            visible = [c for c in record["internal"] if c["visible"]]
            self.assertLessEqual(len(visible), related.MAX_RESULTS)

    def test_the_provider_rank_is_kept_for_diagnostics_only(self):
        records = self.collect(external_clones(12))
        for record in records:
            ranks = [c["provider_rank"] for c in self.production(record)]
            self.assertEqual(list(range(len(ranks))), sorted(ranks))
            # Internal candidates have no provider and say so.
            for candidate in record["internal"]:
                self.assertIsNone(candidate["provider_rank"])

    def test_the_pipeline_counts_are_recorded_per_pool(self):
        records = self.collect(external_clones(40))
        for record in records:
            pipeline = record["external_pipeline"][related_eval.POOL_DEFAULT]
            self.assertTrue(pipeline["resolved"])
            self.assertEqual(40, pipeline["raw_candidates"])
            self.assertEqual(40, pipeline["after_dedupe"])
            # Nothing is filtered by the gate any more: every deduplicated
            # candidate is scored, so this count always equals `after_dedupe`.
            self.assertEqual(40, pipeline["scored_candidates"])
            self.assertEqual(related.EXTERNAL_MAX_RESULTS,
                             pipeline["shown"])

    def test_the_summary_reports_the_production_pool_on_its_own(self):
        self.collect(external_clones(40))
        summary = json.loads(self.read("summary.json"))
        production = summary["external_production"]
        self.assertEqual(related_eval.POOL_DEFAULT, production["source"])
        self.assertEqual(related.EXTERNAL_CANDIDATE_LIMIT,
                         production["candidate_limit"])
        self.assertEqual(related.EXTERNAL_MAX_RESULTS,
                         production["display_cap"])
        self.assertEqual(2, production["records"])
        self.assertEqual(2, production["records_resolved_at_provider"])
        self.assertEqual(80, production["raw_candidates"])
        self.assertEqual(50, production["shown"])
        self.assertEqual({"1": 10, "2": 10, "3": 10, "4": 10, "5": 10},
                         production["shown_by_page"])
        # The diagnostic pools are still collected, and are still elsewhere.
        self.assertIn(related_eval.POOL_ALL_CS, summary["pools"])

    def test_the_external_review_export_is_blind_and_unrated(self):
        self.collect(external_clones(40))
        lines = [line for line in
                 self.read(related_eval.EXTERNAL_REVIEW_FILE).split("\n")
                 if line]
        self.assertEqual("\t".join(core.EXTERNAL_REVIEW_COLUMNS), lines[0])
        # Nothing that tells a reviewer what the system already decided.
        for withheld in ("gate_score", "gate_decision", "reasons",
                         "display_rank", "display_page", "accepted",
                         "rejected"):
            self.assertNotIn(withheld, lines[0], withheld)
        rating_at = core.EXTERNAL_REVIEW_COLUMNS.index("human_rating")
        note_at = core.EXTERNAL_REVIEW_COLUMNS.index("human_note")
        self.assertGreater(len(lines), 1)
        for line in lines[1:]:
            cells = line.split("\t")
            self.assertEqual(len(core.EXTERNAL_REVIEW_COLUMNS), len(cells))
            self.assertEqual("", cells[rating_at])
            self.assertEqual("", cells[note_at])

    def test_the_export_covers_page_one_in_full_and_samples_the_rest(self):
        # Isolated from the "beyond the display cap" sample below: with the
        # gate no longer filtering anything, that pool is never empty once
        # candidates outnumber the cap, so it is switched off here to keep
        # this test about the page-1-vs-pages-2-5 split alone.
        self.collect(external_clones(40), extra=["--external-review-sample",
                                                 "6",
                                                 "--external-rejected-sample",
                                                 "0"])
        summary = json.loads(self.read("summary.json"))
        report = summary["external_review_export"]
        # Two records x five page-1 results, exported exhaustively...
        self.assertEqual(10, report["page_1_rows"])
        # ...and a bounded, spread-out sample of the deeper pages.
        self.assertEqual(6, report["pages_2_to_5_rows"])
        self.assertEqual(40, report["pages_2_to_5_available"])
        # 40 candidates, 25 shown per record: 15 are beyond the display cap.
        self.assertEqual(30, report["rejected_available"])
        self.assertEqual(0, report["rejected_rows"])
        self.assertEqual(16, report["rows"])
        # Spread across pages rather than six rows of page 2.
        self.assertEqual({"2": 2, "3": 2, "4": 1, "5": 1},
                         report["deep_sample"]["by_page"])

    def test_rejected_candidates_are_exported_so_a_false_negative_is_findable(self):
        # Without these the sheet contains only candidates a reader was
        # actually SHOWN, so a reviewer filling it in can only ever produce
        # zero false negatives -- and that zero is indistinguishable from a
        # measured one. 30 candidates a record, 25 shown: 5 beyond the cap.
        self.collect(external_clones(10) + rejected_clones(20),
                     extra=["--external-rejected-sample", "8"])
        summary = json.loads(self.read("summary.json"))
        report = summary["external_review_export"]
        self.assertEqual(10, report["rejected_available"])   # 5 x 2 records
        self.assertEqual(8, report["rejected_rows"])
        # 25 visible per record over two records: five on page 1 each, the
        # other twenty spread over pages 2-5.
        self.assertEqual(10, report["page_1_rows"])
        self.assertEqual(40, report["pages_2_to_5_available"])
        self.assertEqual(report["page_1_rows"] + report["pages_2_to_5_rows"]
                         + report["rejected_rows"], report["rows"])
        # Spread across score bands rather than eight bottom-scoring ones.
        self.assertGreaterEqual(
            len(report["rejected_sample"]["by_score_band"]), 1)
        self.assertEqual(2, report["rejected_sample"]["distinct_records"])

        # The extra rows really are candidates a reader was NOT shown. Under
        # the new policy that is a question of VISIBILITY, not of the gate:
        # the gate no longer removes anything from this list, so a candidate
        # it would reject can be on screen and one it accepts can fall past
        # the display cap.
        rejected_ids = set()
        for line in self.read("raw-results.jsonl").strip().split("\n"):
            record = json.loads(line)
            for candidate in record["external"][related_eval.POOL_DEFAULT]:
                if not candidate["visible"]:
                    rejected_ids.add(candidate["pair_id"])
        exported = [line.split("\t")[0] for line in
                    self.read(related_eval.EXTERNAL_REVIEW_FILE).split("\n")[1:]
                    if line]
        self.assertEqual(8, len(rejected_ids & set(exported)))

    def test_the_export_does_not_reveal_which_rows_the_gate_threw_away(self):
        # Blindness is not only about columns. Appending the rejected sample
        # after the visible one would tell a reviewer, by position alone,
        # which rows the system had already discarded -- so the sheet is
        # ordered by an opaque pair_id instead.
        self.collect(external_clones(10) + rejected_clones(20),
                     extra=["--external-rejected-sample", "8"])
        lines = [line for line in
                 self.read(related_eval.EXTERNAL_REVIEW_FILE).split("\n")
                 if line]
        body = [tuple(line.split("\t")) for line in lines[1:]]
        self.assertEqual(sorted(body, key=lambda row: (row[0], row[1], row[4])),
                         body)
        for withheld in ("gate_score", "gate_decision", "reasons",
                         "display_rank", "display_page", "accepted",
                         "rejected", "visible"):
            self.assertNotIn(withheld, lines[0], withheld)

    def test_the_rejected_sample_can_be_switched_off(self):
        self.collect(external_clones(10) + rejected_clones(20),
                     extra=["--external-rejected-sample", "0"])
        report = json.loads(self.read("summary.json"))["external_review_export"]
        self.assertEqual(0, report["rejected_rows"])
        self.assertEqual(10, report["rejected_available"])

    def test_the_export_is_deterministic(self):
        first = None
        for _ in range(2):
            shutil.rmtree(self.output, ignore_errors=True)
            self.output = tempfile.mkdtemp(prefix="related-eval-display-")
            self.collect(external_clones(40),
                         extra=["--external-review-sample", "6"])
            text = self.read(related_eval.EXTERNAL_REVIEW_FILE)
            if first is None:
                first = text
            else:
                self.assertEqual(first, text)

    def test_the_export_is_a_protected_file_no_ai_pass_may_write(self):
        self.assertIn(related_eval.EXTERNAL_REVIEW_FILE,
                      related_eval.PROTECTED_FILES)
        for name in related_eval.AI_OUTPUT_FILES:
            self.assertNotEqual(related_eval.EXTERNAL_REVIEW_FILE, name)

    def test_no_secret_or_identity_reaches_the_external_export(self):
        with mock.patch.dict("os.environ",
                             {"QRESP_SEMANTIC_SCHOLAR_API_KEY": "s2-secret"}):
            self.collect(external_clones(12))
        blob = self.read(related_eval.EXTERNAL_REVIEW_FILE).lower()
        for leak in ("s2-secret", "x-api-key", "curator@example.com",
                     "rcc.uchicago", "files.example", "openaccesspdf",
                     "secret.pdf", "embedding", "citationcount", "homepage"):
            self.assertNotIn(leak, blob, leak)

    def test_an_existing_evaluation_directory_is_never_touched(self):
        # The tool writes only into --output-dir, so a previous run's ratings
        # cannot be overwritten by the next sweep.
        other = tempfile.mkdtemp(prefix="related-eval-previous-")
        self.addCleanup(shutil.rmtree, other, True)
        marker = os.path.join(other, "human-review.tsv")
        with io.open(marker, "w", encoding="utf-8") as handle:
            handle.write("do not touch")
        before = os.path.getmtime(marker)
        self.collect(external_clones(12))
        self.assertEqual(before, os.path.getmtime(marker))
        with io.open(marker, encoding="utf-8") as handle:
            self.assertEqual("do not touch", handle.read())


class TestExternalDisplayMetrics(unittest.TestCase):
    """Precision over the papers a reader actually sees, page by page."""

    def raw(self, count=10, source=None):
        source = source or related_eval.POOL_DEFAULT
        candidates = []
        for index in range(1, count + 1):
            candidates.append({
                "pair_id": "pair%02d" % index,
                "source": source,
                "title": "Candidate %d" % index,
                "gate_decision": "accepted",
                "in_top5": True,
                "visible": True,
                "display_rank": index,
                "display_page": ((index - 1) // 5) + 1,
            })
        # One the gate rejected: it is below the cut, so it is not visible.
        candidates.append({
            "pair_id": "pairREJ", "source": source, "title": "Rejected one",
            "gate_decision": "rejected", "in_top5": False, "visible": False,
            "display_rank": None, "display_page": None,
        })
        return [{"record_id": "id00", "internal": [],
                 "external": {source: candidates}}]

    def row(self, pair_id, title, rating):
        return {"pair_id": pair_id, "record_id": "id00",
                "record_title": "A record",
                "source": related_eval.POOL_DEFAULT,
                "candidate_title": title, "human_rating": rating,
                "human_note": "", "gate_decision": ""}

    def metrics(self, rows, records=None):
        records = records if records is not None else self.raw()
        return core.external_display_metrics(
            rows, records, related_eval.POOL_DEFAULT)

    def test_page_one_and_the_deeper_pages_are_reported_apart(self):
        rows = [self.row("pair%02d" % i, "Candidate %d" % i,
                         "related" if i <= 5 else "unrelated")
                for i in range(1, 11)]
        result = self.metrics(rows)
        self.assertEqual(1.0, result["page_1"]["precision_strict"])
        self.assertEqual(0.0, result["pages_2_to_5"]["precision_strict"])
        self.assertEqual(0.5, result["all_visible"]["precision_strict"])
        self.assertEqual(1.0, result["per_page"]["1"]["precision_strict"])
        self.assertEqual(0.0, result["per_page"]["2"]["precision_strict"])

    def test_partial_separates_strict_from_lenient(self):
        rows = [self.row("pair%02d" % i, "Candidate %d" % i,
                         "related" if i == 1 else "partial")
                for i in range(1, 6)]
        result = self.metrics(rows, self.raw(5))
        self.assertEqual(0.2, result["page_1"]["precision_strict"])
        self.assertEqual(1.0, result["page_1"]["precision_lenient"])

    # ------------------------------------------------ the visible universe

    def test_the_visible_universe_comes_from_raw_results_not_review_rows(self):
        # THE BUG. The review file named three of the ten displayed papers,
        # and the metrics reported a "visible" total of three -- so the
        # denominator was decided by how much of the sheet somebody had got
        # through, not by what the product displayed.
        rows = [self.row("pair01", "Candidate 1", "related"),
                self.row("pair02", "Candidate 2", ""),
                self.row("pair03", "Candidate 3", "")]
        result = self.metrics(rows)
        self.assertEqual(10, result["visible_candidates"])
        self.assertEqual(1, result["visible_candidates_rated"])
        self.assertEqual(9, result["visible_candidates_unrated"])
        self.assertEqual(3, result["review_rows"])
        # One rated candidate, rated related: 1.0, not 0.333 and not 0.1.
        self.assertEqual(1.0, result["all_visible"]["precision_strict"])
        self.assertEqual(1, result["all_visible"]["rated"])
        self.assertEqual(10, result["all_visible"]["candidates"])
        self.assertEqual(0.1, result["rating_coverage"])

    def test_more_review_rows_than_candidates_cannot_inflate_the_universe(self):
        # Two sheets, every page-1 result in both. The universe is still ten.
        rows = ([self.row("pair%02d" % i, "Candidate %d" % i, "related")
                 for i in range(1, 6)]
                + [self.row("pair%02d" % i, "Candidate %d" % i, "related")
                   for i in range(1, 6)])
        result = self.metrics(rows)
        self.assertEqual(10, len(rows))
        self.assertEqual(10, result["visible_candidates"])
        self.assertEqual(5, result["visible_candidates_rated"])
        self.assertEqual(5, result["duplicate_rows_collapsed"])

    # ------------------------------------------------- duplicate collapsing

    def test_the_same_candidate_in_two_sheets_is_counted_once(self):
        # A page-1 result is in human-review.tsv AND external-review.tsv.
        # Counted twice it doubled both halves of every fraction, and a
        # precision moved with how many sheets a reviewer was handed.
        once = [self.row("pair01", "Candidate 1", "related")]
        twice = once + [self.row("pair01", "Candidate 1", "related")]
        single, double = self.metrics(once), self.metrics(twice)
        self.assertEqual(1, single["visible_candidates_rated"])
        self.assertEqual(1, double["visible_candidates_rated"])
        self.assertEqual(single["all_visible"], double["all_visible"])
        self.assertEqual(single["page_1"], double["page_1"])
        self.assertEqual(0, single["duplicate_rows_collapsed"])
        self.assertEqual(1, double["duplicate_rows_collapsed"])

    def test_a_blank_row_never_overrides_a_rated_one(self):
        # The blind sheet is rated; the older sheet's copy is still empty.
        # A blank is an absence, not a vote -- in either order.
        blank_first = [self.row("pair01", "Candidate 1", ""),
                       self.row("pair01", "Candidate 1", "related")]
        rated_first = [self.row("pair01", "Candidate 1", "related"),
                       self.row("pair01", "Candidate 1", "")]
        for rows in (blank_first, rated_first):
            result = self.metrics(rows)
            self.assertEqual(1, result["visible_candidates_rated"])
            self.assertEqual(1, result["all_visible"]["related"])
            self.assertEqual(1.0, result["all_visible"]["precision_strict"])

    def test_conflicting_ratings_are_reported_and_never_resolved(self):
        rows = [self.row("pair01", "Candidate 1", "related"),
                self.row("pair01", "Candidate 1", "unrelated")]
        _ratings, report = core.collect_ratings(
            rows, core.candidate_index(self.raw()))
        self.assertEqual(1, len(report["conflicts"]))
        conflict = report["conflicts"][0]
        self.assertEqual("id00", conflict["record_id"])
        self.assertEqual(["related", "unrelated"], conflict["ratings"])

    def test_the_same_rating_twice_is_agreement_not_a_conflict(self):
        rows = [self.row("pair01", "Candidate 1", "partial"),
                self.row("pair01", "Candidate 1", "partial")]
        ratings, report = core.collect_ratings(
            rows, core.candidate_index(self.raw()))
        self.assertEqual([], report["conflicts"])
        self.assertEqual(["partial"], sorted(set(ratings.values())))

    # -------------------------------------------------------- gate errors

    def test_a_false_positive_is_a_visible_paper_rated_unrelated(self):
        rows = [self.row("pair01", "Candidate 1", "unrelated")]
        positives = self.metrics(rows)["false_positives"]
        self.assertTrue(positives["available"])
        self.assertEqual(1, positives["count"])
        self.assertEqual(1, positives["rated"])
        self.assertEqual(10, positives["visible_candidates"])

    def test_a_rated_rejected_candidate_is_a_sampled_false_negative(self):
        rows = [self.row("pair01", "Candidate 1", "unrelated"),
                self.row("pairREJ", "Rejected one", "related")]
        negatives = self.metrics(rows)["false_negatives_sampled"]
        self.assertTrue(negatives["available"])
        self.assertEqual(1, negatives["count"])
        self.assertEqual(1, negatives["strict_count"])
        self.assertEqual(1, negatives["sampled_candidates"])
        self.assertEqual(1, negatives["rated"])
        self.assertEqual(1, negatives["rejected_candidates_in_pool"])
        # A rejected candidate was never displayed, so it must not move a
        # page precision.
        result = self.metrics(rows)
        self.assertEqual(1, result["visible_candidates_rated"])
        self.assertEqual(0.0, result["page_1"]["precision_strict"])

    def test_no_rejected_candidate_rated_means_UNMEASURED_not_zero(self):
        # The trap this exists for: a sheet of visible candidates only can
        # never produce a false negative, and the resulting 0 is
        # indistinguishable in JSON from a measured 0.
        rows = [self.row("pair%02d" % i, "Candidate %d" % i, "related")
                for i in range(1, 6)]
        negatives = self.metrics(rows)["false_negatives_sampled"]
        self.assertFalse(negatives["available"])
        self.assertIsNone(negatives["count"])
        self.assertIsNone(negatives["strict_count"])
        self.assertIsNone(negatives["rating_coverage"])
        self.assertEqual(0, negatives["sampled_candidates"])
        # ...while still saying how many there were to sample from.
        self.assertEqual(1, negatives["rejected_candidates_in_pool"])

    def test_an_unrated_rejected_sample_is_also_unmeasured(self):
        rows = [self.row("pair01", "Candidate 1", "related"),
                self.row("pairREJ", "Rejected one", "")]
        negatives = self.metrics(rows)["false_negatives_sampled"]
        self.assertFalse(negatives["available"])
        self.assertIsNone(negatives["count"])
        # The denominator is known even though nothing was rated.
        self.assertEqual(1, negatives["sampled_candidates"])
        self.assertEqual(0, negatives["rated"])
        self.assertEqual(0.0, negatives["rating_coverage"])

    # ------------------------------------------- unmeasured is never zero

    def test_nothing_rated_gives_null_precision_not_zero(self):
        rows = [self.row("pair%02d" % i, "Candidate %d" % i, "")
                for i in range(1, 6)]
        result = self.metrics(rows)
        for key in ("all_visible", "page_1", "pages_2_to_5"):
            bucket = result[key]
            self.assertFalse(bucket["available"], key)
            self.assertIsNone(bucket["precision_strict"], key)
            self.assertIsNone(bucket["precision_lenient"], key)
            self.assertEqual(0, bucket["rated"], key)
        self.assertEqual(0, result["visible_candidates_rated"])
        self.assertFalse(result["false_positives"]["available"])
        self.assertIsNone(result["false_positives"]["count"])
        accepted = result["records_with_an_accepted_external_result"]
        self.assertFalse(accepted["available"])
        self.assertIsNone(accepted["records"])
        self.assertIsNone(accepted["ratio"])

    def test_a_measured_zero_is_still_a_zero(self):
        # The other half of the contract: an honest 0.0 must survive.
        rows = [self.row("pair%02d" % i, "Candidate %d" % i, "unrelated")
                for i in range(1, 6)]
        result = self.metrics(rows)
        self.assertTrue(result["page_1"]["available"])
        self.assertEqual(0.0, result["page_1"]["precision_strict"])
        self.assertEqual(0.0, result["page_1"]["precision_lenient"])

    def test_a_row_matching_no_single_candidate_is_reported_not_guessed(self):
        rows = [self.row("nope", "Not in the raw results", "related")]
        result = self.metrics(rows)
        self.assertEqual(1, result["rows_unmatched"])
        self.assertEqual(0, result["visible_candidates_rated"])

    def test_a_diagnostic_pool_is_excluded_from_the_production_figure(self):
        records = self.raw(5) + [{
            "record_id": "id01", "internal": [],
            "external": {related_eval.POOL_ALL_CS: [{
                "pair_id": "cs01", "source": related_eval.POOL_ALL_CS,
                "title": "A CS paper", "gate_decision": "accepted",
                "in_top5": True, "visible": True, "display_rank": 1,
                "display_page": 1}]}}]
        rows = [self.row("pair01", "Candidate 1", "related"),
                dict(self.row("cs01", "A CS paper", "unrelated"),
                     source=related_eval.POOL_ALL_CS, record_id="id01")]
        result = self.metrics(rows, records)
        # The all-cs candidate is neither in the universe nor in the numerator.
        self.assertEqual(5, result["visible_candidates"])
        self.assertEqual(1, result["visible_candidates_rated"])
        self.assertEqual(1.0, result["all_visible"]["precision_strict"])

    def test_records_with_an_accepted_external_result_are_counted(self):
        rows = [self.row("pair01", "Candidate 1", "related"),
                self.row("pair02", "Candidate 2", "unrelated")]
        result = self.metrics(rows)
        accepted = result["records_with_an_accepted_external_result"]
        self.assertTrue(accepted["available"])
        self.assertEqual(1, accepted["records"])
        self.assertEqual(1, accepted["records_with_a_visible_result"])
        self.assertEqual(1.0, accepted["ratio"])


class TestSummarizeReadsTheBlindSheet(unittest.TestCase):
    def setUp(self):
        self.output = tempfile.mkdtemp(prefix="related-eval-blind-")

    def tearDown(self):
        shutil.rmtree(self.output, ignore_errors=True)

    def write(self, name, text):
        with io.open(os.path.join(self.output, name), "w", encoding="utf-8",
                     newline="\n") as handle:
            handle.write(text)

    def test_the_blind_layout_is_read_back_and_scored(self):
        rows = [core.EXTERNAL_REVIEW_COLUMNS]
        for index in range(1, 7):
            rows.append(("pair%02d" % index, "id00", "A record",
                         related_eval.POOL_DEFAULT, "Candidate %d" % index,
                         "2022", "10.2000/x%d" % index,
                         "related" if index <= 5 else "unrelated", ""))
        self.write(related_eval.EXTERNAL_REVIEW_FILE, core.render_tsv(rows))
        candidates = [{
            "pair_id": "pair%02d" % index,
            "source": related_eval.POOL_DEFAULT,
            "title": "Candidate %d" % index, "gate_decision": "accepted",
            "in_top5": True, "visible": True, "display_rank": index,
            "display_page": ((index - 1) // 5) + 1} for index in range(1, 7)]
        self.write("raw-results.jsonl", json.dumps({
            "record_id": "id00", "internal": [],
            "external": {related_eval.POOL_DEFAULT: candidates}}) + "\n")

        code = related_eval.main(["summarize", "--output-dir", self.output])
        self.assertEqual(0, code)
        with io.open(os.path.join(self.output, "metrics.json"),
                     encoding="utf-8") as handle:
            metrics = json.load(handle)
        external = metrics["external_display"]
        self.assertEqual(6, external["visible_candidates_rated"])
        self.assertEqual(1.0, external["page_1"]["precision_strict"])
        self.assertEqual(0.0, external["pages_2_to_5"]["precision_strict"])
        # The blind sheet carries no verdict, so the gate decision has to be
        # recovered from the raw results before the false-positive count can
        # mean anything.
        self.assertTrue(external["false_positives"]["available"])
        self.assertEqual(1, external["false_positives"]["count"])

    def test_a_blind_sheet_alone_is_enough_to_summarize(self):
        # There need not be a human-review.tsv at all.
        self.write(related_eval.EXTERNAL_REVIEW_FILE,
                   core.render_tsv([core.EXTERNAL_REVIEW_COLUMNS,
                                    ("p1", "id00", "r",
                                     related_eval.POOL_DEFAULT, "c", "2020",
                                     "", "", "")]))
        self.assertEqual(
            0, related_eval.main(["summarize", "--output-dir", self.output]))

    # -------------------------------------------- the two sheets together

    def both_sheets(self, blind_rating, legacy_rating, visible=3):
        """The same page-1 candidate in BOTH review files."""
        candidates = [{
            "pair_id": "pair%02d" % index,
            "source": related_eval.POOL_DEFAULT,
            "title": "Candidate %d" % index, "gate_decision": "accepted",
            "in_top5": True, "visible": True, "display_rank": index,
            "display_page": 1} for index in range(1, visible + 1)]
        self.write("raw-results.jsonl", json.dumps({
            "record_id": "id00", "record_title": "A record", "internal": [],
            "external": {related_eval.POOL_DEFAULT: candidates}}) + "\n")
        self.write(related_eval.EXTERNAL_REVIEW_FILE, core.render_tsv([
            core.EXTERNAL_REVIEW_COLUMNS,
            ("pair01", "id00", "A record", related_eval.POOL_DEFAULT,
             "Candidate 1", "2022", "10.2000/x1", blind_rating, "")]))
        self.write("human-review.tsv", core.render_tsv([
            core.TSV_COLUMNS,
            ("pair01", "id00", "A record", related_eval.POOL_DEFAULT,
             "Candidate 1", "why", "9.0", "accepted", legacy_rating, "")]))

    def metrics_file(self):
        with io.open(os.path.join(self.output, "metrics.json"),
                     encoding="utf-8") as handle:
            return json.load(handle)

    def test_one_candidate_in_two_sheets_is_one_rating(self):
        self.both_sheets("related", "related")
        self.assertEqual(
            0, related_eval.main(["summarize", "--output-dir", self.output]))
        external = self.metrics_file()["external_display"]
        self.assertEqual(2, external["review_rows"])
        self.assertEqual(1, external["duplicate_rows_collapsed"])
        # Three candidates were displayed and one of them was rated.
        self.assertEqual(3, external["visible_candidates"])
        self.assertEqual(1, external["visible_candidates_rated"])
        self.assertEqual(1, external["all_visible"]["rated"])
        self.assertEqual(1.0, external["all_visible"]["precision_strict"])

    def test_a_blank_copy_beside_a_rated_one_does_not_dilute_anything(self):
        self.both_sheets("related", "")
        self.assertEqual(
            0, related_eval.main(["summarize", "--output-dir", self.output]))
        external = self.metrics_file()["external_display"]
        self.assertEqual(1, external["visible_candidates_rated"])
        self.assertEqual(1.0, external["all_visible"]["precision_strict"])

    def test_two_sheets_disagreeing_stops_the_run(self):
        self.both_sheets("related", "unrelated")
        code = related_eval.main(["summarize", "--output-dir", self.output])
        self.assertEqual(3, code)
        # ...and nothing was written on the strength of a guess.
        self.assertFalse(os.path.isfile(
            os.path.join(self.output, "metrics.json")))

    def test_an_all_unrated_run_reports_null_not_zero(self):
        self.both_sheets("", "")
        self.assertEqual(
            0, related_eval.main(["summarize", "--output-dir", self.output]))
        metrics = self.metrics_file()
        external = metrics["external_display"]
        self.assertFalse(external["all_visible"]["available"])
        self.assertIsNone(external["all_visible"]["precision_strict"])
        self.assertIsNone(external["all_visible"]["precision_lenient"])
        self.assertIsNone(external["page_1"]["precision_strict"])
        self.assertFalse(external["false_negatives_sampled"]["available"])
        self.assertIsNone(external["false_negatives_sampled"]["count"])
        # The whole-file metric makes the same promise.
        self.assertFalse(metrics["precision_at_5_available"])
        self.assertIsNone(metrics["precision_at_5"])


if __name__ == "__main__":
    unittest.main()
