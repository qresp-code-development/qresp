import {
  Fragment,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import PropTypes from "prop-types";

import axios from "axios";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  Tab,
  Tabs,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";

import { RegularStyledButton } from "../button";
import CuratorContext from "../../Context/Curator/curatorContext";
import AlertContext from "../../Context/Alert/alertContext";
import { buildFileUrl } from "../../Utils/fileServerUrl";
import ConnectionSection, {
  confirmLabel,
  useRowLink,
} from "../CuratorForms/ConnectionSection";
import { intentProblem } from "../../Utils/connectionIntent";
import {
  aiTargets,
  APPLIED,
  NOT_APPLIED,
  PARTIALLY_APPLIED,
  fieldsFor,
  labelFor,
  missingRequired,
  suggestionApplied,
  suggestionState,
  toDraft,
  toRecord,
} from "../../Utils/artifactFields";

// Each artifact section can review just its own RCC candidates. The first
// import scans the saved file-server folder on the backend; later sections
// reuse that runtime-only response until the saved path changes or a rebuild
// is requested. Candidates start unchecked, and applying them changes Curator
// state only: it never saves a draft, publishes, or edits existing records.

const GROUPS = [
  { key: "charts", type: "chart", label: "Charts", noun: "figures" },
  { key: "datasets", type: "dataset", label: "Datasets", noun: "datasets" },
  { key: "scripts", type: "script", label: "Scripts", noun: "scripts" },
  { key: "tools", type: "tool", label: "Tools", noun: "tools" },
  { key: "unclassified", type: null, label: "Unclassified", secondary: true },
];

// What to call the things on screen.
//
// A Chart IS a figure to the curator, so the import that creates one says
// "figures". "1 proposed figures" would tell them nobody read this line, so
// the count and the noun are decided in one place.
const countedNoun = (total, group) => {
  const noun = (group && group.noun) || "items";
  return total === 1 ? noun.replace(/s$/, "") : noun;
};

// The same word in the past tense, for the success message. An untyped
// import can add several kinds at once and there is no honest single noun
// for that, so it keeps the generic one.
const addedNoun = (total, group) => {
  const plural = total === 1 ? "was" : "were";
  if (group && group.noun) {
    const noun = total === 1 ? group.noun.replace(/s$/, "") : group.noun;
    return `${noun} ${plural}`;
  }
  return `item${total === 1 ? "" : "s"} ${plural}`;
};

const GROUP_BY_TYPE = GROUPS.reduce((groups, group) => {
  if (group.type) groups[group.type] = group;
  return groups;
}, {});

const IMPORT_LABELS = {
  chart: "Import Charts from RCC",
  dataset: "Import Datasets from RCC",
  script: "Import Scripts from RCC",
  tool: "Import Tools from RCC",
};

// Grouped Unclassified rows rendered before "Show more".
const UNCLASSIFIED_ROWS = 25;

// A card with no draft yet gets THIS object every time. `{}` written inline
// is a new object on each render, which is a changed prop, which is a
// re-render of a card nothing happened to.
const EMPTY_DRAFT = {};

// Where an accepted AI proposal is allowed to land, per kind. Anything not
// listed here — image files, figure numbers, file lists, package names,
// versions, executables, patches, facilities, measurements — is factual and
// is never touched by AI.
const list = (value) => (Array.isArray(value) ? value.join(", ") : value || "");

const split = (value) =>
  String(value || "")
    .split(",")
    .map((el) => el.trim())
    .filter(Boolean);

const basename = (path) => String(path || "").split("/").filter(Boolean).pop() || "";

const dirname = (path) => {
  const value = String(path || "");
  return value.includes("/") ? value.slice(0, value.lastIndexOf("/")) : "";
};

// A short, scannable label.
//
// The BACKEND owns a candidate's identity (`label` + `file_count`). Deriving
// it here is what broke: since record boundaries became folders,
// proposal.files holds ONE folder path, so dirname() returned the role root
// and every dataset under data/ rendered as "data · 1 file". The fallbacks
// below only cover an older response shape, and never walk up to a parent.
const labelOf = (candidate) => {
  const p = candidate.proposal || {};
  const count = candidate.file_count;
  const suffix =
    typeof count === "number" && count > 0
      ? ` · ${count} file${count === 1 ? "" : "s"}`
      : "";

  if (candidate.label) {
    const first = (candidate.paths || [])[0] || "";
    const boundary = (p.files || [])[0] || p.imageFile || first;
    return {
      primary: `${candidate.label}${
        candidate.kind === "chart" || candidate.kind === "tool" ? "" : suffix
      }`,
      secondary: dirname(boundary),
      full: boundary,
    };
  }

  // --- fallbacks for a response without an explicit label ------------------
  if (candidate.kind === "chart") {
    const path = p.imageFile || (candidate.paths || [])[0] || "";
    const parent = basename(dirname(path));
    return {
      primary: parent ? `${parent} / ${basename(path)}` : basename(path),
      secondary: dirname(path),
      full: path,
    };
  }
  if (candidate.kind === "tool") {
    return {
      primary: `${p.packageName || ""} ${p.version || ""}`.trim(),
      secondary: "",
      full: (candidate.paths || [])[0] || "",
    };
  }
  const path = (p.files || [])[0] || (candidate.paths || [])[0] || "";
  return { primary: basename(path), secondary: dirname(path), full: path };
};

// A candidate a curator can actually see and judge. An unnamed card would
// render blank yet still be tickable and addable, so it never reaches the
// list, the selection, or the apply payload.
const isRenderable = (candidate) => {
  const { primary } = labelOf(candidate);
  return Boolean(
    (primary || "").trim() && ((candidate.paths || [])[0] || "").trim()
  );
};

// Layout constants, hoisted so emotion serializes them once instead of on
// every keystroke in an open proposal (six fields re-render per character).
//
// The spacing is the contract: 16px inside a card, 12px between cards, 12px
// between the identity and the status/action groups, 8px between chips, 20px
// between field rows, 16px between the two field columns, and 8px inside a
// field group (input -> helper text -> evidence chip).
const CARD_SX = {
  border: 1,
  borderColor: "divider",
  borderRadius: 1,
  px: 2,
  py: 2,
  mb: 1.5,
};

const CARD_HEADER_SX = {
  display: "flex",
  alignItems: "flex-start",
  flexWrap: "wrap",
  rowGap: 1.5,
  columnGap: 1.5,
};

const CARD_IDENTITY_SX = {
  flexGrow: 1,
  flexBasis: 220,
  minWidth: 0,
  mr: 1.5,
};

const CARD_PATH_SX = { mt: 0.5, overflowWrap: "anywhere" };

// Both groups WRAP internally and are allowed to shrink. A group that
// refuses to shrink keeps its max-content width — the four action buttons in
// a row — and pushes the card sideways at phone width instead of stacking.
// The labels themselves still never break: that is the buttons' own rule.
const CARD_STATUS_SX = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 1,
  minWidth: 0,
};

const CARD_ACTIONS_SX = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 1,
  minWidth: 0,
  ml: "auto",
  // Multi-word labels stay on one line at every width.
  "& .MuiButton-root": { whiteSpace: "nowrap", minWidth: "auto" },
};

// The required marker, defined ONCE and used both on the field labels and in
// the legend that explains them. Two separate colour choices would drift, and
// a legend whose asterisk does not look like the asterisks it describes is
// not a legend.
//
// Colour is never the whole message: the legend spells the rule out in words,
// and each required input carries MUI's real `aria-required`, so nothing here
// depends on a reader distinguishing red from grey.
const REQUIRED_MARKER_COLOR = "error.main";

const FIELD_GROUP_SX = { display: "flex", flexDirection: "column", gap: 1 };

const FIELD_INPUT_SX = {
  "& .MuiFormHelperText-root": { mt: 0.5, mx: 0 },
  "& .MuiFormLabel-asterisk": { color: REQUIRED_MARKER_COLOR },
};

// ONE alignment contract for everything a candidate card expands: Details,
// the AI suggestion and the proposal form.
//
// They used to carry `pl: { xs: 0, sm: 5 }` — 40px of left padding and none
// on the right, meant to line the fields up under the header's checkbox. It
// did not centre them under it: the whole two-column form sat 40px right of
// the card's own axis, so the right margin looked half the left one. Padding
// is symmetric now, and the header keeps its own layout.
const CARD_EXPANSION_SX = {
  width: "100%",
  boxSizing: "border-box",
  px: { xs: 0, sm: 2 },
  mx: "auto",
};

const FIELDS_GRID_SX = { pt: 2.5 };

const CHECKBOX_SX = { mt: -0.5, ml: -0.5, flexShrink: 0 };

// ---- chart roles ------------------------------------------------------------
//
// A Chart stores exactly ONE image, so the unit of choice is the image file,
// not the folder. The backend reports every image it found grouped by its real
// folder (`chart_image_groups`); these helpers turn that plus the curator's
// choices into the `chart_plan` the backend validates. They are pure functions
// of their arguments so a role change never reads a stale render closure.

const CHART_ROLES = [
  { value: "chart", label: "Create Chart" },
  { value: "supporting", label: "Supporting File" },
  { value: "ignore", label: "Ignore" },
];

// The role an image has right now: the curator's own choice first, then the
// plan the server currently has in force, then the server's suggestion. Only
// the image the deterministic rule would have picked defaults to Create Chart;
// every other image defaults to Ignore and is flagged for review, so nothing
// is proposed that nobody looked at, and nothing is hidden either.
const roleOf = (overrides, applied, image) => {
  const chosen = overrides[image.path];
  if (chosen) return chosen;
  const inForce = applied[image.path];
  if (inForce) {
    return { action: inForce.action, target: inForce.target || "" };
  }
  return {
    action: image.suggested_action === "chart" ? "chart" : "ignore",
    target: "",
  };
};

const needsReview = (overrides, applied, image) =>
  !overrides[image.path] &&
  !applied[image.path] &&
  image.suggested_action !== "chart";

// The images in this folder that a supporting file may attach to.
const chartTargetsIn = (group, overrides, applied) =>
  (group.images || [])
    .filter((image) => roleOf(overrides, applied, image).action === "chart")
    .map((image) => image.path);

// The exact request field. Every discovered image carries its role explicitly,
// so the plan is a complete, auditable statement rather than a diff the server
// has to guess the rest of.
const buildChartPlan = (groups, overrides, applied) =>
  groups.reduce((plan, group) => {
    const targets = chartTargetsIn(group, overrides, applied);
    return plan.concat(
      (group.images || []).map((image) => {
        const { action, target } = roleOf(overrides, applied, image);
        if (action !== "supporting") return { path: image.path, action };
        return {
          path: image.path,
          action,
          target: targets.includes(target) ? target : targets[0] || "",
        };
      })
    );
  }, []);

// A supporting file with nothing to attach to. The server refuses it; saying
// so here means the curator fixes it before spending a round trip.
const chartPlanProblems = (groups, overrides, applied) =>
  groups.reduce((problems, group) => {
    const targets = chartTargetsIn(group, overrides, applied);
    return problems.concat(
      (group.images || [])
        .filter((image) => {
          const { action, target } = roleOf(overrides, applied, image);
          return (
            action === "supporting" &&
            !targets.includes(target) &&
            targets.length === 0
          );
        })
        .map((image) => image.path)
    );
  }, []);


// ---------------------------------------------------------------------------
// ONE CARD, ONE COMPONENT.
//
// These were function calls inside FolderAnalysis -- `.map(renderCandidate)`
// -- so React saw one component returning one very large tree, and every
// checkbox, keystroke and Details toggle re-rendered all of it. Nothing
// remounted, but on a folder of two dozen candidates a single toggle cost
// about 92ms, and the spec had to be given a raised timeout to survive it.
//
// As components they take what they need and nothing else, so `memo` can do
// its job: touching one candidate re-renders that candidate, the selection
// summary and the Add button. The parent still owns every piece of state --
// this moved no state, only the boundary React reconciles across.

const AiProposalPanel = memo(function AiProposalPanel({
  candidate,
  notice,
  suggestion,
  draft,
  onField,
}) {
  if (notice && !suggestion) {
    return (
      <Box sx={{ ...CARD_EXPANSION_SX, mt: 1 }}>
        <Alert severity="warning" data-testid={`ai-notice-${candidate.id}`}>
          {notice}
        </Alert>
      </Box>
    );
  }
  if (!suggestion) return null;
  const targets = aiTargets(candidate.kind);
  const description = suggestion.description || "";
  const keywords = suggestion.keywords || [];
  const descriptionField = targets.description;
  const keywordField = targets.keywords;

  // DERIVED, never remembered. A stored "applied" flag would keep claiming
  // a suggestion was applied after the curator edited or cleared the field
  // it went into; asking the draft cannot drift from it.
  const keywordText = keywords.join(", ");
  const descriptionApplied =
    Boolean(descriptionField) &&
    suggestionApplied(candidate.kind, descriptionField, draft, description);
  const keywordsApplied =
    Boolean(keywordField) &&
    suggestionApplied(candidate.kind, keywordField, draft, keywordText);
  // The panel's own headline state, over EVERYTHING this suggestion
  // offered. It has three values, not two: a suggestion offering a caption
  // and keywords, with only the keywords used, is neither applied nor
  // un-applied -- and calling it "not applied" contradicted the button two
  // lines below already reading "Applied to Keywords".
  const state = suggestionState(candidate.kind, draft, [
    { key: descriptionField, value: description },
    { key: keywordField, value: keywordText },
  ]);
  const stateLabel = {
    [APPLIED]: "applied",
    [PARTIALLY_APPLIED]: "partially applied",
    [NOT_APPLIED]: "not applied",
  }[state];

  return (
    <Box
      sx={{ ...CARD_EXPANSION_SX, mt: 1 }}
      data-testid={`ai-panel-${candidate.id}`}
    >
    <Box
      sx={{
        p: 1.5,
        borderRadius: 1,
        border: 1,
        borderColor: "info.light",
        bgcolor: "action.hover",
      }}
    >
      {/* Deliberately unlike the deterministic evidence chip: an outlined
          secondary label, always prefixed "AI suggestion", so a model's
          opinion can never be read as a detected fact. */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Chip
          size="small"
          variant="outlined"
          color="secondary"
          label={`AI suggestion: ${suggestion.confidence || "low"}`}
          data-testid={`ai-confidence-${candidate.id}`}
        />
        {/* The state is spelled out. Colour alone would leave the three
            apart only for people who can compare two greys and a green. */}
        <Typography
          variant="caption"
          color={
            state === APPLIED
              ? "success.main"
              : state === PARTIALLY_APPLIED
              ? "warning.main"
              : "text.secondary"
          }
          data-testid={`ai-applied-${candidate.id}`}
        >
          {stateLabel}
        </Typography>
      </Box>
      {suggestion.reason ? (
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ mb: 0.5 }}
          data-testid={`ai-reason-${candidate.id}`}
        >
          Based on: {suggestion.reason}
        </Typography>
      ) : null}
      {/* A second opinion on the classification, shown only when the
          deterministic pass was itself unsure and the AI disagrees. It is
          a note: Qresp never moves a candidate between groups on its own,
          because that would change records the curator did not review. */}
      {suggestion.kind &&
        suggestion.kind !== candidate.kind &&
        candidate.confidence !== "high" && (
          <Typography
            variant="body2"
            sx={{ mt: 0.5 }}
            data-testid={`ai-kind-${candidate.id}`}
          >
            AI reads this more like a <strong>{suggestion.kind}</strong> than
            a {candidate.kind}. Nothing has been moved — remove it here and
            add it under {suggestion.kind}s yourself if you agree.
          </Typography>
        )}
      {description ? (
        <Fragment>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {description}
          </Typography>
          {/* Per-field acceptance. Disabled while OTHER text is in the
              field: an AI suggestion never overwrites something a person
              wrote, not even on a click meant for something else. Once this
              suggestion IS the field's value the button says so rather than
              claiming the curator's text is being protected from it -- the
              text it would be protecting is its own. */}
          <Button
            size="small"
            disabled={Boolean(draft[descriptionField]) || descriptionApplied}
            onClick={() =>
              onField(candidate.id, descriptionField, description)
            }
            data-testid={`ai-use-description-${candidate.id}`}
          >
            {descriptionApplied
              ? `Applied to ${labelFor(candidate.kind, descriptionField)}`
              : `Use as ${labelFor(candidate.kind, descriptionField)}`}
          </Button>
          {draft[descriptionField] && !descriptionApplied ? (
            <Typography variant="caption" color="text.secondary">
              your text is kept — clear the field to use this instead
            </Typography>
          ) : null}
        </Fragment>
      ) : (
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          The AI had too little evidence to describe this one — the field
          stays blank for you to fill in.
        </Typography>
      )}
      {keywords.length > 0 && (
        <Box sx={{ mt: 1, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {keywords.map((keyword) => (
            <Chip key={keyword} size="small" variant="outlined" label={keyword} />
          ))}
          {/* keywordField is always set when keywords arrive: the server
              does not return them for a type that cannot hold them. */}
          {keywordField ? (
            <Button
              size="small"
              disabled={Boolean(draft[keywordField]) || keywordsApplied}
              onClick={() =>
                onField(candidate.id, keywordField, keywordText)
              }
              data-testid={`ai-use-keywords-${candidate.id}`}
            >
              {keywordsApplied
                ? `Applied to ${labelFor(candidate.kind, keywordField)}`
                : `Use as ${labelFor(candidate.kind, keywordField)}`}
            </Button>
          ) : null}
        </Box>
      )}
    </Box>
    </Box>
  );
});

const CandidateCard = memo(function CandidateCard({
  candidate,
  draft,
  isSelected,
  detailsOpen,
  editOpen,
  problem,
  aiLoading,
  aiNotice,
  aiSuggestion,
  onSelect,
  onToggleDetails,
  onToggleEdit,
  onRemove,
  onEnhance,
  onField,
}) {
  // What the deterministic analysis proposed, in the draft's own shape, so
  // "is this still the analysed value?" is one comparison rather than a
  // per-field special case. Cheap: a handful of string conversions.
  const original = toDraft(candidate.kind, candidate.proposal);
  const needs = missingRequired(candidate.kind, draft);
  const { primary, secondary, full } = labelOf(candidate);
  // Fields appear once the candidate matters: it is selected, or the
  // curator explicitly opened it. An unselected card stays a single line.
  const fieldsVisible =
    isSelected || editOpen || problem;

  return (
    <Box
      key={candidate.id}
      // 16px of breathing room inside the card, 12px between cards.
      sx={CARD_SX}
    >
      {/* Three regions: the checkbox, the identity, and the status/actions
          group. The identity grows; the status and the actions keep their
          natural width and drop onto their own line TOGETHER when the row
          runs out of space, instead of labels breaking word by word. */}
      <Box
        sx={CARD_HEADER_SX}
      >
        <Checkbox
          size="small"
          sx={CHECKBOX_SX}
          checked={isSelected}
          onChange={(event) =>
            onSelect(candidate.id, event.target.checked)
          }
          slotProps={{ input: { "aria-label": `Select ${primary}` } }}
        />
        <Box
          data-testid={`identity-${candidate.id}`}
          sx={CARD_IDENTITY_SX}
        >
          <Typography variant="subtitle2" noWrap title={full || primary}>
            {primary}
          </Typography>
          {secondary ? (
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
              title={secondary}
              // 4px under the name, and a long relative path breaks rather
              // than pushing the status and actions off the row.
              sx={CARD_PATH_SX}
            >
              {secondary}
            </Typography>
          ) : null}
        </Box>
        <Box
          data-testid={`status-${candidate.id}`}
          sx={CARD_STATUS_SX}
        >
          {/* No evidence chip. "High / Medium / Low evidence" answered a
              question a curator was not asking -- how the analyser reached
              this proposal -- and sat in the one place on the card where
              the thing they ARE asking about belongs: what is still
              missing. The missing-required count stays; it is the only
              status here that tells them to act.

              Evidence is untouched behind the card: it still orders
              candidates, bounds what may be sent to the AI, and decides
              when the AI abstains. */}
          {/* WHAT THIS CARD STILL NEEDS -- and only once an Add has
              actually been refused for it.

              Saying it up front put a warning on work nobody had started.
              A folder of twelve figures opened as twelve identical
              warnings, none of which the curator had asked for, and the
              two they wanted were indistinguishable from the ten they did
              not. The names of the fields are exactly what they need to
              see; the moment they need to see them is when they have asked
              for these items and been told no. */}
          {problem && (
            <Chip
              size="small"
              color="error"
              variant="outlined"
              label={`Needs ${needs
                .map((field) => labelFor(candidate.kind, field))
                .join(", ")}`}
              data-testid={`needs-input-${candidate.id}`}
              sx={{
                height: "auto",
                maxWidth: "100%",
                "& .MuiChip-label": {
                  whiteSpace: "normal",
                  overflowWrap: "anywhere",
                  py: 0.25,
                },
              }}
            />
          )}
        </Box>
        <Box
          data-testid={`actions-${candidate.id}`}
          sx={CARD_ACTIONS_SX}
        >
          {/* Visually distinct from the Add checkbox on the left: the
              checkbox chooses what goes to the Curator, this describes
              THIS candidate and nothing else. A multi-selection can stay
              exactly as it is while one item is enhanced. */}
          {Object.keys(aiTargets(candidate.kind)).length > 0 && (
            <Button
              size="small"
              variant="outlined"
              color="secondary"
              disabled={Boolean(aiLoading)}
              onClick={() => onEnhance(candidate)}
              data-testid={`enhance-${candidate.id}`}
            >
              {aiLoading ? "Asking AI…" : "Enhance with AI"}
            </Button>
          )}
          <Button size="small" onClick={() => onToggleDetails(candidate.id)}>
            Details
          </Button>
          {!isSelected && (
            <Button size="small" onClick={() => onToggleEdit(candidate.id)}>
              Edit Proposal
            </Button>
          )}
          <Button
            size="small"
            onClick={() => onRemove(candidate.id)}
          >
            Remove
          </Button>
        </Box>
      </Box>

      <Collapse in={detailsOpen} unmountOnExit>
        <Box
          sx={{ ...CARD_EXPANSION_SX, pt: 1 }}
          data-testid={`details-${candidate.id}`}
        >
          {(candidate.evidence || []).map((line) => (
            <Typography
              key={line}
              variant="caption"
              display="block"
              sx={{ overflowWrap: "anywhere" }}
            >
              {line}
            </Typography>
          ))}
          {/* Filename material, kept clearly apart from evidence: these
              are guesses about names, not things Qresp verified. */}
          {(candidate.filename_hints || []).length > 0 && (
            <Box sx={{ mt: 1 }} data-testid={`hints-${candidate.id}`}>
              <Typography variant="caption" color="warning.main" display="block">
                Filename hints — not verified metadata, never used as a
                field value:
              </Typography>
              {(candidate.filename_hints || []).map((hint) => (
                <Typography
                  key={hint}
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{ overflowWrap: "anywhere" }}
                >
                  {hint}
                </Typography>
              ))}
            </Box>
          )}
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ overflowWrap: "anywhere" }}
          >
            Files: {(candidate.paths || []).join(", ")}
          </Typography>
        </Box>
      </Collapse>

      <AiProposalPanel
        candidate={candidate}
        notice={aiNotice}
        suggestion={aiSuggestion}
        draft={draft}
        onField={onField}
      />

      <Collapse in={fieldsVisible} unmountOnExit>
        <Box
          sx={CARD_EXPANSION_SX}
          data-testid={`fields-wrapper-${candidate.id}`}
        >
        {/* Deliberate separation from the header/evidence above: a rule,
            then real space before the first input — the Figure Image used
            to sit directly against it. */}
        <Divider sx={{ mt: 2 }} data-testid={`fields-divider-${candidate.id}`} />
        <Grid
          container
          // 20px between field rows, 16px between the two columns.
          rowSpacing={2.5}
          columnSpacing={2}
          sx={FIELDS_GRID_SX}
          data-testid={`fields-${candidate.id}`}
        >
          {fieldsFor(candidate.kind).map(({ key: field, required }) => {
            return (
              // ONE field group per field. It now holds only the input --
              // the helper paragraph and the evidence chip that used to sit
              // under it are gone -- but the column layout stays, so two
              // fields on the same row still line up.
              <Grid
                key={field}
                size={{ xs: 12, md: 6 }}
                sx={FIELD_GROUP_SX}
                data-testid={`field-group-${candidate.id}-${field}`}
              >
                <TextField
                  fullWidth
                  size="small"
                  label={labelFor(candidate.kind, field)}
                  // Red on the label and the box, on exactly the fields
                  // that are empty and were asked for -- so the card's
                  // chip and the inputs point at the same thing.
                  error={problem && needs.includes(field)}
                  // MUI renders the asterisk and sets aria-required, so the
                  // marker is real semantics rather than a character glued
                  // onto the label text.
                  required={required}
                  value={draft[field]}
                  onChange={(event) =>
                    onField(candidate.id, field, event.target.value)
                  }
                  // The contract's own explanation of the field, so
                  sx={FIELD_INPUT_SX}
                  // No helper text. The label names the field, the asterisk
                  // marks it required, and the legend at the top says once
                  // what the asterisk means. A paragraph under every input
                  // ("The image file for this figure...", "Qresp never
                  // guesses it...") pushed the values a curator came here
                  // to check off the card, and repeated for each of six
                  // fields on each of several candidates.
                  //
                  // The evidence chip is gone for the same reason. "High /
                  // Medium / Low evidence" describes how the ANALYSER
                  // arrived at a proposal; a curator reading the value is
                  // deciding whether it is right, which they do by looking
                  // at it. Evidence still governs the backend's candidate
                  // ranking, what may be sent to the AI, and when it
                  // abstains -- see `evidenceChipFor` in Utils and the
                  // abstention policy. Only the badge is removed.
                />
              </Grid>
            );
          })}
        </Grid>
        </Box>
      </Collapse>
    </Box>
  );
});

const ChartImageRow = memo(function ChartImageRow({
  group,
  image,
  action,
  attached,
  groupTargets,
  base,
  onRole,
  onTarget,
}) {
  const name = basename(image.path);
  // Derived HERE, from props that do not change on their own. Built by the
  // parent and passed in, the URL was a new string and the target list a new
  // array on every render -- both changed props, both enough to defeat the
  // memo this row exists for.
  const url = buildFileUrl(base, image.path);
  const targets = (groupTargets || []).filter((path) => path !== image.path);

  return (
    <Box
      key={image.path}
      // Wraps instead of overflowing: at a narrow width the controls drop
      // onto their own line rather than pushing the dialog sideways.
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 1.5,
        mb: 1,
        maxWidth: "100%",
      }}
      data-testid={`chart-image-${image.path}`}
    >
      {/* A thumbnail when the browser can load it. When RCC TLS or the file
          itself refuses, the filename and a direct link are the fallback --
          never a blank box. */}
      {url ? (
        <Box
          component="img"
          src={url}
          alt=""
          sx={{ width: 48, height: 48, objectFit: "contain", border: 1,
                borderColor: "divider", borderRadius: 1, flexShrink: 0 }}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <Box sx={{ flexGrow: 1, flexBasis: 160, minWidth: 0 }}>
        {/* The filename, and nothing else.

            `image.reason` said things like "image found in this chart
            folder" and "filename matches the chart folder" -- one line per
            image, repeated down a list where every entry was found the same
            way, restating what the folder heading above already says. The
            curator is choosing a ROLE for a file they can see the name and
            thumbnail of; how the analyser noticed it does not help.

            The Review chip went with it: an image's role is in the select
            beside it, already reading "Review" when that is what it is, so
            the chip was the same fact twice. Nothing is hidden -- every
            image found is still listed, and `needsReview` still governs
            what is ignored until the curator says otherwise. */}
        <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
          {name}
        </Typography>
      </Box>
      {url ? (
        <Button
          size="small"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ whiteSpace: "nowrap" }}
        >
          Open image
        </Button>
      ) : null}
      <TextField
        select
        size="small"
        label="Role"
        value={action}
        onChange={(event) =>
          onRole(group, image.path, event.target.value)
        }
        sx={{ minWidth: 170, maxWidth: "100%" }}
        slotProps={{ htmlInput: { "aria-label": `Role for ${name}` } }}
      >
        {CHART_ROLES.map((role) => (
          <MenuItem key={role.value} value={role.value}>
            {role.label}
          </MenuItem>
        ))}
      </TextField>
      {action === "supporting" ? (
        <TextField
          select
          size="small"
          label="Attach to Chart"
          value={targets.includes(attached) ? attached : ""}
          onChange={(event) =>
            onTarget(image.path, event.target.value)
          }
          error={targets.length === 0}
          helperText={
            targets.length === 0
              ? "Set an image in this folder to Create Chart first."
              : " "
          }
          sx={{ minWidth: 170, maxWidth: "100%" }}
          slotProps={{
            htmlInput: { "aria-label": `Chart for ${name}` },
          }}
        >
          {targets.length === 0 ? (
            <MenuItem value="" disabled>
              No Chart in this folder yet
            </MenuItem>
          ) : null}
          {targets.map((path) => (
            <MenuItem key={path} value={path}>
              {basename(path)}
            </MenuItem>
          ))}
        </TextField>
      ) : null}
    </Box>
  );
});

const FolderAnalysis = ({
  path,
  artifactType,
  // Let a caller supply its own way in. The workspace offers ONE
  // "Import from RCC" menu covering all four types; four separate
  // full-width buttons stacked down the page is what that replaces.
  hideTrigger = false,
  autoOpen = false,
  // WHAT THIS IMPORT IS FOR, decided by whoever opened it: an explicit
  // independent create, or a row-scoped link to one existing resource (see
  // Utils/connectionIntent.js). Absent only for the standalone Analyze
  // button, which has always created independent records.
  connection,
}) => {
  const {
    fileServerPath,
    addMany,
    rccAnalysisCache,
    cacheRccAnalysis,
    collectDraftState,
  } = useContext(CuratorContext) || {};
  // The same create-and-link the manual forms use. One kind per row-scoped
  // import, so one connection choice covers the batch: every selected
  // candidate gets the same arrow to the same source.
  const link = useRowLink(artifactType, connection);
  const { setAlert } = useContext(AlertContext) || {};
  const typedGroup = artifactType ? GROUP_BY_TYPE[artifactType] : null;

  // Type-specific imports use the saved Curator path. The optional explicit
  // path remains for compatible embedders and tests; the backend validates
  // either form against its own allowed roots.
  const target = (path === undefined ? fileServerPath : path) || "";

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [selected, setSelected] = useState({});
  const [removed, setRemoved] = useState({});
  // Has an Add been TRIED and refused? Nothing is said about a missing field
  // until then -- see the note on `blockedSelected` below.
  const [addAttempted, setAddAttempted] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState({});
  const [editOpen, setEditOpen] = useState({});
  const [showUnclassified, setShowUnclassified] = useState({});
  const [unclassifiedFilter, setUnclassifiedFilter] = useState("");
  const [showAllUnclassified, setShowAllUnclassified] = useState(false);
  // Record-boundary selection, keyed by role root. Nothing is selected by
  // default: the deterministic immediate-child boundaries are in force until
  // the curator rebuilds with a choice.
  const [boundaries, setBoundaries] = useState({});
  const [pickerOpen, setPickerOpen] = useState(false);
  // How the folder was read: a chip by default, the long version on request.
  // Both start closed, every time the dialog opens.
  const [scanDetailsOpen, setScanDetailsOpen] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [tab, setTab] = useState(0);
  // Optional AI enrichment: a SEPARATE action over the candidates already
  // selected, behind its own always-unchecked consent box. Selecting
  // candidates never sends anything by itself, the deterministic analysis
  // works whether or not the provider is configured, and a returned proposal
  // is only ever a SUGGESTION — it is parked here until the curator accepts
  // it into a field.
  const [aiConsent, setAiConsent] = useState(false);
  // The candidate whose consent dialog is open, or null. Consent is asked
  // fresh for every candidate and is never remembered.
  const [aiConsentOpen, setAiConsentOpen] = useState(null);
  // Both keyed by candidate id: one candidate's request must not blank
  // another's result or show its spinner.
  const [aiLoading, setAiLoading] = useState({});
  const [aiNotice, setAiNotice] = useState({});
  const [aiSuggestions, setAiSuggestions] = useState({});
  // Candidate lists can be long. Nothing is discarded — the rest is one
  // explicit click away, and the count is always on screen.
  const [showAll, setShowAll] = useState({});

  // The curator's chart-image roles, keyed by IMAGE PATH — the boundary panel
  // is the only place image roles are decided, so a candidate card never
  // carries a second controller for the same thing. Only explicit choices
  // live here; the suggestion and the plan currently in force are read from
  // the analysis, so a rebuild shows what the server actually applied rather
  // than what this component remembered.
  const [chartRoles, setChartRoles] = useState({});
  const [chartsOpen, setChartsOpen] = useState(true);

  const chartGroups = (analysis || {}).chart_image_groups || [];
  const appliedPlan = useMemo(() => {
    const inForce = {};
    ((analysis || {}).applied_chart_plan || []).forEach((entry) => {
      inForce[entry.path] = entry;
    });
    return inForce;
  }, [analysis]);

  // The Charts each folder offers a supporting file, kept BY CONTENT.
  //
  // Recomputing is cheap; handing back a NEW ARRAY is not, because that is a
  // changed prop on every row in every folder. A role change in one folder
  // leaves the other folders' lists identical, so those keep the array they
  // already had and their rows are not re-rendered to be told nothing
  // happened.
  const targetsByFolder = useRef({});
  const chartTargetsByFolder = useMemo(() => {
    const next = {};
    chartGroups.forEach((group) => {
      const fresh = chartTargetsIn(group, chartRoles, appliedPlan);
      const previous = targetsByFolder.current[group.folder];
      next[group.folder] =
        previous &&
        previous.length === fresh.length &&
        previous.every((path, index) => path === fresh[index])
          ? previous
          : fresh;
    });
    targetsByFolder.current = next;
    return next;
  }, [chartGroups, chartRoles, appliedPlan]);

  const setChartRole = useCallback((group, path, action) =>
    // Functional update: the next roles are derived from the CURRENT state,
    // never from the render-time snapshot, so two changes in one tick cannot
    // lose the first.
    setChartRoles((current) => {
      const next = { ...current, [path]: { action, target: "" } };
      if (action === "supporting") {
        const previous = current[path] || {};
        const targets = chartTargetsIn(group, next, appliedPlan).filter(
          (candidate) => candidate !== path
        );
        next[path] = {
          action,
          target: targets.includes(previous.target)
            ? previous.target
            : targets[0] || "",
        };
      }
      return next;
    }), [appliedPlan]);

  const setChartTarget = useCallback((path, chart) =>
    setChartRoles((current) => ({
      ...current,
      [path]: { action: "supporting", target: chart },
    })), []);

  const ready = Boolean(target.trim());

  useEffect(() => {
    if (autoOpen && ready) analyze();
    // Mount-only: the caller remounts this with a new key to open it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    setOpen(false);
    setLoading(false);
    setError("");
    setAnalysis(null);
    setDrafts({});
    setSelected({});
    setRemoved({});
    setAddAttempted(false);
    setDetailsOpen({});
    setEditOpen({});
    setShowUnclassified({});
    setUnclassifiedFilter("");
    setShowAllUnclassified(false);
    setBoundaries({});
    setChartRoles({});
    setChartsOpen(true);
    setPickerOpen(false);
    setScanDetailsOpen(false);
    setMappingOpen(false);
    setTab(0);
    setAiConsent(false);
    setAiConsentOpen(null);
    setAiLoading({});
    setAiNotice({});
    setAiSuggestions({});
    setShowAll({});
  };

  const hydrateAnalysis = (data) => {
    const initial = {};
    GROUPS.forEach(({ key, type }) => {
      if (!type) return;
      ((data.candidates || {})[key] || []).forEach((candidate) => {
        initial[candidate.id] = toDraft(candidate.kind, candidate.proposal);
      });
    });
    // Candidate ids are positional ("chart-0"), so every view keyed by id
    // is reset when a scan is loaded, including when it came from the shared
    // runtime cache.
    setDrafts(initial);
    setBoundaries(data.applied_boundaries || {});
    setChartRoles({});
    setSelected({});
    setRemoved({});
    setAddAttempted(false);
    setEditOpen({});
    setDetailsOpen({});
    setAiSuggestions({});
    setAiNotice({});
    setAiLoading({});
    setAnalysis(data);
  };

  const analyze = async (chosen, plan, options = {}) => {
    setOpen(true);
    setError("");

    const canUseCache =
      !options.force &&
      chosen === undefined &&
      plan === undefined &&
      rccAnalysisCache &&
      rccAnalysisCache.path === target &&
      rccAnalysisCache.data;

    if (canUseCache) {
      setLoading(false);
      hydrateAnalysis(rccAnalysisCache.data);
      return;
    }

    setLoading(true);
    setAnalysis(null);
    try {
      const response = await axios.post("/api/curation/analyze-folder", {
        path: target,
        // Only sent when the curator picked boundaries; the backend
        // validates every path against the tree it just listed.
        ...(chosen && Object.keys(chosen).length
          ? { boundaries: chosen }
          : {}),
        // Likewise for chart image roles: absent means "use the defaults",
        // which is exactly what Use default boundaries restores.
        ...(plan && plan.length ? { chart_plan: plan } : {}),
      });
      const data = response.data || {};
      if (cacheRccAnalysis) cacheRccAnalysis(target, data);
      hydrateAnalysis(data);
    } catch (err) {
      setError(
        (err && err.response && err.response.data && err.response.data.error) ||
          "The folder could not be analyzed."
      );
    } finally {
      setLoading(false);
    }
  };

  const EVIDENCE_ORDER = { high: 0, medium: 1, low: 2 };
  const DEFAULT_VISIBLE = 25;

  // Strongest evidence first, so the default view leads with what Qresp can
  // actually stand behind. Nothing is dropped by this ordering.
  const candidatesFor = (key) =>
    (((analysis || {}).candidates || {})[key] || [])
      .filter((candidate) => !removed[candidate.id] && isRenderable(candidate))
      .slice()
      .sort(
        (a, b) =>
          (EVIDENCE_ORDER[a.confidence] == null
            ? 3
            : EVIDENCE_ORDER[a.confidence]) -
          (EVIDENCE_ORDER[b.confidence] == null
            ? 3
            : EVIDENCE_ORDER[b.confidence])
      );

  // What the tab renders right now. Selected candidates are ALWAYS shown, so
  // collapsing the list can never hide something the curator picked.
  const visibleCandidatesFor = (key) => {
    const all = candidatesFor(key);
    if (showAll[key] || all.length <= DEFAULT_VISIBLE) {
      return all;
    }
    const head = all.slice(0, DEFAULT_VISIBLE);
    const kept = new Set(head.map((candidate) => candidate.id));
    return head.concat(
      all.slice(DEFAULT_VISIBLE).filter(
        (candidate) => selected[candidate.id] && !kept.has(candidate.id)
      )
    );
  };

  // THE set of candidates an Add would actually apply: still on the list —
  // not removed, not unusable — AND ticked.
  //
  // Counting `selected` on its own was counting ghosts. Remove only set
  // `removed`, so a card the curator had ticked and then removed still said
  // "1 selected" and still lit the Add button, which then applied nothing and
  // closed the dialog reporting "0 item(s) were added". The count, the
  // button's disabled state and apply() all read this one helper now, so they
  // cannot disagree about what is selected.
  const selectedCandidatesFor = (key) =>
    candidatesFor(key).filter((candidate) => selected[candidate.id]);

  const selectedCandidates = useMemo(
    () =>
      (typedGroup ? [typedGroup] : GROUPS).reduce(
        (found, { key, type }) =>
          type ? found.concat(selectedCandidatesFor(key)) : found,
        []
      ),
    // `candidatesFor` reads the analysis and `removed`; both belong here, and
    // a dependency list of just `selected` is what let a removed candidate
    // keep its place in the count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analysis, selected, removed, typedGroup]
  );

  const selectedCount = selectedCandidates.length;

  // WHAT AN IMPORT IS ALLOWED TO CREATE.
  //
  // The same contract manual entry enforces: `missingRequired` from
  // Utils/artifactFields, which is what the Add/Edit form's own resolver
  // checks and what the server's schema.json requires at publish. Import was
  // the one door into the Curator that did not check it -- a folder holding
  // an image became a Chart with no caption, no figure number and no
  // keywords, and the refusal arrived at publish, long after the folder was
  // closed and the person who knew the answer had moved on.
  //
  // Nothing here re-states which fields those are. Asking the contract is
  // the whole point: a field that becomes required for manual entry becomes
  // required for import in the same commit.
  const missingFor = (candidate) =>
    missingRequired(candidate.kind, drafts[candidate.id] || {});

  const readyToAdd = (candidate) => missingFor(candidate).length === 0;

  const namesOf = (candidate) =>
    missingFor(candidate).map((field) => labelFor(candidate.kind, field));

  // The selected candidates that cannot be added yet, with what each one
  // still needs. Read by apply(), by the warning it raises and by the cards
  // it points at, so they cannot disagree about what is blocked.
  //
  // WHEN this is SAID is the whole difference. Marking every card the moment
  // the dialog opened put a warning on work nobody had started: a folder of
  // twelve figures opened as twelve red badges, and the two the curator
  // actually wanted looked exactly like the ten they did not. The reading is
  // the same; it is raised when they press Add, about the items they chose.
  const blockedSelected = selectedCandidates
    .filter((candidate) => !readyToAdd(candidate))
    .map((candidate) => ({
      id: candidate.id,
      name: labelOf(candidate).primary,
      missing: namesOf(candidate),
    }));

  // A candidate is completed WHERE IT IS: the card's own fields, which are
  // the contract's fields under the contract's labels. There is deliberately
  // no second route -- an "open it in the Add form" button existed briefly
  // and was a whole parallel flow (hand over, watch for a save, take the
  // card off the list) for a job the card already does inline.
  const blockedIds = new Set(blockedSelected.map((item) => item.id));

  // Is this card being asked for something, right now?
  const isProblem = (candidate) =>
    addAttempted && blockedIds.has(candidate.id);

  // Everything the AI action may see, built here so the allowlist is visible:
  // the SELECTED candidate's id/kind, its display name, its RELATIVE paths,
  // its file-kind inventory, and the STRUCTURED evidence the backend already
  // extracted from inside that candidate's own boundary (`ai_sources`:
  // README text, module docstrings, top-level symbol names, notebook markdown
  // cells, pinned declarations). No unselected candidate, no raw file
  // contents, no image bytes, no notebook code or output, no credentials, no
  // profile or ownership data, nothing outside the candidate's boundary.
  //
  // What is deliberately NOT here any more: `draft.readme` and
  // `draft.description`. This used to send the curator's own answer back as
  // the input for the very field the model was being asked to fill, so a
  // filled field produced a paraphrase of itself and an empty one produced
  // nothing but the analyzer's structural sentences. The server drops the old
  // `context` key outright, so an older client cannot reinstate the leak.
  //
  // The AI request is built for ONE candidate. The Add checkboxes are a
  // different concept entirely -- they choose what goes to the Curator -- and
  // they no longer decide what gets described. A batch shared one output
  // budget between candidates and invited the model to compare them, which is
  // what produced partial answers and interchangeable descriptions.
  const aiItem = (candidate) => ({
    id: candidate.id,
    kind: candidate.kind,
    name: labelOf(candidate).primary,
    paths: candidate.paths || [],
    inventory: candidate.inventory || {},
    sources: candidate.ai_sources || [],
  });

  // The paper's OWN title and abstract, as background for the field the work
  // sits in. Read from the live draft state at click time, so an unsaved
  // title counts. It is background only: the backend prompt forbids using it
  // as evidence for what an individual artifact does.
  const paperContext = () => {
    const state = collectDraftState ? collectDraftState() : {};
    const reference = (state && state.referenceInfo) || {};
    return {
      title: reference.title || "",
      abstract: reference.abstract || "",
    };
  };

  // Consent is asked FRESH every time: the box resets whenever the dialog
  // opens, and closing it (however) clears it again. There is deliberately
  // no remembered "always allow".
  // Stable, like the other card handlers: rebuilt each render it would be a
  // changed prop on every card, and the `memo` on them would never hold.
  const openAiConsent = useCallback((candidate) => {
    setAiConsent(false);
    setAiConsentOpen(candidate);
  }, []);

  const closeAiConsent = () => {
    setAiConsentOpen(null);
    setAiConsent(false);
  };

  const describeWithAI = async (candidate) => {
    setAiConsentOpen(null);
    setAiConsent(false);
    if (!candidate) return;
    const id = candidate.id;
    // Loading and failure belong to THIS candidate: another candidate's
    // suggestion, or its error, is not disturbed by this request.
    setAiLoading((current) => ({ ...current, [id]: true }));
    setAiNotice((current) => ({ ...current, [id]: "" }));
    try {
      const response = await axios.post("/api/curation/describe-candidates", {
        consent: true,
        // Background context for the whole request, not evidence about the
        // artifact. Bounded and redacted again on the server.
        paper_context: paperContext(),
        // Exactly one. The server rejects anything else before it calls the
        // provider or spends a quota unit.
        items: [aiItem(candidate)],
      });
      const suggestions = (response.data || {}).suggestions || {};
      const mine = suggestions[id];
      if (mine) {
        // Parked as a proposal ONLY. Nothing the curator typed is touched,
        // and no field is filled until they accept it below.
        setAiSuggestions((current) => ({ ...current, [id]: mine }));
        setAiNotice((current) => ({ ...current, [id]: "" }));
      } else {
        // The id came back in `no_suggestion`. Two different things land
        // here and the curator needs to tell them apart: the server refused
        // to ask at all because this candidate has no evidence of its own,
        // or it asked and got nothing usable back. Which one it was is
        // already knowable from the candidate — no new API field is needed,
        // and inventing one would let the two drift apart.
        setAiNotice((current) => ({
          ...current,
          [id]: (candidate.ai_sources || []).length
            ? "No reliable suggestion was returned for this item."
            : "No reliable candidate-specific evidence was found, so " +
              "nothing was sent to the AI service. Add a README, a module " +
              "docstring, or notebook markdown inside this item's own " +
              "folder, then rebuild the proposals.",
        }));
      }
    } catch (err) {
      setAiNotice((current) => ({
        ...current,
        [id]:
          (err && err.response && err.response.data &&
            err.response.data.error) ||
          "AI descriptions could not be generated.",
      }));
    } finally {
      setAiLoading((current) => ({ ...current, [id]: false }));
    }
  };

  const apply = () => {
    // ALL OR NOTHING. Adding the ready ones and silently leaving the rest
    // would be the worst of the three outcomes: the curator asked for a
    // batch, gets a smaller one, and has to work out which folder is
    // missing from a list they have already scrolled past.
    //
    // Pressing Add is also the MOMENT the missing fields are named. Until
    // now the cards have said nothing about them, so this is where the
    // question gets asked and where it gets answered: the warning above the
    // button says how many, each blocked card says which fields, and the
    // empty inputs on those cards turn red.
    if (blockedSelected.length) {
      setAddAttempted(true);
      // Open the blocked cards, and put the curator on the tab the first of
      // them is on -- being told an item is incomplete while looking at a
      // different kind is being told about something you cannot see.
      setEditOpen((current) => {
        const next = { ...current };
        blockedSelected.forEach((item) => {
          next[item.id] = true;
        });
        return next;
      });
      if (!typedGroup) {
        const first = blockedSelected[0].id;
        const index = GROUPS.findIndex(({ key, type }) =>
          type ? candidatesFor(key).some((one) => one.id === first) : false
        );
        if (index >= 0) setTab(index);
      }
      return;
    }
    setAddAttempted(false);

    // CREATE AND LINK. The records and their arrows go in together or not
    // at all -- never a record first with the link left for later. The same
    // `edgeProblem` every other link uses decides whether the arrow is
    // allowed, and is asked BEFORE anything is dispatched so the curator is
    // told why; the reducer asks again and refuses the whole change if the
    // state moved underneath.
    if (connection !== undefined &&
        (link.rowScoped || intentProblem(connection))) {
      if (!typedGroup) {
        link.refuse(
          "A linked import has to be one kind at a time. Nothing was added."
        );
        return;
      }
      const records = selectedCandidatesFor(typedGroup.key).map((candidate) =>
        toRecord(typedGroup.type, drafts[candidate.id])
      );
      if (link.createAndLink(records)) close();
      return;
    }

    let total = 0;
    (typedGroup ? [typedGroup] : GROUPS).forEach(({ key, type }) => {
      if (!type) return;
      // One candidate, one record, for every kind. A Chart's image roles were
      // decided in the boundary panel and are already reflected in the
      // proposal the server built, so nothing is split or merged here.
      const records = selectedCandidatesFor(key).map((candidate) =>
        toRecord(type, drafts[candidate.id])
      );
      if (records.length) {
        total += records.length;
        addMany(type, records);
      }
    });
    if (setAlert) {
      // Candidate paths are RELATIVE to the folder that was analyzed. Charts
      // render as fileServerPath + imageFile, so if the analyzed folder is
      // not (yet) the saved one, every image URL would point somewhere else.
      // Say so at the moment it matters rather than leaving blank figures.
      const mismatch =
        target && fileServerPath && target !== fileServerPath
          ? " NOTE: these paths are relative to the folder you analyzed, " +
            "which is not the saved File Server path — save that folder so " +
            "chart images resolve."
          : !fileServerPath
          ? " NOTE: no File Server path is saved yet. Use Save File Server " +
            "for this folder, or chart images will not load."
          : "";
      setAlert(
        "Added to the form",
        `${total} ${addedNoun(total, typedGroup)} added to this curation ` +
          "form. Nothing has been " +
          "saved or published — review each one and use Save when you are " +
          "ready." +
          mismatch,
        null
      );
    }
    close();
  };

  // EVERY HANDLER A CARD GETS IS STABLE, and takes the candidate's id as an
  // argument rather than closing over it. A handler rebuilt each render is a
  // changed prop, and a changed prop defeats the `memo` on the card it is
  // passed to -- which would put every candidate back to re-rendering on
  // every keystroke.
  const setField = useCallback(
    (id, field, value) =>
      setDrafts((current) => ({
        ...current,
        [id]: { ...current[id], [field]: value },
      })),
    []
  );

  const selectCandidate = useCallback(
    (id, checked) =>
      setSelected((current) => ({ ...current, [id]: checked })),
    []
  );

  const toggleDetails = useCallback(
    (id) => setDetailsOpen((current) => ({ ...current, [id]: !current[id] })),
    []
  );

  const toggleEdit = useCallback(
    (id) => setEditOpen((current) => ({ ...current, [id]: !current[id] })),
    []
  );

  const removeCandidate = useCallback((id) => {
    setRemoved((current) => ({ ...current, [id]: true }));
    // A removed candidate is not a hidden selection. Its own tick goes with
    // it; every other candidate's is left exactly as it was, and so are the
    // drafts and any AI suggestion -- Remove is not an undo of the curator's
    // other work.
    setSelected((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  // Selecting a folder clears any ancestor or descendant of it, so a file
  // can only ever belong to one proposed record.
  const toggleBoundary = (root, path) =>
    setBoundaries((current) => {
      const chosen = current[root] || [];
      if (chosen.includes(path)) {
        return { ...current, [root]: chosen.filter((p) => p !== path) };
      }
      const kept = chosen.filter(
        (other) => !path.startsWith(`${other}/`) && !other.startsWith(`${path}/`)
      );
      return { ...current, [root]: kept.concat(path) };
    });

  const toggle = (setter, id) =>
    setter((current) => ({ ...current, [id]: !current[id] }));


  // One image, one role. This is the ONLY place a chart image's role is
  // chosen: a candidate card shows the resulting Figure Image and nothing
  // else, so there is never a second controller saying something different.

  // Charts, by the folder the images really sit in.
  //
  // In the Folder Standard one charts/<figure-id>/ folder is one Chart, and a
  // folder written that way needs nothing from here. This is the
  // COMPATIBILITY path for folders that already exist with several images in
  // one figure folder: a Chart stores exactly one imageFile, so rather than
  // silently picking one and dropping the rest, every image is shown and the
  // curator gives it a role.
  const renderChartPlan = () => (
    <Box sx={{ mb: 1.5 }} data-testid="chart-plan">
      <Button
        size="small"
        onClick={() => setChartsOpen((value) => !value)}
        sx={{ textTransform: "none" }}
        aria-expanded={chartsOpen}
      >
        {`Charts — ${chartGroups.reduce(
          (total, group) => total + (group.images || []).length,
          0
        )} image(s) in ${chartGroups.length} folder(s)`}
      </Button>
      <Collapse in={chartsOpen} unmountOnExit>
        {chartGroups.map((group) => (
          <Box
            key={group.folder}
            sx={{ mb: 1.5 }}
            data-testid={`chart-folder-${group.folder}`}
          >
            <Typography
              variant="subtitle2"
              sx={{ overflowWrap: "anywhere" }}
              title={group.folder}
            >
              {group.folder}
            </Typography>
            {(group.images || []).map((image) => {
              const { action, target: attached } = roleOf(
                chartRoles, appliedPlan, image
              );
              return (
                <ChartImageRow
                  key={image.path}
                  group={group}
                  image={image}
                  action={action}
                  attached={attached}
                  groupTargets={chartTargetsByFolder[group.folder]}
                  base={fileServerPath}
                  onRole={setChartRole}
                  onTarget={setChartTarget}
                />
              );
            })}
            {/* Notebooks are attachments, never a Chart of their own: they
                follow the image whose name they share. */}
            {(group.notebooks || []).map((notebook) => (
              <Typography
                key={notebook.path}
                variant="caption"
                color="text.secondary"
                display="block"
                sx={{ overflowWrap: "anywhere" }}
                data-testid={`chart-notebook-${notebook.path}`}
              >
                {`${basename(notebook.path)} — Reproduction Notebook, attached
                  to the Chart whose image has the same name`}
              </Typography>
            ))}
          </Box>
        ))}
      </Collapse>
    </Box>
  );


  const activeGroup = typedGroup || GROUPS[tab];
  const hints = ((analysis || {}).candidates || {}).possible_dependencies || [];
  const candidates = (analysis || {}).candidates || {};
  // Grouped folder ROWS from the backend — never the raw path list, which is
  // what used to render as one unreadable paragraph.
  const groupedUnclassified = candidates.grouped_unclassified || [];
  const unclassifiedTotal = candidates.unclassified_total || 0;
  const structureMode = (analysis || {}).structure_mode || "";
  const invalidStructure = structureMode === "invalid";
  // Only the roots whose name differs from the role they were read as: a
  // folder already called `charts` maps to itself and says nothing.
  const mappedRoles = Object.entries((analysis || {}).normalized_roles || {})
    .filter(([folder, role]) => folder !== role)
    .sort(([a], [b]) => a.localeCompare(b));

  // Two independent halves of the same panel. A legacy tree gets the
  // dataset/script folder picker; ANY tree with chart images gets the Charts
  // section, because a standard layout still has to say which image is the
  // figure.
  const boundaryRoots = Object.keys((analysis || {}).boundary_trees || {})
    .filter((root) => {
      if (!typedGroup) return true;
      const tree = analysis.boundary_trees[root] || {};
      return tree.role === typedGroup.key;
    })
    .sort();
  const folderBoundariesOffered =
    structureMode === "legacy" &&
    boundaryRoots.length > 0;
  const chartRolesOffered =
    chartGroups.length > 0 && (!typedGroup || typedGroup.type === "chart");
  const boundaryPanelOffered = folderBoundariesOffered || chartRolesOffered;

  const chartPlanIssues = chartPlanProblems(
    chartGroups,
    chartRoles,
    appliedPlan
  );
  const boundariesChosen = Object.values(boundaries).some(
    (value) => (value || []).length
  );
  const chartRolesChosen = Object.keys(chartRoles).length > 0;

  const visibleUnclassified = useMemo(() => {
    const needle = unclassifiedFilter.trim().toLowerCase();
    const rows = groupedUnclassified.filter(
      (row) => !needle || (row.path || "").toLowerCase().includes(needle)
    );
    return showAllUnclassified ? rows : rows.slice(0, UNCLASSIFIED_ROWS);
  }, [groupedUnclassified, unclassifiedFilter, showAllUnclassified]);

  return (
    <Fragment>
      {/* Trigger only — the surrounding form owns the explanatory copy so the
          button can sit in a tight action row. */}
      {hideTrigger ? null : (
      <Tooltip
        title={
          ready
            ? typedGroup
              ? `Propose ${typedGroup.label.toLowerCase()} from the saved RCC folder`
              : "Propose charts, datasets, scripts and tools from this folder"
            : typedGroup
            ? "Save a file server folder first"
            : "Pick a file server folder first"
        }
      >
        <Box
          component="span"
          sx={{ display: "inline-flex", width: typedGroup ? "100%" : "auto" }}
        >
          <RegularStyledButton
            type="button"
            fullWidth={Boolean(typedGroup)}
            onClick={() => analyze()}
            disabled={!ready}
          >
            {typedGroup ? IMPORT_LABELS[typedGroup.type] : "Analyze RCC Folder"}
          </RegularStyledButton>
        </Box>
      </Tooltip>
      )}

      <Dialog
        open={open}
        onClose={close}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              // ONE scroll owner. The Paper must not scroll, or the dialog
              // shows two nested vertical scrollbars and the page behind it
              // moves with the wheel.
              overflow: "hidden",
              maxHeight: { xs: "100dvh", sm: "90dvh" },
            },
          },
        }}
      >
        <DialogTitle sx={{ flexShrink: 0 }}>
          {typedGroup
            ? `Import ${typedGroup.label} from RCC`
            : "Folder analysis"}
        </DialogTitle>
        <DialogContent
          dividers
          sx={{ overflowY: "auto", overscrollBehavior: "contain" }}
        >
          {/* Said ONCE, here. Nothing is required to publish, so nothing is
              required to add a proposal either: a field left blank can be
              filled in later, here or in the artifact's own form. */}
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mb: 2 }}
            data-testid="required-note"
          >
            Nothing here is required: add a proposal with any field blank and
            fill it in later, here on the card or in the artifact&rsquo;s own
            form.
          </Typography>
          {loading && (
            <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
              <CircularProgress size={20} />
              <Typography variant="body2">Reading the folder…</Typography>
            </Box>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {analysis && (
            <Fragment>
              {/* ONE line. Everything else about HOW the folder was read is
                  a detail, and lives behind a toggle rather than stacking
                  four alerts above the candidates. */}
              <Typography variant="body2" sx={{ mb: 1.5 }}>
                {typedGroup
                  ? `Proposed ${typedGroup.label.toLowerCase()} from the saved RCC folder. `
                  : "Proposals from this folder's file names and manifests. "}
                Nothing is selected, saved or published until you say so.
              </Typography>
              {/* The two ways to see how the folder was read. The partial-view
                  Alert and the structure chip that used to sit here are now
                  the first two lines of Show scan details: both describe how
                  the SCAN went, which is a question a curator asks when
                  something looks wrong, not something to read past on every
                  open. Neither fact was dropped. */}
              <Box
                sx={{
                  mb: 2,
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 1,
                }}
                data-testid="structure-mode"
              >
                  <Button
                    size="small"
                    sx={{ textTransform: "none", whiteSpace: "nowrap" }}
                    aria-expanded={scanDetailsOpen}
                    onClick={() => setScanDetailsOpen((value) => !value)}
                  >
                    {scanDetailsOpen ? "Hide scan details" : "Show scan details"}
                  </Button>
                  {mappedRoles.length > 0 || (analysis.structure_issues || []).length > 0 ? (
                    <Button
                      size="small"
                      sx={{ textTransform: "none", whiteSpace: "nowrap" }}
                      aria-expanded={mappingOpen}
                      onClick={() => setMappingOpen((value) => !value)}
                    >
                      {mappingOpen
                        ? "Hide folder mapping"
                        : "Show folder mapping"}
                    </Button>
                  ) : null}
              </Box>
              {/* The caps in force and every warning the crawl produced.
                  Nothing is dropped — it is just not in the way. */}
              <Collapse in={scanDetailsOpen} unmountOnExit>
                <Box
                  data-testid="scan-details"
                  sx={{
                    mb: 2,
                    p: 1.5,
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="subtitle2" gutterBottom>
                    Scan details
                  </Typography>
                  {/* The two facts that used to sit above the candidates as a
                      four-line Alert and a status chip. They are diagnostics,
                      not things to act on, so they live here -- but they are
                      still SAID, because "the list you are looking at is not
                      the whole folder" is not a detail a curator can be left
                      to infer. */}
                  {analysis.truncated ? (
                    <Typography
                      variant="caption"
                      display="block"
                      color="warning.main"
                      data-testid="scan-details-truncated"
                      sx={{ mb: 0.5 }}
                    >
                      This is a partial view: the scan stopped at its built-in
                      safety limits, so the candidates do not represent
                      everything in this folder.
                    </Typography>
                  ) : null}
                  {analysis.structure_mode ? (
                    <Typography
                      variant="caption"
                      display="block"
                      data-testid="scan-details-structure-mode"
                      sx={{ mb: 0.5 }}
                    >
                      {`Folder structure read as: ${
                        analysis.structure_mode === "standard"
                          ? "Qresp Standard"
                          : analysis.structure_mode === "legacy"
                          ? "Legacy-compatible"
                          : "Needs reorganization"
                      }.`}
                    </Typography>
                  ) : null}
                  {(analysis.counts || {}).files != null && (
                    <Typography variant="caption" display="block">
                      {`Scanned ${analysis.counts.files} file(s) across ${
                        (analysis.counts || {}).directories || 0
                      } folder(s).`}
                    </Typography>
                  )}
                  {(analysis.limits || {}).max_depth ? (
                    <Typography variant="caption" display="block">
                      {`Limits in force: at most ${analysis.limits.max_depth} folder levels, ${analysis.limits.max_files} files, ${analysis.limits.max_directory_listings} directory listings, and ${analysis.limits.max_evidence_files} manifest/script files read for evidence.`}
                    </Typography>
                  ) : null}
                  {(analysis.warnings || []).map((warning) => (
                    <Typography
                      key={warning}
                      variant="caption"
                      display="block"
                      sx={{ mt: 0.5, overflowWrap: "anywhere" }}
                    >
                      {warning}
                    </Typography>
                  ))}
                  {!(analysis.warnings || []).length && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      sx={{ mt: 0.5 }}
                    >
                      No folder was skipped.
                    </Typography>
                  )}
                </Box>
              </Collapse>
              {/* The legacy names this folder actually uses, and what each one
                  was read as. Never glued onto the status chip. */}
              <Collapse in={mappingOpen} unmountOnExit>
                <Box
                  data-testid="folder-mapping"
                  sx={{
                    mb: 2,
                    p: 1.5,
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                  }}
                >
                  {/* WHICH FOLDER WAS READ AS WHICH ROLE, and nothing to
                      do with the workflow. It used to write `data →
                      datasets` -- the same arrow the workflow uses for a
                      relationship between two artifacts -- so a directory
                      being classified read as a connection being drawn.
                      Said in words, it cannot be mistaken for one. */}
                  <Typography variant="subtitle2" gutterBottom>
                    Folder names read as roles
                  </Typography>
                  {mappedRoles.map(([folder, role]) => (
                    <Typography
                      key={folder}
                      variant="caption"
                      display="block"
                      sx={{ fontFamily: "monospace", overflowWrap: "anywhere" }}
                    >
                      {`${folder} is read as ${role}`}
                    </Typography>
                  ))}
                  {(analysis.structure_issues || []).map((issue) => (
                    <Typography
                      key={`${issue.path}-${issue.reason}`}
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      sx={{ mt: 0.5, overflowWrap: "anywhere" }}
                    >
                      {issue.path ? `${issue.path}: ` : ""}
                      {issue.reason}
                    </Typography>
                  ))}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    sx={{ mt: 0.5 }}
                  >
                    Nothing on the file server is renamed.
                  </Typography>
                </Box>
              </Collapse>
              {/* Record boundaries. Dataset/Script boundaries are FOLDERS
                  and only a legacy tree needs to choose them; Chart roles are
                  IMAGES and every tree that has some needs to choose those,
                  because a Chart holds exactly one image. */}
              {boundaryPanelOffered && (
                <Box sx={{ mb: 2 }} data-testid="boundary-picker">
                  <Button
                    size="small"
                    onClick={() => setPickerOpen((value) => !value)}
                    sx={{ textTransform: "none" }}
                  >
                    {pickerOpen
                      ? "Hide record boundaries"
                      : "Choose record boundaries"}
                  </Button>
                  <Collapse in={pickerOpen} unmountOnExit>
                    {folderBoundariesOffered && (
                    <Box sx={{ mb: 1.5 }} data-testid="folder-boundaries">
                    <Typography variant="subtitle2" sx={{ mt: 1 }}>
                      {typedGroup ? typedGroup.label : "Datasets and Scripts"}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      sx={{ mb: 1 }}
                    >
                      One selected folder becomes one proposed Dataset or
                      Script record. Select a parent to keep everything
                      beneath it together, or select child folders to split
                      it. Nothing on the file server is changed.
                    </Typography>
                    {boundaryRoots.map((root) => {
                        const tree = analysis.boundary_trees[root];
                        const chosen = boundaries[root] || [];
                        return (
                          <Box key={root} sx={{ mb: 1.5 }}>
                            <Typography variant="subtitle2">
                              {`${root} → ${tree.role}`}
                            </Typography>
                            {(tree.nodes || []).length === 0 && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                display="block"
                                data-testid={`no-boundaries-${root}`}
                              >
                                No selectable dataset/script boundaries were
                                found in {root}. Its immediate children are
                                used as records.
                              </Typography>
                            )}
                            {(tree.nodes || []).map((node) => {
                              const isChosen = chosen.includes(node.path);
                              // Mutual exclusion: an ancestor or a descendant
                              // of an already-chosen node cannot also be
                              // chosen, because the same files would land in
                              // two records.
                              const blocked =
                                !isChosen &&
                                chosen.some(
                                  (other) =>
                                    node.path.startsWith(`${other}/`) ||
                                    other.startsWith(`${node.path}/`)
                                );
                              return (
                                <Box
                                  key={node.path}
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    pl: { xs: (node.level - 1) * 1.5, sm: (node.level - 1) * 3 },
                                  }}
                                >
                                  <Checkbox
                                    size="small"
                                    checked={isChosen}
                                    disabled={blocked}
                                    onChange={() => toggleBoundary(root, node.path)}
                                    slotProps={{
                                      input: {
                                        "aria-label": `Use ${node.path} as one record`,
                                      },
                                    }}
                                  />
                                  <Typography
                                    variant="caption"
                                    noWrap
                                    title={node.path}
                                    sx={{ color: blocked ? "text.disabled" : "inherit" }}
                                  >
                                    {`${node.path} (${node.file_count} files)`}
                                  </Typography>
                                </Box>
                              );
                            })}
                          </Box>
                        );
                      })}
                    </Box>
                    )}
                    {chartRolesOffered && renderChartPlan()}
                    {chartPlanIssues.length > 0 && (
                      <Alert severity="warning" sx={{ mb: 1 }}>
                        {`${chartPlanIssues
                          .map(basename)
                          .join(", ")} — a supporting file needs a Chart in
                          the same folder. Set one image there to Create
                          Chart.`}
                      </Alert>
                    )}
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
                      {/* Rebuild changes the PROPOSALS only. Nothing is
                          added, saved or published by it. */}
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={
                          (!boundariesChosen && !chartRolesChosen) ||
                          chartPlanIssues.length > 0
                        }
                        onClick={() =>
                          analyze(
                            boundaries,
                            buildChartPlan(chartGroups, chartRoles, appliedPlan),
                            { force: true }
                          )
                        }
                      >
                        Rebuild proposals
                      </Button>
                      <Button
                        size="small"
                        onClick={() => {
                          setBoundaries({});
                          setChartRoles({});
                          analyze(undefined, undefined, { force: true });
                        }}
                      >
                        Use default boundaries
                      </Button>
                    </Box>
                  </Collapse>
                </Box>
              )}
              {/* No type heading here: the dialog title already says which
                  artifact this is, and "Import Charts from RCC" followed by
                  "Charts (12)" said it twice. The count lives with the
                  candidates it describes. */}
              {typedGroup ? null : (
                <Tabs
                  value={tab}
                  onChange={(event, next) => setTab(next)}
                  variant="scrollable"
                >
                  {GROUPS.map(({ key, label, secondary }) => (
                    <Tab
                      key={key}
                      sx={secondary ? { color: "text.secondary" } : undefined}
                      label={`${label} (${
                        key === "unclassified"
                          ? unclassifiedTotal
                          : candidatesFor(key).length
                      })`}
                    />
                  ))}
                </Tabs>
              )}
              <Divider sx={{ mb: 2 }} />
              {/* The count stays — as a count of what is on screen, not as a
                  second title. */}
              {typedGroup && candidatesFor(typedGroup.key).length > 0 ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{ mb: 1.5 }}
                  data-testid="candidate-count"
                >
                  {`${candidatesFor(typedGroup.key).length} proposed ${countedNoun(
                    candidatesFor(typedGroup.key).length,
                    typedGroup
                  )} · ${selectedCount} selected`}
                </Typography>
              ) : null}
              {activeGroup.type ? (
                <Fragment>
                  {candidatesFor(activeGroup.key).length === 0 && (
                    <Typography variant="body2">
                      No {activeGroup.noun || activeGroup.label.toLowerCase()}{" "}
                      were proposed.
                    </Typography>
                  )}
                  {visibleCandidatesFor(activeGroup.key).map(
                    (candidate) => (
                      <CandidateCard
                        key={candidate.id}
                        candidate={candidate}
                        draft={drafts[candidate.id] || EMPTY_DRAFT}
                        isSelected={Boolean(selected[candidate.id])}
                        detailsOpen={Boolean(detailsOpen[candidate.id])}
                        editOpen={Boolean(editOpen[candidate.id])}
                        problem={isProblem(candidate)}
                        aiLoading={Boolean(aiLoading[candidate.id])}
                        aiNotice={aiNotice[candidate.id]}
                        aiSuggestion={aiSuggestions[candidate.id]}
                        onSelect={selectCandidate}
                        onToggleDetails={toggleDetails}
                        onToggleEdit={toggleEdit}
                        onRemove={removeCandidate}
                        onEnhance={openAiConsent}
                        onField={setField}
                      />
                    )
                  )}
                  {candidatesFor(activeGroup.key).length >
                    visibleCandidatesFor(activeGroup.key).length && (
                    <Box sx={{ mt: 1, mb: 2 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() =>
                          setShowAll((current) => ({
                            ...current,
                            [activeGroup.key]: true,
                          }))
                        }
                      >
                        {`Show all ${
                          candidatesFor(activeGroup.key).length
                        } candidates`}
                      </Button>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                        sx={{ mt: 0.5 }}
                      >
                        {candidatesFor(activeGroup.key).length -
                          visibleCandidatesFor(activeGroup.key).length}{" "}
                        more with weaker evidence are collapsed, not discarded.
                        Anything you have already selected stays visible.
                      </Typography>
                    </Box>
                  )}
                  {activeGroup.key === "tools" && hints.length > 0 && (
                    <Alert severity="info">
                      Possible dependencies seen in script imports (not added
                      as tools — an import name is not a package version):{" "}
                      {hints.join(", ")}
                    </Alert>
                  )}
                </Fragment>
              ) : (
                <Fragment>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {unclassifiedTotal} file(s) were not classified — Qresp
                    would have had to guess. Add them by hand if they belong
                    to the paper.
                  </Typography>
                  {groupedUnclassified.length > 0 && (
                    <Fragment>
                      <TextField
                        size="small"
                        fullWidth
                        placeholder="Filter by folder"
                        value={unclassifiedFilter}
                        onChange={(event) =>
                          setUnclassifiedFilter(event.target.value)
                        }
                        slotProps={{
                          input: { "aria-label": "Filter unclassified folders" },
                        }}
                        sx={{ mb: 1, maxWidth: 360 }}
                      />
                      {/* Grouped folder rows. The backend never sends the raw
                          path list any more, so hundreds of paths cannot be
                          rendered as one paragraph. */}
                      {visibleUnclassified.length === 0 && (
                        <Typography variant="body2">
                          No folder matches that filter.
                        </Typography>
                      )}
                      {visibleUnclassified.map((row) => (
                        <Box
                          key={row.path}
                          sx={{ mb: 1 }}
                          data-testid={`unclassified-group-${row.path || "root"}`}
                        >
                          <Button
                            size="small"
                            onClick={() =>
                              setShowUnclassified((current) => ({
                                ...current,
                                [row.path]: !current[row.path],
                              }))
                            }
                            sx={{ textTransform: "none" }}
                          >
                            {`${row.name} (${row.file_count})`}
                          </Button>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ ml: 1 }}
                          >
                            {(row.extensions || []).join(" ")}
                          </Typography>
                          <Collapse
                            in={Boolean(showUnclassified[row.path])}
                            unmountOnExit
                          >
                            <Box
                              sx={{
                                pl: 2,
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 0.5,
                                maxHeight: 220,
                                overflowY: "auto",
                              }}
                            >
                              {(row.sample_names || []).map((name) => (
                                <Chip
                                  key={name}
                                  size="small"
                                  variant="outlined"
                                  label={name}
                                  title={
                                    row.path ? `${row.path}/${name}` : name
                                  }
                                />
                              ))}
                              {row.file_count >
                                (row.sample_names || []).length && (
                                <Typography variant="caption" sx={{ ml: 1 }}>
                                  …and{" "}
                                  {row.file_count -
                                    (row.sample_names || []).length}{" "}
                                  more in this folder
                                </Typography>
                              )}
                            </Box>
                          </Collapse>
                        </Box>
                      ))}
                      {!showAllUnclassified &&
                        groupedUnclassified.length > UNCLASSIFIED_ROWS && (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => setShowAllUnclassified(true)}
                          >
                            {`Show more (${
                              groupedUnclassified.length - UNCLASSIFIED_ROWS
                            } more folders)`}
                          </Button>
                        )}
                    </Fragment>
                  )}
                </Fragment>
              )}
            </Fragment>
          )}
        </DialogContent>
        <DialogActions
          sx={{
            flexShrink: 0,
            flexWrap: "wrap",
            gap: 1,
            // The reason sits above the row it explains, full width, so a
            // long list of field names wraps instead of squeezing the
            // buttons off a narrow screen.
            justifyContent: "flex-end",
          }}
        >
          {link.rowScoped && typedGroup ? (
            <Box sx={{ width: "100%", minWidth: 0 }}>
              <ConnectionSection
                intent={connection}
                newType={artifactType}
                name={
                  selectedCandidates.length === 1
                    ? labelOf(selectedCandidates[0]).primary
                    : ""
                }
                choice={link.choice}
                onChange={link.setChoice}
                problem={link.problem}
              />
            </Box>
          ) : link.problem ? (
            <Alert
              severity="error"
              variant="outlined"
              data-testid="connection-problem"
              sx={{ width: "100%" }}
            >
              {link.problem}
            </Alert>
          ) : null}
          {/* ONE SENTENCE, and only after an Add was refused. What is
              missing from WHICH item is written on the item, next to the
              inputs that fix it -- repeating all of it down here as well
              would put the answer far from the fields it belongs to and
              make the list of blocked names the longest thing on screen.

              The region is live, so a curator who pressed Add and is not
              looking at the button is told. */}
          <Box
            aria-live="polite"
            sx={{ width: "100%", minWidth: 0 }}
            data-testid="add-status"
          >
            {addAttempted && blockedSelected.length > 0 && (
              <Alert
                severity="warning"
                variant="outlined"
                data-testid="blocked-summary"
                sx={{ minWidth: 0, py: 0.5 }}
              >
                <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                  {`${blockedSelected.length} selected ${
                    blockedSelected.length === 1 ? "item needs" : "items need"
                  } details before ${
                    blockedSelected.length === 1 ? "it" : "they"
                  } can be added. Nothing was added.`}
                </Typography>
              </Alert>
            )}
          </Box>
          <Button onClick={close}>Cancel</Button>
          {/* NOT disabled for a missing field. A button that is dead on
              arrival explains nothing: the curator is left comparing cards
              to work out which one it is waiting for. It is pressable, and
              pressing it says what is missing and where. */}
          <Button
            variant="contained"
            disabled={selectedCount === 0 || invalidStructure}
            onClick={apply}
            data-testid="apply-selected"
          >
            {confirmLabel(
              connection,
              typedGroup
                ? `Add selected ${typedGroup.noun || typedGroup.label}`
                : "Add selected items"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Consent is a deliberate stop, not a checkbox beside a button: it
          states the count and the exact scope BEFORE anything is sent, and
          it is asked again for every request. */}
      {/* transitionDuration 0: this sits on top of the review dialog, and a
          lingering exit transition leaves MUI's aria-hidden on the dialog
          underneath — the suggestions would be invisible to assistive tech
          for as long as it lasts. */}
      <Dialog
        open={Boolean(aiConsentOpen)}
        onClose={closeAiConsent}
        maxWidth="sm"
        fullWidth
        transitionDuration={0}
      >
        <DialogTitle>
          Send “{aiConsentOpen ? labelOf(aiConsentOpen).primary : ""}” to
          Gemini?
        </DialogTitle>
        <DialogContent dividers>
          {/* Short on purpose.

              The scope this dialog describes is enforced by the server, not by
              the reader agreeing to a list: `ai_sources` is the whole bundle,
              and raw dataset values, image bytes, notebook code cells and
              outputs, function bodies and credentials are never in it. That
              boundary is pinned by tests, which is a stronger guarantee than
              a paragraph nobody finishes. Nine lines of bullets restating it
              mostly taught curators to click past the consent step -- which
              is the one thing a consent step must not teach.

              What stays is what the reader cannot get anywhere else: what is
              sent, what comes back, whether there is anything to send, and an
              unchecked box. */}
          {aiConsentOpen ? (
            <Typography variant="body2" gutterBottom data-testid="ai-consent-scope">
              Sends this candidate&rsquo;s readable evidence — file names and
              the short text Qresp has already read from its own folder — plus
              the paper&rsquo;s title and abstract, and asks Gemini for{" "}
              <strong>
                {Object.keys(aiTargets(aiConsentOpen.kind))
                  .map((slot) =>
                    labelFor(
                      aiConsentOpen.kind,
                      aiTargets(aiConsentOpen.kind)[slot]
                    )
                  )
                  .join(" and ")}
              </strong>
              .
            </Typography>
          ) : null}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Suggestions only — nothing is filled in, saved or published for
            you.
          </Typography>
          {/* The one case where the answer is predictable, and worth saying
              before a request rather than after it. */}
          {aiConsentOpen && !(aiConsentOpen.ai_sources || []).length ? (
            <Alert severity="info" sx={{ py: 0.5, mb: 1 }} data-testid="ai-consent-sources">
              Qresp found no readable text in this candidate, so expect “not
              enough evidence”.
            </Alert>
          ) : null}
          <FormControlLabel
            control={
              <Checkbox
                checked={aiConsent}
                onChange={(event) => setAiConsent(event.target.checked)}
                slotProps={{
                  input: {
                    "aria-label":
                      "I agree to send this evidence to Gemini for this request",
                  },
                }}
              />
            }
            label="Send this evidence to Gemini for this request."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeAiConsent}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!aiConsent}
            onClick={() => describeWithAI(aiConsentOpen)}
          >
            Send and get suggestions
          </Button>
        </DialogActions>
      </Dialog>
    </Fragment>
  );
};

FolderAnalysis.propTypes = {
  // Omit to analyze the saved fileServerPath. An explicit path is retained
  // for compatible embedders; production artifact actions omit it.
  path: PropTypes.string,
  artifactType: PropTypes.oneOf(["chart", "dataset", "script", "tool"]),
  // Hide the built-in button and drive the dialog from outside.
  hideTrigger: PropTypes.bool,
  autoOpen: PropTypes.bool,
  connection: PropTypes.object,
};

export default FolderAnalysis;
