"""Benchmarks for Qresp's two AI assist features — read-only, offline QA.

    .\venv\Scripts\python.exe -m project.tools.assist_eval <command>

    collect      --api-base URL --output-dir DIR [--execute]
    collect-rcc  --output-dir DIR [--execute] [--limit N]
    audit        --output-dir DIR
    smoke-sample --output-dir DIR [--seed N]
    run          --output-dir DIR [--execute]
    summarize    --output-dir DIR

Every network step is a dry run until `--execute` is given: `collect` reads
a live Qresp instance, `collect-rcc` reads a live file server, and `run` is
the only one that reaches Gemini.

WHAT IS MEASURED
----------------
1. **Paper keywords** (`POST /api/assist/keywords`). A record's own `tags` are
   hidden, the keyword AI is run on the same inputs the product allows, and
   the suggestions are compared with the hidden tags -- in two modes,
   publication-only and publication-plus-artifacts.
2. **RCC artifact descriptions** (`POST /api/curation/describe-candidates`).
   An RCC candidate is paired with the human-authored artifact for the SAME
   file, the human text is hidden, and the description AI sees only what the
   product would send it.

WHAT THIS IS NOT
----------------
The existing curation is a **reference**, not ground truth. A curator's tag
is one defensible choice among several, and a suggestion that misses it is
not thereby wrong. Exact string matching cannot see that "DFT" and "density
functional theory" are one answer, so every exact score here is a LOWER
BOUND and is labelled as one.

The judgement is also **AI-based provisional evaluation**: where a model
scores its own output the bias is toward itself, and the summaries say so.
Nothing here changes a prompt, a threshold, a quota or any served behaviour.

SAFETY
------
* No provider call without `--execute`. `collect` and `smoke-sample` never
  call one at all, and `summarize` re-aggregates cached answers only.
* Qresp is read through its public read APIs; RCC analyses are read from
  files the curator already saved, so no file server is contacted.
* MongoDB, drafts, published records, the serving cache and the per-user
  quota counter are never written.
* The API key is read from the environment only, and is reported as a
  boolean. Keys, headers, prompts and payload bodies never reach stdout.
"""
import argparse
import io
import json
import os
import sys
import time

from project import assist
from project import curation
from project.tools import assist_core as core

BENCH_KEYWORDS = "keywords"
BENCH_ARTIFACTS = "artifacts"

# Provider requests per SECOND. Deliberately slow: a free-tier Gemini project
# rate-limits well below one per second, and this tool never retries, so a
# 429 costs the operator a re-run rather than the tool a hidden extra call.
DEFAULT_RATE_LIMIT = 0.08
DEFAULT_KEYWORD_RECORDS = 5       # x 2 modes = 10 calls
DEFAULT_ARTIFACT_CANDIDATES = 10
HARD_CALL_CEILING = 40            # refuses to plan more without --i-know

PROVISIONAL = ("AI-based provisional evaluation - NOT expert ground truth, "
               "NOT validated, NOT verified. Existing curation is a "
               "REFERENCE, not an answer key.")
SELF_EVAL_WARNING = (
    "Where the same model both produced and judged a suggestion, the "
    "judgement is biased toward itself. Treat agreement between them as weak "
    "evidence and disagreement as the interesting signal.")


# ------------------------------------------------------------------- helpers

def _read_json(path):
    with io.open(path, encoding="utf-8-sig") as handle:
        return json.load(handle)


def _read_lines(path):
    """utf-8-sig: PowerShell 5.1 writes a BOM for `-Encoding utf8`, and read
    as plain utf-8 it survives on the first line."""
    with io.open(path, encoding="utf-8-sig") as handle:
        return [line.strip() for line in handle
                if line.strip() and not line.strip().startswith("#")]


def _write_json(path, payload):
    with io.open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(core.dumps(payload) + "\n")


def _write_jsonl(path, rows):
    with io.open(path, "w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False,
                                    sort_keys=True) + "\n")


def _read_jsonl(path):
    if not os.path.isfile(path):
        return []
    with io.open(path, encoding="utf-8-sig") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def _write_tsv(path, columns, rows):
    def cell(value):
        import re
        return re.sub(r"[\t\r\n]+", " ", "" if value is None
                      else str(value)).strip()
    with io.open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\t".join(columns) + "\n")
        for row in rows:
            handle.write("\t".join(cell(row.get(c)) for c in columns) + "\n")


class RateLimiter(object):
    def __init__(self, per_second, sleep=time.sleep, clock=time.monotonic):
        self._interval = 1.0 / per_second if per_second > 0 else 0.0
        self._sleep = sleep
        self._clock = clock
        self._last = None

    def wait(self):
        if self._interval <= 0 or self._last is None:
            self._last = self._clock()
            return
        elapsed = self._clock() - self._last
        if elapsed < self._interval:
            self._sleep(self._interval - elapsed)
        self._last = self._clock()


class RefusingProvider(object):
    """Installed whenever `--execute` is absent, so a call cannot slip out."""

    def __call__(self, *args, **kwargs):
        raise RuntimeError("provider call attempted without --execute")


# ------------------------------------------------------------------ collect

class QrespReader(object):
    def __init__(self, api_base, session, timeout=20, verify=True):
        self.api_base = api_base.rstrip("/")
        self._session = session
        self._timeout = timeout
        self._verify = verify

    def _get(self, path):
        response = self._session.get("%s%s" % (self.api_base, path),
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


def _load_rcc_analyses(path):
    """RCC candidates from analyses the curator already saved.

    A file server is never contacted here. `analyze-folder` needs a curator
    session and a CSRF token, and a QA tool has no business holding either --
    so the saved response is the input.

    Accepts one JSON file `{record_id: <analyze-folder response>}` or a
    directory of `<record_id>.json`.
    """
    if not path or not os.path.exists(path):
        return {}
    analyses = {}
    if os.path.isdir(path):
        for name in sorted(os.listdir(path)):
            if name.lower().endswith(".json"):
                try:
                    analyses[os.path.splitext(name)[0]] = _read_json(
                        os.path.join(path, name))
                except Exception as e:
                    print("  ! unreadable analysis %s (%s)"
                          % (name, type(e).__name__))
    else:
        payload = _read_json(path)
        if isinstance(payload, dict):
            analyses = payload
    # `assist_core` understands every shape -- pure analyzer result, HTTP
    # response, and this tool's own cache -- and normalizes label/evidence.
    return {str(record_id): core.rcc_candidates_from(response)
            for record_id, response in analyses.items()}


def _load_rcc_cache_states(output_dir):
    """Per record: is there a saved analysis, and may it be reused?

    "An analysis exists" and "the analysis found candidates" are different
    facts. A legitimately empty folder analyses fine and yields nothing, and
    reporting that as "no analysis" sends someone hunting for a network
    problem that is not there.
    """
    states = {}
    directory = _rcc_dir(output_dir)
    if not os.path.isdir(directory):
        return states
    for name in sorted(os.listdir(directory)):
        if not name.lower().endswith(".json"):
            continue
        record_id = os.path.splitext(name)[0]
        try:
            payload = _read_json(os.path.join(directory, name))
        except Exception:
            states[record_id] = {"present": True, "current": False,
                                 "candidates": 0}
            continue
        states[record_id] = {
            "present": True,
            "current": core.rcc_cache_is_current(payload),
            "candidates": len(core.rcc_candidates_from(payload)),
        }
    return states


def collect(args):
    if not args.execute:
        print("DRY RUN: `collect` reads a live Qresp instance over the "
              "network.")
        print("  api base      %s" % args.api_base)
        print("  output dir    %s" % args.output_dir)
        print("  ids file      %s" % (args.ids_file or "(all records)"))
        print("  rcc analyses  %s" % (args.rcc_analyses or "(none)"))
        print("  qresp requests planned: 1 search + 1 details per record")
        print("\nNo request was made. Add --execute to read the instance.")
        return 0

    import requests

    session = requests.Session()
    reader = QrespReader(args.api_base, session, timeout=args.timeout,
                         verify=not args.insecure)
    print("Reading records from %s (read-only)" % reader.api_base)
    search_rows = reader.search()
    print("  %d records visible" % len(search_rows))

    wanted = set(_read_lines(args.ids_file)) if args.ids_file else None
    records = []
    for row in search_rows:
        normalized = core.normalize_search_record(row)
        if not normalized["id"]:
            continue
        if wanted is not None and normalized["id"] not in wanted:
            continue
        details = reader.details(normalized["id"])
        records.append(core.to_benchmark_record(row, details))
    print("  %d records collected" % len(records))

    rcc = _load_rcc_analyses(args.rcc_analyses)
    for record in records:
        record["rcc_candidates"] = rcc.get(record["record_id"], [])

    if not os.path.isdir(args.output_dir):
        os.makedirs(args.output_dir)
    _write_jsonl(os.path.join(args.output_dir, "raw-records.jsonl"), records)
    print("\nWrote %s (%d records, %d with an RCC analysis)"
          % (os.path.join(args.output_dir, "raw-records.jsonl"),
             len(records),
             sum(1 for r in records if r["rcc_candidates"])))
    print("No provider call was made. Next: `audit`.")
    return 0


# --------------------------------------------------------------- collect-rcc

def _rcc_dir(output_dir):
    return os.path.join(output_dir, "rcc-analyses")


def analyze_one_folder(folder_path):
    """One folder, through the SERVING analysis pipeline.

    Calls the same read-only helpers `POST /api/curation/analyze-folder`
    calls, in the same order, so the host allowlist, the traversal and scheme
    rejection, the TLS policy, the walk limits, the bounded evidence reads and
    the candidate builder are all the production ones. No new API is exposed
    and no authentication or CSRF check is bypassed: this is a library call
    from a command line, not an HTTP request.

    Returns (analysis, error). Gemini, the quota counter, MongoDB, drafts and
    publishing are not involved anywhere in this path.
    """
    import posixpath

    root_url = curation.resolve_folder_url(folder_path)
    with curation.tls_exception_scope(root_url):
        files, dirs, notes, truncated = curation.walk_folder(root_url)
        if not files and not dirs:
            return None, "the folder is empty or unreadable"
        texts = {}
        wanted = [p for p in files
                  if posixpath.basename(p).lower() in curation.MANIFEST_NAMES
                  or posixpath.basename(p).lower() in curation.README_NAMES]
        wanted += [p for p in files if curation._ext(p)
                   in curation.SCRIPT_EXTENSIONS
                   and curation._ext(p) != ".ipynb"]
        for path in wanted[:curation.MAX_TEXT_FILES]:
            try:
                texts[path] = curation._fetch_text(root_url + "/" + path)
            except Exception as e:
                # Never the file's content or its URL -- only the failure kind.
                print("    evidence read skipped (%s)" % type(e).__name__)
    # Default proposal: no boundary selection, no chart plan, exactly what a
    # curator sees before touching anything.
    #
    # This is the PURE result -- candidate groups flat at the top level. Only
    # `POST /api/curation/analyze-folder` wraps it in {"candidates": ...}, so
    # reading `["candidates"]` off THIS is always empty. `rcc_cache_payload`
    # is the one place that translation happens.
    return curation.analyze_folder_tree(files, dirs, texts), None


def collect_rcc(args):
    records = _load_records(args.output_dir)
    if not records:
        print("No raw-records.jsonl in %s. Run `collect --execute` first."
              % args.output_dir)
        return 2

    target_dir = _rcc_dir(args.output_dir)
    wanted = set(_read_lines(args.ids_file)) if args.ids_file else None

    cache_states = _load_rcc_cache_states(args.output_dir)
    pending, skipped, cached, stale = [], [], [], []
    for record in records:
        record_id = record["record_id"]
        if wanted is not None and record_id not in wanted:
            continue
        folder = (record.get("file_server_path") or "").strip()
        if not folder:
            skipped.append((record_id, "record has no fileServerPath"))
            continue
        state = cache_states.get(record_id)
        if state and state["current"] and not args.refresh:
            cached.append(record_id)
            continue
        if state and not state["current"]:
            # A file written by an older build -- most importantly the
            # pre-fix one that always saved `{"candidates": {}}`. Re-analyse
            # rather than trust it.
            stale.append(record_id)
        pending.append((record_id, folder))
    if args.limit:
        pending = pending[:args.limit]

    print("RCC COLLECTION")
    print("  records considered      %d" % len(records))
    print("  already saved (reused)  %d" % len(cached))
    print("  stale cache, re-reading %d" % len(stale))
    print("  skipped                 %d" % len(skipped))
    print("  rcc_folders_to_read     %d" % len(pending))
    print("  rcc requests per folder: 1 listing walk + bounded evidence reads")
    print("  execute                 %s" % bool(args.execute))
    for record_id, reason in skipped[:10]:
        print("    skip %s: %s" % (record_id, reason))

    if not args.execute:
        print("\nDRY RUN: no file server was contacted. Add --execute to "
              "read the %d folder(s) above." % len(pending))
        return 0
    if not pending:
        print("\nNothing to read.")
        return 0

    if not os.path.isdir(target_dir):
        os.makedirs(target_dir)
    limiter = RateLimiter(args.rate_limit)
    ok = failed = 0
    for index, (record_id, folder) in enumerate(pending, start=1):
        limiter.wait()
        # A folder that cannot be read is one record's problem, not the run's.
        try:
            analysis, error = analyze_one_folder(folder)
        except Exception as e:
            analysis, error = None, type(e).__name__
        if analysis is None:
            failed += 1
            print("  [%d/%d] %s failed (%s)"
                  % (index, len(pending), record_id, error))
            continue
        payload = core.rcc_cache_payload(analysis)
        _write_json(os.path.join(target_dir, "%s.json" % record_id), payload)
        counts = {bucket: len(entries)
                  for bucket, entries in payload["candidates"].items()}
        ok += 1
        total = sum(counts.values())
        if not total:
            # A real answer, not a failure -- but say so, because an empty
            # cache used to mean the tool was broken.
            print("  [%d/%d] %s analysed, no candidates (empty or "
                  "unsupported folder)" % (index, len(pending), record_id))
        else:
            print("  [%d/%d] %s %s" % (index, len(pending), record_id,
                                       counts))

    print("\nRead %d folder(s), %d failed. Saved under %s"
          % (ok, failed, target_dir))
    print("Every later step reads this directory automatically. "
          "Next: `audit`.")
    return 0


# -------------------------------------------------------------------- audit

def _load_records(output_dir):
    """The collected records, with any RCC analyses saved since folded in.

    `collect-rcc` writes into `<output-dir>/rcc-analyses`, and every later
    step reads from there, so the sequence collect -> audit -> collect-rcc ->
    audit works without re-reading the Qresp instance.
    """
    records = _read_jsonl(os.path.join(output_dir, "raw-records.jsonl"))
    saved = _load_rcc_analyses(_rcc_dir(output_dir))
    for record in records:
        candidates = saved.get(record["record_id"])
        if candidates is not None:
            record["rcc_candidates"] = candidates
        record.setdefault("rcc_candidates", [])

    # The silver standard is the real published corpus. Qresp's own QA and
    # test records carry placeholder titles, tags and artifact descriptions;
    # scoring against those measures nothing, and leaving them in the
    # leave-one-out vocabulary teaches the model Qresp's test fixtures.
    records, excluded = core.split_reference_corpus(records)
    for record, reason in excluded:
        print("  reference corpus: excluded %s (%s)"
              % (record.get("record_id"), reason))
    if excluded:
        print("  reference corpus: %d QA/test record(s) excluded, %d kept"
              % (len(excluded), len(records)))
    return records


def _keyword_units(records):
    """One unit per (record, mode). Only records that have hidden tags AND
    something to work from can be scored."""
    units = []
    for record in records:
        if not record.get("reference_tags"):
            continue
        if not (record.get("title") or record.get("abstract")):
            continue
        has_artifacts = any((record.get("artifacts") or {}).values())
        for mode in core.KEYWORD_MODES:
            units.append({
                "benchmark": BENCH_KEYWORDS,
                "id": "%s::%s" % (record["record_id"], mode),
                "sort_key": "%s::%s" % (record["record_id"], mode),
                "record_id": record["record_id"],
                "mode": mode,
                "reference_tag_count": len(record["reference_tags"]),
                "has_artifacts": has_artifacts,
            })
    return units


def _artifact_units(records):
    """One unit per RCC candidate that pairs with a human artifact by exact
    path. Everything else is reported as excluded, with the reason."""
    units, excluded = [], []
    for record in records:
        for candidate in record.get("rcc_candidates") or []:
            artifact, reason = core.match_candidate(candidate, record)
            if artifact is None:
                excluded.append({
                    "record_id": record["record_id"],
                    "candidate_id": candidate.get("id"),
                    "kind": candidate.get("kind"),
                    "reason": reason,
                })
                continue
            # One unit per candidate PER EVIDENCE MODE: the same candidate is
            # asked twice, once with the old filenames-only input and once
            # with the shipped bundle, so the comparison is paired rather
            # than between two different samples of candidates.
            for mode in core.EVIDENCE_MODES:
                units.append({
                    "benchmark": BENCH_ARTIFACTS,
                    "id": "%s::%s::%s" % (record["record_id"],
                                          candidate.get("id"), mode),
                    "sort_key": "%s::%s::%s" % (record["record_id"],
                                                candidate.get("id"), mode),
                    "record_id": record["record_id"],
                    "candidate_id": candidate.get("id"),
                    "kind": candidate.get("kind"),
                    "evidence_mode": mode,
                    "source_count": len(candidate.get("sources") or []),
                    "has_evidence": bool(candidate.get("sources")),
                    "has_human_description": bool(
                        artifact["human_description"]),
                })
    return units, excluded


def _audit_report(records, cache_states=None):
    keyword_units = _keyword_units(records)
    artifact_units, excluded = _artifact_units(records)
    by_kind = {}
    for unit in artifact_units:
        by_kind[unit["kind"]] = by_kind.get(unit["kind"], 0) + 1
    by_reason = {}
    for entry in excluded:
        by_reason[entry["reason"]] = by_reason.get(entry["reason"], 0) + 1

    return {
        "records": len(records),
        "records_with_reference_tags": sum(
            1 for r in records if r.get("reference_tags")),
        "records_with_artifacts": sum(
            1 for r in records if any((r.get("artifacts") or {}).values())),
        # An analysis that legitimately found nothing IS an analysis. Only a
        # missing or stale cache counts as "not analysed" -- conflating the
        # two sends someone looking for a network fault that is not there.
        "records_with_rcc_analysis": sum(
            1 for r in records
            if (cache_states or {}).get(r["record_id"], {}).get("current")),
        "records_with_rcc_candidates": sum(
            1 for r in records if r.get("rcc_candidates")),
        "records_with_stale_rcc_cache": sum(
            1 for r in records
            if (cache_states or {}).get(r["record_id"], {}).get("present")
            and not (cache_states or {}).get(r["record_id"], {}).get(
                "current")),
        "keyword_units": len(keyword_units),
        "keyword_units_by_mode": {
            mode: sum(1 for u in keyword_units if u["mode"] == mode)
            for mode in core.KEYWORD_MODES},
        "artifact_units": len(artifact_units),
        "artifact_units_by_kind": dict(sorted(by_kind.items())),
        "artifact_candidates_excluded": len(excluded),
        "artifact_exclusion_reasons": dict(sorted(by_reason.items())),
        "keyword_context_gaps": core.keyword_context_gaps(records),
        "full_corpus_provider_calls_if_unsampled":
            len(keyword_units) + len(artifact_units),
    }


def audit(args):
    records = _load_records(args.output_dir)
    if not records:
        print("No raw-records.jsonl in %s. Run `collect` first."
              % args.output_dir)
        return 2
    report = _audit_report(records, _load_rcc_cache_states(args.output_dir))
    print("AUDIT (no provider call)")
    for key in ("records", "records_with_reference_tags",
                "records_with_artifacts", "records_with_rcc_analysis",
                "records_with_rcc_candidates", "records_with_stale_rcc_cache",
                "keyword_units", "artifact_units",
                "artifact_candidates_excluded",
                "full_corpus_provider_calls_if_unsampled"):
        print("  %-44s %s" % (key, report[key]))
    print("  %-44s %s" % ("artifact_units_by_kind",
                          report["artifact_units_by_kind"]))
    if report["artifact_exclusion_reasons"]:
        print("  exclusions:")
        for reason, count in report["artifact_exclusion_reasons"].items():
            print("    %-42s %d" % (reason, count))
    gaps = report["keyword_context_gaps"]
    if gaps:
        print("\n  Human artifact text vs what reaches the keyword AI")
        for field, counts in gaps.items():
            print("    %-24s stored=%-5d reaches_ai=%-5d "
                  "DEDUPLICATED=%-4d TRUE_LOST=%d"
                  % (field, counts["stored"], counts["reaches_ai"],
                     counts["deduplicated_same_text"], counts["true_lost"]))
        print("    DEDUPLICATED: identical to another field already sent, so "
              "the product")
        print("      sends it once. Not a loss.")
        print("    TRUE_LOST is the number that matters; it should be 0.")
    _write_json(os.path.join(args.output_dir, "audit.json"), report)
    print("\nWrote audit.json. Next: `smoke-sample`.")
    return 0


# ------------------------------------------------------------- smoke sample

def smoke_sample(args):
    records = _load_records(args.output_dir)
    if not records:
        print("No raw-records.jsonl in %s. Run `collect` first."
              % args.output_dir)
        return 2

    keyword_units = _keyword_units(records)
    artifact_units, _ = _artifact_units(records)

    # Keyword: stratify on (mode, does the record have artifacts at all), so
    # the sample cannot be all bare records in one mode.
    chosen_records = core.stratified_sample(
        [u for u in keyword_units if u["mode"] == core.MODE_PUBLICATION_ONLY],
        args.keyword_records,
        lambda u: "artifacts" if u["has_artifacts"] else "bare",
        seed=args.seed)
    keyword_ids = [u["record_id"] for u in chosen_records]
    keyword_sample = [u for u in keyword_units
                      if u["record_id"] in keyword_ids]

    # Artifact: stratify on (kind, does it have real evidence), because
    # "described a chart with no evidence" and "described a script with a
    # docstring" are different questions.
    #
    # The sample is drawn over CANDIDATES, then both evidence modes of each
    # chosen candidate are included. Sampling the modes independently would
    # compare two different sets of candidates and call the difference an
    # effect of the evidence.
    chosen_candidates = core.stratified_sample(
        [u for u in artifact_units
         if u["evidence_mode"] == core.EVIDENCE_ENHANCED],
        args.artifact_candidates,
        lambda u: "%s/%s" % (u["kind"],
                             "evidence" if u["has_evidence"] else "names"),
        seed=args.seed)
    # The stratum label belongs to the candidate, so both of its modes carry
    # the same one -- the sample stays reportable per stratum.
    strata = {(u["record_id"], u["candidate_id"]): u.get("stratum")
              for u in chosen_candidates}
    artifact_sample = [
        dict(u, stratum=strata[(u["record_id"], u["candidate_id"])])
        for u in artifact_units
        if (u["record_id"], u["candidate_id"]) in strata]

    sample = {
        "evaluation_type": PROVISIONAL,
        "seed": args.seed,
        "keyword_units": sorted(keyword_sample, key=lambda u: u["id"]),
        "artifact_units": sorted(artifact_sample, key=lambda u: u["id"]),
        "planned_provider_calls": len(keyword_sample) + len(artifact_sample),
    }
    _write_json(os.path.join(args.output_dir, "smoke-sample.json"), sample)

    print("SMOKE SAMPLE (no provider call), seed=%d" % args.seed)
    print("  keyword units   %d  (%d records x %d modes)"
          % (len(keyword_sample), len(keyword_ids), len(core.KEYWORD_MODES)))
    print("  artifact units  %d" % len(artifact_sample))
    if not artifact_units:
        # Never imply calls that are not going to happen.
        print("    NOTE: no RCC analysis is available, so the artifact "
              "benchmark will evaluate 0 candidates and make 0 calls.")
        print("    Run `collect-rcc --execute` first if you want it.")
    strata = {}
    for unit in artifact_sample:
        strata[unit["stratum"]] = strata.get(unit["stratum"], 0) + 1
    if strata:
        print("  artifact strata %s" % dict(sorted(strata.items())))
    print("  planned_provider_calls %d" % sample["planned_provider_calls"])
    print("\nWrote smoke-sample.json. Next: `run` (dry-run by default).")
    return 0


# ---------------------------------------------------------------------- run

def _provider_config():
    cfg = assist._gemini_config()
    return cfg, bool(cfg["ENABLED"] and cfg["API_KEY"])


def _cache_index(output_dir):
    """Answers worth reusing: the SUCCESSFUL ones, keyed by fingerprint.

    A failure is not an answer. Treating one as cached is what made a
    rate-limited run unrecoverable -- a live sweep came back 4 success, 2
    MAX_TOKENS and 4 HTTP 429, and re-running the same command retried none
    of the six, because every row with a fingerprint counted as cached.

    Failures stay in `provider-cache.jsonl` as diagnostics and are simply not
    indexed here, so the operator's recovery for a 429 is to wait and run the
    same command again. That is also why there is no automatic retry: a
    retried paid call is spend nobody asked for.

    A success wins over a failure for the same fingerprint whichever order
    they were appended in -- a later failed retry of an already-answered unit
    must not un-cache it.
    """
    index = {}
    for row in _read_jsonl(os.path.join(output_dir, "provider-cache.jsonl")):
        fingerprint = row.get("fingerprint")
        if not fingerprint or not row.get("ok"):
            continue
        index.setdefault(fingerprint, row)
    return index


def _cache_failures(output_dir):
    """Failed attempts by kind, for the run report. Diagnostics only."""
    counts = {}
    index = _cache_index(output_dir)
    for row in _read_jsonl(os.path.join(output_dir, "provider-cache.jsonl")):
        fingerprint = row.get("fingerprint")
        if not fingerprint or row.get("ok") or fingerprint in index:
            continue
        kind = row.get("error_kind") or assist.ERROR_OTHER
        counts[kind] = counts.get(kind, 0) + 1
    return dict(sorted(counts.items()))


def _plan(records, sample, cache, cfg):
    """Every unit, with its payload and cache state, before anything is
    called. Building the payloads here is what makes the planned call count
    exact rather than an estimate."""
    by_id = {r["record_id"]: r for r in records}
    planned = []

    for unit in sample.get("keyword_units") or []:
        record = by_id.get(unit["record_id"])
        if not record:
            continue
        vocabulary, known = core.build_vocabulary(
            records, exclude_record_id=record["record_id"])
        payload = core.build_keyword_payload(record, unit["mode"], vocabulary)
        planned.append({
            "benchmark": BENCH_KEYWORDS,
            "unit": unit,
            "payload": payload,
            "known_vocabulary": known,
            "system_prompt": assist.KEYWORD_SYSTEM_PROMPT,
            "schema": assist.KEYWORD_RESPONSE_SCHEMA,
            "max_output_tokens": assist.KEYWORD_OUTPUT_TOKENS,
            "fingerprint": core.fingerprint(
                cfg["MODEL"], assist.KEYWORD_SYSTEM_PROMPT, payload),
        })

    for unit in sample.get("artifact_units") or []:
        record = by_id.get(unit["record_id"])
        if not record:
            continue
        candidate = next((c for c in record.get("rcc_candidates") or []
                          if str(c.get("id")) == str(unit["candidate_id"])),
                         None)
        if candidate is None:
            continue
        artifact, reason = core.match_candidate(candidate, record)
        if artifact is None:
            continue
        mode = unit.get("evidence_mode") or core.EVIDENCE_ENHANCED
        payload = core.build_artifact_payload(candidate, artifact, mode=mode,
                                              record=record)
        if payload is None:
            continue
        # The gate on the whole unit. A payload that still contains the
        # curator's own caption/readme/keywords measures copying, so it is
        # dropped rather than scored -- loudly, in the run summary.
        leaked = core.payload_leaks_the_answer(payload, artifact)
        planned.append({
            "benchmark": BENCH_ARTIFACTS,
            "unit": unit,
            "artifact": artifact,
            "payload": payload,
            "leaked": leaked,
            "system_prompt": curation.AI_SYSTEM_PROMPT,
            "schema": curation.AI_RESPONSE_SCHEMA,
            "max_output_tokens": curation.AI_OUTPUT_TOKENS,
            "fingerprint": core.fingerprint(
                cfg["MODEL"], curation.AI_SYSTEM_PROMPT, payload),
        })

    # A leaking unit is never called: it would spend a provider request on a
    # question whose answer was in the question.
    dropped = [entry for entry in planned if entry.get("leaked")]
    for entry in dropped:
        print("  LEAK: %s dropped -- the target record's own text survived "
              "into the payload (%s)"
              % (entry["unit"]["id"], "; ".join(entry["leaked"])[:120]))
    planned = [entry for entry in planned if not entry.get("leaked")]

    for entry in planned:
        entry["cached"] = entry["fingerprint"] in cache
    return planned


def run(args):
    records = _load_records(args.output_dir)
    sample_path = os.path.join(args.output_dir, "smoke-sample.json")
    if not records or not os.path.isfile(sample_path):
        print("Need raw-records.jsonl and smoke-sample.json in %s."
              % args.output_dir)
        return 2
    sample = _read_json(sample_path)

    cfg, ready = _provider_config()
    cache = _cache_index(args.output_dir)
    planned = _plan(records, sample, cache, cfg)
    to_call = [entry for entry in planned if not entry["cached"]]

    print(PROVISIONAL)
    print("  provider configured        %s" % ready)
    print("  model                      %s" % cfg["MODEL"])
    print("  units planned              %d" % len(planned))
    print("  already cached             %d  (successful answers reused)"
          % (len(planned) - len(to_call)))
    print("  planned_provider_calls     %d" % len(to_call))
    print("  execute                    %s" % bool(args.execute))

    # Every payload is checked for leakage BEFORE anything is sent.
    problems = []
    for entry in planned:
        if entry["benchmark"] == BENCH_KEYWORDS:
            record = next(r for r in records
                          if r["record_id"] == entry["unit"]["record_id"])
            for leak in core.payload_leaks(
                    entry["payload"], record["reference_tags"],
                    core.exclusive_tags(record, records)):
                problems.append("%s: %s" % (entry["unit"]["id"], leak))
        else:
            for problem in core.payload_is_safe(entry["payload"]):
                problems.append("%s: %s" % (entry["unit"]["id"], problem))
    if problems:
        print("\nSTOPPING: payload safety check failed")
        for problem in problems[:20]:
            print("  - %s" % problem)
        return 4

    if not args.execute:
        print("\nDRY RUN: no provider call was made. Add --execute to run "
              "the %d call(s) above." % len(to_call))
        return 0
    if not ready:
        print("\nQRESP_GEMINI_ENABLED / QRESP_GEMINI_API_KEY are not set.")
        return 3
    if len(to_call) > args.max_calls:
        print("\nSTOPPING: %d calls exceeds --max-calls %d."
              % (len(to_call), args.max_calls))
        return 4

    limiter = RateLimiter(args.rate_limit)
    cache_path = os.path.join(args.output_dir, "provider-cache.jsonl")
    made = 0
    with io.open(cache_path, "a", encoding="utf-8", newline="\n") as handle:
        for entry in to_call:
            limiter.wait()
            answer_text, error = assist.call_gemini(
                cfg, entry["payload"], entry["system_prompt"],
                entry["schema"],
                max_output_tokens=entry["max_output_tokens"])
            made += 1
            row = {
                "fingerprint": entry["fingerprint"],
                "benchmark": entry["benchmark"],
                "unit_id": entry["unit"]["id"],
                "model": cfg["MODEL"],
                "ok": not error,
                # The provider's own words, kept for re-aggregation. Never
                # printed: only the outcome is.
                "answer_text": answer_text if not error else "",
                # The classification, never the provider's error body: enough
                # to tell a truncated answer from a rate limit without
                # storing anything sensitive.
                "error_kind": assist.error_kind(error),
            }
            handle.write(json.dumps(row, ensure_ascii=False,
                                    sort_keys=True) + "\n")
            handle.flush()
            print("  [%d/%d] %s %s"
                  % (made, len(to_call), entry["unit"]["id"],
                     "ok" if not error else assist.error_kind(error)))
    print("\nMade %d provider call(s). Next: `summarize`." % made)
    return 0


# ---------------------------------------------------------------- summarize

def _score_keyword(entry, cached, records):
    record = next(r for r in records
                  if r["record_id"] == entry["unit"]["record_id"])
    suggestions, parse_error = [], ""
    if cached and cached.get("ok"):
        try:
            suggestions = assist._parse_keyword_suggestions(
                cached["answer_text"], entry["known_vocabulary"])
        except Exception as e:
            parse_error = type(e).__name__
    keywords = [s["keyword"] for s in suggestions]
    metrics = core.keyword_metrics(keywords, record["reference_tags"],
                                   entry["known_vocabulary"])
    return {
        "unit_id": entry["unit"]["id"],
        "record_id": record["record_id"],
        "record_title": record["title"],
        "mode": entry["unit"]["mode"],
        "status": ("completed" if suggestions else
                   ("parse_error" if parse_error else
                    ("provider_error" if cached and not cached.get("ok")
                     else "not_run"))),
        "suggested_keywords": keywords,
        "reference_tags": record["reference_tags"],
        "duplicate_concepts": core.suspected_duplicate_concepts(keywords),
        "metrics": metrics,
    }


def _score_artifact(entry, cached, records):
    artifact = entry["artifact"]
    suggestion, parse_error = {}, ""
    if cached and cached.get("ok"):
        try:
            parsed = curation._parse_ai_items(cached["answer_text"])
            suggestion = parsed.get(entry["payload"]["artifact"]["id"], {})
        except Exception as e:
            parse_error = type(e).__name__
    kind = entry["unit"]["kind"]
    # The product drops Tool keywords server-side; the benchmark records the
    # violation AND applies the same drop, so it measures the product.
    raw_keywords = list(suggestion.get("keywords") or [])
    violations = core.type_contract_violations(kind, suggestion)
    if kind not in curation.AI_KEYWORD_KINDS:
        suggestion = dict(suggestion, keywords=[])

    description = suggestion.get("description") or ""
    payload = entry["payload"]
    evidence = core.evidence_text_of(payload)
    abstained = bool(cached and cached.get("ok") and not description.strip())
    return {
        "unit_id": entry["unit"]["id"],
        "record_id": entry["unit"]["record_id"],
        "kind": kind,
        "evidence_mode": entry["unit"].get("evidence_mode", ""),
        "source_count": len(payload.get("sources") or []),
        # --- the metrics this comparison exists for ---------------------
        "groundedness": core.groundedness(description, payload),
        "useful": core.usefulness(description, payload),
        "abstention": core.abstention_verdict(payload, suggestion),
        "generic_keyword_ratio": core.generic_keyword_ratio(raw_keywords),
        "concept_overlap": core.concept_overlap(
            suggestion.get("keywords") or [], artifact["human_keywords"]),
        # Recall split on the one caveat that would otherwise inflate it: a
        # reference keyword the paper's own title or abstract already spells
        # out is recoverable by reading the background, not by reading the
        # artifact's evidence.
        "background_recoverable_keywords":
            core.background_recoverable_keywords(payload, artifact),
        "concept_overlap_evidence_only": core.concept_overlap(
            suggestion.get("keywords") or [],
            [term for term in artifact["human_keywords"]
             if term not in core.background_recoverable_keywords(
                 payload, artifact)]),
        "status": ("completed" if (description or suggestion.get("keywords"))
                   else ("abstained" if abstained else
                         ("parse_error" if parse_error else
                          ("provider_error" if cached and not cached.get("ok")
                           else "not_run")))),
        "has_evidence": entry["unit"]["has_evidence"],
        "abstained": abstained,
        "ai_description": description,
        "ai_keywords": suggestion.get("keywords") or [],
        "ai_keywords_before_type_filter": raw_keywords,
        "ai_reason": suggestion.get("reason") or "",
        "ai_confidence": suggestion.get("confidence") or "",
        "human_description": artifact["human_description"],
        "human_keywords": artifact["human_keywords"],
        "description_similarity": core.text_similarity(
            description, artifact["human_description"]),
        "keyword_similarity": core.text_similarity(
            " ".join(suggestion.get("keywords") or []),
            " ".join(artifact["human_keywords"])),
        "forbidden_fields": core.forbidden_field_hits(description),
        "type_contract_violations": violations,
        "unsupported_terms": core.unsupported_claim_terms(description,
                                                          evidence),
        "reason_cites_evidence": bool(
            suggestion.get("reason") and evidence and
            core.text_similarity(suggestion.get("reason"), evidence) > 0),
    }


def summarize(args):
    records = _load_records(args.output_dir)
    sample_path = os.path.join(args.output_dir, "smoke-sample.json")
    if not records or not os.path.isfile(sample_path):
        print("Need raw-records.jsonl and smoke-sample.json.")
        return 2
    sample = _read_json(sample_path)
    cfg, _ = _provider_config()
    cache = _cache_index(args.output_dir)
    planned = _plan(records, sample, cache, cfg)

    keyword_rows, artifact_rows = [], []
    for entry in planned:
        cached = cache.get(entry["fingerprint"])
        if entry["benchmark"] == BENCH_KEYWORDS:
            keyword_rows.append(_score_keyword(entry, cached, records))
        else:
            artifact_rows.append(_score_artifact(entry, cached, records))

    keyword_summary = _keyword_summary(keyword_rows, records)
    artifact_summary = _artifact_summary(artifact_rows)

    out = args.output_dir
    _write_json(os.path.join(out, "keyword-summary.json"), keyword_summary)
    _write_json(os.path.join(out, "artifact-summary.json"), artifact_summary)
    _write_tsv(os.path.join(out, "keyword-review.tsv"),
               ("unit_id", "record_id", "record_title", "mode", "status",
                "suggested_keywords", "reference_tags", "exact_hits",
                "exact_precision", "exact_recall", "vocabulary_reuse_rate",
                "generic_suggestions", "expert_rating", "expert_note"),
               [{**row,
                 "suggested_keywords": ", ".join(row["suggested_keywords"]),
                 "reference_tags": ", ".join(row["reference_tags"]),
                 "exact_hits": row["metrics"]["exact_hits"],
                 "exact_precision": row["metrics"]["exact_precision"],
                 "exact_recall": row["metrics"]["exact_recall"],
                 "vocabulary_reuse_rate":
                     row["metrics"]["vocabulary_reuse_rate"],
                 "generic_suggestions":
                     ", ".join(row["metrics"]["generic_suggestions"]),
                 "expert_rating": "", "expert_note": ""}
                for row in keyword_rows])
    _write_tsv(os.path.join(out, "artifact-review.tsv"),
               ("unit_id", "record_id", "kind", "evidence_mode", "status",
                "source_count", "has_evidence", "abstained", "abstention",
                "groundedness", "useful", "ai_description",
                "human_description", "ai_keywords", "human_keywords",
                "description_similarity", "generic_keyword_ratio",
                "forbidden_fields", "type_contract_violations",
                "expert_rating", "expert_note"),
               [{**row,
                 "ai_keywords": ", ".join(row["ai_keywords"]),
                 "human_keywords": ", ".join(row["human_keywords"]),
                 "forbidden_fields": ", ".join(row["forbidden_fields"]),
                 "type_contract_violations":
                     "; ".join(row["type_contract_violations"]),
                 "expert_rating": "", "expert_note": ""}
                for row in artifact_rows])
    _expert_review(out, keyword_rows, artifact_rows)

    print(PROVISIONAL)
    print(SELF_EVAL_WARNING)
    print("\nprovider calls made by summarize: 0 (cached answers only)")
    print("keyword units  %d  (completed %d)"
          % (len(keyword_rows),
             sum(1 for r in keyword_rows if r["status"] == "completed")))
    print("artifact units %d  (completed %d, abstained %d)"
          % (len(artifact_rows),
             sum(1 for r in artifact_rows if r["status"] == "completed"),
             sum(1 for r in artifact_rows if r["abstained"])))
    print("\nWrote keyword-summary.json, artifact-summary.json, "
          "keyword-review.tsv, artifact-review.tsv, expert-review.tsv")
    return 0


def _mean(values):
    values = [v for v in values if v is not None]
    return round(sum(values) / float(len(values)), 4) if values else 0.0


def _keyword_summary(rows, records):
    completed = [r for r in rows if r["status"] == "completed"]
    by_mode = {}
    for mode in core.KEYWORD_MODES:
        subset = [r for r in completed if r["mode"] == mode]
        by_mode[mode] = {
            "units": sum(1 for r in rows if r["mode"] == mode),
            "completed": len(subset),
            "empty_results": sum(1 for r in rows if r["mode"] == mode
                                 and r["status"] == "completed"
                                 and not r["suggested_keywords"]),
            "mean_suggestions": _mean(
                [r["metrics"]["suggested"] for r in subset]),
            "exact_precision_at_8": _mean(
                [r["metrics"]["exact_precision"] for r in subset]),
            "exact_recall_at_8": _mean(
                [r["metrics"]["exact_recall"] for r in subset]),
            "exact_f1_at_8": _mean([r["metrics"]["exact_f1"] for r in subset]),
            "vocabulary_reuse_rate": _mean(
                [r["metrics"]["vocabulary_reuse_rate"] for r in subset]),
            "duplicate_rate_after_normalization": _mean(
                [r["metrics"]["duplicate_rate_after_normalization"]
                 for r in subset]),
        }
    delta = {}
    for key in ("exact_precision_at_8", "exact_recall_at_8",
                "vocabulary_reuse_rate"):
        delta[key] = round(by_mode[core.MODE_WITH_ARTIFACTS][key]
                           - by_mode[core.MODE_PUBLICATION_ONLY][key], 4)

    return {
        "evaluation_type": PROVISIONAL,
        "self_evaluation_warning": SELF_EVAL_WARNING,
        "ground_truth_note":
            "`reference_tags` are the curator's own keywords. They are a "
            "REFERENCE, not an answer key: a different but equally good tag "
            "scores zero here.",
        "metric_note":
            "Exact string match is a LOWER BOUND. DFT vs density functional "
            "theory, photovoltaics vs solar cells and similar pairs count as "
            "misses. No synonym dictionary is hardcoded; "
            "`normalized_concept_hits` only folds case, spacing and plurals.",
        "units": len(rows),
        "completed": len(completed),
        "by_mode": by_mode,
        "artifacts_mode_delta": delta,
        "suspected_duplicate_concepts": [
            {"unit_id": r["unit_id"], "pairs": r["duplicate_concepts"]}
            for r in completed if r["duplicate_concepts"]],
        "generic_suggestions_for_review": [
            {"unit_id": r["unit_id"],
             "keywords": r["metrics"]["generic_suggestions"]}
            for r in completed if r["metrics"]["generic_suggestions"]],
        "keyword_context_gaps": core.keyword_context_gaps(records),
    }


def _mode_metrics(rows):
    """The comparable numbers for one (kind, evidence mode) cell."""
    completed = [r for r in rows if r["status"] == "completed"]
    verdicts = {}
    for row in rows:
        verdicts[row["abstention"]] = verdicts.get(row["abstention"], 0) + 1
    decided = sum(verdicts.get(key, 0) for key in
                  (core.ABSTAIN_CORRECT, core.ABSTAIN_MISSED,
                   core.ANSWER_CORRECT, core.ANSWER_MISSING))
    right = verdicts.get(core.ABSTAIN_CORRECT, 0) + verdicts.get(
        core.ANSWER_CORRECT, 0)
    overlaps = [r["concept_overlap"] for r in completed]
    evidence_only = [r["concept_overlap_evidence_only"] for r in completed]
    return {
        "units": len(rows),
        "completed": len(completed),
        "keyword_concept_recall_evidence_only": _mean(
            [o["recall"] for o in evidence_only]),
        "reference_keywords_in_paper_background": sum(
            len(r["background_recoverable_keywords"]) for r in rows),
        "mean_groundedness": _mean([r["groundedness"] for r in completed]),
        "useful_rate": round(
            sum(1 for r in completed if r["useful"]) / float(len(completed)),
            4) if completed else 0.0,
        "mean_generic_keyword_ratio": _mean(
            [r["generic_keyword_ratio"] for r in completed]),
        "keyword_concept_precision": _mean(
            [o["precision"] for o in overlaps]),
        "keyword_concept_recall": _mean([o["recall"] for o in overlaps]),
        "abstention": dict(sorted(verdicts.items())),
        "abstention_correctness": round(right / float(decided), 4)
        if decided else 0.0,
        "mean_description_similarity": _mean(
            [r["description_similarity"] for r in completed]),
        "forbidden_field_generations": sum(
            1 for r in rows if r["forbidden_fields"]),
    }


def _artifact_summary(rows):
    completed = [r for r in rows if r["status"] == "completed"]

    # The comparison table: one row per record type per evidence mode, so
    # "did the enhanced bundle help Scripts but hurt Charts?" is answerable
    # rather than averaged away.
    by_kind_and_mode = {}
    for kind in sorted({r["kind"] for r in rows}):
        by_kind_and_mode[kind] = {
            mode: _mode_metrics([r for r in rows if r["kind"] == kind
                                 and r["evidence_mode"] == mode])
            for mode in core.EVIDENCE_MODES
        }
    by_mode = {mode: _mode_metrics([r for r in rows
                                    if r["evidence_mode"] == mode])
               for mode in core.EVIDENCE_MODES}

    by_kind = {}
    for row in rows:
        bucket = by_kind.setdefault(row["kind"], {
            "units": 0, "completed": 0, "abstained": 0,
            "with_evidence": 0, "without_evidence": 0})
        bucket["units"] += 1
        if row["status"] == "completed":
            bucket["completed"] += 1
        if row["abstained"]:
            bucket["abstained"] += 1
        bucket["with_evidence" if row["has_evidence"]
               else "without_evidence"] += 1

    descriptions = [r["ai_description"] for r in completed
                    if r["ai_description"]]
    repeated = {}
    for text in descriptions:
        key = " ".join(sorted(core.token_set(text)))[:120]
        repeated[key] = repeated.get(key, 0) + 1
    boilerplate = sum(count - 1 for count in repeated.values() if count > 1)

    return {
        "evaluation_type": PROVISIONAL,
        "self_evaluation_warning": SELF_EVAL_WARNING,
        "ground_truth_note":
            "Human descriptions are a REFERENCE. Similarity is RESEMBLANCE, "
            "not correctness -- two good descriptions of one dataset can "
            "share very few words.",
        "chart_note":
            "The description AI receives no image bytes and no paper text. "
            "For a Chart, abstaining is the CORRECT behaviour when the "
            "evidence does not describe the figure; a confident caption "
            "invented from a file name is a failure, not a success.",
        "units": len(rows),
        "completed": len(completed),
        "abstained": sum(1 for r in rows if r["abstained"]),
        "abstention_rate": round(
            sum(1 for r in rows if r["abstained"]) / float(len(rows)), 4)
        if rows else 0.0,
        "comparison_note":
            "filenames_only reproduces the AI action's input BEFORE the "
            "evidence change (name, relative paths, and the analyzer's own "
            "structural sentences). enhanced is the shipped bundle "
            "(boundary-confined README/docstring/symbol/notebook-markdown "
            "sources plus the paper's title and abstract as background). The "
            "same candidates are asked in both modes, so the difference is "
            "paired.",
        "by_evidence_mode": by_mode,
        "by_kind_and_evidence_mode": by_kind_and_mode,
        "by_kind": dict(sorted(by_kind.items())),
        "mean_description_similarity": _mean(
            [r["description_similarity"] for r in completed]),
        "mean_keyword_similarity": _mean(
            [r["keyword_similarity"] for r in completed]),
        "type_contract_violations": [
            {"unit_id": r["unit_id"], "kind": r["kind"],
             "problems": r["type_contract_violations"]}
            for r in rows if r["type_contract_violations"]],
        "forbidden_field_generations": [
            {"unit_id": r["unit_id"], "fields": r["forbidden_fields"]}
            for r in rows if r["forbidden_fields"]],
        "unsupported_claim_review": [
            {"unit_id": r["unit_id"], "kind": r["kind"],
             "terms": r["unsupported_terms"][:12]}
            for r in completed if r["unsupported_terms"]],
        "reason_cites_evidence": sum(
            1 for r in completed if r["reason_cites_evidence"]),
        "repeated_boilerplate_descriptions": boilerplate,
    }


def _expert_review(output_dir, keyword_rows, artifact_rows):
    """The short list a person should actually read, blank ratings only."""
    picks = []
    for row in keyword_rows:
        if row["status"] != "completed":
            continue
        if (row["metrics"]["exact_hits"] == 0
                or row["metrics"]["generic_suggestions"]
                or row["duplicate_concepts"]):
            picks.append({
                "benchmark": BENCH_KEYWORDS, "unit_id": row["unit_id"],
                "kind": row["mode"],
                "ai_output": ", ".join(row["suggested_keywords"]),
                "reference": ", ".join(row["reference_tags"]),
                "why_flagged": "; ".join(filter(None, [
                    "no exact overlap with the curator's tags"
                    if row["metrics"]["exact_hits"] == 0 else "",
                    "generic keyword(s)"
                    if row["metrics"]["generic_suggestions"] else "",
                    "possible duplicate concepts"
                    if row["duplicate_concepts"] else ""])),
            })
    for row in artifact_rows:
        flags = []
        if row["type_contract_violations"]:
            flags.append("type contract violation")
        if row["forbidden_fields"]:
            flags.append("forbidden field generated")
        if row["kind"] == "chart" and row["ai_description"] \
                and not row["has_evidence"]:
            flags.append("chart caption produced without evidence")
        if row["status"] == "completed" and row["unsupported_terms"]:
            flags.append("terms absent from the evidence")
        if flags:
            picks.append({
                "benchmark": BENCH_ARTIFACTS, "unit_id": row["unit_id"],
                "kind": row["kind"], "ai_output": row["ai_description"],
                "reference": row["human_description"],
                "why_flagged": "; ".join(flags),
            })
    _write_tsv(os.path.join(output_dir, "expert-review.tsv"),
               ("benchmark", "unit_id", "kind", "why_flagged", "ai_output",
                "reference", "expert_rating", "expert_note"),
               [{**p, "expert_rating": "", "expert_note": ""}
                for p in picks[:30]])


# ---------------------------------------------------------------------- CLI

def build_parser():
    parser = argparse.ArgumentParser(
        prog="python -m project.tools.assist_eval",
        description="Read-only benchmarks for Qresp's keyword AI and RCC "
                    "artifact description AI. AI-based provisional "
                    "evaluation; never changes served behaviour.")
    sub = parser.add_subparsers(dest="command")

    collect_parser = sub.add_parser(
        "collect", help="read Qresp (dry-run unless --execute; no AI call)")
    collect_parser.add_argument("--api-base", required=True)
    collect_parser.add_argument("--output-dir", required=True)
    collect_parser.add_argument(
        "--execute", "--live", action="store_true", dest="execute",
        help="actually read the Qresp instance. Without it nothing is "
             "requested.")
    collect_parser.add_argument("--ids-file")
    collect_parser.add_argument(
        "--rcc-analyses",
        help="saved analyze-folder responses: one JSON {record_id: response} "
             "or a directory of <record_id>.json. No file server is "
             "contacted.")
    collect_parser.add_argument("--timeout", type=int, default=20)
    collect_parser.add_argument("--insecure", action="store_true")
    collect_parser.set_defaults(func=collect)

    rcc_parser = sub.add_parser(
        "collect-rcc",
        help="run the SERVING folder analysis over each record's saved "
             "fileServerPath (dry-run unless --execute; never calls Gemini)")
    rcc_parser.add_argument("--output-dir", required=True)
    rcc_parser.add_argument(
        "--execute", "--live", action="store_true", dest="execute",
        help="actually contact the file server. Without it nothing is read.")
    rcc_parser.add_argument("--limit", type=int, default=10)
    rcc_parser.add_argument(
        "--rate-limit", type=float, default=0.5,
        help="file-server requests per SECOND (not an interval)")
    rcc_parser.add_argument("--ids-file")
    rcc_parser.add_argument(
        "--refresh", action="store_true",
        help="re-read folders that already have a saved analysis")
    rcc_parser.set_defaults(func=collect_rcc)

    audit_parser = sub.add_parser("audit", help="coverage and call estimate")
    audit_parser.add_argument("--output-dir", required=True)
    audit_parser.set_defaults(func=audit)

    sample_parser = sub.add_parser("smoke-sample",
                                   help="deterministic stratified sample")
    sample_parser.add_argument("--output-dir", required=True)
    sample_parser.add_argument("--seed", type=int, default=0)
    sample_parser.add_argument("--keyword-records", type=int,
                               default=DEFAULT_KEYWORD_RECORDS)
    sample_parser.add_argument("--artifact-candidates", type=int,
                               default=DEFAULT_ARTIFACT_CANDIDATES)
    sample_parser.set_defaults(func=smoke_sample)

    run_parser = sub.add_parser("run", help="dry-run unless --execute")
    run_parser.add_argument("--output-dir", required=True)
    run_parser.add_argument("--execute", action="store_true",
                            help="actually call the provider")
    run_parser.add_argument(
        "--rate-limit", type=float, default=DEFAULT_RATE_LIMIT,
        help="provider requests per SECOND (not an interval). 0.08 is about "
             "one every 12.5s and suits a free-tier Gemini project; 1.0 is "
             "60/min and will be rate limited. Nothing is retried "
             "automatically -- on HTTP 429 wait a minute and re-run the same "
             "command, successful units are reused.")
    run_parser.add_argument("--max-calls", type=int,
                            default=HARD_CALL_CEILING)
    run_parser.set_defaults(func=run)

    summarize_parser = sub.add_parser(
        "summarize", help="re-aggregate cached answers (0 provider calls)")
    summarize_parser.add_argument("--output-dir", required=True)
    summarize_parser.set_defaults(func=summarize)
    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help()
        return 2
    # Nothing but `run --execute` may reach the provider. Installing a
    # refusing stand-in makes that structural rather than a promise.
    if not (args.command == "run" and getattr(args, "execute", False)):
        original = assist.call_gemini
        assist.call_gemini = RefusingProvider()
        try:
            return args.func(args)
        finally:
            assist.call_gemini = original
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
