"""Related Research: what else in the literature bears on this record.

One read-only endpoint (wired through swagger.yml):
- GET /api/paper/{id}/related

It answers with two independent lists:

* **Related Qresp Records** -- computed here, from the published scientific
  metadata of the active records this server holds. No external service is
  involved and no configuration is required.
* **Related External Papers** -- candidates proposed by the free Semantic
  Scholar Recommendations API, RE-RANKED by Qresp's deterministic relevance
  score. Being returned by the provider IS enough to be shown; Qresp's own
  evidence gate (the one Related Qresp Records is filtered by) is computed
  for every candidate and carried as a diagnostic, but it never removes one.
  The provider's own ranking survives too, as the tie-break when two
  candidates score identically -- it is discarded only as the PRIMARY order,
  never dropped outright.

The two lists have SEPARATE caps and SEPARATE policies, and deliberately so.

Related Qresp Records shows at most `MAX_RESULTS` (3) records from this
server's own corpus, and only the ones that PASS Qresp's evidence gate
(`relatedness.rank`).

Related External Papers asks the provider for `EXTERNAL_CANDIDATE_LIMIT`
(150) candidates, deduplicates them, scores every one that survives, and
shows the best `EXTERNAL_MAX_RESULTS` (25) by that score
(`relatedness.rerank_external`) -- laid out five to a page over at most five
pages. NOTHING is removed here for failing the evidence gate: a candidate
with weak or zero Qresp signal can still appear, typically near the tail of
the 25, because Semantic Scholar proposed it. All 0-25 come back in one
response and are cached as one entry, so turning a page in the UI is a slice
of data the browser already holds and costs no provider request.

No language model is involved anywhere in this feature. Every ordering,
threshold and "Why related" sentence comes from `project/relatedness.py`,
which is pure and unit-tested.

Nothing here writes to a Paper. Recommendations are a derived view, so they
are never pinned into the canonical record: they are recomputed (internal) or
cached separately with an expiry (external, `RelatedResearchCache`), which is
what lets a new follow-up study show up on a record published years ago. The
external cache is additionally keyed by a fingerprint of the record's public
scientific metadata, so an edit to the title or the abstract refreshes the
answer at once instead of waiting out the TTL.

Configuration is ENVIRONMENT ONLY (QRESP_RELATED_RESEARCH_*,
QRESP_RELATED_EXTERNAL_ENABLED, QRESP_SEMANTIC_SCHOLAR_*), deliberately not
`Config.get_setting`: that helper falls back to config.ini, and neither the
credential nor the switch for an external call should be configurable (or
accidentally committed) there. Both switches are OFF by default, and the
external one is subordinate to the master one -- see `config()`.

Federated records
-----------------
The Explorer can open a record that lives on ANOTHER Qresp server
(`/paperdetails/{id}?server=https://peer.example.org`). Such a record is not in
this server's database, so `?server=` is passed through to this endpoint too:
the record and the corpus it is scored against are then read from that peer via
`project/federation.py`, which is also what refuses every server that is not in
the federated registry. The peer must be an allowlisted HTTPS origin; only
allowlisted published metadata is copied out of its answer; nothing is written
to this server's database. Scoring, the evidence gate, the re-ranking, the
result caps and the external provider are the same code in both modes -- the
only difference is where the two record sets came from. That includes WHICH
list is gated: Related Qresp Records is filtered by the gate on a federated
record exactly as it is locally, and Recommended External Papers is re-ranked
without one, exactly as it is locally.

What leaves this server
-----------------------
To a federated peer: two plain GETs, `/api/paper/{id}` and `/api/search`, both
public reads carrying no credential and no user data.

To the recommendation provider, only what is needed to identify THIS paper: its
DOI, or --
when it has none -- its published title. Nothing else: no abstract, no
authors, no keywords, no RCC URL, no file path, no file content, no owner,
editor, curator or session data, and no other record. The provider host is a
fixed HTTPS constant in this file; no environment variable or request
parameter can redirect it. The API key, when configured, travels only in the
`x-api-key` header and is never logged, cached, or returned.
"""
import os
import re
from datetime import datetime, timedelta
from urllib.parse import quote

import requests

from project import federation, feedback_context, relatedcache
from project.auth import can_view_paper, get_current_user
from project.federation import FOUND, NOT_FOUND, UNAVAILABLE
from project.models import Paper, RelatedResearchCache, active_papers
from project.relatedness import MAX_RESULTS as relatedness_max_results
from project.relatedness import (CorpusStats, build_external_profile,
                                 build_internal_profile, metadata_fingerprint,
                                 normalize_doi, normalize_title_key, rank,
                                 rerank_external, tokenize)

# ---------------------------------------------------------------- provider
#
# FIXED in code. The host is not read from the environment, from config.ini,
# or from the request, so no misconfiguration can point a lookup -- or the API
# key -- at another server. Only the credential and the timeout are settable.
SEMANTIC_SCHOLAR_ORIGIN = "https://api.semanticscholar.org"
SEMANTIC_SCHOLAR_PAPER_URL = SEMANTIC_SCHOLAR_ORIGIN + "/graph/v1/paper/"
SEMANTIC_SCHOLAR_TITLE_MATCH_URL = (
    SEMANTIC_SCHOLAR_ORIGIN + "/graph/v1/paper/search/match")
SEMANTIC_SCHOLAR_RECOMMENDATIONS_URL = (
    SEMANTIC_SCHOLAR_ORIGIN + "/recommendations/v1/papers/forpaper/")
# The FALLBACK source, used only when recommendations answers with an empty
# list. "Who cited this paper" is a different question from "what is like this
# paper", and the answer is a different kind of thing -- later work building on
# it, not a similarity match -- so it is labelled differently everywhere it
# surfaces. See `SOURCE_CITATIONS`.
SEMANTIC_SCHOLAR_CITATIONS_URL_TEMPLATE = (
    SEMANTIC_SCHOLAR_ORIGIN + "/graph/v1/paper/%s/citations")
PROVIDER_NAME = "Semantic Scholar"
PROVIDER_KEY = "semantic_scholar"

# Identifies Qresp politely, exactly as the DOI importer does.
PROVIDER_HEADERS = {"User-Agent": "Qresp/2.0 (research data curation)"}

# The MINIMUM metadata the quality gate needs to judge a candidate:
# title/abstract for text similarity and shared terms, authors for the shared
# author signal, year for display and ordering, externalIds for the DOI link
# and for de-duplication, fieldsOfStudy for the "same research area" check.
# Nothing else is asked for -- no venue, no citation counts, no embeddings, no
# open-access PDFs. (The provider volunteers `openAccessPdf` alongside
# `abstract` whatever is requested; `_normalize_candidate` allowlists what is
# copied out, so it never reaches a profile, the cache, or the response.)
RECOMMENDATION_FIELDS = "title,abstract,year,authors.name,externalIds,fieldsOfStudy"
# The citations endpoint nests each candidate under `citingPaper`, so every
# field is asked for with that prefix.
#
# WRITTEN OUT, not derived from RECOMMENDATION_FIELDS by prefixing it. The two
# endpoints do not accept the same selectors, and deriving one list from the
# other hid that: `authors.name` is valid on recommendations and is REFUSED by
# citations, which answered
#
#     HTTP 400  {"error":"Unrecognized or unsupported fields: [authors.name]"}
#
# and took the whole fallback down with it. `authors` is the selector citations
# supports; it returns [{authorId, name}], which is the shape
# `_normalize_candidate` already reads, so nothing downstream changes.
#
# The SET is otherwise deliberately the same as RECOMMENDATION_FIELDS: the
# scorer needs identical inputs whichever endpoint supplied a candidate, and
# asking for more would widen what is cached for no gain. If a field is added
# to one list, check it against BOTH endpoints before adding it to the other.
CITATION_FIELDS = (
    "citingPaper.title,citingPaper.abstract,citingPaper.year,"
    "citingPaper.authors,citingPaper.externalIds,citingPaper.fieldsOfStudy")
# Resolution asks for the paper's identity and nothing else.
#
# It deliberately does NOT ask for `references.externalIds`. A live check
# against the provider showed that adding a nested `references` selector makes
# it DISCARD the whole field list and answer with its default set -- so the
# request came back with more data than was asked for (authors, openAccessPdf)
# and still no reference DOIs. Citation evidence therefore has no source here;
# see docs/product/related-research.md for the one extra call that would
# provide it.
RESOLUTION_FIELDS = "paperId,title,externalIds"

# Candidates asked of the provider. EXTERNAL ONLY -- the internal list is
# computed from this server's own corpus and never asks anybody for
# candidates.
#
# 150, not 20. A bigger pool buys COVERAGE: every one of the 150 is scored and
# ordered, none is thrown out for a low score, so a wider pool means more real
# candidates competing for the 25 display slots instead of more candidates the
# gate would have discarded anyway. It is one request per cache miss either
# way, so the cost of asking for 150 instead of 20 is a larger response body
# and nothing else.
EXTERNAL_CANDIDATE_LIMIT = 150

# Candidates asked of the CITATIONS endpoint, which is consulted only when
# recommendations answers with an empty list.
#
# The provider allows up to 1000 here. 500 is the ceiling this code uses, and
# the reason is the timeout: every entry carries an abstract, and a
# thousand-abstract body does not reliably arrive inside the 8s default
# SEMANTIC_SCHOLAR_TIMEOUT_SECONDS -- a request that times out yields NOTHING,
# which is strictly worse for the reader than one that returns 500 candidates
# for a 25-slot list. It is already twenty times the display cap, so the
# ranking pool is not what limits quality here.
EXTERNAL_CITATION_LIMIT = 500

# Which provider endpoint a result came from. This reaches the response and
# the cache, because the two are not interchangeable to a reader: a
# recommendation is "this resembles your paper", a citation is "this cites
# your paper". Labelling the second as the first would be a false claim about
# where it came from.
SOURCE_RECOMMENDATIONS = "recommendations"
SOURCE_CITATIONS = "citations"

# The candidate pool is deliberately NOT overridden: the request carries no
# `from` parameter, so the provider uses its default.
#
# Measured against the live API, and the measurement has been REVISED. An
# earlier note here concluded from two DOIs that the default pool always
# answers empty and that the external half was therefore useless for Qresp.
# That was too pessimistic, and instrumenting the pipeline is what showed it:
#
#   from=recent (the default)  ->  the provider RESOLVES the paper every time
#                                  (`resolved: true`), and then returns either
#                                  0 candidates or a full 20. Of three real
#                                  PaperStack records checked, one came back
#                                  with 20 candidates, of which 3 cleared
#                                  Qresp's gate (a fact still worth knowing
#                                  today, though it no longer decides what is
#                                  shown -- under the current policy all 20
#                                  would have been scored and ranked); the
#                                  other two came back with 0.
#   from=all-cs                ->  18-20 candidates, but from Computer
#                                  Science whatever the source paper's field.
#                                  Against a condensed-matter and a materials
#                                  -chemistry paper the best candidate scored
#                                  cosine 0.022 / 0.025 (the MODERATE bar is
#                                  0.16) and no candidate shared even three
#                                  specific terms. All 38 would score at the
#                                  very bottom of a re-ranked list today, and
#                                  in 2026 all 38 were correctly rejected by
#                                  the quality gate that then decided display.
#
# So the default pool DOES work for some Qresp records, and an empty answer
# from it is the provider's coverage, not a Qresp bug -- which is exactly what
# `REASON_PROVIDER_EMPTY` now says, instead of the reader being shown the same
# sentence as for a rate limit. `all-cs` would still buy nothing but 20
# irrelevant papers per record, so it stays off.
RECOMMENDATION_POOL = None
# Shown to the user in the INTERNAL list. Defined by the scoring module so the
# cap and the gate cannot drift apart, and never padded to reach.
#
# This is the Related Qresp Records cap and nothing else. It used to be the
# external cap too, which is why the two are now spelled out separately: the
# internal list is a handful of records from one server's own corpus, while
# the external list is drawn from the whole literature, and there is no reason
# the same number should govern both.
MAX_RESULTS = relatedness_max_results

# --------------------------------------------------- external display limits
#
# What a reader actually SEES under "Related External Papers", and how it is
# laid out. These are the external half's own numbers; changing them cannot
# touch Related Qresp Records.
#
# EVERY deduplicated candidate is scored and the cut is made last (score,
# sort, cut -- see `relatedness.rerank_external`; NOT gated, unlike
# `relatedness.rank`), so a record with fewer than EXTERNAL_MAX_RESULTS
# deduplicated candidates gets a SHORTER list -- never one padded to fill a
# page, and never one shortened because a candidate's evidence was weak.
EXTERNAL_RESULTS_PER_PAGE = 5
EXTERNAL_MAX_PAGES = 5
# Stated as the product, not as a bare 25, so the three numbers cannot drift:
# the cap IS "five per page, five pages", and the UI derives its page count
# from the same relationship.
EXTERNAL_MAX_RESULTS = EXTERNAL_RESULTS_PER_PAGE * EXTERNAL_MAX_PAGES
# The whole 0-25 comes back in ONE response and is cached as one entry, so
# turning a page is a slice of data the browser already holds. Paging must
# never cost a provider request. That the three numbers still agree with the
# UI's is pinned by a test, not by an assert here: a mismatch is a bug worth
# failing a test run over, not one worth refusing to boot over.

# A title lookup must be an unambiguous match on the paper Qresp holds; below
# this the external list is skipped entirely rather than risk recommending
# from somebody else's paper.
TITLE_MATCH_MIN_OVERLAP = 0.9

DEFAULT_TIMEOUT_SECONDS = 8
MAX_TIMEOUT_SECONDS = 30
DEFAULT_CACHE_DAYS = 7
MAX_CACHE_DAYS = 90
# A provider failure is usually transient, so it is remembered only briefly --
# long enough to stop a hot detail page from hammering a failing (or
# rate-limiting) service, short enough that recovery is quick.
FAILURE_RETRY_SECONDS = 3600

# Response statuses for the external list.
STATUS_OK = "ok"
STATUS_DISABLED = "disabled"
STATUS_UNRESOLVED = "unresolved"
STATUS_UNAVAILABLE = "unavailable"

# Outcome of one outbound call -- FOUND / NOT_FOUND / UNAVAILABLE, imported
# from project.federation, which documents the three-way split at length. The
# distinction that matters is between an ANSWER and a NON-ANSWER: a 404 is the
# provider saying "no such paper" (a stable fact about this record, cached for
# the full TTL), while a timeout, 429 or 5xx says nothing about the record and
# is remembered for an hour only.
#
# Collapsing those two was the bug: a rate-limited or timing-out provider was
# recorded as "this paper is not in the index" and kept for seven days.


class Outcome(str):
    """An outcome that also remembers WHY, without changing what it is.

    `outcome == UNAVAILABLE` still works everywhere, because this is a `str`
    subclass carrying the same value; `outcome.detail` additionally says
    whether that non-answer was a 429, a timeout or something else.

    That distinction is the point: "Related External Papers is empty" has
    several different causes -- the provider had nothing, nothing survived
    normalization and de-duplication, the paper is not in the index, we were
    rate limited, the provider never answered -- and a reader was shown one
    sentence for all of them. (An empty list can no longer mean "the gate
    rejected everything that came back": under the current policy nothing is
    removed between de-duplication and the display cap.)
    """
    detail = ""

    def __new__(cls, value, detail=""):
        outcome = super(Outcome, cls).__new__(cls, value)
        outcome.detail = detail
        return outcome


def outcome_detail(outcome):
    return getattr(outcome, "detail", "") or ""


# Why the external list is what it is. `status` is what the UI switches on;
# `reason` is the diagnosis, and the two are NOT interchangeable --
# `provider_returned_no_candidates` and `no_valid_candidates_after_dedupe`
# are both a perfectly healthy `ok`.
REASON_OK = "ok"
REASON_PROVIDER_EMPTY = "provider_returned_no_candidates"
# Replaces the old `all_candidates_below_quality_gate`. Under the current
# policy the gate cannot empty this list any more -- nothing here is ever
# removed for failing `assess()` -- so the ONLY way a non-empty provider
# answer still ends up with zero results is that nothing survived
# normalization and de-duplication: every entry lacked a usable title, was
# this paper itself, or repeated another entry. `REASON_ALL_FILTERED` name
# retired along with the behaviour it described; a stored value of the old
# string is simply a cache miss (see ALGORITHM_VERSION) rather than something
# this module still has to interpret.
REASON_NO_VALID_CANDIDATES = "no_valid_candidates_after_dedupe"
REASON_SOURCE_UNRESOLVED = "source_paper_not_in_provider_index"
REASON_RATE_LIMITED = "provider_rate_limited"
REASON_TIMEOUT = "provider_timeout"
REASON_PROVIDER_ERROR = "provider_error"
REASON_DISABLED = "disabled"

# HTTP/transport detail -> the reason it maps to.
_DETAIL_REASONS = {
    "rate_limited": REASON_RATE_LIMITED,
    "timeout": REASON_TIMEOUT,
}

# Bumped whenever a change here or in relatedness.py could change what a
# reader is shown. It is part of every cache key, so a deployment that
# tightens the quality gate stops serving answers computed under the old one
# -- including the weak and empty ones, which are exactly the entries a
# tightening is meant to correct.
#
#   1  original gate: five results, a shared author counted as evidence,
#      any rare word counted as a "specific research term"
#   2  topic-only gate, technical-term vocabulary, three results
#   3  term provenance: a plain word must come from a title or a curated tag
#   4  external list widened to 150 candidates and up to 25 results, paginated
#      five to a page. An entry written under 3 holds at most three external
#      results chosen from a 20-candidate pool; serving it as if it were the
#      new behaviour would show a reader a one-page list and call it the
#      whole answer.
#   5  external results are RE-RANKED, not gated: Qresp's evidence gate no
#      longer removes a Semantic Scholar candidate from Recommended External
#      Papers, only orders it (relatedness.rerank_external). An entry written
#      under 4 holds only the candidates that happened to pass the OLD gate,
#      which is a materially different -- and narrower -- list than this
#      policy produces; serving it would show a reader a stale, gate-filtered
#      answer under the new contract. Related Qresp Records is UNCHANGED by
#      this bump: it is still gated and still capped at three, and its
#      in-process federated cache entries are invalidated only because the
#      version they share with the external cache moved, not because
#      anything about how they are computed did.
#   6  a paper the recommendations endpoint has NOTHING for now falls back to
#      the citations endpoint -- later work citing it -- re-ranked by the same
#      score and labelled as a different source. An entry written under 5
#      recorded that emptiness as final, with `provider_returned_no_candidates`
#      and no results; serving it would keep showing an empty list for a paper
#      this policy can now answer. The bump is also what keeps the two sources
#      out of each other's cache: an entry carries the `source_kind` it was
#      built from, and one written before that field existed cannot be
#      mistaken for either.
#   7  the citations fallback now records what it did even when it found
#      nothing or failed (`pipeline.fallback`). An entry written under 6 for
#      a paper with no recommendations carries no trace of whether the
#      fallback was tried, so "the provider has no citing papers either" and
#      "the citations request timed out" are indistinguishable in it --
#      exactly the diagnosis this field exists to make possible. Re-asking is
#      the only way to find out which it was.
ALGORITHM_VERSION = "7"

# ------------------------------------------------------------------- caching
#
# See project/relatedcache.py for why none of this is persisted.

# A computed response. Short, because it is cheap to rebuild and because the
# whole point of the feature is that a NEW record shows up on an old one.
RESULT_TTL_SECONDS = 300
# ...followed by a window in which the previous answer is still served while a
# fresh one is computed behind it. A reader never waits for a peer.
RESULT_STALE_TTL_SECONDS = 3600

# A peer's copy of one record. Longer than the response: published metadata
# changes rarely, and the fingerprint check still catches an edit.
REMOTE_RECORD_TTL_SECONDS = 900
# A peer's whole corpus. This is the expensive read -- every active record on
# that server -- and it is what a reader pressing reload used to pay for
# twice per view.
REMOTE_CORPUS_TTL_SECONDS = 900

# A provider or peer failure is remembered just long enough to stop a hot
# detail page turning one outage into a request storm, and no longer: a
# reader who retries after a minute must get a real attempt.
NEGATIVE_TTL_SECONDS = 45

_result_cache = relatedcache.TTLCache()
_remote_record_cache = relatedcache.TTLCache()
_remote_corpus_cache = relatedcache.TTLCache(max_entries=16)
_result_flight = relatedcache.SingleFlight()
# At most one BACKGROUND refresh per key, and a cooldown after one fails.
_refresh_guard = relatedcache.RefreshGuard()


def reset_caches():
    """Drop every in-process cache. For tests and for `__main__` reloads;
    never called on a request path."""
    _result_cache.clear()
    _remote_record_cache.clear()
    _remote_corpus_cache.clear()
    _refresh_guard.clear()


# ------------------------------------------------------------ configuration

def _truthy(value):
    return str(value or "").strip().lower() in ("1", "true", "yes", "on")


def _env(key):
    # ENVIRONMENT ONLY -- see the module docstring.
    return os.environ.get("QRESP_" + key)


def _int_env(key, default, ceiling):
    try:
        value = int(str(_env(key)).strip())
    except (TypeError, ValueError):
        return default
    if value <= 0:
        return default
    return min(value, ceiling)


def config():
    """Effective configuration. Read per request so a deployment can flip the
    feature without a restart, and so tests can patch the environment.

    Two switches, not one. The internal list is local computation over records
    this server already holds; the external list is an outbound call to a
    third party. Those are different decisions -- an operator may well want
    Related Qresp Records on and no outbound traffic at all -- so they are
    separate variables. EXTERNAL is subordinate: the master switch off means
    the section does not exist, and nothing under it can turn itself on.
    """
    enabled = _truthy(_env("RELATED_RESEARCH_ENABLED"))
    return {
        "ENABLED": enabled,
        # Never true on its own: setting only the external variable must not
        # produce outbound requests from a server whose operator never
        # enabled the feature.
        "EXTERNAL_ENABLED": enabled and _truthy(_env("RELATED_EXTERNAL_ENABLED")),
        # Optional. Semantic Scholar serves this API without a key at a lower
        # rate limit; a key raises it. Its absence must never break the page,
        # and never disables the internal list.
        "API_KEY": (_env("SEMANTIC_SCHOLAR_API_KEY") or "").strip(),
        "TIMEOUT": _int_env("SEMANTIC_SCHOLAR_TIMEOUT_SECONDS",
                            DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS),
        "CACHE_DAYS": _int_env("RELATED_RESEARCH_CACHE_DAYS",
                               DEFAULT_CACHE_DAYS, MAX_CACHE_DAYS),
    }


def _provider_headers(cfg):
    """Request headers. The credential is sent ONLY as `x-api-key`, and only
    when one is configured -- never in a query string, a URL, or a body, where
    it would land in an access log."""
    headers = dict(PROVIDER_HEADERS)
    if cfg["API_KEY"]:
        headers["x-api-key"] = cfg["API_KEY"]
    return headers


# ------------------------------------------------------------- provider I/O

def _get(url, cfg, params=None):
    """One bounded GET. Returns (payload, outcome).

    A 404 is the provider ANSWERING "no such paper" and comes back as
    NOT_FOUND. Everything else that goes wrong -- timeout, connection error,
    429, 5xx, an unreadable body, a body of the wrong type -- is UNAVAILABLE:
    the provider did not answer, so nothing may be concluded about the record.

    Provider error bodies and headers are never returned or logged; only the
    failure kind and the status code are, so a key can never reach a log line.
    """
    try:
        response = requests.get(url, params=params or {},
                                headers=_provider_headers(cfg),
                                timeout=cfg["TIMEOUT"])
    except Exception as e:
        kind = type(e).__name__
        print("Related research provider unreachable: %s" % kind)
        # A timeout is worth telling apart from a refused connection: one says
        # "too slow", the other "not there", and an operator reads them
        # differently. Matched on the class name so no `requests` exception
        # type has to be imported here.
        detail = "timeout" if "Timeout" in kind else "unreachable"
        return None, Outcome(UNAVAILABLE, detail)
    if response.status_code == 404:
        return None, Outcome(NOT_FOUND, "not_indexed")
    if response.status_code != 200:
        print("Related research provider error: HTTP %s"
              % response.status_code)
        detail = ("rate_limited" if response.status_code == 429
                  else "http_%d" % response.status_code)
        return None, Outcome(UNAVAILABLE, detail)
    try:
        payload = response.json()
    except Exception:
        print("Related research provider returned an unreadable response")
        return None, Outcome(UNAVAILABLE, "unreadable_body")
    # All three provider endpoints document a JSON OBJECT. Anything else is a
    # shape this code cannot read, and reading it as "no match" would cache a
    # non-answer as a fact.
    if not isinstance(payload, dict):
        print("Related research provider returned an unexpected shape")
        return None, Outcome(UNAVAILABLE, "unexpected_shape")
    return payload, Outcome(FOUND, "ok")


def _title_overlap(left, right):
    """Token overlap of two titles, 0..1. Used to refuse a title lookup that
    landed on a different paper."""
    left_tokens = set(tokenize(left))
    right_tokens = set(tokenize(right))
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / float(
        max(len(left_tokens), len(right_tokens)))


def resolve_provider_paper(title, doi, cfg):
    """Identify THIS paper at the provider.

    DOI first: a DOI is exact, so `DOI:<doi>` needs no confirmation. Without
    one, the provider's official title-match endpoint is used and the answer
    is checked against the stored title here -- an approximate match is
    treated as "not found", because recommendations for the wrong paper are
    worse than none.

    Returns (paper_id, outcome), where outcome is FOUND, NOT_FOUND (the
    provider answered and this paper is not in its index, or the match was not
    close enough to trust) or UNAVAILABLE (the provider did not answer). Both
    lookup paths report all three.
    """
    if doi:
        # The slash stays literal: a DOI is written `DOI:10.1000/xyz` in the
        # path, and percent-encoding it (`%2F`) is not what the provider --
        # or an intermediate proxy -- routes on.
        payload, outcome = _get(
            SEMANTIC_SCHOLAR_PAPER_URL + "DOI:" + quote(doi, safe="/"),
            cfg, {"fields": RESOLUTION_FIELDS})
        if outcome == UNAVAILABLE:
            return None, outcome
        if outcome == NOT_FOUND or not isinstance(payload, dict):
            return None, NOT_FOUND
        if not payload.get("paperId"):
            # A well-formed answer that names no paper is an answer.
            return None, NOT_FOUND
        return str(payload["paperId"]), FOUND

    if not title:
        # Nothing to identify this record with. Not a provider problem.
        return None, NOT_FOUND

    payload, outcome = _get(SEMANTIC_SCHOLAR_TITLE_MATCH_URL, cfg,
                            {"query": title, "fields": RESOLUTION_FIELDS})
    if outcome == UNAVAILABLE:
        return None, outcome
    if outcome == NOT_FOUND or not isinstance(payload, dict):
        # The title-match endpoint answers 404 when nothing matches.
        return None, NOT_FOUND
    matches = payload.get("data")
    if not matches or not isinstance(matches, list):
        return None, NOT_FOUND
    match = matches[0] or {}
    if not isinstance(match, dict) or not match.get("paperId"):
        return None, NOT_FOUND
    if _title_overlap(title, match.get("title")) < TITLE_MATCH_MIN_OVERLAP:
        # Confidently wrong is worse than silent: skip the external list.
        return None, NOT_FOUND
    return str(match["paperId"]), FOUND


def _normalize_candidate(raw, provider_rank=None):
    """Provider result -> the plain dict `build_external_profile` reads.
    Everything else in the payload is dropped here.

    `provider_rank` is the candidate's 0-based position in the provider's own
    answer. It is DIAGNOSTIC ONLY: `build_external_profile` does not read it,
    `_result` does not copy it into the response or the cache, and nothing in
    `relatedness.py` can see it. It is carried so an offline evaluation can
    ask "where in the provider's list did the papers Qresp shows come from?"
    without a second request.

    It is deliberately not the provider's SCORE, which is proprietary and is
    not requested at all, and it is never evidence: being ranked first by
    somebody else is not a reason Qresp can name to a reader.
    """
    if not isinstance(raw, dict):
        return None
    title = re.sub(r"\s+", " ", str(raw.get("title") or "")).strip()
    if not title:
        return None
    doi = normalize_doi((raw.get("externalIds") or {}).get("DOI"))
    year = raw.get("year")
    try:
        year = int(year) if year is not None else None
    except (TypeError, ValueError):
        year = None
    paper_id = str(raw.get("paperId") or "").strip()
    # An HTTPS DOI link is preferred; the provider's own page is the fallback
    # for the (rare) candidate that has no DOI at all.
    if doi:
        url = "https://doi.org/%s" % doi
    elif paper_id:
        url = "https://www.semanticscholar.org/paper/%s" % paper_id
    else:
        url = ""
    return {
        "key": paper_id or doi or title,
        "provider_rank": provider_rank,
        "title": title,
        "abstract": str(raw.get("abstract") or ""),
        "year": year,
        "doi": doi,
        "url": url,
        "authors": [str((a or {}).get("name") or "").strip()
                    for a in (raw.get("authors") or [])
                    if str((a or {}).get("name") or "").strip()],
        "fields": [str(f).strip() for f in (raw.get("fieldsOfStudy") or [])
                   if str(f or "").strip()],
    }


def fetch_external_candidates(paper_id, cfg, pool=None):
    """At most EXTERNAL_CANDIDATE_LIMIT recommendations for `paper_id`.

    Returns (candidates, outcome, raw_count) with the same three-way outcome
    split as the lookup: a 404 here means the provider has nothing to
    recommend for this paper (NOT_FOUND, a stable fact), while a timeout,
    429, 5xx or a 200 that does not carry `recommendedPapers` means it did not
    answer (UNAVAILABLE).

    `raw_count` is how many entries the provider's answer actually held,
    bounded to EXTERNAL_CANDIDATE_LIMIT, BEFORE `_normalize_candidate` drops
    anything unusable (no title). It is always 0 when `candidates` is None.
    This is what lets the pipeline tell "the provider sent nothing" apart
    from "the provider sent things, none of them usable" -- `len(candidates)`
    alone cannot, because it is already past that filter.

    `pool` overrides the candidate pool for ONE call. Serving traffic never
    passes it -- the module constant governs there. It exists so the offline
    evaluation CLI can compare pools through this exact function instead of
    reimplementing the request, which would let the thing being measured
    drift away from the thing being served.
    """
    params = {"fields": RECOMMENDATION_FIELDS,
              "limit": EXTERNAL_CANDIDATE_LIMIT}
    pool = pool or RECOMMENDATION_POOL
    if pool:
        params["from"] = pool
    payload, outcome = _get(
        SEMANTIC_SCHOLAR_RECOMMENDATIONS_URL + quote(paper_id, safe=""),
        cfg, params)
    if outcome != FOUND:
        return None, outcome, 0
    raw = payload.get("recommendedPapers") if isinstance(payload, dict) else None
    if not isinstance(raw, list):
        # A 200 without the documented key is not an answer this endpoint can
        # read; treating it as "no recommendations" would cache a lie.
        print("Related research provider returned an unexpected shape")
        return None, Outcome(UNAVAILABLE, "unexpected_shape"), 0
    # No more than EXTERNAL_CANDIDATE_LIMIT are processed however many the
    # provider volunteers: `limit` is a request, and the bound has to hold on
    # what actually came back.
    raw = raw[:EXTERNAL_CANDIDATE_LIMIT]
    candidates = []
    for position, item in enumerate(raw):
        candidate = _normalize_candidate(item, provider_rank=position)
        if candidate:
            candidates.append(candidate)
    return candidates, Outcome(FOUND, "ok"), len(raw)


def fetch_external_citations(paper_id, cfg):
    """Papers that CITE `paper_id`, as external candidates.

    The fallback for a paper the recommendations endpoint has nothing for --
    which happens, and is not a Qresp defect: a recent or narrow paper can be
    absent from the recommender's neighbourhood while still having later work
    built on it.

    Same (candidates, outcome, raw_count) contract as
    `fetch_external_candidates`, and the same three-way outcome split, so the
    caller treats a failure here exactly as it treats one there.

    The response nests each candidate under `citingPaper`; an entry whose
    `citingPaper` is missing or is not an object is skipped rather than
    guessed at. `provider_rank` is the provider's own order, kept as the
    tie-break only -- the citations endpoint returns no score, and inventing
    one from citation counts would be a ranking signal nobody asked for.
    """
    params = {"fields": CITATION_FIELDS, "limit": EXTERNAL_CITATION_LIMIT}
    payload, outcome = _get(
        SEMANTIC_SCHOLAR_CITATIONS_URL_TEMPLATE % quote(paper_id, safe=""),
        cfg, params)
    if outcome != FOUND:
        return None, outcome, 0
    raw = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(raw, list):
        # A 200 without the documented key is not an answer this endpoint can
        # read; treating it as "no citations" would cache a lie.
        print("Related research citations returned an unexpected shape")
        return None, Outcome(UNAVAILABLE, "unexpected_shape"), 0
    raw = raw[:EXTERNAL_CITATION_LIMIT]
    candidates = []
    for position, item in enumerate(raw):
        citing = item.get("citingPaper") if isinstance(item, dict) else None
        if not isinstance(citing, dict):
            continue
        candidate = _normalize_candidate(citing, provider_rank=position)
        if candidate:
            candidates.append(candidate)
    return candidates, Outcome(FOUND, "ok"), len(raw)


def dedupe_candidates(candidates, current_doi, current_title):
    """Drop the paper itself, repeats, and anything unusable.

    Removed: results with no title, the current paper (by DOI or by title),
    a DOI already seen, and a title already seen. Order is preserved so the
    de-duplication is deterministic and testable.
    """
    current_doi = normalize_doi(current_doi)
    current_title_key = normalize_title_key(current_title)
    seen_dois = set()
    seen_titles = set()
    kept = []
    for candidate in candidates or []:
        title = (candidate.get("title") or "").strip()
        if not title:
            continue
        doi = normalize_doi(candidate.get("doi"))
        title_key = normalize_title_key(title)
        if current_doi and doi and doi == current_doi:
            continue
        if current_title_key and title_key == current_title_key:
            continue
        if doi and doi in seen_dois:
            continue
        if title_key and title_key in seen_titles:
            continue
        if doi:
            seen_dois.add(doi)
        if title_key:
            seen_titles.add(title_key)
        kept.append(candidate)
    return kept


# -------------------------------------------------------------------- cache

def _utcnow():
    return datetime.utcnow()


def _load_cache(paper_id):
    try:
        return RelatedResearchCache.objects(paper_id=str(paper_id)).first()
    except Exception as e:  # a cache problem must never break the page
        print("Related research cache read failed: %s" % type(e).__name__)
        return None


def _store_cache(paper_id, status, results, cfg, fingerprint, previous=None,
                 reason=REASON_OK, pipeline=None,
                 source_kind=SOURCE_RECOMMENDATIONS):
    """Persist the external outcome. Only the RE-RANKED candidates' public
    bibliographic metadata (not gate-passing: see ALGORITHM_VERSION history),
    the reasons Qresp computed, and the metadata fingerprint are written --
    never the API key, a request header, a provider error body, or anything
    about the user.

    How long it is kept is decided HERE, by what the provider actually said:

    * `ok` / `unresolved` are answers, and keep the full TTL.
    * `unavailable` is a non-answer. It keeps the last successful results (so
      they can still be served, marked stale) but expires within the hour, so
      a passing outage costs an hour of freshness, not a week.
    """
    now = _utcnow()
    if status == STATUS_OK:
        expires_at = now + timedelta(days=cfg["CACHE_DAYS"])
        last_success_at = now
        stored = results
    elif status == STATUS_UNRESOLVED:
        # Not being in the provider's index is a stable fact, not a blip.
        expires_at = now + timedelta(days=cfg["CACHE_DAYS"])
        last_success_at = previous.last_success_at if previous else None
        stored = list(previous.results) if previous else []
    else:
        expires_at = now + timedelta(seconds=FAILURE_RETRY_SECONDS)
        last_success_at = previous.last_success_at if previous else None
        stored = list(previous.results) if previous else []
    try:
        RelatedResearchCache.objects(paper_id=str(paper_id)).update_one(
            set__provider=PROVIDER_KEY,
            set__status=status,
            set__results=stored,
            set__fingerprint=fingerprint,
            set__algorithm_version=ALGORITHM_VERSION,
            set__reason=reason,
            set__pipeline=pipeline or {},
            set__source_kind=source_kind,
            set__fetched_at=now,
            set__last_success_at=last_success_at,
            set__expires_at=expires_at,
            upsert=True)
    except Exception as e:
        print("Related research cache write failed: %s" % type(e).__name__)
    return stored


def _cache_is_usable(entry, fingerprint, now):
    """A cache entry may be served only when it is BOTH unexpired AND about
    the record as it stands now.

    An entry written before the fingerprint field existed has none, so it can
    never match: legacy documents degrade to a miss and are rewritten on the
    next request. That is the whole migration.

    The same is true of the algorithm version. An answer computed under an
    older set of rules describes a product that no longer exists -- whether
    the change tightened the internal gate or, as with this feature's move
    from gating external results to re-ranking them, widened what external
    shows -- and the entries that matter most here are exactly the ones a
    version bump is meant to stop serving.
    """
    if entry is None or not entry.expires_at or entry.expires_at <= now:
        return False
    if entry.algorithm_version != ALGORITHM_VERSION:
        return False
    return bool(entry.fingerprint) and entry.fingerprint == fingerprint


def _section_from_entry(entry):
    """Serve a cache entry. Results carried over from an earlier success under
    a non-`ok` status ARE stale, and must say so -- this is the same promise
    the refresh path makes, kept for the hour a failure is remembered."""
    results = list(entry.results or [])
    status = entry.status or STATUS_OK
    # A cached answer explains itself exactly as the live one did. An entry
    # written before `pipeline` existed simply has none: the counts are
    # omitted rather than invented, and the next real refresh fills them in.
    return _external_section(status, results,
                             stale=(status != STATUS_OK and bool(results)),
                             updated_at=entry.last_success_at,
                             reason=entry.reason or None,
                             pipeline=entry.pipeline or None,
                             source_kind=(entry.source_kind
                                          or SOURCE_RECOMMENDATIONS))


# ------------------------------------------------------- recommendation core

def _display_authors(names, limit=8):
    names = [n for n in names or [] if n]
    if len(names) > limit:
        return ", ".join(names[:limit]) + " et al."
    return ", ".join(names)


def _result(profile, assessment, source, server=None,
            source_kind=None):
    return {
        "id": profile.key if source == "internal" else None,
        "title": profile.title,
        "authors": _display_authors(profile.authors),
        "year": profile.year,
        "doi": profile.doi or None,
        "url": profile.url or None,
        "source": source,
        # WHICH Qresp server holds this record. Empty means "the one that
        # answered", which is what every result meant before federation; a
        # federated result names its origin so the link goes back to the
        # server the record actually lives on, not to this one, where the id
        # would resolve to nothing (or, worse, to a different record).
        # External results belong to no Qresp server and say so with None.
        "server": (server or "") if source == "internal" else None,
        # WHICH provider endpoint proposed this. Only external results have
        # one, and the UI labels them differently: "Recommended by Semantic
        # Scholar" is a false claim about a paper that merely cites this one.
        "source_kind": source_kind if source == "external" else None,
        "reasons": assessment.reasons(3),
    }


def internal_recommendations(current_record, corpus_records,
                             citation_dois=frozenset(), server=None):
    """Related Qresp Records for `current_record`.

    `corpus_records` are the active/published records (the current one
    included, so corpus rarity is measured over everything this server
    holds). The current record is never recommended to itself.

    `server` is the origin those records came from: None/empty for this
    server's own corpus, a canonical origin when they were read from a
    federated peer. It only ever labels the results; the scoring is identical.
    """
    current = build_internal_profile(current_record)
    profiles = [build_internal_profile(record) for record in corpus_records]
    stats = CorpusStats(profiles)
    candidates = [p for p in profiles if p.key and p.key != current.key]
    ranked = rank(current, candidates, stats, citation_dois, MAX_RESULTS)
    return [_result(profile, assessment, "internal", server)
            for profile, assessment in ranked], stats


def external_recommendations(current_record, candidates, stats,
                             citation_dois=frozenset(),
                             limit=EXTERNAL_MAX_RESULTS,
                             source_kind=SOURCE_RECOMMENDATIONS):
    """Re-rank the provider's candidates by Qresp's deterministic score.

    UNLIKE `internal_recommendations`, this never applies Qresp's evidence
    gate as a filter: every deduplicated candidate is scored
    (`relatedness.rerank_external`) and ordered best-first, provider rank as
    the tie-break, and nothing is dropped for failing `assess()`. Rarity is
    still measured against the Qresp corpus, so "specific" means the same
    thing it means for Related Qresp Records -- only what happens with a LOW
    score differs: here it still gets a slot, just a late one.

    `limit=None` returns EVERY scored candidate, still in order, so the
    caller can report how many there were before the display cap was applied.
    The default is unchanged, so other callers keep the capped list they
    already expect.
    """
    current = build_internal_profile(current_record)
    profiles = [build_external_profile(candidate) for candidate in candidates]
    if limit is None:
        limit = len(profiles)
    ranked = rerank_external(current, profiles, stats, citation_dois, limit)
    return [_result(profile, assessment, "external", source_kind=source_kind)
            for profile, assessment in ranked]


# ----------------------------------------------------------------- endpoint

def _record_dict(paper):
    data = paper.to_mongo().to_dict()
    data["_id"] = str(paper.id)
    return data


def _external_section(status, results, stale=False, updated_at=None,
                      reason=None, pipeline=None,
                      source_kind=SOURCE_RECOMMENDATIONS):
    """One external section.

    `reason` and `pipeline` are the answer to "why is this empty?". The UI
    switches on `status` alone -- the contract it had before is unchanged --
    but an operator reading the response, or the QA CLI, can now tell a rate
    limit from an empty index from a provider answer that had nothing usable
    in it once duplicates and unusable entries were removed.

    `pipeline` counts what survived each stage. Counts only: no title, no
    abstract, no provider body, no key.
    """
    section = {
        "status": status,
        "provider": PROVIDER_NAME,
        "results": results,
        "count": len(results),
        "stale": bool(stale),
        "updated_at": updated_at.isoformat() if updated_at else None,
        "reason": reason or (REASON_OK if status == STATUS_OK
                             else REASON_DISABLED),
        # WHICH endpoint the results came from. The UI labels a citation
        # differently from a recommendation, because it IS different: one
        # resembles the paper, the other cites it.
        "source_kind": source_kind,
    }
    if pipeline is not None:
        section["pipeline"] = pipeline
    return section


def _fallback_status(outcome):
    """How the citations request went, as one short code.

    Six values, because they call for different responses and collapsing them
    is what let a real defect hide for a release:

      ok               candidates came back (possibly zero of them)
      not_found        the provider has no record of this paper
      invalid_request  QRESP SENT A BAD REQUEST -- a 4xx that is not 404 and
                       not 429. Nothing about the paper, the network or the
                       provider's health; a bug here. This is the one that
                       was being reported as "unavailable", which reads as
                       "the provider is having trouble" and sent the first
                       look in the wrong direction entirely.
      rate_limited     429, ours to back off from
      malformed        a 200 this code cannot read
      unavailable      a timeout, a connection failure, or a 5xx

    A code, never the provider's message: the body may quote the request and
    is not shown to a browser or written to a log.
    """
    if outcome == FOUND:
        return "ok"
    if outcome == NOT_FOUND:
        return "not_found"
    detail = outcome_detail(outcome)
    if detail in ("unexpected_shape", "unreadable_body"):
        return "malformed"
    if detail == "rate_limited":
        return "rate_limited"
    if detail.startswith("http_"):
        try:
            status = int(detail.split("_", 1)[1])
        except (IndexError, ValueError):
            return "unavailable"
        # 4xx is Qresp's fault, 5xx is the provider's. Telling them apart is
        # the difference between "read our request" and "wait and retry".
        if 400 <= status < 500:
            return "invalid_request"
    return "unavailable"


def _pipeline(resolved=False, provider_status="", raw=0, valid=0,
              after_dedupe=0, scored=0, shown=0,
              source_kind=SOURCE_RECOMMENDATIONS, fallback=None):
    """Where the candidates went. Requirement B, one dict.

    Every "External Papers is empty" report has to be answerable from these
    numbers alone:

      resolved         did the provider recognise THIS paper at all?
      provider_status  found / not_found / unavailable, from the provider
      raw_candidates   entries the provider proposed (at most 150), before
                       normalization
      valid_candidates ...minus anything `_normalize_candidate` could not use
                       (no title)
      after_dedupe     ...minus this paper itself and repeats
      scored_candidates
                       every deduplicated candidate, scored -- ALWAYS equal
                       to after_dedupe under the current policy, because
                       nothing is removed for failing the evidence gate. The
                       equality is not a coincidence to simplify away: it is
                       the visible proof that the gate did not filter this
                       list. (Related Qresp Records has no such field --
                       there, "scored" and "passed" are different counts by
                       design.)
      shown            ...capped at EXTERNAL_MAX_RESULTS (25), so
                       0 <= shown <= 25 and shown <= scored_candidates

    `shown` is the external list's own count. It has nothing to say about
    Related Qresp Records, which is not built from provider candidates and has
    no pipeline.
    """
    return {"resolved": bool(resolved), "provider_status": provider_status,
            "raw_candidates": raw, "valid_candidates": valid,
            "after_dedupe": after_dedupe, "scored_candidates": scored,
            "shown": shown,
            # WHICH endpoint the counts above describe. Without it a reader of
            # the pipeline cannot tell a 0-recommendation paper whose
            # citations filled the list from one the recommender answered.
            "source_kind": source_kind,
            # Present ONLY when the citations fallback was actually tried,
            # which happens only when recommendations answered with nothing.
            # Absent means it was never reached -- never "it was tried and
            # came back empty", which is what this used to be confused with.
            **({"fallback": fallback} if fallback is not None else {})}


def _external_for(paper_id, current_record, stats, cfg):
    """The external list, honouring the cache.

    A cache entry is served -- without calling the provider -- only when it
    has not expired AND its fingerprint still matches the record's public
    scientific metadata. Otherwise the provider is asked again, and the
    provider's own answer decides what is recorded:

        NOT_FOUND    -> `unresolved`, kept for the full TTL
        UNAVAILABLE  -> `unavailable`, kept for an hour, previous results
                        served marked `stale`
        FOUND        -> `ok`, fresh results, full TTL
    """
    entry = _load_cache(paper_id)
    now = _utcnow()
    fingerprint = metadata_fingerprint(current_record)
    if _cache_is_usable(entry, fingerprint, now):
        return _section_from_entry(entry)

    def failed(status, reason, pipeline):
        stored = _store_cache(paper_id, status, [], cfg, fingerprint, entry,
                              reason=reason, pipeline=pipeline)
        return _external_section(
            status, list(stored),
            # Results only ever survive here from an EARLIER success.
            stale=bool(stored),
            updated_at=entry.last_success_at if entry else None,
            reason=reason, pipeline=pipeline)

    reference = current_record.get("reference") or {}
    doi = normalize_doi(reference.get("DOI"))
    title = str(reference.get("title") or "").strip()

    provider_paper_id, outcome = resolve_provider_paper(title, doi, cfg)
    if outcome == UNAVAILABLE:
        # The provider did not answer. Which way it failed decides what the
        # reader is told and how long it is remembered.
        reason = _DETAIL_REASONS.get(outcome_detail(outcome),
                                     REASON_PROVIDER_ERROR)
        return failed(STATUS_UNAVAILABLE, reason,
                      _pipeline(provider_status=UNAVAILABLE))
    if outcome != FOUND or not provider_paper_id:
        # The provider answered, and this paper is not in its index. A fact
        # about the record, not a malfunction.
        return failed(STATUS_UNRESOLVED, REASON_SOURCE_UNRESOLVED,
                      _pipeline(provider_status=NOT_FOUND))

    candidates, outcome, raw_count = fetch_external_candidates(
        provider_paper_id, cfg)
    if outcome == UNAVAILABLE:
        reason = _DETAIL_REASONS.get(outcome_detail(outcome),
                                     REASON_PROVIDER_ERROR)
        return failed(STATUS_UNAVAILABLE, reason,
                      _pipeline(resolved=True, provider_status=UNAVAILABLE))
    if outcome != FOUND or candidates is None:
        return failed(STATUS_UNRESOLVED, REASON_SOURCE_UNRESOLVED,
                      _pipeline(resolved=True, provider_status=NOT_FOUND))

    source_kind = SOURCE_RECOMMENDATIONS
    # The FALLBACK, and its trigger is deliberately narrow: recommendations
    # ANSWERED, and answered with exactly nothing. A failure does not come
    # here (it returned above), and neither does a non-empty answer, however
    # weak -- the recommendations pool stays the primary source and is never
    # topped up or blended.
    #
    # This is not a defect workaround. A recent or narrowly-scoped paper can
    # be absent from the recommender's neighbourhood while still having later
    # work that cites it, and that later work is a real, checkable answer to
    # "what should I read next" -- just a different kind of answer, which is
    # why it is labelled differently rather than folded in silently.
    fallback = None
    if raw_count == 0:
        citing, citation_outcome, citation_raw = fetch_external_citations(
            provider_paper_id, cfg)
        citing = citing or []
        # RECORDED WHATEVER HAPPENS.
        #
        # The bug this fixes: a fallback that returned nothing, or failed,
        # left no trace at all. The response then looked exactly like one
        # from a build with no fallback in it -- raw_candidates 0,
        # source_kind recommendations -- so "we asked and the provider had no
        # citations either" was indistinguishable from "we never asked", and
        # a citations outage was invisible.
        #
        # `raw` and `valid` are deliberately separate. A non-zero raw with a
        # zero valid means the provider sent entries that carried no usable
        # title, which is a normalization problem worth seeing; a zero raw
        # means the provider genuinely has no citing papers on file.
        fallback = {
            "attempted": True,
            "source_kind": SOURCE_CITATIONS,
            "status": _fallback_status(citation_outcome),
            "raw_candidates": citation_raw,
            "valid_candidates": len(citing),
            # Filled in below IF this fallback is the one that produced the
            # list; otherwise nothing reached these stages and 0 is the truth.
            "after_dedupe": 0,
            "shown": 0,
        }
        # A failed fallback must not turn an ANSWER ("nobody recommends this")
        # into a FAILURE. The recommendations answer stands, the status above
        # records exactly how the fallback went, and the reader is told the
        # accurate, narrower thing.
        if citation_outcome == FOUND and citing:
            candidates = citing
            raw_count = citation_raw
            source_kind = SOURCE_CITATIONS

    valid_count = len(candidates)
    candidates = dedupe_candidates(candidates, doi, title)
    after_dedupe = len(candidates)
    # No citation source is wired (see RESOLUTION_FIELDS): the citation family
    # simply never fires, rather than being inferred from something weaker.
    #
    # EVERY deduplicated candidate is scored, and only then is the list cut to
    # EXTERNAL_MAX_RESULTS -- nothing is dropped in between for failing
    # Qresp's evidence gate. `scored` and `after_dedupe` are therefore the
    # SAME number below, by construction; that equality is what proves this
    # policy to anyone reading the pipeline rather than the source.
    #
    # The cut is the EXTERNAL cap, not the internal one. Nothing is added to
    # reach it: 25 is a ceiling on what was scored, never a target.
    scored = external_recommendations(current_record, candidates, stats,
                                      limit=None, source_kind=source_kind)
    results = scored[:EXTERNAL_MAX_RESULTS]
    if fallback is not None and source_kind == SOURCE_CITATIONS:
        # The fallback IS the list, so its funnel is the funnel.
        fallback["after_dedupe"] = after_dedupe
        fallback["shown"] = len(results)
    pipeline = _pipeline(resolved=True, provider_status=FOUND, raw=raw_count,
                         valid=valid_count, after_dedupe=after_dedupe,
                         scored=len(scored), shown=len(results),
                         source_kind=source_kind, fallback=fallback)
    # An empty list here is an ANSWER, and the two ways of arriving at it are
    # different facts -- and, under this policy, the ONLY two: the provider
    # had nothing to propose, or it proposed candidates but none survived
    # normalization and de-duplication (every one was unusable, was this
    # paper itself, or repeated another entry). A non-empty `after_dedupe`
    # cannot produce an empty `results` any more, because nothing between
    # de-duplication and the display cap removes a candidate -- see
    # `_pipeline`'s note on `scored_candidates`.
    if results:
        reason = REASON_OK
    elif raw_count == 0:
        reason = REASON_PROVIDER_EMPTY
    else:
        reason = REASON_NO_VALID_CANDIDATES
    _store_cache(paper_id, STATUS_OK, results, cfg, fingerprint, entry,
                 reason=reason, pipeline=pipeline, source_kind=source_kind)
    return _external_section(STATUS_OK, results, stale=False, updated_at=now,
                             reason=reason, pipeline=pipeline,
                             source_kind=source_kind)


def _local_hostname():
    """The host this request came in on, or None outside a request context.

    nginx forwards `Host $host`, which carries no port, so only the HOSTNAME
    is compared. That is all this is for: recognising "the server the reader
    is already on" so a federated URL pointing back here is answered from the
    local database instead of looping out through the proxy. It can only ever
    make a target MORE local, never turn a refused server into an allowed one.
    """
    try:
        from flask import request
        return (request.host or "").split(":")[0].lower() or None
    except Exception:
        return None


def _local_source(paper_id):
    """This server's own answer to "what record is this, and what corpus does
    it live in". Returns (current_record, corpus, outcome).

    Unchanged from before federation existed, including the deliberate refusal
    to distinguish "no such record" from "hidden record" -- a related lookup
    must not become an existence probe.
    """
    try:
        paper = Paper.objects.get(id=str(paper_id))
    except Exception:
        return None, None, NOT_FOUND
    allowed, _ = can_view_paper(paper, get_current_user())
    if not allowed:
        return None, None, NOT_FOUND
    current_record = _record_dict(paper)
    corpus = [_record_dict(record) for record in active_papers()]
    if all(record.get("_id") != current_record["_id"] for record in corpus):
        # A deactivated or private record the session is allowed to see:
        # score it against the public corpus without adding it to that
        # corpus.
        corpus = corpus + [current_record]
    return current_record, corpus, FOUND


def _cached_remote_record(origin, paper_id):
    """A peer's copy of one record, at most once per REMOTE_RECORD_TTL_SECONDS.

    A negative result is cached too, briefly: without it, a detail page that a
    peer is failing to serve turns every reload into another request to a
    server that is already in trouble.
    """
    key = (origin, str(paper_id))
    cached, state = _remote_record_cache.get(key)
    if state != "miss":
        return cached
    record, outcome = federation.fetch_record(origin, paper_id)
    ttl = (REMOTE_RECORD_TTL_SECONDS if outcome == FOUND
           else NEGATIVE_TTL_SECONDS)
    _remote_record_cache.set(key, (record, outcome), ttl)
    return record, outcome


def _cached_remote_corpus(origin):
    """A peer's whole active corpus, at most once per
    REMOTE_CORPUS_TTL_SECONDS PER ORIGIN.

    This is the read worth caching: it is every active record on that server,
    it was being fetched twice per page view, and it is the same answer for
    every reader of every record on that peer. One entry serves all of them.
    """
    cached, state = _remote_corpus_cache.get(origin)
    if state != "miss":
        return cached
    corpus, outcome = federation.fetch_corpus(origin)
    ttl = (REMOTE_CORPUS_TTL_SECONDS if outcome == FOUND
           else NEGATIVE_TTL_SECONDS)
    _remote_corpus_cache.set(origin, (corpus, outcome), ttl)
    return corpus, outcome


def _remote_source(origin, paper_id):
    """A federated peer's answer to the same question, read through
    project.federation. Returns (current_record, corpus, outcome).

    Two reads, and both must succeed: the record identifies what is being
    scored, and the peer's corpus is what "specific to this field" is measured
    against. Scoring a remote record against THIS server's corpus would
    silently rank it by the wrong vocabulary, so a corpus that cannot be read
    is a failure of the section, not a reason to substitute a local one.

    Nothing read here is stored. The dicts returned are allowlisted copies
    that live for the length of this request.
    """
    current_record, outcome = _cached_remote_record(origin, paper_id)
    if outcome != FOUND:
        return None, None, outcome
    corpus, outcome = _cached_remote_corpus(origin)
    if outcome != FOUND:
        return None, None, UNAVAILABLE
    if all(record.get("_id") != current_record["_id"] for record in corpus):
        corpus = corpus + [current_record]
    return current_record, corpus, FOUND


def related_research(id, server=None):
    """
    Related Qresp records and related external papers for one record
    Handler for GET: /api/paper/{id}/related

    `server` names the Qresp server that HOLDS the record, mirroring the
    `?server=` the Explorer already puts on a detail-page URL. Absent, or
    naming this server, it means exactly what it always did: read from the
    local database. Naming an allowlisted federated peer, the record and the
    corpus are read from that peer instead, and everything downstream --
    scoring, the evidence gate, the re-ranking, the two result caps, the
    external provider -- is the same code operating on the same shapes.

    Read-only in both modes: it never changes a Paper, a draft, an ownership
    field, a publication state or any curation state, and a federated record
    is never written to this server's database. The only write it can make is
    to the separate `related_research_cache` collection.
    """
    if not config()["ENABLED"]:
        # Off by default. A 200 with empty sections keeps the detail page
        # rendering exactly as it did before the feature existed.
        return {
            "paper_id": str(id),
            "enabled": False,
            "source_server": "",
            "internal": {"status": STATUS_DISABLED, "results": [], "count": 0},
            "external": _external_section(STATUS_DISABLED, []),
        }, 200

    kind, origin = federation.resolve_server(server, _local_hostname())
    if kind == federation.REFUSED:
        # Never fall back to the local database: answering about whichever
        # local record happens to share this id would be a wrong answer
        # presented as a right one.
        return {"error": "This Qresp server is not available."}, 400

    if kind != federation.REMOTE:
        # Local records are computed every time. There is nothing to save:
        # the whole answer comes from this server's own database, costs no
        # peer and no provider request (Semantic Scholar has its own durable
        # cache), and recomputing is what keeps the promises the product
        # already makes -- a deactivated record disappears on the next reload,
        # a newly published one appears on it.
        return _stamp_feedback_context(_compute(None, id), None, id)

    key = _result_key(origin, id)
    cached, state = _result_cache.get(key)
    if state == "fresh":
        return _stamp_feedback_context(cached, origin, id)
    if state == "stale":
        # STALE-WHILE-REVALIDATE. The reader gets the previous answer now and
        # never waits for a peer; ONE of the readers refreshes behind them.
        _start_stale_refresh(key, origin, id)
        return _stamp_feedback_context(cached, origin, id)

    def already_done():
        value, inner_state = _result_cache.get(key)
        return (inner_state != "miss", value)

    # SINGLE FLIGHT. Five readers opening the same federated record together
    # cost the peer one round of reads, not five.
    return _stamp_feedback_context(
        _result_flight.run(key, lambda: _refresh(key, origin, id),
                           already_done),
        origin, id)


def _stamp_feedback_context(response, origin, paper_id):
    """Attach the signed note that says what this reader was shown.

    Minted HERE, on the way out, and deliberately NOT inside `_compute` or the
    external section:

    * the federated response is cached in-process for five minutes fresh plus
      an hour stale, so a token baked into it would still be handed out long
      after it expired;
    * the external answer is cached in Mongo for a week, and a week-old token
      is not a token.

    Nothing about the reader goes into it, so stamping a cached body does not
    personalise it -- the same body serves everyone, and only this one field
    differs per response.

    A record with no external results gets no token, which is what makes
    "these recommendations were unhelpful" unsayable about an empty list.
    Anything that goes wrong here costs the rating widget and nothing else:
    the recommendations themselves are already computed and are still served.
    """
    try:
        body, status = response
    except (TypeError, ValueError):
        return response
    if status != 200 or not isinstance(body, dict):
        return response
    external = body.get("external")
    if not isinstance(external, dict):
        return response
    if external.get("status") != STATUS_OK or not external.get("results"):
        return response
    try:
        token = feedback_context.issue(
            federation.cache_key(origin, paper_id), "external",
            len(external["results"]),
            _external_page_count(len(external["results"])))
    except feedback_context.ConfigurationError as e:
        # Fail CLOSED, and say so once. Without a secret there is no signature
        # worth having, so no token is issued and no rating can be stored --
        # rather than minting one under a hardcoded key that proves nothing.
        print("Feedback context unavailable: %s" % e)
        return response
    except Exception as e:
        print("Feedback context could not be issued: %s" % type(e).__name__)
        return response
    if token:
        # A copy: the cached body must not acquire this request's token.
        external = dict(external)
        external["feedback_context"] = token
        body = dict(body)
        body["external"] = external
        return body, status
    return response


def _external_page_count(shown):
    """How many pages the UI will lay `shown` results out over."""
    if shown <= 0:
        return 0
    pages = (shown + EXTERNAL_RESULTS_PER_PAGE - 1) // EXTERNAL_RESULTS_PER_PAGE
    return min(pages, EXTERNAL_MAX_PAGES)


def _result_key(origin, paper_id):
    """Normalized source server + paper id + algorithm version.

    The version is in the key so that tightening the quality gate takes effect
    at once. Without it, a deployment would keep serving the weak answers the
    previous rules produced until every entry aged out.
    """
    return "%s|%s" % (federation.cache_key(origin, paper_id),
                      ALGORITHM_VERSION)


def _start_stale_refresh(key, origin, paper_id):
    """Refresh a stale entry behind the reader, once.

    Nobody waits for this, so `SingleFlight` -- which serialises callers that
    all want the same answer -- is the wrong tool: it would make four of five
    readers queue for work whose result they have already been given. The
    guard instead lets exactly one reader start the refresh and tells the
    others there is nothing for them to do.
    """
    if not _refresh_guard.acquire(key):
        # Already refreshing, or cooling down after a failure.
        return None

    def refresh():
        failed = True
        try:
            # The REFRESH's own outcome, not the response it chose to return:
            # preserving a good stale answer is the right thing to serve and
            # still a failed refresh, and reading success off the served value
            # would clear the cooldown that failure is supposed to start.
            _response, failed = _refresh_and_report(
                key, origin, paper_id, preserve_stale=True)
        except Exception as e:
            # A background refresh must never surface anywhere. The kind is
            # logged; nothing about the peer's answer is.
            print("Related research stale refresh failed: %s"
                  % type(e).__name__)
        finally:
            _refresh_guard.release(key, failed=failed,
                                   cooldown=NEGATIVE_TTL_SECONDS)

    return relatedcache.spawn_background(refresh)


def _refresh(key, origin, paper_id, preserve_stale=False):
    """The response only. See `_refresh_and_report` for what it does."""
    return _refresh_and_report(key, origin, paper_id, preserve_stale)[0]


def _refresh_and_report(key, origin, paper_id, preserve_stale=False):
    """Compute the response for a federated record and cache it.

    Returns `(response, refresh_failed)`. The second value is about THIS
    attempt, not about the response: a background refresh that fails while a
    good stale answer survives returns that good answer and still reports a
    failure, which is what starts the cooldown.

    What is cached, and for how long, depends on what came back:

    * a real answer keeps RESULT_TTL_SECONDS fresh plus
      RESULT_STALE_TTL_SECONDS servable-while-refreshing;
    * a peer failure keeps NEGATIVE_TTL_SECONDS only -- long enough to stop a
      hot page turning one outage into a request storm, short enough that a
      reader who retries gets a real attempt;
    * a 404 is not cached here at all: it is cheap, and the peer's own
      negative cache already covers the repeated lookup.

    `preserve_stale` is what a BACKGROUND refresh passes. A refresh that fails
    must not replace a real answer with an empty one: the reader was already
    being served something true, and a peer being briefly unreachable is not a
    reason to take it away. The failure is still recorded -- by the guard's
    cooldown -- so it is not retried on every view either.
    """
    response = _compute(origin, paper_id)
    body, status = response
    if status != 200:
        return response, True
    degraded = body.get("internal", {}).get("status") == STATUS_UNAVAILABLE
    if not degraded:
        _result_cache.set(key, response, RESULT_TTL_SECONDS,
                          RESULT_STALE_TTL_SECONDS)
        return response, False
    if preserve_stale:
        previous, state = _result_cache.get(key)
        if state != "miss" and previous and previous[0].get(
                "internal", {}).get("status") == STATUS_OK:
            # Keep serving the last good answer for the rest of its stale
            # window rather than downgrading it to "unavailable".
            return previous, True
    _result_cache.set(key, response, NEGATIVE_TTL_SECONDS)
    return response, True


def _compute(origin, id):
    """The answer itself, with no caching of its own."""
    cfg = config()
    if origin:
        current_record, corpus, outcome = _remote_source(origin, id)
    else:
        current_record, corpus, outcome = _local_source(id)

    if outcome == NOT_FOUND:
        return {"error": "This record is not available."}, 404
    if outcome != FOUND:
        # The peer did not answer. That is a failure of this section, not of
        # the record: say so, with an empty list, and let the page offer a
        # retry rather than pretend nothing is related.
        return {
            "paper_id": str(id),
            "enabled": True,
            "source_server": origin or "",
            "internal": {"status": STATUS_UNAVAILABLE, "results": [],
                         "count": 0},
            "external": _external_section(STATUS_UNAVAILABLE, []),
        }, 200

    internal_results, stats = internal_recommendations(
        current_record, corpus, server=origin)

    if not cfg["EXTERNAL_ENABLED"]:
        # Internal-only. No provider request, and the external cache is
        # neither read nor written -- an operator who turned the outbound call
        # off gets exactly no outbound behaviour, not a cached echo of it.
        external = _external_section(STATUS_DISABLED, [])
    else:
        try:
            # Keyed by server AND id: the same 24-hex id on two Qresp servers
            # is two different papers, and must never share a cache row.
            external = _external_for(federation.cache_key(origin, id),
                                     current_record, stats, cfg)
        except Exception as e:
            # A provider or cache problem degrades this one section; it never
            # becomes a 500 for a page that has perfectly good internal
            # results.
            print("Related research external section failed: %s"
                  % type(e).__name__)
            external = _external_section(STATUS_UNAVAILABLE, [])

    return {
        "paper_id": str(current_record.get("_id") or id),
        "enabled": True,
        # Which server the two lists were computed from. Empty means this one.
        "source_server": origin or "",
        "internal": {
            "status": STATUS_OK,
            "results": internal_results,
            "count": len(internal_results),
        },
        "external": external,
    }, 200
