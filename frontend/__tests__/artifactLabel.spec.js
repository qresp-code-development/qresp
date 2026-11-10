import { artifactLabel, figureLabel } from "../Utils/artifactLabel";
import createNode from "../components/Workflow/Nodes";
import { rowLabel } from "../components/CuratorElements/FigureWorkspace";

// An id -- c0, s1, d0 -- is an INTERNAL REFERENCE. It is positional:
// delete one figure and every later one is renumbered. Showing it invites a
// curator to treat it as a name for their own work, and it is not one.
//
// It has to keep existing: state, stored edges, test ids and data
// attributes all address artifacts by it. What it must not be is the thing
// a curator reads.

const DATA = {
  c: { c0: { caption: "Density of states near the Fermi level" } },
  s: { s0: { readme: "plot_dos.py" } },
  d: { d0: { readme: "dos.dat" } },
  t: { t0: { kind: "software", packageName: "Quantum ESPRESSO" } },
  h: { h0: { URLs: "https://example.org/set", notes: "external" } },
};

describe("what an artifact is called", () => {
  it("uses the curator's own words", () => {
    expect(artifactLabel(DATA.c.c0, "c0")).toBe(
      "Density of states near the Fermi level"
    );
    expect(artifactLabel(DATA.s.s0, "s0")).toBe("plot_dos.py");
    expect(artifactLabel(DATA.t.t0, "t0")).toBe("Quantum ESPRESSO");
  });

  it("says so plainly when there are no words yet", () => {
    // The one place an id still appears, and it reads as a fallback rather
    // than as the artifact's name.
    expect(artifactLabel({}, "c2")).toBe("Untitled Figure (c2)");
    expect(artifactLabel(undefined, "d1")).toBe("Untitled Dataset (d1)");
  });

  it("never returns a bare id", () => {
    ["c0", "s0", "d0", "t0", "h0", "c9"].forEach((id) =>
      expect(artifactLabel({}, id)).not.toBe(id)
    );
  });

  it("is one function, so the drawing and the list cannot disagree", () => {
    // They used to: the drawing labelled its boxes `c0` and the list used
    // the caption, so nothing on screen connected the two.
    expect(rowLabel).toBe(artifactLabel);
  });
});

describe("what the drawing writes on a box", () => {
  it("writes the name, not the id", () => {
    const node = createNode("c0", DATA, true);
    // The kind in small capitals, then the curator's name for it.
    expect(node.label).toBe("<b>FIGURE</b>\nDensity of states near the Fermi level");
    expect(node.label).not.toContain("c0");
  });

  it("still keeps the id as the node's identity", () => {
    // Every edge in storage is a pair of these.
    expect(createNode("s0", DATA, true).id).toBe("s0");
    expect(createNode("s0", DATA, false).id).toBe("s0");
  });

  it("writes nothing when labels are off", () => {
    expect(createNode("s0", DATA, false).label).toBe("");
  });

  it("may still name the id in the tooltip, which is not always on screen", () => {
    expect(createNode("s0", DATA, true).title.textContent).toContain("S0");
  });
});

describe("a figure is named by its number", () => {
  it("uses the figure number when there is one", () => {
    expect(artifactLabel({ caption: "Long caption", number: "2" }, "c1")).toBe("Figure 2");
    expect(artifactLabel({ caption: "x", number: "S3" }, "c4")).toBe("Figure S3");
    expect(artifactLabel({ caption: "x", number: "Table 1" }, "c5")).toBe("Table 1");
    expect(createNode("c0", { c: { c0: { caption: "x", number: 3 } } }, true).label).toBe(
      "<b>FIGURE</b>\n3"
    );
  });

  it("falls back to the caption without a number", () => {
    expect(artifactLabel({ caption: "Long caption", number: "" }, "c1")).toBe("Long caption");
    expect(figureLabel(undefined)).toBe("");
  });
});
