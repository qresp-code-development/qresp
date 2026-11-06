"""Related Research domain-quality evaluation — a read-only QA command line.

    python -m project.tools.related_eval collect   --api-base URL ...
    python -m project.tools.related_eval summarize --output-dir DIR

WHY this exists
---------------
The quality gate was calibrated by reasoning, and the one thing nobody has
measured is whether it agrees with a physicist. Its own accept/reject decision
therefore cannot be the answer key.

For Related Qresp Records the gate still DECIDES what is shown, so this tool
lays its verdicts out next to the candidates it threw away and lets a person
judge it against those ratings -- including the failure that matters most, a
genuinely related record the gate rejected.

For Recommended External Papers the gate no longer decides anything: every
candidate Semantic Scholar proposes is scored and ranked, and the gate's own
verdict rides along only as a diagnostic (see `related.py`,
`relatedness.rerank_external`). The question this tool asks about that list is
therefore different -- not "did the gate get it right" but "are the papers a
reader is actually shown related" -- and it is answered the same way, by
comparing the system's output against a human's rating.

WHAT IT WILL NOT DO
-------------------
* It never writes to Qresp: no Paper, no Draft, no cache, no MongoDB. It
  speaks only to the public read APIs (`/api/search`, `/api/paper/{id}`).
* It never calls `/api/paper/{id}/related`, so the production cache and the
  provider quota behind it are untouched.
* It performs NO external network request unless `--live` is given.
* It never fills a human rating in. `human_rating` is written empty and only
  a person may change it; every metric excludes unrated rows and reports how
  many there were.
* It writes only into the output directory it is given, and never touches an
  earlier `related-eval-*` run, a human review sheet, the production cache,
  or MongoDB.
* It never emits curator identity, owner/editor fields, RCC URLs, file-server
  paths, file or image names, the API key, or any request header. The
  allowlist that guarantees this is `eval_core.to_canonical_record` and
  `eval_core.CANDIDATE_KEYS`.

Related External Papers, as displayed
-------------------------------------
Production asks the provider for `related.EXTERNAL_CANDIDATE_LIMIT` (150)
candidates, scores and ranks every deduplicated one, and shows the best
`related.EXTERNAL_MAX_RESULTS` (25) by that score -- five to a page over five
pages. NONE are removed for a low score or a failed evidence gate; only the
display cap shortens the list. This tool models that exactly: every candidate
carries `display_rank` (1-25), `display_page` (1-5), `visible`, AND
`gate_decision` as an independent diagnostic, so "the gate accepted it" is
never confused with "a reader sees it" -- under this policy a candidate can be
visible with `gate_decision == "rejected"`, and that is expected, not a bug in
the tool. `external-review.tsv` is the BLIND sheet -- every visible page-1
result, a deterministic stratified sample of pages 2-5, and a deterministic
stratified sample of candidates the reader was NOT shown (beyond the
25-result cap, whatever their gate verdict), with no gate score, verdict,
reason, rank or page number in it and the rows ordered by an opaque `pair_id`
so position leaks nothing either.

The hidden sample is what makes a false negative findable. Precision over the
visible list can only ever surface false POSITIVES; a false negative -- a
genuinely related paper the reader never saw -- can only be found among
candidates that did NOT make the cut, so a sheet built only from visible ones
would report zero false negatives forever, indistinguishable from a measured
zero. `summarize` reports the sampled denominator alongside the count, and
reports `available: false` rather than `0` when none of the sampled hidden
candidates has been rated.

Precision is measured over the UNIQUE VISIBLE CANDIDATES in
`raw-results.jsonl`, never over review rows: a candidate can appear in more
than one sheet, and how many sheets somebody was handed must not move a
number. Ratings are collapsed per candidate first, and two different ratings
for one candidate stop the run instead of one being picked.

The scoring is not reimplemented. Candidate fetching comes from
`project.related`, profiles and the gate from `project.relatedness`.
"""
import argparse
import io
import json
import os
import sys
import time

from project import related
from project import relatedness as R
from project.tools import ai_review
from project.tools import eval_core as core

# Candidate pools compared side by side. `default` is what production asks
# for and re-ranks (see relatedness.rerank_external); the other two are
# diagnostic-only alternative provider pools, evaluated the same way, that
# exist to answer "would a different pool have given the score more to work
# with, or is the provider simply not offering anything usable?".
POOL_DEFAULT = "recommendations_default"
POOL_ALL_CS = "recommendations_all_cs"
POOL_TITLE = "title_resolution"
EXTERNAL_POOLS = (POOL_DEFAULT, POOL_ALL_CS, POOL_TITLE)
SOURCE_INTERNAL = "internal"

# The blind sheet for Related External Papers: every visible page-1 result, a
# stratified sample of pages 2-5, and a stratified sample of the candidates
# NOT shown (beyond the display cap) -- the last of which is the only way a
# false negative can be found at all. A person's ratings live here, so it is
# a PROTECTED file that no automated pass may write.
EXTERNAL_REVIEW_FILE = "external-review.tsv"

DEFAULT_RATE_LIMIT = 1.0        # requests per second, provider-wide
DEFAULT_MAX_RETRIES = 3
MAX_RETRY_SLEEP = 60


# --------------------------------------------------------------- HTTP client

class PolitesClient(object):
    """A `requests`-shaped object with a rate limit and 429 handling.

    Installed over `project.related.requests` for the duration of a run, which
    is the same seam the unit tests use. Keeping the retry policy HERE rather
    than in `related._get` matters: serving traffic must fail fast and fall
    back to cache, while a QA sweep can afford to wait.
    """

    def __init__(self, session, rate_limit=DEFAULT_RATE_LIMIT,
                 max_retries=DEFAULT_MAX_RETRIES, sleep=time.sleep,
                 clock=time.monotonic):
        self._session = session
        self._min_interval = 1.0 / rate_limit if rate_limit > 0 else 0.0
        self._max_retries = max_retries
        self._sleep = sleep
        self._clock = clock
        self._last_call = None
        self.calls = 0
        self.retries = 0
        self.rate_limited = 0

    def _wait_turn(self):
        if self._min_interval <= 0 or self._last_call is None:
            return
        elapsed = self._clock() - self._last_call
        if elapsed < self._min_interval:
            self._sleep(self._min_interval - elapsed)

    @staticmethod
    def _retry_after(response):
        raw = ""
        headers = getattr(response, "headers", None) or {}
        try:
            raw = headers.get("Retry-After") or ""
        except AttributeError:
            raw = ""
        try:
            seconds = int(str(raw).strip())
        except (TypeError, ValueError):
            return None
        return max(0, min(seconds, MAX_RETRY_SLEEP))

    def get(self, url, params=None, headers=None, timeout=None):
        attempt = 0
        while True:
            self._wait_turn()
            self._last_call = self._clock()
            self.calls += 1
            response = self._session.get(url, params=params, headers=headers,
                                         timeout=timeout)
            if getattr(response, "status_code", None) != 429:
                return response
            self.rate_limited += 1
            if attempt >= self._max_retries:
                # Hand the 429 back and let the production code classify it as
                # the non-answer it is.
                return response
            wait = self._retry_after(response)
            if wait is None:
                wait = min(2 ** attempt, MAX_RETRY_SLEEP)
            attempt += 1
            self.retries += 1
            self._sleep(wait)


class OfflineClient(object):
    """Refuses every request. Installed when --live is absent so an external
    call cannot happen by accident."""

    def __init__(self):
        self.calls = 0
        self.retries = 0
        self.rate_limited = 0

    def get(self, *args, **kwargs):
        raise RuntimeError(
            "external request attempted without --live; this is a bug")


# ------------------------------------------------------------- Qresp reading

class QrespReader(object):
    """Public, read-only access to a Qresp instance."""

    def __init__(self, api_base, session, timeout=20, verify=True):
        self.api_base = api_base.rstrip("/")
        self._session = session
        self._timeout = timeout
        self._verify = verify

    def _get(self, path, params=None):
        url = "%s%s" % (self.api_base, path)
        response = self._session.get(url, params=params or {},
                                     timeout=self._timeout,
                                     verify=self._verify)
        if response.status_code != 200:
            raise RuntimeError("GET %s answered HTTP %s"
                               % (path, response.status_code))
        return response.json()

    def search(self):
        payload = self._get("/api/search")
        return payload if isinstance(payload, list) else []

    def details(self, record_id):
        try:
            payload = self._get("/api/paper/%s" % record_id)
        except Exception as e:
            print("  ! details unavailable for %s: %s"
                  % (record_id, type(e).__name__))
            return {}
        return payload if isinstance(payload, dict) else {}


# ----------------------------------------------------------------- collecting

def _provider_paper_id(candidate):
    """`_normalize_candidate` puts the provider's own id in `key` (falling
    back to the DOI or the title when it has none)."""
    return candidate.get("key") or None


def _internal_display_ranks(current, profiles, stats, limit):
    """profile key -> the 1-based slot production would render it in, for
    RELATED QRESP RECORDS.

    The production ranking itself, not a copy of it: `R.rank` gates, sorts and
    cuts exactly as `related.py` does, so a candidate is "visible" here if and
    only if a reader would see it. Internal only -- see
    `_external_display_ranks` for the differently-policied external pools.
    """
    ranked = R.rank(current, profiles, stats, frozenset(), limit)
    return {profile.key: index
            for index, (profile, _assessment) in enumerate(ranked, start=1)}


def _external_display_ranks(current, profiles, stats, limit):
    """profile key -> the 1-based slot production would render it in, for an
    EXTERNAL pool.

    Mirrors `related.external_recommendations`, not `_internal_display_ranks`:
    every candidate is scored and ordered by Qresp's score (provider rank as
    the tie-break), and NONE is dropped for failing the evidence gate -- only
    the `limit` cuts the list. A candidate absent from the returned mapping is
    absent because it scored outside the cap, never because the gate said no.
    """
    ranked = R.rerank_external(current, profiles, stats, frozenset(), limit)
    return {profile.key: index
            for index, (profile, _assessment) in enumerate(ranked, start=1)}


def _evaluate_candidates(current_record, candidates, stats, source,
                         record_id="", display_limit=None):
    """Score every candidate and mark which ones production would show.

    Every candidate is kept, accepted or not: the rejected ones are the
    evidence for the false-negative question. `display_limit` is the cap for
    THIS list -- `related.EXTERNAL_MAX_RESULTS` for an external pool -- so the
    recorded display rank and page describe the list a reader actually meets.
    """
    if display_limit is None:
        display_limit = related.EXTERNAL_MAX_RESULTS
    profiles = [(candidate, R.build_external_profile(candidate))
                for candidate in candidates]
    current = R.build_internal_profile(current_record)
    # EXTERNAL ranking -- score-ordered, never gated. See
    # `_external_display_ranks`; using `_internal_display_ranks` (the gated
    # one) here would silently reintroduce the policy this tool exists to
    # measure honestly.
    display = _external_display_ranks(current, [p for _, p in profiles],
                                      stats, display_limit)

    rows = []
    for rank_index, (candidate, profile) in enumerate(profiles):
        assessment = R.assess(current, profile, stats)
        display_rank = display.get(profile.key)
        rows.append(core.candidate_row(
            source, rank_index, profile, assessment,
            in_top5=bool(display_rank),
            provider_paper_id=_provider_paper_id(candidate),
            abstract=candidate.get("abstract"),
            record_id=record_id,
            display_rank=display_rank,
            provider_rank=candidate.get("provider_rank"),
            page_size=related.EXTERNAL_RESULTS_PER_PAGE))
    return rows


def _external_pools(current_record, normalized, stats, cfg, live,
                    record_id=""):
    """Collect each pool separately, preserving the raw (pre-gate) candidates.

    Returns (pools, outcomes, pipelines). `pipelines` mirrors the production
    `external.pipeline` counts per pool -- raw, after de-duplication, after
    the gate, and how many the display cap left -- so "the list is short" can
    be attributed to a stage instead of guessed at.
    """
    pools = {pool: [] for pool in EXTERNAL_POOLS}
    outcomes = {}
    pipelines = {pool: _empty_pipeline() for pool in EXTERNAL_POOLS}
    if not live:
        for pool in EXTERNAL_POOLS:
            outcomes[pool] = "skipped_no_live"
        return pools, outcomes, pipelines

    doi = R.normalize_doi(normalized.get("doi"))
    title = normalized.get("title") or ""

    resolutions = {}
    if doi:
        paper_id, outcome = related.resolve_provider_paper(title, doi, cfg)
        resolutions["doi"] = (paper_id, outcome)
    else:
        resolutions["doi"] = (None, "skipped_no_doi")
    # The title path is exercised on purpose even when a DOI exists: it is a
    # separate safety claim (a match must be close enough to trust) and it
    # deserves its own measurement.
    paper_id, outcome = related.resolve_provider_paper(title, None, cfg)
    resolutions["title"] = (paper_id, outcome)
    outcomes["resolution_doi"] = resolutions["doi"][1]
    outcomes["resolution_title"] = resolutions["title"][1]

    plan = (
        (POOL_DEFAULT, resolutions["doi"][0] or resolutions["title"][0], None),
        (POOL_ALL_CS, resolutions["doi"][0] or resolutions["title"][0],
         "all-cs"),
        (POOL_TITLE, resolutions["title"][0], None),
    )
    for pool, provider_id, pool_param in plan:
        if not provider_id:
            outcomes[pool] = "unresolved"
            continue
        candidates, outcome, raw_count = related.fetch_external_candidates(
            provider_id, cfg, pool=pool_param)
        outcomes[pool] = outcome
        pipelines[pool]["resolved"] = True
        if outcome != related.FOUND or not candidates:
            continue
        valid_count = len(candidates)
        candidates = related.dedupe_candidates(candidates, doi, title)
        rows = _evaluate_candidates(current_record, candidates, stats,
                                    pool, record_id=record_id,
                                    display_limit=related.EXTERNAL_MAX_RESULTS)
        pools[pool] = rows
        # `scored_candidates` is EVERY deduplicated candidate: under the
        # current policy nothing between de-duplication and the display cap
        # is removed, so it always equals `after_dedupe` -- which is the
        # point, not an oversight. `gate_decision` is still tallied
        # separately (not shown here) via `collection_summary`'s per-pool
        # `accepted`/`gate_pass_rate`, as a diagnostic independent of what
        # was actually displayed.
        pipelines[pool] = {
            "resolved": True,
            "raw_candidates": raw_count,
            "valid_candidates": valid_count,
            "after_dedupe": len(candidates),
            "scored_candidates": len(rows),
            "shown": sum(1 for row in rows if row["visible"]),
        }
    return pools, outcomes, pipelines


def _empty_pipeline():
    return {"resolved": False, "raw_candidates": 0, "valid_candidates": 0,
            "after_dedupe": 0, "scored_candidates": 0, "shown": 0}


def _internal_rows(entry, corpus_entries, stats):
    """Related Qresp Records for one record, with the rejected ones kept.

    Reuses the production ranking for the top five, then explains every other
    corpus record's verdict so a short list can be understood rather than
    merely observed.
    """
    current = R.build_internal_profile(entry["record"])
    others = [(other, R.build_internal_profile(other["record"]))
              for other in corpus_entries
              if other["normalized"]["id"] != entry["normalized"]["id"]]
    # The INTERNAL cap, which the external re-ranking did not touch, and no
    # pagination: Related Qresp Records is rendered whole, still gated.
    display = _internal_display_ranks(
        current, [profile for _, profile in others], stats,
        related.MAX_RESULTS)

    rows = []
    for rank_index, (other, profile) in enumerate(others):
        assessment = R.assess(current, profile, stats)
        display_rank = display.get(profile.key)
        row = core.candidate_row(
            SOURCE_INTERNAL, rank_index, profile, assessment,
            in_top5=bool(display_rank),
            abstract=(other["record"].get("reference")
                      or {}).get("publishedAbstract"),
            record_id=entry["normalized"]["id"],
            display_rank=display_rank,
            page_size=related.MAX_RESULTS)
        row["provider_paper_id"] = None
        rows.append(row)
    rows.sort(key=lambda r: (-r["gate_score"], r["title"]))
    return rows


def collect(args):
    import requests

    session = requests.Session()
    reader = QrespReader(args.api_base, session, timeout=args.timeout,
                         verify=not args.insecure)

    print("Reading records from %s" % reader.api_base)
    try:
        search_records = reader.search()
    except Exception as e:
        print("Could not read /api/search: %s" % type(e).__name__)
        return 2
    # The corpus count is VERIFIED, never assumed. A sweep is planned against
    # what the instance publishes today, not against a number written down
    # when the plan was made.
    print("  %d records visible at /api/search" % len(search_records))

    if args.ids_file:
        wanted = _read_ids(args.ids_file)
        search_records = [r for r in search_records
                          if core.normalize_search_record(r)["id"] in wanted]
        missing = wanted - {core.normalize_search_record(r)["id"]
                            for r in search_records}
        if missing:
            print("  ! %d requested id(s) are not publicly visible"
                  % len(missing))
        chosen, skipped = core.select_sample(
            search_records, None, include_flagged=True)
    else:
        chosen, skipped = core.select_sample(
            search_records, args.sample_size,
            include_flagged=args.include_flagged)

    if not chosen:
        print("No usable records were selected.")
        return 1
    print("  %d selected, %d set aside" % (len(chosen), len(skipped)))

    # Artifact metadata lives on the details endpoint, not the search
    # projection; without it tools/datasets/charts cannot contribute.
    for entry in chosen:
        details = reader.details(entry["normalized"]["id"])
        canonical, normalized = core.to_canonical_record(
            entry["normalized"], details)
        entry["record"] = canonical
        entry["normalized"] = normalized

    # Corpus rarity must be measured over EVERYTHING the instance publishes,
    # not just the sample, or "specific" would mean something different here
    # than it does in production.
    corpus_entries = []
    for raw in search_records:
        canonical, normalized = core.to_canonical_record(raw)
        if normalized["id"]:
            corpus_entries.append({"record": canonical,
                                   "normalized": normalized})
    by_id = {e["normalized"]["id"]: e for e in corpus_entries}
    for entry in chosen:
        by_id[entry["normalized"]["id"]] = entry
    corpus_entries = list(by_id.values())
    stats = R.CorpusStats([R.build_internal_profile(e["record"])
                           for e in corpus_entries])
    print("  corpus for rarity: %d records" % stats.document_count)

    cfg = related.config()
    api_key_present = bool(cfg["API_KEY"])
    print("  Semantic Scholar API key configured: %s" % api_key_present)
    print("  live external calls: %s" % bool(args.live))

    client = (PolitesClient(session, rate_limit=args.rate_limit,
                            max_retries=args.max_retries)
              if args.live else OfflineClient())
    _print_request_plan(chosen, args)

    record_rows = []
    original = related.requests
    related.requests = client
    try:
        for index, entry in enumerate(chosen, start=1):
            normalized = entry["normalized"]
            print("  [%d/%d] %s" % (index, len(chosen), normalized["id"]))
            internal = _internal_rows(entry, corpus_entries, stats)
            pools, outcomes, pipelines = _external_pools(
                entry["record"], normalized, stats, cfg, args.live,
                record_id=normalized["id"])
            record_rows.append({
                "external_pipeline": pipelines,
                "record_id": normalized["id"],
                "record_title": normalized["title"],
                "record_abstract": core.clip_abstract(normalized["abstract"]),
                "record_year": normalized["year"],
                "record_doi": normalized["doi"] or None,
                "status": entry["status"],
                "flags": entry["flags"],
                "internal": internal,
                "external": pools,
                "provider_outcomes": outcomes,
            })
    finally:
        related.requests = original

    _write_outputs(args, record_rows, skipped, api_key_present, client)
    return 0


def _print_request_plan(chosen, args):
    """What this run will cost the provider, printed BEFORE it spends it.

    An upper bound, not a guess: a record whose lookup fails skips the pools
    behind it, so the real total can only be lower. Printed for a dry run too,
    because the number that matters has to be knowable in advance.
    """
    with_doi = sum(1 for entry in chosen if entry["normalized"].get("doi"))
    # Per record: a DOI resolution when there is a DOI, a title resolution
    # always, then one recommendations call per pool that resolved.
    resolutions = with_doi + len(chosen)
    recommendations = len(chosen) * len(EXTERNAL_POOLS)
    total = resolutions + recommendations
    rate = args.rate_limit if args.rate_limit > 0 else 0
    print("\nPLANNED EXTERNAL REQUESTS (upper bound)")
    print("  records                      %d" % len(chosen))
    print("  ...with a DOI                %d" % with_doi)
    print("  resolution calls             %d" % resolutions)
    print("  recommendation calls         %d  (%d pools x %d records)"
          % (recommendations, len(EXTERNAL_POOLS), len(chosen)))
    print("  TOTAL                        %d" % total)
    print("  rate limit                   %.2f requests/second" % rate)
    if rate:
        print("  minimum wall time            %.1f minutes"
              % (total / rate / 60.0))
    print("  retries after HTTP 429       up to %d, honouring Retry-After"
          % args.max_retries)
    print("  candidates requested per call %d"
          % related.EXTERNAL_CANDIDATE_LIMIT)
    print("  external display cap          %d (%d per page x %d pages)"
          % (related.EXTERNAL_MAX_RESULTS, related.EXTERNAL_RESULTS_PER_PAGE,
             related.EXTERNAL_MAX_PAGES))
    if not args.live:
        print("  --live was NOT given: no request will be made.\n")
    else:
        print("")


def _read_ids(path):
    """Record ids, one per line. Blank lines and `#` comments are ignored,
    surrounding whitespace is trimmed, and duplicates collapse.

    Read as `utf-8-sig`, not `utf-8`: Windows PowerShell 5.1 writes a BOM for
    `Set-Content -Encoding utf8`, and read as plain UTF-8 that BOM survives as
    a leading \\ufeff on the FIRST id. The failure is silent -- the id simply
    matches no record, so the first paper drops out of the sample and
    everything else looks fine. `utf-8-sig` consumes a BOM when one is there
    and behaves exactly like `utf-8` when it is not.

    The comment test is applied to the STRIPPED line, so an indented comment
    is a comment rather than an id called "# ...".
    """
    ids = set()
    with io.open(path, encoding="utf-8-sig") as handle:
        for line in handle:
            value = line.strip()
            if not value or value.startswith("#"):
                continue
            ids.add(value)
    return ids


def _write_outputs(args, record_rows, skipped, api_key_present, client):
    output_dir = args.output_dir
    if not os.path.isdir(output_dir):
        os.makedirs(output_dir)

    raw_path = os.path.join(output_dir, "raw-results.jsonl")
    with io.open(raw_path, "w", encoding="utf-8", newline="\n") as handle:
        for record in record_rows:
            handle.write(json.dumps(
                {key: record[key] for key in core.RECORD_KEYS},
                ensure_ascii=False, sort_keys=True) + "\n")

    tsv_path = os.path.join(output_dir, "human-review.tsv")
    rows = core.tsv_rows(record_rows,
                         rejected_per_source=args.review_rejected)
    with io.open(tsv_path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(core.render_tsv(rows))

    # The BLIND sheet for the question this run exists to answer: of the
    # external papers a reader is actually shown, how many are related?
    external_path = os.path.join(output_dir, EXTERNAL_REVIEW_FILE)
    external_rows, external_report = core.external_review_rows(
        record_rows, POOL_DEFAULT,
        deep_sample=getattr(args, "external_review_sample",
                            core.DEFAULT_DEEP_SAMPLE),
        rejected_sample=getattr(args, "external_rejected_sample",
                                core.DEFAULT_REJECTED_SAMPLE))
    with io.open(external_path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(core.render_tsv(external_rows))

    summary = core.collection_summary(
        record_rows, skipped, args.sample_size, args.live, api_key_present,
        production_source=POOL_DEFAULT,
        candidate_limit=related.EXTERNAL_CANDIDATE_LIMIT,
        page_size=related.EXTERNAL_RESULTS_PER_PAGE,
        max_pages=related.EXTERNAL_MAX_PAGES)
    summary["provider_requests"] = {
        "calls": client.calls,
        "retries": client.retries,
        "rate_limited": client.rate_limited,
    }
    summary["external_review_export"] = external_report
    summary_path = os.path.join(output_dir, "summary.json")
    with io.open(summary_path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(core.dumps(summary) + "\n")

    print("\nWrote:")
    print("  %s   (%d records)" % (raw_path, len(record_rows)))
    print("  %s   (%d rows to rate)" % (tsv_path, len(rows) - 1))
    print("  %s   (%d rows: %d on page 1, %d sampled from pages 2-%d, "
          "%d sampled from the %d NOT shown -- beyond the display cap)"
          % (external_path, external_report["rows"],
             external_report["page_1_rows"],
             external_report["pages_2_to_5_rows"],
             related.EXTERNAL_MAX_PAGES,
             external_report["rejected_rows"],
             external_report["rejected_available"]))
    print("  %s" % summary_path)
    production = summary.get("external_production") or {}
    if production:
        print("\nProduction external pool (%s):" % POOL_DEFAULT)
        for key in ("records", "records_resolved_at_provider",
                    "records_with_candidates",
                    "records_with_a_displayed_result", "raw_candidates",
                    "valid_candidates", "after_dedupe", "scored_candidates",
                    "shown"):
            print("  %-32s %s" % (key, production.get(key)))
        print("  %-32s %s" % ("shown_by_page",
                              production.get("shown_by_page")))
    print("\nThese are COVERAGE numbers. They say nothing about whether the")
    print("displayed papers are related -- that needs human ratings.")
    print("\nNext: a domain expert fills human_rating "
          "(related | partial | unrelated) in")
    print("%s, then run:" % external_path)
    print("  python -m project.tools.related_eval summarize --output-dir %s"
          % output_dir)


# ------------------------------------------------------- AI provisional labels

# Files this command may write. `human-review.tsv` and
# `first-pass-human-review.tsv` are deliberately absent: a person's ratings
# live there, and an automated pass must never be able to touch them.
AI_OUTPUT_FILES = ("ai-review.tsv", "ai-review.jsonl", "ai-summary.json",
                   "expert-review.tsv")
PROTECTED_FILES = ("human-review.tsv", "first-pass-human-review.tsv",
                   EXTERNAL_REVIEW_FILE)
DEFAULT_AI_RATE_LIMIT = 0.5     # provider requests per second


def _protected_guard(output_dir):
    """Refuse to run if an output name would collide with a human file.
    Cheap, and it makes 'never overwrite the ratings' a property of the code
    rather than of the author's care."""
    for name in AI_OUTPUT_FILES:
        if name in PROTECTED_FILES:
            raise RuntimeError("output %r collides with a human file" % name)
    return [os.path.join(output_dir, name) for name in PROTECTED_FILES]


def _load_pairs(output_dir, sources=None):
    """Every (record, candidate) pair present in raw-results.jsonl.

    This is the METADATA STORE, not the work list. raw-results holds every
    candidate the gate ever scored -- on the current artifacts, 2,041 of them
    -- and judging all of those was never the intent. What gets judged is
    decided by the review file; this only supplies the abstracts and the
    bibliography for the pairs that file names.
    """
    path = os.path.join(output_dir, "raw-results.jsonl")
    pairs = []
    with io.open(path, encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            record = json.loads(line)
            candidates = list(record.get("internal") or [])
            for pool in (record.get("external") or {}).values():
                candidates.extend(pool)
            for candidate in candidates:
                if sources and candidate.get("source") not in sources:
                    continue
                pairs.append((record, candidate))
    return pairs


def _match_review_rows(review_rows, raw_pairs):
    """Resolve each review row to exactly ONE raw pair.

    `pair_id` is used when both sides carry it. Older review files have none,
    so those fall back to (record_id, source, candidate_title).

    A row that matches nothing is `unmatched`; a row that matches more than
    one raw candidate is `ambiguous`. Neither is silently resolved by taking
    the first hit -- judging the wrong candidate and filing the answer under
    the right one's name would corrupt the review with no visible symptom.

    Returns (matched, unmatched, ambiguous).
    """
    by_pair_id, by_triple = {}, {}
    for record, candidate in raw_pairs:
        pair_id = (candidate.get("pair_id") or "").strip()
        if pair_id:
            by_pair_id.setdefault(pair_id, []).append((record, candidate))
        triple = (record.get("record_id"), candidate.get("source"),
                  core._tsv_cell(candidate.get("title")).lower())
        by_triple.setdefault(triple, []).append((record, candidate))

    matched, unmatched, ambiguous = [], [], []
    for row in review_rows:
        pair_id = (row.get("pair_id") or "").strip()
        hits = by_pair_id.get(pair_id) if pair_id else None
        how = "pair_id"
        if not hits:
            how = "record_id+source+candidate_title"
            hits = by_triple.get(
                (row.get("record_id"), row.get("source"),
                 core._tsv_cell(row.get("candidate_title")).lower())) or []
        if not hits:
            unmatched.append(row)
        elif len(hits) > 1:
            ambiguous.append((row, len(hits)))
        else:
            record, candidate = hits[0]
            matched.append((record, candidate, how))
    return matched, unmatched, ambiguous


def _abstract_split(matched):
    """How many judgeable pairs actually have something to read."""
    both = one = none = 0
    for record, candidate, _ in matched:
        left = bool((record.get("record_abstract") or "").strip())
        right = bool((candidate.get("abstract") or "").strip())
        if left and right:
            both += 1
        elif left or right:
            one += 1
        else:
            none += 1
    return both, one, none


def _preflight(raw_pairs, review_rows, matched, unmatched, ambiguous, cache,
               allow_title_only, retry_errors):
    """Everything a person needs to decide whether to let this run.

    Printed identically for a real run and a --dry-run, because the number
    that matters -- how many provider calls this will make -- must be
    knowable BEFORE any of them happen.
    """
    both, one, none = _abstract_split(matched)
    cached = planned = 0
    for record, candidate, _ in matched:
        key = ai_review.pair_key(record["record_id"], candidate["source"],
                                 candidate["title"])
        hit = cache.get(key)
        if hit and (hit.get("ai_status") == ai_review.STATUS_COMPLETED
                    or not retry_errors):
            cached += 1
            continue
        if not ai_review.has_enough_metadata(record, candidate):
            continue
        if not _has_any_abstract(record, candidate) and not allow_title_only:
            continue
        planned += 1

    report = {
        "raw_pairs": len(raw_pairs),
        "review_rows": len(review_rows),
        "matched_pairs": len(matched),
        "unmatched_pairs": len(unmatched),
        "ambiguous_pairs": len(ambiguous),
        "pairs_with_both_abstracts": both,
        "pairs_with_one_abstract": one,
        "pairs_with_no_abstract": none,
        "cached_pairs": cached,
        "planned_provider_calls": planned,
    }
    print("\nPREFLIGHT")
    for key in ("raw_pairs", "review_rows", "matched_pairs",
                "unmatched_pairs", "ambiguous_pairs",
                "pairs_with_both_abstracts", "pairs_with_one_abstract",
                "pairs_with_no_abstract", "cached_pairs",
                "planned_provider_calls"):
        print("  %-28s %d" % (key, report[key]))
    return report


def _has_any_abstract(record, candidate):
    return bool((record.get("record_abstract") or "").strip()
                or (candidate.get("abstract") or "").strip())


def _load_cache(path):
    """Completed judgements from an earlier run, keyed by pair."""
    cache = {}
    if not os.path.isfile(path):
        return cache
    with io.open(path, encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except Exception:
                continue
            if row.get("pair_key"):
                cache[row["pair_key"]] = row
    return cache


def ai_label(args):
    from datetime import datetime

    from project import assist

    output_dir = args.output_dir
    protected = _protected_guard(output_dir)
    before = {path: os.path.getmtime(path) for path in protected
              if os.path.isfile(path)}

    raw_path = os.path.join(output_dir, "raw-results.jsonl")
    if not os.path.isfile(raw_path):
        print("No raw-results.jsonl in %s - run `collect` first."
              % output_dir)
        return 2

    sources = ([s.strip() for s in args.sources.split(",") if s.strip()]
               if args.sources else None)
    raw_pairs = _load_pairs(output_dir, sources)

    # The REVIEW FILE is the work list. raw-results is only where the
    # abstracts and bibliography are looked up.
    review_path = args.review_file or os.path.join(output_dir,
                                                   "human-review.tsv")
    if not os.path.isfile(review_path):
        print("No review file at %s." % review_path)
        print("ai-label judges the pairs a review file names, not every "
              "candidate in raw-results.jsonl. Pass --review-file.")
        return 2
    with io.open(review_path, encoding="utf-8") as handle:
        review_rows, review_errors = core.parse_tsv(handle.read())
    if review_errors:
        print("The review file could not be read:")
        for error in review_errors:
            print("  - %s" % error)
        return 2

    # `--sources` narrows BOTH sides or neither. Filtering only the raw store
    # would turn every out-of-scope review row into a phantom "unmatched" and
    # abort a perfectly legitimate run.
    review_rows_total = len(review_rows)
    if sources:
        review_rows = [row for row in review_rows
                       if row.get("source") in sources]

    matched, unmatched, ambiguous = _match_review_rows(review_rows, raw_pairs)

    jsonl_path = os.path.join(output_dir, "ai-review.jsonl")
    cache = _load_cache(jsonl_path)

    cfg = assist._gemini_config()
    ready = bool(cfg["ENABLED"] and cfg["API_KEY"])
    print("AI-BASED PROVISIONAL EVALUATION - not expert ground truth.")
    print("  review file:  %s (%d rows, %d in scope for sources %s)"
          % (review_path, review_rows_total, len(review_rows),
             ",".join(sources) if sources else "all"))
    print("  metadata from: %s" % raw_path)
    print("  provider configured: %s" % ready)
    print("  title-only pairs allowed: %s" % bool(args.allow_title_only))
    _preflight(raw_pairs, review_rows, matched, unmatched, ambiguous, cache,
               args.allow_title_only, args.retry_errors)

    # Refuse BEFORE spending anything. An unresolved row means the review file
    # and the raw results disagree about what exists, and judging under that
    # disagreement files answers against the wrong candidates.
    if unmatched or ambiguous:
        print("\nSTOPPING: the review file does not line up with "
              "raw-results.jsonl.")
        for row in unmatched[:10]:
            print("  unmatched: %s | %s | %s"
                  % (row.get("record_id"), row.get("source"),
                     (row.get("candidate_title") or "")[:60]))
        for row, count in ambiguous[:10]:
            print("  ambiguous (%d candidates): %s | %s | %s"
                  % (count, row.get("record_id"), row.get("source"),
                     (row.get("candidate_title") or "")[:60]))
        print("  Re-run `collect` into a fresh directory so the review file "
              "and the raw results come from the same run.")
        return 4

    if not matched:
        print("No candidate pairs to judge.")
        return 1

    # --limit applies to the WHITELIST, never to the raw candidate list.
    pairs = [(record, candidate) for record, candidate, _ in matched]
    if args.limit:
        pairs = pairs[:args.limit]

    if not ready and not args.dry_run:
        print("\n  QRESP_GEMINI_ENABLED / QRESP_GEMINI_API_KEY are not set, "
              "so no judgement can be made.")
        print("  Re-run with --dry-run to see what WOULD be sent, without "
              "contacting any provider.")
        return 3

    interval = 1.0 / args.rate_limit if args.rate_limit > 0 else 0.0
    rows, calls, cached_used = [], 0, 0
    last_call = None

    # Append as we go and flush every line: an interrupted run keeps every
    # judgement it already paid for.
    handle = io.open(jsonl_path, "a", encoding="utf-8", newline="\n")
    try:
        for index, (record, candidate) in enumerate(pairs, start=1):
            key = ai_review.pair_key(record["record_id"], candidate["source"],
                                     candidate["title"])
            hit = cache.get(key)
            if hit and (hit.get("ai_status") == ai_review.STATUS_COMPLETED
                        or not args.retry_errors):
                rows.append(hit)
                cached_used += 1
                continue

            has_abstracts = ai_review.abstracts_present(record, candidate)
            skip_reason = None
            if not ai_review.has_enough_metadata(record, candidate):
                skip_reason = "no title on one or both papers"
            elif (not _has_any_abstract(record, candidate)
                  and not args.allow_title_only):
                # NEITHER side has an abstract. Two titles are not enough to
                # judge relatedness on, and an answer produced from them would
                # still arrive looking like every other answer in the file.
                # Opt in with --allow-title-only if that is genuinely wanted.
                skip_reason = ("neither paper has an abstract; title-only "
                               "judgement is off by default "
                               "(--allow-title-only)")
            if skip_reason:
                row = ai_review.build_jsonl_row(
                    record, candidate, None, ai_review.STATUS_INSUFFICIENT,
                    error=skip_reason, abstracts_available=has_abstracts)
                rows.append(row)
                handle.write(json.dumps(row, ensure_ascii=False,
                                        sort_keys=True) + "\n")
                handle.flush()
                continue

            payload = ai_review.blind_pair_payload(record, candidate)
            # Belt and braces: the payload builder is an allowlist, and this
            # asserts the result before anything leaves the process.
            if not ai_review.payload_is_blind(payload):
                raise RuntimeError("payload leaked a gate decision")

            if args.dry_run:
                row = ai_review.build_jsonl_row(
                    record, candidate, None, ai_review.STATUS_PROVIDER_ERROR,
                    error="dry run: no provider call made",
                    abstracts_available=has_abstracts)
                rows.append(row)
                continue

            if interval and last_call is not None:
                elapsed = time.monotonic() - last_call
                if elapsed < interval:
                    time.sleep(interval - elapsed)
            last_call = time.monotonic()

            calls += 1
            result = error = None
            try:
                answer, provider_error = assist.call_gemini(
                    cfg, payload, ai_review.SYSTEM_PROMPT,
                    ai_review.RESPONSE_SCHEMA,
                    max_output_tokens=args.max_output_tokens)
                if provider_error:
                    error = provider_error
                else:
                    result, error = ai_review.parse_ai_answer(
                        answer, abstracts_available=has_abstracts)
            except Exception as e:
                # One bad pair must not end a sweep that has already paid for
                # everything before it.
                error = "provider call raised %s" % type(e).__name__

            status = (ai_review.STATUS_COMPLETED if result
                      else ai_review.STATUS_PROVIDER_ERROR)
            row = ai_review.build_jsonl_row(
                record, candidate, result, status, error=error or "",
                model=cfg["MODEL"],
                evaluated_at=datetime.utcnow().isoformat() + "Z",
                abstracts_available=has_abstracts)
            rows.append(row)
            handle.write(json.dumps(row, ensure_ascii=False,
                                    sort_keys=True) + "\n")
            handle.flush()
            if index % 20 == 0:
                print("  judged %d/%d (%d provider calls)"
                      % (index, len(pairs), calls))
    finally:
        handle.close()

    _write_ai_outputs(output_dir, rows, cfg["MODEL"], len(pairs), cached_used,
                      calls, args.expert_limit)

    for path in protected:
        if path in before and os.path.getmtime(path) != before[path]:
            raise RuntimeError("a human review file was modified: %s" % path)
    return 0


def _write_ai_outputs(output_dir, rows, model, requested, cached, calls,
                      expert_limit):
    tsv_rows = [ai_review.AI_REVIEW_COLUMNS]
    for row in rows:
        tsv_rows.append((
            core._tsv_cell(row["record_id"]),
            core._tsv_cell(row["record_title"]),
            core._tsv_cell(row["source"]),
            core._tsv_cell(row["candidate_title"]),
            core._tsv_cell(row["ai_rating"]),
            core._tsv_cell(row["ai_confidence"]),
            core._tsv_cell(row["ai_reason"]),
            core._tsv_cell(row["ai_status"]),
            core._tsv_cell(row["gate_decision"]),
            core._tsv_cell("yes" if row["in_top5"] else "no"),
        ))
    with io.open(os.path.join(output_dir, "ai-review.tsv"), "w",
                 encoding="utf-8", newline="\n") as handle:
        handle.write(core.render_tsv(tsv_rows))

    shortlist, counts = ai_review.select_for_expert(rows, expert_limit)
    expert_rows = [ai_review.EXPERT_REVIEW_COLUMNS]
    for category, row in shortlist:
        expert_rows.append((
            core._tsv_cell(category),
            core._tsv_cell(row["record_id"]),
            core._tsv_cell(row["record_title"]),
            core._tsv_cell(row["source"]),
            core._tsv_cell(row["candidate_title"]),
            core._tsv_cell(row["ai_rating"]),
            core._tsv_cell(row["ai_confidence"]),
            core._tsv_cell(row["ai_reason"]),
            core._tsv_cell(row["gate_decision"]),
            "",   # human_rating -- the expert's column, always blank here
            "",   # human_note
        ))
    with io.open(os.path.join(output_dir, "expert-review.tsv"), "w",
                 encoding="utf-8", newline="\n") as handle:
        handle.write(core.render_tsv(expert_rows))

    summary = ai_review.ai_summary(rows, model, counts, requested, cached,
                                   calls)
    with io.open(os.path.join(output_dir, "ai-summary.json"), "w",
                 encoding="utf-8", newline="\n") as handle:
        handle.write(ai_review.dumps(summary) + "\n")

    print("\nAI-BASED PROVISIONAL EVALUATION - not expert ground truth.")
    print("  completed %d, insufficient metadata %d, provider errors %d"
          % (summary["status_counts"][ai_review.STATUS_COMPLETED],
             summary["status_counts"][ai_review.STATUS_INSUFFICIENT],
             summary["status_counts"][ai_review.STATUS_PROVIDER_ERROR]))
    print("  ratings: %s" % summary["rating_counts"])
    print("  gate agreement: %s of %s"
          % (summary["gate_agreement"]["agree"],
             summary["gate_agreement"]["agree"]
             + summary["gate_agreement"]["disagree"]))
    print("  expert shortlist: %d rows" % (len(expert_rows) - 1))
    for name in ai_review.REVIEW_CATEGORIES:
        print("    %-34s available %d" % (name, counts.get(name, 0)))
    print("\nWrote ai-review.tsv, ai-review.jsonl, ai-summary.json, "
          "expert-review.tsv in %s" % output_dir)
    print("Human review files were not touched.")


# ------------------------------------------------------ stratified smoke set

SMOKE_REVIEW_FILE = "ai-smoke-review.tsv"


def smoke_sample(args):
    """Write a small, deliberately spread-out review file for a first real
    run. Reads two files and writes one; contacts nothing."""
    output_dir = args.output_dir
    _protected_guard(output_dir)

    raw_path = os.path.join(output_dir, "raw-results.jsonl")
    if not os.path.isfile(raw_path):
        print("No raw-results.jsonl in %s - run `collect` first."
              % output_dir)
        return 2

    review_path = args.review_file or os.path.join(output_dir,
                                                   "human-review.tsv")
    if not os.path.isfile(review_path):
        print("No review file at %s." % review_path)
        return 2
    with io.open(review_path, encoding="utf-8") as handle:
        review_rows, errors = core.parse_tsv(handle.read())
    if errors:
        print("The review file could not be read:")
        for error in errors:
            print("  - %s" % error)
        return 2

    sources = ([s.strip() for s in args.sources.split(",") if s.strip()]
               if args.sources else None)
    raw_pairs = _load_pairs(output_dir, sources)
    if sources:
        review_rows = [row for row in review_rows
                       if row.get("source") in sources]

    matched, unmatched, ambiguous = _match_review_rows(review_rows, raw_pairs)
    if unmatched or ambiguous:
        print("STOPPING: the review file does not line up with "
              "raw-results.jsonl (%d unmatched, %d ambiguous)."
              % (len(unmatched), len(ambiguous)))
        return 4
    if not matched:
        print("No candidate pairs to sample from.")
        return 1

    # Keep the ORIGINAL review row: the sample is then a strict subset of the
    # review file, and `ai-label` matches it exactly as it would the parent.
    by_key = {}
    for row in review_rows:
        by_key[(row.get("pair_id") or "", row.get("record_id"),
                row.get("source"),
                core._tsv_cell(row.get("candidate_title")).lower())] = row
    entries = []
    for record, candidate, _how in matched:
        key = ((candidate.get("pair_id") or ""), record.get("record_id"),
               candidate.get("source"),
               core._tsv_cell(candidate.get("title")).lower())
        row = by_key.get(key)
        if row is None:
            row = by_key.get(("", record.get("record_id"),
                              candidate.get("source"),
                              core._tsv_cell(candidate.get("title")).lower()))
        entries.append({"row": row, "record": record, "candidate": candidate})

    selected, report = core.select_smoke_sample(entries, args.limit)

    rows = [core.TSV_COLUMNS]
    for entry in selected:
        row, candidate, record = entry["row"], entry["candidate"], entry["record"]
        rows.append((
            core._tsv_cell(candidate.get("pair_id")
                           or (row or {}).get("pair_id")),
            core._tsv_cell(record["record_id"]),
            core._tsv_cell(record.get("record_title")),
            core._tsv_cell(candidate["source"]),
            core._tsv_cell(candidate["title"]),
            core._tsv_cell(" | ".join(candidate.get("reasons") or [])),
            core._tsv_cell(candidate.get("gate_score")),
            core._tsv_cell(candidate.get("gate_decision")),
            "",   # human_rating -- a person's column, blank here as always
            "",   # human_note
        ))
    sample_path = os.path.join(output_dir, SMOKE_REVIEW_FILE)
    with io.open(sample_path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(core.render_tsv(rows))

    print("STRATIFIED SMOKE SAMPLE - no provider was contacted.")
    print("  drawn from: %s (%d matched pairs)" % (review_path, len(matched)))
    print("  selected:   %d across %d distinct records"
          % (report["selected"], report["distinct_records"]))
    print("  by source:         %s" % report["by_source"])
    print("  by gate decision:  %s" % report["by_gate_decision"])
    print("  by score band:     %s" % report["by_score_band"])
    print("  with both abstracts: %d of %d"
          % (report["with_both_abstracts"], report["selected"]))
    print("\n  %-3s %-26s %-24s %-9s %-8s %-6s %-9s %s"
          % ("#", "record_id", "source", "decision", "band", "score",
             "abstracts", "record"))
    for index, entry in enumerate(selected, start=1):
        why = entry["why"]
        print("  %-3d %-26s %-24s %-9s %-8s %-6.2f %-9s %s"
              % (index, entry["record"]["record_id"], why["source"],
                 why["gate_decision"], why["score_band"], why["gate_score"],
                 "both" if why["both_abstracts"] else "partial/none",
                 "new" if why["new_record"] else "repeat"))
    print("\nWrote %s" % sample_path)
    print("Next: python -m project.tools.related_eval ai-label "
          "--output-dir %s --review-file %s --dry-run"
          % (output_dir, sample_path))
    return 0


# ---------------------------------------------------------------- summarizing

def _load_records(raw_path):
    records = []
    if not os.path.isfile(raw_path):
        return records
    with io.open(raw_path, encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                records.append(json.loads(line))
    return records


def _read_review_files(output_dir):
    """Every review sheet present, read into one list of rows.

    Two sheets can exist side by side: the original `human-review.tsv`, which
    shows the gate's own verdict, and the blind `external-review.tsv`, which
    deliberately does not. Both are a person's ratings and both count.
    Returns (rows, errors, files_read).
    """
    rows, errors, read = [], [], []
    for name in ("human-review.tsv", EXTERNAL_REVIEW_FILE):
        path = os.path.join(output_dir, name)
        if not os.path.isfile(path):
            continue
        with io.open(path, encoding="utf-8") as handle:
            parsed, problems = core.parse_tsv(handle.read())
        if problems:
            errors.extend("%s: %s" % (name, problem) for problem in problems)
            continue
        rows.extend(parsed)
        read.append(name)
    return rows, errors, read


def summarize(args):
    output_dir = args.output_dir
    raw_path = os.path.join(output_dir, "raw-results.jsonl")

    rows, errors, files_read = _read_review_files(output_dir)
    if errors:
        print("A review file could not be read:")
        for error in errors:
            print("  - %s" % error)
        return 2
    if not files_read:
        print("No review file in %s (expected human-review.tsv and/or %s)"
              % (output_dir, EXTERNAL_REVIEW_FILE))
        return 2
    print("Read %s" % ", ".join(files_read))

    records = _load_records(raw_path)
    index = core.candidate_index(records)

    # STOP before scoring if two sheets disagree about the same candidate.
    # Picking one of two contradictory ratings would produce a number nobody
    # can reproduce, and nothing downstream would ever show that it happened.
    _ratings, join = core.collect_ratings(rows, index)
    if join["conflicts"]:
        print("STOPPING: the review files give the same candidate more than "
              "one rating.")
        for conflict in join["conflicts"][:20]:
            print("  %s | %s | %s -> %s"
                  % (conflict["record_id"], conflict["source"],
                     (conflict["candidate_title"] or "")[:60],
                     ", ".join(conflict["ratings"])))
        if len(join["conflicts"]) > 20:
            print("  ...and %d more" % (len(join["conflicts"]) - 20))
        print("  Decide which rating is right and correct the sheets; this "
              "tool will not choose for you.")
        return 3
    if join["duplicate_rows_collapsed"]:
        print("  %d duplicate review row(s) collapsed to one rating each "
              "(the same candidate is in more than one sheet)"
              % join["duplicate_rows_collapsed"])

    top5_keys = set()
    for record in records:
        candidates = list(record.get("internal") or [])
        for pool in (record.get("external") or {}).values():
            candidates.extend(pool)
        for candidate in candidates:
            if candidate.get("visible", candidate.get("in_top5")):
                top5_keys.add((record["record_id"], candidate["source"],
                               candidate["title"]))

    # The blind sheet carries no verdict of its own, by design. Fill it in
    # from the raw results so a blind rating is scored exactly like any other
    # -- and leave a row that resolves to no single candidate alone, so it
    # falls out of the gate-error counts instead of being guessed at.
    for row in rows:
        if row.get("gate_decision"):
            continue
        facts = core.lookup_candidate(row, index)
        if facts:
            row["gate_decision"] = facts.get("gate_decision") or ""

    metrics = core.score_ratings(rows, top5_keys)
    # `score_ratings` above measures the review FILE, so its row counts are
    # row counts. This says how many of those rows were the same candidate
    # twice, so the two families of number cannot be confused.
    metrics["review_join"] = {
        "rows": join["rows"],
        "rows_unmatched": join["rows_unmatched"],
        "duplicate_rows_collapsed": join["duplicate_rows_collapsed"],
        "candidates_named": join["candidates_named"],
    }
    # The raw results, not the review rows, are the universe this is measured
    # over -- see `external_display_metrics`.
    metrics["external_display"] = core.external_display_metrics(
        rows, records, POOL_DEFAULT,
        max_pages=related.EXTERNAL_MAX_PAGES,
        page_size=related.EXTERNAL_RESULTS_PER_PAGE, index=index)
    metrics_path = os.path.join(output_dir, "metrics.json")
    with io.open(metrics_path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(core.dumps(metrics) + "\n")

    print("Rated %d of %d rows (%d still unrated, excluded from every metric)"
          % (metrics["rows_rated"], metrics["rows_total"],
             metrics["rows_unrated"]))
    external = metrics["external_display"]
    _print_external_display(external)
    if not metrics["rows_rated"]:
        print("\nNothing to measure yet: no row has been rated, so there is "
              "no accuracy figure to report.")
        print("Wrote %s" % metrics_path)
        return 0
    print("\nWHOLE REVIEW FILE (both sources, accepted and rejected)")
    print("precision@shown        %s  (related only)"
          % _fmt(metrics["precision_at_5"]))
    print("precision@shown lenient %s  (related + partial)"
          % _fmt(metrics["precision_at_5_lenient"]))
    print("false positives        %d  (gate accepted, human said unrelated)"
          % metrics["false_positives"])
    print("false negatives        %d  (gate rejected, human said related or "
          "partial)" % metrics["false_negatives"])
    print("record coverage        %.3f"
          % metrics["record_coverage"]["ratio"])
    for pool in sorted(metrics["pools"]):
        stats = metrics["pools"][pool]
        print("  %-26s rated=%d strict=%s lenient=%s fp=%d fn=%d"
              % (pool, stats["rated"], _fmt(stats["precision_strict"]),
                 _fmt(stats["precision_lenient"]), stats["false_positives"],
                 stats["false_negatives"]))
    print("\nWrote %s" % metrics_path)
    return 0


def _fmt(value):
    """A number, or `n/a` for one that was never measured.

    Printing 0.000 for "nobody has rated this" is the console half of the bug
    the nullable JSON fields fix: the two readings are opposite findings and
    must not look the same.
    """
    return "n/a  " if value is None else "%.3f" % value


def _print_external_display(external):
    """The external list a reader actually sees, page by page."""
    print("\nRELATED EXTERNAL PAPERS AS DISPLAYED (%s, cap %d = %d x %d)"
          % (external["source"], external["display_cap"],
             external["page_size"], external["max_pages"]))
    # Unique candidates from raw-results.jsonl -- NOT rows in a review file,
    # which can name the same candidate in two sheets.
    print("  visible candidates       %d  (unique, from raw results)"
          % external["visible_candidates"])
    print("  ...rated                 %d  (coverage %s)"
          % (external["visible_candidates_rated"],
             _fmt(external["rating_coverage"])))
    print("  ...unrated               %d  (excluded from every precision)"
          % external["visible_candidates_unrated"])
    print("  review rows read         %d" % external["review_rows"])
    if external["duplicate_rows_collapsed"]:
        print("  ...duplicates collapsed  %d  (same candidate in two sheets)"
              % external["duplicate_rows_collapsed"])
    if external["rows_unmatched"]:
        print("  ! %d review row(s) matched no single raw candidate and were "
              "not scored" % external["rows_unmatched"])
    if not external["visible_candidates_rated"]:
        print("  No visible external result has been rated yet, so there is "
              "NO precision figure (the JSON reports null, not 0).")
    else:
        for label, key in (("all visible", "all_visible"),
                           ("page 1", "page_1"),
                           ("pages 2-%d" % external["max_pages"],
                            "pages_2_to_5")):
            bucket = external[key]
            print("  %-14s rated=%-4d of %-4d strict=%s lenient=%s"
                  % (label, bucket["rated"], bucket["candidates"],
                     _fmt(bucket["precision_strict"]),
                     _fmt(bucket["precision_lenient"])))
        for page in sorted(external["per_page"], key=int):
            bucket = external["per_page"][page]
            print("    page %-9s rated=%-4d of %-4d strict=%s lenient=%s"
                  % (page, bucket["rated"], bucket["candidates"],
                     _fmt(bucket["precision_strict"]),
                     _fmt(bucket["precision_lenient"])))

    positives = external["false_positives"]
    print("  false positives          %s  (of %d rated visible)"
          % ("unmeasured" if not positives["available"]
             else positives["count"], positives["rated"]))
    negatives = external["false_negatives_sampled"]
    if not negatives["available"]:
        print("  false negatives          UNMEASURED -- %d candidate(s) NOT "
              "shown to a reader were put in front of a reviewer and %d "
              "rated. This is NOT zero."
              % (negatives["sampled_candidates"], negatives["rated"]))
    else:
        print("  false negatives          %d of %d rated hidden candidates "
              "(sample of %d not shown to a reader -- NOT a corpus-wide "
              "rate)"
              % (negatives["count"], negatives["rated"],
                 negatives["rejected_candidates_in_pool"]))
    accepted = external["records_with_an_accepted_external_result"]
    if accepted["available"]:
        print("  records with >=1 accepted external result  %d of %d "
              "(%.1f%%)"
              % (accepted["records"],
                 accepted["records_with_a_visible_result"],
                 100.0 * accepted["ratio"]))
    else:
        print("  records with >=1 accepted external result  unmeasured (of "
              "%d with a visible result)"
              % accepted["records_with_a_visible_result"])


# ---------------------------------------------------------------------- CLI

def build_parser():
    parser = argparse.ArgumentParser(
        prog="python -m project.tools.related_eval",
        description="Read-only domain-quality evaluation for Related "
                    "Research. Never writes to Qresp and never rates "
                    "anything itself.")
    sub = parser.add_subparsers(dest="command")

    collect_parser = sub.add_parser(
        "collect", help="gather candidates and write the review files")
    collect_parser.add_argument(
        "--api-base", required=True,
        help="Base URL of the Qresp instance to read, e.g. "
             "https://qresp.example.org. No URL is hardcoded anywhere.")
    group = collect_parser.add_mutually_exclusive_group()
    group.add_argument("--ids-file",
                       help="file of Qresp record ids, one per line")
    group.add_argument("--sample-size", type=int, default=20,
                       help="how many records to sample deterministically "
                            "(default 20)")
    collect_parser.add_argument("--output-dir", required=True)
    collect_parser.add_argument(
        "--live", action="store_true",
        help="permit external provider requests. Without it NO external "
             "network call is made and the external pools are reported as "
             "skipped.")
    collect_parser.add_argument("--rate-limit", type=float,
                                default=DEFAULT_RATE_LIMIT,
                                help="provider requests per second "
                                     "(default 1.0)")
    collect_parser.add_argument("--max-retries", type=int,
                                default=DEFAULT_MAX_RETRIES,
                                help="retries after HTTP 429 (default 3)")
    collect_parser.add_argument("--review-rejected", type=int, default=5,
                                help="rejected candidates per source to put "
                                     "in the review file (default 5). These "
                                     "are what reveal false negatives.")
    collect_parser.add_argument(
        "--external-review-sample", type=int, default=core.DEFAULT_DEEP_SAMPLE,
        help="rows to draw from external display pages 2-5 for %s (default "
             "%d). Page 1 is always exported in full."
             % (EXTERNAL_REVIEW_FILE, core.DEFAULT_DEEP_SAMPLE))
    collect_parser.add_argument(
        "--external-rejected-sample", type=int,
        default=core.DEFAULT_REJECTED_SAMPLE,
        help="rows to draw from the external candidates NOT shown to a "
             "reader -- beyond the 25-result display cap, regardless of "
             "their own gate verdict (default %d), stratified by score band "
             "and spread across records. Without them a false negative "
             "cannot be found at all: only what is visible can be rated from "
             "the page samples, and a visible candidate is never a false "
             "negative by definition."
             % core.DEFAULT_REJECTED_SAMPLE)
    collect_parser.add_argument("--include-flagged", action="store_true",
                                help="also sample records flagged as test or "
                                     "inconsistent")
    collect_parser.add_argument("--timeout", type=int, default=20)
    collect_parser.add_argument("--insecure", action="store_true",
                                help="skip TLS verification (local tunnels "
                                     "with self-signed certificates only)")
    collect_parser.set_defaults(func=collect)

    ai_parser = sub.add_parser(
        "ai-label",
        help="AI-BASED PROVISIONAL labels to triage what an expert should "
             "read. Not ground truth; never changes production scoring.")
    ai_parser.add_argument("--output-dir", required=True)
    ai_parser.add_argument(
        "--review-file",
        help="TSV naming the pairs to judge (default: "
             "<output-dir>/human-review.tsv). This is the work list; "
             "raw-results.jsonl is only the metadata store.")
    ai_parser.add_argument(
        "--allow-title-only", action="store_true",
        help="also judge pairs where NEITHER paper has an abstract. Off by "
             "default; when on, confidence is forced to low.")
    ai_parser.add_argument(
        "--sources", default="internal,recommendations_default",
        help="comma-separated candidate sources to judge (default: the two "
             "a decision rests on)")
    ai_parser.add_argument("--limit", type=int, default=0,
                           help="judge at most N pairs (0 = all)")
    ai_parser.add_argument("--rate-limit", type=float,
                           default=DEFAULT_AI_RATE_LIMIT,
                           help="provider requests per second (default 0.5)")
    ai_parser.add_argument("--max-output-tokens", type=int, default=512)
    ai_parser.add_argument("--expert-limit", type=int,
                           default=ai_review.EXPERT_REVIEW_LIMIT,
                           help="rows in expert-review.tsv (default 30)")
    ai_parser.add_argument("--retry-errors", action="store_true",
                           help="re-ask for pairs that previously failed")
    ai_parser.add_argument("--dry-run", action="store_true",
                           help="build and blind-check every payload but "
                                "contact no provider")
    ai_parser.set_defaults(func=ai_label)

    smoke_parser = sub.add_parser(
        "smoke-sample",
        help="write a small, deterministic, spread-out review file for a "
             "first real ai-label run. Contacts no provider.")
    smoke_parser.add_argument("--output-dir", required=True)
    smoke_parser.add_argument(
        "--review-file",
        help="review TSV to draw from (default: "
             "<output-dir>/human-review.tsv)")
    smoke_parser.add_argument("--limit", type=int,
                              default=core.SMOKE_SAMPLE_LIMIT,
                              help="pairs to select (default 10)")
    smoke_parser.add_argument(
        "--sources", default="internal,recommendations_default",
        help="comma-separated candidate sources to draw from")
    smoke_parser.set_defaults(func=smoke_sample)

    summarize_parser = sub.add_parser(
        "summarize", help="score a review file a human has filled in")
    summarize_parser.add_argument("--output-dir", required=True)
    summarize_parser.set_defaults(func=summarize)
    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help()
        return 2
    if getattr(args, "ids_file", None):
        args.sample_size = None
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
