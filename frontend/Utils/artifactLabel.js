import { EXTERNAL, prefixOf } from "./workflowGraph";
import { externalLabel } from "./externalData";

// WHAT AN ARTIFACT IS CALLED, in one place.
//
// The resource list and the workflow drawing must agree about this, because
// matching a row to a node is done by reading the name. They used to
// disagree: the drawing labelled its boxes with the raw id (`c0`, `s1`) and
// the list used the curator's own words, so nothing on screen connected the
// two and the id had to be printed on the list as well.
//
// An id is an INTERNAL REFERENCE. It is positional -- deleting one artifact
// renumbers the rest -- so showing it invites a curator to treat it as a
// permanent name for their own work, which it is not. It stays in state, in
// storage, in test ids and in data attributes, where it belongs.

const KIND_LABEL = {
  c: "Figure",
  s: "Script",
  d: "Dataset",
  t: "Tool",
  h: "External data",
};

/** "2" -> "Figure 2"; a number that already names itself ("Table S1") stays. */
export const figureLabel = (number) => {
  const n = String(number === undefined || number === null ? "" : number).trim();
  if (!n) return "";
  return /^[a-z]{2,}/i.test(n) ? n : `Figure ${n}`;
};

/** Never a bare id, never an empty label. */
export const artifactLabel = (artifact, id) => {
  if (prefixOf(id) === EXTERNAL) return externalLabel(artifact, id);
  // A figure is called by its number in the paper; the caption is too long
  // to be a name. Captions only stand in when there is no number yet.
  if (prefixOf(id) === "c" && artifact && figureLabel(artifact.number)) {
    return figureLabel(artifact.number);
  }
  const named =
    (artifact &&
      (artifact.caption ||
        artifact.packageName ||
        artifact.programName ||
        artifact.facilityName ||
        artifact.readme)) ||
    "";
  const text = String(named).replace(/\s+/g, " ").trim();
  if (text) return text.length > 60 ? `${text.slice(0, 59)}…` : text;
  // The one place an id is shown: an artifact with nothing else to call it.
  // Even here it reads as a fallback rather than as its name.
  return `Untitled ${KIND_LABEL[prefixOf(id)] || "item"} (${id})`;
};

export default artifactLabel;
