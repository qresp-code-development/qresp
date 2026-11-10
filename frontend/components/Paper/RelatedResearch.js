import { Fragment, useEffect, useState } from "react";
import PropTypes from "prop-types";

import axios from "axios";
import Link from "next/link";
import {
  Box,
  Chip,
  LinearProgress,
  Pagination,
  Typography,
} from "@mui/material";

import Drawer from "../drawer";
import SectionHeading from "./SectionHeading";
import { SmallStyledButton } from "../button";
import RecommendationFeedback from "./RecommendationFeedback";

// Related Research, computed by the backend at view time (never pinned into
// the record) from GET /api/paper/{id}/related.
//
// Two independent lists, and TWO DIFFERENT POLICIES -- this component must
// never blur them together:
//
//   Related Qresp Records       every result PASSED Qresp's strict evidence
//                                gate. Capped at 3. "Why related" is a fair
//                                heading here: the reasons ARE why it is
//                                related enough to be shown at all.
//   Related External Papers    Semantic Scholar's own candidates,
//                                RE-RANKED by Qresp's score but never
//                                filtered by the gate. Capped at 25. A
//                                result here can carry weak or zero Qresp
//                                signal and still appear -- being proposed
//                                by the provider is reason enough. Calling
//                                that "Why related" or "verified related"
//                                would misdescribe what the backend did, so
//                                this list gets its own neutral heading
//                                ("Qresp ranking signals") and is shown only
//                                when there is something non-empty to show.
//
// Both are already capped by the backend, so this component renders exactly
// what it is given and never pads a short list.
//
// The two lists have DIFFERENT caps and only one of them is paginated.
// Related Qresp Records is at most three records from one server's corpus and
// is rendered whole. Related External Papers is up to 25 papers drawn from the
// whole literature, so it is laid out five to a page over at most five pages.
// The backend returns and caches all 0–25 in ONE response, so turning a page
// slices an array this component already holds: changing pages issues no
// request of any kind, and in particular no Semantic Scholar request.
//
// The source server is whichever one the detail page is showing: this page can
// be opened on a federated record (`/paperdetails/{id}?server=...`), whose id
// exists on that server and nowhere else. `server` is therefore forwarded to
// the request — without it the backend is asked about an id it cannot have,
// and can only answer 404.
//
// EXISTENCE CONTRACT. On a published detail page, with the feature switched
// on, this section ALWAYS renders. There are exactly four visible states and
// exactly two ways to render nothing:
//
//   loading      the request is in flight
//   results      at least one list has something
//   empty        the backend answered and nothing cleared the quality gate --
//                a real result, not a malfunction
//   unavailable  the request failed, or the backend could not read the source
//                Qresp server -> say THAT, and offer a retry
//
//   (nothing)    `enabled: false` -- the deployment does not have this
//                feature, so there is nothing to explain to a reader
//   (nothing)    no paperId -- there is no record to ask about
//
// An unpublished preview is excluded by the PAGE, which does not mount this
// component at all; there is nothing to compute for a record that is not
// published yet.
//
// The failure state is the point. Catching the error and rendering `null` --
// what this did before -- made a broken request indistinguishable from a
// deployment that never had the feature, and there was no way for a reader
// to tell either from "nothing is related to this paper".

// INTERNAL list only. "Sufficiently related" is a claim about a judgement
// somebody made, and only Related Qresp Records makes one: its strict
// evidence gate really can reject every candidate in the corpus. The
// external list is ranked, never gated, so this sentence is false there --
// see `externalNotice`.
const EMPTY_MESSAGE = "No sufficiently related papers were found.";
const UNAVAILABLE_MESSAGE =
  "Related research is unavailable right now. This is a problem loading the " +
  "suggestions, not a statement about this record.";
const MAX_REASONS = 3;
const HEADING = "Suggested Related Papers";

// Related External Papers only. These mirror EXTERNAL_RESULTS_PER_PAGE /
// EXTERNAL_MAX_PAGES / EXTERNAL_MAX_RESULTS in backend/project/related.py:
// the backend decides how many results exist, and these decide how the ones
// it sent are laid out. Neither number applies to Related Qresp Records.
const EXTERNAL_PAGE_SIZE = 5;
const EXTERNAL_MAX_PAGES = 5;
const EXTERNAL_MAX_RESULTS = EXTERNAL_PAGE_SIZE * EXTERNAL_MAX_PAGES;

// Shown on every render, in every state. These suggestions come from
// deterministic metadata similarity, not from a person having checked them,
// and a reader deciding whether to trust a connection needs to know that
// before they act on it.
//
// It deliberately does NOT say "AI" or "AI-assisted". No language model is
// involved in serving this section: candidates come from the Qresp corpus and
// from Semantic Scholar, and the ranking is computed arithmetic. Calling it AI
// would be a false claim about how the answer was produced. If a model ever
// reranks at serve time, that is when the wording changes.
const DISCLAIMER =
  "These suggestions are generated automatically from publication metadata " +
  "and research-similarity signals. They may be incomplete or inaccurate. " +
  "Review each paper before relying on the suggested connection.";

// EXTERNAL ONLY, shown once above that list. It says explicitly what the
// heading above no longer implies: these are the PROVIDER's candidates,
// merely ordered by Qresp, not a claim that Qresp verified any of them.
const EXTERNAL_DISCLAIMER =
  "Suggestions from Semantic Scholar, ordered using Qresp's publication " +
  "metadata similarity signals. They may be incomplete or inaccurate; " +
  "review each paper before relying on it.";

// The same sentence for the fallback list, which is not a set of suggestions
// at all: it is later work that cites this paper, found because the
// recommender had nothing. The whole list shares one source, so this is
// decided once from the section rather than per result.
const EXTERNAL_CITATIONS_DISCLAIMER =
  "Semantic Scholar had no recommendations for this paper, so these are " +
  "later works that cite it, ordered using Qresp's publication metadata " +
  "similarity signals. They may be incomplete or inaccurate; review each " +
  "paper before relying on it.";

const externalDisclaimerFor = (external) =>
  (external || {}).source_kind === "citations"
    ? EXTERNAL_CITATIONS_DISCLAIMER
    : EXTERNAL_DISCLAIMER;

// The heading over an external result's grounded evidence, when it has any.
// Deliberately NOT "Why related": for an external candidate, evidence is
// what MOVED it up the list, not the reason it is on the list at all -- a
// candidate with none is still there, just further down.
const EXTERNAL_REASONS_HEADING = "Qresp ranking signals";

// Where an external candidate actually came from.
//
// The backend has two sources and they are not interchangeable: the
// recommendations endpoint answers "this resembles your paper", the citations
// endpoint answers "this cites your paper". The second is used only when the
// first returns nothing, and calling its results "Recommended by Semantic
// Scholar" would be a false statement about their provenance -- nobody
// recommended them; they were found by following citations.
//
// An unknown or missing kind falls back to the recommendation label, which is
// what every result carried before the fallback existed.
const SOURCE_LABELS = {
  recommendations: "Recommended by Semantic Scholar",
  citations: "Cites this paper",
};
const DEFAULT_SOURCE_LABEL = SOURCE_LABELS.recommendations;

const sourceLabelFor = (result) =>
  SOURCE_LABELS[result.source_kind] || DEFAULT_SOURCE_LABEL;
const INTERNAL_REASONS_HEADING = "Why related";

// Standard "visually hidden but read by assistive tech" pattern: present in
// the accessibility tree, invisible on screen, never affecting layout. Used
// for the page-range announcement, which must reach a screen reader without
// becoming the visible "Showing X-Y of Z" text the product explicitly does
// not want on screen any more.
const VISUALLY_HIDDEN_SX = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

const formatDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
};

const Note = ({ children, color = "secondary" }) => (
  <Typography
    variant="body2"
    color={color}
    sx={{ mt: 1, wordBreak: "break-word" }}
  >
    {children}
  </Typography>
);

const ResultTitle = ({ result, server }) => {
  const style = { fontWeight: "bold", wordBreak: "break-word" };
  // Internal results stay inside Qresp; external ones go to the publisher via
  // the HTTPS DOI link the backend preferred.
  //
  // A result names the Qresp server it lives on. That is what the link must
  // carry: a federated record's id resolves only on its own server, so
  // dropping the origin here would send the reader to a 404 — or, if the id
  // happened to exist locally too, to the wrong paper. `server` (this page's)
  // is the fallback for a backend that predates `result.server`.
  if (result.source === "internal" && result.id) {
    return (
      <Link
        href={{
          pathname: `/paperdetails/${result.id}`,
          query: { server: result.server || server || "" },
        }}
        style={style}
      >
        {result.title}
      </Link>
    );
  }
  if (result.url) {
    return (
      <a
        href={result.url}
        target="_blank"
        rel="noopener noreferrer"
        style={style}
      >
        {result.title}
      </a>
    );
  }
  return <span style={style}>{result.title}</span>;
};

const Result = ({ result, server }) => (
  <Box
    component="li"
    data-testid="related-result"
    sx={{
      listStyle: "none",
      py: 1.5,
      minWidth: 0,
      borderTop: "1px solid rgba(0,0,0,0.08)",
    }}
  >
    <Typography
      variant="subtitle1"
      component="div"
      sx={{ wordBreak: "break-word" }}
    >
      <ResultTitle result={result} server={server} />
    </Typography>
    {result.authors ? (
      <Typography
        variant="body2"
        color="secondary"
        sx={{ wordBreak: "break-word" }}
      >
        {result.authors}
      </Typography>
    ) : null}
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 1,
        mt: 0.5,
        minWidth: 0,
      }}
    >
      {result.year ? <Chip size="small" label={String(result.year)} /> : null}
      {result.doi ? (
        <Typography
          variant="body2"
          component="span"
          sx={{ wordBreak: "break-all", minWidth: 0 }}
        >
          <a
            href={result.url || `https://doi.org/${result.doi}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {`DOI: ${result.doi}`}
          </a>
        </Typography>
      ) : null}
      {result.source === "external" ? (
        <Chip
          size="small"
          variant="outlined"
          label={sourceLabelFor(result)}
          sx={{ maxWidth: "100%" }}
        />
      ) : null}
    </Box>
    {result.reasons && result.reasons.length ? (
      <Box sx={{ mt: 1, minWidth: 0 }}>
        <Typography variant="caption" color="secondary" component="div">
          <Box component="span" sx={{ fontWeight: "bold" }}>
            {result.source === "external"
              ? EXTERNAL_REASONS_HEADING
              : INTERNAL_REASONS_HEADING}
          </Box>
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          {result.reasons.slice(0, MAX_REASONS).map((reason) => (
            <Typography
              key={reason}
              component="li"
              variant="body2"
              color="secondary"
              sx={{ wordBreak: "break-word" }}
            >
              {reason}
            </Typography>
          ))}
        </Box>
      </Box>
    ) : null}
  </Box>
);

const ResultList = ({ results, server }) => (
  <Box component="ul" sx={{ m: 0, p: 0, minWidth: 0 }}>
    {results.map((result) => (
      <Result
        key={`${result.source}-${result.id || result.doi || result.title}`}
        result={result}
        server={server}
      />
    ))}
  </Box>
);

// Why the external list is empty, in the reader's words.
//
// This list is NOT gated: every valid, non-duplicate candidate the provider
// returns is ranked and the top 25 are shown. So "No sufficiently related
// papers were found" -- which is the right sentence for the INTERNAL list,
// where a strict evidence gate really can reject everything -- is a false
// statement here. Nothing was ever judged insufficient; there was simply
// nothing to rank, or nobody to ask.
//
// The backend already distinguishes these in `external.reason`; this is
// where that distinction reaches a reader:
//
//   provider_returned_no_candidates    Semantic Scholar had nothing for it
//   no_valid_candidates_after_dedupe   it answered, but nothing survived
//                                      metadata validation and de-duplication
//   source_paper_not_in_provider_index we could not ask about this record
//   timeout / rate-limited / error     we could not ask at all -> Retry
//
// `disabled` is not among them: a server running internal-only has no
// external half, so the heading is dropped rather than explained.
const EXTERNAL_EMPTY_BY_REASON = {
  provider_returned_no_candidates:
    "Semantic Scholar did not return external recommendations for this paper.",
  no_valid_candidates_after_dedupe:
    "Semantic Scholar returned suggestions for this paper, but none carried " +
    "enough usable publication metadata to show.",
};

// The fallback for an `ok` answer whose reason this build does not know --
// an older backend, or a reason added later. It says only what is certainly
// true: there is nothing to show, and it was not Qresp that rejected them.
const EXTERNAL_EMPTY_FALLBACK =
  "No external recommendations are available for this paper.";

const externalNotice = (external) => {
  if (external.status === "unresolved") {
    return (
      "This record could not be matched in the external index, so no " +
      "external recommendations were requested."
    );
  }
  if (external.status === "unavailable") {
    return (
      "External recommendations are unavailable right now. The Qresp " +
      "results above are unaffected."
    );
  }
  return (
    EXTERNAL_EMPTY_BY_REASON[external.reason] || EXTERNAL_EMPTY_FALLBACK
  );
};

// The section title and disclaimer frame every state (loading, failure,
// results) so a reader always knows what the lists below are.
const Frame = ({ children }) => (
  <Box component="section" sx={{ minWidth: 0 }}>
    <SectionHeading>{HEADING}</SectionHeading>
    <Typography
      variant="body2"
      color="secondary"
      sx={{ mb: 1.5, wordBreak: "break-word" }}
    >
      {DISCLAIMER}
    </Typography>
    {children}
  </Box>
);

const RelatedResearch = ({ paperId, server }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  // Bumped by the retry button. It is the only dependency that changes on a
  // retry, so it is what re-runs the effect.
  const [attempt, setAttempt] = useState(0);
  // Which page of Related External Papers is on screen. 1-based, and purely a
  // view over `external.results` — it is never sent anywhere.
  const [externalPage, setExternalPage] = useState(1);
  // The DEEPEST external page the reader reached. Sent with a rating so
  // "1 star" from somebody who read one page can be told apart from "1 star"
  // from somebody who worked through all five. A single number, never a
  // trail: which pages were opened, in what order, at what time is not
  // recorded and is not sent.
  const [externalPagesSeen, setExternalPagesSeen] = useState(1);

  useEffect(() => {
    if (!paperId) {
      // Nothing to ask about. Not a failure -- see the guard below.
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    // Both the record and the server it lives on are dependencies, and both
    // reset the state: the same id on a different Qresp server is a different
    // paper, so showing the previous server's answer while the new one loads
    // would attribute one server's results to another.
    setLoading(true);
    setFailed(false);
    setData(null);
    // Whatever comes back is a different external list, so page 4 of the
    // previous one is meaningless against it — and, if the new list is
    // shorter, would render as an empty section under a heading that promises
    // results. Reset HERE rather than in an effect of its own: `data` is only
    // ever replaced from inside this effect (a new record, a new server, or
    // the retry button bumping `attempt`), so this covers every way the list
    // can change, and it batches into the same commit instead of adding a
    // second render on every answer.
    setExternalPage(1);
    setExternalPagesSeen(1);
    axios
      .get(`/api/paper/${encodeURIComponent(paperId)}/related`, {
        // Which Qresp server holds this record. Omitted when the page is not
        // federated, so a local record produces the exact request it always
        // did.
        params: server ? { server } : {},
      })
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        // The backend answered, but could not read the source server. An
        // empty list here would be a claim about the record that nobody
        // actually checked.
        setFailed((res.data || {}).internal?.status === "unavailable");
      })
      .catch(() => {
        // A transport failure, a backend without this endpoint, or a record
        // this server will not serve. The section stays, and says so.
        if (cancelled) return;
        setData(null);
        setFailed(true);
      })
      .then(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paperId, server, attempt]);

  // No record to ask about: the section has no subject, so it does not exist.
  // Distinct from a failure, which does.
  if (!paperId) return null;

  if (loading) {
    return (
      <Frame>
        <Box sx={{ py: 1 }}>
          <Typography variant="body2" color="secondary" gutterBottom>
            Looking for related research…
          </Typography>
          <LinearProgress aria-label="Loading related research" />
        </Box>
      </Frame>
    );
  }

  // The feature is off on this deployment: there is nothing to explain to a
  // reader, so the section does not exist. Checked before the failure state so
  // an explicit "disabled" answer never renders as a problem.
  if (data && data.enabled === false) return null;

  // No answer and not disabled means the request did not succeed. There is no
  // path from here back to rendering nothing: a failure is a state of this
  // section, not its absence.
  if (failed || !data) {
    return (
      <Frame>
        <Box sx={{ py: 1 }}>
          <Note color="error">{UNAVAILABLE_MESSAGE}</Note>
          <Box sx={{ mt: 1.5 }}>
            <SmallStyledButton
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try again
            </SmallStyledButton>
          </Box>
        </Box>
      </Frame>
    );
  }

  const internal = data.internal || { results: [] };
  const external = data.external || { results: [], status: "disabled" };
  const internalResults = internal.results || [];
  const externalResults = external.results || [];
  const notice = externalNotice(external);
  const staleDate = external.stale ? formatDate(external.updated_at) : null;
  // The external slice, derived from the array the backend already sent.
  //
  // `EXTERNAL_MAX_RESULTS` is applied here as well as in the backend, so a
  // server that has not been redeployed — or one that ever returns more than
  // it promises — cannot produce a sixth page. `currentPage` is clamped for
  // the same reason: a page index left over from a longer list must show the
  // last real page rather than nothing.
  const externalTotal = Math.min(externalResults.length, EXTERNAL_MAX_RESULTS);
  const externalPageCount = Math.min(
    Math.ceil(externalTotal / EXTERNAL_PAGE_SIZE),
    EXTERNAL_MAX_PAGES
  );
  const currentExternalPage = Math.min(
    Math.max(externalPage, 1),
    Math.max(externalPageCount, 1)
  );
  const externalStart = (currentExternalPage - 1) * EXTERNAL_PAGE_SIZE;
  const visibleExternal = externalResults.slice(
    externalStart,
    Math.min(externalStart + EXTERNAL_PAGE_SIZE, externalTotal)
  );
  // Internal-only deployment: the external half is not merely empty, it is
  // not part of this server. Render the internal list alone.
  const showExternal = external.status !== "disabled";

  return (
    <Frame>
      <Drawer heading="Related Qresp Records" defaultOpen>
        {internalResults.length ? (
          <ResultList results={internalResults} server={server} />
        ) : (
          <Note>{EMPTY_MESSAGE}</Note>
        )}
      </Drawer>
      {showExternal ? (
        <Fragment>
          {/* "Related External Papers", not "Recommended".
              
              The list has two possible sources and only one of them
              recommends anything: the citations fallback returns papers that
              CITE this one, which nobody recommended. A heading that says
              "Recommended" is false for half the cases it has to cover, so
              the heading states the relationship both sources share and each
              RESULT carries its own precise provenance badge. */}
          <Drawer heading="Related External Papers" defaultOpen>
            {/* Shown ONCE, above the results -- this is the disclaimer that
                matters most for this list: it is Semantic Scholar's
                candidates, merely ordered by Qresp, not a Qresp-verified
                set. */}
            <Typography
              variant="body2"
              color="secondary"
              sx={{ mb: 1, wordBreak: "break-word" }}
            >
              {externalDisclaimerFor(external)}
            </Typography>
            {external.stale ? (
              <Note color="error">
                {staleDate
                  ? `Showing the last successful external results (${staleDate}); refreshing them just failed.`
                  : "Showing the last successful external results; refreshing them just failed."}
              </Note>
            ) : null}
            {externalTotal ? (
              <Fragment>
                <ResultList results={visibleExternal} server={server} />
                {externalPageCount > 1 ? (
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "center",
                      mt: 1,
                    }}
                  >
                    {/* No visible "Showing X-Y of Z" text. The page count,
                        the current page (aria-current, built into MUI's
                        Pagination) and the aria-label below are the
                        "appropriate aria labels/current page semantics" this
                        control needs; a screen-reader-only live region
                        additionally announces the range on every change,
                        without adding anything a sighted reader sees. */}
                    <Box
                      role="status"
                      aria-live="polite"
                      sx={VISUALLY_HIDDEN_SX}
                    >
                      {`Showing ${externalStart + 1}-${
                        externalStart + visibleExternal.length
                      } of ${externalTotal} related external papers`}
                    </Box>
                    <Pagination
                      count={externalPageCount}
                      page={currentExternalPage}
                      onChange={(_event, value) => {
                        setExternalPage(value);
                        setExternalPagesSeen((seen) =>
                          Math.max(seen, Math.min(value, externalPageCount))
                        );
                      }}
                      size="small"
                      color="primary"
                      aria-label="Related external papers pages"
                    />
                  </Box>
                ) : null}
                {/* Only under a list that HAS results, and only with the
                    signed context the backend issues alongside them. "Were
                    these helpful?" under an empty section asks about nothing,
                    and a rating the server cannot verify against a real list
                    is one it will refuse anyway. How many results there were
                    comes from that token, not from this component. */}
                <RecommendationFeedback
                  paperId={paperId}
                  server={server}
                  source="external"
                  context={external.feedback_context}
                  page={currentExternalPage}
                  pagesViewed={externalPagesSeen}
                />
              </Fragment>
            ) : (
              <Note
                color={external.status === "unavailable" ? "error" : "secondary"}
              >
                {/* `externalNotice` now always answers for this list, so
                    EMPTY_MESSAGE -- the gate's sentence -- can no longer
                    leak onto an ungated one. */}
                {notice}
              </Note>
            )}
            {/* A FAILURE is the one empty state worth asking again about: a
                timeout, a 429 or a provider error may not still be true.
                "The provider had nothing" and "we could not match this
                record" are answers, and re-asking would return the same. */}
            {!externalTotal && external.status === "unavailable" ? (
              <Box sx={{ mt: 1.5 }}>
                <SmallStyledButton
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Try again
                </SmallStyledButton>
              </Box>
            ) : null}
          </Drawer>
        </Fragment>
      ) : null}
    </Frame>
  );
};

RelatedResearch.propTypes = {
  paperId: PropTypes.string,
  server: PropTypes.string,
};

export default RelatedResearch;
