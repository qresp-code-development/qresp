import { RELATED_TO, fromStoredEdge, prefixOf } from "./workflowGraph";

// A WORKFLOW READS LEFT TO RIGHT: what went in, what was run, what came out.
//
// A force simulation scatters the same graph differently every time and
// leaves arrows crossing at random. This places every node in a column by
// how far down the flow it sits (its longest path from a starting point),
// puts every figure in the last column, and orders each column to follow its
// neighbours so arrows cross as little as possible. Deterministic, instant,
// and the same picture for every reader.

export const X_GAP = 250;
export const Y_GAP = 92;

// Where a node with no connections sits, by kind.
const KIND_COLUMN = { h: 0, d: 0, t: 1, s: 1, c: 2 };
// Order inside a column before neighbours are considered.
const KIND_ORDER = { h: 0, d: 1, t: 2, s: 3, c: 4 };

const byKindThenId = (a, b) =>
  (KIND_ORDER[prefixOf(a)] ?? 9) - (KIND_ORDER[prefixOf(b)] ?? 9) ||
  String(a).localeCompare(String(b), undefined, { numeric: true });

const average = (values) =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

/**
 * {id: {x, y}} for every node, plus the column count and tallest column.
 * Feedback loops and undirected `related_to` edges do not pull a node right.
 */
export const layoutWorkflow = (nodeIds, edges) => {
  const ids = Array.from(new Set(nodeIds || []));
  const known = new Set(ids);
  const preds = {};
  const succs = {};
  ids.forEach((id) => {
    preds[id] = [];
    succs[id] = [];
  });
  (edges || []).map(fromStoredEdge).forEach((edge) => {
    if (!known.has(edge.from) || !known.has(edge.to) || edge.from === edge.to) return;
    if (edge.type === RELATED_TO || edge.feedback) return;
    preds[edge.to].push(edge.from);
    succs[edge.from].push(edge.to);
  });

  // Longest path from any source; a cycle the curator did not mark as
  // feedback is cut where it is found rather than looping forever.
  const layer = {};
  const visiting = new Set();
  const depth = (id) => {
    if (id in layer) return layer[id];
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const fromPreds = preds[id].map((p) => depth(p) + 1);
    visiting.delete(id);
    layer[id] = fromPreds.length ? Math.max(...fromPreds) : 0;
    return layer[id];
  };
  const connected = (id) => preds[id].length > 0 || succs[id].length > 0;
  ids.forEach((id) => {
    if (connected(id)) depth(id);
    else layer[id] = KIND_COLUMN[prefixOf(id)] ?? 0;
  });

  // Figures are where a workflow ends: all of them share the last column.
  const nonCharts = ids.filter((id) => prefixOf(id) !== "c");
  const lastBeforeCharts = nonCharts.length
    ? Math.max(...nonCharts.map((id) => layer[id]))
    : -1;
  const charts = ids.filter((id) => prefixOf(id) === "c");
  if (charts.length) {
    const last = Math.max(lastBeforeCharts + 1, ...charts.map((id) => layer[id]));
    charts.forEach((id) => {
      layer[id] = last;
    });
  }

  // Close any empty columns so the picture has no holes.
  const used = Array.from(new Set(ids.map((id) => layer[id]))).sort((a, b) => a - b);
  const squash = {};
  used.forEach((value, index) => {
    squash[value] = index;
  });
  const columns = used.map(() => []);
  ids.forEach((id) => {
    layer[id] = squash[layer[id]];
    columns[layer[id]].push(id);
  });
  columns.forEach((column) => column.sort(byKindThenId));

  // Two barycenter sweeps: order each column by where its neighbours sit.
  const index = {};
  const reindex = () =>
    columns.forEach((column) =>
      column.forEach((id, i) => {
        index[id] = i - (column.length - 1) / 2;
      })
    );
  reindex();
  const sweep = (order, neighbours) => {
    order.forEach((c) => {
      const column = columns[c];
      const keyed = column.map((id, i) => ({
        id,
        key: average(neighbours[id].filter((n) => n in index).map((n) => index[n])),
        i,
      }));
      keyed.sort((a, b) => {
        const ka = a.key === null ? index[a.id] : a.key;
        const kb = b.key === null ? index[b.id] : b.key;
        return ka - kb || a.i - b.i;
      });
      columns[c] = keyed.map((k) => k.id);
      columns[c].forEach((id, i) => {
        index[id] = i - (columns[c].length - 1) / 2;
      });
    });
  };
  const forward = columns.map((_, c) => c).slice(1);
  const backward = columns.map((_, c) => c).reverse().slice(1);
  for (let pass = 0; pass < 2; pass += 1) {
    sweep(forward, preds);
    sweep(backward, succs);
  }

  const positions = {};
  columns.forEach((column, c) =>
    column.forEach((id, i) => {
      positions[id] = {
        x: c * X_GAP,
        y: (i - (column.length - 1) / 2) * Y_GAP,
      };
    })
  );
  return {
    positions,
    columns: columns.length,
    rows: Math.max(0, ...columns.map((column) => column.length)),
  };
};

export default layoutWorkflow;
