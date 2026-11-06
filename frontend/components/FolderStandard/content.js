// The Qresp Folder Standard v1 — the ONE definition of it in this codebase.
//
// It is rendered in two places that must never disagree: the Curator's "How to
// organize an RCC folder" dialog, and the public
// /documentation/folder-standard page. A researcher who reads the public page,
// lays out a folder accordingly, and then sees the Curator describe a
// different layout has been told two incompatible things by the same project,
// and has no way to know which one the analyzer actually implements.
//
// So the tree, the copyable text, the rules and the legacy notes live here,
// and both surfaces import them. Adding a rule means adding it once.
//
// It is a recommended CONTRACT, not an enforced one: there is no API, no
// persistence, no validation and no score. A folder that ignores every word of
// this is still read, and nothing on the file server is ever renamed. What the
// standard buys is deterministic automatic proposals — an unsupported
// top-level structure is left as "Needs reorganization" or Unclassified rather
// than guessed at.

// A live tree built from the app's own icon set, so it stays readable at any
// width and in any theme. (A rendered image of a folder tree would carry
// unselectable, unscalable text.)
export const TREE = [
  { depth: 0, name: "paper-folder/", kind: "folder" },
  { depth: 1, name: "README.md", kind: "file" },
  { depth: 1, name: "main.ipynb", kind: "file" },
  { depth: 1, name: "datasets/", kind: "folder" },
  { depth: 2, name: "dataset-id/", kind: "folder" },
  { depth: 3, name: "...", kind: "file" },
  { depth: 1, name: "charts/", kind: "folder" },
  { depth: 2, name: "figure-id/", kind: "folder" },
  { depth: 3, name: "preview.png", kind: "image" },
  { depth: 3, name: "notebook.ipynb", kind: "file" },
  { depth: 3, name: "data/", kind: "folder" },
  { depth: 4, name: "...", kind: "file" },
  { depth: 1, name: "scripts/", kind: "folder" },
  { depth: 2, name: "script-id/", kind: "folder" },
  { depth: 3, name: "...", kind: "file" },
  { depth: 1, name: "tools/", kind: "folder" },
  { depth: 2, name: "tool-id/", kind: "folder" },
  { depth: 3, name: "...", kind: "file" },
  { depth: 1, name: "docs/", kind: "folder" },
  { depth: 2, name: "...", kind: "file" },
];

// The same tree as plain text, for the clipboard. Derived from TREE rather
// than written out again, so the copied version cannot drift from the drawn
// one.
export const TREE_TEXT = TREE.map(
  (entry) => `${"  ".repeat(entry.depth)}${entry.name}`
).join("\n");

// The standard itself: what Qresp reads without having to ask you anything.
export const TIPS = [
  "All five role folders are optional — use only the ones your paper needs.",
  "For new Qresp-managed folders use these exact lowercase names: datasets, charts, scripts, tools, docs.",
  "By default each immediate child folder of datasets/, charts/, scripts/ or tools/ is ONE Qresp record, and everything beneath that child belongs to it.",
  "A file placed directly under datasets/ is one dataset on its own.",
  "Dataset and Script records can be split further in Record boundaries, if one folder really holds several records.",
  "One charts/<figure-id>/ folder is one Chart: preview.png is the Figure Image, notebook.ipynb is the Reproduction Notebook, and the chart's data/ holds its Input / Supporting Files.",
  "Give each independent figure its own charts/<figure-id>/ folder — that is the recommended unit, and Qresp proposes it without asking.",
  "docs/ is excluded from the analysis candidates entirely.",
  "No YAML, JSON, metadata manifest or Qresp-specific file is ever required.",
  "Existing folders are never renamed or modified. Recognized legacy names such as data, Figures_Tables, Plot_Scripts and doc keep working.",
  "Figure Number, Figure Caption, scientific descriptions and tool versions are never inferred from filenames — you enter those, or accept an AI suggestion.",
  "Never store secrets, API keys, credentials or private account data in a folder Qresp may inspect.",
];

// Not part of the standard: what to do about folders that were written before
// it. Kept visibly separate so the compatibility path is never read as a
// second, looser way to lay out a new paper.
export const LEGACY_NOTES = [
  "Older folders often keep several images in one figure folder. A Chart stores exactly one Figure Image, so Qresp will not silently pick one and drop the rest.",
  "Record boundaries lists every image it found under the folder it really sits in — none is hidden — and you give each one a role: Create Chart, Supporting File, or Ignore.",
  "Create Chart proposes an independent Chart with that single Figure Image. Supporting File attaches the image to a Chart in the same folder. Ignore proposes nothing.",
  "Rebuilding proposals changes proposals only — nothing is added to the form, saved or published until you say so.",
  "Relationships between separate Charts belong in Workflow, not in a second image on one Chart.",
];

export const STANDARD_NAME = "Qresp Folder Standard v1";

// The two paragraphs that frame the tree. Shared for the same reason the tree
// is: the caveat that the standard is a recommendation, not a requirement, is
// the part most worth stating identically in both places.
export const INTRO =
  "Qresp can inspect any folder inside the file server roots a Qresp server " +
  "is allowed to read. Automatic record proposals are deterministic for the " +
  "Qresp Folder Standard v1 below and for the legacy folder names Qresp " +
  "recognizes; a top-level structure it does not support is left as Needs " +
  "reorganization or Unclassified rather than guessed at.";

export const NOT_A_RULE =
  "The standard is not a rule for storing your files — it is the recommended " +
  "contract for accurate automatic analysis. Existing folders stay exactly " +
  "as they are, are never renamed, and can always be reviewed by hand.";

export const CLOSING_NOTE =
  "Better organization improves matching, but it does not let Qresp infer " +
  "figure numbers, captions, scientific properties or package versions " +
  "without evidence — those stay yours to enter.";

export const LEGACY_HEADING =
  "Existing folders with several images in one figure folder";

export const LEGACY_CAVEAT =
  "Compatibility review — for folders that already exist, not a second way " +
  "to organize a new paper.";
