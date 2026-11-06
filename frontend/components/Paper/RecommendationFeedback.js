import { Fragment, useContext, useEffect, useState } from "react";
import PropTypes from "prop-types";

import axios from "axios";
import {
  Box,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Link as MuiLink,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";

import { RegularStyledButton } from "../button";
import AuthContext from "../../Context/Auth/authContext";
import { loginHref } from "../../Utils/safeNext";

// "Were these recommendations helpful?" — the one measurement of this feature
// that comes from the person it is for.
//
// Everything else Qresp knows about the recommendation list is either
// arithmetic the quality gate did to itself or a domain expert rating a
// spreadsheet offline. This is a reader, on a real record, looking at the
// real list.
//
// SIGNED IN ONLY, and that is a reversal of how this first shipped. Anonymous
// rating was keyed by a per-session token, so a respondent could mint a new
// identity by clearing a cookie: "one opinion per reader" was not true, and
// one person with a browser could move the average. Readers without an
// account now get a sign-in prompt instead of a scale, and their opinion is
// not collected.
//
// It renders only when there ARE results AND the backend issued a signed
// `feedback_context` for them. Asking "were these helpful?" under an empty
// list asks about nothing; without a context there is nothing the server can
// verify the answer against, and a rating it cannot verify is one it will
// refuse anyway.

const HEADING = "Were these recommendations helpful?";
const SIGN_IN_PROMPT = "Sign in to rate these recommendations";

// The scale, spelled out. 2 and 4 have no words of their own by design: the
// anchors carry the meaning and inventing labels for the midpoints ("Somewhat
// dissatisfied") would put words in a reader's mouth. They still get an
// accessible name, built from the anchors they sit between.
const SCALE = [
  { value: 1, label: "1", meaning: "Very dissatisfied" },
  { value: 2, label: "2", meaning: "" },
  { value: 3, label: "3", meaning: "Neutral" },
  { value: 4, label: "4", meaning: "" },
  { value: 5, label: "5", meaning: "Very satisfied" },
];

// Offered only for a 1 or a 2. The codes are the backend's enum; the text is
// what a reader reads. Anything outside this list is refused server-side, so
// the tally can never acquire a category nobody designed.
const REASONS = [
  { code: "too_many_unrelated", label: "Too many unrelated papers" },
  { code: "not_my_research_area", label: "Not in my research area" },
  { code: "already_knew_these", label: "I already knew these papers" },
  { code: "need_more_variety", label: "I need more variety" },
  { code: "other", label: "Other" },
];

// Matches the backend's MAX_COMMENT_CHARS. Enforced here so a reader is
// stopped by a counter rather than by a 400.
const MAX_COMMENT = 1000;

// A low score is the only one that opens the reason list.
const LOW_RATING = 2;

// Where to come back to after signing in. Read from the address bar rather
// than from `useRouter`: this component renders inside a detail page, but a
// hook that throws when no router is mounted makes it unusable anywhere else
// -- including in a test -- for no benefit. `safeNext` refuses anything that
// is not a same-origin path, so a crafted URL cannot turn sign-in into an
// open redirect.
const currentPath = () => {
  if (typeof window === "undefined" || !window.location) return "/";
  return `${window.location.pathname || "/"}${window.location.search || ""}`;
};

const scaleAriaLabel = ({ value, meaning }) => {
  if (meaning) return `${value}: ${meaning}`;
  // 2 and 4: named by where they sit, never by a word nobody chose.
  return value < 3
    ? `${value}: between very dissatisfied and neutral`
    : `${value}: between neutral and very satisfied`;
};

const RecommendationFeedback = ({
  paperId,
  server,
  context,
  source = "external",
  page = 1,
  pagesViewed = 1,
}) => {
  const { loading: authLoading, authenticated } = useContext(AuthContext) || {};

  const [rating, setRating] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [comment, setComment] = useState("");
  // "" | "loading" | "saving" | "saved" | "failed" | "expired".
  // Announced, not merely coloured.
  const [status, setStatus] = useState("");

  // Restore THIS reader's previous answer, and nobody else's. Without it a
  // reader who rated last week sees an empty scale and cannot tell whether
  // their rating was recorded — so they rate again, which is at best noise
  // and at worst a correction they did not mean to make.
  useEffect(() => {
    if (!authenticated || !paperId || !context) return undefined;
    let cancelled = false;
    setStatus("loading");
    axios
      .get(`/api/paper/${encodeURIComponent(paperId)}/related/feedback`, {
        params: { source, ...(server ? { server } : {}) },
      })
      .then((res) => {
        if (cancelled) return;
        const mine = res.data || {};
        setRating(mine.rating === null || mine.rating === undefined
          ? null
          : mine.rating);
        setReasons(Array.isArray(mine.reasons) ? mine.reasons : []);
        setComment(typeof mine.comment === "string" ? mine.comment : "");
        setStatus("");
      })
      .catch(() => {
        // Not being able to read a previous rating is not worth an error
        // message: the scale still works, and a failure here would only
        // confuse somebody who has never rated anything.
        if (!cancelled) setStatus("");
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, paperId, server, source, context]);

  // Nothing to rate, or nothing the server could verify a rating against.
  if (!context) return null;

  // The auth state has not arrived yet. Rendering the scale and then
  // replacing it with a sign-in prompt would be worse than a beat of nothing.
  if (authLoading) return null;

  if (!authenticated) {
    return (
      <Box
        // The same frame as the signed-in block: a rule, real space above
        // it, and the same width. The two states must not shift the page.
        sx={{
          borderTop: 1,
          borderColor: "divider",
          pt: 3,
          mt: 4,
          mx: "auto",
          maxWidth: 480,
          textAlign: "center",
        }}
        data-testid="recommendation-feedback-signin"
      >
        <Typography variant="body2" sx={{ fontWeight: "bold", mb: 0.5 }}>
          {HEADING}
        </Typography>
        {/* The project's own sign-in entry point, carrying the current path
            so the reader comes back to the record they were reading. */}
        <Typography variant="body2" color="secondary">
          <MuiLink
            href={loginHref(currentPath())}
            underline="hover"
            data-testid="feedback-signin-link"
          >
            {SIGN_IN_PROMPT}
          </MuiLink>
          . Ratings are counted once per account, so an account is what makes
          "once" mean anything.
        </Typography>
      </Box>
    );
  }

  const send = (nextRating, nextReasons, nextComment) => {
    setStatus("saving");
    return axios
      .post(
        `/api/paper/${encodeURIComponent(paperId)}/related/feedback`,
        {
          rating: nextRating,
          source,
          // The server's own signed note about what this list actually was.
          // It decides how many results are recorded; this component does not
          // send a count at all.
          feedback_context: context,
          // Only meaningful for a low score, and the backend drops them for a
          // high one anyway. Not sent at all otherwise, so a reason can never
          // arrive attached to a 5.
          reasons: nextRating <= LOW_RATING ? nextReasons : [],
          comment: nextComment,
          // Where in the list the reader was. Clamped server-side to the page
          // count the token attests — never taken on trust.
          page_at_submit: page,
          pages_viewed: pagesViewed,
        },
        { params: server ? { server } : {} }
      )
      .then(() => setStatus("saved"))
      .catch((error) => {
        const code = error && error.response && error.response.status;
        // 410: the context aged out while the page was open. That is not the
        // reader's mistake, and "try again" would not help — reloading does.
        setStatus(code === 410 ? "expired" : "failed");
      });
  };

  const chooseRating = (event, value) => {
    // MUI hands back null when the selected button is clicked again. A rating
    // is not a toggle: re-clicking your own answer must not silently withdraw
    // it, so the current value stands.
    if (value === null || value === undefined) return;
    setRating(value);
    // Moving OFF a low score clears reasons that no longer apply, so a reader
    // who corrects 2 to 4 does not leave "Not in my research area" attached
    // to a satisfied rating — in the UI and, because they are sent empty, in
    // the database too.
    const nextReasons = value <= LOW_RATING ? reasons : [];
    setReasons(nextReasons);
    send(value, nextReasons, comment);
  };

  const toggleReason = (code) => {
    setReasons((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : current.concat(code)
    );
  };

  const message = {
    loading: "Loading your previous rating…",
    saving: "Saving your rating…",
    saved: "Thanks — your rating was saved. You can change it at any time.",
    failed: "Your rating could not be saved. Please try again.",
    expired:
      "These recommendations have been refreshed since you opened the page. " +
      "Reload it to rate the current list.",
  }[status];

  return (
    <Box
      sx={{
        // A rule and real space above it, so the feedback block reads as a
        // separate thing being asked rather than as a sixth search result.
        borderTop: 1,
        borderColor: "divider",
        pt: 3,
        mt: 4,
        mx: "auto",
        // Comfortable to read and to reach on a phone; the whole block is
        // centered rather than hugging the left edge under a wide list.
        maxWidth: 480,
        // ONE spacing rule for the whole stack -- rating group, reasons,
        // comment, button, status -- instead of a different mt on each,
        // which is what made the gaps look arbitrary.
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
      data-testid="recommendation-feedback"
    >
      {/* The heading, the rating controls and the anchor text are ONE
          compact group, centered together -- keyboard focus and tab order
          are unaffected by sx, and MUI's own focus ring on each
          ToggleButton is untouched. */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 0.5,
        }}
      >
        <Typography
          variant="body2"
          component="h4"
          id="recommendation-feedback-heading"
          sx={{ fontWeight: "bold" }}
        >
          {HEADING}
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={rating}
          onChange={chooseRating}
          size="small"
          aria-labelledby="recommendation-feedback-heading"
          aria-busy={status === "loading"}
        >
          {SCALE.map((step) => (
            <ToggleButton
              key={step.value}
              value={step.value}
              // The full meaning, not just the digit: "4" alone tells a
              // screen reader nothing about which end of the scale it is.
              aria-label={scaleAriaLabel(step)}
              data-testid={`feedback-rating-${step.value}`}
            >
              {step.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {/* The anchors in text, so the scale is readable without hovering
            anything and without relying on the order of the buttons alone. */}
        <Typography variant="caption" color="secondary" component="div">
          1: Very dissatisfied · 3: Neutral · 5: Very satisfied
        </Typography>
      </Box>

      {rating !== null && rating <= LOW_RATING ? (
        <Box data-testid="feedback-reasons">
          <Typography variant="body2" component="div" id="feedback-reasons-label">
            What went wrong? (optional)
          </Typography>
          <FormGroup aria-labelledby="feedback-reasons-label">
            {REASONS.map((reason) => (
              <FormControlLabel
                key={reason.code}
                control={
                  <Checkbox
                    size="small"
                    checked={reasons.includes(reason.code)}
                    onChange={() => toggleReason(reason.code)}
                  />
                }
                label={
                  <Typography variant="body2">{reason.label}</Typography>
                }
              />
            ))}
          </FormGroup>
        </Box>
      ) : null}

      {rating !== null ? (
        <Fragment>
          <Box>
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={2}
              value={comment}
              onChange={(event) =>
                setComment(event.target.value.slice(0, MAX_COMMENT))
              }
              label="Anything else? (optional)"
              // MUI v9 reaches the native <input>/<textarea> through slots;
              // the legacy `inputProps` is ignored, so the cap would silently
              // not apply.
              slotProps={{ htmlInput: { maxLength: MAX_COMMENT } }}
            />
          </Box>
          <Box>
            <RegularStyledButton
              onClick={() => send(rating, reasons, comment)}
              disabled={status === "saving"}
            >
              Send feedback
            </RegularStyledButton>
          </Box>
        </Fragment>
      ) : null}

      {/* Announced, not merely drawn. The outcome of a submission is the one
          thing a reader cannot infer from the page. */}
      <Typography
        variant="caption"
        component="div"
        role="status"
        aria-live="polite"
        color={
          status === "failed" || status === "expired" ? "error" : "secondary"
        }
        sx={{ minHeight: "1.2em" }}
      >
        {message || ""}
      </Typography>
    </Box>
  );
};

RecommendationFeedback.propTypes = {
  paperId: PropTypes.string.isRequired,
  server: PropTypes.string,
  // The signed note the backend issued with this list. No token, no widget.
  context: PropTypes.string,
  source: PropTypes.string,
  page: PropTypes.number,
  pagesViewed: PropTypes.number,
};

export { HEADING, REASONS, SCALE, SIGN_IN_PROMPT };
export default RecommendationFeedback;
