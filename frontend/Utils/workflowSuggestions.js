// Evidence-based connection suggestions.
//
// A curator who has entered a figure, the script that made it and the data it
// used still has to connect those three by hand, even though they already
// typed the proof: the figure's Reproduction Notebook IS the script's file.
// This module finds those cases and offers them. It never applies one.
//
// WHAT COUNTS AS EVIDENCE
// =======================
// One thing only: two artifacts of this paper carrying the SAME normalized
// reference in fields whose saved meaning already states the relationship.
// Not similarity, not a shared basename, not a shared word -- equality of a
// path the curator themselves recorded.
//
// WHAT THE CONTRACTS ACTUALLY SUPPORT
// ===================================
// The persisted forms hold:
//
//   Chart    caption, number, files ("Input / Supporting Files"),
//            imageFile, notebookFile ("Reproduction Notebook"), properties
//   Script   files, readme, keywords, URLs
//   Dataset  files, readme, keywords, URLs
//   Tool     packageName, version, executableName, patches, description,
//            facilityName, measurement, kind, URLs
//   External URLs
//
// Two relationships can be PROVEN from those fields:
//
//   GENERATES  chart.notebookFile === one of script.files
//              The chart names the notebook that reproduces it; a script is
//              saved at exactly that path. The chart's own field says what
//              the relationship is.
//
//   CONSUMES   one of chart.files === one of dataset.files
//              The chart's `files` is labelled "Input / Supporting Files" in
//              the form. A dataset saved at exactly one of those paths is
//              that input.
//
// Two are NOT supported, and are deliberately absent:
//
//   Dataset -> Script  A Script has no input-file field. Its `files` is the
//                      script's OWN source. Equal paths would mean one file
//                      was registered as both a script and a dataset -- a
//                      duplicate, not a consumption.
//
//   Tool -> Script     A Script has no declared tool or dependency field at
//                      all. The only text that could be matched against a
//                      Tool's packageName is `keywords`, and matching on
//                      keywords is matching on generic terms.
//
// Adding a weaker rule to cover those would produce suggestions that are not
// evidence. Zero suggestions is the correct output for a paper whose data
// does not prove anything.

import {
  CHART,
  CONSUMES,
  DATASET,
  GENERATES,
  SCRIPT,
  edgeProblem,
  hasEdge,
  prefixOf,
} from "./workflowGraph";

/**
 * A saved reference reduced to a comparable form, or "" when it must not be
 * compared at all.
 *
 * REFUSED OUTRIGHT, because a suggestion built on one could not be shown
 * without printing it, and none of them belong in a published record:
 *
 *   /home/ada/run/dos.ipynb     absolute POSIX path
 *   C:\work\dos.ipynb           Windows drive path
 *   \\share\work\dos.ipynb      UNC path
 *   https://host/dos.ipynb      a URL, which is not a path in this paper
 *   ../../outside/dos.ipynb     climbs above the paper root
 *
 * What survives is a relative path inside the paper, with separators and
 * redundant segments regularised so `./figures/dos.ipynb` and
 * `figures//dos.ipynb` are recognised as the one file they are.
 *
 * Comparison stays CASE-SENSITIVE. `DOS.ipynb` and `dos.ipynb` are two files
 * on the systems these papers are computed on, and treating them as one would
 * be inventing a match.
 */
export const normalizeRef = (raw) => {
  const text = String(raw == null ? "" : raw).trim();
  if (!text) return "";

  const slashed = text.replace(/\\/g, "/");
  if (/^[a-z][a-z0-9+.-]*:/i.test(slashed)) return ""; // scheme: url, mailto, C:
  if (slashed.startsWith("/")) return ""; // absolute, and UNC after slashing

  const parts = [];
  for (const segment of slashed.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      // Nothing left to climb into means the reference points outside the
      // paper, so this code has no idea what it names.
      if (!parts.length) return "";
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join("/");
};

/** Every usable reference in a saved `files` list. */
const refsOf = (artifact) => {
  const files = (artifact && artifact.files) || [];
  const list = Array.isArray(files) ? files : [files];
  return list.map(normalizeRef).filter(Boolean);
};

/**
 * What an artifact IS, independent of its id.
 *
 * Artifact ids are positional (`c0`, `s1`), so deleting one renumbers the
 * rest. Anything remembered about a suggestion between renders therefore has
 * to be remembered by content -- keyed by id, a dismissal would silently
 * transfer to whichever artifact inherited the number.
 *
 * This is a local key only. It is never rendered and never saved.
 */
export const fingerprint = (artifact) => {
  if (!artifact) return "";
  return [
    artifact.imageFile,
    artifact.notebookFile,
    artifact.caption,
    artifact.packageName,
    artifact.readme,
    ...refsOf(artifact),
  ]
    .map((value) => String(value == null ? "" : value).trim())
    .filter(Boolean)
    .join("\u0000");
};

/** The stable identity of one suggestion, for dismissing it. */
export const suggestionKey = (suggestion) =>
  [
    suggestion.type,
    suggestion.reference,
    suggestion.fromPrint,
    suggestion.toPrint,
  ].join("|");

const RELATION_TEXT = {
  [GENERATES]: "as generating this figure",
  [CONSUMES]: "as an input to this figure",
};

/**
 * The one sentence a curator reads before accepting.
 *
 * It says what would be connected, how, and the single fact that justifies
 * it. `labelOf` is supplied by the caller so a suggestion is named exactly
 * the way the same artifact is named everywhere else in the workspace.
 */
export const describeSuggestion = (suggestion, labelOf) =>
  `Connect ${labelOf(suggestion.from)} ` +
  `${RELATION_TEXT[suggestion.type] || "to this figure"} — ` +
  `both reference ${suggestion.reference}.`;

/**
 * Every connection this paper's own saved fields prove, minus the ones it
 * already has.
 *
 * `lists` is the Curator's artifact state. Only artifacts in it are ever
 * considered, which is also why a suggestion cannot cross a paper boundary:
 * another paper's artifacts are not in this paper's lists, and an id from one
 * is not in `knownIds`, so `edgeProblem` refuses it.
 *
 * Every candidate is put through the SAME validator the manual paths use, so
 * a suggestion can never propose an edge a curator would be forbidden to draw
 * -- wrong endpoint types, a duplicate, or a cycle.
 */
export const suggestConnections = (lists, edges = []) => {
  const charts = (lists && lists.charts) || [];
  const scripts = (lists && lists.scripts) || [];
  const datasets = (lists && lists.datasets) || [];

  const byId = {};
  [charts, scripts, datasets, (lists && lists.tools) || [],
   (lists && lists.heads) || []].forEach((list) =>
    (list || []).forEach((item) => {
      if (item && item.id) byId[item.id] = item;
    })
  );
  const knownIds = Object.keys(byId);

  const found = [];
  const seen = new Set();

  const offer = (from, to, type, reference) => {
    // Endpoints must be the kinds this rule is about. A list handed the wrong
    // artifact type cannot smuggle an edge through.
    if (prefixOf(to) !== CHART) return;
    const edge = { from, to, type };
    // Already connected, in either direction? Then there is nothing to
    // suggest, and re-suggesting it is how a duplicate gets made.
    if (hasEdge(edges, from, to) || hasEdge(edges, to, from)) return;
    if (edgeProblem(edge, knownIds, edges)) return;

    const key = `${type}|${from}|${to}`;
    if (seen.has(key)) return; // two shared files prove the same one edge
    seen.add(key);

    found.push({
      type,
      from,
      to,
      reference,
      fromPrint: fingerprint(byId[from]),
      toPrint: fingerprint(byId[to]),
    });
  };

  charts.forEach((chart) => {
    if (!chart || !chart.id) return;

    // GENERATES -- the figure names the notebook that reproduces it.
    const notebook = normalizeRef(chart.notebookFile);
    if (notebook) {
      scripts.forEach((script) => {
        if (!script || !script.id || prefixOf(script.id) !== SCRIPT) return;
        if (refsOf(script).includes(notebook)) {
          offer(script.id, chart.id, GENERATES, notebook);
        }
      });
    }

    // CONSUMES -- the figure's own inputs, matched to a saved dataset.
    const inputs = refsOf(chart);
    if (inputs.length) {
      datasets.forEach((dataset) => {
        if (!dataset || !dataset.id || prefixOf(dataset.id) !== DATASET) return;
        const shared = refsOf(dataset).find((ref) => inputs.includes(ref));
        if (shared) offer(dataset.id, chart.id, CONSUMES, shared);
      });
    }
  });

  return found;
};
