"""Benchmarks for the keyword AI and the RCC description AI.

Nothing here reaches a network: the Qresp reader is stubbed and
`assist.call_gemini` is either replaced by a fake or by the refusing
stand-in the CLI installs itself.

The properties that make these benchmarks worth anything at all:

* the record being scored cannot see its own answer -- not through the
  vocabulary and not through the payload; and
* an RCC candidate is compared with a human artifact only when the two are
  the same file, established by exact path.
"""
import io
import json
import os
import re
import shutil
import tempfile
import unittest
from unittest import mock

from project import assist
from project import curation
from project import evidence as ev
from project.tools import assist_core as core
from project.tools import assist_eval


# ---------------------------------------------------------------- fixtures

def search_row(index, title, abstract, tags, collections=("MICCOM",)):
    """The LEGACY /api/search shape, name-mangled keys and all."""
    return {
        "_Search__id": "rec%02d" % index,
        "_Search__title": title,
        "_Search__abstract": abstract,
        "_Search__doi": "10.1000/rec%02d" % index,
        "_Search__tags": list(tags),
        "_Search__collections": list(collections),
        "_Search__publication": "Journal of Placeholder Science 1, 1-2",
        "_Search__year": 2021,
        "_Search__fileServerPath": "https://notebook.rcc.uchicago.edu/x%02d"
                                   % index,
        # Present in the real payload; must never reach a payload or a file.
        "_Search__downloadPath": "https://internal.example.org/download",
        "_Search__notebookPath": "notebooks/private.ipynb",
    }


DETAILS = {
    "charts": [{"id": "c0", "caption": "Absorption spectrum of the film",
                "properties": ["absorption", "thin film"],
                "imageFile": "charts/figure1/figure1.png",
                "files": ["charts/figure1/figure1.csv"]}],
    "datasets": [{"id": "d0", "readme": "Raw diffraction patterns",
                  "keywords": ["diffraction"],
                  "files": ["datasets/xrd/patterns.dat"]}],
    "scripts": [{"id": "s0", "readme": "Fits the diffraction peaks",
                 "keywords": ["peak fitting"],
                 "files": ["scripts/fit/fit_peaks.py"]}],
    # The REAL wire shape: schema.json and every published record use
    # `description` and `facilityName` for a Tool (models.py declares
    # `readme`/`facilityname`, which only legacy documents carry).
    "tools": [{"id": "t0", "packageName": "RarePackage",
               "description": "Simulates the lattice",
               "facilityName": "Beamline 12", "measurement": "diffraction",
               "files": ["tools/rarepackage/manifest.txt"]}],
    # Curator identity, present in the real details payload.
    "firstName": "Curator", "lastName": "Person",
    "emailId": "curator@example.com",
    "fileServerPath": "https://notebook.rcc.uchicago.edu/secret",
}


def benchmark_record(index=0, tags=("perovskite", "thin film"),
                     with_artifacts=True, with_rcc=True):
    row = search_row(index, "Absorption in perovskite thin films",
                     "We measure optical absorption in perovskite thin "
                     "films grown by spin coating and relate it to the "
                     "diffraction patterns of the same samples.", tags)
    record = core.to_benchmark_record(row, DETAILS if with_artifacts else {})
    record["rcc_candidates"] = [
        {"id": "cand-chart", "kind": "chart", "name": "figure1",
         "paths": ["charts/figure1/figure1.png"], "context": ""},
        {"id": "cand-dataset", "kind": "dataset", "name": "xrd",
         "paths": ["datasets/xrd/patterns.dat"],
         "context": "README: raw powder diffraction patterns collected at "
                    "room temperature."},
        {"id": "cand-script", "kind": "script", "name": "fit",
         "paths": ["scripts/fit/fit_peaks.py"],
         "context": "docstring: fits Gaussian peaks to a diffractogram."},
        {"id": "cand-tool", "kind": "tool", "name": "rarepackage",
         "paths": ["tools/rarepackage/manifest.txt"],
         "context": "manifest: rarepackage lattice simulation library."},
    ] if with_rcc else []
    return record


def corpus(count=6):
    records = []
    topics = [("perovskite", "thin film"), ("graphene", "transport"),
              ("spin defect", "silicon carbide"), ("water", "interface"),
              ("perovskite", "photovoltaics"), ("catalysis", "surface")]
    for i in range(count):
        records.append(benchmark_record(i, tags=topics[i % len(topics)]))
    return records


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        if self._payload is None:
            raise ValueError("not json")
        return self._payload


class FakeQrespSession:
    def __init__(self, rows, details=None):
        self.rows = rows
        self.details = details if details is not None else DETAILS
        self.calls = []

    def get(self, url, timeout=None, verify=True):
        self.calls.append(url)
        if url.endswith("/api/search"):
            return FakeResponse(self.rows)
        if "/api/paper/" in url:
            return FakeResponse(dict(self.details))
        return FakeResponse({}, 404)


class FakeGemini:
    """Stands in for assist.call_gemini. Records every payload it is given."""

    def __init__(self, answers=None, error=None):
        self.payloads = []
        self.prompts = []
        self.answers = list(answers or [])
        self.error = error

    def __call__(self, cfg, payload, system_prompt, schema,
                 max_output_tokens=None):
        self.payloads.append(payload)
        self.prompts.append(system_prompt)
        if self.error:
            return None, self.error
        if self.answers:
            return self.answers.pop(0), None
        return json.dumps({"keywords": [{"keyword": "perovskite",
                                         "reason": "the abstract says so"}]}), None


CONFIGURED = {"QRESP_GEMINI_ENABLED": "1",
              "QRESP_GEMINI_API_KEY": "test-gemini-secret"}


# ------------------------------------------------------------ normalization

class TestNormalization(unittest.TestCase):
    def test_legacy_search_keys_are_understood(self):
        record = core.normalize_search_record(
            search_row(1, "A title", "An abstract", ["alpha", "beta"]))
        self.assertEqual("rec01", record["id"])
        self.assertEqual("A title", record["title"])
        self.assertEqual(["alpha", "beta"], record["tags"])
        self.assertEqual(2021, record["year"])

    def test_plain_keys_are_understood_too(self):
        record = core.normalize_search_record({
            "id": "abc", "title": "T", "abstract": "A", "doi": "10.1/x",
            "tags": ["alpha"], "year": "2019"})
        self.assertEqual("abc", record["id"])
        self.assertEqual(2019, record["year"])

    def test_curator_identity_and_paths_never_enter_a_record(self):
        record = benchmark_record()
        blob = json.dumps(record).lower()
        for leak in ("curator@example.com", "downloadpath", "firstname",
                     "lastname", "emailid"):
            self.assertNotIn(leak, blob, leak)

    def test_the_model_field_names_are_read_not_the_ai_ones(self):
        # Dataset/script descriptions are stored as `readme`.
        record = benchmark_record()
        dataset = record["artifacts"]["datasets"][0]
        self.assertEqual("readme", dataset["human_description_field"])
        self.assertEqual("Raw diffraction patterns",
                         dataset["human_description"])
        chart = record["artifacts"]["charts"][0]
        self.assertEqual("caption", chart["human_description_field"])


class TestToolWireShape(unittest.TestCase):
    """Where a Tool's human description actually lives.

    Traced, not guessed: models.py declares `readme`/`facilityname`, but
    schema.json and every published record (project/tests/data.json) carry
    `description`/`facilityName`, and `Tools` is a DynamicEmbeddedDocument
    with strict=False so what was submitted is what comes back out of
    /api/paper/{id}. Reading only `readme` reported described tools as
    undescribed.
    """

    def tool_from(self, entry):
        record = core.to_benchmark_record(
            search_row(0, "T", "A", ["x"]), {"tools": [entry]})
        return record["artifacts"]["tools"][0]

    def test_the_canonical_description_field_is_read(self):
        item = self.tool_from({"id": "t0", "packageName": "West",
                               "description": "Modified west code",
                               "facilityName": "APS",
                               "measurement": "X-ray"})
        self.assertEqual("Modified west code", item["human_description"])
        self.assertEqual("description", item["human_description_field"])
        self.assertEqual("APS", item["facility_name"])

    def test_a_legacy_record_falls_back_to_readme_and_facilityname(self):
        item = self.tool_from({"id": "t0", "readme": "Legacy text",
                               "facilityname": "Old beamline"})
        self.assertEqual("Legacy text", item["human_description"])
        self.assertEqual("readme", item["human_description_field"])
        self.assertEqual("Old beamline", item["facility_name"])

    def test_the_canonical_field_wins_when_both_are_present(self):
        item = self.tool_from({"id": "t0", "description": "Canonical",
                               "readme": "Legacy",
                               "facilityName": "New", "facilityname": "Old"})
        self.assertEqual("Canonical", item["human_description"])
        self.assertEqual("New", item["facility_name"])

    def test_a_real_published_record_is_read_correctly(self):
        """The actual /api/paper/{id} shape, straight from the repository's
        own published-record fixture."""
        location = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "data.json")
        with io.open(location, encoding="utf-8") as handle:
            published = json.load(handle)
        record = core.to_benchmark_record(
            {"_Search__id": "real", "_Search__title": "T",
             "_Search__tags": ["x"]}, published)
        tools = record["artifacts"]["tools"]
        self.assertEqual(2, len(tools))
        software = tools[0]
        self.assertEqual("Modified west code", software["human_description"])
        self.assertEqual("West", software["package_name"])
        self.assertEqual([], software["human_keywords"])   # Tools hold none
        experiment = tools[1]
        self.assertEqual("APS", experiment["facility_name"])
        self.assertEqual("X-ray", experiment["measurement"])
        # ...and the dataset/script/chart fields of the same record.
        self.assertEqual("DAT files",
                         record["artifacts"]["datasets"][0][
                             "human_description"])
        self.assertEqual("chart 1",
                         record["artifacts"]["charts"][0]["human_description"])


class TestKeywordAllowlistParity(unittest.TestCase):
    """The backend allowlist and the frontend's canonical field list must
    agree, or values silently stop travelling again."""

    FRONTEND = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(
            os.path.abspath(__file__))))),
        "frontend", "components", "CuratorElements", "KeywordAssist.js")

    def frontend_fields(self):
        with io.open(self.FRONTEND, encoding="utf-8") as handle:
            source = handle.read()
        block = re.search(r"const ARTIFACT_FIELDS = \{(.*?)\};", source,
                          re.DOTALL).group(1)
        fields = {}
        for kind, body in re.findall(r"(\w+):\s*\[(.*?)\]", block, re.DOTALL):
            fields[kind] = re.findall(r'"([^"]+)"', body)
        return fields

    def test_every_field_the_browser_sends_is_accepted_by_the_backend(self):
        for kind, names in self.frontend_fields().items():
            accepted = set()
            for aliases in assist.CONTEXT_FIELDS[kind].values():
                accepted.update(aliases)
            for name in names:
                self.assertIn(name, accepted,
                              "%s.%s is sent but not accepted" % (kind, name))

    def test_the_browser_sends_the_canonical_name_for_each_payload_field(self):
        # Not merely an accepted alias -- the FIRST one, which is canonical.
        for kind, names in self.frontend_fields().items():
            for field, aliases in assist.CONTEXT_FIELDS[kind].items():
                self.assertIn(aliases[0], names,
                              "%s should send canonical %r for %r"
                              % (kind, aliases[0], field))

    def test_the_browser_sends_no_path_file_or_account_field(self):
        for kind, names in self.frontend_fields().items():
            for name in names:
                self.assertNotIn(name.lower(), (
                    "files", "urls", "imagefile", "notebookfile", "path",
                    "paths", "fileserverpath", "downloadpath", "emailid",
                    "owner", "id"), "%s.%s" % (kind, name))


class TestBackendAllowlistResolution(unittest.TestCase):
    """The backend resolves aliases itself and never trusts the client."""

    def test_canonical_names_are_read(self):
        context = assist._reviewed_context({
            "datasets": [{"readme": "Raw patterns", "keywords": ["xrd"]}],
            "scripts": [{"readme": "Fits peaks"}],
            "tools": [{"packageName": "West", "description": "West code",
                       "facilityName": "APS", "measurement": "X-ray"}],
            "charts": [{"caption": "A spectrum", "properties": ["abs"]}],
        })
        self.assertEqual("Raw patterns", context["datasets"][0]["description"])
        self.assertEqual("Fits peaks", context["scripts"][0]["description"])
        self.assertEqual("West code", context["tools"][0]["description"])
        self.assertEqual("APS", context["tools"][0]["facility"])
        self.assertEqual("A spectrum", context["charts"][0]["caption"])

    def test_legacy_aliases_still_work(self):
        context = assist._reviewed_context({
            "datasets": [{"description": "Legacy dataset text"}],
            "tools": [{"readme": "Legacy tool text",
                       "facilityname": "Legacy beamline"}],
        })
        self.assertEqual("Legacy dataset text",
                         context["datasets"][0]["description"])
        self.assertEqual("Legacy tool text",
                         context["tools"][0]["description"])
        self.assertEqual("Legacy beamline", context["tools"][0]["facility"])

    def test_the_canonical_value_wins_over_a_legacy_one(self):
        context = assist._reviewed_context({
            "datasets": [{"readme": "Canonical", "description": "Legacy"}],
            "tools": [{"description": "Canonical tool", "readme": "Legacy",
                       "facilityName": "New", "facilityname": "Old"}],
        })
        self.assertEqual("Canonical", context["datasets"][0]["description"])
        self.assertEqual("Canonical tool", context["tools"][0]["description"])
        self.assertEqual("New", context["tools"][0]["facility"])

    def test_the_same_text_is_never_sent_twice(self):
        context = assist._reviewed_context({
            "tools": [{"description": "Same words", "readme": "Same words"}]})
        values = list(context["tools"][0].values())
        self.assertEqual(len(values), len(set(values)))

    def test_fields_outside_the_allowlist_are_dropped(self):
        context = assist._reviewed_context({
            "datasets": [{"readme": "Text", "files": ["secret/a.dat"],
                          "URLs": ["https://internal.example.org"],
                          "id": "d0", "owner_email": "a@b.org"}],
            "charts": [{"caption": "C", "imageFile": "charts/secret.png",
                        "notebookFile": "nb.ipynb"}],
        })
        blob = json.dumps(context)
        for leak in ("secret", "https://", "d0", "a@b.org", "ipynb",
                     "imageFile", "files", "URLs"):
            self.assertNotIn(leak, blob, leak)


# ----------------------------------------------------------- leakage guards

class TestKeywordLeakage(unittest.TestCase):
    def test_the_target_records_tags_are_held_out_of_the_vocabulary(self):
        records = corpus(6)
        target = records[0]                      # perovskite, thin film
        display, known = core.build_vocabulary(
            records, exclude_record_id=target["record_id"])
        # "thin film" belongs to this record alone -> gone.
        self.assertNotIn("thin film", known)
        self.assertNotIn("thin film", [d.lower() for d in display])

    def test_a_tag_another_record_also_uses_stays_in_the_vocabulary(self):
        records = corpus(6)
        target = records[0]                      # perovskite, thin film
        # rec04 also carries "perovskite".
        _, known = core.build_vocabulary(
            records, exclude_record_id=target["record_id"])
        self.assertIn("perovskite", known)

    def test_without_the_holdout_the_answer_would_be_in_the_vocabulary(self):
        records = corpus(6)
        _, known = core.build_vocabulary(records)
        self.assertIn("thin film", known)        # the leak this prevents

    def test_no_held_out_tag_appears_in_any_payload(self):
        records = corpus(6)
        target = records[0]
        vocabulary, _ = core.build_vocabulary(
            records, exclude_record_id=target["record_id"])
        for mode in core.KEYWORD_MODES:
            payload = core.build_keyword_payload(target, mode, vocabulary)
            self.assertTrue(
                core.payload_hides_reference_tags(
                    payload, ["thin film"]), mode)

    def test_the_leak_check_catches_a_tag_in_the_vocabulary(self):
        payload = {"publication": {"title": "T"},
                   "qresp_vocabulary": ["graphene", "thin film"]}
        self.assertFalse(
            core.payload_hides_reference_tags(payload, ["thin film"]))
        self.assertTrue(
            core.payload_hides_reference_tags(payload, ["perovskite"]))

    def test_a_tag_another_record_shares_may_stay_in_the_vocabulary(self):
        # rec00 and rec04 both carry "perovskite": it is genuinely part of
        # the site vocabulary and removing it would model a Qresp that does
        # not exist. Only a term this record ALONE owns is a leak.
        records = corpus(6)
        target = records[0]
        exclusive = core.exclusive_tags(target, records)
        self.assertIn("thin film", exclusive)
        self.assertNotIn("perovskite", exclusive)
        payload = {"publication": {"title": "T"},
                   "qresp_vocabulary": ["perovskite"]}
        self.assertEqual([], core.payload_leaks(
            payload, target["reference_tags"], exclusive))

    def test_the_leak_check_catches_a_tag_in_an_artifact_keyword_list(self):
        payload = {"publication": {"title": "T"},
                   "reviewed_artifacts": {
                       "charts": [{"properties": "absorption, thin film"}]}}
        self.assertFalse(
            core.payload_hides_reference_tags(payload, ["thin film"]))

    def test_the_papers_own_title_and_abstract_are_not_leakage(self):
        # A tag readable from the abstract is what the feature is FOR.
        # Treating it as leakage would leave only papers nobody could tag.
        payload = {"publication": {
            "title": "Absorption in perovskite thin films",
            "abstract": "We measure thin film absorption."}}
        self.assertTrue(
            core.payload_hides_reference_tags(payload, ["thin film"]))

    def test_a_stray_tags_field_is_caught(self):
        payload = {"publication": {"title": "T"}, "tags": ["thin film"]}
        self.assertFalse(
            core.payload_hides_reference_tags(payload, ["thin film"]))

    def test_an_artifact_keyword_repeating_a_held_out_tag_is_withheld(self):
        # The chart carries "thin film" in `properties`, and so does the
        # paper's hidden tags. It must not travel.
        record = benchmark_record(tags=["perovskite", "thin film"])
        payload = core.build_keyword_payload(
            record, core.MODE_WITH_ARTIFACTS, [])
        properties = payload["reviewed_artifacts"]["charts"][0].get(
            "properties", "")
        self.assertIn("absorption", properties)
        self.assertNotIn("thin film", properties)
        self.assertEqual(1, core.count_hidden_artifact_keywords(record))


class TestKeywordModes(unittest.TestCase):
    def test_publication_only_carries_no_artifacts(self):
        record = benchmark_record()
        payload = core.build_keyword_payload(
            record, core.MODE_PUBLICATION_ONLY, ["perovskite"])
        self.assertIn("publication", payload)
        self.assertNotIn("reviewed_artifacts", payload)

    def test_the_artifacts_mode_adds_the_products_allowlisted_context(self):
        record = benchmark_record()
        payload = core.build_keyword_payload(
            record, core.MODE_WITH_ARTIFACTS, ["perovskite"])
        self.assertIn("reviewed_artifacts", payload)
        self.assertIn("charts", payload["reviewed_artifacts"])
        # Only the product's CONTEXT_FIELDS keys survive.
        for kind, entries in payload["reviewed_artifacts"].items():
            allowed = set(assist.CONTEXT_FIELDS[kind])
            for entry in entries:
                self.assertTrue(set(entry) <= allowed, (kind, set(entry)))

    def test_no_path_or_file_name_reaches_the_keyword_payload(self):
        record = benchmark_record()
        payload = core.build_keyword_payload(
            record, core.MODE_WITH_ARTIFACTS, ["perovskite"])
        blob = json.dumps(payload).lower()
        for leak in ("figure1.png", "patterns.dat", "fit_peaks.py",
                     "rcc.uchicago", "://", "manifest.txt"):
            self.assertNotIn(leak, blob, leak)

    def test_every_stored_description_now_reaches_the_model(self):
        # This is the regression the field-name fix closes. Computed by
        # actually pushing the record through the product's own reducer, not
        # by asserting zero.
        gaps = core.keyword_context_gaps([benchmark_record()])
        self.assertTrue(gaps)
        for field, counts in gaps.items():
            self.assertEqual(0, counts["lost"], "%s: %s" % (field, counts))
            self.assertEqual(counts["stored"], counts["reaches_ai"], field)

    def test_the_dataset_description_and_tool_facility_actually_travel(self):
        record = benchmark_record()
        payload = core.build_keyword_payload(
            record, core.MODE_WITH_ARTIFACTS, [])
        artifacts = payload["reviewed_artifacts"]
        self.assertEqual("Raw diffraction patterns",
                         artifacts["datasets"][0]["description"])
        self.assertEqual("Fits the diffraction peaks",
                         artifacts["scripts"][0]["description"])
        self.assertEqual("Simulates the lattice",
                         artifacts["tools"][0]["description"])
        self.assertEqual("Beamline 12", artifacts["tools"][0]["facility"])
        self.assertEqual("Absorption spectrum of the film",
                         artifacts["charts"][0]["caption"])


# ------------------------------------------------------------ path matching

class TestContextGapAccounting(unittest.TestCase):
    """Text sent once under another name is not text that was lost.

    On the real 64-record corpus this reported `charts.keywords LOST=16`.
    All 16 were charts whose Figure Caption and Keywords were the SAME
    string, which `_reviewed_context` deliberately sends once. Nothing was
    missing; the accounting was.
    """

    def chart_record(self, caption, keywords, record_id="rec00"):
        return {
            "record_id": record_id,
            "artifacts": {"charts": [{
                "kind": "charts", "id": "c0",
                "human_description": caption,
                "human_description_field": "caption",
                "human_keywords": list(keywords),
                "human_keyword_field": "properties",
                "files": [], "image_file": "", "notebook_file": "",
                "package_name": "", "facility_name": "", "measurement": ""}],
                "datasets": [], "scripts": [], "tools": []},
        }

    def test_identical_caption_and_keywords_are_deduplicated_not_lost(self):
        record = self.chart_record("band gap", ["band gap"])
        # The product really does send it once -- checked directly.
        context = assist._reviewed_context(
            {"charts": [{"caption": "band gap", "properties": "band gap"}]})
        values = list(context["charts"][0].values())
        self.assertEqual(1, len(values))

        gaps = core.keyword_context_gaps([record])
        entry = gaps["charts.keywords"]
        self.assertEqual(1, entry["stored"])
        self.assertEqual(0, entry["reaches_ai"])
        self.assertEqual(1, entry["deduplicated_same_text"])
        self.assertEqual(0, entry["true_lost"])
        self.assertEqual(entry["true_lost"], entry["lost"])

    def test_the_observed_sixteen_shaped_fixture(self):
        # 645 stored, 629 delivered, 16 identical to their caption.
        records = []
        for index in range(20):
            records.append(self.chart_record(
                "caption %d" % index, ["keyword %d" % index],
                record_id="distinct%d" % index))
        for index in range(16):
            same = "identical text %d" % index
            records.append(self.chart_record(same, [same],
                                             record_id="same%d" % index))
        gaps = core.keyword_context_gaps(records)
        entry = gaps["charts.keywords"]
        self.assertEqual(36, entry["stored"])
        self.assertEqual(20, entry["reaches_ai"])
        self.assertEqual(16, entry["deduplicated_same_text"])
        self.assertEqual(0, entry["true_lost"])

    def test_a_case_only_difference_is_not_a_duplicate(self):
        # The product compares strings; "Band Gap" and "band gap" are two.
        record = self.chart_record("Band Gap", ["band gap"])
        gaps = core.keyword_context_gaps([record])
        entry = gaps["charts.keywords"]
        self.assertEqual(1, entry["reaches_ai"])
        self.assertEqual(0, entry["deduplicated_same_text"])
        self.assertEqual(0, entry["true_lost"])

    def test_whitespace_is_normalized_the_way_the_product_normalizes_it(self):
        record = self.chart_record("band   gap", ["band gap"])
        gaps = core.keyword_context_gaps([record])
        self.assertEqual(1, gaps["charts.keywords"][
            "deduplicated_same_text"])

    def test_text_that_reaches_nothing_at_all_is_true_lost(self):
        # A field the allowlist genuinely cannot read: simulated by removing
        # its payload field, so nothing carries the value.
        record = self.chart_record("A caption", ["a keyword"])
        with mock.patch.dict(assist.CONTEXT_FIELDS["charts"], clear=True,
                             values={"caption": ("caption",)}):
            gaps = core.keyword_context_gaps([record])
        entry = gaps["charts.keywords"]
        self.assertEqual(1, entry["stored"])
        self.assertEqual(0, entry["reaches_ai"])
        self.assertEqual(0, entry["deduplicated_same_text"])
        self.assertEqual(1, entry["true_lost"])

    def test_the_healthy_corpus_reports_no_true_loss(self):
        gaps = core.keyword_context_gaps([benchmark_record()])
        for field, counts in gaps.items():
            self.assertEqual(0, counts["true_lost"], field)


class TestCandidateMatching(unittest.TestCase):
    def test_an_exact_relative_path_matches(self):
        record = benchmark_record()
        candidate = record["rcc_candidates"][1]           # dataset
        artifact, reason = core.match_candidate(candidate, record)
        self.assertEqual(core.MATCH_EXACT_PATH, reason)
        self.assertEqual("Raw diffraction patterns",
                         artifact["human_description"])

    def test_windows_separators_and_dot_slash_are_normalized(self):
        # A backslash is a spelling of the same separator, and `./` and
        # duplicate slashes name the same file. Case is NOT touched.
        record = benchmark_record()
        candidate = dict(record["rcc_candidates"][1],
                         paths=[".\\datasets\\\\xrd/patterns.dat"])
        artifact, reason = core.match_candidate(candidate, record)
        self.assertEqual(core.MATCH_EXACT_PATH, reason)
        self.assertIsNotNone(artifact)

    def test_a_casing_only_difference_is_refused_not_matched(self):
        # RCC serves Linux paths: Patterns.dat and patterns.dat are two
        # different files. Matching them would score a description against
        # the wrong one and never show a symptom.
        record = benchmark_record()
        candidate = dict(record["rcc_candidates"][1],
                         paths=["Datasets/XRD/Patterns.dat"])
        artifact, reason = core.match_candidate(candidate, record)
        self.assertIsNone(artifact)
        self.assertEqual(core.UNMATCHED_CASE_MISMATCH, reason)

    def test_two_files_differing_only_in_case_are_never_confused(self):
        record = benchmark_record()
        record["artifacts"]["charts"] = [
            {"kind": "charts", "id": "cUpper", "human_description": "UPPER A",
             "human_description_field": "caption", "human_keywords": [],
             "human_keyword_field": "properties", "files": [],
             "image_file": "charts/A.png", "notebook_file": "",
             "package_name": "", "facility_name": "", "measurement": ""},
            {"kind": "charts", "id": "cLower", "human_description": "lower a",
             "human_description_field": "caption", "human_keywords": [],
             "human_keyword_field": "properties", "files": [],
             "image_file": "charts/a.png", "notebook_file": "",
             "package_name": "", "facility_name": "", "measurement": ""},
        ]
        upper, reason = core.match_candidate(
            {"id": "x", "kind": "chart", "paths": ["charts/A.png"]}, record)
        self.assertEqual(core.MATCH_EXACT_PATH, reason)
        self.assertEqual("UPPER A", upper["human_description"])

        lower, reason = core.match_candidate(
            {"id": "y", "kind": "chart", "paths": ["charts/a.png"]}, record)
        self.assertEqual(core.MATCH_EXACT_PATH, reason)
        self.assertEqual("lower a", lower["human_description"])

    def test_unusable_path_shapes_are_refused_with_their_own_reason(self):
        record = benchmark_record()
        cases = {
            "https://notebook.rcc.uchicago.edu/x/patterns.dat":
                core.REJECT_URL,
            "/absolute/datasets/xrd/patterns.dat": core.REJECT_ABSOLUTE,
            "C:\\data\\patterns.dat": core.REJECT_ABSOLUTE,
            "../datasets/xrd/patterns.dat": core.REJECT_TRAVERSAL,
            "datasets/xrd/patterns.dat?v=2": core.REJECT_QUERY,
            "datasets/xrd/patterns.dat#top": core.REJECT_QUERY,
            "datasets/xrd%2Fpatterns.dat": core.REJECT_PERCENT,
        }
        for path, expected in cases.items():
            self.assertEqual(expected, core.path_rejection(path), path)
            artifact, reason = core.match_candidate(
                {"id": "x", "kind": "dataset", "paths": [path]}, record)
            self.assertIsNone(artifact, path)
            self.assertEqual(expected, reason, path)
            self.assertEqual("", core.normalize_relative_path(path), path)

    def test_a_similar_basename_is_refused_not_guessed(self):
        record = benchmark_record()
        candidate = dict(record["rcc_candidates"][1],
                         paths=["other/place/patterns.dat"])
        artifact, reason = core.match_candidate(candidate, record)
        self.assertIsNone(artifact)
        self.assertEqual(core.UNMATCHED_NOT_FOUND, reason)

    def test_a_similar_title_is_not_a_match(self):
        record = benchmark_record()
        candidate = {"id": "x", "kind": "dataset",
                     "name": "Raw diffraction patterns", "paths": [],
                     "context": ""}
        artifact, reason = core.match_candidate(candidate, record)
        self.assertIsNone(artifact)
        self.assertEqual(core.UNMATCHED_NO_PATH, reason)

    def test_a_path_matching_two_artifacts_is_ambiguous_not_arbitrary(self):
        record = benchmark_record()
        record["artifacts"]["datasets"].append({
            "kind": "datasets", "id": "d1",
            "human_description": "A different dataset",
            "human_description_field": "readme", "human_keywords": [],
            "human_keyword_field": "keywords",
            "files": ["datasets/xrd/patterns.dat"], "image_file": "",
            "notebook_file": "", "package_name": "", "facility_name": "",
            "measurement": ""})
        artifact, reason = core.match_candidate(
            record["rcc_candidates"][1], record)
        self.assertIsNone(artifact)
        self.assertEqual(core.UNMATCHED_AMBIGUOUS, reason)

    def test_a_candidate_of_another_kind_never_matches(self):
        record = benchmark_record()
        candidate = dict(record["rcc_candidates"][1], kind="chart")
        artifact, reason = core.match_candidate(candidate, record)
        self.assertIsNone(artifact)
        self.assertEqual(core.UNMATCHED_NOT_FOUND, reason)

    def test_chart_images_and_notebooks_are_match_keys_too(self):
        record = benchmark_record()
        artifact, reason = core.match_candidate(
            record["rcc_candidates"][0], record)
        self.assertEqual(core.MATCH_EXACT_PATH, reason)
        self.assertEqual("Absorption spectrum of the film",
                         artifact["human_description"])


# --------------------------------------------------------- artifact payload

class TestArtifactPayload(unittest.TestCase):
    def payload_for(self, index):
        record = benchmark_record()
        candidate = record["rcc_candidates"][index]
        artifact, _ = core.match_candidate(candidate, record)
        return core.build_artifact_payload(candidate, artifact), artifact

    def test_the_human_answer_is_stripped_from_the_evidence(self):
        record = benchmark_record()
        candidate = dict(record["rcc_candidates"][1], sources=[
            {"type": "readme", "path": "datasets/x/README.md",
             "excerpt": "README: Raw diffraction patterns and more."}])
        artifact, _ = core.match_candidate(candidate, record)
        payload = core.build_artifact_payload(candidate, artifact,
                                              record=record)
        self.assertNotIn("raw diffraction patterns",
                         json.dumps(payload).lower())
        # ...and the leak gate agrees, on the FINAL payload.
        self.assertEqual([], core.payload_leaks_the_answer(payload, artifact))

    def test_the_leak_gate_catches_an_answer_that_survives(self):
        record = benchmark_record()
        artifact, _ = core.match_candidate(record["rcc_candidates"][1],
                                           record)
        leaking = {"paper_context": {},
                   "artifact": {"name": "x"},
                   "sources": [{"type": "readme", "path": "a/README.md",
                                "excerpt": artifact["human_description"]}]}
        self.assertTrue(core.payload_leaks_the_answer(leaking, artifact))

    def test_the_payload_uses_the_products_own_sanitizer(self):
        payload, _ = self.payload_for(1)
        self.assertEqual(["artifact", "paper_context", "sources"],
                         sorted(payload))
        self.assertEqual(sorted(curation.AI_ALLOWED_KEYS),
                         sorted(set(payload["artifact"])
                                | {"inventory", "sources"}))

    def test_wants_keywords_follows_the_record_type(self):
        for index, kind, expected in ((0, "chart", True), (1, "dataset", True),
                                      (2, "script", True), (3, "tool", False)):
            payload, _ = self.payload_for(index)
            self.assertEqual(kind, payload["artifact"]["kind"])
            self.assertEqual(expected,
                             payload["artifact"]["wants_keywords"], kind)

    def test_the_filenames_only_baseline_carries_no_file_text(self):
        record = benchmark_record()
        candidate = dict(
            record["rcc_candidates"][1],
            structural_evidence="One dataset: the folder datasets/x.",
            sources=[{"type": "readme", "path": "datasets/x/README.md",
                      "excerpt": "Neutron powder diffraction patterns."}])
        artifact, _ = core.match_candidate(candidate, record)
        payload = core.build_artifact_payload(
            candidate, artifact, mode=core.EVIDENCE_FILENAMES_ONLY,
            record=record)
        blob = json.dumps(payload)
        self.assertNotIn("Neutron powder diffraction", blob)
        # ...and no paper background either: that arrived with the change.
        self.assertEqual({}, payload["paper_context"])

    def test_the_enhanced_mode_carries_the_sources_and_the_background(self):
        record = benchmark_record()
        candidate = dict(
            record["rcc_candidates"][1],
            sources=[{"type": "readme", "path": "datasets/x/README.md",
                      "excerpt": "Neutron powder diffraction patterns."}])
        artifact, _ = core.match_candidate(candidate, record)
        payload = core.build_artifact_payload(
            candidate, artifact, mode=core.EVIDENCE_ENHANCED, record=record)
        self.assertIn("Neutron powder", payload["sources"][0]["excerpt"])
        self.assertTrue(payload["paper_context"].get("title"))

    def test_no_url_absolute_path_image_or_account_data_is_sent(self):
        for index in range(4):
            payload, _ = self.payload_for(index)
            self.assertEqual([], core.payload_is_safe(payload))

    def test_the_safety_check_catches_a_url_or_an_absolute_path(self):
        self.assertIn("payload contains a URL",
                      core.payload_is_safe({"context": "see https://x.org"}))
        self.assertIn("payload contains an email address",
                      core.payload_is_safe({"context": "a@b.org"}))


# ------------------------------------------------------------------ metrics

class TestReferenceCorpus(unittest.TestCase):
    """The silver standard is the real corpus, minus Qresp's own QA records."""

    def test_qa_and_test_records_are_excluded_with_a_reason(self):
        for title in ("test record", "QA - do not use", "Demo paper",
                      "asdf", "Sample submission", "A paper (placeholder)"):
            self.assertTrue(core.qa_record_reason({"title": title}), title)

    def test_a_real_paper_is_kept(self):
        for title in ("Testing the limits of DFT for water",
                      "A sample-preparation protocol for perovskites",
                      "Demonstrating quantum advantage in spin chains"):
            self.assertEqual("", core.qa_record_reason({"title": title}),
                             title)

    def test_a_qa_collection_excludes_the_record(self):
        self.assertTrue(core.qa_record_reason(
            {"title": "Real looking title", "collections": ["QA"]}))

    def test_an_untitled_record_is_excluded(self):
        self.assertTrue(core.qa_record_reason({"title": "   "}))

    def test_the_split_reports_both_sides(self):
        kept, excluded = core.split_reference_corpus([
            {"record_id": "a", "title": "Real physics paper"},
            {"record_id": "b", "title": "test 2"},
        ])
        self.assertEqual(["a"], [r["record_id"] for r in kept])
        self.assertEqual(1, len(excluded))
        self.assertIn("QA/test", excluded[0][1])

    def test_the_vocabulary_still_holds_out_the_target_record(self):
        # Leave-one-record-out, so a tag only this record uses cannot be
        # handed back to the model as the answer.
        records = [
            {"record_id": "a", "reference_tags": ["unique to a", "shared"]},
            {"record_id": "b", "reference_tags": ["shared"]},
        ]
        display, known = core.build_vocabulary(records,
                                               exclude_record_id="a")
        self.assertNotIn("unique to a", known)
        self.assertIn("shared", known)


class TestArtifactMetrics(unittest.TestCase):

    def bundle(self, sources, name="run.py", kind="script"):
        return {"paper_context": {"title": "Water from first principles",
                                  "abstract": "We compute the VDOS."},
                "artifact": {"kind": kind, "name": name, "inventory": {}},
                "sources": sources}

    def test_groundedness_rewards_a_description_taken_from_the_evidence(self):
        payload = self.bundle([
            {"type": "docstring", "path": "s/run.py",
             "excerpt": "Computes the vibrational density of states."}])
        grounded = core.groundedness(
            "Computes the vibrational density of states.", payload)
        self.assertGreaterEqual(grounded, 0.9)

    def test_the_paper_abstract_does_not_ground_an_artifact_claim(self):
        # The whole point: a description lifted from the abstract must NOT
        # score as grounded, because the abstract is background, not evidence.
        payload = self.bundle([])
        self.assertEqual(0.0, core.groundedness(
            "Computes the vibrational density of states of water.", payload))

    def test_usefulness_rejects_a_restatement_of_the_name(self):
        payload = self.bundle([], name="plot_vdos.py")
        self.assertFalse(core.usefulness(
            "A python script file in the scripts folder.", payload))
        self.assertTrue(core.usefulness(
            "Computes vibrational spectra from molecular dynamics "
            "trajectories.", payload))

    def test_abstention_is_correct_when_there_is_no_prose(self):
        bare = self.bundle([{"type": "python_symbols", "path": "s/run.py",
                             "names": ["main"]}])
        self.assertEqual(core.ABSTAIN_CORRECT,
                         core.abstention_verdict(bare, {"description": ""}))
        self.assertEqual(core.ABSTAIN_MISSED,
                         core.abstention_verdict(bare,
                                                 {"description": "Plots."}))

    def test_abstention_is_wrong_when_a_readme_was_supplied(self):
        described = self.bundle([{"type": "readme", "path": "s/README.md",
                                  "excerpt": "Plots the band structure."}])
        self.assertEqual(core.ANSWER_MISSING,
                         core.abstention_verdict(described,
                                                 {"description": ""}))
        self.assertEqual(core.ANSWER_CORRECT,
                         core.abstention_verdict(described,
                                                 {"description": "Plots."}))

    def test_symbols_alone_are_structure_not_description(self):
        self.assertFalse(core.has_describing_evidence(self.bundle([
            {"type": "python_symbols", "path": "a.py", "names": ["f"]}])))

    def test_the_generic_ratio_is_measured_before_the_server_filter(self):
        self.assertEqual(0.5, core.generic_keyword_ratio(
            ["data", "scripts", "photoemission", "perovskite"]))
        self.assertIsNone(core.generic_keyword_ratio([]))

    def test_concept_overlap_folds_acronyms_and_plurals(self):
        overlap = core.concept_overlap(
            ["DFT", "perovskites"], ["density functional theory",
                                     "perovskite"])
        self.assertEqual(2, overlap["hits"])
        self.assertEqual(1.0, overlap["precision"])
        self.assertEqual(1.0, overlap["recall"])

    def test_concept_overlap_reports_a_clean_miss(self):
        overlap = core.concept_overlap(["graphene"], ["perovskite"])
        self.assertEqual(0, overlap["hits"])
        self.assertEqual(0.0, overlap["precision"])


class TestKeywordMetrics(unittest.TestCase):
    def test_exact_match_scoring(self):
        metrics = core.keyword_metrics(
            ["Perovskite", "thin films", "graphene"],
            ["perovskite", "solar cell"], {"perovskite", "graphene"})
        self.assertEqual(1, metrics["exact_hits"])
        self.assertAlmostEqual(1 / 3.0, metrics["exact_precision"], places=3)
        self.assertAlmostEqual(0.5, metrics["exact_recall"], places=3)
        self.assertEqual(2, metrics["vocabulary_reuse"])

    def test_the_lower_bound_is_stated_in_the_output(self):
        metrics = core.keyword_metrics(["DFT"], ["density functional theory"],
                                       set())
        self.assertEqual(0, metrics["exact_hits"])
        self.assertIn("LOWER BOUND", metrics["metric_note"])

    def test_plural_and_case_fold_into_one_concept(self):
        metrics = core.keyword_metrics(["Thin Films"], ["thin film"], set())
        self.assertEqual(0, metrics["exact_hits"])
        self.assertEqual(1, metrics["normalized_concept_hits"])

    def test_generic_keywords_are_listed_for_review(self):
        metrics = core.keyword_metrics(["simulation", "perovskite"],
                                       ["perovskite"], set())
        self.assertIn("simulation", metrics["generic_suggestions"])

    def test_duplicate_concepts_are_flagged_not_merged(self):
        pairs = core.suspected_duplicate_concepts(
            ["thin film", "thin films", "DFT", "density functional theory"])
        whys = " ".join(p["why"] for p in pairs)
        self.assertIn("plural", whys)
        self.assertIn("acronym", whys)

    def test_no_synonym_dictionary_is_hardcoded(self):
        source = io.open(core.__file__, encoding="utf-8").read()
        for pair in ("photovoltaic", "solar cell", "density functional"):
            self.assertNotIn('"%s"' % pair, source, pair)


class TestArtifactMetrics(unittest.TestCase):
    def test_a_tool_returning_keywords_is_a_contract_violation(self):
        problems = core.type_contract_violations(
            "tool", {"description": "A lattice simulator", "keywords": ["x"]})
        self.assertTrue(any("Tool" in p for p in problems))

    def test_a_chart_may_hold_keywords(self):
        self.assertEqual([], core.type_contract_violations(
            "chart", {"description": "An absorption spectrum",
                      "keywords": ["absorption"]}))

    def test_forbidden_fields_are_detected(self):
        self.assertIn("path_or_filename",
                      core.forbidden_field_hits("Made from figure1.png"))
        self.assertIn("url", core.forbidden_field_hits("see https://x.org"))
        self.assertIn("version_number",
                      core.forbidden_field_hits("Uses version 2.11"))
        self.assertIn("figure_number",
                      core.forbidden_field_hits("Shown in Figure 3"))
        self.assertEqual([], core.forbidden_field_hits(
            "Raw powder diffraction patterns at room temperature"))

    def test_similarity_is_resemblance_not_correctness(self):
        self.assertGreater(core.text_similarity(
            "raw diffraction patterns", "diffraction patterns raw"), 0.9)
        self.assertEqual(0.0, core.text_similarity("", "anything"))


# -------------------------------------------------------------- CLI: safety

class CliTestCase(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="assist-eval-")

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def write_records(self, records=None):
        records = records if records is not None else corpus(6)
        path = os.path.join(self.dir, "raw-records.jsonl")
        with io.open(path, "w", encoding="utf-8", newline="\n") as handle:
            for record in records:
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        return records

    def read(self, name):
        with io.open(os.path.join(self.dir, name), encoding="utf-8") as f:
            return f.read()

    def run_cli(self, argv, gemini=None, env=None):
        gemini = gemini or FakeGemini()
        with mock.patch.dict("os.environ", env or CONFIGURED):
            with mock.patch.object(assist, "call_gemini", gemini):
                code = assist_eval.main(argv)
        return code, gemini


class TestCollect(CliTestCase):
    def test_it_reads_qresp_and_calls_no_provider(self):
        session = FakeQrespSession([search_row(0, "T", "A", ["alpha"])])
        gemini = FakeGemini()
        with mock.patch("requests.Session", return_value=session):
            with mock.patch.object(assist, "call_gemini", gemini):
                code = assist_eval.main([
                    "collect", "--api-base", "https://qresp.example.org",
                    "--output-dir", self.dir, "--execute"])
        self.assertEqual(0, code)
        self.assertEqual([], gemini.payloads)
        records = [json.loads(l) for l in self.read("raw-records.jsonl")
                   .split("\n") if l.strip()]
        self.assertEqual(1, len(records))
        self.assertEqual(["alpha"], records[0]["reference_tags"])

    def test_a_bom_and_crlf_ids_file_is_read_safely(self):
        ids = os.path.join(self.dir, "ids.txt")
        with open(ids, "wb") as handle:
            handle.write(b"\xef\xbb\xbf" + b"# a comment\r\nrec00\r\nrec02\r\n")
        self.assertEqual(["rec00", "rec02"], assist_eval._read_lines(ids))

    def test_only_requested_ids_are_collected(self):
        ids = os.path.join(self.dir, "ids.txt")
        with open(ids, "wb") as handle:
            handle.write(b"\xef\xbb\xbfrec01\r\n")
        session = FakeQrespSession([search_row(i, "T%d" % i, "A", ["a%d" % i])
                                    for i in range(3)])
        with mock.patch("requests.Session", return_value=session):
            with mock.patch.object(assist, "call_gemini", FakeGemini()):
                assist_eval.main([
                    "collect", "--api-base", "https://x", "--output-dir",
                    self.dir, "--ids-file", ids, "--execute"])
        records = [json.loads(l) for l in self.read("raw-records.jsonl")
                   .split("\n") if l.strip()]
        self.assertEqual(["rec01"], [r["record_id"] for r in records])


class TestCollectRcc(CliTestCase):
    """The RCC collection step. It calls the SERVING analysis helpers, so the
    host allowlist, walk limits and evidence bounds are the production ones,
    and it contacts nothing without --execute."""

    ANALYSIS = {"candidates": {
        "charts": [{"id": "c1", "name": "figure1",
                    "paths": ["charts/figure1/figure1.png"], "context": ""}],
        "datasets": [{"id": "d1", "name": "xrd",
                      "paths": ["datasets/xrd/patterns.dat"],
                      "context": "README: raw patterns"}],
    }}

    def patched_pipeline(self, analysis=None, fail_for=()):
        """Stubs for the serving helpers, recording what was asked for."""
        seen = {"resolved": [], "walked": []}

        def resolve(path):
            seen["resolved"].append(path)
            if path in fail_for:
                raise curation.FolderError("refused")
            return "https://notebook.rcc.uchicago.edu/files/x"

        def walk(url, list_directory=None):
            seen["walked"].append(url)
            return (["datasets/xrd/patterns.dat"], ["datasets"], [], False)

        import contextlib
        return seen, mock.patch.multiple(
            curation,
            resolve_folder_url=mock.Mock(side_effect=resolve),
            tls_exception_scope=mock.Mock(
                side_effect=lambda url: contextlib.nullcontext()),
            walk_folder=mock.Mock(side_effect=walk),
            _fetch_text_sized=mock.Mock(
                return_value=("README: raw patterns", False)),
            analyze_folder_tree=mock.Mock(
                return_value=analysis or self.ANALYSIS))

    def test_a_dry_run_contacts_no_file_server(self):
        self.write_records()
        seen, patches = self.patched_pipeline()
        with patches:
            code, gemini = self.run_cli(["collect-rcc", "--output-dir",
                                         self.dir])
        self.assertEqual(0, code)
        self.assertEqual([], seen["walked"])
        self.assertEqual([], gemini.payloads)
        self.assertFalse(os.path.isdir(os.path.join(self.dir,
                                                    "rcc-analyses")))

    def test_execute_uses_the_serving_analysis_helpers(self):
        self.write_records()
        seen, patches = self.patched_pipeline()
        with patches:
            code, gemini = self.run_cli(
                ["collect-rcc", "--output-dir", self.dir, "--execute",
                 "--limit", "2", "--rate-limit", "0"])
            # Asserted INSIDE the patch, while the mocks still exist: the
            # production entry points, called with the record's own path.
            self.assertTrue(curation.resolve_folder_url.called)
            self.assertTrue(curation.walk_folder.called)
            self.assertTrue(curation.analyze_folder_tree.called)
        self.assertEqual(0, code)
        self.assertEqual(2, len(seen["resolved"]))
        self.assertEqual(2, len(seen["walked"]))
        # ...and never Gemini.
        self.assertEqual([], gemini.payloads)

    def test_it_saves_one_file_per_record_and_reuses_it(self):
        records = self.write_records()
        seen, patches = self.patched_pipeline()
        with patches:
            self.run_cli(["collect-rcc", "--output-dir", self.dir,
                          "--execute", "--limit", str(len(records)),
                          "--rate-limit", "0"])
        saved = sorted(os.listdir(os.path.join(self.dir, "rcc-analyses")))
        self.assertEqual(len(records), len(saved))

        # Every folder is now saved, so a second full run reads nothing.
        seen2, patches2 = self.patched_pipeline()
        with patches2:
            self.run_cli(["collect-rcc", "--output-dir", self.dir,
                          "--execute", "--limit", str(len(records)),
                          "--rate-limit", "0"])
        self.assertEqual([], seen2["walked"], "already-saved folders reused")

    def test_refresh_reads_them_again(self):
        self.write_records()
        seen, patches = self.patched_pipeline()
        with patches:
            self.run_cli(["collect-rcc", "--output-dir", self.dir,
                          "--execute", "--limit", "1", "--rate-limit", "0"])
        seen2, patches2 = self.patched_pipeline()
        with patches2:
            self.run_cli(["collect-rcc", "--output-dir", self.dir,
                          "--execute", "--limit", "1", "--rate-limit", "0",
                          "--refresh"])
        self.assertEqual(1, len(seen2["walked"]))

    def test_the_limit_is_honoured(self):
        self.write_records()
        seen, patches = self.patched_pipeline()
        with patches:
            self.run_cli(["collect-rcc", "--output-dir", self.dir,
                          "--execute", "--limit", "3", "--rate-limit", "0"])
        self.assertEqual(3, len(seen["walked"]))

    def test_one_failed_folder_does_not_stop_the_rest(self):
        records = self.write_records()
        failing = records[0]["file_server_path"]
        seen, patches = self.patched_pipeline(fail_for=(failing,))
        with patches:
            code, _ = self.run_cli(
                ["collect-rcc", "--output-dir", self.dir, "--execute",
                 "--limit", "3", "--rate-limit", "0"])
        self.assertEqual(0, code)
        saved = os.listdir(os.path.join(self.dir, "rcc-analyses"))
        self.assertEqual(2, len(saved), "the other two still succeeded")

    def test_the_saved_analysis_feeds_the_artifact_benchmark(self):
        self.write_records()
        seen, patches = self.patched_pipeline()
        with patches:
            self.run_cli(["collect-rcc", "--output-dir", self.dir,
                          "--execute", "--rate-limit", "0"])
        code, gemini = self.run_cli(["audit", "--output-dir", self.dir])
        self.assertEqual(0, code)
        report = json.loads(self.read("audit.json"))
        self.assertGreater(report["artifact_units"], 0)
        self.assertEqual([], gemini.payloads)

    def test_without_any_analysis_the_artifact_benchmark_is_zero(self):
        # And the sample must not imply calls that will not happen.
        records = corpus(3)
        for record in records:
            record["rcc_candidates"] = []
        self.write_records(records)
        self.run_cli(["audit", "--output-dir", self.dir])
        report = json.loads(self.read("audit.json"))
        self.assertEqual(0, report["artifact_units"])
        self.run_cli(["smoke-sample", "--output-dir", self.dir])
        sample = json.loads(self.read("smoke-sample.json"))
        self.assertEqual(0, len(sample["artifact_units"]))
        self.assertEqual(len(sample["keyword_units"]),
                         sample["planned_provider_calls"])


class TestCollectRccAgainstTheRealAnalyzer(CliTestCase):
    """The bug the mocked tests could not see.

    `TestCollectRcc` above stubs `analyze_folder_tree` with the HTTP
    ENVELOPE shape (`{"candidates": {...}}`). The real function returns the
    candidate groups FLAT, at the top level, with no `candidates` key at all
    -- only `POST /api/curation/analyze-folder` adds that wrapper. So
    `analysis.get("candidates", {})` always produced `{}` and every saved
    cache file was 23 bytes of nothing, while every test passed.

    These tests mock only the NETWORK boundary and call the real analyzer.
    """

    STANDARD = ["datasets/set1/data.csv", "charts/fig1/preview.png",
                "scripts/run1/analyze.py", "tools/tool1/README.md"]
    STANDARD_DIRS = ["datasets", "datasets/set1", "charts", "charts/fig1",
                     "scripts", "scripts/run1", "tools", "tools/tool1"]
    LEGACY = ["data/DFT/result.dat",
              "figures_tables/figure_1/figure_1.png",
              "scripts/analysis/run.py", "doc/README.md"]
    LEGACY_DIRS = ["data", "data/DFT", "figures_tables",
                   "figures_tables/figure_1", "scripts", "scripts/analysis",
                   "doc"]

    def real_pipeline(self, files, dirs, texts=None):
        """Only the network boundary is stubbed; the analyzer is real."""
        import contextlib
        texts = texts or {}
        return mock.patch.multiple(
            curation,
            resolve_folder_url=mock.Mock(
                return_value="https://notebook.rcc.uchicago.edu/files/x"),
            tls_exception_scope=mock.Mock(
                side_effect=lambda url: contextlib.nullcontext()),
            walk_folder=mock.Mock(return_value=(files, dirs, [], False)),
            _fetch_text_sized=mock.Mock(
                side_effect=lambda url: (
                    texts.get(url.rsplit("/", 1)[-1], "# a short header"),
                    False)))

    def collect_one(self, files, dirs):
        self.write_records(corpus(1))
        with self.real_pipeline(files, dirs):
            code, gemini = self.run_cli(
                ["collect-rcc", "--output-dir", self.dir, "--execute",
                 "--limit", "1", "--rate-limit", "0"])
        self.assertEqual(0, code)
        self.assertEqual([], gemini.payloads, "collect-rcc never calls Gemini")
        saved = os.path.join(self.dir, "rcc-analyses", "rec00.json")
        self.assertTrue(os.path.isfile(saved))
        with io.open(saved, encoding="utf-8") as handle:
            return json.load(handle)

    # -- the reproduction -------------------------------------------------

    def test_a_standard_folder_saves_real_candidates(self):
        payload = self.collect_one(self.STANDARD, self.STANDARD_DIRS)
        self.assertEqual(2, payload["format_version"])
        self.assertTrue(payload["analysis_completed"])
        candidates = payload["candidates"]
        self.assertEqual(sorted(("charts", "datasets", "scripts", "tools")),
                         sorted(candidates))
        total = sum(len(v) for v in candidates.values())
        self.assertGreater(total, 0, "the cache must not be empty: %r"
                                     % candidates)
        self.assertTrue(candidates["datasets"])
        self.assertTrue(candidates["charts"])

    def test_a_legacy_folder_saves_real_candidates(self):
        payload = self.collect_one(self.LEGACY, self.LEGACY_DIRS)
        total = sum(len(v) for v in payload["candidates"].values())
        self.assertGreater(total, 0)

    def test_structure_metadata_never_becomes_a_candidate(self):
        # The pure result also carries structure_issues, grouped_unclassified,
        # chart_image_groups, boundary_trees, applied_chart_plan... all
        # arrays, none of them candidates.
        payload = self.collect_one(self.STANDARD, self.STANDARD_DIRS)
        self.assertEqual(sorted(("charts", "datasets", "scripts", "tools")),
                         sorted(payload["candidates"]))
        for forbidden in ("structure_issues", "grouped_unclassified",
                          "chart_image_groups", "applied_chart_plan",
                          "boundary_trees", "unclassified",
                          "normalized_roles"):
            self.assertNotIn(forbidden, payload["candidates"], forbidden)

    def test_the_saved_candidates_survive_a_round_trip(self):
        self.collect_one(self.STANDARD, self.STANDARD_DIRS)
        records = assist_eval._load_records(self.dir)
        candidates = records[0]["rcc_candidates"]
        self.assertTrue(candidates)
        for candidate in candidates:
            self.assertIn(candidate["kind"],
                          ("chart", "dataset", "script", "tool"))
            self.assertTrue(candidate["id"])
            self.assertTrue(candidate["paths"])

    def test_the_candidate_name_comes_from_label(self):
        self.collect_one(self.STANDARD, self.STANDARD_DIRS)
        records = assist_eval._load_records(self.dir)
        names = [c["name"] for c in records[0]["rcc_candidates"]]
        self.assertTrue(any(names), "a candidate kept no display name")

    def test_structured_sources_survive_the_collect_round_trip(self):
        payload = self.collect_one(self.STANDARD, self.STANDARD_DIRS)
        raw = [c for group in payload["candidates"].values() for c in group]
        self.assertTrue(any("ai_sources" in c for c in raw),
                        "the analyzer produced no structured evidence")
        records = assist_eval._load_records(self.dir)
        candidates = records[0]["rcc_candidates"]
        self.assertTrue(candidates)
        for candidate in candidates:
            self.assertIsInstance(candidate["sources"], list)
            self.assertIsInstance(candidate["inventory"], dict)
            for source in candidate["sources"]:
                self.assertIn(source["type"], curation.AI_SOURCE_TYPES)
                self.assertLessEqual(len(source.get("excerpt") or ""),
                                     ev.MAX_EXCERPT_CHARS)

    def test_the_artifact_benchmark_now_has_units(self):
        self.collect_one(self.STANDARD, self.STANDARD_DIRS)
        # Give the record artifacts whose paths match the analysed files, so
        # the exact-path matcher can pair them.
        records = _read_jsonl_file(
            os.path.join(self.dir, "raw-records.jsonl"))
        records[0]["artifacts"]["datasets"] = [{
            "kind": "datasets", "id": "d0",
            "human_description": "The set-1 data",
            "human_description_field": "readme", "human_keywords": ["csv"],
            "human_keyword_field": "keywords",
            "files": ["datasets/set1/data.csv"], "image_file": "",
            "notebook_file": "", "package_name": "", "facility_name": "",
            "measurement": ""}]
        self.write_records(records)
        code, _ = self.run_cli(["audit", "--output-dir", self.dir])
        self.assertEqual(0, code)
        report = json.loads(self.read("audit.json"))
        self.assertGreater(report["records_with_rcc_analysis"], 0)
        self.assertGreater(report["records_with_rcc_candidates"], 0)
        self.assertGreater(report["artifact_units"], 0)

    def test_no_file_content_url_or_absolute_path_reaches_the_payload(self):
        self.collect_one(self.STANDARD, self.STANDARD_DIRS)
        records = assist_eval._load_records(self.dir)
        record = records[0]
        for candidate in record["rcc_candidates"]:
            artifact = {"human_description": "", "human_keywords": []}
            payload = core.build_artifact_payload(candidate, artifact)
            if payload is None:
                continue
            self.assertEqual(["artifact", "paper_context", "sources"],
                             sorted(payload))
            self.assertEqual([], core.payload_is_safe(payload))


def _read_jsonl_file(path):
    with io.open(path, encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


class TestRccCacheFormat(CliTestCase):
    """Which saved files may be reused, and which must be analysed again."""

    def write_cache(self, payload, record_id="rec00"):
        target = os.path.join(self.dir, "rcc-analyses")
        if not os.path.isdir(target):
            os.makedirs(target)
        path = os.path.join(target, "%s.json" % record_id)
        with io.open(path, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle)
        return path

    def current_cache(self, candidates=None):
        return {"format_version": 2, "analysis_completed": True,
                "candidates": candidates or {
                    "charts": [], "datasets": [
                        {"id": "d1", "label": "set1",
                         "paths": ["datasets/set1/data.csv"],
                         "evidence": ["README: the set"]}],
                    "scripts": [], "tools": []}}

    def collect_again(self, extra=()):
        self.write_records(corpus(1))
        seen = {"walked": 0}

        import contextlib

        def walk(url, list_directory=None):
            seen["walked"] += 1
            return (["datasets/set1/data.csv"], ["datasets", "datasets/set1"],
                    [], False)

        with mock.patch.multiple(
                curation,
                resolve_folder_url=mock.Mock(return_value="https://x/y"),
                tls_exception_scope=mock.Mock(
                    side_effect=lambda url: contextlib.nullcontext()),
                walk_folder=mock.Mock(side_effect=walk),
                _fetch_text_sized=mock.Mock(return_value=("readme", False))):
            self.run_cli(["collect-rcc", "--output-dir", self.dir,
                          "--execute", "--limit", "1", "--rate-limit", "0"]
                         + list(extra))
        return seen["walked"]

    def test_a_current_cache_is_reused(self):
        self.write_cache(self.current_cache())
        self.assertEqual(0, self.collect_again())

    def test_refresh_re_reads_even_a_current_cache(self):
        self.write_cache(self.current_cache())
        self.assertEqual(1, self.collect_again(["--refresh"]))

    def test_the_empty_cache_the_bug_produced_is_stale(self):
        # Exactly what shipped: 23 bytes, no format_version.
        self.write_cache({"candidates": {}})
        self.assertEqual(1, self.collect_again(),
                         "a pre-fix empty cache must be analysed again")

    def test_an_older_format_version_is_stale(self):
        self.write_cache({"format_version": 1, "candidates": {}})
        self.assertEqual(1, self.collect_again())

    def test_a_completed_analysis_with_no_candidates_is_still_an_analysis(self):
        # An empty or unsupported folder analyses fine and yields nothing.
        # That is a result, not a missing cache.
        self.write_cache(self.current_cache(candidates={
            "charts": [], "datasets": [], "scripts": [], "tools": []}))
        self.write_records(corpus(1))
        self.run_cli(["audit", "--output-dir", self.dir])
        report = json.loads(self.read("audit.json"))
        self.assertEqual(1, report["records_with_rcc_analysis"])
        self.assertEqual(0, report["records_with_rcc_candidates"])
        self.assertEqual(0, report["artifact_units"])
        # ...and it is not re-analysed.
        self.assertEqual(0, self.collect_again())

    def test_no_cache_file_at_all_is_no_analysis(self):
        records = corpus(1)
        records[0]["rcc_candidates"] = []
        self.write_records(records)
        self.run_cli(["audit", "--output-dir", self.dir])
        report = json.loads(self.read("audit.json"))
        self.assertEqual(0, report["records_with_rcc_analysis"])
        self.assertEqual(0, report["records_with_rcc_candidates"])

    def test_a_users_saved_http_response_is_still_readable(self):
        # `{"candidates": <pure result>}` -- what /api/curation/analyze-folder
        # actually returns, which a curator may have saved by hand.
        self.write_cache({"candidates": {
            "charts": [], "datasets": [
                {"id": "d1", "label": "set1", "kind": "dataset",
                 "paths": ["datasets/set1/data.csv"], "evidence": ["r"]}],
            "scripts": [], "tools": [],
            "structure_mode": "standard", "structure_issues": [],
            "grouped_unclassified": [], "chart_image_groups": []}})
        self.write_records(corpus(1))
        records = assist_eval._load_records(self.dir)
        candidates = records[0]["rcc_candidates"]
        self.assertEqual(1, len(candidates))
        self.assertEqual("dataset", candidates[0]["kind"])
        self.assertEqual("set1", candidates[0]["name"])

    def test_a_bare_pure_analysis_result_is_readable_too(self):
        self.write_cache({
            "charts": [], "scripts": [], "tools": [],
            "datasets": [{"id": "d1", "label": "set1",
                          "paths": ["datasets/set1/data.csv"],
                          "evidence": ["r"]}],
            "structure_mode": "standard", "structure_issues": [],
            "chart_image_groups": [{"folder": "charts/fig1"}]})
        self.write_records(corpus(1))
        records = assist_eval._load_records(self.dir)
        self.assertEqual(1, len(records[0]["rcc_candidates"]))
        self.assertEqual("dataset", records[0]["rcc_candidates"][0]["kind"])


class TestAuditAndSample(CliTestCase):
    def test_audit_reports_coverage_without_calling_a_provider(self):
        self.write_records()
        code, gemini = self.run_cli(["audit", "--output-dir", self.dir])
        self.assertEqual(0, code)
        self.assertEqual([], gemini.payloads)
        report = json.loads(self.read("audit.json"))
        self.assertEqual(6, report["records"])
        self.assertEqual(12, report["keyword_units"])      # 6 records x 2
        # 6 records x 4 candidates x 2 evidence modes. Each candidate is
        # asked twice -- filenames-only and enhanced -- so the comparison is
        # paired on the same candidate rather than on two samples.
        self.assertEqual(48, report["artifact_units"])
        self.assertIn("keyword_context_gaps", report)

    def test_the_sample_is_deterministic_for_a_seed(self):
        self.write_records()
        self.run_cli(["smoke-sample", "--output-dir", self.dir, "--seed", "7"])
        first = json.loads(self.read("smoke-sample.json"))
        self.run_cli(["smoke-sample", "--output-dir", self.dir, "--seed", "7"])
        second = json.loads(self.read("smoke-sample.json"))
        self.assertEqual(first, second)

    def test_a_different_seed_gives_a_different_but_valid_sample(self):
        self.write_records()
        self.run_cli(["smoke-sample", "--output-dir", self.dir, "--seed", "0"])
        first = json.loads(self.read("smoke-sample.json"))
        self.run_cli(["smoke-sample", "--output-dir", self.dir, "--seed", "3"])
        second = json.loads(self.read("smoke-sample.json"))
        self.assertEqual(first["planned_provider_calls"],
                         second["planned_provider_calls"])

    def test_the_default_sample_stays_within_the_smoke_budget(self):
        self.write_records()
        self.run_cli(["smoke-sample", "--output-dir", self.dir])
        sample = json.loads(self.read("smoke-sample.json"))
        self.assertEqual(10, len(sample["keyword_units"]))   # 5 records x 2
        # 10 candidates, each in both evidence modes.
        self.assertEqual(20, len(sample["artifact_units"]))
        self.assertEqual(30, sample["planned_provider_calls"])

    def test_artifact_strata_spread_across_kinds(self):
        self.write_records()
        self.run_cli(["smoke-sample", "--output-dir", self.dir])
        sample = json.loads(self.read("smoke-sample.json"))
        kinds = {u["kind"] for u in sample["artifact_units"]}
        self.assertGreaterEqual(len(kinds), 3)

    def test_both_keyword_modes_are_present_for_each_sampled_record(self):
        self.write_records()
        self.run_cli(["smoke-sample", "--output-dir", self.dir])
        sample = json.loads(self.read("smoke-sample.json"))
        by_record = {}
        for unit in sample["keyword_units"]:
            by_record.setdefault(unit["record_id"], set()).add(unit["mode"])
        for modes in by_record.values():
            self.assertEqual(set(core.KEYWORD_MODES), modes)


class TestRun(CliTestCase):
    def prepare(self):
        self.write_records()
        self.run_cli(["smoke-sample", "--output-dir", self.dir])

    def test_a_dry_run_contacts_nobody(self):
        self.prepare()
        code, gemini = self.run_cli(["run", "--output-dir", self.dir])
        self.assertEqual(0, code)
        self.assertEqual([], gemini.payloads)
        self.assertFalse(os.path.isfile(
            os.path.join(self.dir, "provider-cache.jsonl")))

    def test_without_execute_the_provider_is_structurally_unreachable(self):
        # main() installs a refusing stand-in, so even a bug cannot call out.
        self.prepare()
        with mock.patch.dict("os.environ", CONFIGURED):
            assist_eval.main(["run", "--output-dir", self.dir])
        self.assertNotIsInstance(assist.call_gemini,
                                 assist_eval.RefusingProvider)
        self.assertTrue(callable(assist.call_gemini))

    def test_execute_makes_exactly_one_call_per_unit(self):
        self.prepare()
        code, gemini = self.run_cli(
            ["run", "--output-dir", self.dir, "--execute", "--rate-limit", "0"])
        self.assertEqual(0, code)
        sample = json.loads(self.read("smoke-sample.json"))
        self.assertEqual(sample["planned_provider_calls"],
                         len(gemini.payloads))

    def test_one_artifact_payload_carries_exactly_one_item(self):
        self.prepare()
        _, gemini = self.run_cli(
            ["run", "--output-dir", self.dir, "--execute", "--rate-limit", "0"])
        for payload in gemini.payloads:
            if "item" in payload:
                self.assertIsInstance(payload["item"], dict)
                self.assertNotIn("items", payload)

    def test_the_products_own_prompts_are_used(self):
        self.prepare()
        _, gemini = self.run_cli(
            ["run", "--output-dir", self.dir, "--execute", "--rate-limit", "0"])
        self.assertIn(assist.KEYWORD_SYSTEM_PROMPT, gemini.prompts)
        self.assertIn(curation.AI_SYSTEM_PROMPT, gemini.prompts)

    def test_a_second_run_reuses_the_cache_and_calls_nothing(self):
        self.prepare()
        self.run_cli(["run", "--output-dir", self.dir, "--execute",
                      "--rate-limit", "0"])
        code, gemini = self.run_cli(
            ["run", "--output-dir", self.dir, "--execute", "--rate-limit", "0"])
        self.assertEqual(0, code)
        self.assertEqual([], gemini.payloads)

    def test_a_provider_failure_does_not_stop_the_run(self):
        self.prepare()
        code, gemini = self.run_cli(
            ["run", "--output-dir", self.dir, "--execute", "--rate-limit", "0"],
            gemini=FakeGemini(error="upstream exploded"))
        self.assertEqual(0, code)
        rows = [json.loads(l) for l in
                self.read("provider-cache.jsonl").split("\n") if l.strip()]
        self.assertTrue(rows)
        self.assertTrue(all(row["ok"] is False for row in rows))

    def test_a_run_without_a_key_refuses_rather_than_pretending(self):
        self.prepare()
        code, gemini = self.run_cli(
            ["run", "--output-dir", self.dir, "--execute"],
            env={"QRESP_GEMINI_ENABLED": "", "QRESP_GEMINI_API_KEY": ""})
        self.assertEqual(3, code)
        self.assertEqual([], gemini.payloads)

    def test_a_leaking_payload_stops_the_run_before_any_call(self):
        # The builder withholds the answer, so a leak can now only come from
        # a construction bug. Simulate one and prove the run refuses BEFORE
        # spending anything, rather than trusting the builder.
        self.prepare()
        leaky = lambda record, mode, vocabulary: {
            "publication": {"title": record["title"]},
            "qresp_vocabulary": list(record["reference_tags"]),
        }
        with mock.patch.object(core, "build_keyword_payload", leaky):
            code, gemini = self.run_cli(
                ["run", "--output-dir", self.dir, "--execute",
                 "--rate-limit", "0"])
        self.assertEqual(4, code)
        self.assertEqual([], gemini.payloads)

    def test_the_call_ceiling_is_enforced(self):
        self.prepare()
        code, gemini = self.run_cli(
            ["run", "--output-dir", self.dir, "--execute", "--max-calls", "3"])
        self.assertEqual(4, code)
        self.assertEqual([], gemini.payloads)

    def test_no_secret_reaches_the_cache_file(self):
        self.prepare()
        self.run_cli(["run", "--output-dir", self.dir, "--execute",
                      "--rate-limit", "0"])
        blob = self.read("provider-cache.jsonl")
        for leak in ("test-gemini-secret", "x-goog-api-key", "Authorization",
                     "curator@example.com"):
            self.assertNotIn(leak, blob, leak)


class TestFailedUnitsAreRetried(CliTestCase):
    """A live 10-unit run came back 4 success / 2 MAX_TOKENS / 4 rate-limited,
    and re-running it retried nothing: `_cache_index` kept every row that had
    a fingerprint, so a FAILURE counted as a cached answer.

    The rule is that only a successful answer is worth reusing. Failures stay
    in the file as diagnostics and are always re-planned, which is also what
    makes a 429 recoverable by waiting and running the same command again.
    """

    def prepare(self):
        self.write_records()
        self.run_cli(["smoke-sample", "--output-dir", self.dir])

    def append_cache(self, rows):
        path = os.path.join(self.dir, "provider-cache.jsonl")
        with io.open(path, "a", encoding="utf-8", newline="\n") as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    def planned_fingerprints(self):
        """What a dry run would call, without calling anything."""
        records = assist_eval._load_records(self.dir)
        sample = json.loads(self.read("smoke-sample.json"))
        with mock.patch.dict("os.environ", CONFIGURED):
            cfg = assist._gemini_config()
        cache = assist_eval._cache_index(self.dir)
        planned = assist_eval._plan(records, sample, cache, cfg)
        return ([e["fingerprint"] for e in planned if not e["cached"]],
                [e["fingerprint"] for e in planned if e["cached"]])

    def all_fingerprints(self):
        records = assist_eval._load_records(self.dir)
        sample = json.loads(self.read("smoke-sample.json"))
        with mock.patch.dict("os.environ", CONFIGURED):
            cfg = assist._gemini_config()
        return [e["fingerprint"]
                for e in assist_eval._plan(records, sample, {}, cfg)]

    def test_a_failed_unit_is_not_treated_as_cached(self):
        self.prepare()
        fingerprints = self.all_fingerprints()
        self.append_cache([{"fingerprint": fingerprints[0], "ok": False,
                            "error_kind": "max_tokens", "answer_text": ""}])
        to_call, cached = self.planned_fingerprints()
        self.assertIn(fingerprints[0], to_call)
        self.assertNotIn(fingerprints[0], cached)

    def test_a_successful_unit_is_cached(self):
        self.prepare()
        fingerprints = self.all_fingerprints()
        self.append_cache([{"fingerprint": fingerprints[0], "ok": True,
                            "answer_text": "{}"}])
        to_call, cached = self.planned_fingerprints()
        self.assertIn(fingerprints[0], cached)
        self.assertNotIn(fingerprints[0], to_call)

    def test_a_success_after_a_failure_is_reused(self):
        # The retry succeeded; the earlier failure row must not shadow it.
        self.prepare()
        fingerprints = self.all_fingerprints()
        self.append_cache([
            {"fingerprint": fingerprints[0], "ok": False,
             "error_kind": "rate_limited", "answer_text": ""},
            {"fingerprint": fingerprints[0], "ok": True,
             "answer_text": '{"keywords": []}'},
        ])
        to_call, cached = self.planned_fingerprints()
        self.assertIn(fingerprints[0], cached)

    def test_a_failure_written_after_a_success_does_not_shadow_it(self):
        # Order must not matter: rows are appended, and a later failed retry
        # of an already-answered unit must not un-cache it.
        self.prepare()
        fingerprints = self.all_fingerprints()
        self.append_cache([
            {"fingerprint": fingerprints[0], "ok": True,
             "answer_text": '{"keywords": []}'},
            {"fingerprint": fingerprints[0], "ok": False,
             "error_kind": "rate_limited", "answer_text": ""},
        ])
        to_call, cached = self.planned_fingerprints()
        self.assertIn(fingerprints[0], cached)
        self.assertNotIn(fingerprints[0], to_call)

    def test_the_live_failure_pattern_replans_exactly_the_failures(self):
        """4 success, 2 MAX_TOKENS, 4 rate-limited -> 4 cached, 6 to call."""
        self.prepare()
        fingerprints = self.all_fingerprints()
        self.assertEqual(30, len(fingerprints))
        subset = fingerprints[:10]
        rows = []
        for fingerprint in subset[:4]:
            rows.append({"fingerprint": fingerprint, "ok": True,
                         "answer_text": '{"keywords": []}'})
        for fingerprint in subset[4:6]:
            rows.append({"fingerprint": fingerprint, "ok": False,
                         "error_kind": "max_tokens", "answer_text": ""})
        for fingerprint in subset[6:10]:
            rows.append({"fingerprint": fingerprint, "ok": False,
                         "error_kind": "rate_limited", "answer_text": ""})
        self.append_cache(rows)

        to_call, cached = self.planned_fingerprints()
        self.assertEqual(4, len([f for f in cached if f in subset]))
        self.assertEqual(6, len([f for f in to_call if f in subset]))

        # The six retried and succeeded -> nothing left to call.
        self.append_cache([{"fingerprint": f, "ok": True,
                            "answer_text": '{"keywords": []}'}
                           for f in subset[4:10]])
        to_call, cached = self.planned_fingerprints()
        self.assertEqual(10, len([f for f in cached if f in subset]))
        self.assertEqual(0, len([f for f in to_call if f in subset]))

    def test_summarize_does_not_count_a_failure_as_completed(self):
        self.prepare()
        fingerprints = self.all_fingerprints()
        self.append_cache([{"fingerprint": f, "ok": False,
                            "error_kind": "max_tokens", "answer_text": ""}
                           for f in fingerprints])
        self.run_cli(["summarize", "--output-dir", self.dir])
        keyword = json.loads(self.read("keyword-summary.json"))
        artifact = json.loads(self.read("artifact-summary.json"))
        self.assertEqual(0, keyword["completed"])
        self.assertEqual(0, artifact["completed"])

    def test_a_429_is_recorded_with_its_kind_and_never_retried(self):
        self.prepare()

        class RateLimited:
            def __init__(self):
                self.calls = 0

            def __call__(self, cfg, payload, prompt, schema,
                         max_output_tokens=None):
                self.calls += 1
                return None, assist.ProviderError(
                    "You have reached the AI usage limit.",
                    assist.ERROR_RATE_LIMITED)

        provider = RateLimited()
        code, _ = self.run_cli(
            ["run", "--output-dir", self.dir, "--execute", "--rate-limit",
             "0"], gemini=provider)
        self.assertEqual(0, code)
        # One call per unit, and NOT ONE retry: a retried paid call is
        # accidental spend, and the operator re-runs deliberately instead.
        sample = json.loads(self.read("smoke-sample.json"))
        self.assertEqual(sample["planned_provider_calls"], provider.calls)
        rows = [json.loads(l) for l in self.read("provider-cache.jsonl")
                .split("\n") if l.strip()]
        self.assertTrue(rows)
        for row in rows:
            self.assertFalse(row["ok"])
            self.assertEqual("rate_limited", row["error_kind"])
        # ...and every one of them is planned again next time.
        to_call, cached = self.planned_fingerprints()
        self.assertEqual([], cached)
        self.assertEqual(sample["planned_provider_calls"], len(to_call))

    def test_the_failure_kinds_are_distinguishable_in_the_output(self):
        self.prepare()
        kinds = iter([assist.ERROR_MAX_TOKENS, assist.ERROR_RATE_LIMITED,
                      assist.ERROR_TIMEOUT, assist.ERROR_UNAVAILABLE,
                      assist.ERROR_MALFORMED, assist.ERROR_BLOCKED])

        def failing(cfg, payload, prompt, schema, max_output_tokens=None):
            try:
                kind = next(kinds)
            except StopIteration:
                kind = assist.ERROR_OTHER
            return None, assist.ProviderError("a safe message", kind)

        self.run_cli(["run", "--output-dir", self.dir, "--execute",
                      "--rate-limit", "0"], gemini=failing)
        rows = [json.loads(l) for l in self.read("provider-cache.jsonl")
                .split("\n") if l.strip()]
        observed = {row["error_kind"] for row in rows}
        for kind in ("max_tokens", "rate_limited", "timeout",
                     "provider_unavailable", "malformed", "blocked"):
            self.assertIn(kind, observed, kind)

    def test_no_secret_or_provider_body_reaches_the_cache_or_stdout(self):
        self.prepare()

        def leaky(cfg, payload, prompt, schema, max_output_tokens=None):
            return None, assist.ProviderError(
                "The AI provider returned an error.", assist.ERROR_OTHER)

        with mock.patch.dict("os.environ", CONFIGURED):
            self.run_cli(["run", "--output-dir", self.dir, "--execute",
                          "--rate-limit", "0"], gemini=leaky)
        blob = self.read("provider-cache.jsonl")
        for leak in ("test-gemini-secret", "x-goog-api-key", "Authorization",
                     "system_instruction", "qresp_vocabulary",
                     "curator@example.com"):
            self.assertNotIn(leak, blob, leak)


class TestSummarize(CliTestCase):
    def prepare(self, answers=None):
        self.write_records()
        self.run_cli(["smoke-sample", "--output-dir", self.dir])
        self.run_cli(["run", "--output-dir", self.dir, "--execute",
                      "--rate-limit", "0"],
                     gemini=FakeGemini(answers=answers) if answers else None)

    def test_summarize_makes_no_provider_call(self):
        self.prepare()
        code, gemini = self.run_cli(["summarize", "--output-dir", self.dir])
        self.assertEqual(0, code)
        self.assertEqual([], gemini.payloads)

    def test_it_writes_every_output(self):
        self.prepare()
        self.run_cli(["summarize", "--output-dir", self.dir])
        for name in ("keyword-summary.json", "artifact-summary.json",
                     "keyword-review.tsv", "artifact-review.tsv",
                     "expert-review.tsv"):
            self.assertTrue(os.path.isfile(os.path.join(self.dir, name)), name)

    def test_the_summaries_say_they_are_provisional(self):
        self.prepare()
        self.run_cli(["summarize", "--output-dir", self.dir])
        for name in ("keyword-summary.json", "artifact-summary.json"):
            payload = json.loads(self.read(name))
            self.assertIn("provisional", payload["evaluation_type"].lower())
            self.assertIn("NOT expert ground truth",
                          payload["evaluation_type"])
            self.assertIn("biased toward itself",
                          payload["self_evaluation_warning"])
            self.assertIn("REFERENCE", payload["ground_truth_note"])

    def test_the_two_modes_are_reported_separately(self):
        self.prepare()
        self.run_cli(["summarize", "--output-dir", self.dir])
        summary = json.loads(self.read("keyword-summary.json"))
        self.assertEqual(sorted(core.KEYWORD_MODES),
                         sorted(summary["by_mode"]))
        self.assertIn("artifacts_mode_delta", summary)

    def test_expert_ratings_are_written_blank(self):
        self.prepare()
        self.run_cli(["summarize", "--output-dir", self.dir])
        for name in ("keyword-review.tsv", "artifact-review.tsv",
                     "expert-review.tsv"):
            lines = [l for l in self.read(name).split("\n") if l]
            columns = lines[0].split("\t")
            index = columns.index("expert_rating")
            for line in lines[1:]:
                self.assertEqual("", line.split("\t")[index])

    def test_the_expert_shortlist_is_capped(self):
        self.prepare()
        self.run_cli(["summarize", "--output-dir", self.dir])
        lines = [l for l in self.read("expert-review.tsv").split("\n") if l]
        self.assertLessEqual(len(lines) - 1, 30)

    def test_a_tool_keyword_is_stripped_and_recorded_as_a_violation(self):
        record = benchmark_record()
        candidate = record["rcc_candidates"][3]            # the tool
        artifact, _ = core.match_candidate(candidate, record)
        entry = {
            "unit": {"id": "u1", "record_id": record["record_id"],
                     "kind": "tool", "has_evidence": True},
            "artifact": artifact,
            "payload": core.build_artifact_payload(candidate, artifact,
                                                   record=record),
        }
        entry["unit"]["evidence_mode"] = core.EVIDENCE_ENHANCED
        cached = {"ok": True, "answer_text": json.dumps({"items": [{
            "id": entry["payload"]["artifact"]["id"],
            "description": "A lattice simulation library",
            "keywords": ["lattice"], "confidence": "low",
            "reason": "the manifest line"}]})}
        row = assist_eval._score_artifact(entry, cached, [record])
        # Recorded as a violation...
        self.assertTrue(any("Tool" in p
                            for p in row["type_contract_violations"]))
        # ...and dropped, exactly as the endpoint drops it.
        self.assertEqual([], row["ai_keywords"])
        self.assertEqual(["lattice"], row["ai_keywords_before_type_filter"])

    def test_a_malformed_answer_is_contained(self):
        self.prepare(answers=["not json at all"] * 20)
        code, _ = self.run_cli(["summarize", "--output-dir", self.dir])
        self.assertEqual(0, code)
        summary = json.loads(self.read("keyword-summary.json"))
        self.assertEqual(0, summary["completed"])

    def test_chart_abstention_is_measured_rather_than_punished(self):
        self.prepare(answers=[json.dumps({"items": [{
            "id": "cand-chart", "description": "", "keywords": [],
            "confidence": "low", "reason": "no evidence"}]})] * 20)
        self.run_cli(["summarize", "--output-dir", self.dir])
        summary = json.loads(self.read("artifact-summary.json"))
        self.assertIn("abstention_rate", summary)
        self.assertIn("abstaining is the CORRECT behaviour",
                      summary["chart_note"])


class TestNoProductionWrites(CliTestCase):
    def test_the_benchmark_never_touches_mongo_or_the_quota(self):
        self.write_records()
        with mock.patch.object(assist, "_consume_daily_quota") as quota:
            with mock.patch("project.models.active_papers") as papers:
                self.run_cli(["smoke-sample", "--output-dir", self.dir])
                self.run_cli(["run", "--output-dir", self.dir, "--execute",
                              "--rate-limit", "0"])
                self.run_cli(["summarize", "--output-dir", self.dir])
        quota.assert_not_called()
        papers.assert_not_called()

    def test_the_vocabulary_comes_from_the_collected_file_not_the_database(self):
        # `assist._qresp_taxonomy` reads Mongo; the benchmark must not.
        with mock.patch.object(assist, "_qresp_taxonomy") as taxonomy:
            display, known = core.build_vocabulary(corpus(3))
        taxonomy.assert_not_called()
        self.assertTrue(known)

    def test_the_products_field_allowlists_are_imported_not_restated(self):
        source = io.open(core.__file__, encoding="utf-8").read()
        self.assertIn("assist._reviewed_context", source)
        self.assertIn("curation._sanitize_ai_items", source)


if __name__ == "__main__":
    unittest.main()
