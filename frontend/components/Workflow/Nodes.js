import { IdTypeMap, NodeType, KIND_STYLE } from "./Types";
import { artifactLabel, figureLabel } from "../../Utils/artifactLabel";
import { buildFileUrl, isPdfFile } from "../../Utils/fileServerUrl";

const MAX_TIP = 220;
const clip = (text, n) => {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

// The label is drawn by vis in "html" mode, which only understands <b>, <i>
// and <code>. Angle brackets in a curator's text are swapped for look-alikes
// so a caption can never be read as markup.
const safe = (text) => String(text || "").replace(/</g, "‹").replace(/>/g, "›");

/** What the box says: the kind in small capitals, then the name. */
export const nodeLabel = (type, id, nodeData) => {
  const kind = KIND_STYLE[type] ? KIND_STYLE[type].name : "Item";
  if (type === "CHART") {
    const label = figureLabel(nodeData && nodeData.number);
    if (label) {
      const [word, ...rest] = label.split(" ");
      return `<b>${safe(word.toUpperCase())}</b>\n${safe(rest.join(" ") || word)}`;
    }
  }
  return `<b>${safe(kind.toUpperCase())}</b>\n${safe(clip(artifactLabel(nodeData, id), 44))}`;
};

/**
 * The hover card. vis-network shows a STRING title as plain text, so this
 * builds an element -- with textContent only, never innerHTML, because every
 * word in it is the curator's.
 */
const hoverTooltip = (type, id, nodeData) => {
  const kind = KIND_STYLE[type] ? KIND_STYLE[type].name : "Item";
  const heading =
    (type === "CHART" && figureLabel(nodeData && nodeData.number)) ||
    `${kind} ${id.charAt(0).toUpperCase() + id.slice(1)}`;
  let body = "";
  if (nodeData) {
    if (type === "CHART") body = nodeData.caption;
    else if (type === "TOOL") {
      body =
        nodeData.kind === "software"
          ? [nodeData.packageName, nodeData.version && `v${nodeData.version}`]
              .filter(Boolean)
              .join(" ")
          : [nodeData.facilityName, nodeData.measurement].filter(Boolean).join(" — ");
    } else body = nodeData.readme || nodeData.label || "";
  }
  body = clip(body, MAX_TIP);

  if (typeof document === "undefined") return body ? `${heading}: ${body}` : heading;

  const card = document.createElement("div");
  card.style.cssText = "max-width:320px;white-space:normal;line-height:1.45;";
  if (type === "CHART" && nodeData && nodeData.imageFile && !isPdfFile(nodeData.imageFile)) {
    const url = buildFileUrl(nodeData.server, nodeData.imageFile);
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      img.style.cssText =
        "display:block;max-width:300px;max-height:200px;margin-bottom:8px;border-radius:4px;";
      img.onerror = () => img.remove();
      card.appendChild(img);
    }
  }
  const title = document.createElement("div");
  title.textContent = heading;
  title.style.cssText = `font-weight:700;color:${(KIND_STYLE[type] || {}).accent || "#333"};margin-bottom:2px;`;
  card.appendChild(title);
  if (body) {
    const text = document.createElement("div");
    text.textContent = body;
    text.style.cssText = "color:#37474F;font-size:13px;";
    card.appendChild(text);
  }
  return card;
};

const createNode = (id, data, showLabels = false, position = {}) => {
  const type = IdTypeMap[id.charAt(0)];
  const nodeData = (data[id.charAt(0)] || {})[id];
  return {
    id,
    ...NodeType[type],
    title: hoverTooltip(type, id, nodeData),
    // THE CURATOR'S OWN WORD FOR IT, not `c0`: the id is an internal,
    // positional reference and stays in `node.id`, which is what every edge
    // and lookup addresses.
    label: showLabels ? nodeLabel(type, id, nodeData) : "",
    ...position,
  };
};

export default createNode;
