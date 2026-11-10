"""Where a term came from decides what it may prove.

The failure this pins, measured on a real 65-record server: of the 150
recommendations actually shown, a large minority were justified to readers by
terms that say nothing about a subject --

    university wisconsin-madison, argonne national lab, microsoft powerpoint,
    fig4, fig5, table1, represented, positioned, individual, principal,
    conventional, highlighting

Four separate mechanisms produced them, and none was fixable by lengthening a
blocklist:

  * `LONG_TECHNICAL_LENGTH = 9` -- any plain word of nine letters was subject
    vocabulary, so `conventional` qualified exactly as `chalcogenide` did;
  * "a digit or a hyphen makes it technical" -- so did `fig4` and `panel-a`;
  * `facilityName` was read as a METHOD, and a shared method plus any topic
    word was the strongest verdict the gate has;
  * `packageName` took the same path, so sharing PowerPoint was strong
    evidence.

The fix is provenance: `Profile.term_sources` records whether a word came from
a title, a curated tag, an abstract, prose, software, a technique or an
organisation, and the gate asks. `chalcogenide` and `conventional` are the
same shape and the same rarity -- what separates them is that one of them is
in somebody's title.

Vocabulary here is synthetic. The module under test hardcodes no DOI, title,
material or facility, so these fixtures invent a corpus and still exercise the
real thresholds.
"""
import unittest

from project import relatedness as R
from project.tests.test_relatedness import filler, record, stats_for


def assess(current, candidate, corpus, citations=frozenset()):
    stats = stats_for(corpus)
    return R.assess(R.build_internal_profile(current),
                    R.build_internal_profile(candidate), stats, citations)


def reasons_of(outcome):
    return " | ".join(e.text for e in outcome.evidence).lower()


# The exact strings a reader was shown. None may ever appear again.
POLLUTED = (
    "university", "wisconsin-madison", "argonne", "national lab",
    "laboratory", "institute", "foundation",
    "powerpoint", "microsoft",
    "fig4", "fig5", "table1", "panel-a",
    "represented", "positioned", "individual", "principal",
    "conventional", "highlighting",
)


class TestTheLengthRuleIsGone(unittest.TestCase):
    """A plain word is never technical because of how long it is."""

    def test_long_ordinary_words_have_no_technical_shape(self):
        for word in ("represented", "positioned", "individual", "principal",
                     "conventional", "highlighting", "containing",
                     "relatively", "gadgetite", "chalcogenide"):
            self.assertFalse(R.has_technical_shape(word), word)

    def test_inflections_are_caught_by_the_stem_already_listed(self):
        # `highlight`, `represent` and `position` were already in the ordinary
        # lists; their participles were not, and were being shown to readers.
        # Stemming the check means the lists stop having holes.
        for word in ("highlighting", "highlighted", "represented",
                     "representing", "positioned", "positioning",
                     "relatively"):
            self.assertTrue(R.is_ordinary(word), word)

    def test_a_long_word_still_counts_when_a_title_states_it(self):
        # The direction that MUST be preserved: real vocabulary is not lost,
        # it is merely required to come from somewhere deliberate.
        current = record("a", "Chalcogenide nanoparticle trap states",
                         "We look at things.")
        candidate = record("b", "Trap states in chalcogenide nanoparticles",
                           "We look at other things.")
        profile = R.build_internal_profile(current)
        self.assertIn("chalcogenide", profile.deliberate_terms)
        self.assertIn("chalcogenide", profile.technical_terms)
        outcome = assess(current, candidate, filler(20) + [current, candidate])
        self.assertIn("chalcogenide", outcome.shared_terms)

    def test_the_same_word_in_prose_only_is_not_a_research_term(self):
        # Same word, same rarity, same corpus -- only the provenance differs.
        current = record("a", "A study of one thing",
                         "The chalcogenide was mentioned only here.")
        candidate = record("b", "A study of another thing",
                           "The chalcogenide was mentioned only here too.")
        profile = R.build_internal_profile(current)
        self.assertNotIn("chalcogenide", profile.deliberate_terms)
        outcome = assess(current, candidate, filler(20) + [current, candidate])
        self.assertNotIn("chalcogenide", outcome.shared_terms)


class TestDocumentFurniture(unittest.TestCase):
    def test_structural_tokens_are_recognised(self):
        for token in ("fig4", "fig5", "figure2", "table1", "panel-a",
                      "page3", "slide12", "sec2", "eq4", "supplementary",
                      "fig", "table", "figures"):
            self.assertTrue(R.is_structural(token), token)

    def test_real_formulas_are_not_mistaken_for_furniture(self):
        for token in ("bivo4", "g0w0", "c60", "tio2", "nv-center",
                      "bethe-salpeter"):
            self.assertFalse(R.is_structural(token), token)

    def test_two_papers_both_having_a_figure_4_is_not_a_relationship(self):
        current = record(
            "a", "Gadgetite resonance spectroscopy",
            "Gadgetite lattices under pressure; see fig4, fig5 and table1.",
            chart_properties=["fig4"])
        candidate = record(
            "b", "Cogwheelene surface chemistry",
            "Cogwheelene adsorption energetics; see fig4, fig5 and table1.",
            chart_properties=["fig4"])
        outcome = assess(current, candidate, filler(20) + [current, candidate])
        self.assertFalse(outcome.passes)
        for token in ("fig4", "fig5", "table1"):
            self.assertNotIn(token, outcome.shared_terms)
            self.assertNotIn(token, reasons_of(outcome))


class TestOrganizationsAreNotMethods(unittest.TestCase):
    def test_a_facility_name_is_recognised_as_an_organisation(self):
        for name in ("University of Wisconsin-Madison",
                     "Argonne National Laboratory", "Argonne National Lab",
                     "Max Planck Institute", "Oak Ridge National Laboratory",
                     "Some Research Center", "Acme Corp"):
            self.assertTrue(R.is_organizational(name), name)

    def test_a_facility_never_becomes_a_method_term(self):
        rec = dict(record("a", "A subject", "An abstract."),
                   tools=[{"facilityName": "University of Wisconsin-Madison"},
                          {"facilityname": "Argonne National Lab"}])
        profile = R.build_internal_profile(rec)
        self.assertEqual(set(), profile.method_terms)
        self.assertEqual(set(), profile.software_terms)
        blob = " ".join(profile.all_terms)
        self.assertNotIn("wisconsin", blob)
        self.assertNotIn("argonne", blob)

    def test_a_shared_employer_cannot_pass_a_pair(self):
        # The reported failure exactly: same facility, unrelated subjects.
        facility = [{"facilityName": "University of Wisconsin-Madison"}]
        current = dict(record("a", "Donor-acceptor silicon carbide defects",
                              "Defect levels in silicon carbide."),
                       tools=facility)
        candidate = dict(record("b", "Electrified silicon water interfaces",
                                "Interfacial water under bias."),
                         tools=facility)
        outcome = assess(current, candidate, filler(20) + [current, candidate])
        self.assertFalse(outcome.passes)
        for word in ("university", "wisconsin", "madison"):
            self.assertNotIn(word, reasons_of(outcome))


class TestSoftwareIsNeverStrong(unittest.TestCase):
    def test_generic_software_is_recognised(self):
        for name in ("microsoft powerpoint", "powerpoint", "python",
                     "matlab", "jupyter", "excel", "git"):
            self.assertTrue(R.is_generic_software(name), name)
        for name in ("quantum espresso", "west", "pycce", "orca-x1"):
            self.assertFalse(R.is_generic_software(name), name)

    def test_sharing_office_software_proves_nothing(self):
        current = record(
            "a", "Gadgetite resonance spectroscopy",
            "Gadgetite lattices under hydrostatic pressure.",
            tools=["Microsoft PowerPoint"])
        candidate = record(
            "b", "Cogwheelene surface chemistry",
            "Cogwheelene adsorption energetics on oxide supports.",
            tools=["Microsoft PowerPoint"])
        outcome = assess(current, candidate, filler(20) + [current, candidate])
        self.assertFalse(outcome.passes)
        self.assertNotIn("powerpoint", reasons_of(outcome))

    def test_a_shared_domain_tool_alone_is_only_medium_and_does_not_pass(self):
        # Requirement: software overlap needs an INDEPENDENT topic anchor.
        current = record(
            "a", "Gadgetite resonance spectroscopy",
            "Gadgetite lattices under hydrostatic pressure.",
            tools=["RarePackage"])
        candidate = record(
            "b", "Cogwheelene surface chemistry",
            "Cogwheelene adsorption energetics on oxide supports.",
            tools=["RarePackage"])
        outcome = assess(current, candidate, filler(20) + [current, candidate])
        methods = [e for e in outcome.evidence
                   if e.family == R.FAMILY_METHODS]
        self.assertTrue(all(e.strength == R.MEDIUM for e in methods))
        self.assertFalse(outcome.passes)

    def test_no_method_evidence_is_ever_strong(self):
        current = record("a", "Rareword resonance of gadgetite",
                         "Rareword resonance in gadgetite.",
                         tags=["rareword resonance"], tools=["RarePackage"])
        candidate = record("b", "Rareword resonance of gadgetite films",
                           "Rareword resonance in gadgetite films.",
                           tags=["rareword resonance"], tools=["RarePackage"])
        outcome = assess(current, candidate, filler(20) + [current, candidate])
        for item in outcome.evidence:
            if item.family == R.FAMILY_METHODS:
                self.assertEqual(R.MEDIUM, item.strength)


class TestStrongRequiresDeliberateSources(unittest.TestCase):
    def test_three_shared_prose_words_are_not_strong(self):
        # Three rare-looking words that both abstracts happen to use, and
        # neither title nor tag mentions. Prose agreement is a medium at most.
        current = record(
            "a", "Gadgetite resonance spectroscopy",
            "Gadgetite lattices; the alphaxis betaxis gammaxis were noted.")
        candidate = record(
            "b", "Cogwheelene surface chemistry",
            "Cogwheelene adsorption; the alphaxis betaxis gammaxis were "
            "noted.")
        outcome = assess(current, candidate, filler(20) + [current, candidate])
        strong = [e for e in outcome.evidence
                  if e.strength == R.STRONG and e.family == R.FAMILY_TERMS]
        self.assertEqual([], strong)

    def test_the_same_three_words_in_both_titles_are_strong(self):
        current = record("a", "Alphaxis betaxis gammaxis resonance",
                         "An abstract.")
        candidate = record("b", "Gammaxis betaxis alphaxis scattering",
                           "A different abstract.")
        outcome = assess(current, candidate, filler(20) + [current, candidate])
        self.assertTrue(outcome.passes)
        self.assertTrue(any(e.strength == R.STRONG for e in outcome.evidence))

    def test_a_curated_tag_on_one_side_and_a_title_on_the_other_counts(self):
        # "A clear technical concept confirmed between a title and an
        # abstract" -- provenance is asymmetric, so it is judged per PAIR.
        current = record("a", "Gadgetite resonance spectroscopy",
                         "An abstract.")
        candidate = record("b", "A different heading entirely",
                           "We measured gadgetite carefully.",
                           tags=["gadgetite"])
        outcome = assess(current, candidate, filler(20) + [current, candidate])
        self.assertIn("gadgetite", outcome.shared_terms)


class TestCollectionsAndAuthorsCannotDecide(unittest.TestCase):
    def test_a_shared_collection_is_not_evidence(self):
        current = record(
            "a", "Gadgetite resonance spectroscopy",
            "Gadgetite lattices under hydrostatic pressure.",
            collections=["MICCOM"])
        candidate = record(
            "b", "Cogwheelene surface chemistry",
            "Cogwheelene adsorption energetics on oxide supports.",
            collections=["MICCOM"])
        outcome = assess(current, candidate, filler(20) + [current, candidate])
        self.assertFalse(outcome.passes)
        self.assertNotIn("miccom", reasons_of(outcome))
        self.assertNotIn("research area", reasons_of(outcome))

    def test_removing_every_author_changes_neither_gate_nor_order(self):
        people = ["Ada Lovelace", "Grace Hopper", "Alan Turing"]
        def corpus(authors):
            current = record("a", "Gadgetite resonance spectroscopy",
                             "Gadgetite resonance.", authors=authors)
            others = [
                record("b", "Gadgetite resonance imaging", "Gadgetite.",
                       authors=authors),
                record("c", "Gadgetite resonance theory", "Gadgetite.",
                       authors=authors),
                record("d", "An unrelated matter", "Nothing in common.",
                       authors=authors),
            ]
            return current, others

        def ranked(authors):
            current, others = corpus(authors)
            everything = filler(20) + [current] + others
            stats = stats_for(everything)
            profiles = [R.build_internal_profile(r) for r in others]
            return [(p.key, a.passes) for p, a in R.rank(
                R.build_internal_profile(current), profiles, stats)]

        self.assertEqual(ranked(people), ranked([]))
        self.assertEqual(ranked(people), ranked(["Someone Else"]))

    def test_author_overlap_is_not_in_the_sort_key(self):
        # Two candidates with identical topical scores; one shares every
        # author. Order must be decided by year/title, not by the person.
        current = record("a", "Gadgetite resonance", "Gadgetite resonance.",
                         authors=["Ada Lovelace"])
        shared = record("b", "Gadgetite resonance one", "Gadgetite resonance.",
                        authors=["Ada Lovelace"], year=2019)
        stranger = record("c", "Gadgetite resonance one",
                          "Gadgetite resonance.",
                          authors=["Nobody Atall"], year=2021)
        everything = filler(20) + [current, shared, stranger]
        stats = stats_for(everything)
        ranked = R.rank(R.build_internal_profile(current),
                        [R.build_internal_profile(shared),
                         R.build_internal_profile(stranger)], stats)
        self.assertEqual(["c", "b"], [p.key for p, _ in ranked])


class TestNoPollutedTermEverReachesAReader(unittest.TestCase):
    """The named terms, end to end, over a corpus built to contain them."""

    def build(self):
        facility = [{"facilityName": "University of Wisconsin-Madison"},
                    {"facilityName": "Argonne National Lab"},
                    {"packageName": "Microsoft PowerPoint"}]
        prose = ("The conventional individual principal component was "
                 "represented and positioned, highlighting fig4, fig5 and "
                 "table1 in the supplementary panel-a.")
        records = []
        for index, title in enumerate(
                ["Gadgetite resonance spectroscopy",
                 "Widgetite diffusion measurements",
                 "Sprocketium lattice dynamics",
                 "Cogwheelene surface chemistry"]):
            entry = dict(record("rec%d" % index, title, prose,
                                collections=["MICCOM"],
                                authors=["Ada Lovelace"]),
                         tools=facility)
            entry["charts"] = [{"caption": prose,
                                "properties": ["fig4", "table1"]}]
            records.append(entry)
        return records

    def test_no_polluted_term_appears_in_any_reason(self):
        records = self.build()
        corpus = filler(20) + records
        stats = stats_for(corpus)
        seen = []
        for current in records:
            others = [R.build_internal_profile(r) for r in records
                      if r["_id"] != current["_id"]]
            for profile, outcome in R.rank(
                    R.build_internal_profile(current), others, stats):
                seen.extend(reasons_of(outcome).split(" | "))
        blob = " ".join(seen)
        for term in POLLUTED:
            self.assertNotIn(term, blob, term)

    def test_nothing_in_that_corpus_passes_at_all(self):
        # Four unrelated subjects sharing an employer, a slide deck, a
        # programme and a boilerplate paragraph. The right answer is zero.
        records = self.build()
        stats = stats_for(filler(20) + records)
        for current in records:
            others = [R.build_internal_profile(r) for r in records
                      if r["_id"] != current["_id"]]
            ranked = R.rank(R.build_internal_profile(current), others, stats)
            self.assertEqual([], ranked, current["reference"]["title"])


class TestCapsAndEmptiness(unittest.TestCase):
    def test_at_most_three_and_never_padded(self):
        current = record("a", "Gadgetite resonance spectroscopy", "Gadgetite.")
        related = [record("r%d" % i, "Gadgetite resonance study %d" % i,
                          "Gadgetite resonance.") for i in range(6)]
        stats = stats_for(filler(20) + [current] + related)
        ranked = R.rank(R.build_internal_profile(current),
                        [R.build_internal_profile(r) for r in related], stats)
        self.assertEqual(R.MAX_RESULTS, len(ranked))

    def test_zero_is_an_acceptable_answer(self):
        current = record("a", "Gadgetite resonance", "Gadgetite.")
        unrelated = [record("u%d" % i, "Wholly different matter %d" % i,
                            "Nothing whatsoever in common.")
                     for i in range(5)]
        stats = stats_for(filler(20) + [current] + unrelated)
        ranked = R.rank(R.build_internal_profile(current),
                        [R.build_internal_profile(r) for r in unrelated],
                        stats)
        self.assertEqual([], ranked)


class TestExternalCandidatesFaceTheSameGate(unittest.TestCase):
    def external(self, title, abstract="", fields=("Physics",)):
        return {"key": title, "title": title, "abstract": abstract,
                "year": 2021, "authors": ["Ada Lovelace"], "doi": "",
                "url": "", "fields": list(fields)}

    def test_the_provider_recommending_it_is_not_evidence(self):
        current = record("a", "Gadgetite resonance spectroscopy", "Gadgetite.")
        stats = stats_for(filler(20) + [current])
        candidate = R.build_external_profile(
            self.external("An entirely unrelated matter",
                          "Nothing in common at all."))
        outcome = R.assess(R.build_internal_profile(current), candidate, stats)
        self.assertFalse(outcome.passes)

    def test_an_external_title_overlap_passes_the_same_way(self):
        current = record("a", "Gadgetite resonance spectroscopy", "Gadgetite.")
        stats = stats_for(filler(20) + [current])
        candidate = R.build_external_profile(
            self.external("Gadgetite resonance imaging",
                          "More gadgetite resonance."))
        outcome = R.assess(R.build_internal_profile(current), candidate, stats)
        self.assertTrue(outcome.passes)

    def test_external_prose_only_overlap_is_not_strong_either(self):
        current = record(
            "a", "Gadgetite resonance spectroscopy",
            "Gadgetite lattices; the alphaxis betaxis gammaxis appear here.")
        stats = stats_for(filler(20) + [current])
        candidate = R.build_external_profile(
            self.external("Cogwheelene surface chemistry",
                          "Cogwheelene adsorption; the alphaxis betaxis "
                          "gammaxis appear here too."))
        outcome = R.assess(R.build_internal_profile(current), candidate, stats)
        strong = [e for e in outcome.evidence
                  if e.strength == R.STRONG and e.family == R.FAMILY_TERMS]
        self.assertEqual([], strong)


class TestCacheVersionMovedWithTheAlgorithm(unittest.TestCase):
    def test_the_algorithm_version_is_past_the_polluted_one(self):
        # Cached verdicts computed by the old gate must not be reused. The
        # entries are keyed by this string, so it has to move whenever the
        # gate does -- pinned here so a future gate change cannot forget.
        from project import related
        self.assertNotIn(related.ALGORITHM_VERSION, ("1", "2"))

    def test_the_fingerprint_version_moved_too(self):
        self.assertNotEqual("1", R.FINGERPRINT_VERSION)

    def test_a_cached_entry_from_the_old_version_is_a_miss(self):
        from project import related
        self.assertTrue(hasattr(related, "ALGORITHM_VERSION"))
        stale = "2"
        self.assertNotEqual(stale, related.ALGORITHM_VERSION)


if __name__ == "__main__":
    unittest.main()
