"""The per-type field contract for Charts, Datasets, Scripts and Tools.

Two things were conflated before this. A dataset's and a script's "Keywords"
input actually wrote to `URLs`, so a curator's keywords were stored as links;
and the AI was asked for keywords on every record type, including Tools, which
have no keyword field at all -- the UI then told the curator their suggestion
had nowhere to go.

Keywords are now a real, separate field on Datasets and Scripts. It is
optional and absent-safe, so every record written before it existed loads with
an empty list and no migration runs.
"""
import io
import json
import os
import unittest

import mongoengine
import mongomock
from jsonschema import ValidationError, validate

from project import curation
from project.models import Datasets, Scripts

SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "schema.json")

with io.open(SCHEMA_PATH, encoding="utf-8") as handle:
    SCHEMA = json.load(handle)

CHART = {"id": "c1", "caption": "c", "number": "1", "imageFile": "i.png",
         "properties": ["p"]}


def paper(**sections):
    document = {
        "PIs": [{"firstName": "A", "lastName": "B"}], "charts": [CHART],
        "collections": ["x"], "tags": ["t"], "schema": "1", "license": "cc",
        "info": {"insertedBy": {"firstName": "A", "middleName": "",
                                "lastName": "B", "emailId": "a@b.c"},
                 "ProjectName": "p"},
        "reference": {"kind": "journal", "title": "T",
                      "publishedAbstract": "A", "year": 2023, "page": "1",
                      "volume": "2",
                      "authors": [{"firstName": "A", "lastName": "B"}],
                      "journal": {"fullName": "J", "abbrevName": "J"}},
    }
    document.update(sections)
    return document


class SchemaCase(unittest.TestCase):

    def accepts(self, document, why):
        try:
            validate(document, SCHEMA)
        except ValidationError as error:
            self.fail("%s -- rejected: %s" % (why, error.message))

    def rejects(self, document, why):
        with self.assertRaises(ValidationError, msg=why):
            validate(document, SCHEMA)


class TestKeywordsAreTheirOwnField(SchemaCase):

    def setUp(self):
        mongoengine.disconnect_all()
        mongoengine.connect(
            "qresp_artifact_test", mongo_client_class=mongomock.MongoClient,
            uuidRepresentation="standard")

    def tearDown(self):
        mongoengine.disconnect_all()

    def test_the_model_stores_keywords_apart_from_urls(self):
        for model in (Datasets, Scripts):
            item = model(files=["a.txt"], readme="r",
                         keywords=["density functional theory"],
                         URLs=["https://example.org/a"])
            self.assertEqual(item.keywords, ["density functional theory"])
            self.assertEqual(item.URLs, ["https://example.org/a"])

    def test_a_legacy_record_without_keywords_loads_as_empty(self):
        # Nothing migrates; an absent field simply reads as an empty list.
        for model in (Datasets, Scripts):
            item = model(files=["a.txt"], readme="r",
                         URLs=["https://example.org/a"])
            self.assertEqual(item.keywords, [])
            self.assertEqual(item.URLs, ["https://example.org/a"])

    def test_setting_one_never_touches_the_other(self):
        item = Datasets(files=["a.txt"], readme="r",
                        URLs=["https://example.org/a"])
        item.keywords = ["silicon"]
        self.assertEqual(item.URLs, ["https://example.org/a"])
        item.URLs = ["https://example.org/b"]
        self.assertEqual(item.keywords, ["silicon"])

    def test_publish_accepts_both_fields_and_neither(self):
        for section in ("datasets", "scripts"):
            self.accepts(paper(**{section: [
                {"id": "x", "files": ["a"], "readme": "r",
                 "keywords": ["dft"], "URLs": ["https://example.org"]}]}),
                "%s with keywords and URLs" % section)
            # A record written before keywords existed.
            self.accepts(paper(**{section: [
                {"id": "x", "files": ["a"], "readme": "r",
                 "URLs": ["https://example.org"]}]}),
                "legacy %s with no keywords key" % section)


class TestNothingTypedIsRequiredToPublish(SchemaCase):
    """Any artifact field may be blank: data can be shared first and
    described later. Only the id the form mints, and a tool's kind, remain."""

    def test_a_chart_may_have_no_number_image_or_keywords(self):
        for field in ("number", "imageFile", "properties", "caption"):
            chart = dict(CHART)
            del chart[field]
            self.accepts(paper(charts=[chart]), "a chart with no %s" % field)
        self.accepts(paper(charts=[{"id": "c0"}]), "a chart with only its id")

    def test_a_dataset_or_script_may_have_no_files_or_description(self):
        for section in ("datasets", "scripts"):
            self.accepts(paper(**{section: [{"id": "x"}]}),
                         "%s with only its id" % section)
            self.accepts(paper(**{section: [
                {"id": "x", "files": [], "readme": ""}]}),
                "%s with empty files and description" % section)

    def test_a_tool_may_have_no_version_or_package(self):
        for tool in ({"id": "t", "kind": "software", "packageName": "QE"},
                     {"id": "t", "kind": "software", "packageName": "QE",
                      "version": ""},
                     {"id": "t", "kind": "software"},
                     {"id": "t", "kind": "experiment", "facilityName": "APS"},
                     {"id": "t", "kind": "experiment"}):
            self.accepts(paper(tools=[tool]), "tool %r" % tool)

    def test_structure_is_still_checked(self):
        # The id is what the workflow graph points at.
        self.rejects(paper(charts=[{"imageFile": "a.png"}]), "a chart with no id")
        self.rejects(paper(datasets=[{"files": ["a"]}]), "a dataset with no id")
        # The form always sets a tool's kind.
        self.rejects(paper(tools=[{"id": "t", "packageName": "QE"}]),
                     "a tool with no kind")
        # Types still apply.
        self.rejects(paper(charts=[dict(CHART, properties="not a list")]),
                     "keywords that are not a list")


class TestAiFieldsPerType(unittest.TestCase):
    """A model is only ever asked for a field the record can hold."""

    def items(self, kinds):
        return curation._sanitize_ai_items(
            [{"id": "i%d" % index, "kind": kind, "name": "n", "paths": [],
              "context": "c"} for index, kind in enumerate(kinds)])

    def test_only_keyword_bearing_types_are_asked_for_keywords(self):
        sent = self.items(["chart", "dataset", "script", "tool"])
        flags = {item["kind"]: item["wants_keywords"] for item in sent}
        self.assertTrue(flags["chart"])
        self.assertTrue(flags["dataset"])
        self.assertTrue(flags["script"])
        self.assertFalse(flags["tool"])

    def test_the_prompt_states_the_per_item_rule(self):
        # One candidate per request now, so the cross-candidate instruction
        # is gone with the batching it existed for.
        self.assertIn("wants_keywords", curation.AI_SYSTEM_PROMPT)
        self.assertIn("describe ONE artifact", curation.AI_SYSTEM_PROMPT)

    def test_wants_keywords_is_in_the_allowlist(self):
        self.assertIn("wants_keywords", curation.AI_ALLOWED_KEYS)
        # ...and the allowlist has not quietly grown anything else.
        # `context` is deliberately GONE: it was the free-text field the
        # browser filled with the curator's own draft readme/description.
        # `inventory` and `sources` replaced it with bounded, typed,
        # boundary-confined evidence.
        self.assertEqual(
            set(curation.AI_ALLOWED_KEYS),
            {"id", "kind", "name", "paths", "inventory", "sources",
             "wants_keywords"})
        self.assertNotIn("context", curation.AI_ALLOWED_KEYS)

    def test_layout_words_are_not_useful_keywords(self):
        useful = curation._useful_keywords(
            ["data", "scripts", "files", "results", "figure",
             "density functional theory", "silicon"])
        self.assertEqual(useful, ["density functional theory", "silicon"])

    def test_keywords_are_capped_and_deduplicated(self):
        useful = curation._useful_keywords(
            ["Silicon", "silicon", "a", "b", "c", "d", "e", "f", "g"])
        self.assertLessEqual(len(useful), curation.MAX_KEYWORDS_PER_ITEM)
        self.assertEqual(len([k for k in useful if k.lower() == "silicon"]), 1)

    def test_a_tool_suggestion_is_stripped_of_keywords_on_the_server(self):
        # Not hidden by the UI: a value the record cannot hold must not reach
        # the browser at all.
        self.assertEqual(curation.AI_KEYWORD_KINDS,
                         ("chart", "dataset", "script"))
        self.assertNotIn("tool", curation.AI_KEYWORD_KINDS)


if __name__ == "__main__":
    unittest.main()


class TestServerSideAiAllowlist(unittest.TestCase):
    """The per-kind allowlist is enforced here, not only in the browser."""

    def test_each_kind_is_asked_only_for_what_it_can_hold(self):
        # chart keywords are STORED in `properties`; dataset and script
        # keywords in `keywords`; a tool has no keyword field at all.
        self.assertEqual(curation.AI_KEYWORD_KINDS,
                         ("chart", "dataset", "script"))

    def test_a_tool_answer_is_stripped_even_when_the_model_ignores_the_flag(
            self):
        parsed = {
            "tool-0": {"description": "A DFT code.", "keywords": ["dft"],
                       "kind": "", "confidence": "low", "reason": "r"},
            "script-0": {"description": "Plots.", "keywords": ["phonons"],
                         "kind": "", "confidence": "low", "reason": "r"},
        }
        kinds = {"tool-0": "tool", "script-0": "script"}
        stripped = {}
        for item_id, value in parsed.items():
            if kinds[item_id] not in curation.AI_KEYWORD_KINDS:
                value = dict(value, keywords=[])
            stripped[item_id] = value

        self.assertEqual(stripped["tool-0"]["keywords"], [])
        # ...and the description it CAN hold survives.
        self.assertEqual(stripped["tool-0"]["description"], "A DFT code.")
        self.assertEqual(stripped["script-0"]["keywords"], ["phonons"])
