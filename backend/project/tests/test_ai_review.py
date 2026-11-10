"""AI-BASED PROVISIONAL relatedness labelling.

Nothing here contacts a provider: `assist.call_gemini` is stubbed everywhere.
What is pinned is the set of properties that make the output trustworthy as
TRIAGE -- and only as triage.

The two that matter most:

* the provider never sees what the gate decided, so its opinion is
  independent rather than an echo; and
* an automated pass can never write into a file where a person's ratings
  live.
"""
import io
import json
import os
import shutil
import tempfile
import unittest
from unittest import mock

from project.tools import ai_review
from project.tools import eval_core as core
from project.tools import related_eval


# ---------------------------------------------------------------- fixtures

def record(index=0, title=None, abstract=None):
    return {
        "record_id": "rec%02d" % index,
        "record_title": title if title is not None
        else "Rareword resonance of gadgetite lattices",
        "record_abstract": abstract if abstract is not None
        else ("Rareword resonance in gadgetite lattices is probed with a "
              "cryogenic spectrometer and a tunable oscillator."),
        "record_year": 2021,
        "record_doi": "10.1000/rec%02d" % index,
    }


def candidate(title="Rareword resonance in gadgetite single crystals",
              source="internal", gate_decision="accepted", in_top5=True,
              abstract="Rareword resonance of gadgetite lattices measured "
                       "with a cryogenic spectrometer.",
              score=9.0, doi="10.2000/cand"):
    return {
        "source": source,
        "rank": 0,
        "title": title,
        "abstract": abstract,
        "year": 2022,
        "doi": doi,
        "provider_paper_id": "S2-X",
        "gate_score": score,
        "gate_components": {"score": score, "similarity": 0.4},
        "gate_decision": gate_decision,
        "rejection_code": "" if gate_decision == "accepted" else "no_evidence",
        "rejection_reason": "" if gate_decision == "accepted"
        else "no evidence at all: ...",
        "reasons": ["High title and abstract similarity (0.48)"],
        "in_top5": in_top5,
    }


def answer(rating="related", confidence="high", reason="Both study rareword "
                                                       "resonance in gadgetite."):
    return json.dumps({"rating": rating, "confidence": confidence,
                       "reason": reason})


# ---------------------------------------------------------- blind payloads

class TestBlindInput(unittest.TestCase):
    def test_the_gate_decision_never_reaches_the_provider(self):
        payload = ai_review.blind_pair_payload(record(), candidate())
        blob = json.dumps(payload)
        for leaked in ("gate_score", "gate_decision", "gate_components",
                       "rejection_code", "rejection_reason", "reasons",
                       "in_top5", "rank", "source", "accepted", "rejected",
                       "High title and abstract similarity"):
            self.assertNotIn(leaked, blob, leaked)
        self.assertTrue(ai_review.payload_is_blind(payload))

    def test_the_blind_check_catches_a_leak(self):
        leaky = ai_review.blind_pair_payload(record(), candidate())
        leaky["candidate_paper"]["gate_decision"] = "accepted"
        self.assertFalse(ai_review.payload_is_blind(leaky))

    def test_exactly_one_pair_per_payload(self):
        payload = ai_review.blind_pair_payload(record(), candidate())
        self.assertEqual({"task", "reference_paper", "candidate_paper"},
                         set(payload))
        for side in ("reference_paper", "candidate_paper"):
            self.assertIsInstance(payload[side], dict)
            self.assertIn("title", payload[side])

    def test_only_bibliography_is_sent(self):
        payload = ai_review.blind_pair_payload(record(), candidate())
        allowed = {"title", "abstract", "year", "doi", "venue"}
        for side in ("reference_paper", "candidate_paper"):
            self.assertTrue(set(payload[side]) <= allowed,
                            set(payload[side]) - allowed)

    def test_a_missing_abstract_is_absent_rather_than_empty(self):
        payload = ai_review.blind_pair_payload(
            record(abstract=""), candidate(abstract=""))
        self.assertNotIn("abstract", payload["reference_paper"])
        self.assertNotIn("abstract", payload["candidate_paper"])

    def test_metadata_floor(self):
        self.assertTrue(ai_review.has_enough_metadata(record(), candidate()))
        self.assertFalse(
            ai_review.has_enough_metadata(record(title=""), candidate()))
        self.assertFalse(
            ai_review.has_enough_metadata(record(), candidate(title="")))


# ------------------------------------------------------- structured answers

class TestAnswerValidation(unittest.TestCase):
    def test_a_well_formed_answer_is_accepted(self):
        result, error = ai_review.parse_ai_answer(answer())
        self.assertIsNone(error)
        self.assertEqual("related", result["ai_rating"])
        self.assertEqual("high", result["ai_confidence"])
        self.assertTrue(result["ai_reason"])

    def test_every_rating_outside_the_enum_is_refused_not_coerced(self):
        for bad in ("yes", "maybe", "RELATED-ISH", "3", "", None):
            result, error = ai_review.parse_ai_answer(
                json.dumps({"rating": bad, "confidence": "high",
                            "reason": "x"}))
            self.assertIsNone(result, bad)
            self.assertIn("rating", error)

    def test_every_confidence_outside_the_enum_is_refused(self):
        for bad in ("very high", "0.9", "", None):
            result, error = ai_review.parse_ai_answer(
                json.dumps({"rating": "related", "confidence": bad,
                            "reason": "x"}))
            self.assertIsNone(result, bad)
            self.assertIn("confidence", error)

    def test_required_fields_are_enforced(self):
        for missing in ("rating", "confidence", "reason"):
            payload = {"rating": "related", "confidence": "high",
                       "reason": "x"}
            payload.pop(missing)
            result, error = ai_review.parse_ai_answer(json.dumps(payload))
            self.assertIsNone(result, missing)
            self.assertIn(missing, error)

    def test_an_empty_reason_is_refused(self):
        result, error = ai_review.parse_ai_answer(
            json.dumps({"rating": "related", "confidence": "high",
                        "reason": "   "}))
        self.assertIsNone(result)

    def test_unparseable_and_non_object_answers_are_refused(self):
        for bad in ("", "not json", "[1,2,3]", '"a string"'):
            result, error = ai_review.parse_ai_answer(bad)
            self.assertIsNone(result, bad)
            self.assertTrue(error, bad)

    def test_a_fenced_answer_is_still_read(self):
        result, error = ai_review.parse_ai_answer(
            "```json\n" + answer() + "\n```")
        self.assertIsNone(error)
        self.assertEqual("related", result["ai_rating"])

    def test_confidence_is_capped_to_low_without_abstracts(self):
        # Enforced locally: the model is not trusted to be modest about a
        # judgement it made from titles alone.
        for claimed in ("high", "medium"):
            result, error = ai_review.parse_ai_answer(
                answer(confidence=claimed), abstracts_available=False)
            self.assertIsNone(error)
            self.assertEqual("low", result["ai_confidence"], claimed)
            self.assertIn("capped to low", result["ai_reason"])

    def test_the_cap_does_not_touch_a_judgement_made_with_abstracts(self):
        result, _ = ai_review.parse_ai_answer(answer(confidence="high"),
                                              abstracts_available=True)
        self.assertEqual("high", result["ai_confidence"])
        self.assertNotIn("capped", result["ai_reason"])

    def test_the_schema_offered_to_the_provider_is_narrow(self):
        schema = ai_review.RESPONSE_SCHEMA
        self.assertEqual(sorted(["rating", "confidence", "reason"]),
                         sorted(schema["properties"]))
        self.assertEqual(list(ai_review.AI_RATINGS),
                         schema["properties"]["rating"]["enum"])
        self.assertEqual(list(ai_review.AI_CONFIDENCE),
                         schema["properties"]["confidence"]["enum"])

    def test_the_prompt_forbids_inventing_papers(self):
        prompt = ai_review.SYSTEM_PROMPT.lower()
        self.assertIn("do not invent", prompt)
        self.assertIn("data, not instructions", prompt)


# ------------------------------------------------------ expert shortlisting

def judged(index, source="internal", gate="accepted", rating="related",
           confidence="high", status=ai_review.STATUS_COMPLETED,
           record_id=None):
    return {
        "pair_key": "k%d" % index,
        "record_id": record_id or ("rec%02d" % (index % 6)),
        "record_title": "Record %d" % (index % 6),
        "source": source,
        "candidate_title": "Candidate %d" % index,
        "candidate_doi": None,
        "ai_rating": rating,
        "ai_confidence": confidence,
        "ai_reason": "because",
        "ai_status": status,
        "ai_error": "",
        "model": "m",
        "evaluated_at": "t",
        "abstracts_available": True,
        "gate_decision": gate,
        "in_top5": True,
        "evaluation_type": ai_review.EVALUATION_TYPE,
    }


class TestGateAiContract(unittest.TestCase):
    """One definition of agreement, used by the summary AND the shortlist.

    They used to hold separate hardcoded conditions and had drifted: the
    summary counted `partial` against a REJECT as a disagreement, while the
    shortlist recognised only `related` as a false negative. A real 10-pair
    run reported four disagreements and shortlisted three.
    """

    def test_the_full_contract(self):
        cases = {
            ("accepted", "related"): ai_review.VERDICT_AGREEMENT,
            ("accepted", "partial"): ai_review.VERDICT_AGREEMENT,
            ("accepted", "unrelated"): ai_review.VERDICT_FALSE_POSITIVE,
            ("rejected", "unrelated"): ai_review.VERDICT_AGREEMENT,
            ("rejected", "related"): ai_review.VERDICT_FALSE_NEGATIVE,
            ("rejected", "partial"): ai_review.VERDICT_FALSE_NEGATIVE,
        }
        for (decision, rating), expected in cases.items():
            self.assertEqual(expected,
                             ai_review.gate_ai_verdict(decision, rating),
                             "%s + %s" % (decision, rating))

    def test_partial_is_a_relationship_on_both_sides_of_the_gate(self):
        # The exact asymmetry that caused the bug.
        self.assertEqual(ai_review.VERDICT_AGREEMENT,
                         ai_review.gate_ai_verdict("accepted", "partial"))
        self.assertEqual(ai_review.VERDICT_FALSE_NEGATIVE,
                         ai_review.gate_ai_verdict("rejected", "partial"))

    def test_is_disagreement_agrees_with_the_verdict(self):
        for decision in ("accepted", "rejected"):
            for rating in ai_review.AI_RATINGS:
                expected = (ai_review.gate_ai_verdict(decision, rating)
                            != ai_review.VERDICT_AGREEMENT)
                self.assertEqual(expected,
                                 ai_review.is_disagreement(decision, rating))

    def test_the_false_negative_category_is_named_for_what_it_holds(self):
        self.assertEqual("gate_rejected_ai_related_or_partial",
                         ai_review.CATEGORY_FALSE_NEGATIVE)


class TestSmokeRunShape(unittest.TestCase):
    """The real 10-pair smoke result, pinned:
    related 1 / partial 5 / unrelated 4, agreement 6, disagreement 4,
    3 false positives and 1 false negative (a gate-rejected `partial`)."""

    def rows(self):
        spec = [
            # (gate_decision, ai_rating)  -- 10 pairs
            ("accepted", "related"),      # agreement
            ("accepted", "partial"),      # agreement
            ("accepted", "partial"),      # agreement
            ("accepted", "partial"),      # agreement
            ("accepted", "partial"),      # agreement
            ("accepted", "unrelated"),    # FALSE POSITIVE
            ("accepted", "unrelated"),    # FALSE POSITIVE
            ("accepted", "unrelated"),    # FALSE POSITIVE
            ("rejected", "unrelated"),    # agreement
            ("rejected", "partial"),      # FALSE NEGATIVE
        ]
        return [judged(index, gate=decision, rating=rating,
                       record_id="rec%02d" % index)
                for index, (decision, rating) in enumerate(spec)]

    def test_the_counts_match_the_real_run(self):
        rows = self.rows()
        summary = ai_review.ai_summary(rows, "m", {}, 10, 0, 10)
        self.assertEqual(1, summary["rating_counts"]["related"])
        self.assertEqual(5, summary["rating_counts"]["partial"])
        self.assertEqual(4, summary["rating_counts"]["unrelated"])
        self.assertEqual(6, summary["gate_agreement"]["agree"])
        self.assertEqual(4, summary["gate_agreement"]["disagree"])
        self.assertEqual(3, summary["gate_agreement"]["false_positives"])
        self.assertEqual(1, summary["gate_agreement"]["false_negatives"])

    def test_the_shortlist_categorises_every_disagreement(self):
        rows = self.rows()
        buckets = ai_review.categorize(rows)
        self.assertEqual(3, len(buckets[ai_review.CATEGORY_FALSE_POSITIVE]))
        self.assertEqual(1, len(buckets[ai_review.CATEGORY_FALSE_NEGATIVE]))

    def test_the_gate_rejected_partial_is_not_filed_as_random(self):
        # This is the row that used to disappear into the random sample.
        rows = self.rows()
        buckets = ai_review.categorize(rows)
        random_pairs = {r["pair_key"]
                        for r in buckets[ai_review.CATEGORY_RANDOM]}
        false_negatives = buckets[ai_review.CATEGORY_FALSE_NEGATIVE]
        self.assertEqual(1, len(false_negatives))
        self.assertEqual("rejected", false_negatives[0]["gate_decision"])
        self.assertEqual("partial", false_negatives[0]["ai_rating"])
        self.assertNotIn(false_negatives[0]["pair_key"], random_pairs)

    def test_summary_and_shortlist_can_never_report_different_totals(self):
        for rows in (self.rows(), self.mixed_rows()):
            summary = ai_review.ai_summary(rows, "m", {}, len(rows), 0, 0)
            buckets = ai_review.categorize(rows)
            categorised = (len(buckets[ai_review.CATEGORY_FALSE_POSITIVE])
                           + len(buckets[ai_review.CATEGORY_FALSE_NEGATIVE]))
            self.assertEqual(summary["gate_agreement"]["disagree"],
                             categorised)

    def mixed_rows(self):
        rows, n = [], 0
        for decision in ("accepted", "rejected"):
            for rating in ai_review.AI_RATINGS:
                for confidence in ("high", "low"):
                    rows.append(judged(n, gate=decision, rating=rating,
                                       confidence=confidence,
                                       record_id="rec%02d" % (n % 5)))
                    n += 1
        return rows

    def test_every_disagreement_reaches_the_shortlist_at_a_small_limit(self):
        rows = self.rows()
        shortlist, _ = ai_review.select_for_expert(rows, limit=4)
        categories = [category for category, _ in shortlist]
        self.assertEqual(4, len(shortlist))
        self.assertNotIn(ai_review.CATEGORY_RANDOM, categories,
                         "contested pairs come before a random sample")
        self.assertEqual(
            3, categories.count(ai_review.CATEGORY_FALSE_POSITIVE))
        self.assertEqual(
            1, categories.count(ai_review.CATEGORY_FALSE_NEGATIVE))

    def test_a_row_is_counted_in_exactly_one_category(self):
        rows = self.mixed_rows()
        buckets = ai_review.categorize(rows)
        seen = []
        for bucket in buckets.values():
            seen.extend(r["pair_key"] for r in bucket)
        self.assertEqual(len(seen), len(set(seen)))
        completed = [r for r in rows
                     if r["ai_status"] == ai_review.STATUS_COMPLETED]
        self.assertEqual(len(completed), len(seen))


class TestReasonShortening(unittest.TestCase):
    """Raw slicing produced "thermoelectr" and "donor-acceptor pa" --
    fragments a reviewer cannot check and that read as words the model never
    wrote."""

    # Deliberately longer than MAX_REASON_CHARS, with several sentence
    # boundaries so there is a real choice of cut point.
    SENTENCES = (
        "Both papers study spin defects in silicon carbide using density "
        "functional theory. The candidate additionally measures coherence "
        "times at cryogenic temperatures, which the reference only predicts. "
        "The overlap is therefore in the material and the method rather than "
        "in the specific measurement reported. A reviewer would likely call "
        "this closely related work worth reading alongside the reference, "
        "though the experimental section addresses a different question "
        "about thermoelectric transport in the same host material.")

    def test_short_reasons_are_untouched(self):
        for text in ("Both study thermoelectric transport.",
                     "a" * ai_review.MAX_REASON_CHARS):
            self.assertEqual(text, ai_review.shorten_reason(text))

    def test_a_long_reason_ends_at_a_sentence_boundary(self):
        result = ai_review.shorten_reason(self.SENTENCES)
        self.assertTrue(result.endswith(ai_review.REASON_TRUNCATION_SUFFIX))
        body = result[:-len(ai_review.REASON_TRUNCATION_SUFFIX)]
        self.assertTrue(body.endswith("."), repr(body[-40:]))
        self.assertIn("density functional theory.", body)

    def test_it_never_ends_mid_word(self):
        # The reported symptoms, reproduced: each of these words sat exactly
        # across the old 400-character slice point.
        for filler in range(380, 405):
            text = ("x" * filler) + " thermoelectric transport measurements"
            result = ai_review.shorten_reason(text)
            body = result.replace(ai_review.REASON_TRUNCATION_SUFFIX, "")
            self.assertNotIn("thermoelectr ", body + " ")
            for fragment in ("thermoelectr", "thermoelectri",
                             "thermoelectric transpor"):
                self.assertFalse(body.endswith(fragment), (filler, body[-30:]))

    def test_a_word_boundary_is_used_when_there_is_no_sentence_end(self):
        text = " ".join(["donor-acceptor pairs in wide bandgap semiconductors"]
                        * 20)
        result = ai_review.shorten_reason(text)
        body = result[:-len(ai_review.REASON_TRUNCATION_SUFFIX)]
        self.assertFalse(body.endswith("pa"), repr(body[-20:]))
        # Every word in the body is a whole word from the source.
        source_words = set(text.split())
        for word in body.split():
            self.assertIn(word, source_words, word)

    def test_an_early_full_stop_does_not_gut_the_explanation(self):
        # One short sentence, then a long one: cutting at the early boundary
        # would throw away almost everything, so a word boundary wins.
        text = "They agree. " + ("useful detail " * 60)
        result = ai_review.shorten_reason(text)
        self.assertGreater(
            len(result),
            ai_review.MAX_REASON_CHARS * ai_review.MIN_SENTENCE_KEEP_RATIO)

    def test_truncation_is_always_marked(self):
        result = ai_review.shorten_reason(self.SENTENCES)
        self.assertIn("...", result)
        short = ai_review.shorten_reason("Both study widgets.")
        self.assertNotIn("...", short)

    def test_the_limit_is_never_exceeded(self):
        for text in (self.SENTENCES, "a" * 5000, "word " * 500,
                     "no-spaces-at-all" * 100):
            self.assertLessEqual(len(ai_review.shorten_reason(text)),
                                 ai_review.MAX_REASON_CHARS, text[:20])

    def test_whitespace_only_and_empty_input(self):
        for text in ("", "   ", "\t\n  ", None):
            self.assertEqual("", ai_review.shorten_reason(text))

    def test_a_single_enormous_token_is_handled_safely(self):
        result = ai_review.shorten_reason("z" * 2000)
        self.assertLessEqual(len(result), ai_review.MAX_REASON_CHARS)
        self.assertTrue(result.endswith(ai_review.REASON_TRUNCATION_SUFFIX))

    def test_internal_whitespace_is_normalized(self):
        self.assertEqual("Both study widgets.",
                         ai_review.shorten_reason("  Both   study\n\twidgets. "))

    def test_the_confidence_clamp_note_survives_a_long_reason(self):
        answer_text = json.dumps({"rating": "partial", "confidence": "high",
                                  "reason": self.SENTENCES * 3})
        result, error = ai_review.parse_ai_answer(answer_text,
                                                  abstracts_available=False)
        self.assertIsNone(error)
        self.assertEqual("low", result["ai_confidence"])
        # The note is appended whole, never itself cut off.
        self.assertTrue(result["ai_reason"].endswith(
            ai_review.CONFIDENCE_CLAMP_NOTE))
        self.assertLessEqual(len(result["ai_reason"]),
                             ai_review.MAX_REASON_WITH_NOTE_CHARS)
        self.assertIn("...", result["ai_reason"])

    def test_a_clamped_short_reason_keeps_its_whole_text(self):
        result, _ = ai_review.parse_ai_answer(
            answer(reason="Both study widgets."), abstracts_available=False)
        self.assertTrue(result["ai_reason"].startswith("Both study widgets."))
        self.assertIn("capped to low", result["ai_reason"])
        self.assertNotIn("...", result["ai_reason"])


class TestExpertShortlist(unittest.TestCase):
    def mixed(self):
        rows = []
        n = 0
        for _ in range(8):     # gate accepted, AI unrelated
            rows.append(judged(n, gate="accepted", rating="unrelated")); n += 1
        for _ in range(8):     # gate rejected, AI related
            rows.append(judged(n, gate="rejected", rating="related")); n += 1
        for _ in range(8):     # low confidence
            rows.append(judged(n, gate="accepted", rating="partial",
                               confidence="low")); n += 1
        for _ in range(8):     # ordinary agreement
            rows.append(judged(n, gate="accepted", rating="related")); n += 1
        return rows

    def test_it_never_exceeds_the_cap(self):
        shortlist, _ = ai_review.select_for_expert(self.mixed(), limit=30)
        self.assertLessEqual(len(shortlist), 30)

    def test_each_risk_category_is_represented(self):
        shortlist, _ = ai_review.select_for_expert(self.mixed(), limit=30)
        present = {category for category, _ in shortlist}
        for required in (ai_review.CATEGORY_FALSE_POSITIVE,
                         ai_review.CATEGORY_FALSE_NEGATIVE,
                         ai_review.CATEGORY_LOW_CONFIDENCE):
            self.assertIn(required, present, required)

    def test_no_single_category_swamps_the_list(self):
        # 200 false positives and a handful of everything else: the list must
        # still sample the other kinds of disagreement.
        rows = [judged(i, gate="accepted", rating="unrelated")
                for i in range(200)]
        rows += [judged(500 + i, gate="rejected", rating="related")
                 for i in range(4)]
        shortlist, _ = ai_review.select_for_expert(rows, limit=30)
        counts = {}
        for category, _ in shortlist:
            counts[category] = counts.get(category, 0) + 1
        self.assertLessEqual(counts[ai_review.CATEGORY_FALSE_POSITIVE], 26)
        self.assertEqual(4, counts[ai_review.CATEGORY_FALSE_NEGATIVE])

    def test_a_pair_appears_in_exactly_one_category(self):
        shortlist, _ = ai_review.select_for_expert(self.mixed(), limit=30)
        keys = [row["pair_key"] for _, row in shortlist]
        self.assertEqual(len(keys), len(set(keys)))

    def test_internal_external_disagreement_is_detected(self):
        rows = []
        for i in range(4):
            rows.append(judged(i, source="internal", gate="accepted",
                               rating="related", record_id="split"))
        for i in range(4):
            rows.append(judged(10 + i, source="recommendations_default",
                               gate="accepted", rating="unrelated",
                               record_id="split"))
        buckets = ai_review.categorize(rows)
        # The unrelated+accepted rows land in the false-positive bucket first
        # (more diagnostic); the record is still recognised as conflicted.
        self.assertTrue(buckets[ai_review.CATEGORY_FALSE_POSITIVE])
        rows.append(judged(99, source="internal", gate="rejected",
                           rating="partial", record_id="split"))
        buckets = ai_review.categorize(rows)
        self.assertTrue(buckets[ai_review.CATEGORY_SOURCE_CONFLICT])

    def test_unjudged_rows_never_reach_the_expert_file(self):
        rows = self.mixed() + [
            judged(900, status=ai_review.STATUS_PROVIDER_ERROR, rating=""),
            judged(901, status=ai_review.STATUS_INSUFFICIENT, rating=""),
        ]
        shortlist, _ = ai_review.select_for_expert(rows, limit=30)
        for _, row in shortlist:
            self.assertEqual(ai_review.STATUS_COMPLETED, row["ai_status"])

    def test_the_shortlist_is_deterministic(self):
        rows = self.mixed()
        first, _ = ai_review.select_for_expert(rows, limit=30)
        second, _ = ai_review.select_for_expert(list(reversed(rows)), limit=30)
        self.assertEqual([(c, r["pair_key"]) for c, r in first],
                         [(c, r["pair_key"]) for c, r in second])


# --------------------------------------------------------------- end to end

class FakeGemini:
    """Stands in for assist.call_gemini, recording every payload."""

    def __init__(self, answers=None, errors=None):
        self.payloads = []
        self.prompts = []
        self.schemas = []
        self._answers = list(answers or [])
        self._errors = list(errors or [])

    def __call__(self, cfg, payload, system_prompt, schema,
                 max_output_tokens=None):
        self.payloads.append(payload)
        self.prompts.append(system_prompt)
        self.schemas.append(schema)
        if self._errors:
            error = self._errors.pop(0)
            if error:
                return None, error
        if self._answers:
            return self._answers.pop(0), None
        return answer(), None


CONFIGURED = {"QRESP_GEMINI_ENABLED": "1",
              "QRESP_GEMINI_API_KEY": "gemini-super-secret"}


def pair_id_for(record_id, source, stable_key):
    return core.pair_identifier(record_id, source, stable_key)


class TestAiLabelCommand(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="ai-label-")
        self.write_raw()

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def default_records(self):
        records = []
        for i in range(3):
            internal = candidate(title="Internal candidate %d" % i)
            internal["stable_key"] = "int%d" % i
            internal["pair_id"] = pair_id_for("rec%02d" % i, "internal",
                                              "int%d" % i)
            external = candidate(title="External candidate %d" % i,
                                 source="recommendations_default",
                                 gate_decision="rejected", in_top5=False,
                                 score=1.0)
            external["stable_key"] = "ext%d" % i
            external["pair_id"] = pair_id_for(
                "rec%02d" % i, "recommendations_default", "ext%d" % i)
            records.append({
                **record(i),
                "status": "ok", "flags": [], "provider_outcomes": {},
                "internal": [internal],
                "external": {"recommendations_default": [external]},
            })
        return records

    def write_raw(self, records=None, review=True):
        records = records if records is not None else self.default_records()
        path = os.path.join(self.dir, "raw-results.jsonl")
        with io.open(path, "w", encoding="utf-8", newline="\n") as handle:
            for row in records:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")
        if review:
            self.write_review(records)

    def write_review(self, records, name="human-review.tsv", legacy=False,
                     mutate=None):
        """The whitelist: every pair in `records`, in the review TSV shape."""
        columns = core.LEGACY_TSV_COLUMNS if legacy else core.TSV_COLUMNS
        rows = [columns]
        for entry in records:
            candidates = list(entry.get("internal") or [])
            for pool in (entry.get("external") or {}).values():
                candidates.extend(pool)
            for item in candidates:
                cells = [entry["record_id"], entry["record_title"],
                         item["source"], item["title"],
                         " | ".join(item.get("reasons") or []),
                         str(item["gate_score"]), item["gate_decision"],
                         "", ""]
                if not legacy:
                    cells = [item.get("pair_id") or ""] + cells
                if mutate:
                    cells = mutate(cells)
                rows.append(tuple(cells))
        path = os.path.join(self.dir, name)
        with io.open(path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(core.render_tsv(rows))
        if name == "human-review.tsv":
            self.human = path
            self.human_bytes = io.open(path, encoding="utf-8").read()
        return path

    def run_ai(self, gemini=None, argv_extra=(), env=None):
        gemini = gemini or FakeGemini()
        argv = ["ai-label", "--output-dir", self.dir, "--rate-limit", "0"]
        argv.extend(argv_extra)
        with mock.patch.dict("os.environ", env or CONFIGURED):
            with mock.patch("project.assist.call_gemini", gemini):
                code = related_eval.main(argv)
        return code, gemini

    def read(self, name):
        with io.open(os.path.join(self.dir, name), encoding="utf-8") as f:
            return f.read()

    def lines(self, name):
        return [l for l in self.read(name).split("\n") if l]

    # -- core behaviour ---------------------------------------------------

    def test_it_writes_all_four_files(self):
        code, _ = self.run_ai()
        self.assertEqual(0, code)
        for name in ("ai-review.tsv", "ai-review.jsonl", "ai-summary.json",
                     "expert-review.tsv"):
            self.assertTrue(os.path.isfile(os.path.join(self.dir, name)), name)

    def test_one_provider_call_per_pair(self):
        _, gemini = self.run_ai()
        # 3 records x (1 internal + 1 default) = 6 pairs
        self.assertEqual(6, len(gemini.payloads))
        for payload in gemini.payloads:
            self.assertEqual({"task", "reference_paper", "candidate_paper"},
                             set(payload))

    def test_no_payload_ever_carries_a_gate_decision(self):
        _, gemini = self.run_ai()
        blob = json.dumps(gemini.payloads)
        for leaked in ("gate_score", "gate_decision", "rejection_reason",
                       "in_top5", "accepted", "rejected",
                       "High title and abstract similarity"):
            self.assertNotIn(leaked, blob, leaked)

    def test_the_human_review_file_is_never_touched(self):
        self.run_ai()
        self.assertEqual(self.human_bytes,
                         io.open(self.human, encoding="utf-8").read())

    def test_a_provider_failure_does_not_stop_the_run(self):
        gemini = FakeGemini(errors=["the provider is unavailable", None,
                                    None, None, None, None])
        code, gemini = self.run_ai(gemini=gemini)
        self.assertEqual(0, code)
        rows = [json.loads(l) for l in self.lines("ai-review.jsonl")]
        statuses = {r["ai_status"] for r in rows}
        self.assertIn(ai_review.STATUS_PROVIDER_ERROR, statuses)
        self.assertIn(ai_review.STATUS_COMPLETED, statuses)
        self.assertEqual(6, len(rows))

    def test_a_raised_exception_is_contained(self):
        class Exploding(FakeGemini):
            def __call__(self, *args, **kwargs):
                raise RuntimeError("boom")
        code, _ = self.run_ai(gemini=Exploding())
        self.assertEqual(0, code)
        rows = [json.loads(l) for l in self.lines("ai-review.jsonl")]
        self.assertEqual(6, len(rows))
        self.assertTrue(all(r["ai_status"] == ai_review.STATUS_PROVIDER_ERROR
                            for r in rows))

    def test_an_unusable_answer_is_recorded_not_guessed_at(self):
        gemini = FakeGemini(answers=[json.dumps(
            {"rating": "sort of", "confidence": "high", "reason": "x"})])
        self.run_ai(gemini=gemini)
        rows = [json.loads(l) for l in self.lines("ai-review.jsonl")]
        bad = [r for r in rows if r["ai_status"]
               == ai_review.STATUS_PROVIDER_ERROR]
        self.assertTrue(bad)
        self.assertEqual("", bad[0]["ai_rating"])
        self.assertIn("rating", bad[0]["ai_error"])

    # -- cache / resume ---------------------------------------------------

    def test_completed_pairs_are_not_asked_again(self):
        _, first = self.run_ai()
        self.assertEqual(6, len(first.payloads))
        _, second = self.run_ai()
        self.assertEqual(0, len(second.payloads),
                         "a second run must reuse the cache")

    def test_an_interrupted_run_resumes_where_it_stopped(self):
        class StopsHalfway(FakeGemini):
            def __call__(self, *args, **kwargs):
                if len(self.payloads) >= 3:
                    raise KeyboardInterrupt()
                return super().__call__(*args, **kwargs)
        with self.assertRaises(KeyboardInterrupt):
            self.run_ai(gemini=StopsHalfway())
        # Everything judged before the interruption was flushed to disk.
        rows = [json.loads(l) for l in self.lines("ai-review.jsonl")]
        self.assertEqual(3, len(rows))
        _, resumed = self.run_ai()
        self.assertEqual(3, len(resumed.payloads),
                         "only the unjudged pairs are re-asked")

    def test_failures_are_retried_only_when_asked(self):
        self.run_ai(gemini=FakeGemini(errors=["down"] * 6))
        _, again = self.run_ai()
        self.assertEqual(0, len(again.payloads))
        _, retried = self.run_ai(argv_extra=["--retry-errors"])
        self.assertEqual(6, len(retried.payloads))

    # -- metadata handling ------------------------------------------------

    def test_a_pair_without_titles_is_never_sent(self):
        item = candidate()
        item["stable_key"] = "int0"
        item["pair_id"] = pair_id_for("rec00", "internal", "int0")
        self.write_raw([{
            **record(0, title=""),
            "status": "ok", "flags": [], "provider_outcomes": {},
            "internal": [item], "external": {},
        }])
        _, gemini = self.run_ai()
        self.assertEqual([], gemini.payloads)
        rows = [json.loads(l) for l in self.lines("ai-review.jsonl")]
        self.assertEqual(ai_review.STATUS_INSUFFICIENT, rows[0]["ai_status"])

    def test_one_missing_abstract_forces_low_confidence(self):
        # The record has an abstract, the candidate does not: still judgeable,
        # but not confidently.
        item = candidate(abstract="")
        item["stable_key"] = "int0"
        item["pair_id"] = pair_id_for("rec00", "internal", "int0")
        self.write_raw([{
            **record(0),
            "status": "ok", "flags": [], "provider_outcomes": {},
            "internal": [item], "external": {},
        }])
        self.run_ai(gemini=FakeGemini(answers=[answer(confidence="high")]))
        rows = [json.loads(l) for l in self.lines("ai-review.jsonl")]
        self.assertEqual(ai_review.STATUS_COMPLETED, rows[0]["ai_status"])
        self.assertEqual("low", rows[0]["ai_confidence"])
        self.assertFalse(rows[0]["abstracts_available"])

    # -- outputs ----------------------------------------------------------

    def test_the_expert_file_is_capped_and_leaves_the_rating_blank(self):
        self.run_ai()
        lines = self.lines("expert-review.tsv")
        self.assertEqual("\t".join(ai_review.EXPERT_REVIEW_COLUMNS), lines[0])
        self.assertLessEqual(len(lines) - 1, 30)
        columns = lines[0].split("\t")
        ri = columns.index("human_rating")
        ni = columns.index("human_note")
        for line in lines[1:]:
            cells = line.split("\t")
            self.assertEqual(len(columns), len(cells))
            self.assertEqual("", cells[ri])
            self.assertEqual("", cells[ni])

    def test_every_output_says_it_is_provisional(self):
        self.run_ai()
        summary = json.loads(self.read("ai-summary.json"))
        self.assertEqual("ai_provisional", summary["evaluation_type"])
        self.assertIn("provisional", summary["disclaimer"].lower())
        for banned in ("ground truth", "validated", "verified"):
            self.assertNotIn(
                banned, summary["disclaimer"].lower().replace(
                    "not expert ground truth", "").replace(
                    "not validated", "").replace("not verified", ""))
        rows = [json.loads(l) for l in self.lines("ai-review.jsonl")]
        self.assertTrue(all(r["evaluation_type"] == "ai_provisional"
                            for r in rows))

    def test_no_secret_reaches_any_output_file(self):
        self.run_ai()
        blob = "".join(self.read(name) for name in
                       ("ai-review.tsv", "ai-review.jsonl",
                        "ai-summary.json", "expert-review.tsv"))
        for secret in ("gemini-super-secret", "x-goog-api-key",
                       "Authorization", "system_instruction"):
            self.assertNotIn(secret, blob, secret)
        # The system prompt itself is not echoed into the artifacts either.
        self.assertNotIn("You judge whether two scientific papers", blob)

    def test_the_run_changes_no_gate_score(self):
        raw_before = self.read("raw-results.jsonl")
        self.run_ai()
        self.assertEqual(raw_before, self.read("raw-results.jsonl"))
        rows = [json.loads(l) for l in self.lines("ai-review.jsonl")]
        # The AI's opinion is recorded ALONGSIDE the gate's, never over it.
        self.assertTrue(all("gate_decision" in r for r in rows))
        self.assertTrue(all(r["gate_decision"] in ("accepted", "rejected")
                            for r in rows))

    def test_it_writes_nothing_to_mongo(self):
        from project.models import RelatedResearchCache
        with mock.patch.object(RelatedResearchCache, "objects") as objects:
            self.run_ai()
            self.assertFalse(objects.called)

    # -- configuration ----------------------------------------------------

    def test_without_a_key_it_refuses_rather_than_pretending(self):
        code, gemini = self.run_ai(
            env={"QRESP_GEMINI_ENABLED": "", "QRESP_GEMINI_API_KEY": ""})
        self.assertEqual(3, code)
        self.assertEqual([], gemini.payloads)

    def test_dry_run_builds_payloads_but_contacts_nobody(self):
        code, gemini = self.run_ai(
            argv_extra=["--dry-run"],
            env={"QRESP_GEMINI_ENABLED": "", "QRESP_GEMINI_API_KEY": ""})
        self.assertEqual(0, code)
        self.assertEqual([], gemini.payloads)

    def test_sources_can_be_restricted(self):
        _, gemini = self.run_ai(argv_extra=["--sources", "internal"])
        self.assertEqual(3, len(gemini.payloads))

    def test_the_pair_limit_is_honoured(self):
        _, gemini = self.run_ai(argv_extra=["--limit", "2"])
        self.assertEqual(2, len(gemini.payloads))


class TestReviewFileIsTheWorkList(unittest.TestCase):
    """The bug this class exists for: `ai-label` used to judge every candidate
    in raw-results.jsonl. On the real artifacts that is 1,434 pairs, not the
    135 a reviewer was ever asked about -- a 10x overspend, silently, on a
    file nobody would read."""

    RECORDS = 18
    INTERNAL_PER_RECORD = 63          # 1,134 across 18 records
    DEFAULT_PER_RECORD = 17           # 306; trimmed to 300 below
    REVIEW_PER_RECORD = 7             # 126, topped up to 135 below

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="ai-worklist-")
        self.records = self.build_records()
        self.write_raw()

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def build_records(self):
        records = []
        for r in range(self.RECORDS):
            internal, external = [], []
            for i in range(self.INTERNAL_PER_RECORD):
                item = candidate(title="R%02d internal %03d" % (r, i))
                item["stable_key"] = "r%02d-int-%03d" % (r, i)
                item["pair_id"] = pair_id_for("rec%02d" % r, "internal",
                                              item["stable_key"])
                internal.append(item)
            for i in range(self.DEFAULT_PER_RECORD):
                item = candidate(title="R%02d external %03d" % (r, i),
                                 source="recommendations_default")
                item["stable_key"] = "r%02d-ext-%03d" % (r, i)
                item["pair_id"] = pair_id_for(
                    "rec%02d" % r, "recommendations_default",
                    item["stable_key"])
                external.append(item)
            records.append({
                **record(r),
                "status": "ok", "flags": [], "provider_outcomes": {},
                "internal": internal,
                "external": {"recommendations_default": external},
            })
        # Trim to exactly the shape the real artifacts have.
        total_ext = sum(len(x["external"]["recommendations_default"])
                        for x in records)
        excess = total_ext - 300
        for entry in records:
            while excess > 0 and entry["external"]["recommendations_default"]:
                entry["external"]["recommendations_default"].pop()
                excess -= 1
                break
        return records

    def raw_pair_count(self):
        total = 0
        for entry in self.records:
            total += len(entry["internal"])
            for pool in entry["external"].values():
                total += len(pool)
        return total

    def write_raw(self):
        path = os.path.join(self.dir, "raw-results.jsonl")
        with io.open(path, "w", encoding="utf-8", newline="\n") as handle:
            for entry in self.records:
                handle.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def write_review(self, per_record=None, legacy=False, mutate=None,
                     name="human-review.tsv"):
        per_record = per_record or self.REVIEW_PER_RECORD
        columns = core.LEGACY_TSV_COLUMNS if legacy else core.TSV_COLUMNS
        rows, written = [columns], 0
        for entry in self.records:
            chosen = entry["internal"][:per_record - 2]
            chosen += entry["external"]["recommendations_default"][:2]
            for item in chosen:
                if written >= 135:
                    break
                cells = [entry["record_id"], entry["record_title"],
                         item["source"], item["title"], "", "9.0",
                         item["gate_decision"], "", ""]
                if not legacy:
                    cells = [item.get("pair_id") or ""] + cells
                if mutate:
                    cells = mutate(cells)
                rows.append(tuple(cells))
                written += 1
        # Top up to exactly 135 from whatever is left.
        for entry in self.records:
            for item in entry["internal"][per_record:]:
                if written >= 135:
                    break
                cells = [entry["record_id"], entry["record_title"],
                         item["source"], item["title"], "", "9.0",
                         item["gate_decision"], "", ""]
                if not legacy:
                    cells = [item.get("pair_id") or ""] + cells
                if mutate:
                    cells = mutate(cells)
                rows.append(tuple(cells))
                written += 1
        path = os.path.join(self.dir, name)
        with io.open(path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(core.render_tsv(rows))
        return path, written

    def run_ai(self, argv_extra=(), gemini=None, env=None):
        gemini = gemini or FakeGemini()
        argv = ["ai-label", "--output-dir", self.dir, "--rate-limit", "0"]
        argv.extend(argv_extra)
        with mock.patch.dict("os.environ", env or CONFIGURED):
            with mock.patch("project.assist.call_gemini", gemini):
                code = related_eval.main(argv)
        return code, gemini

    # -- the headline numbers ---------------------------------------------

    def test_the_fixture_matches_the_real_artifacts(self):
        self.assertEqual(18, len(self.records))
        internal = sum(len(e["internal"]) for e in self.records)
        external = sum(len(e["external"]["recommendations_default"])
                       for e in self.records)
        self.assertEqual(1134, internal)
        self.assertEqual(300, external)
        self.assertEqual(1434, self.raw_pair_count())

    def test_raw_1434_and_review_135_gives_exactly_135_calls(self):
        _, written = self.write_review()
        self.assertEqual(135, written)
        code, gemini = self.run_ai()
        self.assertEqual(0, code)
        self.assertEqual(135, len(gemini.payloads),
                         "only the review file's pairs may be judged")

    def test_the_limit_applies_after_the_whitelist_not_before(self):
        self.write_review()
        _, gemini = self.run_ai(argv_extra=["--limit", "5"])
        self.assertEqual(5, len(gemini.payloads))

    def test_a_shorter_review_file_means_fewer_calls(self):
        path, written = self.write_review(name="first-pass.tsv")
        # Re-use only the first 20 rows.
        lines = [l for l in io.open(path, encoding="utf-8").read().split("\n")
                 if l]
        short = os.path.join(self.dir, "short.tsv")
        with io.open(short, "w", encoding="utf-8", newline="\n") as handle:
            handle.write("\n".join(lines[:21]) + "\n")
        _, gemini = self.run_ai(argv_extra=["--review-file", short])
        self.assertEqual(20, len(gemini.payloads))

    # -- matching ---------------------------------------------------------

    def test_a_legacy_review_file_without_pair_id_still_matches(self):
        self.write_review(legacy=True)
        code, gemini = self.run_ai()
        self.assertEqual(0, code)
        self.assertEqual(135, len(gemini.payloads))

    def test_an_unmatched_row_stops_the_run_before_any_call(self):
        def rename(cells):
            if cells[4].endswith("internal 000"):
                cells[4] = "A candidate that is not in raw-results"
                cells[0] = ""      # no pair_id either, so no fallback match
            return cells
        self.write_review(mutate=rename)
        code, gemini = self.run_ai()
        self.assertEqual(4, code)
        self.assertEqual([], gemini.payloads,
                         "nothing may be spent while the files disagree")

    def test_an_ambiguous_row_stops_the_run_before_any_call(self):
        # Two raw candidates share a title, and the review row carries no
        # pair_id to tell them apart.
        duplicate = candidate(title="R00 internal 000")
        duplicate["stable_key"] = "r00-int-duplicate"
        duplicate["pair_id"] = pair_id_for("rec00", "internal",
                                           "r00-int-duplicate")
        self.records[0]["internal"].append(duplicate)
        self.write_raw()
        self.write_review(legacy=True)
        code, gemini = self.run_ai()
        self.assertEqual(4, code)
        self.assertEqual([], gemini.payloads)

    def test_pair_id_disambiguates_what_a_title_cannot(self):
        duplicate = candidate(title="R00 internal 000")
        duplicate["stable_key"] = "r00-int-duplicate"
        duplicate["pair_id"] = pair_id_for("rec00", "internal",
                                           "r00-int-duplicate")
        self.records[0]["internal"].append(duplicate)
        self.write_raw()
        self.write_review()          # new format, pair_id present
        code, gemini = self.run_ai()
        self.assertEqual(0, code)
        self.assertEqual(135, len(gemini.payloads))

    # -- preflight --------------------------------------------------------

    def preflight_of(self, output):
        report = {}
        for line in output.split("\n"):
            parts = line.strip().split()
            if len(parts) == 2 and parts[1].isdigit():
                report[parts[0]] = int(parts[1])
        return report

    def test_preflight_reports_every_required_number(self):
        self.write_review()
        import contextlib
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            self.run_ai(argv_extra=["--dry-run"])
        report = self.preflight_of(buffer.getvalue())
        for key in ("raw_pairs", "review_rows", "matched_pairs",
                    "unmatched_pairs", "ambiguous_pairs",
                    "pairs_with_both_abstracts", "pairs_with_one_abstract",
                    "pairs_with_no_abstract", "cached_pairs",
                    "planned_provider_calls"):
            self.assertIn(key, report, key)
        self.assertEqual(1434, report["raw_pairs"])
        self.assertEqual(135, report["review_rows"])
        self.assertEqual(135, report["matched_pairs"])
        self.assertEqual(0, report["unmatched_pairs"])
        self.assertEqual(0, report["ambiguous_pairs"])
        self.assertEqual(135, report["planned_provider_calls"])

    def test_dry_run_reports_the_same_plan_and_calls_nobody(self):
        self.write_review()
        code, gemini = self.run_ai(argv_extra=["--dry-run"])
        self.assertEqual(0, code)
        self.assertEqual([], gemini.payloads)

    # -- title-only guard -------------------------------------------------

    def strip_all_abstracts(self):
        for entry in self.records:
            entry["record_abstract"] = ""
            for item in entry["internal"]:
                item["abstract"] = ""
            for item in entry["external"]["recommendations_default"]:
                item["abstract"] = ""
        self.write_raw()

    def test_pairs_with_no_abstract_are_not_sent_by_default(self):
        self.strip_all_abstracts()
        self.write_review()
        code, gemini = self.run_ai()
        self.assertEqual(0, code)
        self.assertEqual([], gemini.payloads,
                         "title-only judgement is off by default")
        rows = [json.loads(l) for l in
                io.open(os.path.join(self.dir, "ai-review.jsonl"),
                        encoding="utf-8").read().split("\n") if l]
        self.assertEqual(135, len(rows))
        self.assertTrue(all(r["ai_status"] == ai_review.STATUS_INSUFFICIENT
                            for r in rows))
        self.assertTrue(all("abstract" in r["ai_error"] for r in rows))

    def test_preflight_plans_zero_calls_when_nothing_has_an_abstract(self):
        self.strip_all_abstracts()
        self.write_review()
        import contextlib
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            self.run_ai(argv_extra=["--dry-run"])
        report = self.preflight_of(buffer.getvalue())
        self.assertEqual(135, report["pairs_with_no_abstract"])
        self.assertEqual(0, report["pairs_with_both_abstracts"])
        self.assertEqual(0, report["planned_provider_calls"])

    def test_allow_title_only_opts_in_and_forces_low_confidence(self):
        self.strip_all_abstracts()
        self.write_review()
        code, gemini = self.run_ai(
            argv_extra=["--allow-title-only", "--limit", "3"])
        self.assertEqual(0, code)
        self.assertEqual(3, len(gemini.payloads))
        rows = [json.loads(l) for l in
                io.open(os.path.join(self.dir, "ai-review.jsonl"),
                        encoding="utf-8").read().split("\n") if l]
        judged = [r for r in rows
                  if r["ai_status"] == ai_review.STATUS_COMPLETED]
        self.assertEqual(3, len(judged))
        self.assertTrue(all(r["ai_confidence"] == "low" for r in judged))

    # -- cache ------------------------------------------------------------

    def test_the_cache_is_counted_and_not_re_asked(self):
        self.write_review()
        self.run_ai(argv_extra=["--limit", "10"])
        import contextlib
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            _, gemini = self.run_ai()
        report = self.preflight_of(buffer.getvalue())
        self.assertEqual(10, report["cached_pairs"])
        self.assertEqual(125, report["planned_provider_calls"])
        self.assertEqual(125, len(gemini.payloads))

    def test_the_human_review_file_is_never_written(self):
        path, _ = self.write_review()
        before = io.open(path, encoding="utf-8").read()
        self.run_ai()
        self.assertEqual(before, io.open(path, encoding="utf-8").read())


class TestStratifiedSmokeSample(unittest.TestCase):
    """The bug this replaces: `--limit 5` took the first five rows of a review
    file that is grouped by record, so all five were internal candidates of
    ONE paper. The run succeeded and told you nothing about the other
    seventeen records or about the external half at all."""

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="smoke-sample-")

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def build(self, records=6, internal_per=8, external_per=4,
              abstracts=True):
        """A review file shaped like the real one: every candidate of record 0
        first, then record 1, and so on. Front-loading is the whole point."""
        entries = []
        for r in range(records):
            internal, external = [], []
            for i in range(internal_per):
                item = candidate(
                    title="R%d internal %d" % (r, i),
                    gate_decision="accepted" if i % 2 == 0 else "rejected",
                    score=float(20 - i),
                    abstract=("Internal abstract %d %d" % (r, i)
                              if abstracts else ""))
                item["stable_key"] = "r%d-int-%d" % (r, i)
                item["pair_id"] = pair_id_for("rec%02d" % r, "internal",
                                              item["stable_key"])
                internal.append(item)
            for i in range(external_per):
                item = candidate(
                    title="R%d external %d" % (r, i),
                    source="recommendations_default",
                    gate_decision="accepted" if i % 2 == 0 else "rejected",
                    score=float(8 - i),
                    abstract=("External abstract %d %d" % (r, i)
                              if abstracts else ""))
                item["stable_key"] = "r%d-ext-%d" % (r, i)
                item["pair_id"] = pair_id_for(
                    "rec%02d" % r, "recommendations_default",
                    item["stable_key"])
                external.append(item)
            entries.append({
                **record(r),
                "status": "ok", "flags": [], "provider_outcomes": {},
                "internal": internal,
                "external": {"recommendations_default": external},
            })

        with io.open(os.path.join(self.dir, "raw-results.jsonl"), "w",
                     encoding="utf-8", newline="\n") as handle:
            for entry in entries:
                handle.write(json.dumps(entry, ensure_ascii=False) + "\n")

        rows = [core.TSV_COLUMNS]
        for entry in entries:
            items = list(entry["internal"])
            items += entry["external"]["recommendations_default"]
            for item in items:
                rows.append((item["pair_id"], entry["record_id"],
                             entry["record_title"], item["source"],
                             item["title"], "", str(item["gate_score"]),
                             item["gate_decision"], "", ""))
        with io.open(os.path.join(self.dir, "human-review.tsv"), "w",
                     encoding="utf-8", newline="\n") as handle:
            handle.write(core.render_tsv(rows))
        return entries

    def run_sample(self, argv_extra=()):
        argv = ["smoke-sample", "--output-dir", self.dir]
        argv.extend(argv_extra)
        return related_eval.main(argv)

    def sample_rows(self):
        path = os.path.join(self.dir, "ai-smoke-review.tsv")
        lines = [l for l in io.open(path, encoding="utf-8").read().split("\n")
                 if l]
        header = lines[0].split("\t")
        return [dict(zip(header, l.split("\t"))) for l in lines[1:]]

    # -- the point of the exercise ----------------------------------------

    def test_it_spreads_across_records_despite_front_loading(self):
        self.build()
        self.assertEqual(0, self.run_sample())
        rows = self.sample_rows()
        self.assertEqual(10, len(rows))
        records = {r["record_id"] for r in rows}
        self.assertGreaterEqual(len(records), 5,
                                "a sample from one or two records is the bug")

    def test_both_sources_are_represented(self):
        self.build()
        self.run_sample()
        sources = {r["source"] for r in self.sample_rows()}
        self.assertEqual({"internal", "recommendations_default"}, sources)

    def test_both_gate_decisions_are_represented(self):
        self.build()
        self.run_sample()
        decisions = {r["gate_decision"] for r in self.sample_rows()}
        self.assertEqual({"accepted", "rejected"}, decisions)

    def test_scores_are_not_all_from_the_top(self):
        self.build()
        self.run_sample()
        scores = sorted(float(r["gate_score"]) for r in self.sample_rows())
        self.assertGreater(scores[-1] - scores[0], 1.0,
                           "the sample must span a range of gate scores")

    def test_a_single_record_cannot_dominate(self):
        # Every candidate of record 0 sits at the front of the file AND
        # carries the best scores.
        self.build()
        self.run_sample()
        rows = self.sample_rows()
        counts = {}
        for row in rows:
            counts[row["record_id"]] = counts.get(row["record_id"], 0) + 1
        self.assertLessEqual(max(counts.values()), 3,
                             "no record may take more than a few slots")

    def test_pairs_with_both_abstracts_are_preferred(self):
        # Half the candidates have no abstract; the sample should favour the
        # ones a model can actually read.
        entries = self.build()
        for index, entry in enumerate(entries):
            if index % 2:
                entry["record_abstract"] = ""
        with io.open(os.path.join(self.dir, "raw-results.jsonl"), "w",
                     encoding="utf-8", newline="\n") as handle:
            for entry in entries:
                handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
        self.run_sample()
        rows = self.sample_rows()
        readable = {e["record_id"] for e in entries
                    if e["record_abstract"].strip()}
        with_abstracts = sum(1 for r in rows if r["record_id"] in readable)
        self.assertGreaterEqual(with_abstracts, len(rows) // 2)

    # -- determinism -------------------------------------------------------

    def test_the_same_input_always_gives_the_same_ten(self):
        self.build()
        self.run_sample()
        first = self.read_sample_text()
        self.run_sample()
        self.assertEqual(first, self.read_sample_text())

    def read_sample_text(self):
        return io.open(os.path.join(self.dir, "ai-smoke-review.tsv"),
                       encoding="utf-8").read()

    def test_no_randomness_is_used(self):
        source = io.open(core.__file__, encoding="utf-8").read()
        self.assertNotIn("import random", source)
        self.assertNotIn("random.", source)

    # -- contract ----------------------------------------------------------

    def test_it_contacts_no_provider(self):
        self.build()
        with mock.patch("project.assist.call_gemini") as gemini:
            with mock.patch.object(related_eval.related, "requests") as http:
                self.assertEqual(0, self.run_sample())
        self.assertFalse(gemini.called)
        self.assertFalse(http.get.called)

    def test_it_never_writes_a_human_file(self):
        self.build()
        human = os.path.join(self.dir, "human-review.tsv")
        before = io.open(human, encoding="utf-8").read()
        self.run_sample()
        self.assertEqual(before, io.open(human, encoding="utf-8").read())

    def test_the_sample_is_a_strict_subset_of_the_review_file(self):
        self.build()
        self.run_sample()
        review = {(r["record_id"], r["source"], r["candidate_title"])
                  for r in self.sample_rows()}
        with io.open(os.path.join(self.dir, "human-review.tsv"),
                     encoding="utf-8") as handle:
            parent, _ = core.parse_tsv(handle.read())
        parent_keys = {(r["record_id"], r["source"], r["candidate_title"])
                       for r in parent}
        self.assertTrue(review <= parent_keys)

    def test_human_rating_is_blank_in_the_sample(self):
        self.build()
        self.run_sample()
        for row in self.sample_rows():
            self.assertEqual("", row["human_rating"])
            self.assertEqual("", row["human_note"])

    def test_ai_label_can_use_the_sample_directly(self):
        self.build()
        self.run_sample()
        sample = os.path.join(self.dir, "ai-smoke-review.tsv")
        gemini = FakeGemini()
        with mock.patch.dict("os.environ", CONFIGURED):
            with mock.patch("project.assist.call_gemini", gemini):
                code = related_eval.main([
                    "ai-label", "--output-dir", self.dir,
                    "--review-file", sample, "--rate-limit", "0"])
        self.assertEqual(0, code)
        self.assertEqual(10, len(gemini.payloads),
                         "the sample defines exactly ten calls")

    def test_the_limit_is_honoured(self):
        self.build()
        self.run_sample(argv_extra=["--limit", "4"])
        self.assertEqual(4, len(self.sample_rows()))

    def test_a_small_review_file_yields_what_it_has(self):
        self.build(records=1, internal_per=2, external_per=1)
        self.run_sample()
        self.assertEqual(3, len(self.sample_rows()))


class TestCollectStoresAbstracts(unittest.TestCase):
    """The abstracts have to actually be in raw-results.jsonl, or every
    judgement silently degrades to titles. Verified through the real collect
    route, not by trusting the schema."""

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="collect-abstracts-")

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_collect_writes_record_and_candidate_abstracts(self):
        from project.tests import test_related_eval as fixtures

        provider = fixtures.FakeProvider()
        session = fixtures.FakeQrespSession(fixtures.rich_corpus(6),
                                            provider=provider)
        with mock.patch("requests.Session", return_value=session):
            code = related_eval.main([
                "collect", "--api-base", "https://qresp.example.org",
                "--output-dir", self.dir, "--sample-size", "3", "--live"])
        self.assertEqual(0, code)

        records = [json.loads(l) for l in
                   io.open(os.path.join(self.dir, "raw-results.jsonl"),
                           encoding="utf-8").read().split("\n") if l]
        self.assertTrue(records)
        for entry in records:
            self.assertTrue(entry["record_abstract"].strip(),
                            "record_abstract must be stored")
            candidates = list(entry["internal"])
            for pool in entry["external"].values():
                candidates.extend(pool)
            self.assertTrue(candidates)
            with_abstract = [c for c in candidates
                             if (c.get("abstract") or "").strip()]
            self.assertTrue(with_abstract,
                            "candidate abstracts must be stored")
            for item in candidates:
                self.assertIn("pair_id", item)
                self.assertTrue(item["pair_id"])

    def test_collect_reports_abstract_coverage(self):
        from project.tests import test_related_eval as fixtures

        provider = fixtures.FakeProvider()
        session = fixtures.FakeQrespSession(fixtures.rich_corpus(6),
                                            provider=provider)
        with mock.patch("requests.Session", return_value=session):
            related_eval.main([
                "collect", "--api-base", "https://qresp.example.org",
                "--output-dir", self.dir, "--sample-size", "3", "--live"])
        with io.open(os.path.join(self.dir, "summary.json"),
                     encoding="utf-8") as handle:
            summary = json.load(handle)
        coverage = summary["abstract_coverage"]
        self.assertEqual(3, coverage["records_total"])
        self.assertEqual(3, coverage["records_with_abstract"])
        self.assertEqual(1.0, coverage["records_ratio"])
        self.assertGreater(coverage["candidates_with_abstract"], 0)
        self.assertGreater(coverage["candidates_ratio"], 0.0)


if __name__ == "__main__":
    unittest.main()
