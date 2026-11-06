import { layoutWorkflow, X_GAP } from "../Utils/workflowLayout";

const column = (positions, id) => Math.round(positions[id].x / X_GAP);

describe("the workflow reads left to right", () => {
  it("puts inputs, then the code that used them, then the figures", () => {
    const { positions, columns } = layoutWorkflow(
      ["d0", "t0", "s0", "c0", "c1"],
      [
        { from: "d0", to: "s0", type: "consumes" },
        { from: "t0", to: "s0", type: "uses_tool" },
        { from: "s0", to: "c0", type: "generates" },
        { from: "s0", to: "c1", type: "generates" },
      ]
    );
    expect(columns).toBe(3);
    expect(column(positions, "d0")).toBe(0);
    expect(column(positions, "t0")).toBe(0);
    expect(column(positions, "s0")).toBe(1);
    expect(column(positions, "c0")).toBe(2);
    expect(column(positions, "c1")).toBe(2);
  });

  it("lines every figure up in the last column, however short its path", () => {
    const { positions } = layoutWorkflow(
      ["h0", "d0", "s0", "s1", "c0", "c1"],
      [
        ["d0", "s0"],
        ["s0", "s1"],
        ["s1", "c0"],
        { from: "h0", to: "c1", type: "consumes" },
      ]
    );
    expect(column(positions, "c1")).toBe(column(positions, "c0"));
    expect(column(positions, "c0")).toBe(3);
  });

  it("survives an unmarked cycle and ignores feedback for placement", () => {
    const { positions } = layoutWorkflow(
      ["s0", "s1", "c0"],
      [
        ["s0", "s1"],
        ["s1", "s0"],
        { from: "s1", to: "c0", type: "generates" },
      ]
    );
    expect(Object.keys(positions).sort()).toEqual(["c0", "s0", "s1"]);
  });

  it("places unconnected items by kind, centred and evenly spaced", () => {
    const { positions } = layoutWorkflow(["d0", "d1", "s0", "c0"], []);
    expect(column(positions, "d0")).toBe(0);
    expect(column(positions, "s0")).toBe(1);
    expect(column(positions, "c0")).toBe(2);
    expect(positions.d0.y).toBe(-positions.d1.y);
  });

  it("orders a column to follow its neighbours, so arrows do not cross", () => {
    const { positions } = layoutWorkflow(
      ["d0", "d1", "s0", "s1"],
      [
        ["d0", "s1"],
        ["d1", "s0"],
      ]
    );
    expect(positions.d0.y < positions.d1.y).toBe(positions.s1.y < positions.s0.y);
  });

  it("is the same picture every time", () => {
    const args = [["d0", "s0", "c0"], [["d0", "s0"], ["s0", "c0"]]];
    expect(layoutWorkflow(...args)).toEqual(layoutWorkflow(...args));
  });
});
