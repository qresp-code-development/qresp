"""Pure logic for the Related Research domain-quality evaluation.

No network, no filesystem, no clock, no configuration -- everything here is a
function of its arguments, so the sampling, the exclusions, the field
allowlist, the rating rules and the metrics are all unit-testable without a
live Qresp or a live provider.

The scoring itself is NOT reimplemented here. Anything that decides whether a
candidate is related comes from `project.relatedness` and `project.related`;
this module only feeds them, describes what they decided, and counts.

Privacy: `to_canonical_record` is the single place a public API payload
becomes something this tool works with, and it is an ALLOWLIST. Curator
names/emails, owner and editor fields, RCC URLs, file-server paths, file
names and image files are not copied through it, so they cannot reach a
profile, a JSONL line, a TSV cell or a summary.
"""
import hashlib
import json
import re

from project import relatedness as R

# --------------------------------------------------------------- input shape

# The public /api/search response is built from `Search.__dict__`, so its keys
# arrive name-mangled (`_Search__title`). Newer/other payloads -- notably
# /api/paper/{id} -- use plain names. Both are read HERE and nowhere else, so
# the rest of the tool never sees a legacy key.
SEARCH_FIELD_ALIASES = {
    "id": ("_Search__id", "id", "_id", "paper_id"),
    "title": ("_Search__title", "title"),
    "abstract": ("_Search__abstract", "abstract", "publishedAbstract"),
    "doi": ("_Search__doi", "doi", "DOI"),
    "tags": ("_Search__tags", "tags"),
    "collections": ("_Search__collections", "collections"),
    "publication": ("_Search__publication", "publication", "journal"),
    "year": ("_Search__year", "year"),
    "authors": ("_Search__authors", "authors"),
}

# Artifact fields that carry scientific meaning. Everything else an artifact
# holds -- `files`, `URLs`, `imageFile`, `saveas`, ids -- is a path, a link or
# bookkeeping, and is deliberately absent.
CHART_FIELDS = ("caption", "properties")
ARTIFACT_FIELDS = ("readme", "keywords")
TOOL_FIELDS = ("packageName", "programName", "facilityname", "facilityName",
               "measurement", "readme")


def _first(raw, names):
    for name in names:
        if name in raw and raw[name] not in (None, ""):
            return raw[name]
    return None


def _as_list(value):
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(item).strip() for item in value if str(item or "").strip()]
    text = str(value).strip()
    if not text:
        return []
    return [part.strip() for part in text.split(",") if part.strip()]


def _as_int(value):
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def normalize_search_record(raw):
    """Any Qresp record payload -> one canonical, allowlisted dict.

    Legacy `_Search__*` keys and plain keys are both understood, and this is
    the ONLY place either is read.
    """
    raw = raw or {}
    record = {}
    for field, aliases in SEARCH_FIELD_ALIASES.items():
        record[field] = _first(raw, aliases)
    record["id"] = str(record["id"] or "").strip()
    for field in ("title", "abstract", "doi", "publication"):
        record[field] = str(record[field] or "").strip()
    record["tags"] = _as_list(record["tags"])
    record["collections"] = _as_list(record["collections"])
    record["authors"] = _as_list(record["authors"])
    record["year"] = _as_int(record["year"])
    return record


def _artifact_list(raw, fields):
    kept = []
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        entry = {}
        for field in fields:
            value = item.get(field)
            if isinstance(value, (list, tuple)):
                entry[field] = [str(v) for v in value if str(v or "").strip()]
            elif value not in (None, ""):
                entry[field] = str(value)
        if entry:
            kept.append(entry)
    return kept


def to_canonical_record(record, details=None):
    """Canonical `Paper.to_mongo().to_dict()` shape, as the production
    relatedness code expects it.

    `details` is an optional /api/paper/{id} payload, which carries the
    artifact metadata the search projection does not. Only the fields listed
    at the top of this module are copied across -- no curator identity, no
    owner or editor, no file-server path, no file or image name.
    """
    details = details or {}
    normalized = normalize_search_record(record)
    detail_fields = normalize_search_record(details)
    for field in ("title", "abstract", "doi", "publication"):
        if not normalized[field] and detail_fields[field]:
            normalized[field] = detail_fields[field]
    for field in ("tags", "collections", "authors"):
        if not normalized[field] and detail_fields[field]:
            normalized[field] = detail_fields[field]
    if normalized["year"] is None:
        normalized["year"] = detail_fields["year"]

    return {
        "_id": normalized["id"],
        "reference": {
            "title": normalized["title"],
            "publishedAbstract": normalized["abstract"],
            "DOI": normalized["doi"],
            "year": normalized["year"],
            # relatedness._people accepts plain name strings.
            "authors": list(normalized["authors"]),
        },
        "tags": list(normalized["tags"]),
        "collections": list(normalized["collections"]),
        "charts": _artifact_list(details.get("charts"), CHART_FIELDS),
        "datasets": _artifact_list(details.get("datasets"), ARTIFACT_FIELDS),
        "scripts": _artifact_list(details.get("scripts"), ARTIFACT_FIELDS),
        "tools": _artifact_list(details.get("tools"), TOOL_FIELDS),
    }, normalized


# ------------------------------------------------------------- record triage

STATUS_OK = "ok"
STATUS_REVIEW = "review_needed"
STATUS_EXCLUDED = "excluded"

# Titles that announce themselves as scaffolding. Matched as whole words on
# the normalized title so a real paper about, say, "QA/QC of spectra" is
# flagged for a human rather than silently dropped -- which is the whole
# point: nothing here auto-excludes for good.
TEST_TITLE_PATTERNS = (
    r"\bstaging\b", r"\btest\b", r"\btesting\b", r"\bqa\b", r"\bqc\b",
    r"\bplaceholder\b", r"\bdummy\b", r"\bsample record\b", r"\bexample\b",
    r"\buntitled\b", r"\bdelete me\b", r"\bdo not use\b", r"\bfoo\b",
    r"\bbar\b", r"\bbaz\b", r"\blorem\b", r"\bipsum\b", r"\basdf\b",
    r"\bqwerty\b", r"\bxxx+\b",
)
_TEST_TITLE_RE = re.compile("|".join(TEST_TITLE_PATTERNS))

# Keyboard-mash tags are the other obvious scaffolding marker.
_MASH_RE = re.compile(r"^(?:asdf|qwer|zxcv|test|foo|bar|baz|abc|xxx)+\d*$")

MIN_TITLE_TOKENS = 3
MIN_ABSTRACT_TOKENS = 20


def triage_record(normalized):
    """Judge whether a record can carry a relevance rating.

    Returns (status, flags). NOTHING is decided irreversibly here: a flagged
    record is reported with its reason and can be evaluated anyway with
    --include-flagged. The caller decides; this only explains.
    """
    flags = []
    title = normalized.get("title") or ""
    abstract = normalized.get("abstract") or ""
    title_tokens = R.tokenize(title)
    abstract_tokens = R.tokenize(abstract)

    if not title:
        flags.append(("no_title", "the record has no title"))
    elif _TEST_TITLE_RE.search(R.normalize_text(title)):
        flags.append(("test_title",
                      "the title reads like a test or placeholder record"))
    elif len(title_tokens) < MIN_TITLE_TOKENS:
        flags.append(("thin_title",
                      "the title has fewer than %d content words"
                      % MIN_TITLE_TOKENS))

    mashed = [t for t in normalized.get("tags") or []
              if _MASH_RE.match(R.normalize_text(t) or "")]
    if mashed:
        flags.append(("test_tags",
                      "%d tag(s) look like keyboard-mash placeholders"
                      % len(mashed)))

    if not abstract:
        flags.append(("no_abstract",
                      "no abstract, so text similarity cannot be judged"))
    elif len(abstract_tokens) < MIN_ABSTRACT_TOKENS:
        flags.append(("thin_abstract",
                      "the abstract has fewer than %d content words"
                      % MIN_ABSTRACT_TOKENS))

    # Checked INDEPENDENTLY of length: a short abstract must not hide a
    # mismatch, which is the more serious of the two and the exact symptom
    # seen on staging (a title describing one paper over another's abstract).
    # Not proof, so it is a flag and not a deletion.
    if title_tokens and abstract_tokens and not (set(title_tokens)
                                                 & set(abstract_tokens)):
        flags.append(("title_abstract_mismatch",
                      "the title and abstract share no content words, which "
                      "usually means they came from different papers"))

    if not normalized.get("doi"):
        flags.append(("no_doi",
                      "no DOI, so the external lookup must fall back to a "
                      "title match"))

    if not flags:
        return STATUS_OK, []
    blocking = {"no_title", "test_title", "test_tags",
                "title_abstract_mismatch"}
    status = (STATUS_EXCLUDED if any(code in blocking for code, _ in flags)
              else STATUS_REVIEW)
    return status, [{"code": code, "reason": reason} for code, reason in flags]


# ------------------------------------------------------ deterministic sample

def richness(normalized):
    """How much a record gives the gate to work with. Higher is better."""
    score = 0
    if normalized.get("doi"):
        score += 4
    abstract_tokens = len(R.tokenize(normalized.get("abstract") or ""))
    score += min(abstract_tokens // 25, 4)
    if abstract_tokens >= MIN_ABSTRACT_TOKENS:
        score += 2
    score += min(len(R.tokenize(normalized.get("title") or "")), 6) // 2
    score += min(len(normalized.get("tags") or []), 3)
    if normalized.get("collections"):
        score += 1
    if normalized.get("authors"):
        score += 1
    return score


def _stratum(normalized):
    """The axis a sample must not concentrate on. Collections first (Qresp's
    own grouping), then publication, then a catch-all."""
    collections = sorted(normalized.get("collections") or [])
    if collections:
        return "collection:%s" % R.normalize_text(collections[0])
    publication = normalized.get("publication") or ""
    if publication:
        return "publication:%s" % R.normalize_text(publication)
    return "unclassified"


def select_sample(records, size, include_flagged=False):
    """Pick `size` records, deterministically and without concentrating.

    Richer records first WITHIN a stratum, then one stratum at a time in a
    round robin, so twenty records from one collection cannot crowd out the
    rest. No randomness at all: the same input always yields the same sample,
    which is what makes a re-run comparable to the run before it.

    Returns (chosen, skipped) where each entry is
    {record, normalized, status, flags}.
    """
    triaged = []
    for raw in records or []:
        canonical, normalized = to_canonical_record(raw)
        status, flags = triage_record(normalized)
        triaged.append({"record": canonical, "normalized": normalized,
                        "status": status, "flags": flags})

    # Only a record that looks BROKEN (scaffolding title, mash tags, a title
    # and abstract from different papers) is held back, and even that is
    # reversible with include_flagged. A merely thin record -- short abstract,
    # no DOI -- is still evaluated, carrying its flags into the output, since
    # "this one has no DOI" is a finding about the corpus and not a reason to
    # stop looking at it.
    eligible, skipped = [], []
    for entry in triaged:
        usable = entry["status"] != STATUS_EXCLUDED or include_flagged
        if usable and entry["normalized"]["id"]:
            eligible.append(entry)
        else:
            skipped.append(entry)

    buckets = {}
    for entry in eligible:
        buckets.setdefault(_stratum(entry["normalized"]), []).append(entry)
    for bucket in buckets.values():
        bucket.sort(key=lambda e: (-richness(e["normalized"]),
                                   e["normalized"]["id"]))

    chosen = []
    order = sorted(buckets)
    while order and (size is None or len(chosen) < size):
        progressed = False
        for key in list(order):
            if size is not None and len(chosen) >= size:
                break
            bucket = buckets[key]
            if not bucket:
                order.remove(key)
                continue
            chosen.append(bucket.pop(0))
            progressed = True
        if not progressed:
            break

    picked = {id(entry) for entry in chosen}
    skipped.extend(entry for entry in eligible if id(entry) not in picked)
    return chosen, skipped


# --------------------------------------------------------- gate explanations

def gate_components(assessment):
    """The numbers behind one verdict, for a human reading the TSV.

    Read off the Assessment the production gate produced -- the decision is
    never recomputed here.
    """
    strong = [e for e in assessment.evidence if e.strength == R.STRONG]
    medium = [e for e in assessment.evidence if e.strength == R.MEDIUM]
    return {
        "score": round(assessment.score, 4),
        "similarity": round(assessment.similarity, 4),
        "shared_specific_terms": len(assessment.shared_terms),
        "shared_term_weight": round(assessment.shared_weight, 4),
        "strong_signals": len(strong),
        "medium_families": sorted({e.family for e in medium}),
        "families": sorted({e.family for e in assessment.evidence}),
    }


# Stable buckets for the rejection tally. The prose reason carries the actual
# numbers, which makes every string unique -- counting those produced a
# "frequency" table with a count of 1 against 300 distinct sentences.
REJECT_NO_EVIDENCE = "no_evidence"
REJECT_ONE_MEDIUM = "one_medium_family"
REJECT_TOO_FEW_MEDIUMS = "too_few_independent_mediums"


def rejection_code(assessment):
    """Which KIND of rejection this was. Empty when the gate accepted."""
    if assessment.passes:
        return ""
    if not assessment.evidence:
        return REJECT_NO_EVIDENCE
    medium_families = {e.family for e in assessment.evidence
                       if e.strength == R.MEDIUM}
    if len(medium_families) == 1:
        return REJECT_ONE_MEDIUM
    return REJECT_TOO_FEW_MEDIUMS


def rejection_reason(assessment):
    """Why the gate said no, in the gate's own terms, with the numbers a
    person needs to judge whether it was right. Empty when it said yes."""
    if assessment.passes:
        return ""
    medium_families = sorted({e.family for e in assessment.evidence
                              if e.strength == R.MEDIUM})
    if not assessment.evidence:
        return (
            "no evidence at all: %d shared specific terms (strong needs %d), "
            "text similarity %.3f (high bar %.2f), no shared tool"
            % (len(assessment.shared_terms), R.STRONG_SHARED_TERM_COUNT,
               assessment.similarity, R.HIGH_TEXT_SIMILARITY))
    if len(medium_families) == 1:
        return (
            "only one independent medium signal (%s); the gate needs one "
            "strong signal or two independent mediums. Similarity %.3f "
            "(high bar %.2f), %d shared specific terms weighing %.2f "
            "(strong needs %d terms and %.1f)"
            % (medium_families[0], assessment.similarity,
               R.HIGH_TEXT_SIMILARITY, len(assessment.shared_terms),
               assessment.shared_weight, R.STRONG_SHARED_TERM_COUNT,
               R.STRONG_SHARED_TERM_WEIGHT))
    return (
        "no strong signal and fewer than two independent mediums (%s); "
        "similarity %.3f, %d shared specific terms weighing %.2f"
        % (", ".join(medium_families) or "none", assessment.similarity,
           len(assessment.shared_terms), assessment.shared_weight))


# ------------------------------------------------------------- output schema

# The ONLY keys a candidate row may carry. Anything the provider volunteered
# that is not in this list -- openAccessPdf, embeddings, citation counts,
# author ids, homepages -- never reaches a file.
#
# `display_rank` / `display_page` / `visible` are what make the external
# measurement mean anything: production shows at most 25 external results,
# five to a page, so "the gate accepted it" and "a reader will ever see it"
# are different facts and are recorded as different fields.
#
# `provider_rank` is the candidate's position in the PROVIDER's own answer.
# Diagnostic only -- it is not the provider's score (which is never
# requested), it is not read by the gate, and it never justifies a
# recommendation.
CANDIDATE_KEYS = (
    "pair_id", "stable_key", "source", "rank", "provider_rank", "title",
    "abstract", "year", "doi", "provider_paper_id", "gate_score",
    "gate_components", "gate_decision", "rejection_code", "rejection_reason",
    "reasons", "in_top5", "display_rank", "display_page", "visible",
)

RECORD_KEYS = (
    "record_id", "record_title", "record_abstract", "record_year",
    "record_doi", "status", "flags", "internal", "external",
    "provider_outcomes", "external_pipeline",
)

# The production external list, as the reader meets it. Mirrors
# related.EXTERNAL_RESULTS_PER_PAGE / EXTERNAL_MAX_PAGES / EXTERNAL_MAX_RESULTS
# -- imported rather than restated wherever the caller has `related` in hand,
# and defaulted here so this module stays pure.
DEFAULT_PAGE_SIZE = 5
DEFAULT_MAX_PAGES = 5


def display_page_of(display_rank, page_size=DEFAULT_PAGE_SIZE):
    """1-based page a 1-based display rank falls on. None stays None."""
    if not display_rank or display_rank < 1:
        return None
    return ((display_rank - 1) // page_size) + 1

# Abstracts are carried so a later judgement -- human or machine -- can read
# what the paper actually says instead of guessing from a title. They are
# public bibliographic text, already used for scoring, and are bounded here so
# one pathological record cannot bloat the artifacts.
MAX_ABSTRACT_CHARS = 4000

TSV_COLUMNS = ("pair_id", "record_id", "record_title", "source",
               "candidate_title", "reasons", "gate_score", "gate_decision",
               "human_rating", "human_note")

# The column set before `pair_id` existed. Files already handed to reviewers
# use it, and they must keep working: a format change must never invalidate
# work somebody has already done.
LEGACY_TSV_COLUMNS = ("record_id", "record_title", "source",
                      "candidate_title", "reasons", "gate_score",
                      "gate_decision", "human_rating", "human_note")

# The BLIND export for judging what the external list actually shows.
#
# What is missing from it is the point: no gate score, no accept/reject
# verdict, no "Why related" sentence, no display rank and no page number. A
# reviewer told "the system scored this 11.4 and shows it first" mostly agrees
# with the system, and the question here is whether the system is right. All
# of that is kept in `raw-results.jsonl`, and `summarize` joins the ratings
# back to it by `pair_id`, so nothing is lost by leaving it out of the sheet.
EXTERNAL_REVIEW_COLUMNS = ("pair_id", "record_id", "record_title", "source",
                           "candidate_title", "candidate_year",
                           "candidate_doi", "human_rating", "human_note")

# Every review layout this tool can read back. Order matters only for the
# error message; a file is matched on its exact header.
REVIEW_COLUMN_SETS = (TSV_COLUMNS, LEGACY_TSV_COLUMNS, EXTERNAL_REVIEW_COLUMNS)

VALID_RATINGS = ("related", "partial", "unrelated")


def clip_abstract(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:MAX_ABSTRACT_CHARS]


def stable_candidate_key(source, profile_key, provider_paper_id, doi, title):
    """The most durable identifier this candidate has.

    Preference order: the Qresp record id or provider paper id (opaque and
    permanent), then the DOI, and only then the normalized title. A title is
    the weakest of the three -- two records can share one -- which is exactly
    why matching on it has to be able to report AMBIGUOUS rather than guess.
    """
    for value in (profile_key, provider_paper_id, doi):
        text = str(value or "").strip()
        if text:
            return text
    return normalize_title_key(title)


def pair_identifier(record_id, source, stable_key):
    """Stable id for one (record, candidate) pair.

    Hashed so it is short, TSV-safe and free of the delimiter problems that
    raw titles bring, while still being a pure function of the three things
    that identify the pair -- the same inputs always give the same id, across
    runs and across machines.
    """
    raw = "%s\x1f%s\x1f%s" % (record_id or "", source or "", stable_key or "")
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def candidate_row(source, rank, profile, assessment, in_top5,
                  provider_paper_id=None, abstract="", record_id="",
                  display_rank=None, provider_rank=None,
                  page_size=DEFAULT_PAGE_SIZE):
    """One evaluated candidate, allowlisted.

    `display_rank` is the candidate's 1-based position in the list production
    would actually render, or None when production would not render it at
    all. `visible` and `display_page` are derived from it, so "accepted by the
    gate" can never be mistaken for "seen by a reader".
    """
    stable_key = stable_candidate_key(
        source, profile.key if source == "internal" else None,
        provider_paper_id, profile.doi, profile.title)
    return {
        "pair_id": pair_identifier(record_id, source, stable_key),
        "stable_key": stable_key,
        "source": source,
        "rank": rank,
        "provider_rank": provider_rank,
        "display_rank": display_rank,
        "display_page": display_page_of(display_rank, page_size),
        "visible": bool(display_rank),
        "title": profile.title,
        "abstract": clip_abstract(abstract),
        "year": profile.year,
        "doi": profile.doi or None,
        "provider_paper_id": provider_paper_id or None,
        "gate_score": round(assessment.score, 4),
        "gate_components": gate_components(assessment),
        "gate_decision": "accepted" if assessment.passes else "rejected",
        "rejection_code": rejection_code(assessment),
        "rejection_reason": rejection_reason(assessment),
        "reasons": assessment.reasons(3),
        "in_top5": bool(in_top5),
    }


def _tsv_cell(value):
    """TSV has no escaping worth the name, so control characters are removed
    rather than encoded."""
    text = "" if value is None else str(value)
    return re.sub(r"[\t\r\n]+", " ", text).strip()


def tsv_rows(record_rows, rejected_per_source=5):
    """Human-review rows: what a visitor would actually SEE, plus the
    near-misses just behind it.

    Not "every accepted candidate": on a real, topically homogeneous corpus
    the gate accepts most pairs, and only the top five are ever shown. Asking
    a person to rate 900 rows that nobody will ever look at buys nothing and
    guarantees the review never gets finished.

    So each (record, source) contributes the candidates production would show
    (`in_top5`) and then the best-scoring ones it would not. The second group
    is there ON PURPOSE: without it the exercise can only find false
    positives, and the open question is the opposite one -- whether the gate
    is throwing away papers a physicist would have kept.
    """
    rows = [TSV_COLUMNS]
    for record in record_rows:
        candidates = list(record.get("internal") or [])
        for pool in (record.get("external") or {}).values():
            candidates.extend(pool)
        by_source = {}
        for candidate in candidates:
            by_source.setdefault(candidate["source"], []).append(candidate)
        for source in sorted(by_source):
            shown = [c for c in by_source[source] if c["in_top5"]]
            shown.sort(key=lambda c: (-c["gate_score"], c["title"]))
            near_misses = sorted(
                (c for c in by_source[source] if not c["in_top5"]),
                key=lambda c: (-c["gate_score"], c["title"]))
            for candidate in shown + near_misses[:rejected_per_source]:
                rows.append((
                    _tsv_cell(candidate.get("pair_id")),
                    _tsv_cell(record["record_id"]),
                    _tsv_cell(record["record_title"]),
                    _tsv_cell(candidate["source"]),
                    _tsv_cell(candidate["title"]),
                    _tsv_cell(" | ".join(candidate["reasons"])),
                    _tsv_cell(candidate["gate_score"]),
                    _tsv_cell(candidate["gate_decision"]),
                    "",   # human_rating -- filled in by a person, never here
                    "",   # human_note
                ))
    return rows


def render_tsv(rows):
    return "\n".join("\t".join(row) for row in rows) + "\n"


# ------------------------------------------ the external list a reader sees

# How many pages 2-5 rows to put in front of a reviewer alongside the whole of
# page 1. Page 1 is what almost everybody reads, so it is rated exhaustively;
# the deeper pages are sampled, because rating every one of them would be five
# times the work for the part of the list fewest people reach.
DEFAULT_DEEP_SAMPLE = 60

# ...and how many candidates NOT SHOWN to a reader to mix in -- beyond the
# 25-result display cap, whatever their own gate verdict happened to be.
#
# Without these the sheet cannot answer the question it most needs to. A
# review file containing only visible candidates can produce false POSITIVES
# and never a single false negative -- not because there are none, but
# because none was ever put in front of a person. A zero arrived at that way
# is indistinguishable in the JSON from a zero that was measured, which is
# the worse of the two failures. (The name is kept from when this population
# was exactly "gate-rejected"; under the current re-ranking policy it is
# "not visible", a slightly broader set that also catches the rarer case of a
# candidate the gate WOULD have accepted but that still scored outside the
# cap. Both are worth a human's eye, so both are sampled without asking
# which one they are.)
DEFAULT_REJECTED_SAMPLE = 60


def _stratify_by_page(pairs, limit):
    """A deterministic spread of (record, candidate) across display pages.

    Round-robin over the pages in order, and within a page prefer a record
    that is not in the sample yet. No randomness: the same input always gives
    the same sample, which is what makes one run comparable to the next.
    """
    buckets = {}
    for record, candidate in pairs:
        buckets.setdefault(candidate.get("display_page"), []).append(
            (record, candidate))
    for bucket in buckets.values():
        bucket.sort(key=lambda pair: (pair[0].get("record_id") or "",
                                      pair[1].get("display_rank") or 0))
    order = sorted(k for k in buckets if k is not None)
    selected, used = [], set()
    while order and len(selected) < limit:
        progressed = False
        for page in list(order):
            if len(selected) >= limit:
                break
            bucket = buckets[page]
            if not bucket:
                order.remove(page)
                continue
            pick = 0
            for index, (record, _candidate) in enumerate(bucket):
                if record.get("record_id") not in used:
                    pick = index
                    break
            record, candidate = bucket.pop(pick)
            used.add(record.get("record_id"))
            selected.append((record, candidate))
            progressed = True
        if not progressed:
            break
    return selected, {
        "available": len(pairs),
        "selected": len(selected),
        "distinct_records": len({r.get("record_id") for r, _ in selected}),
        "by_page": _tally(selected,
                          lambda pair: str(pair[1].get("display_page"))),
    }


def _stratify_rejected(pairs, limit):
    """A deterministic spread of (record, candidate) pairs NOT shown to a
    reader -- beyond the display cap, regardless of their own gate verdict.

    Stratified by score band -- the near-misses are where a false negative is
    most likely, and a sample drawn without bands would be almost all bottom
    scores -- and, within a band, preferring a record not in the sample yet.
    Bands are tertiles of the scores in this pool, so they adapt to the
    corpus instead of being hardcoded. No randomness anywhere.
    """
    scores = [float(candidate.get("gate_score") or 0.0)
              for _record, candidate in pairs]
    low_cut, high_cut = _score_cuts(scores)
    buckets = {}
    for record, candidate in pairs:
        band = _band_of(float(candidate.get("gate_score") or 0.0),
                        low_cut, high_cut)
        buckets.setdefault(band, []).append((record, candidate))
    for bucket in buckets.values():
        bucket.sort(key=lambda pair: (pair[0].get("record_id") or "",
                                      -float(pair[1].get("gate_score") or 0.0),
                                      str(pair[1].get("pair_id") or "")))
    order = [band for band in SCORE_BANDS if band in buckets]
    selected, used = [], set()
    while order and len(selected) < limit:
        progressed = False
        for band in list(order):
            if len(selected) >= limit:
                break
            bucket = buckets[band]
            if not bucket:
                order.remove(band)
                continue
            pick = 0
            for index, (record, _candidate) in enumerate(bucket):
                if record.get("record_id") not in used:
                    pick = index
                    break
            record, candidate = bucket.pop(pick)
            used.add(record.get("record_id"))
            selected.append((record, candidate))
            progressed = True
        if not progressed:
            break
    return selected, {
        "available": len(pairs),
        "selected": len(selected),
        "distinct_records": len({r.get("record_id") for r, _ in selected}),
        "by_score_band": _tally(
            selected,
            lambda pair: _band_of(float(pair[1].get("gate_score") or 0.0),
                                  low_cut, high_cut)),
        "by_rejection_code": _tally(
            selected,
            lambda pair: str(pair[1].get("rejection_code") or "unknown")),
    }


def _external_review_row(record, candidate):
    """One blind row: the two papers' own bibliography and nothing else."""
    return (
        _tsv_cell(candidate.get("pair_id")),
        _tsv_cell(record.get("record_id")),
        _tsv_cell(record.get("record_title")),
        _tsv_cell(candidate.get("source")),
        _tsv_cell(candidate.get("title")),
        _tsv_cell(candidate.get("year")),
        _tsv_cell(candidate.get("doi")),
        "",   # human_rating -- a person's column, blank here as always
        "",   # human_note
    )


def external_review_rows(record_rows, source,
                         deep_sample=DEFAULT_DEEP_SAMPLE,
                         rejected_sample=DEFAULT_REJECTED_SAMPLE):
    """The BLIND review sheet for Related External Papers.

    Three groups, and a reviewer cannot tell them apart:

      * every visible page-1 result;
      * a deterministic stratified sample of visible pages 2-5;
      * a deterministic stratified sample of candidates NOT shown to a
        reader -- outside the 25-result display cap.

    The third group is what makes a false negative findable at all. A sheet
    built only from visible candidates can surface false positives and
    structurally never a false negative -- and the resulting zero looks
    exactly like a measured zero. Under the CURRENT policy "not shown" is a
    broader population than "gate-rejected": nothing between de-duplication
    and the display cap is removed for failing the evidence gate, so a
    candidate can be visible with a REJECTED verdict (ranked in by score
    alone), and, less commonly, a candidate can be hidden with an ACCEPTED
    verdict (it passed the gate but still scored outside the top 25). Both
    belong in this sample -- the question is "did the reader see it", not
    "did the gate like it" -- so the selection below is keyed on visibility
    alone; `gate_decision` still rides along on every row for later analysis
    but never decides who is sampled.

    Only the two papers' own bibliography goes in the sheet: the gate's score,
    its verdict, its reasons, the display rank and the page number are all
    withheld, so a rating is a judgement about the papers and not agreement
    with the system being measured. They stay in `raw-results.jsonl`, and
    `summarize` joins the ratings back to them by `pair_id`.

    Rows are ordered by `pair_id` -- an opaque hash -- for the same reason.
    Appending the rejected sample after the visible one would have told a
    reviewer, by position alone, which rows the system had already thrown
    away.

    Returns (rows, report).
    """
    visible, rejected = [], []
    for record in record_rows:
        for candidate in ((record.get("external") or {}).get(source) or []):
            if candidate.get("visible"):
                visible.append((record, candidate))
            else:
                # NOT shown, for whatever reason -- see the docstring above.
                # `gate_decision` is not consulted here on purpose: under the
                # current policy it does not decide visibility, so it must
                # not decide sampling either.
                rejected.append((record, candidate))
    visible.sort(key=lambda pair: (pair[0].get("record_id") or "",
                                   pair[1].get("display_rank") or 0))
    page_one = [p for p in visible if p[1].get("display_page") == 1]
    deeper = [p for p in visible if (p[1].get("display_page") or 0) > 1]
    sampled, sample_report = _stratify_by_page(deeper, deep_sample)
    rejected_rows, rejected_report = _stratify_rejected(rejected,
                                                        rejected_sample)

    chosen = page_one + sampled + rejected_rows
    body = sorted((_external_review_row(record, candidate)
                   for record, candidate in chosen),
                  key=lambda row: (row[0], row[1], row[4]))
    rows = [EXTERNAL_REVIEW_COLUMNS] + body
    report = {
        "source": source,
        "visible_total": len(visible),
        "page_1_rows": len(page_one),
        "pages_2_to_5_rows": len(sampled),
        "pages_2_to_5_available": len(deeper),
        "rejected_rows": len(rejected_rows),
        "rejected_available": len(rejected),
        "rows": len(rows) - 1,
        "records": len({r.get("record_id") for r, _ in chosen}),
        "deep_sample": sample_report,
        "rejected_sample": rejected_report,
    }
    return rows, report


def candidate_index(record_rows):
    """Every raw candidate, indexed so a review row can be joined back to it.

    Two indexes, because two generations of review file exist: `pair_id` when
    the file carries one, and (record_id, source, candidate_title) when it
    does not. Both map to a LIST, so an ambiguous match can be reported as
    ambiguous instead of resolved by taking the first hit.
    """
    by_pair, by_triple = {}, {}
    for record in record_rows or []:
        candidates = list(record.get("internal") or [])
        for pool in (record.get("external") or {}).values():
            candidates.extend(pool)
        for candidate in candidates:
            facts = candidate_facts(record, candidate)
            if facts["pair_id"]:
                by_pair.setdefault(facts["pair_id"], []).append(facts)
            by_triple.setdefault(_triple(facts["record_id"], facts["source"],
                                         facts["title"]), []).append(facts)
    return {"by_pair": by_pair, "by_triple": by_triple}


def candidate_facts(record, candidate):
    """The subset of a raw candidate the metrics read.

    One shape, built in one place, so the review-file join and the visible
    universe cannot disagree about what a candidate is.
    """
    return {
        "pair_id": (candidate.get("pair_id") or "").strip(),
        "record_id": record.get("record_id"),
        "source": candidate.get("source"),
        "title": candidate.get("title"),
        "gate_decision": candidate.get("gate_decision"),
        "in_top5": bool(candidate.get("in_top5")),
        # `visible` is the new field; an artifact collected before it existed
        # falls back to `in_top5`, which meant the same thing under the old
        # caps.
        "visible": bool(candidate.get("visible", candidate.get("in_top5"))),
        "display_rank": candidate.get("display_rank"),
        "display_page": candidate.get("display_page"),
        "gate_score": candidate.get("gate_score"),
    }


def _triple(record_id, source, title):
    return (record_id, source, _tsv_cell(title).lower())


def candidate_identity(facts):
    """What makes two rows the SAME candidate.

    `pair_id` when there is one -- it is already a pure function of the
    record, the source and the candidate's most durable key. Otherwise the
    record/source/title triple, which is what a review file written before
    `pair_id` existed can offer.

    This is the key everything is de-duplicated by. Without it the same
    page-1 result appearing in both `human-review.tsv` and
    `external-review.tsv` counted twice, and a precision figure moved
    according to how many sheets a reviewer happened to be handed.
    """
    if facts.get("pair_id"):
        return ("pair", facts["pair_id"])
    return ("triple",) + _triple(facts.get("record_id"), facts.get("source"),
                                 facts.get("title"))


def production_candidates(record_rows, source):
    """Every candidate of one pool, de-duplicated by identity.

    THIS is the universe a precision figure is measured over -- the raw
    results, not the review file. A review file is a work list: it can name a
    candidate twice, or not at all, and neither fact says anything about what
    the product displayed.
    """
    universe = {}
    for record in record_rows or []:
        for candidate in ((record.get("external") or {}).get(source) or []):
            facts = candidate_facts(record, candidate)
            universe.setdefault(candidate_identity(facts), facts)
    return list(universe.values())


def lookup_candidate(row, index):
    """The ONE raw candidate a review row names, or None.

    None covers both "matches nothing" and "matches several". Neither is
    resolved by guessing: filing a rating against the wrong candidate would
    corrupt the measurement with no visible symptom.
    """
    pair_id = (row.get("pair_id") or "").strip()
    hits = index["by_pair"].get(pair_id) if pair_id else None
    if not hits:
        hits = index["by_triple"].get(
            (row.get("record_id"), row.get("source"),
             _tsv_cell(row.get("candidate_title")).lower())) or []
    return hits[0] if len(hits) == 1 else None


def parse_tsv(text):
    """Read a reviewed TSV back. Returns (rows, errors).

    Both column sets are accepted. A file written before `pair_id` existed is
    read with an empty `pair_id`, so a reviewer who has already started
    filling one in does not lose that work to a format change.
    """
    lines = [line for line in (text or "").split("\n") if line.strip()]
    if not lines:
        return [], ["the review file is empty"]
    header = tuple(lines[0].split("\t"))
    columns = None
    for candidate in REVIEW_COLUMN_SETS:
        if header == candidate:
            columns = candidate
            break
    if columns is None:
        return [], ["unexpected header: expected one of %s, found %s"
                    % ([list(c) for c in REVIEW_COLUMN_SETS], list(header))]
    rows, errors = [], []
    for number, line in enumerate(lines[1:], start=2):
        parts = line.split("\t")
        if len(parts) != len(columns):
            errors.append("line %d: expected %d columns, found %d"
                          % (number, len(columns), len(parts)))
            continue
        row = dict(zip(columns, parts))
        # Every layout is read back into the SAME shape, with the columns it
        # does not carry left empty. A blind export has no `gate_decision`
        # and a legacy file has no `pair_id`; neither may make the row a
        # different kind of thing to everything downstream.
        for name in ("pair_id", "reasons", "gate_score", "gate_decision",
                     "candidate_year", "candidate_doi"):
            row.setdefault(name, "")
        rating = (row["human_rating"] or "").strip().lower()
        if rating and rating not in VALID_RATINGS:
            errors.append("line %d: human_rating %r is not one of %s"
                          % (number, row["human_rating"],
                             ", ".join(VALID_RATINGS)))
            continue
        row["human_rating"] = rating
        rows.append(row)
    return rows, errors


# ------------------------------------------------- stratified smoke sample

SMOKE_SAMPLE_LIMIT = 10
SCORE_BANDS = ("high", "mid", "low")
GATE_DECISIONS = ("accepted", "rejected")


def _score_cuts(scores):
    """Tertile boundaries for a set of gate scores, computed PER SOURCE.

    Internal and external scores live on different scales -- an internal
    score of 9 is unremarkable while an external one is high -- so a single
    global cut would file every external candidate under "low" and the sample
    would never see a strong external match.
    """
    ordered = sorted(scores)
    if len(ordered) < 3:
        return None, None
    return ordered[len(ordered) // 3], ordered[(2 * len(ordered)) // 3]


def _band_of(score, low_cut, high_cut):
    if low_cut is None or high_cut is None:
        return "mid"
    if score >= high_cut:
        return "high"
    if score >= low_cut:
        return "mid"
    return "low"


def _both_abstracts(entry):
    return bool((entry["record"].get("record_abstract") or "").strip()
                and (entry["candidate"].get("abstract") or "").strip())


def select_smoke_sample(entries, limit=SMOKE_SAMPLE_LIMIT):
    """A deterministic, spread-out handful of pairs for a first real run.

    Taking the first N rows of a review file is what this replaces, and it
    was actively misleading: the file is grouped by record, so the first five
    rows were five internal candidates of ONE paper. A smoke test built that
    way exercises one corner of the behaviour and reads like a verdict on all
    of it.

    So the pairs are drawn across strata -- (source x gate decision x score
    band) -- in a fixed order, preferring a record that is not in the sample
    yet at every step. That buys record diversity, both sources, both
    verdicts, and a spread of scores in one pass, with no randomness: the
    same input always yields the same ten.

    Returns (selected, report). Each selected entry carries `why`, naming the
    stratum it filled and whether it brought a new record.
    """
    entries = list(entries or [])
    if not entries:
        return [], {"selected": 0, "available": 0, "strata": {}}

    # Bands are per source; decisions and sources come from the data rather
    # than being assumed, so a review file with only one source still works.
    cuts = {}
    for source in {e["candidate"].get("source") for e in entries}:
        cuts[source] = _score_cuts(
            [float(e["candidate"].get("gate_score") or 0.0)
             for e in entries if e["candidate"].get("source") == source])

    cells = {}
    for entry in entries:
        candidate = entry["candidate"]
        source = candidate.get("source")
        low_cut, high_cut = cuts.get(source, (None, None))
        band = _band_of(float(candidate.get("gate_score") or 0.0),
                        low_cut, high_cut)
        decision = candidate.get("gate_decision") or "rejected"
        entry = dict(entry)
        entry["_band"] = band
        entry["_source"] = source
        entry["_decision"] = decision
        cells.setdefault((band, source, decision), []).append(entry)

    # Within a cell: pairs a model can actually read come first, then the
    # highest score, then the pair id -- deterministic to the last tie.
    for bucket in cells.values():
        bucket.sort(key=lambda e: (
            not _both_abstracts(e),
            -float(e["candidate"].get("gate_score") or 0.0),
            str(e["candidate"].get("pair_id") or ""),
            str(e["candidate"].get("title") or "")))

    sources = sorted({s for _, s, _ in cells})
    order = [(band, source, decision)
             for band in SCORE_BANDS
             for source in sources
             for decision in GATE_DECISIONS
             if (band, source, decision) in cells]

    selected, used_records, taken = [], set(), {key: 0 for key in order}
    while order and len(selected) < limit:
        progressed = False
        for key in list(order):
            if len(selected) >= limit:
                break
            bucket = cells[key]
            index = taken[key]
            # Prefer a pair from a record not sampled yet; fall back to the
            # next unused pair in the cell rather than skipping the stratum.
            pick = None
            for offset in range(index, len(bucket)):
                if bucket[offset]["record"]["record_id"] not in used_records:
                    pick = offset
                    break
            if pick is None and index < len(bucket):
                pick = index
            if pick is None:
                order.remove(key)
                continue
            entry = bucket.pop(pick)
            taken[key] = index
            band, source, decision = key
            entry["why"] = {
                "score_band": band,
                "source": source,
                "gate_decision": decision,
                "gate_score": float(entry["candidate"].get("gate_score")
                                    or 0.0),
                "new_record": entry["record"]["record_id"] not in used_records,
                "both_abstracts": _both_abstracts(entry),
            }
            used_records.add(entry["record"]["record_id"])
            selected.append(entry)
            progressed = True
        if not progressed:
            break

    report = {
        "selected": len(selected),
        "available": len(entries),
        "distinct_records": len({e["record"]["record_id"] for e in selected}),
        "by_source": _tally(selected, lambda e: e["why"]["source"]),
        "by_gate_decision": _tally(selected,
                                   lambda e: e["why"]["gate_decision"]),
        "by_score_band": _tally(selected, lambda e: e["why"]["score_band"]),
        "with_both_abstracts": sum(1 for e in selected
                                   if e["why"]["both_abstracts"]),
        "strata_available": {"%s/%s/%s" % key: len(value)
                             for key, value in sorted(cells.items())},
    }
    return selected, report


def _tally(entries, key):
    counts = {}
    for entry in entries:
        value = key(entry)
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items()))


# ------------------------------------------------------------------ metrics

def external_production_summary(record_rows, source,
                                page_size=DEFAULT_PAGE_SIZE,
                                max_pages=DEFAULT_MAX_PAGES):
    """Coverage and funnel for the pool production actually serves.

    Reported apart from the diagnostic pools because only this one describes
    the product. Everything here is a COUNT, and none of it is a quality
    claim: how many candidates arrived and how many were shown says nothing
    about whether the shown ones are related. That question needs ratings,
    and `external_display_metrics` is where it is answered.

    `scored_candidates` is always equal to `after_dedupe` here -- by
    construction, since nothing between de-duplication and the display cap is
    removed for failing the evidence gate. That equality is not simplified
    away: it is the funnel's own proof that this pool is re-ranked, not
    gated. (`gate_would_pass` reports, separately and only as a diagnostic,
    how many of the SHOWN candidates would also have passed the old
    gate-as-filter rule -- i.e. how much the policy change actually altered
    what a reader sees versus what a stricter rule would have shown.)
    """
    records = len(record_rows or [])
    resolved = with_candidates = with_shown = 0
    raw = valid = after_dedupe = scored = shown_total = 0
    shown_and_would_pass_gate = shown_total_for_gate_check = 0
    outcomes = {}
    shown_pages = {}
    for record in record_rows or []:
        pipeline = (record.get("external_pipeline") or {}).get(source) or {}
        raw += pipeline.get("raw_candidates", 0)
        valid += pipeline.get("valid_candidates", 0)
        after_dedupe += pipeline.get("after_dedupe", 0)
        scored += pipeline.get("scored_candidates", 0)
        shown = pipeline.get("shown", 0)
        shown_total += shown
        if pipeline.get("resolved"):
            resolved += 1
        if pipeline.get("raw_candidates"):
            with_candidates += 1
        if shown:
            with_shown += 1
        outcome = str((record.get("provider_outcomes") or {}).get(source)
                      or "not_attempted")
        outcomes[outcome] = outcomes.get(outcome, 0) + 1
        for candidate in ((record.get("external") or {}).get(source) or []):
            if candidate.get("visible"):
                page = str(candidate.get("display_page"))
                shown_pages[page] = shown_pages.get(page, 0) + 1
                shown_total_for_gate_check += 1
                if candidate.get("gate_decision") == "accepted":
                    shown_and_would_pass_gate += 1
    return {
        "source": source,
        "candidate_limit": None,   # filled in by the caller, which imports it
        "display_cap": page_size * max_pages,
        "page_size": page_size,
        "max_pages": max_pages,
        "records": records,
        "records_resolved_at_provider": resolved,
        "provider_resolution_ratio": _ratio(resolved, records),
        "records_with_candidates": with_candidates,
        "coverage": _ratio(with_candidates, records),
        "records_with_a_displayed_result": with_shown,
        "display_coverage": _ratio(with_shown, records),
        "raw_candidates": raw,
        "valid_candidates": valid,
        "after_dedupe": after_dedupe,
        "scored_candidates": scored,
        "shown": shown_total,
        "displayed_per_record": _ratio(shown_total, records),
        "shown_by_page": dict(sorted(shown_pages.items())),
        "provider_outcomes": dict(sorted(outcomes.items())),
        # Diagnostic only -- never used to decide what is shown.
        "gate_would_pass": {
            "shown_candidates": shown_total_for_gate_check,
            "would_have_passed_the_gate": shown_and_would_pass_gate,
            "ratio": _ratio(shown_and_would_pass_gate,
                            shown_total_for_gate_check),
            "note": "Of the candidates actually shown, how many would also "
                    "have cleared Qresp's strict evidence gate. Below 1.0 "
                    "means the re-ranking policy is showing readers papers "
                    "the old gate-as-filter rule would have hidden -- "
                    "expected, not a defect.",
        },
    }


def collection_summary(record_rows, skipped, sample_size, live,
                       api_key_present, production_source=None,
                       candidate_limit=None, page_size=DEFAULT_PAGE_SIZE,
                       max_pages=DEFAULT_MAX_PAGES):
    """What was collected, before anybody has rated anything."""
    pools, rejection_counts = {}, {}
    accepted_total = candidates_total = 0
    zero_candidate_records = 0
    for record in record_rows:
        candidates = list(record.get("internal") or [])
        for pool in (record.get("external") or {}).values():
            candidates.extend(pool)
        if not candidates:
            zero_candidate_records += 1
        for candidate in candidates:
            source = candidate["source"]
            bucket = pools.setdefault(
                source, {"candidates": 0, "accepted": 0, "records": 0,
                         "records_with_candidates": 0})
            bucket["candidates"] += 1
            candidates_total += 1
            if candidate["gate_decision"] == "accepted":
                bucket["accepted"] += 1
                accepted_total += 1
            else:
                code = candidate.get("rejection_code") or "unknown"
                rejection_counts[code] = rejection_counts.get(code, 0) + 1
        for source in {c["source"] for c in candidates}:
            pools[source]["records_with_candidates"] += 1

    for source in pools:
        pools[source]["records"] = len(record_rows)
        pools[source]["coverage"] = _ratio(
            pools[source]["records_with_candidates"], len(record_rows))
        pools[source]["gate_pass_rate"] = _ratio(
            pools[source]["accepted"], pools[source]["candidates"])
        pools[source]["shown"] = sum(
            1 for record in record_rows
            for candidate in (record.get("internal") or []) +
            [c for pool in (record.get("external") or {}).values()
             for c in pool]
            if candidate["source"] == source and candidate["in_top5"])

    # "Set aside" means two very different things and must not be one number:
    # a record HELD BACK because it looks broken is a finding about the
    # corpus, while a record simply not drawn into the sample is not.
    flagged = [e for e in skipped if e.get("flags")]
    # Abstract coverage decides whether a later judgement is reading the
    # papers or guessing from their titles, so it is reported up front rather
    # than discovered when the labelling produces nothing but low confidence.
    records_with_abstract = sum(
        1 for record in record_rows
        if (record.get("record_abstract") or "").strip())
    candidates_with_abstract = 0
    for record in record_rows:
        candidates = list(record.get("internal") or [])
        for pool in (record.get("external") or {}).values():
            candidates.extend(pool)
        candidates_with_abstract += sum(
            1 for c in candidates if (c.get("abstract") or "").strip())

    external_production = None
    if production_source:
        external_production = external_production_summary(
            record_rows, production_source, page_size, max_pages)
        external_production["candidate_limit"] = candidate_limit

    return {
        "sample_size": len(record_rows),
        "requested_sample_size": sample_size,
        "live": bool(live),
        "api_key_present": bool(api_key_present),
        # The production external pool, apart from the diagnostic ones. A
        # decision about the product rests on this block alone.
        "external_production": external_production,
        "abstract_coverage": {
            "records_with_abstract": records_with_abstract,
            "records_total": len(record_rows),
            "records_ratio": _ratio(records_with_abstract, len(record_rows)),
            "candidates_with_abstract": candidates_with_abstract,
            "candidates_total": candidates_total,
            "candidates_ratio": _ratio(candidates_with_abstract,
                                       candidates_total),
            "note": "Pairs where NEITHER side has an abstract are not sent "
                    "to a language model by default; see `ai-label "
                    "--allow-title-only`.",
        },
        "records_not_sampled": len(skipped) - len(flagged),
        "records_flagged": len(flagged),
        "flag_reasons": _flag_counts(flagged),
        "candidates_total": candidates_total,
        "accepted_total": accepted_total,
        "gate_pass_rate": _ratio(accepted_total, candidates_total),
        "records_with_zero_candidates": zero_candidate_records,
        "zero_candidate_ratio": _ratio(zero_candidate_records,
                                       len(record_rows)),
        "pools": pools,
        "rejection_reason_frequency": dict(
            sorted(rejection_counts.items(), key=lambda kv: (-kv[1], kv[0]))),
    }


def _flag_counts(skipped):
    counts = {}
    for entry in skipped:
        for flag in entry.get("flags") or []:
            counts[flag["code"]] = counts.get(flag["code"], 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))


def _ratio(part, whole):
    return round(part / float(whole), 4) if whole else 0.0


def bucket_from_ratings(ratings, available_total=None):
    """Strict and lenient precision over a set of ratings.

    `ratings` is a list of rating strings, one per CANDIDATE (not per review
    row). Blanks are dropped: an unrated candidate is never a denominator, so
    it cannot dilute a precision figure.

    When nothing is rated the precisions are **None, not 0.0**, and
    `available` is False. Those two are opposite findings -- "nobody has
    looked at this" and "everything looked at was unrelated" -- and a JSON
    consumer that cannot tell them apart will read an unmeasured feature as a
    0 % accurate one. This is the whole reason the field is nullable.
    """
    rated = [value for value in ratings or [] if value]
    related = rated.count("related")
    partial = rated.count("partial")
    unrelated = rated.count("unrelated")
    total = len(rated)
    available = total > 0
    if available_total is None:
        available_total = len(ratings or [])
    return {
        "available": available,
        "candidates": available_total,
        "rated": total,
        "unrated": available_total - total,
        "rating_coverage": (_ratio(total, available_total)
                            if available_total else None),
        "related": related,
        "partial": partial,
        "unrelated": unrelated,
        "precision_strict": _ratio(related, total) if available else None,
        "precision_lenient": (_ratio(related + partial, total)
                              if available else None),
    }


def rating_bucket(subset):
    """`bucket_from_ratings` for callers that hold review ROWS.

    Used by `score_ratings`, which measures the review file itself. The
    display metrics deliberately do not go through here: they measure
    candidates, and a candidate can be named by more than one row.
    """
    return bucket_from_ratings([row.get("human_rating")
                                for row in subset or []])


def collect_ratings(rows, index):
    """Review rows -> at most ONE rating per candidate.

    A candidate can legitimately appear in more than one sheet: every visible
    page-1 result is in both `human-review.tsv` and the blind
    `external-review.tsv`. Concatenating the sheets therefore counted such a
    candidate twice, which moved every precision figure according to how many
    files a reviewer happened to be handed. Ratings are collapsed here, by
    candidate identity, before anything is counted.

    The rules, and the last one is the point:

      * blank + rated      -> the rating; a blank is an absence, not a vote
      * the same rating twice -> counted once
      * two DIFFERENT ratings -> a CONFLICT, reported and never resolved

    Guessing which of two contradictory ratings a person meant would produce
    a number nobody can reproduce or defend, so the caller is expected to
    stop.

    Returns (ratings, report): `ratings` maps identity -> rating string
    ("" for a candidate named only by blank rows).
    """
    ratings, conflicts = {}, {}
    unmatched = duplicates = 0
    seen = set()
    for row in rows or []:
        facts = lookup_candidate(row, index)
        if facts is None:
            # Matches nothing, or matches several. Reported, never guessed.
            unmatched += 1
            continue
        identity = candidate_identity(facts)
        if identity in seen:
            duplicates += 1
        seen.add(identity)
        rating = (row.get("human_rating") or "").strip().lower()
        held = ratings.get(identity)
        if not rating:
            ratings.setdefault(identity, "")
        elif not held:
            ratings[identity] = rating
        elif held != rating:
            conflict = conflicts.setdefault(identity, {
                "record_id": facts.get("record_id"),
                "source": facts.get("source"),
                "candidate_title": facts.get("title"),
                "pair_id": facts.get("pair_id"),
                "ratings": set(),
            })
            conflict["ratings"].update((held, rating))
    for conflict in conflicts.values():
        conflict["ratings"] = sorted(conflict["ratings"])
    return ratings, {
        "rows": len(rows or []),
        "rows_unmatched": unmatched,
        "duplicate_rows_collapsed": duplicates,
        "candidates_named": len(ratings),
        "conflicts": sorted(conflicts.values(),
                            key=lambda c: (c["record_id"] or "",
                                           c["candidate_title"] or "")),
    }


def external_display_metrics(rows, records, source,
                             max_pages=DEFAULT_MAX_PAGES,
                             page_size=DEFAULT_PAGE_SIZE, index=None):
    """How related the EXTERNAL list a reader actually sees turns out to be.

    Separate from `score_ratings` on purpose. That function measures the
    review FILE -- both sources, accepted and rejected alike. This one answers
    the narrower product question: of the up-to-25 external papers Qresp
    renders for the production pool, how many would a domain expert call
    related, and does that change between page 1 and the deeper pages?

    Two things decide whether the answer is trustworthy, and both were wrong
    before:

    **The universe comes from `records`, not from `rows`.** The denominator is
    the unique visible candidates the raw results say production displayed. A
    review file is a work list -- it can name a candidate twice, or not at all
    -- and neither fact changes what the product showed. Counting rows made
    the "visible" total larger than the number of papers that exist.

    **Ratings are collapsed per candidate** (`collect_ratings`), so a
    duplicate row moves neither a numerator nor a denominator.

    Unrated candidates are excluded from every precision and reported as
    coverage; with none rated the precisions are None and `available` is
    False, never 0.0. A row that resolves to no single raw candidate is
    reported as unmatched rather than guessed at.
    """
    index = index if index is not None else candidate_index(records)
    ratings, join = collect_ratings(rows, index)

    universe = production_candidates(records, source)
    visible = [c for c in universe if c.get("visible")]
    # NOT shown, for whatever reason. Under the current re-ranking policy
    # this is NOT the same set as "gate_decision == rejected": nothing
    # between de-duplication and the display cap is removed for failing the
    # evidence gate, so a hidden candidate here is (overwhelmingly) one that
    # simply scored outside the top 25, and may carry either gate verdict.
    # The false-negative question below is "did the reader see it", so
    # visibility -- not the gate's opinion -- is what selects this
    # population.
    rejected = [c for c in universe if not c.get("visible")]

    def rating_of(facts):
        return ratings.get(candidate_identity(facts), "")

    def on(pages):
        return [rating_of(c) for c in visible
                if c.get("display_page") in pages]

    visible_ratings = [rating_of(c) for c in visible]
    rated_visible = [value for value in visible_ratings if value]

    per_page = {}
    for page in range(1, max_pages + 1):
        on_page = [c for c in visible if c.get("display_page") == page]
        if on_page:
            per_page[str(page)] = bucket_from_ratings(
                [rating_of(c) for c in on_page], len(on_page))

    # A false POSITIVE is a paper a reader was shown and an expert calls
    # unrelated. Measured over the VISIBLE candidates only: an accepted
    # candidate below the display cap is never seen, so calling it a product
    # error would be counting a decision nobody acted on.
    false_positives = {
        "available": bool(rated_visible),
        "count": (sum(1 for value in rated_visible if value == "unrelated")
                  if rated_visible else None),
        "rated": len(rated_visible),
        "visible_candidates": len(visible),
    }

    # A false NEGATIVE is a genuinely related paper the reader never saw, so
    # it can only be found among candidates that were NOT shown -- and only
    # among the ones somebody was actually asked about. `sampled_candidates`
    # is that denominator, and it is deliberately not
    # `rejected_candidates_in_pool`: this is a sample, never a corpus-wide
    # rate. (The field and variable names here predate the re-ranking
    # policy, from when "not shown" and "gate-rejected" were the same
    # population; they are kept for output stability, but the population
    # itself is now "not shown", full stop -- see `rejected` above.)
    sampled_rejected = [c for c in rejected
                        if candidate_identity(c) in ratings]
    rejected_ratings = [rating_of(c) for c in sampled_rejected]
    rated_rejected = [value for value in rejected_ratings if value]
    false_negatives = {
        "available": bool(rated_rejected),
        "count": (sum(1 for value in rated_rejected
                      if value in ("related", "partial"))
                  if rated_rejected else None),
        "strict_count": (sum(1 for value in rated_rejected
                             if value == "related")
                         if rated_rejected else None),
        "sampled_candidates": len(sampled_rejected),
        "rated": len(rated_rejected),
        "rating_coverage": (_ratio(len(rated_rejected), len(sampled_rejected))
                            if sampled_rejected else None),
        "rejected_candidates_in_pool": len(rejected),
        "note": "A SAMPLE of candidates NOT SHOWN to a reader (beyond the "
                "display cap; the field name predates the re-ranking policy "
                "and no longer means strictly \"gate-rejected\"), not a "
                "corpus-wide false-negative rate. Divide by "
                "`sampled_candidates`, never by `rejected_candidates_in_pool`"
                ", and treat `available: false` as unmeasured rather than as "
                "zero.",
    }

    records_with_visible = {c.get("record_id") for c in visible}
    records_accepted = {c.get("record_id") for c in visible
                        if rating_of(c) in ("related", "partial")}
    return {
        "source": source,
        "display_cap": page_size * max_pages,
        "page_size": page_size,
        "max_pages": max_pages,
        "review_rows": join["rows"],
        "rows_unmatched": join["rows_unmatched"],
        "duplicate_rows_collapsed": join["duplicate_rows_collapsed"],
        # Named for what they are: unique CANDIDATES from the raw results,
        # not rows in a spreadsheet.
        "visible_candidates": len(visible),
        "visible_candidates_rated": len(rated_visible),
        "visible_candidates_unrated": len(visible) - len(rated_visible),
        "rating_coverage": (_ratio(len(rated_visible), len(visible))
                            if visible else None),
        "all_visible": bucket_from_ratings(visible_ratings, len(visible)),
        "page_1": bucket_from_ratings(
            on({1}), sum(1 for c in visible if c.get("display_page") == 1)),
        "pages_2_to_5": bucket_from_ratings(
            on(set(range(2, max_pages + 1))),
            sum(1 for c in visible
                if (c.get("display_page") or 0) in range(2, max_pages + 1))),
        "per_page": per_page,
        "false_positives": false_positives,
        "false_negatives_sampled": false_negatives,
        "records_with_an_accepted_external_result": {
            "available": bool(rated_visible),
            "records": len(records_accepted) if rated_visible else None,
            "records_with_a_visible_result": len(records_with_visible),
            "ratio": (_ratio(len(records_accepted), len(records_with_visible))
                      if rated_visible and records_with_visible else None),
        },
    }


def score_ratings(rows, top5_keys=frozenset()):
    """Turn human ratings into the numbers that answer the question.

    `top5_keys` is the set of (record_id, source, candidate_title) that the
    production gate would actually show, so precision@5 measures what a
    visitor sees rather than everything that was collected.

    Unrated rows are excluded from every metric and counted separately: a
    half-finished review must not silently look like a verdict.
    """
    rated = [r for r in rows if r["human_rating"]]
    unrated = [r for r in rows if not r["human_rating"]]
    bucket = rating_bucket

    shown = [r for r in rated
             if (r["record_id"], r["source"], r["candidate_title"])
             in top5_keys]
    accepted = [r for r in rated if r["gate_decision"] == "accepted"]
    rejected = [r for r in rated if r["gate_decision"] == "rejected"]

    false_positives = [r for r in accepted if r["human_rating"] == "unrelated"]
    false_negatives = [r for r in rejected
                       if r["human_rating"] in ("related", "partial")]
    strict_false_negatives = [r for r in rejected
                              if r["human_rating"] == "related"]

    per_pool = {}
    for source in sorted({r["source"] for r in rated}):
        subset = [r for r in rated if r["source"] == source]
        per_pool[source] = bucket(subset)
        per_pool[source]["accepted"] = sum(
            1 for r in subset if r["gate_decision"] == "accepted")
        per_pool[source]["false_positives"] = sum(
            1 for r in subset if r["gate_decision"] == "accepted"
            and r["human_rating"] == "unrelated")
        per_pool[source]["false_negatives"] = sum(
            1 for r in subset if r["gate_decision"] == "rejected"
            and r["human_rating"] in ("related", "partial"))

    records = {r["record_id"] for r in rows}
    rated_records = {r["record_id"] for r in rated}

    return {
        "rows_total": len(rows),
        "rows_rated": len(rated),
        "rows_unrated": len(unrated),
        "rows_unrated_excluded_from_metrics": len(unrated),
        # None, not 0.0, when no shown row has been rated -- see
        # `bucket_from_ratings`. `precision_at_5_available` says which it is
        # without a consumer having to test for null.
        "precision_at_5_available": bucket(shown)["available"],
        "precision_at_5": bucket(shown)["precision_strict"],
        "precision_at_5_lenient": bucket(shown)["precision_lenient"],
        "shown_rows_rated": len(shown),
        "accepted": bucket(accepted),
        "rejected": bucket(rejected),
        "false_positives": len(false_positives),
        "false_negatives": len(false_negatives),
        "false_negatives_strict": len(strict_false_negatives),
        "record_coverage": {
            "records_in_review": len(records),
            "records_with_at_least_one_rating": len(rated_records),
            "ratio": _ratio(len(rated_records), len(records)),
        },
        "pools": per_pool,
    }


def dumps(payload):
    return json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False)
