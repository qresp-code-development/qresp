/**
 * "Build your workflow" is the one place the graph is drawn and edited.
 *
 * An arrow dragged there is the same claim as one ticked in "Organize
 * figures and resources", so it must be the same edge type, checked the same
 * way, and ask the same question when it closes a loop. These tests reach
 * the editor's own `addEdge` handler rather than the canvas: vis-network
 * draws to a canvas jsdom does not have, and the canvas is not the contract.
 */
import { render } from "@testing-library/react";

jest.mock("axios");

// The drawing itself is not what is under test; capturing its props is.
let captured = null;
jest.mock("../components/Workflow/Graph", () => {
  const Stub = (props) => {
    captured = props;
    return <div data-testid="stub-graph" />;
  };
  return Stub;
});
jest.mock("../components/Workflow/Legend", () => {
  const Stub = () => <div data-testid="stub-legend" />;
  return Stub;
});

import AlertContext from "../Context/Alert/alertContext";
import CuratorContext from "../Context/Curator/curatorContext";
import CuratorHelperContext from "../Context/CuratorHelpers/curatorHelperContext";
import WorkflowInfoElement from "../components/CuratorElements/WorkflowElement";
import createEdge from "../components/Workflow/Edges";

const PAPER = {
  charts: [{ id: "c0", caption: "Density of states" }],
  scripts: [
    { id: "s0", readme: "plot_dos.py" },
    { id: "s1", readme: "preprocess.py" },
  ],
  datasets: [{ id: "d0", readme: "spectra" }],
  tools: [{ id: "t0", packageName: "numpy" }],
  heads: [{ id: "h0", URLs: ["https://example.org/set"] }],
};

const mount = (edges = []) => {
  captured = null;
  const addEdge = jest.fn();
  const setAlert = jest.fn();
  const unsetAlert = jest.fn();
  render(
    <AlertContext.Provider value={{ setAlert, unsetAlert }}>
      <CuratorHelperContext.Provider
        value={{
          workflowHelper: {},
          setWorkflowFit: jest.fn(),
          setShowLabels: jest.fn(),
          setWorkflowOnClick: jest.fn(),
          setEditing: jest.fn(),
          editing: { workflowInfo: true },
          externalNodeFormOpen: false,
          setExternalNodeFormOpen: jest.fn(),
          editingHead: null,
          setEditingHead: jest.fn(),
        }}
      >
        <CuratorContext.Provider
          value={{
            ...PAPER,
            workflow: { nodes: [], edges },
            addEdge,
            deleteEdge: jest.fn(),
            add: jest.fn(),
            edit: jest.fn(),
            del: jest.fn(),
            setEdges: jest.fn(),
          }}
        >
          <WorkflowInfoElement />
        </CuratorContext.Provider>
      </CuratorHelperContext.Provider>
    </AlertContext.Provider>
  );
  return { addEdge, setAlert, unsetAlert };
};

const draw = (from, to) => {
  const done = jest.fn();
  captured.manipulate.manipulation.addEdge({ from, to }, done);
  return done;
};

describe("the one workflow editor", () => {
  afterEach(() => jest.resetAllMocks());

  it("is on the page whether or not the graph has anything in it", () => {
    // It used to appear only once the workflow had nodes, which also hid the
    // External Data form it owns -- the one way to enter external data
    // vanished exactly when a curator had none.
    mount([]);
    expect(captured).not.toBeNull();
  });

  it("draws a generic arrow, not an untyped pair", () => {
    // An untyped edge is what a record written years ago holds. A new one
    // drawn today says what it is.
    const { addEdge } = mount([]);
    draw("s0", "d0");
    expect(addEdge).toHaveBeenCalledWith({
      from: "s0",
      to: "d0",
      type: "links_to",
    });
  });

  it("joins any two kinds, in either direction", () => {
    const pairs = [
      ["s0", "d0"],
      ["d0", "s0"],
      ["c0", "s0"],
      ["t0", "d0"],
      ["h0", "c0"],
      ["s0", "s1"],
    ];
    pairs.forEach(([from, to]) => {
      const { addEdge } = mount([]);
      draw(from, to);
      expect(addEdge).toHaveBeenCalledWith({ from, to, type: "links_to" });
    });
  });

  it("refuses an artifact joined to itself, and says why", () => {
    const { addEdge, setAlert } = mount([]);
    draw("s0", "s0");
    expect(addEdge).not.toHaveBeenCalled();
    expect(setAlert).toHaveBeenCalledWith(
      "That connection cannot be made",
      expect.stringMatching(/itself/i),
      null
    );
  });

  it("refuses the same arrow twice", () => {
    const { addEdge, setAlert } = mount([
      { from: "s0", to: "d0", type: "links_to" },
    ]);
    draw("s0", "d0");
    expect(addEdge).not.toHaveBeenCalled();
    expect(setAlert).toHaveBeenCalledWith(
      "That connection cannot be made",
      expect.stringMatching(/already there/i),
      null
    );
  });

  it("refuses an endpoint the paper does not have", () => {
    const { addEdge } = mount([]);
    draw("s0", "s9");
    expect(addEdge).not.toHaveBeenCalled();
  });

  it("asks before closing a loop, and makes nothing until told", () => {
    const { addEdge, setAlert } = mount([
      { from: "s0", to: "s1", type: "links_to" },
    ]);
    draw("s1", "s0");

    expect(addEdge).not.toHaveBeenCalled();
    expect(setAlert).toHaveBeenCalledWith(
      "Make a feedback loop?",
      expect.stringMatching(/feedback loop/i),
      expect.anything()
    );
  });

  it("writes the confirmation onto the edge it was asked about", () => {
    const { addEdge, setAlert, unsetAlert } = mount([
      { from: "s0", to: "s1", type: "links_to" },
    ]);
    draw("s1", "s0");

    // The alert's action is the "yes".
    const action = setAlert.mock.calls[0][2];
    render(action);
    action.props.onClick();

    expect(unsetAlert).toHaveBeenCalled();
    expect(addEdge).toHaveBeenCalledWith({
      from: "s1",
      to: "s0",
      type: "links_to",
      feedback: true,
    });
  });

  it("tells vis-network the drag is handled, whatever the answer", () => {
    mount([]);
    const ok = draw("s0", "d0");
    expect(ok).toHaveBeenCalledWith(null);

    mount([]);
    const refused = draw("s0", "s0");
    expect(refused).toHaveBeenCalledWith(null);
  });
});

// How a stored edge is handed to the drawing.
describe("what the graph is told about an edge", () => {
  it("passes a legacy pair through as the arrow it always was", () => {
    expect(createEdge(["s0", "c0"])).toEqual({ from: "s0", to: "c0" });
  });

  it("leaves an ordinary directed edge alone", () => {
    const edge = createEdge({ from: "s0", to: "c0", type: "generates" });
    expect(edge).toMatchObject({ from: "s0", to: "c0", type: "generates" });
    expect(edge.dashes).toBeUndefined();
    expect(edge.arrows).toBeUndefined();
  });

  it("gives an association a head at each end", () => {
    // It states no order, so one arrow would claim something nobody said.
    const edge = createEdge({ from: "c0", to: "c1", type: "related_to" });
    expect(edge.arrows).toEqual({ to: true, from: true, middle: false });
  });

  it("draws a confirmed feedback loop as a dashed line, and names it", () => {
    const edge = createEdge({
      from: "s1",
      to: "s0",
      type: "links_to",
      feedback: true,
    });
    expect(edge.dashes).toBe(true);
    expect(edge.title).toMatch(/feedback loop/i);
  });

  it("never marks a loop nobody confirmed", () => {
    const edge = createEdge({ from: "s1", to: "s0", type: "links_to" });
    expect(edge.dashes).toBeUndefined();
  });
});
