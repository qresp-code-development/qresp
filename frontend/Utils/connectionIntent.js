// WHAT A CURATOR MEANT WHEN THEY STARTED FROM A ROW.
//
// Opening LINK on a resource row and then creating something -- by hand or
// from an RCC folder -- is ONE intention: "make this, joined to that". It is
// written down here, once, at the moment the row's menu opens, and carried
// unchanged to the moment the record is saved. Nothing downstream infers it
// from what is on screen.
//
// The top-level NEW RESOURCE action carries the other intention, explicitly:
// "make this, joined to nothing". An intent that is neither -- missing, or
// row-scoped without a source that still exists -- is a bug, and the create
// paths refuse it rather than quietly making an unconnected record.
//
// Validation is NOT re-implemented here. Every check goes through
// `edgeProblem`, the same helper Link existing and the workflow editor use.

import {
  CHART,
  SCRIPT,
  DATASET,
  TOOL,
  EXTERNAL,
  CONSUMES,
  USES_TOOL,
  GENERATES,
  LINKS_TO,
  FEEDS_INTO,
  RELATED_TO,
  UNDIRECTED,
  edgeFits,
  edgeProblem,
  prefixOf,
} from "./workflowGraph";

export const ROW_SCOPED = "row-scoped-link";
export const INDEPENDENT = "independent";

export const NEW_TO_SOURCE = "new-to-source";
export const SOURCE_TO_NEW = "source-to-new";

/** The id prefix each creatable kind is stored under. */
export const PREFIX_BY_TYPE = {
  chart: CHART,
  script: SCRIPT,
  dataset: DATASET,
  tool: TOOL,
  head: EXTERNAL,
};

/** The word a curator reads for each kind. */
export const KIND_WORD = {
  [CHART]: "Figure",
  [SCRIPT]: "Script",
  [DATASET]: "Dataset",
  [TOOL]: "Tool",
  [EXTERNAL]: "External data",
};

// The order relationships are offered in: the specific ones first, because
// when one fits it says more than the generic arrow does.
const OFFER_ORDER = [
  CONSUMES,
  USES_TOOL,
  GENERATES,
  LINKS_TO,
  FEEDS_INTO,
  RELATED_TO,
];

export const rowScopedIntent = (sourceArtifactId, sourceLabel) => ({
  mode: ROW_SCOPED,
  sourceArtifactId,
  sourceKind: prefixOf(sourceArtifactId),
  sourceLabel,
});

export const independentIntent = () => ({ mode: INDEPENDENT });

export const isRowScoped = (intent) =>
  Boolean(intent) && intent.mode === ROW_SCOPED;

/**
 * Why this intent cannot be acted on, or "" when it can.
 *
 * A row-scoped intent whose source is gone -- removed while the dialog was
 * open -- is refused rather than degraded into an independent create.
 */
export const intentProblem = (intent, knownIds) => {
  if (!intent || (intent.mode !== ROW_SCOPED && intent.mode !== INDEPENDENT)) {
    return "This resource could not be created: the link it was started " +
      "from was lost. Nothing was added. Close this and try again.";
  }
  if (intent.mode === INDEPENDENT) return "";
  if (!intent.sourceArtifactId ||
      !(knownIds || []).includes(intent.sourceArtifactId)) {
    return "The resource this was being linked to is no longer in this " +
      "paper. Nothing was added.";
  }
  return "";
};

/** Stand-in for the id the reducer has not minted yet. */
const pendingId = (newType) => `${PREFIX_BY_TYPE[newType]}__new`;

/** The two ends of the arrow, in the order it will be stored. */
export const endpointsOf = (intent, newId, direction) =>
  direction === NEW_TO_SOURCE
    ? { from: newId, to: intent.sourceArtifactId }
    : { from: intent.sourceArtifactId, to: newId };

/** Every relationship the canonical rules allow for this pair and direction. */
export const relationshipsFor = (intent, newType, direction) => {
  const { from, to } = endpointsOf(intent, pendingId(newType), direction);
  return OFFER_ORDER.filter((type) =>
    edgeFits(type, prefixOf(from), prefixOf(to))
  );
};

/**
 * The editable starting point.
 *
 *   new Dataset + Script source  ->  Dataset -> Script, consumes
 *   Dataset source + new Script  ->  Dataset -> Script, consumes
 *   new Script + Figure source   ->  Script -> Figure, generates
 *   Script source + new Figure   ->  Script -> Figure, generates
 *   anything else                ->  source -> new, links_to
 *
 * A suggestion only: every valid direction and relationship stays choosable.
 */
export const defaultConnection = (intent, newType) => {
  const mine = PREFIX_BY_TYPE[newType];
  const theirs = intent.sourceKind;
  if (mine === DATASET && theirs === SCRIPT) {
    return { direction: NEW_TO_SOURCE, type: CONSUMES };
  }
  if (mine === SCRIPT && theirs === DATASET) {
    return { direction: SOURCE_TO_NEW, type: CONSUMES };
  }
  if (mine === SCRIPT && theirs === CHART) {
    return { direction: NEW_TO_SOURCE, type: GENERATES };
  }
  if (mine === CHART && theirs === SCRIPT) {
    return { direction: SOURCE_TO_NEW, type: GENERATES };
  }
  return { direction: SOURCE_TO_NEW, type: LINKS_TO };
};

/**
 * The choice after a direction change: keep the relationship if it still
 * fits, otherwise fall back to the generic arrow, which always does.
 */
export const withDirection = (intent, newType, choice, direction) => {
  const valid = relationshipsFor(intent, newType, direction);
  return {
    direction,
    type: valid.includes(choice.type) ? choice.type : LINKS_TO,
  };
};

/** The edge to store once the reducer has minted `newId`. */
export const connectionEdge = (intent, newId, choice) => ({
  ...endpointsOf(intent, newId, choice.direction),
  type: choice.type,
});

/**
 * Why this connection cannot be made, or "" when it can -- decided by the
 * same `edgeProblem` every other link in the Curator goes through.
 */
export const connectionProblem = (intent, newType, choice, knownIds, edges) => {
  const problem = intentProblem(intent, knownIds);
  if (problem) return problem;
  if (!isRowScoped(intent)) return "";
  if (!choice || !choice.type || !choice.direction) {
    return "Choose how the new resource is connected.";
  }
  const newId = pendingId(newType);
  return edgeProblem(
    connectionEdge(intent, newId, choice),
    [...(knownIds || []), newId],
    edges || []
  );
};

/** "Dataset: short_traj", or "New Dataset" before there is a name. */
export const newEndpointLabel = (newType, name) => {
  const word = KIND_WORD[PREFIX_BY_TYPE[newType]] || "resource";
  const clean = String(name || "").trim();
  return clean ? `${word}: ${clean}` : `New ${word}`;
};

/** "Script: analysis.py" */
export const sourceEndpointLabel = (intent) =>
  `${KIND_WORD[intent.sourceKind] || "Resource"}: ${intent.sourceLabel}`;

/** The arrow, written with concrete ends, for a direction button. */
export const directionText = (intent, newType, name, direction, type) => {
  const mine = newEndpointLabel(newType, name);
  const theirs = sourceEndpointLabel(intent);
  const arrow = UNDIRECTED.includes(type) ? "↔" : "→";
  return direction === NEW_TO_SOURCE
    ? `${mine} ${arrow} ${theirs}`
    : `${theirs} ${arrow} ${mine}`;
};

/**
 * The name a half-filled form would give its record, for the endpoint text.
 * The same fields `artifactLabel` reads, plus External data's `label`.
 */
export const draftName = (values) => {
  const v = values || {};
  const named =
    v.caption || v.packageName || v.programName || v.facilityName ||
    v.label || v.readme || "";
  const text = String(named).replace(/\s+/g, " ").trim();
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
};
