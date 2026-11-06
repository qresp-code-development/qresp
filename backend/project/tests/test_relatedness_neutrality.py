"""What a recommendation is NOT allowed to depend on.

Two kinds of metadata are carried on a record, shown to readers, and have no
part in deciding anything: the people who wrote it, and the collections it
belongs to. The gate stopped consulting them, but the code kept computing
them and the cache kept hashing them -- so editing an author's spelling threw
away a cached Semantic Scholar answer that could not have changed.

These tests state the contract from the outside: same candidates, same order,
same reasons, same verdicts, and the same fingerprint. They deliberately do
not name any internal field, so the implementation stays free to drop the
state entirely.
"""
import unittest

from project import relatedness as R
from project.tests.test_relatedness import filler, record, stats_for


def visible(current, candidates, corpus):
    """Exactly what a reader gets: order, reasons, and every gate verdict."""
    stats = stats_for(corpus)
    source = R.build_internal_profile(current)
    profiles = [R.build_internal_profile(r) for r in candidates]
    gate = sorted("%s=%s" % (p.key, R.assess(source, p, stats).passes)
                  for p in profiles)
    shown = [(p.key, round(a.score, 6), tuple(a.reasons(3)))
             for p, a in R.rank(source, profiles, stats)]
    return gate, shown


PEOPLE = ["Ada Lovelace", "Grace Hopper"]
OTHERS = ["Someone Entirely Else", "Another Person"]


def scenario(authors=PEOPLE, collections=("MICCOM",)):
    """One source and three candidates whose ONLY differences are topical."""
    kwargs = {"authors": list(authors), "collections": list(collections)}
    current = record("a", "Gadgetite resonance spectroscopy",
                     "Gadgetite lattices under pressure.",
                     tags=["rareword resonance"], tools=["RarePackage"],
                     **kwargs)
    candidates = [
        record("b", "Gadgetite resonance imaging", "Gadgetite imaging.",
               tags=["rareword resonance"], tools=["RarePackage"], **kwargs),
        record("c", "Gadgetite resonance theory", "Gadgetite theory.",
               tags=["rareword resonance"], **kwargs),
        record("d", "An unrelated matter", "Nothing whatsoever in common.",
               **kwargs),
    ]
    return current, candidates


class TestAuthorsDecideNothing(unittest.TestCase):
    """Authors are display metadata. Nothing else."""

    def outcome(self, authors):
        current, candidates = scenario(authors=authors)
        return visible(current, candidates,
                       filler(20) + [current] + candidates)

    def test_removing_every_author_changes_nothing_a_reader_sees(self):
        self.assertEqual(self.outcome(PEOPLE), self.outcome([]))

    def test_replacing_every_author_changes_nothing_a_reader_sees(self):
        self.assertEqual(self.outcome(PEOPLE), self.outcome(OTHERS))

    def test_a_shared_author_cannot_break_a_tie(self):
        # Two candidates identical in subject; one shares every author with
        # the source. The order must be decided by the work -- year, then
        # title -- and not by the person.
        def order(shared_authors):
            current = record("a", "Gadgetite resonance", "Gadgetite.",
                             authors=PEOPLE)
            near = record("b", "Gadgetite resonance one", "Gadgetite.",
                          authors=PEOPLE if shared_authors else OTHERS,
                          year=2019)
            far = record("c", "Gadgetite resonance one", "Gadgetite.",
                         authors=OTHERS, year=2021)
            corpus = filler(20) + [current, near, far]
            stats = stats_for(corpus)
            return [p.key for p, _ in R.rank(
                R.build_internal_profile(current),
                [R.build_internal_profile(near), R.build_internal_profile(far)],
                stats)]

        self.assertEqual(order(True), order(False))
        self.assertEqual(["c", "b"], order(True))

    def test_no_reason_ever_names_a_person(self):
        current, candidates = scenario()
        _gate, shown = visible(current, candidates,
                               filler(20) + [current] + candidates)
        blob = " ".join(text for _key, _score, reasons in shown
                        for text in reasons).lower()
        for name in PEOPLE + OTHERS:
            for part in name.lower().split():
                self.assertNotIn(part, blob, part)

    def test_candidate_authors_are_still_returned_for_display(self):
        # The one thing authors ARE for. Dropping them from scoring must not
        # drop them from the answer the UI renders.
        from project import related
        profile = R.build_internal_profile(
            record("b", "Gadgetite resonance imaging", "Gadgetite.",
                   authors=PEOPLE))
        stats = stats_for(filler(20) + [record("a", "Gadgetite", "G.")])
        assessment = R.assess(profile, profile, stats)
        result = related._result(profile, assessment, "internal")
        self.assertIn("authors", result)
        self.assertIn("Ada Lovelace", result["authors"])


class TestCollectionsDecideNothing(unittest.TestCase):
    """A collection is a programme a record belongs to, not a subject."""

    def outcome(self, collections):
        current, candidates = scenario(collections=collections)
        return visible(current, candidates,
                       filler(20) + [current] + candidates)

    def test_removing_every_collection_changes_nothing_a_reader_sees(self):
        self.assertEqual(self.outcome(("MICCOM",)), self.outcome(()))

    def test_replacing_every_collection_changes_nothing_a_reader_sees(self):
        self.assertEqual(self.outcome(("MICCOM",)),
                         self.outcome(("SOMETHING-ELSE",)))

    def test_a_shared_collection_cannot_pass_a_pair(self):
        current = record("a", "Gadgetite resonance spectroscopy",
                         "Gadgetite lattices under hydrostatic pressure.",
                         collections=["MICCOM"])
        candidate = record("b", "Cogwheelene surface chemistry",
                           "Cogwheelene adsorption energetics on oxides.",
                           collections=["MICCOM"])
        corpus = filler(20) + [current, candidate]
        stats = stats_for(corpus)
        outcome = R.assess(R.build_internal_profile(current),
                           R.build_internal_profile(candidate), stats)
        self.assertFalse(outcome.passes)

    def test_no_reason_ever_names_a_collection(self):
        current, candidates = scenario()
        _gate, shown = visible(current, candidates,
                               filler(20) + [current] + candidates)
        blob = " ".join(text for _key, _score, reasons in shown
                        for text in reasons).lower()
        self.assertNotIn("miccom", blob)
        self.assertNotIn("research area", blob)


class TestFingerprintTracksOnlyWhatDecides(unittest.TestCase):
    """The cache key must move for exactly the edits that can change an answer.

    Too narrow and a stale recommendation survives an edit; too wide and a
    Semantic Scholar answer is thrown away -- and re-fetched -- because
    somebody fixed the spelling of an author's name.
    """

    def base(self):
        return record("p", "Widget dynamics", "About widgets.",
                      tags=["widget"], authors=["Robin Sharedname"],
                      collections=["a-programme"], tools=["ToolPackage"],
                      dataset_keywords=["numbers"],
                      chart_properties=["energy"])

    def assert_same(self, mutate, label):
        changed = self.base()
        mutate(changed)
        self.assertEqual(R.metadata_fingerprint(self.base()),
                         R.metadata_fingerprint(changed), label)

    def assert_differs(self, mutate, label):
        changed = self.base()
        mutate(changed)
        self.assertNotEqual(R.metadata_fingerprint(self.base()),
                            R.metadata_fingerprint(changed), label)

    def test_author_edits_do_not_invalidate_the_external_cache(self):
        cases = {
            "author added": lambda r: r["reference"]["authors"].append(
                {"firstName": "New", "middleName": "", "lastName": "Person"}),
            "author renamed": lambda r: r["reference"]["authors"][0].__setitem__(
                "lastName", "Renamed"),
            "authors removed": lambda r: r["reference"].__setitem__(
                "authors", []),
        }
        for label, mutate in cases.items():
            with self.subTest(field=label):
                self.assert_same(mutate, label)

    def test_collection_edits_do_not_invalidate_the_external_cache(self):
        cases = {
            "collection added": lambda r: r["collections"].append("another"),
            "collections removed": lambda r: r.__setitem__("collections", []),
            "collection renamed": lambda r: r.__setitem__(
                "collections", ["renamed-programme"]),
        }
        for label, mutate in cases.items():
            with self.subTest(field=label):
                self.assert_same(mutate, label)

    def test_every_input_that_can_change_an_answer_still_moves_it(self):
        cases = {
            "doi": lambda r: r["reference"].__setitem__("DOI", "10.1/other"),
            "title": lambda r: r["reference"].__setitem__("title", "Other"),
            "abstract": lambda r: r["reference"].__setitem__(
                "publishedAbstract", "Something else entirely."),
            "tags": lambda r: r["tags"].append("added"),
            "chart properties": lambda r: r["charts"][0]["properties"].append(
                "pressure"),
            "chart caption": lambda r: r["charts"][0].__setitem__(
                "caption", "A new caption"),
            "dataset keywords": lambda r: r["datasets"][0]["keywords"].append(
                "extra"),
            "dataset description": lambda r: r["datasets"][0].__setitem__(
                "readme", "Now described."),
            "script added": lambda r: r["scripts"].append(
                {"readme": "A script", "keywords": ["fitting"]}),
            "tool package": lambda r: r["tools"][0].__setitem__(
                "packageName", "OtherPackage"),
            "tool measurement": lambda r: r["tools"][0].__setitem__(
                "measurement", "spectroscopy"),
            # A facility name still counts: it decides which terms are
            # EXCLUDED as organisational, so editing it can change an answer
            # even though it never becomes a term itself.
            "tool facility": lambda r: r["tools"][0].__setitem__(
                "facilityname", "Some Beamline"),
        }
        for label, mutate in cases.items():
            with self.subTest(field=label):
                self.assert_differs(mutate, label)

    def test_the_version_moved_so_old_entries_are_a_miss(self):
        # The allowlist changed, so entries hashed under the previous one
        # would otherwise be compared against a digest that can never match
        # -- harmless but silent. Moving the version says why.
        self.assertNotIn(R.FINGERPRINT_VERSION, ("1", "2"))

    def test_the_gate_version_is_past_every_behaviour_it_no_longer_serves(self):
        # This cleanup changed no verdict, so it did not move the version --
        # which is why the assertion is not "the version is N". Later changes
        # DID move it, and pinning a literal here would have made an honest
        # bump look like a regression.
        #
        # What must stay true is that no version describing a product that no
        # longer exists can be served as if it were the current one:
        #   1, 2  the old gates
        #   3     the last version whose external list held at most three
        #         results chosen from a 20-candidate pool
        from project import related
        self.assertNotIn(related.ALGORITHM_VERSION, ("1", "2", "3"))


class TestTheQualityContractIsUnchanged(unittest.TestCase):
    """The guarantees the previous change bought, re-asserted from outside so
    this cleanup cannot quietly cost any of them."""

    def test_organisations_software_and_furniture_stay_out(self):
        facility = [{"facilityName": "University of Wisconsin-Madison"},
                    {"packageName": "Microsoft PowerPoint"}]
        current = dict(record("a", "Gadgetite resonance spectroscopy",
                              "Gadgetite lattices; see fig4 and table1.",
                              collections=["MICCOM"]), tools=facility)
        candidate = dict(record("b", "Cogwheelene surface chemistry",
                                "Cogwheelene adsorption; see fig4 and table1.",
                                collections=["MICCOM"]), tools=facility)
        corpus = filler(20) + [current, candidate]
        stats = stats_for(corpus)
        outcome = R.assess(R.build_internal_profile(current),
                           R.build_internal_profile(candidate), stats)
        self.assertFalse(outcome.passes)
        blob = " ".join(e.text for e in outcome.evidence).lower()
        for term in ("university", "wisconsin", "powerpoint", "microsoft",
                     "fig4", "table1", "miccom"):
            self.assertNotIn(term, blob, term)

    def test_a_shared_tool_alone_still_does_not_pass(self):
        current = record("a", "Gadgetite resonance spectroscopy",
                         "Gadgetite lattices under hydrostatic pressure.",
                         tools=["RarePackage"])
        candidate = record("b", "Cogwheelene surface chemistry",
                           "Cogwheelene adsorption energetics on oxides.",
                           tools=["RarePackage"])
        stats = stats_for(filler(20) + [current, candidate])
        outcome = R.assess(R.build_internal_profile(current),
                           R.build_internal_profile(candidate), stats)
        self.assertFalse(outcome.passes)

    def test_the_caps_and_the_empty_answer_still_hold(self):
        current = record("a", "Gadgetite resonance spectroscopy", "Gadgetite.")
        related_records = [record("r%d" % i,
                                  "Gadgetite resonance study %d" % i,
                                  "Gadgetite resonance.") for i in range(6)]
        stats = stats_for(filler(20) + [current] + related_records)
        self.assertEqual(R.MAX_RESULTS, len(R.rank(
            R.build_internal_profile(current),
            [R.build_internal_profile(r) for r in related_records], stats)))

        unrelated = [record("u%d" % i, "Wholly different matter %d" % i,
                            "Nothing whatsoever in common.")
                     for i in range(5)]
        stats = stats_for(filler(20) + [current] + unrelated)
        self.assertEqual([], R.rank(
            R.build_internal_profile(current),
            [R.build_internal_profile(r) for r in unrelated], stats))

    def test_external_candidates_face_the_same_gate(self):
        current = record("a", "Gadgetite resonance spectroscopy", "Gadgetite.")
        stats = stats_for(filler(20) + [current])
        source = R.build_internal_profile(current)

        def external(title, abstract):
            return R.build_external_profile(
                {"key": title, "title": title, "abstract": abstract,
                 "year": 2021, "authors": ["Ada Lovelace"], "doi": "",
                 "url": "", "fields": ["Physics"]})

        self.assertTrue(R.assess(
            source, external("Gadgetite resonance imaging",
                             "More gadgetite resonance."), stats).passes)
        self.assertFalse(R.assess(
            source, external("An entirely unrelated matter",
                             "Nothing in common at all."), stats).passes)

    def test_an_external_candidates_authors_and_fields_decide_nothing(self):
        current = record("a", "Gadgetite resonance spectroscopy", "Gadgetite.")
        stats = stats_for(filler(20) + [current])
        source = R.build_internal_profile(current)

        def external(authors, fields):
            return R.build_external_profile(
                {"key": "x", "title": "Gadgetite resonance imaging",
                 "abstract": "More gadgetite resonance.", "year": 2021,
                 "authors": authors, "doi": "", "url": "", "fields": fields})

        one = R.assess(source, external(["Ada Lovelace"], ["Physics"]), stats)
        two = R.assess(source, external([], []), stats)
        self.assertEqual(one.passes, two.passes)
        self.assertEqual(round(one.score, 6), round(two.score, 6))
        self.assertEqual(one.reasons(3), two.reasons(3))


if __name__ == "__main__":
    unittest.main()
