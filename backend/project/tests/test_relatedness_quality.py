"""What may and may not push a candidate through the quality gate.

test_relatedness.py pins the scoring machinery. This file pins the PRODUCT
rule the machinery exists to serve: a recommendation must rest on a technical
overlap between the two records, and on nothing else.

Every fixture uses invented vocabulary, so what is under test is the rule, not
a lookup table. The one exception is the blocklist tests, which necessarily
name the ordinary English, academic and web/file words that a live corpus
turned into "specific research terms".
"""
import unittest

from project import relatedness as R

# Ordinary words that a small corpus makes look rare. Observed being reported
# as "specific research terms" on a real 65-record server.
ORDINARY = ("python", "http", "user", "another", "related", "discussed",
            "play", "will", "proper", "class", "comparing", "particular",
            "region", "yield")


def record(key, title, abstract, tags=(), authors=(), collections=("miccom",),
           tools=()):
    return {
        "_id": key,
        "reference": {
            "title": title,
            "publishedAbstract": abstract,
            "DOI": "10.1000/%s" % key,
            "year": 2020,
            "authors": [{"firstName": n.split()[0], "middleName": "",
                         "lastName": n.split()[-1]} for n in authors],
        },
        "tags": list(tags),
        "collections": list(collections),
        "charts": [], "datasets": [], "scripts": [],
        "tools": [{"packageName": t} for t in tools],
    }


def corpus_stats(records):
    return R.CorpusStats([R.build_internal_profile(r) for r in records])


def filler(count=30):
    """Background records, so document frequency means something and no term
    is rare merely because the corpus is tiny."""
    return [record("filler%d" % i, "Subject %d of the collection" % i,
                   "An abstract concerning topic%d and matter%d, which is "
                   "discussed in particular in this region." % (i, i),
                   tags=["topic%d" % i], authors=["Person%d Sur%d" % (i, i)],
                   collections=["other"])
            for i in range(count)]


def verdict(current, candidate, extra=()):
    records = [current, candidate] + list(extra) + filler()
    stats = corpus_stats(records)
    return R.assess(R.build_internal_profile(current),
                    R.build_internal_profile(candidate), stats)


class TestOrdinaryWordsAreNotResearchTerms(unittest.TestCase):
    """Sharing ordinary English is not sharing a research topic."""

    def test_none_of_the_observed_words_is_a_specific_term(self):
        stats = corpus_stats(filler(40))
        for word in ORDINARY:
            self.assertFalse(stats.is_specific(word),
                             "%r must not count as a research term" % word)

    def test_two_records_sharing_only_ordinary_words_do_not_pass(self):
        shared = " ".join(ORDINARY)
        current = record(
            "a", "Vorpal damping in slithy toves",
            "We report %s in a study of vorpal damping." % shared,
            tags=["vorpal damping"])
        candidate = record(
            "b", "Brillig conductance of mome raths",
            "We report %s in a study of brillig conductance." % shared,
            tags=["brillig conductance"])
        assessment = verdict(current, candidate)
        self.assertFalse(assessment.passes,
                         "passed on: %s" % [e.text for e in assessment.evidence])

    def test_an_ordinary_word_never_appears_in_a_reason(self):
        # Even for a candidate that legitimately passes, the sentence a reader
        # sees must not cite ordinary words as the evidence.
        current = record(
            "a", "Vorpal damping in slithy toves",
            "Vorpal damping of slithy toves is discussed in particular; the "
            "user will play a proper class of comparing python http yield.",
            tags=["vorpal damping", "slithy tove"])
        candidate = record(
            "b", "Vorpal damping of borogoves",
            "Vorpal damping of slithy toves is discussed in particular; the "
            "user will play a proper class of comparing python http yield.",
            tags=["vorpal damping", "slithy tove"])
        assessment = verdict(current, candidate)
        self.assertTrue(assessment.passes)
        text = " ".join(assessment.reasons(3)).lower()
        for word in ORDINARY:
            self.assertNotIn(word, text, "%r leaked into a reason" % word)

    def test_rarity_alone_does_not_make_a_word_technical(self):
        # "another" in exactly two records of a 32-record corpus is as rare as
        # a real term, and must still not count.
        current = record("a", "Vorpal damping", "Another vorpal outcome.")
        candidate = record("b", "Brillig conductance", "Another brillig one.")
        stats = corpus_stats([current, candidate] + filler(30))
        self.assertLessEqual(stats.document_frequency.get("another", 0), 2)
        self.assertFalse(stats.is_specific("another"))


class TestAuthorsAreNeverAPassingCondition(unittest.TestCase):
    """A shared author -- above all a PI on half the corpus -- says who did
    the work, not what it was about."""

    def test_same_authors_different_topic_does_not_pass(self):
        current = record(
            "a", "Vorpal damping in slithy toves",
            "Vorpal damping of slithy toves measured with a frumious probe.",
            tags=["vorpal damping"],
            authors=["Robin Sharedname", "Casey Otherperson"])
        candidate = record(
            "b", "Seasonal migration of coastal borogoves",
            "Observations of borogove migration over several seasons.",
            tags=["ornithology"],
            authors=["Robin Sharedname", "Casey Otherperson"])
        assessment = verdict(current, candidate)
        self.assertFalse(assessment.passes,
                         "passed on: %s" % [e.text for e in assessment.evidence])

    def test_a_shared_author_plus_ordinary_words_does_not_pass(self):
        shared = " ".join(ORDINARY)
        current = record("a", "Vorpal damping in slithy toves",
                         "Vorpal damping. %s" % shared,
                         authors=["Robin Sharedname"])
        candidate = record("b", "Brillig conductance of mome raths",
                           "Brillig conductance. %s" % shared,
                           authors=["Robin Sharedname"])
        self.assertFalse(verdict(current, candidate).passes)

    def test_removing_every_author_changes_no_verdict(self):
        """The decisive property: the gate must be author-blind."""
        pairs = []
        topical_current = record(
            "a", "Vorpal damping in slithy toves",
            "Vorpal damping of slithy toves with a frumious probe.",
            tags=["vorpal damping", "frumious probe"],
            authors=["Robin Sharedname"])
        topical_candidate = record(
            "b", "Vorpal damping of borogoves",
            "Vorpal damping measured with a frumious probe on borogoves.",
            tags=["vorpal damping", "frumious probe"],
            authors=["Robin Sharedname"])
        pairs.append((topical_current, topical_candidate))
        pairs.append((
            record("c", "Vorpal damping", "Vorpal damping of toves.",
                   authors=["Robin Sharedname"]),
            record("d", "Coastal borogoves", "Borogove migration seasons.",
                   authors=["Robin Sharedname"])))
        for current, candidate in pairs:
            with_authors = verdict(current, candidate).passes
            stripped_current = dict(current)
            stripped_candidate = dict(candidate)
            stripped_current["reference"] = dict(current["reference"],
                                                 authors=[])
            stripped_candidate["reference"] = dict(candidate["reference"],
                                                   authors=[])
            without = verdict(stripped_current, stripped_candidate).passes
            self.assertEqual(with_authors, without,
                             "%s: the author signal changed the verdict"
                             % current["_id"])

    def test_no_reason_is_about_a_person(self):
        current = record(
            "a", "Vorpal damping in slithy toves",
            "Vorpal damping of slithy toves with a frumious probe.",
            tags=["vorpal damping", "frumious probe"],
            authors=["Robin Sharedname"])
        candidate = record(
            "b", "Vorpal damping of borogoves",
            "Vorpal damping measured with a frumious probe on borogoves.",
            tags=["vorpal damping", "frumious probe"],
            authors=["Robin Sharedname"])
        assessment = verdict(current, candidate)
        self.assertTrue(assessment.passes)
        text = " ".join(assessment.reasons(3)).lower()
        self.assertNotIn("author", text)
        self.assertNotIn("sharedname", text)


class TestRealTechnicalOverlapPasses(unittest.TestCase):
    """The gate must not be so strict that genuine overlap is lost."""

    def test_a_shared_multi_word_technical_tag_passes(self):
        current = record("a", "Vorpal damping study",
                         "We examine the material.",
                         tags=["vorpal damping", "frumious probe"])
        candidate = record("b", "Another vorpal report",
                           "We examine a related material.",
                           tags=["vorpal damping", "frumious probe"])
        self.assertTrue(verdict(current, candidate).passes)

    def test_shared_formula_like_tokens_pass(self):
        # Digits and internal hyphens are what a formula or a named method
        # looks like, in any field.
        current = record("a", "Bivo4 photoanodes",
                         "The BiVO4 surface under G0W0 treatment.")
        candidate = record("b", "Bivo4 interfaces",
                           "Interfaces of BiVO4 studied with G0W0.")
        self.assertTrue(verdict(current, candidate).passes)

    def test_shared_long_domain_words_in_title_and_abstract_pass(self):
        current = record(
            "a", "Chalcogenide nanostructure gaps",
            "Heterogeneous chalcogenide nanostructures and their "
            "nanoparticle photovoltaic behaviour.")
        candidate = record(
            "b", "Chalcogenide nanoparticle traps",
            "Chalcogenide nanoparticle photovoltaic response in "
            "heterogeneous nanostructures.")
        self.assertTrue(verdict(current, candidate).passes)


class TestResultCap(unittest.TestCase):
    def test_the_cap_is_three(self):
        self.assertEqual(3, R.MAX_RESULTS)

    def test_a_passing_list_is_never_padded_and_never_exceeds_the_cap(self):
        current = record("a", "Vorpal damping study", "Vorpal damping.",
                         tags=["vorpal damping", "frumious probe"])
        neighbours = [
            record("n%d" % i, "Vorpal damping variant %d" % i,
                   "Vorpal damping with a frumious probe, variant %d." % i,
                   tags=["vorpal damping", "frumious probe"])
            for i in range(6)]
        for expected in (0, 1, 2, 3):
            pool = neighbours[:expected] if expected < 3 else neighbours
            records = [current] + pool + filler()
            stats = corpus_stats(records)
            ranked = R.rank(R.build_internal_profile(current),
                            [R.build_internal_profile(r) for r in pool],
                            stats, frozenset(), R.MAX_RESULTS)
            self.assertEqual(min(expected, 3), len(ranked),
                             "expected %d" % expected)


if __name__ == "__main__":
    unittest.main()
