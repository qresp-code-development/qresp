/**
 * The workflow board.
 *
 * The feature's whole claim is that ordinary curation does not require
 * drawing a diagram, so most of these tests are about what a BUTTON does:
 * what it creates, what it connects, and -- as much as anything -- what it
 * does not touch.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
import axios from "axios";

import CuratorContext from "../Context/Curator/curatorContext";
import CuratorHelperContext from "../Context/CuratorHelpers/curatorHelperContext";
import WorkflowBoard from "../components/CuratorElements/WorkflowBoard";

const noop = () => {};

// A context whose dispatchers are spies, so a click can be checked for what
// it asked the Curator to do rather than for what the screen happened to show.
const build = (overrides = {}) => ({
  charts: [],
  scripts: [],
  datasets: [],
  tools: [],
  heads: [],
  workflow: { nodes: [], edges: [] },
  addMany: jest.fn(),
  addEdge: jest.fn(),
  unlink: jest.fn(),
  add: noop,
  del: noop,
  ...overrides,
});

// The helper context is how the EXISTING Curator forms are opened. Spying on
// it is how "clicking Edit opens the artifact's real form" is checked without
// mounting the whole Curator.
const buildHelpers = () => ({
  openForm: jest.fn(),
  setDefault: jest.fn(),
  setExternalNodeFormOpen: jest.fn(),
});

const renderBoard = (overrides = {}, helpers = buildHelpers()) => {
  const value = build(overrides);
  render(
    <CuratorHelperContext.Provider value={helpers}>
      <CuratorContext.Provider value={value}>
        <WorkflowBoard />
      </CuratorContext.Provider>
    </CuratorHelperContext.Provider>
  );
  return { ...value, helpers };
};

const user = () => userEvent.setup({ delay: null });

describe("the five Add buttons", () => {
  afterEach(() => jest.resetAllMocks());

  it("offers one per artifact type", () => {
    renderBoard();
    ["chart", "script", "dataset", "tool", "head"].forEach((type) =>
      expect(screen.getByTestId(`workflow-add-${type}`)).toBeInTheDocument()
    );
  });

  it.each([
    ["chart", "chart"],
    ["script", "script"],
    ["dataset", "dataset"],
    ["tool", "tool"],
    ["head", "head"],
  ])("creates a local draft for %s, with no request at all", async (button, type) => {
    const ctx = renderBoard();
    await user().click(screen.getByTestId(`workflow-add-${button}`));

    expect(ctx.addMany).toHaveBeenCalledTimes(1);
    expect(ctx.addMany.mock.calls[0][0]).toBe(type);
    expect(ctx.addMany.mock.calls[0][1]).toHaveLength(1);
    // A button press is not a record. Nothing is persisted until the record
    // is saved, so nothing may reach the network here.
    expect(axios.post).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("creates an unconnected node when nothing is selected", async () => {
    const ctx = renderBoard();
    await user().click(screen.getByTestId("workflow-add-dataset"));
    expect(ctx.addMany).toHaveBeenCalled();
    expect(ctx.addEdge).not.toHaveBeenCalled();
  });

  it("puts each type in its own lane", () => {
    renderBoard({
      charts: [{ id: "c0", caption: "Figure one" }],
      scripts: [{ id: "s0", readme: "plot.py" }],
      datasets: [{ id: "d0", readme: "trajectory" }],
      tools: [{ id: "t0", packageName: "numpy" }],
      heads: [{ id: "h0", label: "Materials Project" }],
    });
    const inputs = screen.getByTestId("workflow-lane-inputs");
    const process = screen.getByTestId("workflow-lane-process");
    const outputs = screen.getByTestId("workflow-lane-outputs");

    expect(within(inputs).getByTestId("workflow-node-d0")).toBeInTheDocument();
    expect(within(inputs).getByTestId("workflow-node-h0")).toBeInTheDocument();
    expect(within(process).getByTestId("workflow-node-s0")).toBeInTheDocument();
    expect(within(process).getByTestId("workflow-node-t0")).toBeInTheDocument();
    expect(within(outputs).getByTestId("workflow-node-c0")).toBeInTheDocument();
  });
});

// The heart of it: the connection is made from what the two things ARE, not
// from the order they were clicked, and never by asking a question.
describe("contextual connections", () => {
  afterEach(() => jest.resetAllMocks());

  it("selected Chart + Add Script links Script -> Chart", async () => {
    const ctx = renderBoard({ charts: [{ id: "c0", caption: "Figure one" }] });
    await user().click(screen.getByTestId("workflow-node-c0"));
    await user().click(screen.getByTestId("workflow-add-script"));

    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: "s0",
      to: "c0",
      type: "generates",
    });
  });

  it("selected Script + Add Dataset links Dataset -> Script", async () => {
    const ctx = renderBoard({ scripts: [{ id: "s0", readme: "plot.py" }] });
    await user().click(screen.getByTestId("workflow-node-s0"));
    await user().click(screen.getByTestId("workflow-add-dataset"));

    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: "d0",
      to: "s0",
      type: "consumes",
    });
  });

  it("selected Script + Add External Data links External -> Script", async () => {
    const ctx = renderBoard({ scripts: [{ id: "s0", readme: "plot.py" }] });
    await user().click(screen.getByTestId("workflow-node-s0"));
    await user().click(screen.getByTestId("workflow-add-head"));

    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: "h0",
      to: "s0",
      type: "consumes",
    });
  });

  it("selected Script + Add Tool links Tool -> Script", async () => {
    const ctx = renderBoard({ scripts: [{ id: "s0", readme: "plot.py" }] });
    await user().click(screen.getByTestId("workflow-node-s0"));
    await user().click(screen.getByTestId("workflow-add-tool"));

    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: "t0",
      to: "s0",
      type: "uses_tool",
    });
  });

  it("still creates the node when the pair cannot be connected", async () => {
    // A Tool and a Chart have no direct relationship. The node is created
    // anyway -- refusing to add it would be a worse answer than adding it
    // unconnected -- and the board says why it is not linked.
    const ctx = renderBoard({ charts: [{ id: "c0", caption: "Figure one" }] });
    await user().click(screen.getByTestId("workflow-node-c0"));
    await user().click(screen.getByTestId("workflow-add-tool"));

    expect(ctx.addMany).toHaveBeenCalled();
    expect(ctx.addEdge).not.toHaveBeenCalled();
    expect(screen.getByTestId("workflow-notice")).toHaveTextContent(
      /cannot be connected directly/i
    );
  });
});

describe("connecting and unlinking existing nodes", () => {
  afterEach(() => jest.resetAllMocks());

  const twoNodes = {
    charts: [{ id: "c0", caption: "Figure one" }],
    scripts: [{ id: "s0", readme: "plot.py" }],
  };

  it("connects two existing artifacts rather than duplicating one", async () => {
    const ctx = renderBoard(twoNodes);
    await user().click(screen.getByTestId("workflow-node-s0"));
    await user().click(screen.getByTestId("workflow-connect-c0"));

    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: "s0",
      to: "c0",
      type: "generates",
    });
    // Attaching an existing artifact must not create another one.
    expect(ctx.addMany).not.toHaveBeenCalled();
  });

  it("refuses to connect a pair that has no relationship", async () => {
    // Two figures now hold `feeds_into` -- one panel becoming part of a
    // composite is a real thing a curator may record. A tool and a figure
    // hold nothing, in either direction.
    const ctx = renderBoard({
      charts: [{ id: "c0", caption: "One" }],
      tools: [{ id: "t0", packageName: "numpy" }],
    });
    await user().click(screen.getByTestId("workflow-node-c0"));
    await user().click(screen.getByTestId("workflow-connect-t0"));

    expect(ctx.addEdge).not.toHaveBeenCalled();
    expect(screen.getByTestId("workflow-notice")).toHaveTextContent(
      /cannot be connected/i
    );
  });

  it("says so instead of adding the same connection twice", async () => {
    const ctx = renderBoard({
      ...twoNodes,
      workflow: {
        nodes: [],
        edges: [{ from: "s0", to: "c0", type: "generates" }],
      },
    });
    await user().click(screen.getByTestId("workflow-node-s0"));
    await user().click(screen.getByTestId("workflow-connect-c0"));

    expect(ctx.addEdge).not.toHaveBeenCalled();
    expect(screen.getByTestId("workflow-notice")).toHaveTextContent(
      /already connected/i
    );
  });

  it("refuses a connection that would loop the workflow", async () => {
    const ctx = renderBoard({
      ...twoNodes,
      workflow: {
        nodes: [],
        edges: [{ from: "s0", to: "c0", type: "generates" }],
      },
    });
    // c0 -> s0 would close the loop; the only lawful direction between them
    // is the one already present.
    await user().click(screen.getByTestId("workflow-node-c0"));
    await user().click(screen.getByTestId("workflow-connect-s0"));
    expect(ctx.addEdge).not.toHaveBeenCalled();
  });

  it("unlinks ONE edge and leaves the artifacts and other edges alone", async () => {
    // One script feeding two figures. Unlinking it from the first must not
    // touch the second, and must not delete the script.
    const ctx = renderBoard({
      charts: [{ id: "c0", caption: "One" }, { id: "c1", caption: "Two" }],
      scripts: [{ id: "s0", readme: "plot.py" }],
      workflow: {
        nodes: [],
        edges: [
          { from: "s0", to: "c0", type: "generates" },
          { from: "s0", to: "c1", type: "generates" },
        ],
      },
    });
    await user().click(screen.getByTestId("workflow-node-s0"));
    await user().click(screen.getByTestId("workflow-unlink-s0-c0"));

    expect(ctx.unlink).toHaveBeenCalledTimes(1);
    expect(ctx.unlink).toHaveBeenCalledWith("s0", "c0");
    expect(ctx.del).toBe(noop); // nothing deletes an artifact from here
  });

  it("shows one artifact serving several figures as several connections", async () => {
    renderBoard({
      charts: [{ id: "c0", caption: "One" }, { id: "c1", caption: "Two" }],
      scripts: [{ id: "s0", readme: "plot.py" }],
      workflow: {
        nodes: [],
        edges: [
          { from: "s0", to: "c0", type: "generates" },
          { from: "s0", to: "c1", type: "generates" },
        ],
      },
    });
    await user().click(screen.getByTestId("workflow-node-s0"));
    const list = screen.getByTestId("workflow-connections");
    expect(within(list).getByTestId("workflow-unlink-s0-c0")).toBeInTheDocument();
    expect(within(list).getByTestId("workflow-unlink-s0-c1")).toBeInTheDocument();
  });
});

// Editing a node is not a new surface. It opens the artifact's OWN Curator
// form, with the fields and validation the rest of the Curator already uses.
describe("editing a node", () => {
  afterEach(() => jest.resetAllMocks());

  it.each([
    ["c0", "chart", "charts", { charts: [{ id: "c0", caption: "Figure one" }] }],
    ["s0", "script", "scripts", { scripts: [{ id: "s0", readme: "plot.py" }] }],
    ["d0", "dataset", "datasets", { datasets: [{ id: "d0", readme: "traj" }] }],
    ["t0", "tool", "tools", { tools: [{ id: "t0", packageName: "numpy" }] }],
  ])("opens the real %s form seeded with the record", async (id, kind, list, state) => {
    const helpers = buildHelpers();
    renderBoard(state, helpers);
    await user().click(screen.getByTestId(`workflow-edit-${id}`));

    // Seeded with the ACTUAL artifact, so the form edits it rather than
    // creating a second one.
    expect(helpers.setDefault).toHaveBeenCalledWith(kind, state[list][0]);
    expect(helpers.openForm).toHaveBeenCalledWith(kind);
  });

  it("opens the external-data dialog for a head, through the same def slot", async () => {
    const helpers = buildHelpers();
    const head = { id: "h0", label: "Materials Project" };
    renderBoard({ heads: [head] }, helpers);
    await user().click(screen.getByTestId("workflow-edit-h0"));

    expect(helpers.setDefault).toHaveBeenCalledWith("head", head);
    expect(helpers.setExternalNodeFormOpen).toHaveBeenCalledWith(true);
    // External data has no SECTION form -- it must not try to open one.
    expect(helpers.openForm).not.toHaveBeenCalled();
  });

  it("creates nothing by opening an edit form", async () => {
    const helpers = buildHelpers();
    const ctx = renderBoard(
      { charts: [{ id: "c0", caption: "Figure one" }] },
      helpers
    );
    await user().click(screen.getByTestId("workflow-edit-c0"));
    expect(ctx.addMany).not.toHaveBeenCalled();
    expect(ctx.addEdge).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
  });
});

// One Dataset, Script or Tool often serves several figures. The right move is
// to connect the one already in the paper, not to add a second that means the
// same thing.
describe("attach existing", () => {
  afterEach(() => jest.resetAllMocks());

  const paper = {
    charts: [{ id: "c0", caption: "Figure one" }],
    scripts: [{ id: "s0", readme: "plot.py" }],
    datasets: [{ id: "d0", readme: "trajectory" }],
  };

  it("offers only artifacts the selection can lawfully join", async () => {
    renderBoard(paper);
    await user().click(screen.getByTestId("workflow-node-s0"));
    const panel = screen.getByTestId("workflow-attach");
    // A script can take a dataset and can produce a chart...
    expect(within(panel).getByTestId("workflow-attach-d0")).toBeInTheDocument();
    expect(within(panel).getByTestId("workflow-attach-c0")).toBeInTheDocument();
    // ...and never itself.
    expect(
      within(panel).queryByTestId("workflow-attach-s0")
    ).not.toBeInTheDocument();
  });

  it("connects the existing artifact instead of duplicating it", async () => {
    const ctx = renderBoard(paper);
    await user().click(screen.getByTestId("workflow-node-s0"));
    await user().click(screen.getByTestId("workflow-attach-d0"));

    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: "d0",
      to: "s0",
      type: "consumes",
    });
    // THE POINT: no second dataset was created.
    expect(ctx.addMany).not.toHaveBeenCalled();
  });

  it("creates nothing merely by showing the list", async () => {
    const ctx = renderBoard(paper);
    await user().click(screen.getByTestId("workflow-node-s0"));
    expect(screen.getByTestId("workflow-attach")).toBeInTheDocument();
    expect(ctx.addMany).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("stops offering an artifact once it is attached", async () => {
    renderBoard({
      ...paper,
      workflow: {
        nodes: [],
        edges: [{ from: "d0", to: "s0", type: "consumes" }],
      },
    });
    await user().click(screen.getByTestId("workflow-node-s0"));
    const panel = screen.getByTestId("workflow-attach");
    expect(
      within(panel).queryByTestId("workflow-attach-d0")
    ).not.toBeInTheDocument();
    expect(within(panel).getByTestId("workflow-attach-c0")).toBeInTheDocument();
  });

  it("lets one dataset serve a second script without copying it", async () => {
    const ctx = renderBoard({
      scripts: [
        { id: "s0", readme: "plot.py" },
        { id: "s1", readme: "fit.py" },
      ],
      datasets: [{ id: "d0", readme: "trajectory" }],
      workflow: {
        nodes: [],
        edges: [{ from: "d0", to: "s0", type: "consumes" }],
      },
    });
    await user().click(screen.getByTestId("workflow-node-s1"));
    await user().click(screen.getByTestId("workflow-attach-d0"));

    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: "d0",
      to: "s1",
      type: "consumes",
    });
    expect(ctx.addMany).not.toHaveBeenCalled();
  });
});

// An external node references data held somewhere else. It must say what it
// points at, and must never look like a local Dataset.
describe("what an external data node shows", () => {
  it("shows its label, link and short note", () => {
    renderBoard({
      heads: [{
        id: "h0",
        label: "Materials Project mp-21276",
        readme: "Band structure used as the reference calculation.",
        URLs: ["https://materialsproject.org/materials/mp-21276"],
      }],
    });
    expect(screen.getByTestId("workflow-node-h0")).toHaveTextContent(
      "Materials Project mp-21276"
    );
    expect(screen.getByTestId("workflow-external-url-h0")).toHaveAttribute(
      "href",
      "https://materialsproject.org/materials/mp-21276"
    );
    expect(screen.getByTestId("workflow-external-note-h0")).toHaveTextContent(
      /band structure used as the reference/i
    );
  });

  it("still shows a legacy head that has no label and an http link", () => {
    // Old records are valid. They fall back to their note for a name, and
    // their link is displayed as stored.
    renderBoard({
      heads: [{ id: "h0", readme: "Reference data from a collaborator",
                URLs: ["http://example.org/data"] }],
    });
    expect(screen.getByTestId("workflow-node-h0")).toHaveTextContent(
      /reference data from a collaborator/i
    );
    expect(screen.getByTestId("workflow-external-url-h0")).toHaveAttribute(
      "href",
      "http://example.org/data"
    );
  });

  it("shows no link at all for a stored local path", () => {
    // Publishing a path from somebody's machine is not a reference anybody
    // can follow, and says more about their filesystem than they meant.
    renderBoard({
      heads: [{ id: "h0", label: "Local copy",
                URLs: ["/home/curator/private/data.h5"] }],
    });
    expect(screen.getByTestId("workflow-node-h0")).toHaveTextContent("Local copy");
    expect(
      screen.queryByTestId("workflow-external-url-h0")
    ).not.toBeInTheDocument();
  });

  it("names an external node with no label and no note by what it is", () => {
    renderBoard({ heads: [{ id: "h0", URLs: [] }] });
    expect(screen.getByTestId("workflow-node-h0")).toHaveTextContent(
      /external data \(h0\)/i
    );
  });
});

describe("nodes that are not connected to anything", () => {
  afterEach(() => jest.resetAllMocks());

  it("lists them rather than hiding them", () => {
    // A dataset nobody has linked yet is a normal mid-curation state.
    renderBoard({
      datasets: [{ id: "d0", readme: "trajectory" }],
      charts: [{ id: "c0", caption: "Figure one" }],
      scripts: [{ id: "s0", readme: "plot.py" }],
      workflow: {
        nodes: [],
        edges: [{ from: "s0", to: "c0", type: "generates" }],
      },
    });
    const unlinked = screen.getByTestId("workflow-unlinked");
    expect(within(unlinked).getByTestId("workflow-unlinked-d0")).toBeInTheDocument();
    expect(
      within(unlinked).queryByTestId("workflow-unlinked-s0")
    ).not.toBeInTheDocument();
  });

  it("says nothing at all when everything is connected", () => {
    renderBoard({
      charts: [{ id: "c0", caption: "One" }],
      scripts: [{ id: "s0", readme: "plot.py" }],
      workflow: {
        nodes: [],
        edges: [{ from: "s0", to: "c0", type: "generates" }],
      },
    });
    expect(screen.queryByTestId("workflow-unlinked")).not.toBeInTheDocument();
  });
});

describe("what a node is called", () => {
  it("uses the artifact's own title", () => {
    renderBoard({
      charts: [{ id: "c0", caption: "Density of states" }],
      heads: [{ id: "h0", label: "Materials Project" }],
      tools: [{ id: "t0", packageName: "numpy" }],
    });
    expect(screen.getByTestId("workflow-node-c0")).toHaveTextContent(
      "Density of states"
    );
    expect(screen.getByTestId("workflow-node-h0")).toHaveTextContent(
      "Materials Project"
    );
    expect(screen.getByTestId("workflow-node-t0")).toHaveTextContent("numpy");
  });

  it("never renders an empty chip for a brand-new draft", () => {
    // A node just created has no title yet. It says what it is and which one
    // it is, rather than showing nothing.
    renderBoard({ charts: [{ id: "c0", caption: "" }] });
    expect(screen.getByTestId("workflow-node-c0")).toHaveTextContent(
      /untitled chart \(c0\)/i
    );
  });
});

describe("keyboard and layout", () => {
  afterEach(() => jest.resetAllMocks());

  it("selects a node from the keyboard alone", async () => {
    renderBoard({ charts: [{ id: "c0", caption: "Figure one" }] });
    const node = screen.getByTestId("workflow-node-c0");
    node.focus();
    expect(node).toHaveFocus();
    await user().keyboard("{Enter}");
    expect(node).toHaveAttribute("aria-pressed", "true");
  });

  it("gives each lane an accessible list, so its size is announced", () => {
    renderBoard({ charts: [{ id: "c0", caption: "One" }] });
    expect(
      screen.getByRole("list", { name: /outputs nodes/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: /inputs nodes/i })
    ).toBeInTheDocument();
  });

  it("stacks nodes in a column so they cannot overlap on a narrow screen", () => {
    renderBoard({
      datasets: [{ id: "d0", readme: "one" }, { id: "d1", readme: "two" }],
    });
    const list = screen.getByRole("list", { name: /inputs nodes/i });
    const style = window.getComputedStyle(list);
    expect(style.display).toBe("flex");
    expect(style.flexDirection).toBe("column");
    expect(parseFloat(style.gap)).toBeGreaterThan(0);
  });
});
