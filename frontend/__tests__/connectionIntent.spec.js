import {
  INDEPENDENT,
  NEW_TO_SOURCE,
  ROW_SCOPED,
  SOURCE_TO_NEW,
  connectionEdge,
  connectionProblem,
  defaultConnection,
  directionText,
  draftName,
  independentIntent,
  intentProblem,
  relationshipsFor,
  rowScopedIntent,
  withDirection,
} from "../Utils/connectionIntent";
import reducer from "../Context/Curator/curatorReducer";
import { ADD_AND_LINK } from "../Context/types";

const fromScript = rowScopedIntent("s0", "analysis.py");
const fromFigure = rowScopedIntent("c0", "Density of states");
const fromDataset = rowScopedIntent("d0", "raw data");

describe("the intent a row's LINK carries", () => {
  it("names its source by id and kind, and says it is row-scoped", () => {
    expect(fromScript).toEqual({
      mode: ROW_SCOPED,
      sourceArtifactId: "s0",
      sourceKind: "s",
      sourceLabel: "analysis.py",
    });
    expect(independentIntent()).toEqual({ mode: INDEPENDENT });
  });

  it("is refused when missing, malformed, or its source is gone", () => {
    expect(intentProblem(undefined, ["s0"])).toMatch(/nothing was added/i);
    expect(intentProblem({ sourceArtifactId: "s0" }, ["s0"])).toMatch(
      /nothing was added/i
    );
    expect(intentProblem(fromScript, ["c0"])).toMatch(/no longer in this paper/i);
    expect(intentProblem(fromScript, ["s0"])).toBe("");
    expect(intentProblem(independentIntent(), [])).toBe("");
  });
});

describe("the suggested connection", () => {
  it("puts a new Dataset into a Script it came from", () => {
    expect(defaultConnection(fromScript, "dataset")).toEqual({
      direction: NEW_TO_SOURCE,
      type: "consumes",
    });
    expect(defaultConnection(fromDataset, "script")).toEqual({
      direction: SOURCE_TO_NEW,
      type: "consumes",
    });
  });

  it("has a Script generate a Figure, whichever end is new", () => {
    expect(defaultConnection(fromFigure, "script")).toEqual({
      direction: NEW_TO_SOURCE,
      type: "generates",
    });
    expect(defaultConnection(fromScript, "chart")).toEqual({
      direction: SOURCE_TO_NEW,
      type: "generates",
    });
  });

  it("falls back to an explicit links_to for every other pair", () => {
    expect(defaultConnection(fromScript, "tool")).toEqual({
      direction: SOURCE_TO_NEW,
      type: "links_to",
    });
    expect(defaultConnection(fromFigure, "dataset")).toEqual({
      direction: SOURCE_TO_NEW,
      type: "links_to",
    });
  });

  it("stays editable: flipping keeps a relationship that still fits", () => {
    const flipped = withDirection(
      fromScript,
      "script",
      { direction: SOURCE_TO_NEW, type: "feeds_into" },
      NEW_TO_SOURCE
    );
    expect(flipped).toEqual({ direction: NEW_TO_SOURCE, type: "feeds_into" });
  });

  it("and falls back to links_to when the relationship no longer fits", () => {
    const flipped = withDirection(
      fromScript,
      "dataset",
      { direction: NEW_TO_SOURCE, type: "consumes" },
      SOURCE_TO_NEW
    );
    expect(flipped).toEqual({ direction: SOURCE_TO_NEW, type: "links_to" });
  });
});

describe("what may be chosen", () => {
  it("offers exactly what the canonical rules allow for the pair", () => {
    expect(relationshipsFor(fromScript, "dataset", NEW_TO_SOURCE)).toEqual([
      "consumes",
      "links_to",
    ]);
    expect(relationshipsFor(fromScript, "dataset", SOURCE_TO_NEW)).toEqual([
      "links_to",
    ]);
  });

  it("keeps related_to and feeds_into to two of the same kind", () => {
    expect(relationshipsFor(fromScript, "script", NEW_TO_SOURCE)).toEqual([
      "links_to",
      "feeds_into",
      "related_to",
    ]);
    expect(relationshipsFor(fromScript, "chart", SOURCE_TO_NEW)).not.toContain(
      "related_to"
    );
  });

  it("writes both ends out, never 'selected'", () => {
    expect(
      directionText(fromScript, "dataset", "raw", NEW_TO_SOURCE, "consumes")
    ).toBe("Dataset: raw → Script: analysis.py");
    expect(
      directionText(fromScript, "dataset", "", SOURCE_TO_NEW, "links_to")
    ).toBe("Script: analysis.py → New Dataset");
    expect(
      directionText(fromScript, "script", "b.py", NEW_TO_SOURCE, "related_to")
    ).toBe("Script: b.py ↔ Script: analysis.py");
  });

  it("reads a half-filled form's name the way a row label would", () => {
    expect(draftName({ readme: "  raw   spectra " })).toBe("raw spectra");
    expect(draftName({ caption: "Fig", readme: "x" })).toBe("Fig");
    expect(draftName({})).toBe("");
  });
});

describe("the check before anything is created", () => {
  it("goes through edgeProblem: a relationship that does not fit is refused",
     () => {
    expect(
      connectionProblem(
        fromScript,
        "dataset",
        { direction: NEW_TO_SOURCE, type: "uses_tool" },
        ["s0"],
        []
      )
    ).toMatch(/cannot be connected that way/i);
  });

  it("passes a valid choice", () => {
    expect(
      connectionProblem(
        fromScript,
        "dataset",
        { direction: NEW_TO_SOURCE, type: "consumes" },
        ["s0"],
        []
      )
    ).toBe("");
  });

  it("refuses a row-scoped create with no choice at all", () => {
    expect(
      connectionProblem(fromScript, "dataset", null, ["s0"], [])
    ).toMatch(/choose how/i);
  });
});

describe("CREATE AND LINK in the reducer", () => {
  const base = {
    charts: [],
    scripts: [{ id: "s0", readme: "analysis.py" }],
    datasets: [{ id: "d0", readme: "existing" }],
    tools: [],
    heads: [],
    workflow: { nodes: [], edges: [] },
  };
  const act = (state, over) =>
    reducer(state, {
      type: ADD_AND_LINK,
      payload: {
        type: "datasets",
        values: [{ readme: "new" }],
        intent: fromScript,
        choice: { direction: NEW_TO_SOURCE, type: "consumes" },
        ...over,
      },
    });

  it("mints the id and joins that id to the source, in one change", () => {
    const next = act(base);
    expect(next.datasets.map((d) => d.id)).toEqual(["d0", "d1"]);
    expect(next.workflow.edges).toEqual([
      { from: "d1", to: "s0", type: "consumes" },
    ]);
  });

  it("gives every record of a batch its own arrow", () => {
    const next = act(base, { values: [{ readme: "a" }, { readme: "b" }] });
    expect(next.workflow.edges).toEqual([
      { from: "d1", to: "s0", type: "consumes" },
      { from: "d2", to: "s0", type: "consumes" },
    ]);
  });

  it("writes nothing at all when the arrow is refused", () => {
    const next = act(base, {
      choice: { direction: NEW_TO_SOURCE, type: "uses_tool" },
    });
    expect(next).toBe(base);
  });

  it("writes nothing when the source is gone", () => {
    const next = act({ ...base, scripts: [] });
    expect(next.datasets).toHaveLength(1);
    expect(next.workflow.edges).toEqual([]);
  });

  it("writes nothing for an intent that is not row-scoped", () => {
    expect(act(base, { intent: independentIntent() })).toBe(base);
    expect(act(base, { intent: undefined })).toBe(base);
  });

  it("stores the edge exactly as Link existing would", () => {
    const next = act(base, {
      choice: { direction: SOURCE_TO_NEW, type: "links_to" },
    });
    expect(next.workflow.edges).toEqual([
      connectionEdge(fromScript, "d1", {
        direction: SOURCE_TO_NEW,
        type: "links_to",
      }),
    ]);
  });
});
