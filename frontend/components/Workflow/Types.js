const IdTypeMap = {
  c: "CHART",
  s: "SCRIPT",
  d: "DATASET",
  t: "TOOL",
  h: "EXTERNAL",
};

// One palette for the drawing and the legend: a soft fill to read the label
// on, and a strong border/accent that says what kind of thing it is.
const KIND_STYLE = {
  CHART: { name: "Figure", fill: "#FFF4E5", accent: "#E65100" },
  SCRIPT: { name: "Script", fill: "#EAF6EC", accent: "#2E7D32" },
  DATASET: { name: "Dataset", fill: "#EEF1F4", accent: "#455A64" },
  TOOL: { name: "Tool", fill: "#E8F1FD", accent: "#1565C0" },
  EXTERNAL: { name: "External data", fill: "#FDECEE", accent: "#B71C1C" },
};

const colorFor = ({ fill, accent }) => ({
  background: fill,
  border: accent,
  highlight: { background: "#FFFFFF", border: accent },
  hover: { background: "#FFFFFF", border: accent },
});

const NodeType = Object.fromEntries(
  Object.entries(KIND_STYLE).map(([kind, style]) => [
    kind,
    { shape: "box", color: colorFor(style) },
  ])
);

export { IdTypeMap, NodeType, KIND_STYLE };
