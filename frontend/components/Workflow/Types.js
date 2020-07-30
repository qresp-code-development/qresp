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
    size: 23,
    color: "orange",
  },
  SCRIPT: {
    shape: "triangle",
    size: 23,
    color: "green",
  },
  DATASET: {
    shape: "dot",
    size: 23,
    color: "gray",
  },
  TOOL: {
    shape: "diamond",
    size: 23,
    color: "blue",
  },
  EXTERNAL: {
    shape: "dot",
    size: 10,
    color: "red",
  },
};

export { IdTypeMap, NodeType };
