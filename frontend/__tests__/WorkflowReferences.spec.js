/**
 * Artifact references have to survive editing.
 *
 * A workflow edge names an artifact by id -- `c0`, `s1`, `d2` -- and those ids
 * are positional: the Curator mints them from a list index. So the question
 * this file exists to answer is the one that decides whether the whole graph
 * can be trusted:
 *
 *     after adding, deleting and reordering artifacts, does every edge still
 *     point at the artifact the curator meant?
 *
 * Every assertion here therefore checks the edge's target BY CONTENT -- the
 * chart's caption, the script's readme -- never by id. Checking `s0 -> c1`
 * still says `s0 -> c1` would pass even if both ids had quietly slid onto
 * different artifacts, which is the exact failure being guarded against.
 */
import reducer from "../Context/Curator/curatorReducer";
import { ADD_MANY, DELETE, ADD_EDGE, UNLINK } from "../Context/types";
import {
  convertReqSchematoState,
  convertStatetoReqSchema,
} from "../Utils/model";

const GENERATES = "generates";

const baseState = () => ({
  charts: [],
  scripts: [],
  datasets: [],
  tools: [],
  heads: [],
  workflow: { nodes: [], edges: [] },
});

const addMany = (state, type, values) =>
  reducer(state, { type: ADD_MANY, payload: { type, values } });

const addEdge = (state, edge) =>
  reducer(state, { type: ADD_EDGE, payload: edge });

const del = (state, type, id) =>
  reducer(state, { type: DELETE, payload: { type, id } });

/** What an edge actually joins, named by the artifacts' own content. */
const resolve = (state, edge) => {
  const find = (id) => {
    const list = { c: "charts", s: "scripts", d: "datasets",
                   t: "tools", h: "heads" }[id.charAt(0)];
    const item = (state[list] || []).find((el) => el.id === id);
    if (!item) return `MISSING(${id})`;
    return item.caption || item.readme || item.packageName || item.label;
  };
  return `${find(edge.from)} -> ${find(edge.to)}`;
};

const edgesOf = (state) =>
  state.workflow.edges.map((edge) => resolve(state, edge));

describe("an edge keeps pointing at the artifact it was drawn to", () => {
  const threeCharts = () => {
    let state = baseState();
    state = addMany(state, "charts", [
      { caption: "First figure" },
      { caption: "Second figure" },
      { caption: "Third figure" },
    ]);
    state = addMany(state, "scripts", [{ readme: "plot.py" }]);
    return state;
  };

  it("after a chart BEFORE it is deleted", () => {
    let state = threeCharts();
    state = addEdge(state, { from: "s0", to: "c2", type: GENERATES });
    expect(edgesOf(state)).toEqual(["plot.py -> Third figure"]);

    state = del(state, "charts", "c0"); // removes "First figure"

    // The id necessarily changed -- ids are positional -- but the TARGET
    // must not have.
    expect(edgesOf(state)).toEqual(["plot.py -> Third figure"]);
  });

  it("after a chart AFTER it is deleted", () => {
    let state = threeCharts();
    state = addEdge(state, { from: "s0", to: "c0", type: GENERATES });
    state = del(state, "charts", "c2"); // removes "Third figure"
    expect(edgesOf(state)).toEqual(["plot.py -> First figure"]);
  });

  it("after the chart in the middle is deleted", () => {
    let state = threeCharts();
    state = addEdge(state, { from: "s0", to: "c0", type: GENERATES });
    state = addEdge(state, { from: "s0", to: "c2", type: GENERATES });
    expect(edgesOf(state).sort()).toEqual([
      "plot.py -> First figure",
      "plot.py -> Third figure",
    ]);

    state = del(state, "charts", "c1"); // removes "Second figure"

    expect(edgesOf(state).sort()).toEqual([
      "plot.py -> First figure",
      "plot.py -> Third figure",
    ]);
  });

  it("drops the deleted artifact's own edges and no others", () => {
    let state = threeCharts();
    state = addEdge(state, { from: "s0", to: "c0", type: GENERATES });
    state = addEdge(state, { from: "s0", to: "c1", type: GENERATES });
    state = addEdge(state, { from: "s0", to: "c2", type: GENERATES });

    state = del(state, "charts", "c1");

    expect(state.workflow.edges).toHaveLength(2);
    expect(edgesOf(state).sort()).toEqual([
      "plot.py -> First figure",
      "plot.py -> Third figure",
    ]);
  });

  it("keeps the relationship type through a delete", () => {
    // The renumbering rewrites endpoints; it must not drop what the edge
    // MEANS while doing so.
    let state = threeCharts();
    state = addEdge(state, { from: "s0", to: "c2", type: GENERATES });
    state = del(state, "charts", "c0");
    expect(state.workflow.edges[0].type).toBe(GENERATES);
  });

  it("across several deletes in a row", () => {
    let state = threeCharts();
    state = addMany(state, "charts", [{ caption: "Fourth figure" }]);
    state = addEdge(state, { from: "s0", to: "c3", type: GENERATES });

    state = del(state, "charts", "c0");
    state = del(state, "charts", "c0");

    expect(edgesOf(state)).toEqual(["plot.py -> Fourth figure"]);
  });

  it("when a different artifact TYPE is deleted", () => {
    // Deleting a dataset renumbers datasets. It must not disturb the chart
    // an unrelated edge points at.
    let state = threeCharts();
    state = addMany(state, "datasets", [
      { readme: "raw" },
      { readme: "processed" },
    ]);
    state = addEdge(state, { from: "s0", to: "c1", type: GENERATES });
    state = addEdge(state, { from: "d1", to: "s0", type: "consumes" });

    state = del(state, "datasets", "d0");

    expect(edgesOf(state).sort()).toEqual([
      "plot.py -> Second figure",
      "processed -> plot.py",
    ]);
  });
});

describe("references survive a save and reopen", () => {
  it("a typed graph comes back joining the same artifacts", () => {
    let state = baseState();
    state = addMany(state, "charts", [
      { caption: "First figure", number: "" },
      { caption: "Second figure", number: "" },
    ]);
    state = addMany(state, "scripts", [{ readme: "plot.py" }]);
    state = addEdge(state, { from: "s0", to: "c1", type: GENERATES });

    // Out to the stored shape and back, the way saving and reopening does.
    const stored = convertStatetoReqSchema({
      ...state,
      curatorInfo: {}, paperInfo: { PIs: "", collections: [], tags: [] },
      referenceInfo: {}, documentation: "", license: "",
    });
    const reopened = convertReqSchematoState(stored);

    expect(reopened.workflow.edges).toEqual([
      { from: "s0", to: "c1", type: GENERATES },
    ]);
    expect(resolve(reopened, reopened.workflow.edges[0])).toBe(
      "plot.py -> Second figure"
    );
  });

  it("a legacy untyped graph comes back joining the same artifacts", () => {
    const reopened = convertReqSchematoState({
      reference: { title: "t" },
      charts: [{ id: "c0", caption: "First figure" }],
      scripts: [{ id: "s0", readme: "plot.py" }],
      workflow: { nodes: [], edges: [["s0", "c0"]] },
    });
    expect(resolve(reopened, reopened.workflow.edges[0])).toBe(
      "plot.py -> First figure"
    );
    expect(reopened.workflow.edges[0].type).toBe("");
  });
});

describe("unlink removes one edge and nothing else", () => {
  it("leaves both artifacts and their other edges alone", () => {
    let state = baseState();
    state = addMany(state, "charts", [
      { caption: "First figure" },
      { caption: "Second figure" },
    ]);
    state = addMany(state, "scripts", [{ readme: "plot.py" }]);
    state = addEdge(state, { from: "s0", to: "c0", type: GENERATES });
    state = addEdge(state, { from: "s0", to: "c1", type: GENERATES });

    state = reducer(state, {
      type: UNLINK,
      payload: { from: "s0", to: "c0" },
    });

    // One edge gone...
    expect(edgesOf(state)).toEqual(["plot.py -> Second figure"]);
    // ...and no artifact went with it.
    expect(state.charts).toHaveLength(2);
    expect(state.scripts).toHaveLength(1);
  });

  it("removes only the named direction", () => {
    let state = baseState();
    state = addMany(state, "charts", [{ caption: "First figure" }]);
    state = addMany(state, "scripts", [{ readme: "plot.py" }]);
    state = addEdge(state, { from: "s0", to: "c0", type: GENERATES });

    state = reducer(state, {
      type: UNLINK,
      payload: { from: "c0", to: "s0" },
    });
    // Nothing matched, so nothing was removed.
    expect(state.workflow.edges).toHaveLength(1);
  });
});
