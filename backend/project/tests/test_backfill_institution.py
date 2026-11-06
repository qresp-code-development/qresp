"""The one-time Institution backfill.

The whole risk of this tool is that it writes to real records, so every test
here is about what it REFUSES to touch. `institution` is curator-entered
metadata; a tool that overwrote a typed value, or stamped a staging fixture,
would be worse than no tool at all.
"""

import unittest

import mongoengine
import mongomock

from project.models import Paper, Reference
from project.tools import backfill_institution as backfill


UCHICAGO = "University of Chicago"


def record(title, doi="10.1000/x", institution=None):
    paper = Paper(
        collections=["c"], schema="1.0", tags=["t"], license="CC-BY",
        reference=Reference(title=title, DOI=doi),
    )
    if institution is not None:
        paper.institution = institution
    paper.save()
    return paper


class BackfillTestCase(unittest.TestCase):
    def setUp(self):
        mongoengine.disconnect_all()
        mongoengine.connect("mongoenginetest",
                            mongo_client_class=mongomock.MongoClient)

    def tearDown(self):
        Paper.drop_collection()
        mongoengine.disconnect_all()

    def ids(self, rows):
        return {row["id"] for row in rows}


class TestSelection(BackfillTestCase):
    def test_a_published_record_with_no_institution_is_eligible(self):
        paper = record("Hydrogen treatment of lead chalcogenide films")
        eligible, skipped, _ = backfill.apply_backfill(UCHICAGO)
        self.assertEqual({str(paper.id)}, self.ids(eligible))
        self.assertEqual([], skipped)

    def test_an_existing_institution_is_never_overwritten(self):
        # Whatever it says, and even when it says something else entirely:
        # somebody typed it, and this tool is not the authority on it.
        keep = record("A paper from elsewhere", doi="10.1000/a",
                      institution="Duke University")
        same = record("A paper already stamped", doi="10.1000/b",
                      institution=UCHICAGO)
        eligible, skipped, written = backfill.apply_backfill(
            UCHICAGO, execute=True)
        self.assertEqual([], eligible)
        self.assertEqual(0, written)
        self.assertEqual({str(keep.id), str(same.id)}, self.ids(skipped))
        self.assertEqual("Duke University",
                         Paper.objects(id=keep.id).first().institution)

    def test_a_record_with_no_title_or_no_doi_is_left_alone(self):
        # What a half-finished draft looks like from here.
        untitled = record("", doi="10.1000/c")
        undoi = record("A real title but no DOI", doi="")
        eligible, skipped, _ = backfill.apply_backfill(UCHICAGO)
        self.assertEqual([], eligible)
        self.assertEqual({str(untitled.id), str(undoi.id)}, self.ids(skipped))

    def test_staging_and_qa_records_are_left_alone(self):
        titles = [
            "STAGING TEST Qresp auth edit 2026-07-06",
            "Test record for the importer",
            "QA fixture: charts",
            "dummy paper",
            "Lorem ipsum dolor sit amet",
            "placeholder while we wait",
            "DELETE ME after the demo",
        ]
        made = [record(t, doi="10.1000/s%d" % i)
                for i, t in enumerate(titles)]
        eligible, skipped, _ = backfill.apply_backfill(UCHICAGO)
        self.assertEqual([], eligible)
        self.assertEqual({str(p.id) for p in made}, self.ids(skipped))

    def test_a_real_title_containing_the_word_test_is_not_excluded(self):
        # "Testing" in a scientific sense is not a staging artefact. The
        # pattern is anchored so it does not eat real research.
        paper = record("Testing the limits of chalcogenide nanostructures")
        eligible, _, _ = backfill.apply_backfill(UCHICAGO)
        self.assertEqual({str(paper.id)}, self.ids(eligible))

    def test_an_explicitly_excluded_id_is_left_alone(self):
        keep = record("A paper somebody wants to handle by hand",
                      doi="10.1000/keep")
        other = record("An ordinary paper", doi="10.1000/other")
        eligible, skipped, _ = backfill.apply_backfill(
            UCHICAGO, excluded_ids=frozenset([str(keep.id)]))
        self.assertEqual({str(other.id)}, self.ids(eligible))
        self.assertEqual({str(keep.id)}, self.ids(skipped))

    def test_every_skipped_record_says_why(self):
        record("", doi="10.1000/a")
        record("Has one", doi="10.1000/b", institution="Somewhere")
        record("STAGING TEST thing", doi="10.1000/c")
        _, skipped, _ = backfill.apply_backfill(UCHICAGO)
        reasons = sorted(row["reason"] for row in skipped)
        self.assertEqual(3, len(reasons))
        for reason in reasons:
            self.assertTrue(reason.strip())


class TestDryRunAndExecute(BackfillTestCase):
    def test_a_dry_run_writes_nothing(self):
        paper = record("A paper that should not change yet")
        eligible, _, written = backfill.apply_backfill(UCHICAGO)
        self.assertEqual(1, len(eligible))
        self.assertEqual(0, written)
        stored = Paper.objects(id=paper.id).first()
        self.assertFalse(getattr(stored, "institution", "") or "")

    def test_execute_writes_exactly_the_eligible_records(self):
        good = record("A real paper", doi="10.1000/good")
        staging = record("STAGING TEST fixture", doi="10.1000/stg")
        taken = record("Already stamped", doi="10.1000/tk",
                       institution="Duke University")
        eligible, _, written = backfill.apply_backfill(
            UCHICAGO, execute=True)
        self.assertEqual(1, written)
        self.assertEqual({str(good.id)}, self.ids(eligible))
        self.assertEqual(UCHICAGO,
                         Paper.objects(id=good.id).first().institution)
        self.assertFalse(
            getattr(Paper.objects(id=staging.id).first(), "institution", "")
            or "")
        self.assertEqual("Duke University",
                         Paper.objects(id=taken.id).first().institution)

    def test_running_it_twice_changes_nothing_the_second_time(self):
        record("A real paper")
        _, _, first = backfill.apply_backfill(UCHICAGO, execute=True)
        eligible, _, second = backfill.apply_backfill(UCHICAGO, execute=True)
        self.assertEqual(1, first)
        self.assertEqual(0, second)
        self.assertEqual([], eligible)

    def test_the_exact_value_is_written_never_an_abbreviation(self):
        paper = record("A real paper")
        backfill.apply_backfill("University of Chicago", execute=True)
        self.assertEqual("University of Chicago",
                         Paper.objects(id=paper.id).first().institution)


class TestNothingIsInferred(BackfillTestCase):
    def test_the_module_reads_no_hostname_and_no_author_affiliation(self):
        # The rule this tool must not break, checked at the source: the value
        # comes from the operator's --institution and from nowhere else.
        import io as _io
        source = _io.open(backfill.__file__, encoding="utf-8").read()
        body = source.split('"""', 2)[-1]
        for forbidden in ("hostname", "gethostname", "affiliation",
                          "emailId", "urlparse", "QRESP_"):
            self.assertNotIn(forbidden, body, forbidden)

    def test_no_application_module_references_it(self):
        # Nothing runs this at startup, or on a request, or ever, except a
        # person at a shell. Checked by looking at what the application
        # actually imports rather than at this test process's module table --
        # this file imports the tool itself, so that would prove nothing.
        import glob
        import io as _io
        import os
        here = os.path.dirname(os.path.dirname(os.path.abspath(
            backfill.__file__)))
        offenders = []
        for path in glob.glob(os.path.join(here, "*.py")):
            text = _io.open(path, encoding="utf-8").read()
            if "backfill_institution" in text:
                offenders.append(os.path.basename(path))
        self.assertEqual([], offenders)


if __name__ == "__main__":
    unittest.main()
