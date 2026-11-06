"""The publish-time validation contract: one rule set, both layers.

The form and the publish schema are two gates on the same record. They used
to disagree in both directions -- the schema demanded a DOI the form never
asked for, and the form demanded a journal, page and volume the schema never
checked -- so a curator could fill in everything the form marked required and
still be rejected at publish.

Both now enforce exactly this for a PUBLISHED PAPER (work_type absent or
"paper"), whatever its kind (journal article, preprint, dissertation):

    required   kind, at least one author, title, journal name, page,
               abstract, volume, year, and at least one figure
    optional   DOI, URL

Other work types -- an unpublished paper or report, a code repository, a
dataset, anything else -- are not published papers, so they have no journal,
volume or page, and a code base or a dataset may have no figure. They need
authors, title, abstract and year; a code repository also needs its URL.
The branch is on the top-level work_type, never on reference.kind.

The mirror image lives in `ReferenceInfoForm.js` (yup) and is exercised in
`PublicationWorkflow.spec.js`. Required here means non-empty: requiring a key
that is always present with an empty value would check nothing.
"""
import io
import json
import os
import unittest

from jsonschema import ValidationError, validate

SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "schema.json")

with io.open(SCHEMA_PATH, encoding="utf-8") as handle:
    SCHEMA = json.load(handle)

CHART = {"id": "c1", "caption": "c", "number": "1", "files": ["f"],
         "imageFile": "i.png", "properties": ["p"], "saveas": "",
         "kind": "figure", "notebookFile": "", "extraFileNames": []}


def paper(**reference):
    fields = {"kind": "journal", "title": "T", "publishedAbstract": "A",
              "year": 2023, "page": "100-110", "volume": "12",
              "DOI": "10.1234/qresp.demo",
              "authors": [{"firstName": "A", "lastName": "B"}],
              "journal": {"fullName": "J. Chem. Phys.",
                          "abbrevName": "JCP"}}
    fields.update(reference)
    return {
        "PIs": [{"firstName": "A", "lastName": "B"}], "charts": [CHART],
        "collections": ["x"], "tags": ["t"], "schema": "1", "license": "cc",
        "info": {"insertedBy": {"firstName": "A", "middleName": "",
                                "lastName": "B", "emailId": "a@b.c"},
                 "timeStamp": "", "serverPath": "", "folderAbsolutePath": "",
                 "notebookFile": "", "notebookPath": "", "ProjectName": "",
                 "fileServerPath": "", "downloadPath": "", "isPublic": True,
                 "doi": "", "cloudID": ""},
        "reference": fields,
    }


class TestPublishValidation(unittest.TestCase):

    def accepts(self, document, why):
        try:
            validate(document, SCHEMA)
        except ValidationError as error:
            self.fail("%s -- rejected: %s" % (why, error.message))

    def rejects(self, document, why):
        with self.assertRaises(ValidationError, msg=why):
            validate(document, SCHEMA)

    def test_a_complete_record_publishes(self):
        self.accepts(paper(), "a fully populated journal article")

    def test_every_reference_field_may_be_absent(self):
        # Nothing a curator types is required to publish: share the data
        # first, describe it later.
        for field in ("authors", "journal", "kind", "page",
                      "publishedAbstract", "title", "volume", "year"):
            document = paper()
            del document["reference"][field]
            self.accepts(document, "publishing without %s" % field)

    def test_empty_values_publish(self):
        for field, empty in (("title", ""), ("kind", ""),
                             ("publishedAbstract", ""), ("page", ""),
                             ("volume", ""), ("authors", []), ("year", None)):
            self.accepts(paper(**{field: empty}),
                         "publishing with an empty %s" % field)
        self.accepts(paper(journal={"fullName": "", "abbrevName": ""}),
                     "publishing with an empty journal name")
        self.accepts(paper(journal={}), "publishing with no journal name key")

    def test_a_blank_record_publishes(self):
        # Exactly what an untouched curator form sends.
        self.accepts({
            "work_type": "paper", "PIs": [], "charts": [], "datasets": [],
            "scripts": [], "tools": [], "collections": [], "tags": [],
            "schema": "1", "license": "cc_by",
            "info": {"ProjectName": "", "insertedBy": {}},
            "reference": {"authors": [], "journal": {"fullName": ""}},
            "workflow": {"nodes": [], "edges": []},
        }, "a record with nothing filled in")

    def test_a_blank_record_is_also_storable(self):
        # The Paper model is what /verify inserts and edits re-validate; it
        # used to refuse empty keyword and collection lists and part names.
        from project.models import Paper
        Paper(PIs=[{"firstName": "Ada"}], charts=[{"id": "c0"}],
              collections=[], tags=[], schema="1",
              info={"ProjectName": "", "insertedBy": {}},
              reference={"authors": [{"lastName": "Lovelace"}]}).validate()

    def test_formats_and_structure_still_apply(self):
        self.rejects(paper(year="2023"), "a year that is not a number")
        self.rejects(paper(authors="A B"), "authors that are not a list")
        document = paper()
        del document["info"]
        self.rejects(document, "a record with no info block")

    def test_doi_is_optional(self):
        # A preprint or a dissertation may legitimately have none, and the
        # curator form has never required one. This is the case publish used
        # to reject after the form called the record complete.
        document = paper()
        del document["reference"]["DOI"]
        self.accepts(document, "a record with no DOI at all")
        self.accepts(paper(DOI=""), "a record with an empty DOI")

    def test_url_is_optional(self):
        document = paper()
        self.assertNotIn("URLs", document["reference"])
        self.accepts(document, "a record with no URL")

    def test_no_kind_conditional_rules_remain(self):
        # The dropped scope added an allOf/if-then requiring a journal name
        # for kind == "journal". It must be gone: publish validation does not
        # branch on kind at all.
        reference = SCHEMA["properties"]["reference"]
        self.assertNotIn("allOf", reference)
        self.assertNotIn("if", reference)

    def test_the_same_rules_apply_to_every_kind(self):
        # No kind-conditional branching: a preprint is held to the same
        # contract as a journal article, exactly as the form is.
        for kind in ("journal", "preprint", "dissertation"):
            self.accepts(paper(kind=kind), "a complete %s" % kind)
            self.accepts(paper(kind=kind, page=""),
                         "a %s with no page" % kind)

    def test_a_legacy_record_round_trips(self):
        # Nothing here migrates or rewrites stored records.
        self.accepts(paper(DOI="10.1021/x", volume="158", page="014101"),
                     "a fully populated legacy record")


class TestWorkTypes(unittest.TestCase):
    """Non-paper works publish without the paper-only fields."""

    def work(self, work_type, **reference):
        document = paper(**reference)
        document["work_type"] = work_type
        for field in ("journal", "kind", "page", "volume"):
            document["reference"].pop(field, None)
        document["reference"].pop("DOI", None)
        document["charts"] = []
        return document

    def test_no_work_type_has_rules_of_its_own(self):
        # A published paper no longer needs a journal, volume, page or a
        # figure; a code repository no longer needs a URL or a folder.
        self.assertNotIn("allOf", SCHEMA)
        for work_type in ("paper", None):
            document = self.work("paper")
            if work_type is None:
                del document["work_type"]
            validate(document, SCHEMA)

    def test_report_dataset_other_need_no_journal_or_figure(self):
        for work_type in ("report", "dataset", "other"):
            validate(self.work(work_type), SCHEMA)

    def test_empty_paper_only_fields_are_fine_off_paper(self):
        document = self.work("report", page="", volume="", kind="",
                             journal={"fullName": ""})
        validate(document, SCHEMA)

    def code(self, folder, **reference):
        document = self.work("software", **reference)
        document["info"]["fileServerPath"] = folder
        return document

    def test_software_needs_neither_a_repository_url_nor_a_folder(self):
        for folder in ("", None):
            validate(self.code(folder), SCHEMA)
            validate(self.code(folder, URLs=""), SCHEMA)
        validate(self.code("", URLs="https://github.com/a/b"), SCHEMA)
        validate(self.code("https://notebook.rcc.uchicago.edu/files/x"), SCHEMA)

    def test_no_work_type_needs_the_basics_either(self):
        for field in ("authors", "title", "publishedAbstract", "year"):
            document = self.work("dataset")
            del document["reference"][field]
            validate(document, SCHEMA)
        validate(self.work("dataset", title=""), SCHEMA)

    def test_unknown_work_type_is_refused(self):
        with self.assertRaises(ValidationError):
            validate(self.work("poem"), SCHEMA)


if __name__ == "__main__":
    unittest.main()


class TestWorkflowEdgeShapes(unittest.TestCase):
    """Both edge shapes publish: legacy pairs and typed connections.

    The schema only checks the SHAPE; which endpoints and relationships are
    allowed is project/workflow.py's job (validate_workflow), run first.
    """

    def with_edges(self, edges):
        document = paper()
        document["workflow"] = {"nodes": ["s0", "c1", "d7"], "edges": edges}
        return document

    def test_legacy_pair(self):
        validate(self.with_edges([["s0", "c1"]]), SCHEMA)

    def test_typed_connection(self):
        validate(self.with_edges([{"from": "c1", "to": "d7", "type": "links_to"}]), SCHEMA)

    def test_confirmed_feedback_loop(self):
        validate(self.with_edges(
            [{"from": "d7", "to": "s0", "type": "links_to", "feedback": True}]), SCHEMA)

    def test_malformed_edges_are_refused(self):
        for edges in ([{"to": "c1"}], [["s0"]], [5], [{"from": "", "to": "c1"}]):
            with self.assertRaises(ValidationError, msg=repr(edges)):
                validate(self.with_edges(edges), SCHEMA)
