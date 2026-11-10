"""Unit tests for the pure relatedness module.

`project/relatedness.py` has no database, no network and no configuration, so
everything below runs in memory and is deterministic.

The vocabulary in these fixtures is synthetic on purpose. The module under
test contains no DOI, no paper title and no material, method or facility
name: rarity is measured against whatever corpus it is handed, which is why
these tests can invent one and still exercise the real thresholds.
"""
import unittest

from project import relatedness as R


def record(key, title, abstract="", tags=(), collections=("shared-field",),
           authors=(), tools=(), dataset_keywords=(), chart_properties=(),
           doi=None, year=2020):
    """A stored Qresp record, shaped like Paper.to_mongo().to_dict()."""
    return {
        "_id": key,
        "reference": {
            "title": title,
            "publishedAbstract": abstract,
            "DOI": doi if doi is not None else "10.1000/%s" % key,
            "year": year,
            "authors": [{"firstName": name.split()[0], "middleName": "",
                         "lastName": name.split()[-1]} for name in authors],
            "journal": {"fullName": "Journal of Placeholder Science"},
        },
        "tags": list(tags),
        "collections": list(collections),
        "charts": [{"caption": "", "properties": list(chart_properties)}],
        "datasets": [{"readme": "", "keywords": list(dataset_keywords)}],
        "scripts": [],
        "tools": [{"packageName": name} for name in tools],
    }


def filler(count, start=0):
    """Unrelated records, so the corpus is big enough for rarity to mean
    something and so nothing below passes by having a two-record corpus."""
    return [record("filler%d" % i,
                   "Unrelated topic number %d in a different area" % i,
                   "An unrelated abstract about topic%d and matter%d." % (i, i),
                   tags=["topic%d" % i], collections=["other-field"],
                   authors=["Person%d Surname%d" % (i, i)])
            for i in range(start, start + count)]


def stats_for(records):
    return R.CorpusStats([R.build_internal_profile(r) for r in records])


class TestNormalization(unittest.TestCase):
    def test_tokenize_drops_stopwords_numbers_and_short_tokens(self):
        tokens = R.tokenize("We report the 42 eV shift of a Widget in 2019")
        self.assertNotIn("the", tokens)
        self.assertNotIn("42", tokens)
        self.assertNotIn("of", tokens)
        self.assertIn("widget", tokens)

    def test_plural_folding_is_conservative(self):
        self.assertEqual(R.tokenize("nanowires"), R.tokenize("nanowire"))
        # ...but does not merge words that merely end in s
        self.assertEqual(["analysis"], R.tokenize("analysis"))

    def test_normalize_doi_strips_prefixes_and_case(self):
        for raw in ("https://doi.org/10.1000/ABC",
                    "http://dx.doi.org/10.1000/abc",
                    "doi: 10.1000/abc", "  10.1000/abc. "):
            self.assertEqual("10.1000/abc", R.normalize_doi(raw))

    def test_title_key_is_order_insensitive(self):
        self.assertEqual(R.normalize_title_key("Alpha beta gamma"),
                         R.normalize_title_key("Gamma, the beta and alpha"))

    def test_author_matching_no_longer_exists(self):
        # Author matching was removed with the shared-author count: nothing
        # in the module compares two people any more. What replaced this
        # assertion is the contract itself -- see
        # `test_relatedness_neutrality.TestAuthorsDecideNothing`.
        self.assertFalse(hasattr(R, "author_key"))


class TestProfileScope(unittest.TestCase):
    """What a Profile is allowed to see. A field that never enters a Profile
    can never be scored, cached, or sent to a provider."""

    def test_only_scientific_metadata_is_read(self):
        stored = record("p", "Widget dynamics", "About widgets.",
                        tags=["widget"], tools=["ToolPackage"])
        stored["owner_email"] = "owner@example.com"
        stored["editor_emails"] = ["editor@example.com"]
        stored["edit_history"] = [{"email": "owner@example.com"}]
        stored["info"] = {
            "insertedBy": {"firstName": "Curator", "lastName": "Person",
                           "emailId": "curator@example.com"},
            "fileServerPath": "https://notebook.rcc.uchicago.edu/files/secret",
            "folderAbsolutePath": "/project/secret/folder",
            "downloadPath": "https://internal.example.org/download",
            "notebookPath": "notebooks/private.ipynb",
        }
        stored["datasets"] = [{"readme": "Numbers.", "keywords": ["widget"],
                               "files": ["datasets/private-file.dat"]}]
        profile = R.build_internal_profile(stored)
        haystack = " ".join(profile.all_terms) + " " + " ".join(profile.authors)
        for leak in ("owner", "editor", "curator", "rcc", "uchicago",
                     "notebook", "download", "folder", "secret", "ipynb",
                     "example.com"):
            self.assertNotIn(leak, haystack, leak)
        # ...while the scientific metadata IS read
        self.assertIn("widget", profile.all_terms)
        self.assertIn("toolpackage", profile.method_terms)


class TestMetadataFingerprint(unittest.TestCase):
    """The digest that decides whether a cached external answer still
    describes the record it was computed for."""

    def base(self):
        return record("p", "Widget dynamics", "About widgets.",
                      tags=["widget"], authors=["Robin Sharedname"],
                      tools=["ToolPackage"], dataset_keywords=["numbers"],
                      chart_properties=["energy"])

    def test_it_is_stable_and_opaque(self):
        first = R.metadata_fingerprint(self.base())
        self.assertEqual(first, R.metadata_fingerprint(self.base()))
        # A digest, not the metadata itself.
        self.assertRegex(first, r"^[0-9a-f]{64}$")
        self.assertNotIn("widget", first)

    def assert_changes(self, mutate, label):
        before = R.metadata_fingerprint(self.base())
        changed = self.base()
        mutate(changed)
        self.assertNotEqual(before, R.metadata_fingerprint(changed), label)

    def test_every_field_a_recommendation_depends_on_changes_it(self):
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
            "tool facility": lambda r: r["tools"][0].__setitem__(
                "facilityname", "Some Beamline"),
            "tool measurement": lambda r: r["tools"][0].__setitem__(
                "measurement", "spectroscopy"),
        }
        for label, mutate in cases.items():
            with self.subTest(field=label):
                self.assert_changes(mutate, label)

    def test_metadata_a_recommendation_ignores_does_not_invalidate_a_cache(self):
        """Authors and collections decide nothing, so hashing them only threw
        away provider answers that could not have changed. The full contract
        is in `test_relatedness_neutrality.TestFingerprintTracksOnlyWhatDecides`."""
        before = R.metadata_fingerprint(self.base())
        for mutate in (
                lambda r: r["reference"]["authors"].append(
                    {"firstName": "New", "middleName": "",
                     "lastName": "Person"}),
                lambda r: r["reference"]["authors"][0].__setitem__(
                    "lastName", "Renamed"),
                lambda r: r["collections"].append("another-field"),
        ):
            changed = self.base()
            mutate(changed)
            self.assertEqual(before, R.metadata_fingerprint(changed))

    def test_private_and_operational_fields_can_never_invalidate_a_cache(self):
        """If one of these changed the fingerprint it would also be a signal
        that private data reached the cache key. Neither may happen."""
        before = R.metadata_fingerprint(self.base())
        private = self.base()
        private["owner_email"] = "owner@example.com"
        private["editor_emails"] = ["editor@example.com"]
        private["edit_history"] = [{"email": "owner@example.com",
                                    "action": "edit"}]
        private["updated_by_email"] = "owner@example.com"
        private["is_active"] = False
        private["info"] = {
            "insertedBy": {"firstName": "Curator", "lastName": "Person",
                           "emailId": "curator@example.com"},
            "fileServerPath": "https://notebook.rcc.uchicago.edu/files/secret",
            "folderAbsolutePath": "/project/secret",
            "downloadPath": "https://internal.example.org/download",
            "notebookPath": "notebooks/private.ipynb",
        }
        private["datasets"][0]["files"] = ["datasets/private-file.dat"]
        private["charts"][0]["imageFile"] = "charts/secret.png"
        self.assertEqual(before, R.metadata_fingerprint(private))

    def test_a_missing_or_empty_record_does_not_explode(self):
        for value in (None, {}, {"reference": None}):
            self.assertRegex(R.metadata_fingerprint(value), r"^[0-9a-f]{64}$")


class TestSpecificity(unittest.TestCase):
    def test_generic_words_are_never_specific(self):
        stats = stats_for(filler(20))
        for word in ("study", "data", "analysis", "simulation"):
            self.assertFalse(stats.is_specific(word), word)

    def test_a_term_carried_by_much_of_the_corpus_is_a_field_label(self):
        common = [record("c%d" % i, "Fieldword paper %d" % i,
                         "This is about fieldword and thing%d." % i)
                  for i in range(20)]
        stats = stats_for(common)
        self.assertFalse(stats.is_specific("fieldword"))
        self.assertTrue(stats.is_specific("thing1"))

    def test_a_term_shared_by_only_the_compared_pair_is_rare_enough(self):
        # Rarity is one HALF of specificity. A term carried by exactly the two
        # records being compared is as rare as a term gets.
        corpus = filler(20) + [
            record("a", "Rareword measurements"),
            record("b", "More rareword measurements"),
        ]
        stats = stats_for(corpus)
        self.assertTrue(stats.is_rare_enough("rareword"))
        # ...and rarity alone is not enough. `is_specific` is now the
        # conservative half of the test -- SHAPE plus rarity -- so a plain
        # lowercase word does not qualify from its spelling however long it
        # is. That is the whole point: `gadgetite` and `conventional` are the
        # same shape, and the length rule that used to separate them was
        # separating nothing. Provenance admits the real one; see
        # `pair_specific_terms`.
        self.assertFalse(stats.is_specific("gadgetite"))
        self.assertFalse(stats.is_specific("rareword"))
        self.assertFalse(stats.is_specific("conventional"))
        # A multi-word curated phrase and a formula still qualify on shape.
        self.assertTrue(stats.is_specific("rareword resonance"))
        self.assertTrue(stats.is_specific("bivo4"))


class TestQualityGate(unittest.TestCase):
    """One strong, or two INDEPENDENT mediums. Nothing else opens the gate."""

    def assess(self, current, candidate, corpus, citations=frozenset()):
        stats = stats_for(corpus)
        return R.assess(R.build_internal_profile(current),
                        R.build_internal_profile(candidate), stats, citations)

    def test_same_journal_and_similar_year_alone_do_not_pass(self):
        current = record("a", "Alpha widget resonance", "Alpha widgets.",
                         year=2020)
        candidate = record("b", "Beta gadget diffusion", "Beta gadgets.",
                           year=2021)
        # Same journal (the fixture gives both the same one) and adjacent
        # years, and nothing else.
        outcome = self.assess(current, candidate, filler(20) + [current,
                                                                candidate])
        self.assertFalse(outcome.passes)
        self.assertEqual([], outcome.evidence)

    def test_one_broad_shared_field_alone_does_not_pass(self):
        current = record("a", "Alpha widget resonance", "Alpha widgets.",
                         collections=["broad-field"])
        candidate = record("b", "Beta gadget diffusion", "Beta gadgets.",
                           collections=["broad-field"])
        outcome = self.assess(current, candidate,
                              filler(20) + [current, candidate])
        self.assertFalse(outcome.passes)

    def test_generic_shared_words_alone_do_not_pass(self):
        current = record("a", "A study of data analysis",
                         "This study presents a simulation and data analysis.")
        candidate = record("b", "Another study of data analysis",
                           "A study presenting data, analysis and simulation.")
        outcome = self.assess(current, candidate,
                              filler(20) + [current, candidate])
        self.assertFalse(outcome.passes)

    def test_shared_author_alone_does_not_pass(self):
        current = record("a", "Alpha widget resonance", "Alpha widgets here.",
                         authors=["Robin Sharedname"])
        candidate = record("b", "Beta gadget diffusion", "Beta gadgets there.",
                           authors=["Robin Sharedname"])
        outcome = self.assess(current, candidate,
                              filler(20) + [current, candidate])
        self.assertFalse(outcome.passes)

    def test_one_strong_signal_is_enough(self):
        text = ("Rareterm alpha excitation of gadgetite lattices measured "
                "with a spectrometer at cryogenic temperature.")
        current = record("a", "Rareterm excitation of gadgetite", text)
        candidate = record("b", "Rareterm excitation in gadgetite films", text)
        outcome = self.assess(current, candidate,
                              filler(20) + [current, candidate])
        self.assertTrue(outcome.passes)
        self.assertTrue(any(e.strength == R.STRONG for e in outcome.evidence))

    def test_two_independent_mediums_pass(self):
        # Medium 1: a shared explicit keyword. Medium 2: the same research
        # area with real text similarity. Two different families, both about
        # subject matter -- the only kind the gate accepts.
        current = record("a", "Alpha rareword resonance",
                         "Rareword resonance in alpha gadgetite lattices "
                         "probed with a frumious spectrometer.",
                         tags=["rareword resonance"],
                         collections=["miccom"])
        candidate = record("b", "Beta rareword transport",
                           "Rareword resonance in beta gadgetite lattices "
                           "probed with a frumious spectrometer.",
                           tags=["rareword resonance"],
                           collections=["miccom"])
        outcome = self.assess(current, candidate,
                              filler(20) + [current, candidate])
        self.assertTrue(outcome.passes)
        families = {e.family for e in outcome.evidence}
        self.assertIn(R.FAMILY_TERMS, families)
        self.assertIn(R.FAMILY_TEXT, families)

    def test_authors_are_not_a_family_the_gate_can_see(self):
        # The rule this replaced: a shared author used to be a MEDIUM, and one
        # PI on half a corpus therefore supplied half of every gate decision.
        #
        # Asserted on the OUTCOME, not on a constant. There used to be a
        # `FAMILY_AUTHORS` name kept alive purely so this line could refer to
        # it, which meant the test passed by checking that an unused string
        # was absent -- and left a family constant sitting there for a future
        # change to reach for. The literal is what a reader would see.
        def outcome_for(current_authors, candidate_authors):
            current = record("a", "Alpha rareword resonance",
                             "Rareword resonance in alpha lattices.",
                             tags=["rareword resonance"],
                             authors=current_authors)
            candidate = record("b", "Coastal borogove migration",
                               "Seasonal migration of coastal borogoves.",
                               tags=["ornithology"],
                               authors=candidate_authors)
            return self.assess(current, candidate,
                               filler(20) + [current, candidate])

        shared = outcome_for(["Robin Sharedname"], ["Robin Sharedname"])
        self.assertFalse(shared.passes)
        self.assertNotIn("authors", {e.family for e in shared.evidence})

        # ...and sharing the author changed nothing at all: same verdict, same
        # score, same reasons as two strangers writing the same two papers.
        strangers = outcome_for(["Robin Sharedname"], ["Nobody Atall"])
        self.assertEqual(shared.passes, strangers.passes)
        self.assertEqual(shared.score, strangers.score)
        self.assertEqual(shared.reasons(3), strangers.reasons(3))

    def test_two_mediums_from_the_same_family_are_one_observation(self):
        # A shared keyword AND the same keyword's words overlapping in text is
        # one overlap, not two: only one `terms` evidence may ever be kept.
        current = record("a", "Alpha rareword resonance",
                         "Rareword resonance rareword resonance.",
                         tags=["rareword resonance"],
                         chart_properties=["rareword resonance"],
                         dataset_keywords=["rareword resonance"])
        candidate = record("b", "Beta rareword resonance study",
                           "Rareword resonance rareword resonance.",
                           tags=["rareword resonance"],
                           chart_properties=["rareword resonance"],
                           dataset_keywords=["rareword resonance"])
        outcome = self.assess(current, candidate,
                              filler(20) + [current, candidate])
        terms_evidence = [e for e in outcome.evidence
                          if e.family == R.FAMILY_TERMS]
        self.assertEqual(1, len(terms_evidence))

    def test_a_shared_tool_without_a_shared_topic_is_only_medium(self):
        current = record("a", "Alpha widget resonance", "Alpha widgets here.",
                         tools=["RarePackage"])
        candidate = record("b", "Beta gadget diffusion", "Beta gadgets there.",
                           tools=["RarePackage"])
        outcome = self.assess(current, candidate,
                              filler(20) + [current, candidate])
        self.assertFalse(outcome.passes)
        self.assertTrue(all(e.strength == R.MEDIUM for e in outcome.evidence))

    def test_the_same_tool_is_never_more_than_medium(self):
        # It used to be STRONG when a topic overlapped, which is the door
        # `facilityName` walked through: "argonne national lab" was read as a
        # method, so a shared employer plus any topic word was a strong
        # verdict. Software and technique overlap now needs a second,
        # independent family before it can open the gate at all.
        current = record("a", "Rareword resonance of gadgetite",
                         "Rareword resonance measured in gadgetite lattices.",
                         tags=["rareword resonance"], tools=["RarePackage"])
        candidate = record("b", "Rareword resonance of gadgetite films",
                           "Rareword resonance simulated in gadgetite films.",
                           tags=["rareword resonance"], tools=["RarePackage"])
        outcome = self.assess(current, candidate,
                              filler(20) + [current, candidate])
        methods = [e for e in outcome.evidence if e.family == R.FAMILY_METHODS]
        self.assertEqual([R.MEDIUM], [e.strength for e in methods])
        # The pair still passes -- on its shared curated topic, which is what
        # should have been carrying it all along.
        self.assertTrue(outcome.passes)

    def test_a_direct_citation_is_strong_and_never_inferred(self):
        current = record("a", "Alpha widget resonance", "Alpha widgets.")
        candidate = record("b", "Beta gadget diffusion", "Beta gadgets.",
                           doi="10.1000/cited")
        corpus = filler(20) + [current, candidate]
        # Without a citation source: nothing.
        self.assertFalse(self.assess(current, candidate, corpus).passes)
        # With one: strong, on its own.
        cited = self.assess(current, candidate, corpus,
                            frozenset({"10.1000/cited"}))
        self.assertTrue(cited.passes)
        self.assertEqual([R.STRONG],
                         [e.strength for e in cited.evidence
                          if e.family == R.FAMILY_CITATION])


class TestReasons(unittest.TestCase):
    def test_reasons_are_grounded_capped_and_strongest_first(self):
        text = ("Rareword resonance of gadgetite lattices probed by a "
                "spectrometer under cryogenic conditions.")
        current = record("a", "Rareword resonance of gadgetite", text,
                         tags=["rareword resonance"], tools=["RarePackage"],
                         authors=["Robin Sharedname"])
        candidate = record("b", "Rareword resonance of gadgetite films", text,
                           tags=["rareword resonance"], tools=["RarePackage"],
                           authors=["Robin Sharedname"])
        stats = stats_for(filler(20) + [current, candidate])
        outcome = R.assess(R.build_internal_profile(current),
                           R.build_internal_profile(candidate), stats)
        reasons = outcome.reasons(3)
        self.assertLessEqual(len(reasons), 3)
        self.assertTrue(reasons)
        # Every reason names something that is actually in both records.
        joined = " ".join(reasons).lower()
        self.assertTrue(any(token in joined for token in
                            ("rareword", "similarity", "rarepackage",
                             "sharedname")))
        # The strongest evidence leads.
        strong_texts = [e.text for e in outcome.evidence
                        if e.strength == R.STRONG]
        self.assertIn(reasons[0], strong_texts)

    def test_a_failing_candidate_produces_no_recommendation(self):
        current = record("a", "Alpha widget resonance", "Alpha widgets.")
        candidate = record("b", "Beta gadget diffusion", "Beta gadgets.")
        stats = stats_for(filler(20) + [current, candidate])
        ranked = R.rank(R.build_internal_profile(current),
                        [R.build_internal_profile(candidate)], stats)
        self.assertEqual([], ranked)


class TestRanking(unittest.TestCase):
    def build(self, current, candidates, corpus, limit=5):
        stats = stats_for(corpus)
        return R.rank(R.build_internal_profile(current),
                      [R.build_internal_profile(c) for c in candidates],
                      stats, frozenset(), limit)

    def test_stronger_evidence_ranks_first(self):
        current = record("a", "Rareword resonance of gadgetite",
                         "Rareword resonance in gadgetite lattices measured "
                         "with a cryogenic spectrometer.",
                         tags=["rareword resonance"],
                         authors=["Robin Sharedname"])
        near = record("b", "Rareword resonance of gadgetite thin films",
                      "Rareword resonance in gadgetite lattices measured "
                      "with a cryogenic spectrometer.",
                      tags=["rareword resonance"],
                      authors=["Robin Sharedname"])
        far = record("c", "Rareword resonance in an unrelated setting",
                     "A different subject that mentions rareword resonance "
                     "once.", tags=["rareword resonance"],
                     authors=["Robin Sharedname"])
        ranked = self.build(current, [far, near],
                            filler(20) + [current, near, far])
        self.assertEqual("b", ranked[0][0].key)
        self.assertGreater(ranked[0][1].score, ranked[-1][1].score)

    def test_the_list_is_capped_and_never_padded(self):
        text = ("Rareword resonance of gadgetite lattices with a cryogenic "
                "spectrometer and a tuned oscillator.")
        current = record("a", "Rareword resonance of gadgetite", text)
        clones = [record("clone%d" % i,
                         "Rareword resonance of gadgetite variant %d" % i,
                         text) for i in range(9)]
        corpus = filler(20) + [current] + clones
        self.assertEqual(5, len(self.build(current, clones, corpus)))
        # ...and a short list stays short rather than being filled up.
        weak = [record("weak%d" % i, "Totally different subject %d" % i,
                       "Nothing in common at all here.") for i in range(9)]
        self.assertEqual([], self.build(current, weak,
                                        filler(20) + [current] + weak))

    def test_untitled_candidates_are_dropped(self):
        current = record("a", "Rareword resonance of gadgetite",
                         "Rareword resonance of gadgetite lattices.")
        untitled = record("b", "", "Rareword resonance of gadgetite lattices.")
        self.assertEqual([], self.build(current, [untitled],
                                        filler(20) + [current, untitled]))


class TestExternalProfiles(unittest.TestCase):
    def test_an_external_candidate_is_judged_by_the_same_gate(self):
        current = record("a", "Rareword resonance of gadgetite",
                         "Rareword resonance in gadgetite lattices probed "
                         "with a cryogenic spectrometer.")
        stats = stats_for(filler(20) + [current])
        good = R.build_external_profile({
            "key": "X1", "doi": "10.9999/x1",
            "title": "Rareword resonance in gadgetite lattices",
            "abstract": "Rareword resonance of gadgetite lattices probed by "
                        "a cryogenic spectrometer.",
            "year": 2022, "authors": ["Someone Else"], "fields": ["Physics"]})
        bad = R.build_external_profile({
            "key": "X2", "doi": "10.9999/x2",
            "title": "A study of data analysis in another discipline",
            "abstract": "This study presents a simulation and data analysis.",
            "year": 2022, "authors": ["Nobody Here"], "fields": ["Economics"]})
        ranked = R.rank(R.build_internal_profile(current), [bad, good], stats)
        self.assertEqual(["X1"], [p.key for p, _ in ranked])

    def test_provider_order_does_not_survive_the_gate(self):
        """The provider's ranking is not evidence: a first-placed candidate
        with nothing in common is dropped, a last-placed one with real
        overlap is kept."""
        current = record("a", "Rareword resonance of gadgetite",
                         "Rareword resonance in gadgetite lattices.")
        stats = stats_for(filler(20) + [current])
        first = R.build_external_profile({
            "key": "first", "title": "Unrelated subject entirely",
            "abstract": "Nothing to do with the record at hand."})
        last = R.build_external_profile({
            "key": "last", "title": "Rareword resonance of gadgetite films",
            "abstract": "Rareword resonance in gadgetite lattices."})
        ranked = R.rank(R.build_internal_profile(current), [first, last], stats)
        self.assertEqual(["last"], [p.key for p, _ in ranked])


class TestRerankExternal(unittest.TestCase):
    """`rerank_external` is `rank`'s twin for Recommended External Papers, and
    the one thing that must never be true of it is what IS true of `rank`:
    a candidate is never dropped for failing `assess()`. Only a missing title
    (a data floor, not a relatedness judgement) removes one.
    """

    def build(self, current, candidates, corpus, limit=None):
        stats = stats_for(corpus)
        return R.rerank_external(R.build_internal_profile(current),
                                 candidates, stats, frozenset(), limit)

    def test_a_candidate_that_fails_the_strict_gate_is_still_returned(self):
        # The exact scenario `TestExternalProfiles` shows `rank()` dropping --
        # here it must survive.
        current = record("a", "Rareword resonance of gadgetite",
                         "Rareword resonance in gadgetite lattices probed "
                         "with a cryogenic spectrometer.")
        good = R.build_external_profile({
            "key": "X1", "doi": "10.9999/x1", "provider_rank": 0,
            "title": "Rareword resonance in gadgetite lattices",
            "abstract": "Rareword resonance of gadgetite lattices probed by "
                        "a cryogenic spectrometer.",
            "year": 2022, "authors": ["Someone Else"], "fields": ["Physics"]})
        bad = R.build_external_profile({
            "key": "X2", "doi": "10.9999/x2", "provider_rank": 1,
            "title": "A study of data analysis in another discipline",
            "abstract": "This study presents a simulation and data analysis.",
            "year": 2022, "authors": ["Nobody Here"], "fields": ["Economics"]})
        ranked = self.build(current, [bad, good], filler(20) + [current])
        keys = [p.key for p, _assessment in ranked]
        self.assertIn("X1", keys)
        self.assertIn("X2", keys)
        # Real evidence still outranks none.
        self.assertEqual(["X1", "X2"], keys)
        # The gate's OWN verdict rides along as a diagnostic; it is computed,
        # just never consulted to decide inclusion.
        verdicts = {p.key: a.passes for p, a in ranked}
        self.assertTrue(verdicts["X1"])
        self.assertFalse(verdicts["X2"])

    def test_ties_are_broken_by_provider_rank_ascending(self):
        # Two candidates with IDENTICAL evidence (same title/abstract shape,
        # different labels) score the same; the one the provider ranked
        # first must come first here too.
        current = record("a", "Rareword resonance of gadgetite",
                         "Rareword resonance in gadgetite lattices.")
        text = "Nothing shared with the current record at all."
        earlier = R.build_external_profile({
            "key": "earlier", "provider_rank": 3,
            "title": "Unrelated subject one", "abstract": text})
        later = R.build_external_profile({
            "key": "later", "provider_rank": 7,
            "title": "Unrelated subject two", "abstract": text})
        # Handed in the OPPOSITE order, so a passing test cannot be an
        # accident of input order.
        ranked = self.build(current, [later, earlier], filler(20) + [current])
        self.assertEqual(["earlier", "later"], [p.key for p, _ in ranked])

    def test_score_still_outranks_provider_rank(self):
        # The tie-break only applies to a TIE. A later-ranked candidate with
        # real evidence still beats an earlier-ranked one with none.
        current = record("a", "Rareword resonance of gadgetite",
                         "Rareword resonance in gadgetite lattices probed "
                         "with a cryogenic spectrometer.")
        first_but_weak = R.build_external_profile({
            "key": "weak", "provider_rank": 0,
            "title": "Unrelated subject entirely",
            "abstract": "Nothing to do with the record at hand."})
        last_but_strong = R.build_external_profile({
            "key": "strong", "provider_rank": 99,
            "title": "Rareword resonance of gadgetite films",
            "abstract": "Rareword resonance in gadgetite lattices probed "
                        "with a cryogenic spectrometer."})
        ranked = self.build(current, [first_but_weak, last_but_strong],
                            filler(20) + [current])
        self.assertEqual(["strong", "weak"], [p.key for p, _ in ranked])

    def test_untitled_candidates_are_still_dropped(self):
        # The one floor that still applies: a candidate with no title is not
        # a relatedness judgement, it is unusable data.
        current = record("a", "Rareword resonance of gadgetite",
                         "Rareword resonance of gadgetite lattices.")
        untitled = R.build_external_profile({
            "key": "notitle", "title": "",
            "abstract": "Rareword resonance of gadgetite lattices."})
        ranked = self.build(current, [untitled], filler(20) + [current])
        self.assertEqual([], ranked)

    def test_limit_none_returns_every_scored_candidate_in_order(self):
        current = record("a", "Rareword resonance of gadgetite",
                         "Rareword resonance in gadgetite lattices.")
        candidates = [R.build_external_profile({
            "key": "c%d" % i, "provider_rank": i,
            "title": "Unrelated candidate %d" % i,
            "abstract": "Shares nothing with the current record."})
            for i in range(12)]
        ranked = self.build(current, candidates, filler(20) + [current],
                            limit=None)
        self.assertEqual(12, len(ranked))
        capped = self.build(current, candidates, filler(20) + [current],
                            limit=5)
        self.assertEqual(5, len(capped))
        # The cap takes the FRONT of the already-ordered list, never a
        # different subset.
        self.assertEqual([p.key for p, _ in ranked][:5],
                         [p.key for p, _ in capped])

    def test_a_candidate_with_no_provider_rank_still_sorts_deterministically(self):
        # Internal profiles (and any hand-built external one) carry no
        # provider_rank at all. Two such candidates tied on score must not
        # raise or sort arbitrarily.
        current = record("a", "Rareword resonance of gadgetite",
                         "Rareword resonance of gadgetite lattices.")
        one = R.build_external_profile({
            "key": "one", "title": "Unrelated subject A",
            "abstract": "Nothing shared."})
        two = R.build_external_profile({
            "key": "two", "title": "Unrelated subject B",
            "abstract": "Nothing shared."})
        ranked = self.build(current, [one, two], filler(20) + [current])
        self.assertEqual({"one", "two"}, {p.key for p, _ in ranked})


if __name__ == "__main__":
    unittest.main()
