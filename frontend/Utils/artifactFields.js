// THE artifact field contract. One definition, used by every surface that
// shows or judges an artifact field.
//
// Folder Analysis used to hardcode its own labels, its own required set and
// its own draft shape, alongside whatever the Add/Edit forms happened to say.
// They drifted, and the drift was visible to curators: the same field was
// "Keywords" in one place and "Properties (comma separated)" in the other,
// an input labelled "Keywords" wrote to `URLs`, and optional fields were
// flagged "Needs input". Anything that renders, marks, validates or converts
// an artifact field reads this file instead.
//
// `key` is the STORAGE key and never changes for compatibility: a chart's
// keywords live in `properties` because every published record already
// stores them there.

// A Chart is a FIGURE: one image, its number in the paper, the paper's own
// caption for it, and the files it was made from. The labels say so. The
// storage keys deliberately do not move -- every published record already
// uses them -- and `caption` is never softened into a generic "Description",
// because a figure caption is a specific thing a paper already has.
const CHART = [
  { key: "imageFile", label: "Figure Image", required: false, recommended: true,
    help: "The image file for this figure. One image per Chart." },
  { key: "number", label: "Figure Number", required: false, recommended: true,
    help: "The figure's number in the paper (e.g. 2, S1). Qresp never " +
      "guesses it." },
  // Optional, but recommended: the guided setup still offers to fill it.
  { key: "caption", label: "Figure Caption", required: false,
    recommended: true, ai: "description",
    help: "Use the paper's caption for this figure. If the figure has no " +
      "published caption, write a concise description of what it shows." },
  { key: "properties", label: "Keywords", required: false, recommended: true, list: true,
    ai: "keywords",
    help: "Keyword(s) for what the figure shows, comma separated." },
  { key: "files", label: "Input / Supporting Files", required: false,
    list: true,
    help: "Data or supporting files this figure was made from, comma " +
      "separated." },
  { key: "notebookFile", label: "Reproduction Notebook", required: false,
    help: "The notebook that reproduces this figure." },
];

// Datasets and scripts are the same shape. `URLs` is deliberately ABSENT: it
// is a legacy field that existing records may carry, and it is preserved
// untouched on save (see carryLegacy below), but it is not offered on any new
// surface and is never confused with keywords again.
const DATA = [
  { key: "files", label: "Files", required: false, recommended: true, list: true },
  // Optional, but recommended: a resource may publish without one.
  { key: "readme", label: "Description", required: false, recommended: true,
    ai: "description" },
  { key: "keywords", label: "Keywords", required: false, list: true,
    ai: "keywords" },
];

// Folder analysis only ever proposes SOFTWARE tools; an experiment is never
// inferred from a folder, so the experiment fields are declared for the
// manual form and parity checks but are not part of the proposal shape.
const TOOL_SOFTWARE = [
  { key: "packageName", label: "Package Name", required: false, recommended: true },
  { key: "version", label: "Version", required: false, recommended: true },
  { key: "executableName", label: "Executable Name", required: false },
  { key: "patches", label: "Patches", required: false, list: true },
  { key: "description", label: "Description", required: false,
    ai: "description" },
  { key: "urls", label: "URLs", required: false },
];

const TOOL_EXPERIMENT = [
  { key: "facilityName", label: "Facility Name", required: false, recommended: true },
  { key: "measurement", label: "Measurement", required: false, recommended: true },
];

export const ARTIFACT_FIELDS = {
  chart: CHART,
  dataset: DATA,
  script: DATA,
  tool: TOOL_SOFTWARE,
};

export const TOOL_EXPERIMENT_FIELDS = TOOL_EXPERIMENT;

const fieldsOf = (kind) => ARTIFACT_FIELDS[kind] || [];

export const fieldsFor = fieldsOf;

export const labelFor = (kind, key) => {
  const field = fieldsOf(kind).find((entry) => entry.key === key);
  return field ? field.label : key;
};

// The one-line explanation a surface shows under the input, when the contract
// has one. Kept here so Folder Analysis and the Add/Edit form cannot explain
// the same field two different ways.
export const helpFor = (kind, key) => {
  const field = fieldsOf(kind).find((entry) => entry.key === key);
  return (field && field.help) || "";
};

export const isRequired = (kind, key) => {
  const field = fieldsOf(kind).find((entry) => entry.key === key);
  return Boolean(field && field.required);
};

export const requiredKeys = (kind) =>
  fieldsOf(kind)
    .filter((field) => field.required)
    .map((field) => field.key);

// Where an accepted AI proposal may land, per kind. A tool has no keyword
// field, so `keywords` is absent for it — the server does not return keywords
// for a tool either, so there is nothing to hide.
export const aiTargets = (kind) => {
  const targets = {};
  fieldsOf(kind).forEach((field) => {
    if (field.ai) targets[field.ai] = field.key;
  });
  return targets;
};

const asText = (value) =>
  Array.isArray(value) ? value.join(", ") : value == null ? "" : String(value);

const asList = (value) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

// A backend proposal -> the editable draft, in contract order.
export const toDraft = (kind, proposal = {}) => {
  const draft = {};
  fieldsOf(kind).forEach((field) => {
    draft[field.key] = asText(proposal[field.key]);
  });
  return draft;
};

// The draft -> the exact shape the manual Add forms store, so an applied
// candidate is indistinguishable from a hand-entered one.
export const toRecord = (kind, draft = {}) => {
  const record = {};
  fieldsOf(kind).forEach((field) => {
    record[field.key] = field.list
      ? asList(draft[field.key])
      : draft[field.key] || "";
  });
  record.extraFields = [];
  if (kind === "tool") record.kind = "software";
  return record;
};

// NOTHING is required to publish: a curator may share a record with any
// field blank (just the data dumped in is better than no record at all), so
// every field's `required` is false and this returns [] for every kind. It
// is kept because callers ask the question. The fields that used to be
// required -- a figure's image, number and keywords, a resource's files, a
// tool's package and version, an experiment's facility and measurement --
// are RECOMMENDED instead, alongside a figure's caption and a resource's
// description: never blocking, but offered by the guided setup. Genuinely
// optional, and never flagged: a chart's Input / Supporting Files and its
// Reproduction Notebook.
export const missingRequired = (kind, draft = {}) =>
  requiredKeys(kind).filter((key) => !String(draft[key] || "").trim());

export const recommendedKeys = (kind) =>
  fieldsOf(kind)
    .filter((field) => field.recommended)
    .map((field) => field.key);

// Required and recommended fields still empty, in contract order.
export const missingRecommended = (kind, draft = {}) =>
  fieldsOf(kind)
    .filter((field) => field.required || field.recommended)
    .map((field) => field.key)
    .filter((key) => !String(draft[key] || "").trim());

// ---------------------------------------------------------------------------
// What a field currently IS.
//
// Three separate facts get asked about the same field, and conflating any two
// of them produces a card that contradicts itself:
//
//   1. what the deterministic analysis PROPOSED   (candidate.proposal)
//   2. what the field CONTAINS right now          (the draft)
//   3. how strong the analysis' evidence WAS      (candidate.field_evidence)
//
// (3) is a statement about (1), frozen at analysis time. It is only ever true
// of the value it described. Rendering it against (2) is what left a "Needs
// input" chip under a caption the AI had just filled -- the analyser marked
// the field `needs_input` because it was EMPTY THEN, and nothing re-read it --
// while the card header, which counts (2), correctly said the field was no
// longer missing. The same staleness would have let a "High" chip, earned by
// a file path the analyser detected, vouch for a path a curator typed over it.
//
// These three helpers are the only place the facts are combined.

export const BLANK = "blank";
export const UNCHANGED = "unchanged";
export const CHANGED = "changed";

const isListField = (kind, key) => {
  const field = fieldsOf(kind).find((entry) => entry.key === key);
  return Boolean(field && field.list);
};

// A list field is edited as comma-separated text, so "a, b" and "a,b" are the
// same value. Comparing the raw strings would call a re-spacing an edit and
// silently drop the field's evidence.
const comparable = (kind, key, value) =>
  isListField(kind, key)
    ? asList(value).join(",")
    : String(value == null ? "" : value).trim();

export const valueState = (kind, key, draft = {}, original = {}) => {
  const current = comparable(kind, key, draft[key]);
  if (!current) return BLANK;
  return current === comparable(kind, key, original[key])
    ? UNCHANGED
    : CHANGED;
};

// The chip to render under one field, or null for none.
//
//   blank      -> nothing   the asterisk, the helper text and the card
//                           header's missing count are the three required
//                           indicators; a chip repeating it is a fourth, and
//                           flagging optional fields this way was a bug once
//                           already (see the header of this file)
//   unchanged  -> the analysis' own high/medium standing
//   changed    -> nothing   nothing verified this value
//
// `needs_input` is therefore unreachable: it can never survive to a filled
// field because a filled field is never BLANK, and it is not rendered on a
// blank one either. That is the fix, expressed as a rule about what the
// standing MEANS rather than as a special case for one field.
export const evidenceChipFor = (kind, key, context = {}) => {
  const { draft = {}, original = {}, fieldEvidence = {} } = context;
  const state = valueState(kind, key, draft, original);
  if (state !== UNCHANGED) return null;
  const standing = fieldEvidence[key];
  return standing === "high" || standing === "medium" ? standing : null;
};

// Whether an AI proposal is the value now in the field. Derived, never
// remembered: a suggestion the curator applied and then edited is no longer
// applied, and a stored "applied" flag would keep insisting that it is.
export const suggestionApplied = (kind, key, draft = {}, suggested) => {
  const proposed = comparable(kind, key, suggested);
  if (!proposed) return false;
  return comparable(kind, key, draft[key]) === proposed;
};

// How much of ONE suggestion is in the fields it belongs in.
//
// A suggestion may offer a description, keywords, or both, and "applied" is a
// claim about all of it. An all-or-nothing flag made the panel contradict its
// own buttons: use the keywords and the button says "Applied to Keywords"
// while the header two lines above still says "not applied".
//
// `offers` is [{key, value}] -- what this suggestion actually proposed, per
// target field. An entry with no key (a Tool has no keyword field) or an empty
// value was never an offer and cannot hold the state back.
export const NOT_APPLIED = "not_applied";
export const PARTIALLY_APPLIED = "partially_applied";
export const APPLIED = "applied";

export const suggestionState = (kind, draft = {}, offers = []) => {
  const offered = (offers || []).filter(
    (offer) => offer && offer.key && comparable(kind, offer.key, offer.value)
  );
  if (!offered.length) return NOT_APPLIED;
  const used = offered.filter((offer) =>
    suggestionApplied(kind, offer.key, draft, offer.value)
  );
  if (!used.length) return NOT_APPLIED;
  return used.length === offered.length ? APPLIED : PARTIALLY_APPLIED;
};

// Fields an existing record may carry that no current surface edits. They are
// copied through on save so nothing a curator stored years ago is dropped —
// and never read as, or converted into, anything else.
export const LEGACY_KEYS = {
  dataset: ["URLs"],
  script: ["URLs"],
};

export const carryLegacy = (kind, previous = {}, next = {}) => {
  const carried = { ...next };
  (LEGACY_KEYS[kind] || []).forEach((key) => {
    if (previous && previous[key] !== undefined) carried[key] = previous[key];
  });
  return carried;
};
