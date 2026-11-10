/**
 * The workflow graph's vocabulary, on the client.
 *
 * It mirrors backend/project/workflow.py. These tests exist so the two halves
 * cannot drift apart quietly: the server refuses a graph it cannot store, and
 * this half is what tells a curator before they save rather than after.
 */
import {
  CONSUMES,
  DIRECTED,
  edgeFits,
  edgeSentence,
  EDGE_GROUP,
  EDGE_VERB,
  FEEDS_INTO,
  GENERATES,
  INPUTS,
  OUTPUTS,
  PROCESS,
  RELATED_TO,
  USES_TOOL,
  closesLoop,
  componentsOf,
  edgeProblem,
  LINKS_TO,
  fromStoredEdge,
  hasEdge,
  inferEdgeType,
  laneOf,
  toStoredEdge,
  wouldCycle,
} from "../Utils/workflowGraph";

const ALL = ["c0", "s0", "d0", "t0", "h0"];

describe("lanes", () => {
  it("reads left to right: what went in, what ran, what came out", () => {
    expect(laneOf("d0")).toBe(INPUTS);
    expect(laneOf("h0")).toBe(INPUTS);
    expect(laneOf("s0")).toBe(PROCESS);
    expect(laneOf("t0")).toBe(PROCESS);
    expect(laneOf("c0")).toBe(OUTPUTS);
  });

  it("has no lane for an id it does not recognise", () => {
    expect(laneOf("z9")).toBe("");
    expect(laneOf("")).toBe("");
    expect(laneOf(undefined)).toBe("");
  });
});

// This is what lets an Add button connect things without asking a question.
describe("inferring a relationship", () => {
  it("names the one relationship a pair can hold", () => {
    expect(inferEdgeType("s0", "c0")).toBe(GENERATES);
    expect(inferEdgeType("t0", "s0")).toBe(USES_TOOL);
    expect(inferEdgeType("d0", "s0")).toBe(CONSUMES);
    expect(inferEdgeType("h0", "s0")).toBe(CONSUMES);
    expect(inferEdgeType("d0", "c0")).toBe(CONSUMES);
  });

  it("stays silent when a pair can hold none", () => {
    // Nothing is guessed. A pair with no lawful relationship gets "" and the
    // curator connects them explicitly or not at all.
    expect(inferEdgeType("c0", "s0")).toBe("");
    expect(inferEdgeType("t0", "c0")).toBe("");
    // A same-kind pair DOES hold one -- `feeds_into` -- so what holds
    // nothing is a pair of different kinds with no rule for it.
    expect(inferEdgeType("c0", "d0")).toBe("");
    expect(inferEdgeType("t0", "h0")).toBe("");
    expect(inferEdgeType("d0", "t0")).toBe("");
  });

  it("is direction-sensitive", () => {
    expect(inferEdgeType("s0", "c0")).toBe(GENERATES);
    expect(inferEdgeType("c0", "s0")).toBe("");
  });
});

describe("reading and writing a stored edge", () => {
  it("reads the typed shape V1 writes", () => {
    expect(fromStoredEdge({ from: "s0", to: "c0", type: GENERATES })).toEqual({
      from: "s0",
      to: "c0",
      type: GENERATES,
    });
  });

  it("reads the pair shape every earlier record holds", () => {
    expect(fromStoredEdge(["s0", "c0"])).toEqual({
      from: "s0",
      to: "c0",
      type: "",
    });
  });

  it("survives junk without throwing", () => {
    expect(fromStoredEdge(null)).toEqual({ from: "", to: "", type: "" });
    expect(fromStoredEdge("s0->c0")).toEqual({ from: "", to: "", type: "" });
    expect(fromStoredEdge([])).toEqual({ from: "", to: "", type: "" });
  });

  it("writes a typed edge as an object and an untyped one as a pair", () => {
    // A legacy graph opened and saved must not be rewritten into a shape it
    // never had.
    expect(toStoredEdge({ from: "s0", to: "c0", type: GENERATES })).toEqual({
      from: "s0",
      to: "c0",
      type: GENERATES,
    });
    expect(toStoredEdge({ from: "s0", to: "c0", type: "" })).toEqual([
      "s0",
      "c0",
    ]);
  });
});

describe("cycles", () => {
  it("sees a two-node loop", () => {
    expect(wouldCycle([["s0", "c0"]], { from: "c0", to: "s0" })).toBe(true);
  });

  it("sees a longer loop", () => {
    expect(
      wouldCycle([["a", "b"], ["b", "c"]], { from: "c", to: "a" })
    ).toBe(true);
  });

  it("allows a diamond, which is not a cycle", () => {
    // One dataset feeding two scripts that both feed one chart is ordinary.
    expect(
      wouldCycle(
        [["d0", "s0"], ["d0", "s1"], ["s0", "c0"]],
        { from: "s1", to: "c0" }
      )
    ).toBe(false);
  });

  it("does not blow the stack on a long chain", () => {
    const edges = [];
    for (let i = 0; i < 3000; i += 1) edges.push([`n${i}`, `n${i + 1}`]);
    expect(wouldCycle(edges, null)).toBe(false);
  });
});

describe("why an edge cannot be added", () => {
  const problem = (edge, edges = []) => edgeProblem(edge, ALL, edges);

  it("accepts the three relationships V1 understands", () => {
    expect(problem({ from: "d0", to: "s0", type: CONSUMES })).toBe("");
    expect(problem({ from: "t0", to: "s0", type: USES_TOOL })).toBe("");
    expect(problem({ from: "s0", to: "c0", type: GENERATES })).toBe("");
  });

  it("refuses a node linked to itself", () => {
    expect(problem({ from: "s0", to: "s0", type: GENERATES })).toMatch(
      /itself/i
    );
  });

  it("refuses an artifact this paper does not have", () => {
    // Which is also how another paper's artifact presents.
    expect(problem({ from: "s0", to: "c9", type: GENERATES })).toMatch(
      /does not have/i
    );
  });

  it("refuses a relationship the endpoints cannot hold", () => {
    expect(problem({ from: "t0", to: "c0", type: GENERATES })).toMatch(
      /cannot be connected/i
    );
  });

  it("refuses an unknown relationship name", () => {
    expect(problem({ from: "s0", to: "c0", type: "produces" })).toMatch(
      /unknown relationship/i
    );
  });

  it("does not refuse a loop, it reports one to be confirmed", () => {
    // Refinement is real work. The Curator asks before drawing one and then
    // marks it as a feedback loop; storage keeps what was confirmed.
    const closing = [{ from: "s0", to: "c0", type: GENERATES }];
    expect(problem({ from: "c0", to: "s0" }, closing)).toBe("");
    expect(closesLoop(closing, { from: "c0", to: "s0" })).toBe(true);
  });

  it("accepts a legacy untyped edge between real artifacts", () => {
    expect(problem({ from: "d0", to: "s0", type: "" })).toBe("");
  });

  it("refuses an edge missing an endpoint", () => {
    expect(problem({ from: "s0", to: "" })).toMatch(/missing an endpoint/i);
  });
});

describe("finding an existing connection", () => {
  it("matches in either stored shape", () => {
    const edges = [["d0", "s0"], { from: "s0", to: "c0", type: GENERATES }];
    expect(hasEdge(edges, "d0", "s0")).toBe(true);
    expect(hasEdge(edges, "s0", "c0")).toBe(true);
    expect(hasEdge(edges, "c0", "s0")).toBe(false);
    expect(hasEdge([], "d0", "s0")).toBe(false);
  });
});

// Script -> Script, the one relationship joining two of a kind. It mirrors
// backend/project/workflow.py exactly; if the two ever disagree the server
// wins and this file is the one that is wrong.
describe("feeds_into", () => {
  it("is one stage of a kind feeding the next, at every level", () => {
    ["c", "s", "d", "t", "h"].forEach((kind) =>
      expect(edgeFits(FEEDS_INTO, kind, kind)).toBe(true)
    );
    // Still same-kind only: a dataset reaching a script is `consumes`.
    expect(edgeFits(FEEDS_INTO, "d", "s")).toBe(false);
    expect(inferEdgeType("d0", "s0")).toBe(CONSUMES);
  });

  it("refuses two different kinds, so it cannot shadow consumes", () => {
    expect(edgeFits(FEEDS_INTO, "d", "s")).toBe(false);
    expect(inferEdgeType("d0", "s0")).toBe(CONSUMES);
    expect(
      edgeProblem({ from: "d0", to: "s0", type: FEEDS_INTO }, ["d0", "s0"])
    ).toBeTruthy();
  });

  it("does not disturb what the other pairs already inferred", () => {
    expect(inferEdgeType("s0", "c0")).toBe(GENERATES);
    expect(inferEdgeType("d0", "s0")).toBe(CONSUMES);
    expect(inferEdgeType("t0", "s0")).toBe(USES_TOOL);
  });

  it("refuses a script feeding itself", () => {
    expect(
      edgeProblem({ from: "s0", to: "s0", type: FEEDS_INTO }, ["s0"])
    ).toBeTruthy();
  });

  it("reports a pair of scripts feeding each other as a loop", () => {
    const held = [{ from: "s0", to: "s1", type: FEEDS_INTO }];
    expect(
      edgeProblem({ from: "s1", to: "s0", type: FEEDS_INTO }, ["s0", "s1"], held)
    ).toBe("");
    expect(closesLoop(held, { from: "s1", to: "s0", type: FEEDS_INTO })).toBe(true);
  });

  it("still refuses an artifact joined to itself", () => {
    expect(
      edgeProblem({ from: "s0", to: "s0", type: FEEDS_INTO }, ["s0"])
    ).toBeTruthy();
  });

  it("round-trips through storage as a typed edge", () => {
    const edge = { from: "s1", to: "s0", type: FEEDS_INTO };
    expect(toStoredEdge(edge)).toEqual(edge);
    expect(fromStoredEdge(toStoredEdge(edge))).toEqual(edge);
  });

  it("reads upstream to downstream, in one verb", () => {
    expect(EDGE_VERB[FEEDS_INTO]).toBe("feeds into");
    expect(EDGE_GROUP[FEEDS_INTO]).toBe("Receives from script");
  });
});

// The undirected half of the vocabulary. It says two artifacts belong
// together and nothing else -- no order, no data flow.
describe("related_to", () => {
  it("joins any two of a kind, and only its own kind", () => {
    ["c", "s", "d", "t", "h"].forEach((kind) =>
      expect(edgeFits(RELATED_TO, kind, kind)).toBe(true)
    );
    expect(edgeFits(RELATED_TO, "c", "s")).toBe(false);
    expect(edgeFits(RELATED_TO, "d", "s")).toBe(false);
  });

  it("is never inferred, only chosen", () => {
    // `inferEdgeType` answers "what does this pair PRODUCE". An association
    // is a claim only a curator can make, so it is never the answer.
    expect(DIRECTED).not.toContain(RELATED_TO);
    expect(inferEdgeType("c0", "c1")).toBe(FEEDS_INTO);
    expect(inferEdgeType("s0", "s1")).toBe(FEEDS_INTO);
  });

  it("refuses an artifact related to itself", () => {
    expect(
      edgeProblem({ from: "c0", to: "c0", type: RELATED_TO }, ["c0"])
    ).toBeTruthy();
  });

  it("refuses the same pair twice, in either order", () => {
    const held = [{ from: "c0", to: "c1", type: RELATED_TO }];
    expect(
      edgeProblem({ from: "c0", to: "c1", type: RELATED_TO }, ["c0", "c1"], held)
    ).toMatch(/already related/i);
    expect(
      edgeProblem({ from: "c1", to: "c0", type: RELATED_TO }, ["c0", "c1"], held)
    ).toMatch(/already related/i);
  });

  it("takes no part in the cycle check", () => {
    // There is no direction to loop.
    const held = [{ from: "c0", to: "c1", type: RELATED_TO }];
    expect(
      edgeProblem({ from: "c1", to: "c0", type: GENERATES }, ["c0", "c1"], held)
    ).not.toMatch(/loop/i);
  });

  it("does not let an association look like a loop, or hide one", () => {
    const held = [
      { from: "c0", to: "c1", type: RELATED_TO },
      { from: "s0", to: "c0", type: GENERATES },
    ];
    // The association is not a loop...
    expect(closesLoop(held, { from: "c1", to: "c0", type: RELATED_TO })).toBe(false);
    // ...and it does not stop a real one being seen.
    expect(closesLoop(held, { from: "c0", to: "s0", type: GENERATES })).toBe(true);
  });

  it("reads without arrows, because neither end came first", () => {
    const name = (id) => id.toUpperCase();
    expect(edgeSentence({ from: "c0", to: "c1", type: RELATED_TO }, name)).toBe(
      "C0 ↔ related to ↔ C1"
    );
    expect(edgeSentence({ from: "s0", to: "c0", type: GENERATES }, name)).toBe(
      "S0 → generates → C0"
    );
  });

  it("round-trips through storage as a typed edge", () => {
    const edge = { from: "d0", to: "d1", type: RELATED_TO };
    expect(fromStoredEdge(toStoredEdge(edge))).toEqual(edge);
  });
});

// A workflow is a GRAPH. What a curator calls "one workflow" is a connected
// component of it, derived on every render -- there is no group model.
describe("connected components", () => {
  it("calls an artifact with no edges its own", () => {
    const { connected, alone } = componentsOf(["c0", "s0"], []);
    expect(connected).toEqual([]);
    expect(alone).toEqual(["c0", "s0"]);
  });

  it("gathers everything joined, however it is joined", () => {
    const { connected, alone } = componentsOf(
      ["c0", "s0", "d0", "t0"],
      [
        { from: "s0", to: "c0", type: GENERATES },
        { from: "d0", to: "s0", type: CONSUMES },
      ]
    );
    expect(connected).toEqual([["c0", "d0", "s0"]]);
    expect(alone).toEqual(["t0"]);
  });

  it("merges two groups the moment they are joined", () => {
    const ids = ["c0", "s0", "c1", "s1"];
    const apart = [
      { from: "s0", to: "c0", type: GENERATES },
      { from: "s1", to: "c1", type: GENERATES },
    ];
    expect(componentsOf(ids, apart).connected).toHaveLength(2);

    const joined = [...apart, { from: "s0", to: "s1", type: FEEDS_INTO }];
    expect(componentsOf(ids, joined).connected).toEqual([
      ["c0", "c1", "s0", "s1"],
    ]);
  });

  it("splits them again when the last edge between them goes", () => {
    const ids = ["c0", "s0", "c1", "s1"];
    const joined = [
      { from: "s0", to: "c0", type: GENERATES },
      { from: "s1", to: "c1", type: GENERATES },
      { from: "s0", to: "s1", type: FEEDS_INTO },
    ];
    const cut = joined.filter((edge) => edge.type !== FEEDS_INTO);
    expect(componentsOf(ids, cut).connected).toHaveLength(2);
  });

  it("counts an undirected association as joining too", () => {
    // Two figures a curator says are related are one piece of work.
    const { connected } = componentsOf(
      ["c0", "c1"],
      [{ from: "c0", to: "c1", type: RELATED_TO }]
    );
    expect(connected).toEqual([["c0", "c1"]]);
  });

  it("ignores an edge naming something the paper does not have", () => {
    const { connected, alone } = componentsOf(
      ["c0"],
      [{ from: "s9", to: "c0", type: GENERATES }]
    );
    expect(connected).toEqual([]);
    expect(alone).toEqual(["c0"]);
  });

  it("reads a legacy untyped pair as joining", () => {
    expect(componentsOf(["c0", "s0"], [["s0", "c0"]]).connected).toEqual([
      ["c0", "s0"],
    ]);
  });
});

describe("a confirmed feedback loop", () => {
  // It is a FACT THE CURATOR STATED, so it is written down and read back.
  // Deriving it from the shape of the graph would lose the answer the moment
  // another edge was removed.
  it("survives the round trip through storage", () => {
    const edge = { from: "s0", to: "s1", type: FEEDS_INTO, feedback: true };
    const stored = toStoredEdge(edge);
    expect(stored).toEqual({
      from: "s0",
      to: "s1",
      type: FEEDS_INTO,
      feedback: true,
    });
    expect(fromStoredEdge(stored)).toEqual(edge);
  });

  it("is absent, not false, on an ordinary edge", () => {
    const plain = { from: "s0", to: "c0", type: GENERATES };
    expect(toStoredEdge(plain)).toEqual(plain);
    expect(fromStoredEdge(plain).feedback).toBeUndefined();
  });

  it("is never invented for a legacy untyped pair", () => {
    expect(fromStoredEdge(["s0", "c0"]).feedback).toBeUndefined();
    // ...and a legacy pair still stores as the pair it arrived as.
    expect(toStoredEdge({ from: "s0", to: "c0", type: "" })).toEqual([
      "s0",
      "c0",
    ]);
  });

  it("does not change what the edge IS", () => {
    // The mark rides along; it is not part of the relationship.
    const edge = { from: "s0", to: "s1", type: FEEDS_INTO, feedback: true };
    expect(edgeProblem(edge, ["s0", "s1"])).toBe("");
  });
});

// The arrow a curator draws, between any two things.
describe("links_to across the five by five matrix", () => {
  const KINDS = ["c", "s", "d", "t", "h"];

  it("fits every cell, same kind included", () => {
    const cells = [];
    KINDS.forEach((a) =>
      KINDS.forEach((b) => {
        if (edgeFits(LINKS_TO, a, b)) cells.push(`${a}->${b}`);
      })
    );
    // Twenty-five, not twenty: like to like is as ordinary as any other.
    expect(cells).toHaveLength(25);
    KINDS.forEach((k) => expect(cells).toContain(`${k}->${k}`));
  });

  it("accepts a same-kind arrow between two different artifacts", () => {
    KINDS.forEach((k) =>
      expect(
        edgeProblem(
          { from: `${k}0`, to: `${k}1`, type: LINKS_TO },
          [`${k}0`, `${k}1`]
        )
      ).toBe("")
    );
  });

  it("refuses an artifact joined to itself, of any kind", () => {
    KINDS.forEach((k) =>
      expect(
        edgeProblem({ from: `${k}0`, to: `${k}0`, type: LINKS_TO }, [`${k}0`])
      ).toBeTruthy()
    );
  });

  it("refuses the same arrow twice and allows the opposite one", () => {
    const held = [{ from: "d0", to: "d1", type: LINKS_TO }];
    expect(
      edgeProblem({ from: "d0", to: "d1", type: LINKS_TO }, ["d0", "d1"], held)
    ).toBeTruthy();
    expect(
      edgeProblem({ from: "d1", to: "d0", type: LINKS_TO }, ["d0", "d1"], held)
    ).toBe("");
  });

  it("leaves the older relationships to their own endpoints", () => {
    // Widening one type must not widen the others.
    expect(edgeFits(USES_TOOL, "t", "c")).toBe(false);
    expect(edgeFits(GENERATES, "c", "s")).toBe(false);
    expect(edgeFits(CONSUMES, "s", "d")).toBe(false);
    expect(edgeFits(RELATED_TO, "c", "s")).toBe(false);
  });

  it("is never what a pair is inferred to hold", () => {
    // It fits everything, so inferring it would make every contextual Add
    // ambiguous. It is only ever chosen.
    expect(inferEdgeType("d0", "s0")).toBe(CONSUMES);
    expect(inferEdgeType("s0", "s1")).toBe(FEEDS_INTO);
    expect(inferEdgeType("c0", "d0")).toBe("");
  });
});
