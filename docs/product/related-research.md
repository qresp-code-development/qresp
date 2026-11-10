# Related Literature Explorer — Related Research on Paper Details

> **No language model runs in the serving path.** Nothing a visitor sees is
> produced by a model: candidates come from the Qresp corpus and the free
> Semantic Scholar Recommendations API, and every ordering, threshold and
> "Why related" sentence is computed deterministically by Qresp from the two
> records' own published scientific metadata. That is why the UI says
> "generated automatically", not "AI" — see "Product wording" below.
>
> One model IS used, entirely offline and never on a request path: the
> dev/QA triage tool that gives each candidate pair a **provisional** opinion
> so a domain expert knows which 30 pairs to read first. It changes nothing
> about what is served. See "AI-based provisional evaluation".

A visitor reading a record's detail page gets, at the bottom of the page, two
independent lists:

- **Related Qresp Records** — other active, published records on this server.
  Every result **passed Qresp's strict evidence gate**. At most **3**, rendered
  as one list.
- **Recommended External Papers** — papers proposed by Semantic Scholar, then
  **re-ranked** by Qresp's deterministic score. The gate does **not** filter
  this list: a valid provider candidate is never removed for failing it, so a
  paper with weak or zero Qresp signal can still appear, near the end. At most
  **25**, drawn from up to **150** candidates and shown **five per page over at
  most five pages**.

**Two lists, two policies — never conflate them.** For the internal list the
gate DECIDES what is shown; for the external list it only ORDERS. That is the
single most important distinction in this document, and everything below is
written to keep the two apart:

| | Related Qresp Records | Recommended External Papers |
| --- | --- | --- |
| Candidates from | this server's own corpus | Semantic Scholar |
| The gate | **filters** — a failing record is dropped | **does not filter** — it only contributes to the score |
| Ordering | Qresp score, descending | Qresp score descending, provider rank ascending as tie-break |
| Cap | 3 | 25 (5 per page × 5 pages) |
| An empty list means | nothing cleared the gate | the provider proposed nothing usable — **never** "Qresp rejected them all" |
| Evidence heading in the UI | "Why related" | "Qresp ranking signals" (omitted when there is none) |

The two caps are independent on purpose: the internal list is a handful of
records from one server's own corpus, while the external one is drawn from the
whole literature. Neither is ever padded — a short list, including an empty
one, is what the pipeline produced.

Both are computed **at view time**, never pinned into the record. Nothing is
written to the `Paper` document at curation, publish, or read time.

**Off by default.** Without `QRESP_RELATED_RESEARCH_ENABLED` the endpoint
answers `enabled: false` and the section does not render at all — the detail
page is byte-for-byte what it was before.

---

## Where it lives

| Layer | File |
| --- | --- |
| Pure scoring, evidence, quality gate | `backend/project/relatedness.py` |
| Endpoint, provider call, cache | `backend/project/related.py` |
| Reading a record from another Qresp server | `backend/project/federation.py` |
| TTL / single-flight / stale-while-revalidate | `backend/project/relatedcache.py` |
| Cache document | `backend/project/models.py` (`RelatedResearchCache`) |
| API contract | `backend/project/swagger.yml` |
| Rate limit | `nginx/default.conf` (`api_related` zone) |
| UI section | `frontend/components/Paper/RelatedResearch.js` |
| Federation allowlist (ships with the backend) | `backend/project/data/qresp_servers.json` |
| AI provisional labelling (dev/QA) | `backend/project/tools/ai_review.py` |
| Page wiring | `frontend/pages/paperdetails/[id].js` |

`relatedness.py` is **pure**: no database, no network, no clock, no
environment. That is what makes the thresholds testable and what keeps the
scoring honest — it cannot reach for anything it was not handed.

---

## API contract

```http
GET /api/paper/{id}/related?server=…   (public, read-only, no CSRF, no session)
```

`server` is optional and names the Qresp server that **holds** the record —
the same `?server=` the Explorer already puts on a detail-page URL. See
[Federated records](#federated-records).

**200** — always, when the record is visible:

```jsonc
{
  "paper_id": "5f2b…",
  "enabled": true,
  "source_server": "",                     // "" = this server; otherwise the peer's origin
  "internal": {
    "status": "ok",                        // ok | disabled | unavailable
    "count": 2,
    "results": [
      {
        "id": "5f2c…",                     // Qresp record id; null for external
        "title": "…",
        "authors": "A. One, B. Two",       // "et al." past 8 names
        "year": 2018,
        "doi": "10.1038/…",                // null when unknown
        "url": null,                       // internal results link by id
        "source": "internal",
        "server": "",                      // which Qresp server holds it; null for external
        "reasons": ["…", "…"]              // 0–3, grounded, never model-written
      }
    ]
  },
  "external": {
    "status": "ok",                        // ok | disabled | unresolved | unavailable
    "reason": "ok",                        // WHY -- see the table below
    "pipeline": {                          // where the candidates went
      "resolved": true, "provider_status": "found",
      "raw_candidates": 150, "valid_candidates": 148,
      "after_dedupe": 147,
      "scored_candidates": 147,            // == after_dedupe, ALWAYS: nothing is gate-filtered
      "shown": 25                          // the top 25 after re-ranking, not 3
    },
    "provider": "Semantic Scholar",
    "count": 1,
    "stale": false,                        // true => last successful results, refresh failed
    "updated_at": "2026-08-01T09:12:00",   // last SUCCESSFUL fetch, or null
    "results": [
      {
        "id": null,
        "title": "…",
        "authors": "…",
        "year": 2020,
        "doi": "10.1021/…",
        "url": "https://doi.org/10.1021/…", // HTTPS DOI preferred
        "source": "external",
        "server": null,                     // not a Qresp record
        "reasons": ["…"]
      }
    ]
  }
}
```

**404** — `{"error": "This record is not available."}` for a record that does
not exist, an unparseable id, and a deactivated record whose viewer is not its
owner/editor/admin. The same body and status for all three: a related lookup
must not become an existence probe. This matches the details API's policy for
deactivated records (`GET /api/paper/{id}` answers 404 with the same message)
and the 404 the other paper sub-resources (`/permissions`, `/raw`) already use.
With `?server=` it also covers "that peer does not have this record".

**400** — `{"error": "This Qresp server is not available."}` when `?server=`
is not a server this deployment federates with. There is deliberately **no
fallback to the local database**: answering with whichever local record
happens to share the id would be a wrong answer presented as a right one.

`internal` is capped at **3**, `external` at **25**, and neither is **ever
padded**. Both may be empty; that is a correct answer, not a failure.

**All 0–25 external results come back in this one response**, and the cache
entry holds all of them. Pagination is therefore a client-side slice of an
array the browser already has: selecting page 4 issues no request to this
endpoint and, in particular, no request to Semantic Scholar.

### Internal statuses

| status | meaning | UI |
| --- | --- | --- |
| `ok` | the list was computed (possibly empty) | results, or "No sufficiently related papers were found." |
| `disabled` | feature switch is off | nothing renders at all |
| `unavailable` | the source server could not be read (federated records only) | "Related research is unavailable right now…", with a retry |

`unavailable` exists so that "we could not ask" is never displayed as
"nothing is related". Only the second is a statement about the record.

### External statuses

| status | meaning | UI |
| --- | --- | --- |
| `ok` | the provider answered (possibly with an empty list) | results, or the empty message |
| `disabled` | feature switch is off | "External recommendations are turned off on this server." |
| `unresolved` | the provider answered **"no such paper"**, or the title match was not close enough to trust | "This record could not be matched in the external index…" |
| `unavailable` | the provider **did not answer**: timeout, connection error, 429, 5xx, unreadable body, unexpected shape | "External recommendations are unavailable right now. The Qresp results above are unaffected." |

`stale: true` is orthogonal: results that came from an earlier success but are
being served under a non-`ok` status are always flagged, whether they come
from the refresh path or from the failure-retry window.

### Why the external list is empty — `reason`

"No external papers" has five causes and used to have one sentence. `status`
is what the UI switches on; `reason` is the diagnosis, and the two are not
interchangeable — the first two rows below are a perfectly healthy `ok`.

| `reason` | `status` | Meaning | Cached for |
| --- | --- | --- | --- |
| `ok` | `ok` | results were shown | full TTL |
| `provider_returned_no_candidates` | `ok` | the provider answered with an empty list | full TTL |
| `no_valid_candidates_after_dedupe` | `ok` | it proposed candidates, but none survived validation and dedup (unusable metadata, this paper itself, repeats) | full TTL |
| `source_paper_not_in_provider_index` | `unresolved` | this paper could not be identified at the provider | full TTL |
| `provider_rate_limited` | `unavailable` | HTTP 429 | 1 hour |
| `provider_timeout` | `unavailable` | the provider never answered | 1 hour |
| `provider_error` | `unavailable` | 5xx, unreadable body, unexpected shape | 1 hour |

> **There is no "the gate rejected them all" row, and there cannot be one.**
> The predecessor of `no_valid_candidates_after_dedupe` was
> `all_candidates_below_quality_gate`, and it described a state that no longer
> exists: nothing is removed from the external list for failing the gate. An
> empty external list now means only that the provider had nothing, could not
> be asked, or proposed nothing that survived *metadata* validation and dedup.

`pipeline` carries the counts behind that verdict — `resolved`,
`provider_status`, `raw_candidates`, `valid_candidates`, `after_dedupe`,
`scored_candidates`, `shown` — so "the external list is empty" is answerable
without re-asking the provider. Counts only: no title, no abstract, no
provider body, no credential.

| field | meaning |
| --- | --- |
| `raw_candidates` | what the provider proposed, at most **150** |
| `valid_candidates` | …minus entries whose public metadata could not be normalized |
| `after_dedupe` | …minus this paper itself and repeats (earliest provider rank kept) |
| `scored_candidates` | how many Qresp scored. **Always equal to `after_dedupe`** — every deduplicated candidate is scored and none is dropped, which is what makes gate-filtering impossible by construction rather than by convention |
| `shown` | …after the cap: always `0 <= shown <= 25` and `shown <= scored_candidates`. "The top re-ranked provider candidates", **not** "the ones that passed the gate" |

`pipeline` describes the **external** list only. Related Qresp Records is not
built from provider candidates and has no pipeline.

`reason` and `pipeline` are **stored with the answer**, so a cache hit explains
itself exactly as the live computation did. An entry written before the field
existed simply has no `pipeline`: the key is omitted rather than invented, and
the next real refresh fills it in.

**An empty answer and a failure are never cached the same way.** A healthy
empty list is a fact about the record and keeps the full TTL; a failure keeps
an hour and never overwrites a good answer. The internal gate is never relaxed
to fill the internal list, and the external list is never gate-filtered in the
first place.

### Provider outcome → status → how long it is kept

Every provider call resolves to one of three outcomes, and **only the middle
column is a fact about the record**:

| Provider call result | Outcome | Status | Cached for |
| --- | --- | --- | --- |
| 200, usable body | `FOUND` | `ok` | full TTL (7 days) |
| **404**, or a well-formed answer naming no paper, or a title match below 90 % | `NOT_FOUND` | `unresolved` | full TTL (7 days) |
| timeout, connection error, **429**, 5xx, unreadable body, non-object body, 200 without `recommendedPapers` | `UNAVAILABLE` | `unavailable` | **1 hour** (`FAILURE_RETRY_SECONDS`) |

Both lookup paths (DOI resolution and title match) and the recommendations
call report all three independently.

> **Why this split exists.** These used to be collapsed: *any* failure came
> back as "not in the provider's index" and was cached for seven days. A
> single timeout or one 429 from the shared keyless pool therefore turned into
> a durable, wrong claim about the record, and the section stayed empty for a
> week after a momentary blip. A non-answer now expires within the hour and
> never overwrites a good answer.

---

## Federated records

Qresp has always been federated **in the browser**: the Explorer lets a reader
pick servers, `pages/search.js` fetches `/api/search` from each, and
`pages/paperdetails/[id].js` fetches `/api/paper/{id}` from whichever server
`?server=` names. The backend was never part of that — every handler it has
answers from its own MongoDB.

That is enough while a page only needs to **display** a remote record. It stops
being enough the moment a backend feature has to **reason** about one.

> **The bug this fixed.** Opening a PaperStack record through the Explorer
> (`/paperdetails/5983…?server=https://paperstack.uchicago.edu`) made the
> browser call `/api/paper/5983…/related` on the **local** server, with no
> mention of the server the record actually lives on. That id is not in the
> local database, so the endpoint answered `404 {"error": "This record is not
> available."}` — correctly, for the question it was asked. The UI caught the
> error and rendered `null`, so the entire section vanished, and a reader had
> no way to tell that from a deployment without the feature.

### How a federated request is answered

| `?server=` | What happens |
| --- | --- |
| absent | local MongoDB, exactly as before |
| loopback (`https://localhost:8443`, `127.0.0.1`, `*.localhost`) | local — the staging tunnel is this server |
| this server's own host | local — no loop back out through nginx |
| an **allowlisted** HTTPS peer | the record and the corpus are read from that peer |
| anything else | **400**, and no request is made |

Two reads, both public and unauthenticated, and **both must succeed**:

| Read | Purpose |
| --- | --- |
| `GET {peer}/api/paper/{id}` | the record being scored |
| `GET {peer}/api/search` | the corpus it is scored against |

The corpus is the peer's, not this server's. Scoring a PaperStack record
against a local corpus would measure "specific to this field" with the wrong
vocabulary and label the results with the wrong server, so a corpus that
cannot be read is an `unavailable` section — never a silent substitution.

Everything downstream — profiles, IDF, the evidence families, the quality
gate, both result caps, the external provider — is the **same code** on the
same shapes. The only difference is where the two record sets came from.

### What is copied out of a peer's answer

`/api/paper/{id}` carries the curator's name, e-mail and affiliation, the RCC
server path, the file-server path, and the download/notebook paths. **None of
it crosses the boundary.** `federation.py` allowlists exactly the fields
`build_internal_profile` reads and `metadata_fingerprint` hashes:

| Level | Copied |
| --- | --- |
| Record | title, abstract, DOI, year, authors, tags, collections |
| Chart | `caption`, `properties` |
| Dataset / Script | `readme`, `keywords` |
| Tool | `packageName`, `programName`, `facilityname`, `facilityName`, `measurement`, `readme` |

The allowlist is positive, so a field a peer invents is dropped by
construction rather than by a blocklist that has to keep up.

**Nothing is written.** A federated record is read, scored and discarded; it
never reaches this server's `paper` collection, so a Qresp node can never
accumulate shadow copies of another node's records. The only write is the
external-recommendation cache row, keyed by server **and** id.

### Verified against a live peer

Run read-only against `https://paperstack.uchicago.edu` (65 active records) on
2026-08-10, through the real endpoint, plus a headless-Chrome render of each
detail page:

| Check | Result |
| --- | --- |
| Five named published records answered | 200, `internal.status: "ok"`, 5 results each |
| Every result labelled with the peer | yes, all 25 |
| Candidates drawn from the peer's corpus | yes; zero local records in any answer |
| Records written to the local database | **0** |
| Cap respected across all 65 records | 5 max; one record (`Testing`) correctly returns **0** |
| Results resting on a shared author alone | **0 of 25** — every result carries a `strong` term or text signal, and the author signal is only ever corroboration |
| Section present in the browser | 5 of 5 pages, 5 results each, links carrying `?server=` |
| Section present when the peer read fails | yes — "Related research is unavailable right now" with a retry, and **not** the empty message |

One caveat found by the same run: the *tail* of a saturated list can be weak.
64 of 65 records have five candidates clearing the gate, so slot 5 is often the
least convincing one — for instance a "shares 5 specific research terms"
strong signal built from `atom, classical, particular, region, yield`, which
are ordinary English words that happen to be rare in a 65-record corpus. The
top two or three results were topically right in every case checked. This is a
property of `relatedness.py`'s `is_specific`, not of federation, and it is
recorded here rather than changed: adjusting it moves local results too.

### Known limits

- A `/api/search` entry carries **no artifacts**, so a federated corpus is
  scored on title, abstract, tags, collections, authors and DOI alone. That
  makes remote scoring slightly more conservative than local, never more
  permissive.
- Each federated request pulls the peer's whole corpus. There is no
  cross-request cache of it (caching another server's corpus would be a copy);
  the `api_related` nginx zone is what bounds the cost.
- Federation reads the registry itself, **with certificate verification** and
  redirects refused. It is the only code path that decides which servers this
  feature may contact.
- DNS **rebinding** is still not defeated: the check and the connection are
  separate steps, so a name that changes its answer in between would slip
  through. Closing that needs the connection pinned to the address that was
  checked, which `requests` does not expose.

---

## Internal recommendations

Computed live on every request over `active_papers()` (records that are
explicitly active or predate the flag), so a publish or a deactivation is
reflected **immediately** — there is no internal cache to invalidate.

### What is read

- `reference.title` (weighted ×2 — a title word carries more signal than an
  abstract word), `reference.publishedAbstract`, `reference.authors`
- `tags` (paper keywords)
- `collections` — as a **broad field only**, never as a specific term
- Chart `caption` and `properties`
- Dataset / Script `keywords` and `readme`
- Tool `packageName`, `programName`, `facilityname`/`facilityName`,
  `measurement`, `readme`

### What is never read, scored, cached, or sent

RCC URLs and file paths (`info.serverPath`, `fileServerPath`,
`folderAbsolutePath`, `downloadPath`, `notebookPath`), any file listing or file
content, image/notebook/data bytes, `owner_email`, `editor_emails`,
`info.insertedBy` (curator name/email/affiliation), `edit_history`, drafts,
sessions, CSRF tokens, secrets, and any private or deactivated record. These
fields are not loaded into the `Profile` object at all, which is enforced by
`TestProfileScope.test_only_scientific_metadata_is_read`.

---

## External recommendations

### Identifying this paper

1. **DOI first.** `GET /graph/v1/paper/DOI:<doi>` with
   `fields=paperId,title,externalIds`. A DOI is exact, so no confirmation is
   needed.
2. **No DOI → official title match.** `GET /graph/v1/paper/search/match?query=<title>`
   with `fields=paperId,title,externalIds`, and the answer is then checked
   **against the stored title here**: at least 90 % token overlap
   (`TITLE_MATCH_MIN_OVERLAP`). Below that the external list is skipped with
   `unresolved` — recommendations built from somebody else's paper are worse
   than none.
3. **Recommendations.** `GET /recommendations/v1/papers/forpaper/<paperId>`
   with `limit=150` (`EXTERNAL_CANDIDATE_LIMIT`) and
   `fields=title,abstract,year,authors.name,externalIds,fieldsOfStudy` — the
   minimum the quality gate needs (text for similarity and shared terms,
   authors for the shared-author signal, year for display/ordering,
   `externalIds` for the DOI link and de-duplication, `fieldsOfStudy` for the
   "same research area" check). No venue, no citation counts, no embeddings.
   No `from` parameter, so the provider's default pool is used.

> ### Correction — the provider DOES cover Qresp's domains
>
> An earlier note here claimed the Recommendations API returns nothing usable
> for Qresp records, based on two hand-picked DOIs. **That generalization was
> wrong**, and a proper sample overturned it. Over 18 real records from a
> public Qresp instance:
>
> | Pool | Records with candidates | Candidates | Gate pass rate |
> | --- | --- | --- | --- |
> | `recommendations_default` (what production uses) | 15 / 18 (83 %) | 300 | 74 % |
> | `recommendations_all_cs` | 18 / 18 (100 %) | 347 | 58 % |
> | `title_resolution` | 13 / 18 (72 %) | 260 | 75 % |
>
> The candidates are on-topic, not Computer Science strays — the `all-cs`
> pool returned, for example, quantum-embedding papers against a
> quantum-embedding record. The lesson is about method, not the provider: two
> DOIs are an anecdote, and the reason the evaluation CLI below exists is so
> claims like this are made from a sample instead.

### Measured over the whole public corpus at 150 candidates

> **Historical — measured under the OLD gate-filtered external policy.** These
> numbers were collected on 2026-08-13, before the external list stopped being
> gate-filtered. They are kept because the provider-side figures (requests,
> 429s, resolution rate) are still valid, but the funnel below describes a
> pipeline that no longer exists: `after_gate` has no counterpart today, and
> under the current policy the shown count for these records would be far
> higher. Re-run `collect` for current figures.

Read-only sweep of **every** record a public Qresp instance publishes, on
2026-08-13. The count was **verified at run time** from `/api/search` (65
records, all with a DOI, none held back by triage) rather than assumed.

| | |
| --- | --- |
| Provider requests | **316** of a planned 325 upper bound |
| HTTP 429 / retries | **0 / 0**, at 0.5 requests/second, keyless |
| Provider failures | one HTTP 500 (logged, degraded that one call only) |
| Records resolved at the provider | 63 / 65 (97 %) — 2 `unresolved` |
| Records the provider had candidates for | 50 / 65 (77 %) |
| Records with at least one **displayed** result | 34 / 65 (52 %) |

Funnel for `recommendations_default`, summed over 65 records:

| Stage | Candidates |
| --- | --- |
| `raw_candidates` (150 requested per record) | 7,500 |
| `after_dedupe` | 7,481 |
| `after_gate` | 420 (5.6 % pass rate) |
| `displayed` (cap 25) | 307 |

Displayed results by page: **113 / 69 / 55 / 40 / 30** across pages 1–5. That
distribution is the honest picture of what the widening bought: page 1 is full
for most records that have anything at all, and the deeper pages thin out
rather than being padded.

> **None of this is an accuracy figure.** Every number above is a count.
> Whether the 307 displayed papers are *related* is a question only a domain
> expert can answer, and it is answered by rating `external-review.tsv` and
> running `summarize`. Until then the correct statement is "coverage measured,
> accuracy unmeasured".

`summarize` over this artifact reports exactly that: `visible_candidates: 307`
(unique, from the raw results — not the 480 review rows an earlier version
counted), every precision `null` with `available: false`, and
`false_negatives_sampled.available: false` over a sampled denominator of 227
of the 7,061 rejected candidates.

Its `external-review.tsv` predates the rejected sample, so the blind sheet
alone cannot expose a false negative; the 227 rejected candidates reachable
for this artifact come from `human-review.tsv`'s near-misses. A re-collect
writes both into one blind sheet.

> **Two things the live API taught us that no stub could.**
>
> **Nested field selectors poison the request.** Asking for
> `references.externalIds` made the provider *discard the entire field list*
> and answer with its defaults — so the call came back with **more** data than
> was requested (`authors`, `openAccessPdf`) and still no reference DOIs. The
> resolution call now asks only for flat fields. Consequently **citation
> evidence has no source and never fires**; wiring it would take one extra
> `GET /graph/v1/paper/<id>/references?fields=externalIds` per cache miss,
> which has not been added.
>
> **The provider volunteers extras.** Requesting `abstract` alone returns
> `abstract`, `authors`, `title` *and* `openAccessPdf`. That is the provider's
> behaviour, not a wider request. `_normalize_candidate` allowlists what is
> copied out, so nothing outside the documented set reaches a profile, the
> cache, or the response — pinned by a test.

### Filtering before scoring

Removed: results with no title, the current paper (by normalized DOI **or** by
normalized title key), a DOI already seen, a title already seen. Order is
preserved so the de-duplication is deterministic.

### Then Qresp re-orders them

Every surviving candidate is scored by the same arithmetic the internal list
uses, against the same Qresp corpus statistics. That score decides the
**order** — and only the order. **No candidate is removed for scoring badly.**
The list is then cut to the first **25**.

The exact flow, end to end:

```text
Semantic Scholar, up to 150 candidates
  → normalize valid public metadata                 (valid_candidates)
  → drop self-reference and duplicates,
    keeping each survivor's EARLIEST provider rank  (after_dedupe)
  → score every one of them with Qresp's
    deterministic relevance signals                 (scored_candidates)
  → sort: Qresp score DESC, provider_rank ASC
  → take the first 25                               (shown)
```

`scored_candidates` equals `after_dedupe` by construction — the scoring step
has no filter in it — which is what makes "Qresp rejected them all" an
impossible explanation for an empty external list rather than merely a
discouraged one.

The provider's *position* in its own answer is kept on the normalized candidate
as `provider_rank` and used as the **tie-break** when two candidates score
identically, preserving the provider's relative order among equals. It is not
read by the scorer, never reaches the reader, and is never evidence: being
ranked first by somebody else is not a reason Qresp can name. The provider's
proprietary score is not requested at all and is never displayed.

**A weak candidate near the tail is intended, not a defect.** A candidate with
little or no nameable Qresp evidence can occupy slot 22 of 25. Semantic Scholar
proposed it; Qresp's job on this list is to put the most plausible ones first,
not to overrule the provider about what belongs in its own recommendation set.
The UI is written to match — see "Product wording".

Author, institution, collection, PI and generic-English-word signals are **not**
part of this score. Widening the pool must not be paid for by loosening what
counts as relevance.

> **Why 150 candidates and not 20.** A larger pool buys **coverage**: more of
> what the provider actually knows about reaches the reader, ordered by Qresp's
> best guess at relevance. It is one request per cache miss either way. If
> fewer than 25 candidates survive normalization and dedup, fewer than 25 are
> returned — the list is cut short rather than padded.

### Exactly what leaves this server

Per cache miss, at most two GETs to `https://api.semanticscholar.org`, carrying:

- the paper's **DOI**, or — only when it has none — its **published title**;
- the opaque `paperId` the provider itself just returned.

Nothing else. Not the abstract, not the authors, not the keywords, not the
artifacts, not another record, not a path, not a file, not a user.

The provider origin is a **fixed HTTPS constant in code**
(`SEMANTIC_SCHOLAR_ORIGIN`); no environment variable, config file or request
parameter can redirect it. The API key, when configured, is sent **only** as
the `x-api-key` request header — never in a URL, query string or body, where an
access log would capture it.

---

## Quality gate

A candidate **passes** the gate when it has

- **at least one STRONG** piece of evidence, **or**
- **at least two MEDIUM** pieces from **independent families**.

**What passing means depends on which list you are in.** This is the one place
the two policies actually diverge in code, and the rest of this document only
restates it:

| | Related Qresp Records (`relatedness.rank`) | Recommended External Papers (`relatedness.rerank_external`) |
| --- | --- | --- |
| Steps | **gate**, then sort, then cut to 3 | score, then sort, then cut to 25 — **no gate step at all** |
| A failing candidate | is dropped | is **kept**, and sorts to the back |
| Only removal rule | failing the gate | a missing title — unusable data, not a relatedness judgement |
| Sort key | Qresp score, descending | Qresp score descending, then `provider_rank` ascending |

For the internal list, `pipeline` does not apply; the cap of 3 is the whole
story. For the external list `pipeline.scored_candidates` reports how many were
scored and `pipeline.shown` how many survived the cap — and because nothing is
filtered in between, `scored_candidates == after_dedupe` always holds. The
difference between `scored_candidates` and `shown` is **the display cap alone**.

`assess()` still computes a pass/fail verdict for every external candidate, and
`rerank_external` still carries it — but as a **diagnostic only**, for the
evaluator and for operators. Nothing in the serving path reads
`assessment.passed` to decide external visibility.

`provider_rank` is the provider's position in its own answer. It is a
**tie-break only**: it is never part of the score, never displayed, and never
treated as evidence. Two candidates that score identically keep the provider's
relative order; a candidate that scores higher wins regardless of where the
provider put it.

Families: `citation`, `terms`, `methods`, `text`. Only the strongest evidence
per family is kept, so two views of one overlap count once.

**Every family is about subject matter.** There is no family a person's name
can reach, so removing every author from both records cannot change a verdict
— `test_relatedness_quality.py` asserts exactly that.

### Strong

| Evidence | Condition |
| --- | --- |
| Directly cited by this paper | candidate DOI ∈ the current paper's reference DOIs (provider-supplied; never inferred) |
| Several specific shared research terms | ≥ 3 **independent** shared specific terms **and** combined IDF ≥ 4.5 |
| High title/abstract similarity | IDF-weighted cosine ≥ 0.34 |
| Same method/tool on a related topic | a shared specific tool/facility/measurement **and** topic overlap that is not itself the tool |
| Both titles are about the same concepts | ≥ 2 independent shared specific terms present in **both titles** |

### Medium

| Evidence | Condition |
| --- | --- |
| Shared specific keywords | ≥ 1 shared **explicit** keyword (tag, chart property, artifact keyword) |
| Shared specific research terms | ≥ 2 independent shared specific free-text terms (when no shared keyword) |
| Same research area + significant similarity | shared collection/field **and** cosine ≥ 0.16 |
| Shared specific tool or facility | a shared tool with **no** topic overlap |

### What counts as a "specific research term"

**Two independent conditions, and both are required.**

1. **The term has to look like subject vocabulary** at all
   (`is_intrinsically_technical`), by one of these, none of them
   domain-specific:
   - a multi-word phrase with a non-ordinary part (`spin coating`);
   - a digit inside the token (`g0w0`, `c60`, `bivo4`);
   - an internal hyphen (`dielectric-dependent`, `nitrogen-vacancy`);
   - written as an acronym, formula or mixed-case name in the **original**
     text (`DFT`, `MBPT`, `NaCl`, `QDs`) — read from the author's own
     typography, before lowercasing;
   - a curated tag, chart property, artifact keyword or tool name;
   - failing all of those, a plain word of ≥ `LONG_TECHNICAL_LENGTH` (9).
2. **It has to still be rare on this corpus** (`is_rare_enough`), so a term
   carried by more than 15 % of records is a field label, not a fingerprint.

> **Why both.** Rarity used to be the only test. On a 65-record server that
> promoted any word appearing in fewer than ten abstracts to a "specific
> research term", and readers were shown `python`, `http`, `user`, `another`,
> `related`, `discussed`, `play`, `will`, `proper`, `class`, `comparing`,
> `particular`, `region` and `yield` as the reason two papers were related.
> `particular` in two records out of 32 is arithmetically as rare as
> `chalcogenide`, and no amount of document counting can tell them apart.

The accepted cost: a short free-text term that is never tagged, never
capitalised and never hyphenated (`exciton`, `phonon`, `qubit`) is not counted
from prose alone. That loses recommendations rather than inventing them, which
is the direction this feature is required to fail in.

### Never evidence, alone or in combination

**A shared author.** It says who did the work, not what it was about. On a
real server one PI co-authors half the corpus, so the signal fired almost
everywhere and, paired with any second weak signal, pushed unrelated subjects
through. It is now counted only to ORDER candidates that already passed on
their own topic, and it never appears in a reason. There is deliberately no
rule that guesses which author is the PI.

Same journal. Adjacent years. A single broad field. Generic words (`study`,
`data`, `analysis`, `simulation`, and ~90 more in `GENERIC_TERMS`), ordinary
English, academic boilerplate and web/file vocabulary (`NON_TECHNICAL_TERMS`).
The provider's own ranking position. **None of these produce an Evidence
object at all**, so none of them can push a candidate through the gate. They
are additionally stripped from the text vectors, so two abstracts that share
nothing but such words measure as *unrelated*, not as a strong match.

**A record's Institution.** The optional, curator-entered record-level
`institution` field (see below) is deliberately absent from every scoring
input. It is not in the federation allowlist that builds a cross-server
candidate, so it is not merely unweighted — it never reaches the scorer at all.
Two records from the same institution are not thereby related, any more than
two papers in the same journal are.

Both word lists are singular-folded at import (`_fold_variants`), because
`tokenize` folds plurals before anything else sees a token — an entry written
as `technologies` would otherwise never match the `technologie` that arrives.

### The Institution field is metadata, not a signal

`Paper.institution` is an **optional, record-level** string a curator types by
hand. It identifies the institution associated with the record; it is **not** an
assertion that every listed author belongs to it.

It is **never inferred** — not from the authors, not from the PIs, not from a
collection, not from the server URL, not from an email domain, not from a DOI
prefix. Whatever the curator typed, verbatim, is the whole answer, and blank is
a valid and unremarkable one. It is displayed exactly as entered: "University
of Chicago" is never abbreviated to "UChicago".

It is backward compatible in both directions: records published before the
field existed simply have no value, show no badge, and need no migration.

| Where | What |
| --- | --- |
| Curator form | a plain text input labelled `Institution (optional)` |
| Explorer / search cards | a compact outlined chip on the **author row**, right after the author text — not a line of its own under the journal |
| Paper details | the same chip on the byline |
| Ranking | **nothing.** See "Never evidence, alone or in combination" above |

### Why these thresholds

- **`SPECIFIC_DOCUMENT_FREQUENCY_RATIO = 0.15`** — specificity is measured
  against **this server's own corpus**, not a hardcoded vocabulary. A term
  carried by more than 15 % of the corpus is a field label ("photoemission" on
  a photoemission-heavy server), not a fingerprint. It still contributes to
  similarity; it just stops counting as *specific*.
- **Floor of 2 documents** — a ratio-only ceiling would rule out a term shared
  by exactly the two records being compared on any corpus smaller than ~14
  records, i.e. every new Qresp instance. That overlap is the *most* specific
  one there is.
- **`STRONG_SHARED_TERM_COUNT = 3` + `STRONG_SHARED_TERM_WEIGHT = 4.5`** — two
  shared rare terms coincide often enough (a shared instrument plus a shared
  element); three distinct ones do not. The weight floor stops three merely
  uncommon terms from clearing a bar meant for genuinely rare ones.
- **`MEDIUM_SHARED_TERM_COUNT = 2`** — a curated keyword is a deliberate
  statement about the record, so one is enough. A single word pulled out of an
  abstract ("functional") is a coincidence between neighbouring fields, so
  free-text overlap needs two.
- **`HIGH_TEXT_SIMILARITY = 0.34` / `MODERATE_TEXT_SIMILARITY = 0.16`** — at or
  above HIGH the two abstracts describe the same system or the same
  measurement. MODERATE is "plausibly adjacent", which is why it is only ever
  MEDIUM and only when a shared research area corroborates it.
- **Independence collapsing** — one shared two-word keyword arrives as three
  matching terms (the phrase and each word). Words covered by a shared phrase
  are not counted again, so a single tag cannot clear a bar meant for several
  unrelated terms.
- **Topic overlap excludes the shared tool** — otherwise every shared tool
  would corroborate itself and "same lab, different subject" would pass.

These are **starting values for a prototype**, deliberately expressed as named
module constants so a domain expert can retune them from the QA table below
without reading the algorithm.

### Ordering

`3 × strong + 1 × medium + cosine + min(shared IDF, 10)/10`.

**Related Qresp Records** then sorts year descending, then title. There,
ordering is presentation only: it can never promote a candidate that failed the
gate, because a failing candidate is not in the list to promote.

**Recommended External Papers** sorts by that same score descending, then
`provider_rank` ascending. There, ordering is the *whole* selection mechanism —
nothing was filtered, so a candidate's position is the only thing deciding
whether a reader sees it. The score is identical in both cases; what differs is
what happens to the candidates it ranks last.

---

## Caching and API economy

### No language model, no Gemini quota

Related Research calls **no** language model. Qresp's two AI features live in
`assist.py` and `curation.py`; nothing on this path imports either, and no
Gemini token or quota is consumed by rendering this section — asserted by
`test_related_cache.py::TestNoLanguageModelIsInvolved`, which also pins that
the only outbound hosts are the federated peer and Semantic Scholar.

### What is cached where, and why

| Layer | Where | Key | TTL |
| --- | --- | --- | --- |
| Semantic Scholar answer | **MongoDB** (`RelatedResearchCache`) | server + id (+ fingerprint, + algorithm version) | 7 days |
| Computed response (federated only) | memory | normalized server + id + **algorithm version** | 5 min fresh, +1 h stale |
| A peer's copy of one record | memory | origin + id | 15 min |
| A peer's whole corpus | memory | origin | 15 min |
| A peer or provider failure | memory | as above | **45 s** |

Only the provider answer is persisted. The rest is another server's data —
which Qresp must not keep — or a cheap recomputation, so it lives in the
process and disappears on restart. **No second Mongo collection was added**,
and the existing provider cache is still what prevents the second provider
call.

**Local records are computed every time.** There is nothing to save: the whole
answer comes from this server's own database and costs no peer and no provider
request. Caching it would have bought nothing and broken promises the product
already makes — a deactivated record disappears on the next reload, a newly
published one appears on it.

### The federation allowlist, exactly

Presence of `QRESP_FEDERATION_SERVERS` is decided by environment MEMBERSHIP,
never by whether its value looks empty.

| `QRESP_FEDERATION_SERVERS` | Allowlist |
| --- | --- |
| absent | the registry (HTTPS only) **plus** the shipped list |
| `https://a.example, https://b.example` | exactly those two |
| `""`, `" "`, `","`, `" , , "` | **empty — this server federates with nobody** |
| junk only (`not a url`) | **empty** — an explicit instruction naming nothing usable still means nobody |

An empty allowlist can never become an open one: every `?server=` is refused
with a 400, and the Explorer, which reads the same list from
`/api/federation/servers`, offers nothing rather than falling back.

> **The bug this replaced.** The value was `.strip()`ed and an empty result
> read as "not set", so `QRESP_FEDERATION_SERVERS=" "` — the documented way to
> switch federation off — silently restored the shipped list. An operator
> disabling a feature got it enabled.

### The Explorer's default server

`/explorer` opens on results rather than on a node picker, so the deployment
has to name which server that is. `/api/federation/servers` publishes it as
`default_server`, alongside the list it has always returned — an **additive**
field, so a client that only reads `servers` is unaffected.

| `QRESP_DEFAULT_EXPLORER_SERVER` | `default_server` |
| --- | --- |
| absent | the **first origin in the published (sorted) list** |
| an origin in the allowlist | that origin, canonicalized |
| an origin **not** in the allowlist | ignored, with a log line; falls back to the first listed origin |
| not https, or unparseable | ignored the same way |
| (any value, with an empty allowlist) | `""` — this deployment federates with nobody |

The value goes through the same `parse_origin` as every other origin, so a
trailing slash, a mixed-case host and an explicit `:443` all resolve to the
spelling the allowlist actually holds. It is then checked for MEMBERSHIP:
naming a server here can **pick among the federated ones and can never add
one**. That matters because the Explorer no longer asks the visitor which
node to search — a default outside the allowlist would send every first-time
visitor into a 400 naming a server they never chose.

`""` is a real answer, not a failure: the Explorer shows an in-page
"no node available" state with a Retry, rather than redirecting into a search
that cannot succeed.

Choosing servers by hand is still reachable at **`/explorer?choose=1`**, and
`/search?servers=a,b` is unchanged — federation is not reduced to one node,
it just stops being a toll gate on the way to the records.

### Choosing the TTLs

The feature exists so that a follow-up study published years later shows up on
an old record, so every number here is a trade between that and load:

- **7 days** for the provider answer: a recommendation index does not change
  hour to hour, and this is the only expensive third-party call. A record edit
  bypasses it anyway through the fingerprint.
- **5 minutes** fresh for a computed response, **plus an hour** stale: five
  minutes is far shorter than a curator's edit-and-check cycle, and the stale
  hour means a reader never waits for a peer, only ever for a background
  refresh they do not see.
- **15 minutes** for a peer's record and corpus: the corpus is the expensive
  read (every active record on that server) and is shared by every reader of
  every record on that peer.
- **45 seconds** for a failure: long enough that a hot detail page cannot turn
  one outage into a request storm, short enough that a reader who retries gets
  a real attempt rather than a cached "no".

### Single flight and stale-while-revalidate

Five readers opening the same federated record at the same moment cost the
peer **one** round of reads, not five: the first caller computes, the rest
wait on the same key and read what it stored.

Once an entry is stale, the reader gets the previous answer **immediately** and
**one** of them refreshes behind the others. `SingleFlight` is the wrong tool
for that — nobody is waiting for the result — so `RefreshGuard` instead lets
exactly one reader start the work and tells the rest there is nothing to do.

A background refresh that FAILS does not replace a real answer with an empty
one: the reader keeps being served the last good result for the rest of its
stale window. The failure is still recorded, as a **45-second cooldown** on
that key, so one unreachable peer is not re-tried by every page view; after the
cooldown exactly one new attempt is let through. The guard is released in a
`finally`, so an exception cannot strand a key, and it holds an entry only
while a refresh is in flight or a cooldown is unexpired — it tracks concurrent
work, not every record ever viewed.

Measured, and pinned by `test_related_cache.py`:

| Scenario | Peer requests | Provider requests |
| --- | --- | --- |
| 5 reloads of one federated record | **2** (was 10) | **2** (was 2) |
| 5 concurrent readers, same record | **2** | **2** |
| a second record on the same peer | +1 (corpus reused) | +2 |
| 5 reloads while the peer is failing | **1** | 0 |

### Algorithm version

`ALGORITHM_VERSION` is part of every cache key, in memory and in Mongo. A
change to what the algorithm produces therefore takes effect at once instead of
waiting for entries to age out — which matters most for exactly the entries the
change is meant to correct: the weak and empty ones. An entry written before
the field existed has none, so it is a miss. That is the whole migration.

**Current value: `"5"`.** Bumped from `"4"` when the external list stopped
being gate-filtered. Every `"4"` entry was written by the old policy, so its
external half is a gate-filtered list — often far shorter than the 25 the same
record yields today, and sometimes empty for a record that now has results.
Those entries must not be served, and the bump is what guarantees they are not:
they simply miss and are recomputed. Nothing is deleted or migrated; the stale
documents age out on their own TTL.

The federated in-process result cache is keyed by algorithm version too, so a
cross-server answer cannot outlive the policy that produced it either.

---

## Cache

`RelatedResearchCache` — a **separate collection** (`related_research_cache`),
keyed by paper id. Recommendations are never written into the canonical `Paper`
document: pinning them would freeze them at curation time and make a read look
like an edit.

**The key is server + id**, because a 24-hex ObjectId is only unique within one
server. `federation.cache_key` builds it:

| Record | `paper_id` |
| --- | --- |
| on this server | `5983afce759061384c1aae48` — the bare id |
| on a peer | `https://peer.example.org\|5983afce759061384c1aae48` |

A local record therefore keeps exactly the key it had before federation
existed: **every entry written earlier is still a hit, and there is no
migration.** A remote record is namespaced by its origin, so two servers that
happen to issue the same id can never serve each other's recommendations.

- **Only external results are cached.** Internal ones are recomputed per
  request (see above).
- **Default TTL 7 days** (`QRESP_RELATED_RESEARCH_CACHE_DAYS`, capped at 90).
- **A valid entry is returned immediately and the provider is not called.**
  "Valid" means unexpired **and** still describing the record as it stands —
  see the fingerprint below.
- **An expired entry is refreshed.**
- **A failed refresh returns the last successful results with `stale: true`**;
  `last_success_at` deliberately outlives the failure so this is possible.
- A failure is remembered for **1 hour only** (`FAILURE_RETRY_SECONDS`), enough
  to stop a hot page from hammering a failing or rate-limiting provider,
  short enough that recovery is quick. `unresolved` (not in the index) is a
  stable fact and keeps the full TTL.
- **Stored:** the returned candidates' public bibliographic metadata (internal:
  the ones that passed the gate; external: the top 25 after re-ranking), the
  reasons Qresp computed, and the metadata fingerprint. **Never stored:** the
  API key, any header, any provider error body, any session/user/owner data,
  any RCC URL or file path, any file content.

### Metadata fingerprint — editing a record refreshes its answer at once

A cached answer describes the record **as it was**. Keyed on the paper id and
an expiry alone, a record edited a minute after publication kept serving
recommendations computed from the old title and abstract for a week.

`RelatedResearchCache.fingerprint` is a SHA-256 of exactly the public
scientific metadata a recommendation depends on
(`relatedness.metadata_fingerprint`, pure and unit-tested). An entry whose
fingerprint does not match the record is a **miss whatever its expiry says**.

**In the fingerprint** — the same allowlist `build_internal_profile` reads, so
the two cannot drift apart:

`reference.DOI`, `reference.title`, `reference.publishedAbstract`,
`reference.authors` (first/middle/last), `tags`, `collections`, chart
`caption` + `properties`, dataset and script `readme` + `keywords`, tool
`packageName` / `programName` / `facilityname` / `facilityName` /
`measurement` / `readme`.

**Never in the fingerprint** — so they can neither invalidate an entry nor
appear in one: `owner_email`, `editor_emails`, `edit_history`,
`updated_by_email`, `is_active`, `info.insertedBy` (curator name, email,
affiliation), every RCC URL and file path (`serverPath`, `fileServerPath`,
`folderAbsolutePath`, `downloadPath`, `notebookPath`), every `files` list and
all file content, `imageFile`, drafts, sessions and CSRF tokens.

RAW values are hashed, not normalized ones: the question is "did the curator
change this record", not "did the change survive tokenization".

**No migration.** An entry written before this field existed has no
fingerprint, so it can never match and is simply refetched and rewritten on
the next request. `FINGERPRINT_VERSION` is bumped only if the allowlist
changes, which invalidates every entry computed under the old one.

---

## Security

- Public **active** records only; deactivated records are visible only to those
  who could already edit them, exactly as the detail page is.
- A read **never** changes a `Paper`, a draft, ownership, publication state, or
  any curation state. The only write is to `related_research_cache`.
- A provider timeout, 404, 429 or malformed response degrades **the external
  section only** — never a 500, and never the internal list.
- Provider error bodies, request headers and the API key never reach the
  response or the logs; only the failure kind and the HTTP status code are
  logged.
- **nginx:** `location ~ ^/api/paper/[^/]+/related$` gets its own
  `api_related` zone at 60 r/m with `burst=30`. It sits deliberately between
  `api_general` (600 r/m — too permissive for something that can reach outward)
  and `api_costly` (20 r/m — would throttle ordinary browsing, since this
  renders with every detail page). A regex location so it wins over the `/api`
  prefix without disturbing any other paper sub-resource.

### `?server=` is not a URL this server will fetch

The parameter selects from a list; it never supplies a target. Checks are
applied in this order, so a later one can never be reached around:

| # | Rule | Refuses |
| --- | --- | --- |
| 1 | shape (`federation.parse_origin`) | credentials (`https://u:p@host`), a query or fragment, any path, non-http(s) schemes, a non-ASCII/percent-encoded/malformed host, an out-of-range port |
| 2 | "is this us" | loopback and this server's own host → answered locally, never fetched |
| 3 | HTTPS | plaintext to a peer, even if the registry lists it |
| 4 | literal address | loopback, private, link-local (`169.254.169.254`), unique-local, multicast, reserved — **before** the allowlist, so a compromised registry cannot name one |
| 5 | allowlist | exact origin match — no prefix, suffix or subdomain rule a lookalike could satisfy |
| 5a | registry transport | the registry itself is fetched over **HTTPS only**; an `http://` registry is not requested at all and degrades to "no registry" (the shipped list still applies). It decides the outbound allowlist, so reading it in plaintext would let anyone on the path add themselves to it |
| 6 | **DNS** | every address the name currently resolves to must be public, and a name that does not resolve is refused. The allowlist controls names; DNS controls where a name points, and an allowlisted host answering `127.0.0.1` is the standard way an allowlist becomes a request against the machine itself |

Then, on the request itself: `allow_redirects=False` (a redirect is how an
allowlisted origin would otherwise become a request somewhere else), an 8 s
timeout, and an 8 MB cap enforced **while reading** rather than from a
`Content-Length` the peer controls.

A registry outage yields an **empty** allowlist, so every remote request is
refused and every local one is untouched. Failing closed is the only honest
option: an empty allowlist cannot authorise anything.

Nothing is sent to a peer but two plain GETs — no credential, no session, no
user data, no header beyond the `User-Agent`.

---

## Environment variables

All read from `os.environ` **only** — deliberately not `Config.get_setting`,
which falls back to `config.ini`. There is no `config.ini` fallback for any of
these, by design: neither the switch for an outbound call nor a credential
should be settable (or accidentally committable) there.

| Variable | Default | Notes |
| --- | --- | --- |
| `QRESP_RELATED_RESEARCH_ENABLED` | *(off)* | **Master switch** for the whole section. Off ⇒ `enabled: false`, nothing rendered, no provider call. |
| `QRESP_RELATED_EXTERNAL_ENABLED` | *(off)* | Enables the **outbound** Semantic Scholar call. Subordinate: worthless unless the master switch is also on. |
| `QRESP_SEMANTIC_SCHOLAR_API_KEY` | *(none)* | **Optional.** Semantic Scholar serves this API without a key at a lower rate limit. Without one, no credential header is sent and everything still works; with one it is sent as `x-api-key` only. |
| `QRESP_SEMANTIC_SCHOLAR_TIMEOUT_SECONDS` | `8` | Capped at 30. |
| `QRESP_RELATED_RESEARCH_CACHE_DAYS` | `7` | Capped at 90. |
| `QRESP_FEDERATION_SERVERS` | *(absent)* | Comma-separated Qresp origins. When set it is the **only** allowlist source — the registry and the shipped list are both ignored. This is the authoritative way to configure federation in a deployment. Set it to `""`, a space or a comma to switch federation off entirely — an empty value means **nobody**, never "fall back to the shipped list". |

The internal list never depends on any of the last three: a missing key or a
dead provider leaves Related Qresp Records fully working.

### The two switches

Related Qresp Records is local computation over records this server already
holds. Recommended External Papers is a request to a third party. Those are
different decisions, so they are different variables — an operator may
reasonably want the first and no outbound traffic at all.

| `..._RESEARCH_ENABLED` | `..._EXTERNAL_ENABLED` | Internal list | Provider call | External cache | `external.status` | Frontend |
| --- | --- | --- | --- | --- | --- | --- |
| off | off | not computed | never | untouched | `disabled` | whole section hidden |
| off | **on** | not computed | **never** | untouched | `disabled` | whole section hidden |
| on | off | **computed and shown** | **never** | **neither read nor written** | `disabled` | internal section only; the external heading is not rendered at all |
| on | on | computed and shown | on cache miss | read and written | `ok` / `unresolved` / `unavailable` | both sections |

The second row is the one worth stating explicitly: setting only the external
variable must not make a server whose operator never enabled the feature start
calling out. `config()["EXTERNAL_ENABLED"]` is the master AND the external
flag, never the external flag alone.

Internal-only, for staging:

```sh
QRESP_RELATED_RESEARCH_ENABLED=1
QRESP_RELATED_EXTERNAL_ENABLED=      # unset or empty: no outbound traffic
```

In that mode the external cache collection is not touched at all — not even
read — so an entry left over from a period when external was on is ignored
rather than replayed.

---

## Reader feedback — "Were these recommendations helpful?"

Every other measurement of this feature is either arithmetic the gate did to
itself or a domain expert rating a spreadsheet offline. This is the one signal
that comes from the person the recommendations are for: a 1–5 rating under the
external list, with optional reason codes for a 1 or a 2 and an optional short
comment.

| | |
| --- | --- |
| `POST /api/paper/{id}/related/feedback` | store or update **my** rating |
| `GET /api/paper/{id}/related/feedback` | read back **my** rating |
| `GET /api/related/feedback/summary` | counts, **administrators only** |
| Model | `RecommendationFeedback` (`recommendation_feedback`) |
| UI | `frontend/components/Paper/RecommendationFeedback.js` |

### Signed in only

**Rating requires an account, and this is a reversal of how it first shipped.**

> **The defect.** Anonymous rating was keyed by a per-session token. A reader
> could mint a new identity by clearing a cookie, so "one opinion per reader"
> was not true and one person with a browser could move the average as far as
> they liked. There is no way to key an anonymous reader durably without
> collecting something — an address, a fingerprint — that this feature has no
> business collecting.

Readers without an account see **"Sign in to rate these recommendations"**
linking to the project's own `/login`, and nothing is sent. Their opinion is
not collected, which measures fewer people and measures them honestly. Rows
written during the anonymous period carry no `respondent_kind` and are left
out of every figure rather than deleted.

The respondent is an **HMAC of the durable account identifier**
(`account_id`, falling back to the normalized email) under the deployment's
Flask secret. It cannot be reversed to an account, no endpoint returns it, and
its only job is to make a second submission an UPDATE. **With no secret
configured, nothing is stored at all** — a hardcoded fallback key is a
published key, and a signature under it would prove nothing while still
looking like it did.

### The feedback context — what the rating is *about*

A rating only means something if the server knows what "these recommendations"
were. It used to take the client's word for the record id, the result count
and the page. All of it was a request body, so all of it was assertable —
including a record that does not exist and a list that was empty.

`GET /api/paper/{id}/related` now mints a short-lived signed token
(`external.feedback_context`, `backend/project/feedback_context.py`) **after**
it has resolved a public, active record and computed a **non-empty** external
list. `POST` stores nothing without one.

| Bound into the signature | Deliberately absent |
| --- | --- |
| normalized cache key (record **+** source server) | recommended titles and DOIs |
| `source=external` | gate scores and `Why related` reasons |
| the real result count | any user id, account or email |
| the real page count | any session or request metadata |
| issued/expiry times, version, purpose | |

Verification is a **local signature check** — no provider request, no peer
request, no cache read. The POST refuses a token that is missing, malformed,
unsigned, expired (**410**, reload for a fresh one), for another
record/server/list, or that describes no results.

`results_shown` is stored **from the token**, and is not a request field at
all. `page_at_submit` and `pages_viewed` are clamped to the page count the
token attests, and `pages_viewed` is never below `page_at_submit`.

The token is stamped on the way **out**, after every cache: the federated
response is cached for 5 minutes fresh plus an hour stale, and the external
answer for a week, so a token baked into either would outlive its expiry. It
carries nothing about the reader, so stamping a shared body does not
personalise it.

### What is stored, and what is not

**Stored:** the rating, the reason codes, the comment, which record and which
list, and the counts the token attests.

**Never stored, and never read on this path:** the IP address, the
`User-Agent`, any other request header, the reader's email or account id in
readable form, the recommendation scores or reasons, the recommended papers'
titles and DOIs. There is no analytics SDK on this path and no third party is
contacted.

`GET .../related/feedback` returns **one person's answer — theirs**. The admin
summary returns **counts only**: no comment text, no respondent key, no record
id, no individual response. `average_rating` is `null` when nobody has
answered, never `0` — which is not a rating a reader can give.

---

## Domain-quality evaluation CLI

`backend/project/tools/related_eval.py` — a **read-only, development/QA
command line**. It is not an endpoint, not in `swagger.yml`, and not reachable
over HTTP.

It exists because the gate's own accept/reject decision cannot be the answer
key for judging the gate. The CLI lays the verdicts out beside the candidates
that were thrown away, so a person can rate them.

**It will not:** write to any Paper, Draft, cache or MongoDB; call
`/api/paper/{id}/related` (so the production cache and the quota behind it are
untouched); make any external request without `--live`; fill in a rating;
or emit curator identity, owner/editor fields, RCC URLs, file-server paths,
file names, the API key or any header.

### Collect

```sh
cd backend
python -m project.tools.related_eval collect \
  --api-base https://<a-qresp-instance> \
  --sample-size 18 \
  --output-dir ../related-eval-out \
  --live --rate-limit 0.7 --max-retries 2
```

No instance URL is hardcoded anywhere in the tool; `--api-base` is required.
`--ids-file FILE` (one record id per line; blank lines and `#` comments
ignored, read as `utf-8-sig` so a Windows BOM is harmless) replaces
`--sample-size`. Drop
`--live` to evaluate the internal list only, with zero external requests.
`--review-rejected N` (default 5) sets how many near-misses per source go into
the review file — those are what expose false negatives. `--include-flagged`
samples records the triage set aside. `--insecure` skips TLS verification for
a self-signed staging tunnel.

The API key is read **only** from `QRESP_SEMANTIC_SCHOLAR_API_KEY` and is
reported only as `api_key_present: true|false`.

Requests are sequential and paced (default 1/s); HTTP 429 is retried a bounded
number of times, honouring `Retry-After` up to 60 s.

### Inputs

`GET /api/search` for the record pool and `GET /api/paper/{id}` for artifact
metadata. Both the legacy name-mangled keys (`_Search__id`, `_Search__title`,
`_Search__abstract`, `_Search__doi`, `_Search__tags`, `_Search__collections`,
`_Search__publication`, `_Search__year`) and plain `id`/`title`/`abstract`/
`doi` are understood, in one place: `eval_core.normalize_search_record`.

**Sampling is deterministic** — no RNG, so a re-run is comparable to the run
before it. Metadata-rich records (DOI + abstract + tags) are preferred, and
selection round-robins across collections/publications so one collection
cannot crowd out the rest.

**Triage never deletes anything.** Records whose titles read as scaffolding
(`STAGING TEST`, `QA`, `placeholder`, `asdf`, …), whose tags are keyboard
mash, or whose title and abstract share no content words at all are reported
with a reason and held out of the default sample; `--include-flagged` puts
them back. Merely thin records (short abstract, no DOI) are still evaluated,
carrying their flags into the output.

### Candidate pools

| Pool | What it is |
| --- | --- |
| `internal` | Related Qresp Records, via the production ranking |
| `recommendations_default` | Recommendations with no `from` — **exactly what production asks for**, and the only pool a product decision may rest on |
| `recommendations_all_cs` | Recommendations with `from=all-cs` — diagnostic only |
| `title_resolution` | The paper resolved by title instead of DOI — diagnostic only |

Every candidate is kept, accepted or not, with its `rank`, `provider_rank`,
`gate_score`, score components, decision, `rejection_code`, prose
`rejection_reason`, and — the part that makes it a measurement of the
*product* — where production would put it:

| Field | Meaning |
| --- | --- |
| `visible` | would a reader see this at all? |
| `display_rank` | its 1-based slot in the rendered list (1–25 external, 1–3 internal), or `null` |
| `display_page` | which page of five it lands on (external), or `null` |
| `provider_rank` | its position in the **provider's** answer. Used only as a tie-break in the external re-ranking; not the provider's score, never a reason, never displayed |
| `in_top5` | the historical name for `visible`; kept so older artifacts still read |

`gate_decision` is recorded for external candidates as a **diagnostic**, not as
an explanation of visibility. "The gate accepted it" and "a reader sees it" are
now fully independent facts: with a 25-slot list drawn from 150 ungated
candidates, a rejected candidate can be on page 1 and an accepted one can be
nowhere at all. **The evaluator must never report gate-passing as the reason an
external item is visible** — for the external list, the only reason is its
position after re-ranking.

### Before it spends anything

`collect` prints the request plan first, live run or not:

```text
PLANNED EXTERNAL REQUESTS (upper bound)
  records                      65
  ...with a DOI                65
  resolution calls             130
  recommendation calls         195  (3 pools x 65 records)
  TOTAL                        325
  rate limit                   0.50 requests/second
  minimum wall time            10.8 minutes
  retries after HTTP 429       up to 2, honouring Retry-After
  candidates requested per call 150
  external display cap          25 (5 per page x 5 pages)
```

An upper bound, not a guess: a record whose lookup fails skips the pools
behind it, so the real total can only be lower. The corpus size is **read from
`/api/search` at run time** and printed — never assumed from a number written
down when the plan was made.

### Outputs

| File | Contents |
| --- | --- |
| `raw-results.jsonl` | one line per record: the record, every candidate from every pool with scores, verdicts, display rank/page, and the provider outcome and pipeline counts per pool |
| `human-review.tsv` | `pair_id, record_id, record_title, source, candidate_title, reasons, gate_score, gate_decision, human_rating, human_note` — the shown candidates plus the best near-misses, with **`human_rating` blank** |
| `external-review.tsv` | the **blind** sheet for Recommended External Papers (see below), **`human_rating` blank** |
| `summary.json` | sample size, flagged vs not-sampled records, per-pool coverage and gate pass rate, the `external_production` block, the review-export report, provider request counts |
| `metrics.json` | written by `summarize` |

`human_rating` accepts only `related`, `partial` or `unrelated` (blank means
unrated). Anything else stops the scoring with the offending line numbers.

`summary.json` carries **`external_production`** — the production pool alone,
apart from the diagnostic ones: provider resolution ratio, records with
candidates, records with a displayed result, and the funnel
`raw_candidates → valid_candidates → after_dedupe → scored_candidates → shown`,
plus `shown_by_page`. Every one of those is a **count**. None of them is a
quality claim: how many papers were shown says nothing about whether they are
related.

It also carries a **`gate_would_pass`** sub-dict. That is informational only —
how many external candidates the strict gate *would* have accepted, had it been
consulted. It is not a visibility statistic and must never be reported as the
reason an external candidate was shown. (The old `gate_pass_rate` field is
gone: under the current policy it would be trivially ≈ 1.0 of what is shown and
would invite exactly that misreading.)

### The blind external review sheet

`external-review.tsv` is what a domain expert actually fills in for this
feature. It holds three groups, and **a reviewer cannot tell them apart**:

| Group | How many | Flag |
| --- | --- | --- |
| every **visible page-1** result | all of them | — |
| a stratified sample of visible **pages 2–5** | `--external-review-sample`, default 60 | round-robin over the pages, preferring a record not yet sampled |
| a stratified sample of candidates a reader was **NOT shown** | `--external-rejected-sample`, default 60 | round-robin over score-band tertiles, preferring a record not yet sampled |

No RNG anywhere, so a re-run is comparable to the run before it.

> **Not shown ≠ gate-rejected.** The third group is selected purely by
> `visible == false`. Under the current policy the gate does not remove
> anything from the external list, so a candidate it *would* reject can be on
> screen, and one it *would* accept can fall past the 25-result display cap.
> Selecting by gate verdict would therefore both miss real hidden candidates
> and mislabel visible ones. (The field name `rejected_*` is kept for output
> stability with existing consumers; read it as "not shown".)
>
> **Why the not-shown sample exists.** A sheet built only from visible
> candidates can surface false *positives* and **structurally never a single
> false negative** — and the resulting `0` is indistinguishable in the JSON
> from a measured `0`. A false negative is the failure the ranking cannot see
> in itself, so the only way to find one is to put candidates the reader never
> saw in front of a person too.

| Column | |
| --- | --- |
| `pair_id, record_id, record_title, source, candidate_title, candidate_year, candidate_doi` | the two papers' own bibliography |
| `human_rating` | `related` / `partial` / `unrelated` — **a person's column, always blank when written** |
| `human_note` | free text |

**What is missing from it is the point.** No gate score, no accept/reject
verdict, no "Why related" sentence, no display rank, no page number. A
reviewer told "the system scored this 11.4 and shows it first" mostly agrees
with the system, and the question is whether the system is right. All of it
stays in `raw-results.jsonl`, and `summarize` joins the ratings back by
`pair_id`, so nothing is lost by leaving it out of the sheet.

Blindness is not only about columns: rows are ordered by the opaque `pair_id`,
because appending the rejected sample after the visible one would tell a
reviewer **by position alone** which rows the system had already discarded.

It is a **protected file**: `ai-label` refuses to start if an output name would
collide with it, and verifies its timestamp afterwards. **No AI may fill a
human rating, and an AI label is never ground truth.**

### Summarize

```sh
python -m project.tools.related_eval summarize --output-dir ../related-eval-out
```

Reads whichever review sheets are present — `human-review.tsv`,
`external-review.tsv`, or both — and writes `metrics.json`.

#### What the denominator is, and is not

**The universe is `raw-results.jsonl`, never the review file.** Precision is
measured over the **unique visible candidates** the raw results say production
displayed. A review file is a *work list*: it can name a candidate twice, or
not at all, and neither fact changes what the product showed.

> **The bug this replaced.** Every visible page-1 result appears in *both*
> sheets. The metrics counted review **rows**, so the 65-record artifact
> reported **480 "visible rows"** for a list that displayed **307** papers —
> and both halves of every fraction moved according to how many sheets a
> reviewer happened to be handed. It now reports 307, with
> `duplicate_rows_collapsed: 173`.

Ratings are collapsed **per candidate** before anything is counted:

| Two rows for one candidate | Result |
| --- | --- |
| blank + rated | the rating — a blank is an absence, not a vote |
| the same rating twice | counted once |
| **two different ratings** | **`summarize` stops (exit 3)** and prints the offending candidates |

Guessing which of two contradictory ratings a person meant would produce a
number nobody can reproduce, so the tool refuses rather than choosing.

#### `metrics.external_display`

| Metric | |
| --- | --- |
| `visible_candidates` | unique visible candidates in the production pool — the denominator |
| `visible_candidates_rated` / `_unrated` / `rating_coverage` | how much of it a person has actually done |
| `all_visible`, `page_1`, `pages_2_to_5`, `per_page.{1..5}` | strict (`related`) and lenient (`related` + `partial`) precision, each with its own `available`, `candidates`, `rated` |
| `false_positives` | a **visible** paper an expert rated unrelated. Accepted-but-below-the-cap candidates are excluded: nobody saw them |
| `false_negatives_sampled` | rejected candidates rated `related`/`partial`, with `sampled_candidates` (the denominator), `rated`, `rating_coverage` and `rejected_candidates_in_pool` |
| `records_with_an_accepted_external_result` | the share of source papers with at least one |
| `review_rows` / `duplicate_rows_collapsed` / `rows_unmatched` | the join, so row counts and candidate counts can never be confused |

#### Unmeasured is `null`, never `0`

**Unrated candidates are excluded from every metric and counted separately**, so
a half-finished review cannot masquerade as a verdict. When nothing relevant
has been rated:

- `precision_strict` / `precision_lenient` are **`null`**, and `available` is
  `false`;
- `false_negatives_sampled.count` is **`null`**, with `available: false`;
- the CLI prints `n/a` and says in words that there is no precision figure.

"Nobody has rated this" and "everything rated here was unrelated" are opposite
findings. A JSON consumer that sees `0.0` for both will read an *unmeasured*
feature as a *0 %-accurate* one, which is why these fields are nullable and
why every one of them carries an explicit `available` flag beside it.

`false_negatives_sampled` is a **sample**, and the field names say so. Divide
by `sampled_candidates`, never by `rejected_candidates_in_pool`; a sampled
count is not a corpus-wide false-negative rate.

---

## Tests

```text
backend/project/tests/test_relatedness.py         38 tests — the pure gate + fingerprint,
                                                             and rerank_external: a
                                                             gate-failing candidate is kept,
                                                             provider_rank breaks ties only
backend/project/tests/test_related_research.py    95 tests — endpoint/provider/cache/switches,
                                                             federated records, limit=150,
                                                             the 25-result external cap
backend/project/tests/test_federation.py          56 tests — allowlist, refusals, SSRF, DNS,
                                                             transport bounds, what is copied
backend/project/tests/test_relatedness_quality.py 13 tests — the product rule: technical
                                                             overlap, and nothing else
backend/project/tests/test_related_cache.py       25 tests — call counts, TTL, single flight,
                                                             SWR, why the list is empty,
                                                             zero Gemini, the version bump
backend/project/tests/test_related_hardening.py   26 tests — the four pre-deployment contracts
                                                             + the pipeline counts
backend/project/tests/test_related_eval.py        79 tests — the evaluation CLI, display
                                                             rank/page, the blind export,
                                                             per-page precision
backend/project/tests/test_ai_review.py           99 tests — AI provisional labelling + smoke sample
frontend/__tests__/RelatedResearch.spec.js        59 tests — the section, its four states, the
                                                             existence contract, 0-3 internal
                                                             and 0-25 paginated external results
frontend/__tests__/ExplorerServers.spec.js         4 tests — one federation list, from the
                                                             backend that enforces it
frontend/__tests__/PaperDetailsRelated.spec.js     4 tests — page composition
backend/project/tests/test_nginx_config.py        +1 test — the rate-limit zone
```

No DOI, paper title, material, method or facility name is hardcoded in
`relatedness.py`, `related.py`, or in any test's *algorithm*. Test fixtures use
invented vocabulary precisely so the thresholds, not a lookup table, are what
is under test.

---

## Product wording

The section is headed **Suggested Related Papers** and always carries, in
every state including loading and empty:

> These suggestions are generated automatically from publication metadata and
> research-similarity signals. They may be incomplete or inaccurate. Review
> each paper before relying on the suggested connection.

**The UI must not say "AI", "AI-assisted" or "AI recommendations."** No model
runs when the section is served, so the claim would be false — and a user who
believes a model vetted these connections would trust them more than the
arithmetic warrants. If a model ever reranks at serve time, that is the moment
the wording changes, and not before. A frontend test asserts the section
contains no such claim.

The result policies: at most 3 internal and 25 external; internal candidates
below the quality gate stay hidden; an empty list is an acceptable answer; and
every candidate comes from a real Qresp record or a real provider result.
Nothing generates a title, a DOI or a paper.

**The external section says what it actually is.** It is headed *Recommended
External Papers*, and exactly one line above the results reads:

> Suggestions from Semantic Scholar, ordered using Qresp's publication metadata
> similarity signals. They may be incomplete or inaccurate; review each paper
> before relying on it.

Each external result keeps its **Recommended by Semantic Scholar** badge. The
UI must **not** describe an external result as "verified related", and must not
claim external results are "shown only when Qresp found evidence they are
related" — that sentence was true under the old gate-filtered policy and is
false now.

**External evidence gets its own heading.** When an external result has
non-empty Qresp evidence it is headed **"Qresp ranking signals"** — what moved
it up the list, not the reason it is on the list. When it has none, no heading
and no explanation is shown; nothing is invented to fill the space. Internal
results keep **"Why related"**, which remains accurate for them: the reasons
ARE why the record cleared the gate.

**No numeric "relation score" is displayed** in either list — no percentage, no
star rating, no confidence, and never the provider's own score. There is no
such number to show a reader, and inventing one would dress arithmetic up as a
verdict.

### Pagination of the external list

Recommended External Papers is laid out **five per page, at most five pages**;
Related Qresp Records is not paginated at all. The control renders only when
there is more than one page.

**The range is announced but not drawn.** There is no visible
"Showing 1-5 of 15…" line: the page numbers, `aria-current="page"` on the
current one, and the pager's `aria-label` ("Recommended external papers pages")
are what a sighted reader needs. A screen-reader-only live region carries the
same range text ("Showing 6-10 of 23 recommended external papers") so a
keyboard or screen-reader user is told what changed rather than having to count
list items. The pager is fully keyboard operable and keeps its visible focus
ring.

The page resets to 1 whenever the record id, the source server, or the fetched
answer changes: page 4 of the previous record's list is meaningless against a
new one, and against a shorter list would render an empty section under a
heading that promises results.

The slice comes from `external.results`, which the backend returned in full.
**Changing pages performs no fetch**, so the provider is never contacted by
someone browsing pages — asserted by a frontend test that counts `axios.get`
calls across a page change.

### The section exists, or it is explicitly off

On a published detail page with the master switch on, the section **always
renders**. There are four visible states and exactly three ways to render
nothing:

| State | When | What a reader sees |
| --- | --- | --- |
| loading | request in flight | "Looking for related research…" + progress bar |
| results | at least one list is non-empty | the lists |
| empty | the backend answered and there is nothing to show — internally, nothing cleared the gate; externally, the provider proposed nothing usable | "No sufficiently related papers were found." |
| unavailable | the request failed, or the source Qresp server could not be read | "Related research is unavailable right now…" + **Try again** |
| *(nothing)* | `enabled: false` | the deployment does not have this feature |
| *(nothing)* | unpublished preview | excluded by the page, which never mounts the component |
| *(nothing)* | the record itself failed to load | there is no detail page at all |

Only the external half may fail on its own: a Semantic Scholar timeout or 429
leaves Related Qresp Records intact and marks the external subsection alone.

> **Why this is written down.** The section used to catch any error and render
> `null`. A failed request, a deployment without the feature, and "nothing is
> related to this paper" were then indistinguishable — all three were an
> absent section. Only the last of those is a statement about the record, and
> a reader had no way to know which one they were looking at.

`useEffect` depends on **both** `paperId` and `server`, and resets `loading`,
`data` and the error flag when either changes: the same id on a different
Qresp server is a different paper, so showing the previous server's answer
while the new one loads would attribute one server's results to another.

---

## AI-based provisional evaluation (triage only)

> **This is NOT expert ground truth.** It is not validated and not verified.
> Its only job is to decide which 15–30 pairs a domain expert should read
> first. **No threshold and no production scoring may be changed on the
> strength of these labels.**

135 rows is a lot to read cold, and the person who has to read them is not a
specialist in these fields. So a language model gives every pair a provisional
opinion, and the pairs where that opinion *disagrees* with the gate become the
expert's shortlist.

```sh
cd backend
export QRESP_GEMINI_ENABLED=1
export QRESP_GEMINI_API_KEY='...'        # never committed, never logged
python -m project.tools.related_eval ai-label \
  --output-dir ../related-eval-out \
  --review-file ../related-eval-out/first-pass-human-review.tsv \
  --sources internal,recommendations_default \
  --rate-limit 0.5
```

`--dry-run` builds and blind-checks every payload while contacting no
provider. `--limit N` bounds a trial run. `--retry-errors` re-asks only the
pairs that previously failed. Without a key the command refuses (exit 3)
rather than pretending.

### The review file is the work list

**`--review-file` (default `<output-dir>/human-review.tsv`) decides what gets
judged. `raw-results.jsonl` is only where the abstracts and bibliography are
looked up.**

This distinction is the whole cost model, and getting it wrong is expensive:
raw-results holds every candidate the gate ever scored — 2,041 on the current
artifacts, 1,434 of them in the two first-pass sources — while the review file
names 135. An earlier version judged the raw list, which was a 10× overspend
on pairs nobody would ever read.

`--limit` applies **after** the whitelist, never to the raw list.

Each review row must resolve to **exactly one** raw candidate. Matching uses
`pair_id` when both sides carry it (`collect` now writes one, derived from
record id + source + the candidate's most durable key), and falls back to
`record_id + source + candidate_title` for review files written before that
column existed. A row matching nothing is *unmatched*; a row matching several
is *ambiguous*; **either one aborts the run before a single provider call**.
Picking the first hit would file an answer about one paper under another
paper's name, and nothing downstream would ever show it.

### Preflight

Every run — including `--dry-run` — prints this before spending anything:

```text
PREFLIGHT
  raw_pairs                    1434
  review_rows                  135
  matched_pairs                135
  unmatched_pairs              0
  ambiguous_pairs              0
  pairs_with_both_abstracts    0
  pairs_with_one_abstract      0
  pairs_with_no_abstract       135
  cached_pairs                 0
  planned_provider_calls       0
```

`planned_provider_calls` is the number to budget against. It is the matched
pairs minus what the cache already holds, minus anything that cannot be
judged.

### No abstracts, no judgement

**A pair where NEITHER paper has an abstract is not sent.** It is recorded as
`insufficient_metadata` and costs nothing. Two titles are not enough to judge
relatedness on, and an answer produced from them would arrive in the file
looking exactly like every other answer.

`--allow-title-only` opts in, and forces confidence to `low`.

The transcript above is the real state of the delivered artifacts: they were
collected before abstracts were stored, so **every one of the 135 pairs is
title-only and a run today would make zero calls**. Re-collect first.

### Two properties that make the opinion worth having

**It is blind.** `ai_review.blind_pair_payload` is the only place a payload is
built, and it carries just the two papers' own bibliography — title, abstract,
and optionally year, DOI and venue. The gate's score, its accept/reject
verdict, its reasons, the candidate's rank, whether production would show it,
and even which pool it came from are all absent. A model told "the existing
system rejected this" would mostly agree with the existing system, and the
point is an independent second opinion. The payload is asserted blind again,
on its serialized form, immediately before it leaves the process.

**Confidence is bounded locally.** When either abstract is missing the
confidence is forced to `low` *after* the model answers. The model is not
asked to police itself, because a judgement made from a title alone is not a
confident one whatever it claims.

One pair per request, deliberately: batching would let the model rank
candidates against one another and drift into reproducing an ordering, when
what is wanted is a single independent judgement.

### Output contract

| Field | Values |
| --- | --- |
| `ai_rating` | `related` / `partial` / `unrelated` |
| `ai_confidence` | `high` / `medium` / `low` |
| `ai_reason` | one or two sentences naming the specific overlap or mismatch |
| `ai_status` | `completed` / `insufficient_metadata` / `provider_error` |

The provider is asked for structured JSON against a narrow schema, and the
answer is **re-validated locally anyway**: a value outside an enum is refused
outright, never coerced to the nearest one — a silently corrected label would
be indistinguishable from a real one in the review file.

| File | Contents |
| --- | --- |
| `ai-review.jsonl` | one line per judged pair; also the resume cache |
| — | *(judged pairs are those the review file named, never the whole raw list)* |
| `ai-review.tsv` | the same, readable |
| `ai-summary.json` | rating/confidence/status counts, per-source breakdown, gate-agreement rate |
| `expert-review.tsv` | **the shortlist — at most 30 rows**, `human_rating` blank |

Judgements are appended and flushed one at a time, so an interrupted run keeps
everything it already paid for and a re-run asks only about what is left. A
provider failure is recorded against that pair and the sweep continues.

`human-review.tsv` and `first-pass-human-review.tsv` are never written; the
command refuses to start if an output name would collide with one, and
verifies their timestamps afterwards.

### How the shortlist is chosen

Two tiers. **Every pair where the gate and the AI actually contradict each
other goes in first, at any shortlist size** — a reviewer with ten slots
should spend all ten on contested pairs, not four of them on a random sample
of pairs everybody already agrees about. Within a tier the categories
alternate, so a bucket of two hundred false positives cannot bury the four
false negatives beside it.

| Tier | Category | Why it is worth an expert's time |
| --- | --- | --- |
| 1 | `gate_accepted_ai_unrelated` | possible false positive — shown to users but maybe irrelevant |
| 1 | `gate_rejected_ai_related_or_partial` | possible false negative — the failure the gate cannot see in itself |
| 2 | `ai_low_confidence` | the machine could not tell; a person must |
| 2 | `internal_vs_external_disagreement` | the two sources disagree sharply for one record |
| 2 | `random_sample` | an unbiased control against the targeted buckets |

Each pair lands in exactly one category, so one disagreement is not counted
five times.

### What counts as a disagreement

One helper, `ai_review.gate_ai_verdict`, and both the summary and the
shortlist use it. They used to carry separate hardcoded conditions and had
drifted apart: the summary treated `partial` as a relationship on both sides
of the gate, while the shortlist recognised only `related` as a false
negative. A real 10-pair run therefore reported **four** disagreements and
shortlisted **three**, with the fourth quietly filed under `random_sample`.

| Gate | AI rating | Verdict |
| --- | --- | --- |
| accepted | `related` / `partial` | agreement |
| accepted | `unrelated` | **false positive** |
| rejected | `unrelated` | agreement |
| rejected | `related` / `partial` | **false negative** |

`partial` means "there is a relationship here, weakly" — which contradicts a
reject exactly as `related` does. `ai-summary.json` now also reports
`false_positives` and `false_negatives`, and their sum is by construction the
size of the two tier-1 categories.

### Re-collecting the same 10 records (PowerShell)

The delivered artifacts have no abstracts, so the first-pass set has to be
gathered again before any judgement is worth making. Use a **new output
directory** — the existing evaluation files are not overwritten.

```powershell
cd C:\Users\hongs\Desktop\qresp_from_server\backend

# The 10 records first-pass-selection.json chose, re-used verbatim.
@'
60316fb93f58fc9075286688
6927175d9bd76c2c6bf77364
650f2db8dcf4aad701f0d18b
6574fd0f1a8a9f515d86142e
68fa608127247d6aff390adf
62302ab3057dbbfb35b05d52
617c303032f83df21c34e5e6
691bb29dc58f7d350e2fb830
69178ee9c58f7d350e2fb82d
606bb69d057dbbfb35b05d4e
'@ | Set-Content -Encoding ascii ..\related-eval-v2-ids.txt

python -m project.tools.related_eval collect `
  --api-base https://paperstack.uchicago.edu `
  --ids-file ..\related-eval-v2-ids.txt `
  --output-dir ..\related-eval-v2 `
  --live --rate-limit 0.7 --max-retries 2
```

> **Why `-Encoding ascii` and not `utf8`.** On Windows PowerShell 5.1
> `-Encoding utf8` writes a **BOM**. Record ids are hex, so ASCII is exact and
> sidesteps the difference between PowerShell 5.1 and 7 entirely. `--ids-file`
> is read as `utf-8-sig`, so a BOM'd file is handled correctly too — but a
> BOM used to be glued to the first id, which matched nothing and silently
> dropped the first paper from the sample. ASCII in the example, tolerance in
> the parser.

**Report these two numbers before going further** — they decide whether the
judgement is worth making at all:

```powershell
# 1. How many review rows the new run produced
$tsv = Get-Content ..\related-eval-v2\human-review.tsv
"review rows: $($tsv.Count - 1)"

# 2. Abstract coverage
python -c "import json,io; s=json.load(io.open(r'..\related-eval-v2\summary.json',encoding='utf-8')); print(json.dumps(s['abstract_coverage'], indent=2))"
```

The new `human-review.tsv` becomes the AI whitelist:

```powershell
python -m project.tools.related_eval ai-label `
  --output-dir ..\related-eval-v2 `
  --dry-run
```

> **The row count will not be exactly 135 again.** Semantic Scholar's
> recommendations change over time, so the candidate set — and therefore the
> review file — will differ. That is expected; report the new count rather
> than trying to force the old one.

### A smoke sample worth running

`--limit N` takes the first N rows of the review file, and that file is
grouped by record — so `--limit 5` is five internal candidates of **one**
paper. The run succeeds and tells you nothing about the other records or
about the external half at all.

`smoke-sample` writes a deterministic, stratified `ai-smoke-review.tsv`
instead:

```sh
python -m project.tools.related_eval smoke-sample --output-dir ../related-eval-v2
```

At most 10 pairs (`--limit`), drawn across (source × gate decision × score
band) in a fixed order, preferring a record not yet in the sample at every
step. Score bands are tertiles computed **per source**, because an internal
score of 9 is ordinary while an external one is high — a single global cut
would file every external candidate under "low". Pairs where both papers have
an abstract come first within a stratum. No randomness: the same input always
produces the same file.

It contacts nothing, writes only `ai-smoke-review.tsv`, and prints why each
pair was chosen. The output is a strict subset of the parent review file, so
`ai-label --review-file ai-smoke-review.tsv` matches it exactly as it would
the parent.

Against the current 135-row first-pass file it selects 10 pairs across **10
distinct records**, 5 internal / 5 external, 8 accepted / 2 rejected, and 4
high / 2 mid / 4 low by score.

### Smoke test order, once a key exists

```powershell
cd C:\Users\hongs\Desktop\qresp_from_server\backend
$env:QRESP_GEMINI_ENABLED = "1"
$env:QRESP_GEMINI_API_KEY = "..."        # this session only; never committed

# 1. Build the stratified sample. No provider contact; prints why each
#    pair was chosen.
python -m project.tools.related_eval smoke-sample --output-dir ..\related-eval-v2

# 2. Plan the run against that sample. Still no provider contact.
#    planned_provider_calls is what it will cost.
python -m project.tools.related_eval ai-label `
  --output-dir ..\related-eval-v2 `
  --review-file ..\related-eval-v2\ai-smoke-review.tsv `
  --dry-run

# 3. The 10 real calls.
python -m project.tools.related_eval ai-label `
  --output-dir ..\related-eval-v2 `
  --review-file ..\related-eval-v2\ai-smoke-review.tsv

# 4. Read what came back before going further.
Import-Csv ..\related-eval-v2\ai-review.tsv -Delimiter "`t" |
  Select-Object record_id, source, gate_decision, ai_rating, ai_confidence, ai_reason |
  Format-Table -Wrap
Get-Content ..\related-eval-v2\ai-summary.json

# 5. Happy with it? The whole review file. The 10 above are cached and
#    are not re-asked.
python -m project.tools.related_eval ai-label --output-dir ..\related-eval-v2

# Ctrl+C at any point and re-run: it resumes.
```

### What the expert does with it

Fill `human_rating` in `expert-review.tsv` (`related` / `partial` /
`unrelated`). Those human values — never the AI's — are what any later
threshold decision rests on. The AI column sits alongside as context, and the
gate's own decision is shown too so the expert can see what is being disputed.

---

## Domain QA — rate the recommendations

The gate above is calibrated by reasoning, not yet by a physicist. **The
review TSV the evaluation CLI writes is what turns it into evidence** — see
"Domain-quality evaluation CLI" above. Rate rows there rather than
transcribing detail pages by hand: the CLI samples deterministically, records
the gate's own score and rejection reason beside each candidate, and includes
the near-misses the gate threw away, which is the only way a false negative
can be seen at all.

A first pass of ~135 rows over 10 topically distinct records
(`first-pass-human-review.tsv`) is the intended starting point; the full
511-row file remains available for a wider pass afterwards.

**Reference sample for the external path:** DOI `10.1021/acs.nanolett.7b00283`
— a record carrying this DOI exercises the DOI-first resolution and returns a
non-trivial recommendation set. *(This DOI appears in documentation only; it is
not referenced by any code or test.)*

Also record, per rated record:

| Question | Answer |
| --- | --- |
| Records where a clearly related paper was **missing** (false negative) | |
| Reasons that read as true but **uninformative** ("Shares 3 specific research terms: …") | |
| Reasons naming a term that is really a **field label** on this corpus | |
| Records where the list was **empty** and that was correct | |

**How to act on the result** — only after the ratings exist. No threshold is
moved on unlabelled data.

| Symptom | Knob (`backend/project/relatedness.py`) |
| --- | --- |
| Too many loose matches | raise `HIGH_TEXT_SIMILARITY`, raise `STRONG_SHARED_TERM_COUNT` to 4, raise `STRONG_SHARED_TERM_WEIGHT` |
| Too few matches on a small corpus | lower `MODERATE_TEXT_SIMILARITY`, lower `STRONG_SHARED_TERM_WEIGHT` |
| A field label keeps being called "specific" | lower `SPECIFIC_DOCUMENT_FREQUENCY_RATIO`, or add the word to `GENERIC_TERMS` |
| Same-lab-different-subject keeps passing | it should not — check whether `topic_terms` is being satisfied by a shared tool; report it |

---

## Verifying against the real provider on staging

Everything below runs on **`qresp_staging` only**. No secrets belong in any
committed file — export them in the shell or inject them into the container.

### 1. Configure the staging backend

```sh
# On the staging host, in the staging compose project only.
export QRESP_RELATED_RESEARCH_ENABLED=1
# OPTIONAL. Without it the shared keyless pool is used, which returns 429
# often enough that you should expect `unavailable` on a first try.
export QRESP_SEMANTIC_SCHOLAR_API_KEY='...'      # never committed, never logged
export QRESP_SEMANTIC_SCHOLAR_TIMEOUT_SECONDS=15
export QRESP_RELATED_RESEARCH_CACHE_DAYS=7
```

### 2. Recreate the backend so it picks the variables up

The compose file bind-mounts `./backend`, so a `build` does **not** change
backend code or environment — the container has to be recreated:

```sh
cd ~/qresp_staging
git pull
docker compose up -d --force-recreate --no-deps backend
docker compose exec backend python -c \
  "import os; print('enabled:', bool(os.environ.get('QRESP_RELATED_RESEARCH_ENABLED')), \
   'key set:', bool(os.environ.get('QRESP_SEMANTIC_SCHOLAR_API_KEY')))"
```

That last line prints booleans only — never echo the key itself.

### 3. Check the endpoint

Pick a record id from the explorer, then (through the SSH tunnel):

```sh
ID=<paper id from /explorer>

# Shape and status, without dumping the whole body:
curl -sk "https://localhost:8443/api/paper/$ID/related" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); \
      print("enabled:", d["enabled"]); \
      print("internal:", d["internal"]["count"]); \
      print("external:", d["external"]["status"], d["external"]["count"], \
            "stale:", d["external"]["stale"])'

# Second call must be a cache hit: same output, and no outbound request.
docker compose logs --tail=50 backend | grep -i "related research" || echo "no provider errors logged"
```

Expected on a healthy run: `enabled: true`, a non-zero `internal` count on a
record that has neighbours, and an `external` status of `ok`. An external
`count` of 0 on a particular record is a normal answer, not a fault — some
records genuinely have no match.

### 4. Confirm the cache without reading secrets out of it

```sh
docker compose exec mongo mongo qresp --quiet --eval '
  db.related_research_cache.find({}, {paper_id:1, status:1, fingerprint:1,
    expires_at:1, last_success_at:1}).limit(5).forEach(printjson)'

# The canonical record must be untouched by any number of related reads:
docker compose exec mongo mongo qresp --quiet --eval '
  printjson(Object.keys(db.papers.findOne({_id: ObjectId("'"$ID"'")})))'
```

`papers` must contain no `related*` key of any kind, and the cache documents
must contain no email, no path and no key.

### 5. Exercise the failure paths deliberately

```sh
# Non-answer: point the container at a black hole and reload a detail page.
docker compose exec backend sh -c \
  "echo '127.0.0.1 api.semanticscholar.org' >> /etc/hosts"
#   -> external.status == "unavailable"; internal results unaffected;
#      a previously cached record shows stale: true.
# Undo by recreating the container:
docker compose up -d --force-recreate --no-deps backend

# Metadata invalidation: edit the record's title in the curator, reload.
#   -> the provider is queried again immediately, and `fingerprint` changes.
```

## Known limitations

- **Gate permissiveness is the open question, not provider coverage.**
  Measured over 18 real records from a public Qresp instance (see the
  evaluation CLI below), the gate **accepts 71 % of all candidate pairs** —
  74 % internally, 58–75 % across the external pools. Only the top 3 internal
  and top 25 external are ever shown, so the user-visible damage is bounded --
  though widening the external list from 3 to 25 widens that bound, which is
  precisely why the 65-record evaluation below exists. "Accepted" currently
  means very little. Whether that is correct is exactly what the human
  labelling pass has to decide; **no threshold has been changed on the
  strength of unlabelled data.**
- **Citation evidence is INACTIVE: it has no input source and can never
  fire.** The pure module implements and unit-tests the signal, and `assess()`
  still accepts a `citation_dois` argument, but **nothing ever passes a
  non-empty one** — `related.py` calls it with an empty set, always. The
  reason is the field-selector defect above: asking the provider for
  `references.externalIds` makes it discard the whole field list, so no
  reference DOIs come back. Reactivating it needs one extra
  `GET /graph/v1/paper/<id>/references?fields=externalIds` per cache miss,
  which has deliberately not been added. Papers that cite *this* one are not
  detected either way. **Treat "Directly cited by this paper" as dead code
  paths, not as a signal in service.**
- **Small corpora.** With fewer than ~14 active records, IDF is coarse and the
  specificity floor of 2 does most of the work. The internal list will be short
  — correctly so.
- **The external list follows the record, not the world.** An edit to the
  record refreshes it at once (fingerprint), but new papers appearing at the
  provider are only picked up when the TTL expires.
- **Recomputed per request.** The internal list rebuilds corpus statistics on
  every detail view. That is what makes publish/deactivate instant, and is
  comfortable at the corpus sizes Qresp holds; a server with tens of thousands
  of records would want the statistics memoized.
- **No cross-server federation.** Only records on this instance are considered
  for the internal list.
- **Domain relevance is unvalidated.** The QA table above is the gate on
  turning this on anywhere public.
