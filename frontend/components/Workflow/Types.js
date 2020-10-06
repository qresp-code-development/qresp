const IdTypeMap = {
  c: "CHART",
  s: "SCRIPT",
  d: "DATASET",
  t: "TOOL",
  h: "EXTERNAL",
};

const NodeType = {
  CHART: {
    shape: "square",
    size: 20,
    color: "orange",
  },
  SCRIPT: {
    shape: "triangle",
    size: 20,
    color: "green",
  },
  DATASET: {
    shape: "dot",
    size: 20,
    color: "gray",
  },
  TOOL: {
    shape: "diamond",
    size: 20,
    color: "blue",
  },
  EXTERNAL: {
    shape: "dot",
    size: 10,
    color: "red",
  },
};

export { IdTypeMap, NodeType };
