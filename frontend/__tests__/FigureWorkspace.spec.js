/**
 * The figure-first Curator workspace.
 *
 * It replaces four top-level sections that asked a curator to think in Qresp's
 * storage categories -- Add Charts, Add Tools, Add Datasets, Add Scripts --
 * and then connect them separately. The tests below are mostly about two
 * claims: the figure is the root, and every form opened here is the EXISTING
 * form on the EXISTING model.
 */
import { useContext, useEffect, useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
import axios from "axios";

// The real forms mount inside the workspace for their dialogs. They pull in
// file-tree and RCC machinery that has nothing to do with these assertions,
// so they are stubbed to the one thing that matters here: they must be
// rendered with their own trigger hidden.
jest.mock("../components/CuratorForms/ChartsInfoForm", () => {
  const Stub = (props) => <div data-testid="stub-chart-form" data-hidden={String(!!props.hideTrigger)} />;
  return Stub;
});
jest.mock("../components/CuratorForms/ScriptsInfoForm", () => {
  const Stub = (props) => <div data-testid="stub-script-form" data-hidden={String(!!props.hideTrigger)} />;
  return Stub;
});
jest.mock("../components/CuratorForms/DatasetsInfoForm", () => {
  const Stub = (props) => <div data-testid="stub-dataset-form" data-hidden={String(!!props.hideTrigger)} />;
  return Stub;
});
jest.mock("../components/CuratorForms/ToolsInfoForm", () => {
  const Stub = (props) => <div data-testid="stub-tool-form" data-hidden={String(!!props.hideTrigger)} />;
  return Stub;
});
jest.mock("../components/CuratorForms/WorkflowInfoForm", () => {
  const Stub = (props) => (
    <div
      data-testid="stub-external-form"
      data-dialog-only={String(!!props.dialogOnly)}
    />
  );
  return Stub;
});
jest.mock("../components/CuratorElements/FolderAnalysis", () => {
  const { useMemo } = jest.requireActual("react");
  let mounted = 0;
  const Stub = (props) => {
    const instance = useMemo(() => String((mounted += 1)), []);
    return (
      <div
        data-testid="stub-folder-analysis"
        data-type={props.artifactType || ""}
        data-hidden={String(!!props.hideTrigger)}
        data-auto={String(!!props.autoOpen)}
        data-connection={
          props.connection
            ? `${props.connection.mode}:${props.connection.sourceArtifactId || ""}`
            : "none"
        }
        data-instance={instance}
      />
    );
  };
  return Stub;
});

import CuratorContext from "../Context/Curator/curatorContext";
import CuratorHelperContext from "../Context/CuratorHelpers/curatorHelperContext";
import SpotlightState from "../Context/Spotlight/SpotlightState";
import CuratorState from "../Context/Curator/CuratorState";
import FigureWorkspace from "../components/CuratorElements/FigureWorkspace";

const build = (overrides = {}) => ({
  charts: [],
  scripts: [],
  datasets: [],
  tools: [],
  heads: [],
  workflow: { nodes: [], edges: [] },
  addEdge: jest.fn(),
  addMany: jest.fn(),
  unlink: jest.fn(),
  del: jest.fn(),
  ...overrides,
});

const buildHelpers = () => ({
  openForm: jest.fn(),
  setDefault: jest.fn(),
  setExternalNodeFormOpen: jest.fn(),
});

// The real spotlight provider, not a stand-in: what it does under a pointer
// -- re-render the rows and nothing above them -- is half of what is being
// tested here.
const Host = ({ helpers, curator }) => (
  <CuratorHelperContext.Provider value={helpers}>
    <SpotlightState>
      <CuratorContext.Provider value={curator}>
        <FigureWorkspace />
      </CuratorContext.Provider>
    </SpotlightState>
  </CuratorHelperContext.Provider>
);

// Rows are COMPACT until asked. A test about what a row contains opens it
// the way a curator does; a test about the default does not call this.
const openAllRows = () =>
  screen
    .queryAllByTestId(/^fw-state-/)
    .filter((el) => el.tagName === "BUTTON")
    .forEach((el) => fireEvent.click(el));

const renderWorkspace = (overrides = {}, helpers = buildHelpers()) => {
  const value = build(overrides);
  const view = render(<Host helpers={helpers} curator={value} />);
  const rerenderWith = (next) =>
    view.rerender(
      <Host
        helpers={helpers}
        curator={build({
          ...overrides,
          ...next,
          addEdge: value.addEdge,
          unlink: value.unlink,
          del: value.del,
        })}
      />
    );
  return { ...value, helpers, rerenderWith };
};

const user = () => userEvent.setup({ delay: null });

const FIGURE = { id: "c0", caption: "Density of states" };
const SCRIPT = { id: "s0", readme: "plot_dos.py" };

// ---- walking the one control -------------------------------------------
//
// "New resource" and a row's "Link" ask one question at a time. These helpers walk it
// so a test can say what it is about instead of re-describing the menu.
const openFlowFor = async (u, id) => {
  await u.click(screen.getByTestId(id ? `fw-linkmenu-${id}` : "fw-new-resource"));
  return screen.findByTestId("fw-flow-menu");
};
const openManualKinds = async (u, id) => {
  await openFlowFor(u, id);
  await u.hover(screen.getByTestId("fw-source-manual"));
  return screen.findByTestId("fw-kind-menu");
};
const openRccKinds = async (u, id) => {
  await openFlowFor(u, id);
  await u.hover(screen.getByTestId("fw-source-rcc"));
  return screen.findByTestId("fw-kind-menu");
};
const addManually = async (u, id, kind) => {
  await openManualKinds(u, id);
  await u.click(screen.getByTestId(`fw-add-${id}-${kind}`));
};
const openLinkFor = async (u, id) => {
  await openFlowFor(u, id);
  await u.click(screen.getByTestId(`fw-link-${id}`));
  return screen.findByTestId("fw-link-dialog");
};

const CHAIN = {
  charts: [FIGURE],
  scripts: [SCRIPT],
  datasets: [{ id: "d0", readme: "spectra" }],
  tools: [{ id: "t0", packageName: "numpy" }],
  workflow: {
    nodes: [],
    edges: [
      { from: "s0", to: "c0", type: "generates" },
      { from: "d0", to: "s0", type: "consumes" },
      { from: "t0", to: "s0", type: "uses_tool" },
    ],
  },
};

describe("the workspace", () => {
  afterEach(() => jest.resetAllMocks());

  it("is one section, headed for figures and resources", () => {
    renderWorkspace();
    expect(
      screen.getAllByRole("heading", { name: /organize figures and resources/i })
        .length
    ).toBeGreaterThan(0);
  });

  it("mounts the real forms with their own triggers hidden", () => {
    renderWorkspace();
    ["chart", "script", "dataset", "tool"].forEach((kind) =>
      expect(screen.getByTestId(`stub-${kind}-form`)).toHaveAttribute(
        "data-hidden",
        "true"
      )
    );
    // The External Data dialog belongs to "Build your workflow", which is
    // mounted unconditionally now -- so this section does not mount a second
    // copy of it.
    expect(screen.queryByTestId("stub-external-form")).not.toBeInTheDocument();
  });

  it("offers one way in to an independent resource", () => {
    renderWorkspace();
    expect(screen.getByTestId("fw-new-resource")).toHaveTextContent(
      /^new resource$/i
    );
    // No action anywhere on the page still offers to "add or link".
    expect(document.body.textContent).not.toMatch(/add or link/i);
  });
});

describe("the three actions on a row", () => {
  afterEach(() => jest.resetAllMocks());

  it("keeps them together and always visible", () => {
    renderWorkspace(CHAIN);
    ["c0", "s0", "d0", "t0"].forEach((id) => {
      const group = within(screen.getByTestId(`fw-actions-${id}`));
      expect(group.getByTestId(`fw-linkmenu-${id}`)).toBeInTheDocument();
      expect(group.getByTestId(`fw-edit-${id}`)).toBeInTheDocument();
      expect(group.getByTestId(`fw-remove-${id}`)).toBeInTheDocument();
    });
  });

  it("no longer hides Edit and Remove behind a menu somewhere else", () => {
    renderWorkspace(CHAIN);
    expect(screen.queryByTestId("fw-more-c0")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fw-more-menu")).not.toBeInTheDocument();
  });

  it("opens the artifact's own form to edit it", async () => {
    const u = user();
    const ctx = renderWorkspace(CHAIN);
    await u.click(screen.getByTestId("fw-edit-s0"));
    expect(ctx.helpers.setDefault).toHaveBeenCalledWith("script", SCRIPT);
    expect(ctx.helpers.openForm).toHaveBeenCalledWith("script");
  });

  it("removes through the existing delete path", async () => {
    const u = user();
    const ctx = renderWorkspace(CHAIN);
    await u.click(screen.getByTestId("fw-remove-c0"));
    expect(ctx.del).toHaveBeenCalledWith("chart", "c0");
  });

  it("names each action for a screen reader", () => {
    renderWorkspace(CHAIN);
    expect(
      screen.getByRole("button", { name: "Edit plot_dos.py" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove plot_dos.py" })
    ).toBeInTheDocument();
  });

  it("lists a shared artifact exactly once", () => {
    // A tree had to draw the same script under each figure it made, or cut
    // an edge. A flat list has neither problem: one artifact, one row, and
    // both of its arrows on it.
    renderWorkspace({
      charts: [FIGURE, { id: "c1", caption: "Band structure" }],
      scripts: [SCRIPT],
      workflow: {
        nodes: [],
        edges: [
          { from: "s0", to: "c0", type: "generates" },
          { from: "s0", to: "c1", type: "generates" },
        ],
      },
    });
    openAllRows();
    expect(screen.getAllByTestId("fw-node-s0")).toHaveLength(1);
    expect(screen.getAllByTestId("fw-actions-s0")).toHaveLength(1);
    const row = within(screen.getByTestId("fw-node-s0"));
    expect(row.getByTestId("fw-unlink-s0-c0")).toBeInTheDocument();
    expect(row.getByTestId("fw-unlink-s0-c1")).toBeInTheDocument();
  });
});

describe("add or link, one question at a time", () => {
  afterEach(() => jest.resetAllMocks());

  it("offers linking and the two ways in, and no Add new step", async () => {
    const u = user();
    renderWorkspace({ charts: [FIGURE], fileServerPath: "/proj" });
    await openFlowFor(u, "c0");

    expect(screen.getByTestId(`fw-link-c0`)).toHaveTextContent(/link existing/i);
    expect(screen.getByTestId("fw-source-manual")).toHaveTextContent(
      /enter manually/i
    );
    expect(screen.getByTestId("fw-source-rcc")).toHaveTextContent(/from rcc/i);
    // "Add new" asked nothing: every path under it led to these same two.
    expect(screen.queryByTestId("fw-flow-new")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Add new/)).not.toBeInTheDocument();
  });

  it("asks HOW it arrives before WHAT it is", async () => {
    const u = user();
    renderWorkspace({ fileServerPath: "/proj" });
    await openFlowFor(u, "");
    // The first pane asks HOW. The kinds live in the branch, never in it --
    // opening the menu focuses its first item, and focus opens the branch,
    // which is the behaviour a keyboard needs.
    const root = within(screen.getAllByTestId("fw-flow-menu")[0]);
    expect(root.queryByTestId("fw-add--chart")).not.toBeInTheDocument();
    expect(root.getByTestId("fw-source-manual")).toBeInTheDocument();

    await u.hover(screen.getByTestId("fw-source-manual"));
    const kinds = within(await screen.findByTestId("fw-kind-menu"));
    ["chart", "dataset", "script", "tool", "head"].forEach((kind) =>
      expect(kinds.getByTestId(`fw-add--${kind}`)).toBeInTheDocument()
    );
  });

  it("opens the branch on hover alone, with no click", async () => {
    const u = user();
    renderWorkspace({ fileServerPath: "/proj" });
    await openFlowFor(u, "");
    await u.hover(screen.getByTestId("fw-source-rcc"));
    expect(await screen.findByTestId("fw-kind-menu")).toBeInTheDocument();
  });

  it("keeps the branch open while the pointer crosses into it", async () => {
    // The pointer has to cross a gap to reach the child; a branch that
    // closed on mouseleave closed underneath it every time.
    const u = user();
    renderWorkspace({ fileServerPath: "/proj" });
    await openFlowFor(u, "");
    await u.hover(screen.getByTestId("fw-source-manual"));
    const branch = await screen.findByTestId("fw-kind-menu");

    await u.unhover(screen.getByTestId("fw-source-manual"));
    await u.hover(within(branch).getByTestId("fw-add--script"));
    expect(screen.getByTestId("fw-kind-menu")).toBeInTheDocument();
  });

  it("lets the pointer go back and pick the OTHER way in", async () => {
    // A Menu is a Modal, and its backdrop swallows the pointer. With the
    // branch open, the parent's other item could not be reached at all.
    const u = user();
    renderWorkspace({ fileServerPath: "/proj" });
    await openFlowFor(u, "");

    await u.hover(screen.getByTestId("fw-source-manual"));
    expect(
      within(await screen.findByTestId("fw-kind-menu")).getByTestId(
        "fw-add--head"
      )
    ).toBeInTheDocument();

    await u.hover(screen.getByTestId("fw-source-rcc"));
    const rcc = within(await screen.findByTestId("fw-kind-menu"));
    expect(rcc.getByTestId("fw-rcc-chart")).toBeInTheDocument();
    // External data is not something a folder can be scanned for.
    expect(rcc.queryByTestId("fw-rcc-head")).not.toBeInTheDocument();
  });

  it("keeps the parent pane open beside the child", async () => {
    const u = user();
    renderWorkspace({ fileServerPath: "/proj" });
    await openFlowFor(u, "");
    await u.hover(screen.getByTestId("fw-source-manual"));
    await screen.findByTestId("fw-kind-menu");

    expect(screen.getAllByTestId("fw-flow-menu")[0]).toBeInTheDocument();
    expect(screen.getByTestId("fw-source-manual")).toBeInTheDocument();
  });

  it("anchors to the control that was pressed, not to the page", async () => {
    // Stored as a testid and looked up live: an element captured from the
    // event goes stale on the next render, and MUI then falls back to the
    // top left of the screen.
    const u = user();
    renderWorkspace({ charts: [FIGURE], scripts: [SCRIPT] });
    await openFlowFor(u, "s0");
    // The menu is built for THIS row: its Link item names s0.
    expect(screen.getByTestId("fw-link-s0")).toBeInTheDocument();
    expect(screen.queryByTestId("fw-link-c0")).not.toBeInTheDocument();
  });

  it("opens and closes a branch from the keyboard", async () => {
    const u = user();
    renderWorkspace({ fileServerPath: "/proj" });
    await openFlowFor(u, "");

    screen.getByTestId("fw-source-manual").focus();
    await u.keyboard("{ArrowRight}");
    expect(await screen.findByTestId("fw-kind-menu")).toBeInTheDocument();

    screen.getByTestId("fw-source-manual").focus();
    await u.keyboard("{ArrowLeft}");
    await waitFor(() =>
      expect(screen.queryByTestId("fw-kind-menu")).not.toBeInTheDocument()
    );
  });

  it("creates by hand through the existing form", async () => {
    const u = user();
    const ctx = renderWorkspace();
    await addManually(u, "", "chart");

    expect(ctx.helpers.setDefault).toHaveBeenCalledWith("chart", null);
    // Opened with an EXPLICIT independent intent, never an absent one.
    expect(ctx.helpers.openForm).toHaveBeenCalledWith("chart", { mode: "independent" });
    expect(ctx.addEdge).not.toHaveBeenCalled();
  });

  it("sends External data to its own form", async () => {
    const u = user();
    const ctx = renderWorkspace({ fileServerPath: "/proj" });
    await addManually(u, "", "head");

    expect(ctx.helpers.setExternalNodeFormOpen).toHaveBeenCalledWith(
      true,
      { mode: "independent" }
    );
    expect(ctx.helpers.openForm).not.toHaveBeenCalledWith("head");
  });

  it("hands the form the row it was opened from, and guesses nothing after",
     async () => {
    // It used to wait for the saved record to appear and then INFER an
    // arrow for it. The row's intent now travels with the form instead, and
    // the form makes the record and its chosen arrow in one change -- see
    // RowScopedLink.spec.js. Nothing is added here when a record appears.
    const u = user();
    const ctx = renderWorkspace({ charts: [FIGURE] });
    await addManually(u, "c0", "script");

    expect(ctx.helpers.openForm).toHaveBeenCalledWith("script", {
      mode: "row-scoped-link",
      sourceArtifactId: "c0",
      sourceKind: "c",
      sourceLabel: "Density of states",
    });
    ctx.rerenderWith({ charts: [FIGURE], scripts: [SCRIPT] });
    expect(ctx.addEdge).not.toHaveBeenCalled();
  });

  it("connects nothing when the form was cancelled", async () => {
    const u = user();
    const ctx = renderWorkspace({ charts: [FIGURE] });
    await addManually(u, "c0", "script");
    ctx.rerenderWith({ charts: [FIGURE] });
    expect(ctx.addEdge).not.toHaveBeenCalled();
  });
});

describe("importing from RCC", () => {
  afterEach(() => jest.resetAllMocks());

  it("offers only the four kinds a folder can be scanned for", async () => {
    const u = user();
    renderWorkspace({ fileServerPath: "/proj" });
    const kinds = within(await openRccKinds(u, ""));

    ["chart", "dataset", "script", "tool"].forEach((kind) =>
      expect(kinds.getByTestId(`fw-rcc-${kind}`)).toBeInTheDocument()
    );
    // External data is a URL somebody types.
    expect(kinds.queryByTestId("fw-rcc-head")).not.toBeInTheDocument();
  });

  it("opens the existing typed flow for the chosen kind", async () => {
    const u = user();
    renderWorkspace({ fileServerPath: "/proj" });
    await openRccKinds(u, "");
    await u.click(screen.getByTestId("fw-rcc-tool"));

    const importer = screen.getByTestId("stub-folder-analysis");
    expect(importer).toHaveAttribute("data-type", "tool");
    expect(importer).toHaveAttribute("data-connection", "independent:");
    expect(importer).toHaveAttribute("data-hidden", "true");
    expect(importer).toHaveAttribute("data-auto", "true");
  });

  it("disables only RCC when no folder is chosen, and says why", async () => {
    const u = user();
    renderWorkspace({ fileServerPath: "" });
    await openFlowFor(u, "");

    expect(screen.getByTestId("fw-source-rcc")).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(screen.getByTestId("fw-rcc-hint")).toHaveTextContent(
      /choose a file server path above, in this page/i
    );
    // Entering by hand is unaffected.
    expect(screen.getByTestId("fw-source-manual")).not.toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });

  it("drops the explanation once a folder is chosen", async () => {
    const u = user();
    renderWorkspace({ fileServerPath: "/proj" });
    await openFlowFor(u, "");
    expect(screen.queryByTestId("fw-rcc-hint")).not.toBeInTheDocument();
  });

  it("asks the network nothing while rendering", async () => {
    const u = user();
    renderWorkspace({ fileServerPath: "/proj" });
    await openRccKinds(u, "");
    expect(axios.get).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("puts imported artifacts in the draft, linkable at once", async () => {
    const u = user();
    const ctx = renderWorkspace({ fileServerPath: "/proj" });
    ctx.rerenderWith({
      fileServerPath: "/proj",
      charts: [{ id: "c0", caption: "Imported figure" }],
      scripts: [{ id: "s0", readme: "imported.py" }],
      datasets: [{ id: "d0", readme: "imported data" }],
      tools: [{ id: "t0", packageName: "numpy" }],
    });

    const list = within(screen.getByTestId("fw-resources"));
    ["c0", "s0", "d0", "t0"].forEach((id) => {
      expect(list.getByTestId(`fw-node-${id}`)).toBeInTheDocument();
      expect(list.getByTestId(`fw-state-${id}`)).toHaveTextContent(
        "Not connected"
      );
    });

    await openLinkFor(u, "s0");
    await u.click(screen.getByTestId("fw-link-option-s0-c0"));
    await u.click(screen.getByTestId("fw-link-apply"));
    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: "s0",
      to: "c0",
      type: "links_to",
    });
  });
});

describe("drawing an arrow between any two resources", () => {
  afterEach(() => jest.resetAllMocks());

  const PAIR = {
    charts: [FIGURE],
    scripts: [SCRIPT],
    datasets: [{ id: "d0", readme: "spectra" }],
    tools: [{ id: "t0", packageName: "numpy" }],
    heads: [{ id: "h0", URLs: ["https://example.org/set"] }],
  };

  it("names the source and asks which way the arrow points", async () => {
    const u = user();
    renderWorkspace(PAIR);
    await openLinkFor(u, "s0");

    expect(screen.getByTestId("fw-dir-out")).toHaveTextContent(
      "plot_dos.py → selected"
    );
    expect(screen.getByTestId("fw-dir-in")).toHaveTextContent(
      "selected → plot_dos.py"
    );
  });

  it("lists every other artifact once, with no relationship words", async () => {
    const u = user();
    renderWorkspace(PAIR);
    const dialog = within(await openLinkFor(u, "s0"));

    ["c0", "d0", "t0", "h0"].forEach((other) =>
      expect(dialog.getByTestId(`fw-link-option-s0-${other}`)).toBeInTheDocument()
    );
    const text = screen.getByTestId("fw-link-dialog").textContent;
    [
      "Workflow connection",
      "Related Datasets",
      "generates",
      "supplies input to",
      "uses tool",
      "feeds into",
      "related to",
    ].forEach((phrase) => expect(text).not.toContain(phrase));
  });

  it("makes Script -> Dataset, which the old rules forbade", async () => {
    const u = user();
    const ctx = renderWorkspace(PAIR);
    await openLinkFor(u, "s0");
    await u.click(screen.getByTestId("fw-link-option-s0-d0"));
    await u.click(screen.getByTestId("fw-link-apply"));

    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: "s0",
      to: "d0",
      type: "links_to",
    });
  });

  it("makes Dataset -> Script from the same dialog, flipped", async () => {
    const u = user();
    const ctx = renderWorkspace(PAIR);
    await openLinkFor(u, "s0");
    await u.click(screen.getByTestId("fw-dir-in"));
    await u.click(screen.getByTestId("fw-link-option-d0-s0"));
    await u.click(screen.getByTestId("fw-link-apply"));

    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: "d0",
      to: "s0",
      type: "links_to",
    });
  });

  // ONE KIND PER TEST, not five in a loop.
  //
  // As a single case this rendered the whole workspace five times and drove
  // five dialogs, which took 5.4s of a 5s budget -- so it passed or failed
  // depending on the machine, and it had started failing on this one. Split,
  // each runs in about a second, and a failure names the kind that broke
  // instead of the whole matrix.
  const EVERY_KIND = ["c0", "s0", "d0", "t0", "h0"];

  it.each(EVERY_KIND)("offers every other artifact to %s", async (source) => {
    const u = user();
    renderWorkspace(PAIR);
    await openLinkFor(u, source);

    EVERY_KIND.filter((other) => other !== source).forEach((other) =>
      expect(
        screen.getByTestId(`fw-link-option-${source}-${other}`)
      ).toBeInTheDocument()
    );
    // Never itself.
    expect(
      screen.queryByTestId(`fw-link-option-${source}-${source}`)
    ).not.toBeInTheDocument();
  });

  it("links several targets at once without copying anything", async () => {
    const u = user();
    const ctx = renderWorkspace(PAIR);
    await openLinkFor(u, "s0");
    await u.click(screen.getByTestId("fw-link-option-s0-c0"));
    await u.click(screen.getByTestId("fw-link-option-s0-d0"));
    await u.click(screen.getByTestId("fw-link-apply"));

    expect(ctx.addEdge).toHaveBeenCalledTimes(2);
    expect(ctx.helpers.openForm).not.toHaveBeenCalled();
    expect(ctx.helpers.setDefault).not.toHaveBeenCalled();
  });

  it("shows an arrow already drawn as ticked, and lets it be unticked", async () => {
    // The box is the state a curator WANTS, not a report of what is. Greying
    // it out made the one place for managing a resource's connections the
    // one place they could not undo one.
    const u = user();
    renderWorkspace({
      ...PAIR,
      workflow: { nodes: [], edges: [{ from: "s0", to: "d0", type: "links_to" }] },
    });
    await openLinkFor(u, "s0");

    const made = screen.getByTestId("fw-link-option-s0-d0");
    expect(made).toBeChecked();
    expect(made).toBeEnabled();
    expect(screen.getByTestId("fw-link-dialog")).not.toHaveTextContent(
      /already linked/i
    );
  });

  it("still offers the opposite arrow, which is a different fact", async () => {
    const u = user();
    const ctx = renderWorkspace({
      ...PAIR,
      workflow: { nodes: [], edges: [{ from: "s0", to: "d0", type: "links_to" }] },
    });
    await openLinkFor(u, "s0");
    await u.click(screen.getByTestId("fw-dir-in"));

    const back = screen.getByTestId("fw-link-option-d0-s0");
    expect(back).toBeEnabled();
    expect(back).not.toBeChecked();
    await u.click(back);
    await u.click(screen.getByTestId("fw-link-apply"));
    // It closes a loop, so it is asked about rather than refused.
    await u.click(await screen.findByTestId("fw-loop-confirm"));
    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: "d0",
      to: "s0",
      type: "links_to",
      feedback: true,
    });
  });

  it("reads an existing association as a two-headed arrow it can undo", async () => {
    const u = user();
    const ctx = renderWorkspace({
      charts: [FIGURE, { id: "c1", caption: "Band structure" }],
      workflow: { nodes: [], edges: [{ from: "c1", to: "c0", type: "related_to" }] },
    });
    await openLinkFor(u, "c0");

    const row = screen.getByTestId("fw-link-option-c1-c0-related_to");
    expect(screen.getByTestId("fw-link-both-c1-c0-related_to")).toHaveTextContent(
      "↔"
    );
    expect(row).toBeChecked();
    expect(row).toBeEnabled();

    // Removed in the orientation the record holds, not the one being read.
    await u.click(row);
    await u.click(screen.getByTestId("fw-link-apply"));
    expect(ctx.unlink).toHaveBeenCalledWith("c1", "c0");
  });

  it("makes nothing when the dialog is cancelled", async () => {
    const u = user();
    const ctx = renderWorkspace(PAIR);
    await openLinkFor(u, "s0");
    await u.click(screen.getByTestId("fw-link-option-s0-c0"));
    await u.click(screen.getByTestId("fw-link-cancel"));

    expect(ctx.addEdge).not.toHaveBeenCalled();
    expect(ctx.helpers.openForm).not.toHaveBeenCalled();
    expect(screen.queryByTestId("fw-link-dialog")).not.toBeInTheDocument();
  });

  it("ticks a box without moving or animating anything", async () => {
    const u = user();
    renderWorkspace(PAIR);
    await openLinkFor(u, "s0");

    const before = screen.getByTestId("fw-link-dialog").textContent;
    const box = screen.getByTestId("fw-link-option-s0-c0");
    await u.click(box);

    expect(box).toBeChecked();
    // Nothing appeared, so nothing below it moved.
    expect(screen.getByTestId("fw-link-dialog").textContent).toBe(before);
    // And the same DOM node -- a remount is what flashed.
    expect(screen.getByTestId("fw-link-option-s0-c0")).toBe(box);
    // The one visual affordance that is not decoration: it stays reachable.
    expect(box).not.toBeDisabled();
    expect(box).not.toHaveAttribute("tabindex", "-1");
  });
});

describe("feedback loops", () => {
  afterEach(() => jest.resetAllMocks());

  const closing = {
    charts: [FIGURE],
    scripts: [SCRIPT],
    workflow: { nodes: [], edges: [{ from: "c0", to: "s0", type: "links_to" }] },
  };

  const pickLoop = async (u) => {
    await openLinkFor(u, "s0");
    await u.click(screen.getByTestId("fw-link-option-s0-c0"));
    await u.click(screen.getByTestId("fw-link-apply"));
    return screen.findByTestId("fw-loop-dialog");
  };

  it("asks before making one, and makes nothing yet", async () => {
    const u = user();
    const ctx = renderWorkspace(closing);
    await pickLoop(u);
    expect(ctx.addEdge).not.toHaveBeenCalled();
  });

  it("writes the answer onto the edge it was asked about", async () => {
    const u = user();
    const ctx = renderWorkspace(closing);
    await pickLoop(u);
    await u.click(screen.getByTestId("fw-loop-confirm"));

    expect(ctx.addEdge).toHaveBeenCalledTimes(1);
    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: "s0",
      to: "c0",
      type: "links_to",
      feedback: true,
    });
  });

  it("makes nothing when the curator declines", async () => {
    const u = user();
    const ctx = renderWorkspace(closing);
    await pickLoop(u);
    await u.click(screen.getByTestId("fw-loop-cancel"));
    expect(ctx.addEdge).not.toHaveBeenCalled();
  });

  it("shows the mark as a badge, read back from the record", () => {
    renderWorkspace({
      charts: [FIGURE],
      scripts: [SCRIPT],
      workflow: {
        nodes: [],
        edges: [
          { from: "c0", to: "s0", type: "links_to" },
          { from: "s0", to: "c0", type: "links_to", feedback: true },
        ],
      },
    });
    openAllRows();
    expect(screen.getAllByTestId("fw-feedback-s0-c0")[0]).toHaveTextContent(
      /feedback loop/i
    );
    // The other edge closes the same loop and is NOT marked: nobody said so.
    expect(screen.queryAllByTestId("fw-feedback-c0-s0")).toHaveLength(0);
  });

  it("keeps the mark when the edge that closed the loop is removed", () => {
    const ctx = renderWorkspace({
      charts: [FIGURE],
      scripts: [SCRIPT],
      workflow: {
        nodes: [],
        edges: [
          { from: "c0", to: "s0", type: "links_to" },
          { from: "s0", to: "c0", type: "links_to", feedback: true },
        ],
      },
    });
    openAllRows();
    ctx.rerenderWith({
      workflow: {
        nodes: [],
        edges: [{ from: "s0", to: "c0", type: "links_to", feedback: true }],
      },
    });
    expect(screen.getAllByTestId("fw-feedback-s0-c0")[0]).toBeInTheDocument();
  });

  it("refuses an artifact joined to itself", async () => {
    const u = user();
    renderWorkspace({ charts: [FIGURE], scripts: [SCRIPT] });
    await openLinkFor(u, "s0");
    expect(
      screen.queryByTestId("fw-link-option-s0-s0")
    ).not.toBeInTheDocument();
  });
});

describe("breaking one relationship", () => {
  afterEach(() => jest.resetAllMocks());

  it("is reachable from either end of the arrow", () => {
    // Outgoing under the source, incoming under the target: an arrow you
    // can see but can only undo from the other side is the complaint this
    // answers.
    renderWorkspace(CHAIN);
    openAllRows();
    ["s0-c0", "d0-s0", "t0-s0"].forEach((pair) => {
      expect(screen.getAllByTestId(`fw-flow-${pair}`)).toHaveLength(2);
      expect(screen.getAllByTestId(`fw-unlink-${pair}`)).toHaveLength(2);
    });
  });

  it("names both ends and the relationship, for a screen reader", () => {
    renderWorkspace(CHAIN);
    openAllRows();
    expect(
      screen.getAllByRole("button", {
        name: "Unlink plot_dos.py generates Density of states",
      }).length
    ).toBeGreaterThan(0);
  });

  it("removes one edge of a shared artifact and keeps the rest", () => {
    const ctx = renderWorkspace({
      charts: [FIGURE, { id: "c1", caption: "Band structure" }],
      scripts: [SCRIPT],
      workflow: {
        nodes: [],
        edges: [
          { from: "s0", to: "c0", type: "generates" },
          { from: "s0", to: "c1", type: "generates" },
        ],
      },
    });
    openAllRows();
    fireEvent.click(screen.getAllByTestId("fw-unlink-s0-c1")[0]);

    expect(ctx.unlink).toHaveBeenCalledTimes(1);
    expect(ctx.unlink).toHaveBeenCalledWith("s0", "c1");
    expect(ctx.del).not.toHaveBeenCalled();
    expect(ctx.addEdge).not.toHaveBeenCalled();
  });

  it("is a real button a keyboard can reach", () => {
    renderWorkspace(CHAIN);
    openAllRows();
    const button = screen.getAllByTestId("fw-unlink-s0-c0")[0];
    expect(button.tagName).toBe("BUTTON");
    expect(button).not.toBeDisabled();
  });

  it("can be folded away, leaving the count", async () => {
    const u = user();
    renderWorkspace(CHAIN);
    openAllRows();
    expect(screen.getByTestId("fw-wiring-s0")).toBeInTheDocument();

    await u.click(screen.getByTestId("fw-state-s0"));
    await waitFor(() =>
      expect(screen.queryByTestId("fw-wiring-s0")).not.toBeInTheDocument()
    );
    // The count survives the fold: it is what says there is anything there.
    expect(screen.getByTestId("fw-state-s0")).toHaveTextContent("2 in");
  });
});

describe("what a row says", () => {
  afterEach(() => jest.resetAllMocks());

  it("shows a kind, a name and an arrow, and no vocabulary", () => {
    renderWorkspace(CHAIN);
    openAllRows();
    const text = ["c0", "s0", "d0", "t0"]
      .map((id) => screen.getByTestId(`fw-node-${id}`).textContent)
      .join(" ");
    [
      "Inputs",
      "Process",
      "Generated by",
      "Uses input",
      "generates",
      "supplies input to",
      "uses tool",
      "feeds into",
      "related to",
    ].forEach((phrase) => expect(text).not.toContain(phrase));

    expect(screen.getAllByTestId("fw-flow-s0-c0")[0]).toHaveTextContent("\u2192");
  });

  it("still describes the relationship to a screen reader", () => {
    renderWorkspace(CHAIN);
    openAllRows();
    expect(screen.getAllByTestId("fw-flow-s0-c0")[0]).toHaveAttribute(
      "aria-label",
      "plot_dos.py generates Density of states"
    );
  });

  it("shows an association as a two-headed arrow", () => {
    renderWorkspace({
      charts: [FIGURE, { id: "c1", caption: "Band structure" }],
      workflow: { nodes: [], edges: [{ from: "c0", to: "c1", type: "related_to" }] },
    });
    openAllRows();
    expect(screen.getAllByTestId("fw-flow-c0-c1")[0]).toHaveTextContent("\u2194");
  });

  it("draws no graph of its own", () => {
    // ONE picture of the workflow, and it lives in "Build your workflow".
    // A second drawing here was a second thing to keep in step, and a tree
    // could not show a cycle or a reversed pair without lying.
    renderWorkspace(CHAIN);
    expect(screen.queryByTestId("fw-lanes")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fw-figures")).not.toBeInTheDocument();
    const text = screen.getByTestId("fw-resources").textContent;
    ["Inputs", "Process", "Workflow"].forEach((word) =>
      expect(text).not.toContain(word)
    );
  });

  it("says how many connections a resource has, each way", () => {
    renderWorkspace({ ...CHAIN, heads: [{ id: "h0", URLs: ["https://e.org/a"] }] });
    // Two arrows in, one out.
    expect(screen.getByTestId("fw-state-s0")).toHaveTextContent("2 in · 1 out");
    expect(screen.getByTestId("fw-state-h0")).toHaveTextContent(
      "Not connected"
    );
  });

  it("keeps the internal id out of sight but not out of the DOM", () => {
    // An id is positional -- delete one figure and the rest renumber -- so
    // printing it invites a curator to treat it as a permanent name for
    // their own work. It stays where tests and tooling address it.
    renderWorkspace(CHAIN);
    const text = screen.getByTestId("fw-resources").textContent;
    ["(c0)", "(s0)", "(d0)", "(t0)"].forEach((id) =>
      expect(text).not.toContain(id)
    );
    ["c0", "s0", "d0", "t0"].forEach((id) => {
      expect(screen.getAllByTestId(`fw-id-${id}`).length).toBeGreaterThan(0);
      expect(screen.getByTestId(`fw-node-${id}`)).toHaveAttribute(
        "data-artifact",
        id
      );
    });
  });

  it("keeps the marker out of the accessibility tree, not just out of sight", () => {
    // `display: none` alone would be enough for Chrome, but the two are not
    // the same promise: a marker that is later given a size for any reason
    // would start being announced. `aria-hidden` says what is meant.
    //
    // Verified against a real accessibility tree, not just this assertion:
    // Chrome reports all fifteen markers ignored, reason ariaHiddenElement,
    // none with an accessible name.
    renderWorkspace(CHAIN);
    ["c0", "s0", "d0", "t0"].forEach((id) => {
      const marker = screen.getAllByTestId(`fw-id-${id}`)[0];
      expect(marker).toHaveAttribute("aria-hidden", "true");
      expect(marker).toHaveTextContent("");
      expect(marker).not.toBeVisible();
      // And still addressable by everything that is not a person.
      expect(marker).toHaveAttribute("data-artifact", id);
    });
  });

  it("lights the row that is being pointed at", async () => {
    // Matching a row to a box in the drawing is done by pointing, not by
    // reading an id off both.
    const u = user();
    renderWorkspace(CHAIN);
    const row = screen.getByTestId("fw-node-s0");
    expect(row).toHaveAttribute("data-spotlit", "false");

    await u.hover(row);
    expect(screen.getByTestId("fw-node-s0")).toHaveAttribute(
      "data-spotlit",
      "true"
    );
    // And only that one.
    expect(screen.getByTestId("fw-node-c0")).toHaveAttribute(
      "data-spotlit",
      "false"
    );

    await u.unhover(row);
    expect(screen.getByTestId("fw-node-s0")).toHaveAttribute(
      "data-spotlit",
      "false"
    );
  });

  it("drops the light when the artifacts are renumbered", async () => {
    // Ids are positional. Delete one figure and `c1` becomes `c0`, so a
    // spotlight held across the delete would light the row of an artifact
    // the curator never pointed at -- and light it next to the wrong box.
    const u = user();
    const ctx = renderWorkspace({
      charts: [FIGURE, { id: "c1", caption: "Second figure" }],
      scripts: [SCRIPT],
    });
    await u.hover(screen.getByTestId("fw-node-c1"));
    expect(screen.getByTestId("fw-node-c1")).toHaveAttribute(
      "data-spotlit",
      "true"
    );

    // The second figure is gone; what was c1 no longer exists.
    ctx.rerenderWith({ charts: [FIGURE], scripts: [SCRIPT] });
    expect(screen.queryByTestId("fw-node-c1")).toBeNull();
    expect(screen.getByTestId("fw-node-c0")).toHaveAttribute(
      "data-spotlit",
      "false"
    );
  });

  it("keeps internal ids out of the connection manager as well", async () => {
    const u = user();
    renderWorkspace(CHAIN);
    await u.click(screen.getByTestId("fw-linkmenu-s0"));
    await u.click(screen.getByTestId("fw-link-s0"));
    const dialog = await screen.findByTestId("fw-link-dialog");
    ["(c0)", "(d0)", "(t0)", "(s0)"].forEach((id) =>
      expect(dialog.textContent).not.toContain(id)
    );
    // The rows are still addressed by id, and still named.
    expect(screen.getByTestId("fw-link-name-s0-c0")).toHaveTextContent(
      FIGURE.caption
    );
  });

  it("lights the row from the keyboard too", async () => {
    const u = user();
    renderWorkspace(CHAIN);
    screen.getByTestId("fw-linkmenu-s0").focus();
    await waitFor(() =>
      expect(screen.getByTestId("fw-node-s0")).toHaveAttribute(
        "data-spotlit",
        "true"
      )
    );
    await u.tab();
  });

  it("keeps a resource in the same place when an edge is drawn", () => {
    // The list is where a curator FINDS something. It is ordered by kind,
    // so nothing jumps because the graph changed.
    const ctx = renderWorkspace({
      charts: [FIGURE],
      scripts: [SCRIPT],
      datasets: [{ id: "d0", readme: "spectra" }],
    });
    const before = Array.from(
      screen.getByTestId("fw-resources").children
    ).map((li) => li.dataset.testid);

    ctx.rerenderWith({
      charts: [FIGURE],
      scripts: [SCRIPT],
      datasets: [{ id: "d0", readme: "spectra" }],
      workflow: { nodes: [], edges: [{ from: "d0", to: "s0", type: "links_to" }] },
    });
    const after = Array.from(
      screen.getByTestId("fw-resources").children
    ).map((li) => li.dataset.testid);
    expect(after).toEqual(before);
  });
});

describe("the draft between the two saves", () => {
  afterEach(() => jest.resetAllMocks());

  it("keeps a saved artifact visible and linkable before the paper is saved", async () => {
    const u = user();
    const ctx = renderWorkspace({ charts: [FIGURE] });
    ctx.rerenderWith({ charts: [FIGURE], scripts: [SCRIPT] });
    expect(screen.getByTestId("fw-node-s0")).toBeInTheDocument();

    await openLinkFor(u, "s0");
    await u.click(screen.getByTestId("fw-link-option-s0-c0"));
    await u.click(screen.getByTestId("fw-link-apply"));
    expect(ctx.addEdge).toHaveBeenCalled();
  });

  it("does not discard an existing artifact when another is added", () => {
    const ctx = renderWorkspace({ charts: [FIGURE], scripts: [SCRIPT] });
    ctx.rerenderWith({
      charts: [FIGURE],
      scripts: [SCRIPT],
      datasets: [{ id: "d0", readme: "spectra" }],
    });
    ["c0", "s0", "d0"].forEach((id) =>
      expect(screen.getByTestId(`fw-node-${id}`)).toBeInTheDocument()
    );
  });

  it("reads a legacy untyped edge without inventing a meaning for it", () => {
    renderWorkspace({
      charts: [FIGURE],
      scripts: [SCRIPT],
      workflow: { nodes: [], edges: [["s0", "c0"]] },
    });
    openAllRows();
    expect(screen.getAllByTestId("fw-flow-s0-c0")[0]).toHaveTextContent("\u2192");
    expect(screen.getAllByTestId("fw-flow-s0-c0")[0]).toHaveAttribute(
      "aria-label",
      "plot_dos.py connects to Density of states"
    );
  });

  it("works on a paper with no workflow at all", () => {
    renderWorkspace({ charts: [FIGURE], scripts: [SCRIPT] });
    ["c0", "s0"].forEach((id) => {
      expect(screen.getByTestId(`fw-node-${id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`fw-state-${id}`)).toHaveTextContent(
        "Not connected"
      );
    });
  });

  it("says so when the paper holds nothing yet", () => {
    renderWorkspace();
    expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId("fw-resources")).not.toBeInTheDocument();
  });
});

describe("an arrow between two of the same kind", () => {
  afterEach(() => jest.resetAllMocks());

  const PAIRS = [
    ["chart", "charts", "c0", "c1", { id: "c1", caption: "Second figure" }],
    ["script", "scripts", "s0", "s1", { id: "s1", readme: "second.py" }],
    ["dataset", "datasets", "d0", "d1", { id: "d1", readme: "second data" }],
    ["tool", "tools", "t0", "t1", { id: "t1", packageName: "scipy" }],
    ["external", "heads", "h0", "h1", { id: "h1", URLs: ["https://e.org/b"] }],
  ];

  const paperFor = (list, extra) => {
    const base = {
      charts: [FIGURE],
      scripts: [SCRIPT],
      datasets: [{ id: "d0", readme: "spectra" }],
      tools: [{ id: "t0", packageName: "numpy" }],
      heads: [{ id: "h0", URLs: ["https://e.org/a"] }],
    };
    return { ...base, [list]: [...base[list], extra] };
  };

  it.each(PAIRS)(
    "offers another %s as a candidate",
    async (_kind, list, a, b, extra) => {
      const u = user();
      renderWorkspace(paperFor(list, extra));
      await openLinkFor(u, a);
      // Same kind, different artifact: an ordinary candidate, not a special
      // case and not hidden behind a second vocabulary.
      expect(screen.getByTestId(`fw-link-option-${a}-${b}`)).toBeInTheDocument();
    }
  );

  it.each(PAIRS)("draws the arrow between two %ss", async (_kind, list, a, b, extra) => {
    const u = user();
    const ctx = renderWorkspace(paperFor(list, extra));
    await openLinkFor(u, a);
    await u.click(screen.getByTestId(`fw-link-option-${a}-${b}`));
    await u.click(screen.getByTestId("fw-link-apply"));

    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: a,
      to: b,
      type: "links_to",
    });
  });

  it("never offers the artifact itself", async () => {
    const u = user();
    renderWorkspace(paperFor("charts", { id: "c1", caption: "Second" }));
    await openLinkFor(u, "c0");
    expect(screen.queryByTestId("fw-link-option-c0-c0")).not.toBeInTheDocument();
  });

  it("allows the same pair the other way round", async () => {
    const u = user();
    const ctx = renderWorkspace({
      ...paperFor("datasets", { id: "d1", readme: "second data" }),
      workflow: { nodes: [], edges: [{ from: "d0", to: "d1", type: "links_to" }] },
    });
    await openLinkFor(u, "d0");
    // The one already drawn is shown as made, and could be undone here...
    expect(screen.getByTestId("fw-link-option-d0-d1")).toBeChecked();
    // ...and the reverse is a different fact.
    await u.click(screen.getByTestId("fw-dir-in"));
    await u.click(screen.getByTestId("fw-link-option-d1-d0"));
    await u.click(screen.getByTestId("fw-link-apply"));
    await u.click(await screen.findByTestId("fw-loop-confirm"));

    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: "d1",
      to: "d0",
      type: "links_to",
      feedback: true,
    });
  });

  it("leaves the older relationships to their own endpoints", async () => {
    // A tool still cannot be a figure's `uses_tool`, whatever the generic
    // arrow allows.
    const u = user();
    const ctx = renderWorkspace(paperFor("tools", { id: "t1", packageName: "scipy" }));
    await openLinkFor(u, "t0");
    await u.click(screen.getByTestId("fw-link-option-t0-c0"));
    await u.click(screen.getByTestId("fw-link-apply"));

    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: "t0",
      to: "c0",
      type: "links_to",
    });
    expect(ctx.addEdge).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "uses_tool" })
    );
  });
});

describe("a resource that is joined to nothing", () => {
  afterEach(() => jest.resetAllMocks());

  it("is listed with everything else, marked as unconnected", () => {
    // Not filed away in a section named for what it LACKS. Standing alone
    // is a state, not a category.
    renderWorkspace({
      charts: [FIGURE],
      datasets: [{ id: "d0", readme: "orphan data" }],
    });
    const row = within(screen.getByTestId("fw-node-d0"));
    expect(row.getByText("orphan data")).toBeInTheDocument();
    expect(screen.getByTestId("fw-state-d0")).toHaveTextContent(
      "Not connected"
    );
    expect(screen.queryByText(/unlinked|orphaned|missing/i)).not.toBeInTheDocument();
  });

  it("carries the same three actions as anything else", () => {
    renderWorkspace({
      charts: [FIGURE],
      datasets: [{ id: "d0", readme: "orphan data" }],
    });
    const group = within(screen.getByTestId("fw-actions-d0"));
    expect(group.getByTestId("fw-linkmenu-d0")).toBeInTheDocument();
    expect(group.getByTestId("fw-edit-d0")).toBeInTheDocument();
    expect(group.getByTestId("fw-remove-d0")).toBeInTheDocument();
  });

  it("can be linked later, from its own row", async () => {
    const u = user();
    const ctx = renderWorkspace({
      charts: [FIGURE],
      datasets: [{ id: "d0", readme: "orphan data" }],
    });
    await openLinkFor(u, "d0");
    await u.click(screen.getByTestId("fw-link-option-d0-c0"));
    await u.click(screen.getByTestId("fw-link-apply"));

    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: "d0",
      to: "c0",
      type: "links_to",
    });
  });

  it("counts the connection the moment it is made", () => {
    const ctx = renderWorkspace({
      charts: [FIGURE],
      datasets: [{ id: "d0", readme: "orphan data" }],
    });
    expect(screen.getByTestId("fw-state-d0")).toHaveTextContent(
      "Not connected"
    );
    ctx.rerenderWith({
      workflow: { nodes: [], edges: [{ from: "d0", to: "c0", type: "links_to" }] },
    });
    expect(screen.getByTestId("fw-state-d0")).toHaveTextContent("0 in · 1 out");
  });
});

describe("external data on a row", () => {
  afterEach(() => jest.resetAllMocks());

  const HEAD = {
    id: "h0",
    label: "Materials Project mp-21276",
    readme: "Reference band structure.",
    URLs: ["https://materialsproject.org/materials/mp-21276"],
  };

  it("shows label, https link and note", () => {
    renderWorkspace({ charts: [FIGURE], heads: [HEAD] });
    const row = within(screen.getByTestId("fw-node-h0"));
    expect(row.getByTestId("fw-url-h0")).toHaveAttribute(
      "href",
      "https://materialsproject.org/materials/mp-21276"
    );
    expect(row.getByTestId("fw-note-h0")).toHaveTextContent(
      /reference band structure/i
    );
  });

  it("keeps a legacy http head visible and renders no local path", () => {
    renderWorkspace({
      charts: [FIGURE],
      heads: [{ id: "h0", label: "Old link", URLs: ["http://example.org/old"] }],
    });
    expect(screen.getByTestId("fw-node-h0")).toBeInTheDocument();
    expect(screen.getByTestId("fw-url-h0")).toHaveAttribute(
      "href",
      "http://example.org/old"
    );
    expect(screen.getByTestId("fw-node-h0").textContent).not.toMatch(
      /^[A-Za-z]:\\|\/home\/|\/Users\//
    );
  });
});

describe("the list does not reconstruct the graph", () => {
  afterEach(() => jest.resetAllMocks());

  it("shows two unconnected pieces of work as plain rows", () => {
    // No grouping, no components, no hierarchy: the shape of the work is
    // the workflow section's job.
    renderWorkspace({
      charts: [FIGURE, { id: "c1", caption: "Band structure" }],
      scripts: [SCRIPT, { id: "s1", readme: "bands.py" }],
      workflow: {
        nodes: [],
        edges: [
          { from: "s0", to: "c0", type: "generates" },
          { from: "s1", to: "c1", type: "generates" },
        ],
      },
    });
    ["c0", "c1", "s0", "s1"].forEach((id) =>
      expect(screen.getByTestId(`fw-node-${id}`)).toBeInTheDocument()
    );
    expect(screen.queryByTestId("fw-group-c0")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fw-group-c1")).not.toBeInTheDocument();
  });

  it("shows a three-node cycle whole, cutting nothing", () => {
    // A tree had to drop an edge or repeat a node to render this. A list
    // has neither problem: three rows, three arrows.
    renderWorkspace({
      scripts: [
        { id: "s0", readme: "a.py" },
        { id: "s1", readme: "b.py" },
        { id: "s2", readme: "c.py" },
      ],
      workflow: {
        nodes: [],
        edges: [
          { from: "s0", to: "s1", type: "links_to" },
          { from: "s1", to: "s2", type: "links_to" },
          { from: "s2", to: "s0", type: "links_to" },
        ],
      },
    });
    openAllRows();
    ["s0-s1", "s1-s2", "s2-s0"].forEach((pair) => {
      expect(screen.getAllByTestId(`fw-flow-${pair}`)[0]).toBeInTheDocument();
      expect(screen.getAllByTestId(`fw-unlink-${pair}`)[0]).toBeInTheDocument();
    });
    ["s0", "s1", "s2"].forEach((id) =>
      expect(screen.getAllByTestId(`fw-node-${id}`)).toHaveLength(1)
    );
  });

  it("shows both arrows of a reversed pair, separately", () => {
    renderWorkspace({
      scripts: [SCRIPT, { id: "s1", readme: "pre.py" }],
      workflow: {
        nodes: [],
        edges: [
          { from: "s0", to: "s1", type: "links_to" },
          { from: "s1", to: "s0", type: "links_to", feedback: true },
        ],
      },
    });
    openAllRows();
    expect(screen.getAllByTestId("fw-flow-s0-s1")[0]).toBeInTheDocument();
    expect(screen.getAllByTestId("fw-flow-s1-s0")[0]).toBeInTheDocument();
    // Each is undone on its own.
    expect(screen.getAllByTestId("fw-unlink-s0-s1")[0]).toBeInTheDocument();
    expect(screen.getAllByTestId("fw-unlink-s1-s0")[0]).toBeInTheDocument();
    // And only the confirmed one is marked.
    expect(screen.getAllByTestId("fw-feedback-s1-s0")[0]).toBeInTheDocument();
    expect(screen.queryAllByTestId("fw-feedback-s0-s1")).toHaveLength(0);
  });
});

describe("who owns a feedback mark", () => {
  afterEach(() => jest.resetAllMocks());

  const held = (extra = []) => ({
    charts: [FIGURE],
    scripts: [SCRIPT],
    workflow: {
      nodes: [],
      edges: [{ from: "c0", to: "s0", type: "links_to" }, ...extra],
    },
  });

  it("marks only the edge that was confirmed", async () => {
    const u = user();
    const ctx = renderWorkspace(held());
    await openLinkFor(u, "s0");
    await u.click(screen.getByTestId("fw-link-option-s0-c0"));
    await u.click(screen.getByTestId("fw-link-apply"));
    await u.click(await screen.findByTestId("fw-loop-confirm"));

    expect(ctx.addEdge).toHaveBeenCalledTimes(1);
    expect(ctx.addEdge).not.toHaveBeenCalledWith(
      expect.objectContaining({ from: "c0", to: "s0" })
    );
  });

  it("shows the mark on that edge and on no other", () => {
    renderWorkspace(
      held([{ from: "s0", to: "c0", type: "links_to", feedback: true }])
    );
    openAllRows();
    expect(screen.getAllByTestId("fw-feedback-s0-c0").length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId("fw-feedback-c0-s0")).toHaveLength(0);
  });

  it("keeps the mark when the OTHER edge of the loop is removed", () => {
    const ctx = renderWorkspace(
      held([{ from: "s0", to: "c0", type: "links_to", feedback: true }])
    );
    openAllRows();
    ctx.rerenderWith({
      workflow: {
        nodes: [],
        edges: [{ from: "s0", to: "c0", type: "links_to", feedback: true }],
      },
    });
    expect(screen.getAllByTestId("fw-feedback-s0-c0").length).toBeGreaterThan(0);
  });

  it("loses the mark when the feedback edge itself is removed", () => {
    const ctx = renderWorkspace(
      held([{ from: "s0", to: "c0", type: "links_to", feedback: true }])
    );
    ctx.rerenderWith({
      workflow: { nodes: [], edges: [{ from: "c0", to: "s0", type: "links_to" }] },
    });
    expect(screen.queryAllByTestId(/^fw-feedback-/)).toHaveLength(0);
  });

  it("adds no mark to a cycle nobody was asked about", () => {
    renderWorkspace(held([{ from: "s0", to: "c0", type: "links_to" }]));
    expect(screen.queryAllByTestId(/^fw-feedback-/)).toHaveLength(0);
  });

  it("adds no mark to a legacy untyped loop", () => {
    renderWorkspace({
      charts: [FIGURE],
      scripts: [SCRIPT],
      workflow: { nodes: [], edges: [["s0", "c0"], ["c0", "s0"]] },
    });
    expect(screen.queryAllByTestId(/^fw-feedback-/)).toHaveLength(0);
  });

  it("marks nothing when the question is declined", async () => {
    const u = user();
    const ctx = renderWorkspace(held());
    await openLinkFor(u, "s0");
    await u.click(screen.getByTestId("fw-link-option-s0-c0"));
    await u.click(screen.getByTestId("fw-link-apply"));
    await u.click(await screen.findByTestId("fw-loop-cancel"));
    expect(ctx.addEdge).not.toHaveBeenCalled();
  });

  it("keeps the other choices when the loop is declined", async () => {
    const u = user();
    const ctx = renderWorkspace({
      ...held(),
      datasets: [{ id: "d0", readme: "spectra" }],
    });
    await openLinkFor(u, "s0");
    await u.click(screen.getByTestId("fw-link-option-s0-c0"));
    await u.click(screen.getByTestId("fw-link-option-s0-d0"));
    await u.click(screen.getByTestId("fw-link-apply"));
    await screen.findByTestId("fw-loop-dialog");
    await u.click(screen.getByTestId("fw-loop-cancel"));

    expect(ctx.addEdge).toHaveBeenCalledTimes(1);
    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: "s0",
      to: "d0",
      type: "links_to",
    });
  });

  it("never asks about an association", async () => {
    const u = user();
    const ctx = renderWorkspace({
      charts: [FIGURE, { id: "c1", caption: "Second" }],
      workflow: { nodes: [], edges: [{ from: "c1", to: "c0", type: "related_to" }] },
    });
    await openLinkFor(u, "c0");
    // Removing it is not a loop question.
    await u.click(screen.getByTestId("fw-link-option-c1-c0-related_to"));
    await u.click(screen.getByTestId("fw-link-apply"));

    expect(screen.queryByTestId("fw-loop-dialog")).not.toBeInTheDocument();
    expect(ctx.unlink).toHaveBeenCalledWith("c1", "c0");
  });
});

describe("unlink, from wherever the arrow is drawn", () => {
  afterEach(() => jest.resetAllMocks());

  it("reaches an edge from the row it leaves and the row it enters", () => {
    const ctx = renderWorkspace({
      scripts: [SCRIPT, { id: "s1", readme: "preprocess.py" }],
      workflow: {
        nodes: [],
        edges: [
          { from: "s1", to: "s0", type: "links_to" },
          { from: "s0", to: "s1", type: "links_to" },
        ],
      },
    });
    openAllRows();
    // Two edges, each shown at both ends.
    expect(screen.getAllByTestId("fw-unlink-s0-s1")).toHaveLength(2);
    expect(screen.getAllByTestId("fw-unlink-s1-s0")).toHaveLength(2);

    fireEvent.click(screen.getAllByTestId("fw-unlink-s0-s1")[1]);
    expect(ctx.unlink).toHaveBeenCalledTimes(1);
    expect(ctx.unlink).toHaveBeenCalledWith("s0", "s1");
  });

  it("breaks an association from either end, in its stored direction", () => {
    const ctx = renderWorkspace({
      charts: [FIGURE, { id: "c1", caption: "Band structure" }],
      workflow: { nodes: [], edges: [{ from: "c0", to: "c1", type: "related_to" }] },
    });
    openAllRows();
    const buttons = screen.getAllByTestId("fw-unlink-c0-c1");
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(ctx.unlink).toHaveBeenCalledWith("c0", "c1");
  });

  it("breaks a feedback edge and takes its mark with it", () => {
    const ctx = renderWorkspace({
      charts: [FIGURE],
      scripts: [SCRIPT],
      workflow: {
        nodes: [],
        edges: [
          { from: "c0", to: "s0", type: "links_to" },
          { from: "s0", to: "c0", type: "links_to", feedback: true },
        ],
      },
    });
    openAllRows();
    expect(screen.getAllByTestId("fw-feedback-s0-c0").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByTestId("fw-unlink-s0-c0")[0]);
    expect(ctx.unlink).toHaveBeenCalledWith("s0", "c0");

    ctx.rerenderWith({
      workflow: { nodes: [], edges: [{ from: "c0", to: "s0", type: "links_to" }] },
    });
    expect(screen.queryAllByTestId(/^fw-feedback-/)).toHaveLength(0);
  });

  it("offers no unlink where no relationship is written", () => {
    renderWorkspace({ charts: [FIGURE] });
    expect(screen.queryAllByTestId(/^fw-unlink-/)).toHaveLength(0);
  });
});

describe("reachable without a mouse", () => {
  afterEach(() => jest.resetAllMocks());

  it("puts every row action on a real focusable control", () => {
    renderWorkspace(CHAIN);
    ["c0", "s0", "d0", "t0"].forEach((id) => {
      ["fw-linkmenu", "fw-edit", "fw-remove"].forEach((prefix) => {
        const el = screen.getByTestId(`${prefix}-${id}`);
        expect(el.tagName).toBe("BUTTON");
        expect(el).not.toBeDisabled();
        expect(el).not.toHaveAttribute("tabindex", "-1");
      });
    });
  });

  it("reaches Link, Edit and Remove from the keyboard", async () => {
    const u = user();
    const ctx = renderWorkspace(CHAIN);

    screen.getByTestId("fw-linkmenu-s0").focus();
    expect(screen.getByTestId("fw-linkmenu-s0")).toHaveFocus();
    await u.keyboard("{Enter}");
    await screen.findByTestId("fw-flow-menu");
    expect(screen.getByTestId("fw-link-s0")).toBeInTheDocument();
    await u.keyboard("{Escape}");

    screen.getByTestId("fw-edit-s0").focus();
    await u.keyboard("{Enter}");
    expect(ctx.helpers.openForm).toHaveBeenCalledWith("script");
  });

  it("keeps every Unlink a real button", () => {
    renderWorkspace(CHAIN);
    openAllRows();
    ["s0-c0", "d0-s0", "t0-s0"].forEach((pair) => {
      const button = screen.getAllByTestId(`fw-unlink-${pair}`)[0];
      expect(button.tagName).toBe("BUTTON");
      expect(button).not.toBeDisabled();
    });
  });
});

// A workspace whose edges are REAL state, so accepting a suggestion actually
// changes what the next render sees. A jest.fn() would let a spent suggestion
// go on looking acceptable forever.
const LiveWorkspace = ({ lists, onEdge = () => {} }) => {
  const [edges, setEdges] = useState([]);
  return (
    <CuratorHelperContext.Provider value={buildHelpers()}>
      <CuratorContext.Provider
        value={{
          ...lists,
          tools: lists.tools || [],
          heads: lists.heads || [],
          workflow: { nodes: [], edges },
          addEdge: (edge) => {
            onEdge(edge);
            setEdges((was) => [...was, edge]);
          },
          unlink: jest.fn(),
          del: jest.fn(),
        }}
      >
        <FigureWorkspace />
      </CuratorContext.Provider>
    </CuratorHelperContext.Provider>
  );
};

describe("suggested connections", () => {
  afterEach(() => jest.resetAllMocks());

  const PROVEN = {
    charts: [
      {
        id: "c0",
        caption: "Density of states",
        notebookFile: "figures/dos.ipynb",
      },
    ],
    scripts: [{ id: "s0", readme: "plot_dos.py", files: ["figures/dos.ipynb"] }],
    datasets: [],
  };

  it("stays out of the way until there is something to suggest", () => {
    renderWorkspace({ charts: [FIGURE], scripts: [SCRIPT] });
    expect(screen.queryByTestId("fw-suggestions-c0")).not.toBeInTheDocument();
  });

  it("appears on the figure it is about, collapsed, counted", () => {
    renderWorkspace(PROVEN);
    const toggle = screen.getByTestId("fw-suggest-toggle-c0");
    expect(toggle).toHaveTextContent("Suggested connections (1)");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/both reference/i)).not.toBeInTheDocument();
  });

  it("states the relationship and the one fact behind it", async () => {
    const u = user();
    renderWorkspace(PROVEN);
    await u.click(screen.getByTestId("fw-suggest-toggle-c0"));
    expect(
      screen.getByText(
        "Connect plot_dos.py as generating this figure — " +
          "both reference figures/dos.ipynb."
      )
    ).toBeInTheDocument();
  });

  it("Connect makes exactly one typed edge, and the offer is spent", async () => {
    const u = user();
    const onEdge = jest.fn();
    render(<LiveWorkspace lists={PROVEN} onEdge={onEdge} />);

    await u.click(screen.getByTestId("fw-suggest-toggle-c0"));
    await u.click(screen.getByTestId("fw-suggest-connect-s0-c0"));

    expect(onEdge).toHaveBeenCalledTimes(1);
    expect(onEdge).toHaveBeenCalledWith({
      from: "s0",
      to: "c0",
      type: "generates",
    });
    expect(screen.queryByTestId("fw-suggestions-c0")).not.toBeInTheDocument();
  });

  it("never offers a connection the paper already holds", () => {
    renderWorkspace({
      ...PROVEN,
      workflow: {
        nodes: [],
        edges: [{ from: "s0", to: "c0", type: "generates" }],
      },
    });
    expect(screen.queryByTestId("fw-suggestions-c0")).not.toBeInTheDocument();
  });

  it("Not now hides it here and changes nothing else", async () => {
    const u = user();
    const ctx = renderWorkspace(PROVEN);
    await u.click(screen.getByTestId("fw-suggest-toggle-c0"));
    await u.click(screen.getByTestId("fw-suggest-dismiss-s0-c0"));

    expect(screen.queryByTestId("fw-suggestions-c0")).not.toBeInTheDocument();
    expect(ctx.addEdge).not.toHaveBeenCalled();
    expect(ctx.unlink).not.toHaveBeenCalled();
    expect(ctx.del).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("asks no provider anything, at any point", async () => {
    const u = user();
    render(<LiveWorkspace lists={PROVEN} />);
    await u.click(screen.getByTestId("fw-suggest-toggle-c0"));
    await u.click(screen.getByTestId("fw-suggest-connect-s0-c0"));

    expect(axios.get).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
    expect(axios.delete).not.toHaveBeenCalled();
  });

  it("offers a dataset the figure names as its own input", async () => {
    const u = user();
    renderWorkspace({
      charts: [
        { id: "c0", caption: "Density of states", files: ["data/spectra.csv"] },
      ],
      scripts: [],
      datasets: [
        { id: "d0", readme: "Cryogenic spectra", files: ["data/spectra.csv"] },
      ],
    });
    await u.click(screen.getByTestId("fw-suggest-toggle-c0"));
    expect(
      screen.getByText(
        "Connect Cryogenic spectra as an input to this figure — " +
          "both reference data/spectra.csv."
      )
    ).toBeInTheDocument();
  });

  it("says nothing when only names and words agree", () => {
    renderWorkspace({
      charts: [
        {
          id: "c0",
          caption: "Density of states",
          notebookFile: "figures/dos.ipynb",
        },
      ],
      scripts: [
        { id: "s0", readme: "Density of states", files: ["src/dos.py"] },
      ],
      datasets: [
        { id: "d0", readme: "Density of states", files: ["raw/dos.csv"] },
      ],
    });
    expect(screen.queryByTestId("fw-suggestions-c0")).not.toBeInTheDocument();
  });

  it("re-aims at the artifact holding the evidence, not at the number", async () => {
    const u = user();
    const ctx = renderWorkspace({
      charts: [
        {
          id: "c0",
          caption: "Density of states",
          notebookFile: "figures/dos.ipynb",
        },
      ],
      scripts: [
        { id: "s0", readme: "unrelated.py", files: ["other/first.py"] },
        { id: "s1", readme: "plot_dos.py", files: ["figures/dos.ipynb"] },
      ],
    });
    await u.click(screen.getByTestId("fw-suggest-toggle-c0"));
    expect(screen.getByTestId("fw-suggest-connect-s1-c0")).toBeInTheDocument();

    ctx.rerenderWith({
      scripts: [{ id: "s0", readme: "plot_dos.py", files: ["figures/dos.ipynb"] }],
    });
    expect(screen.getByTestId("fw-suggest-connect-s0-c0")).toBeInTheDocument();
    expect(
      screen.queryByTestId("fw-suggest-connect-s1-c0")
    ).not.toBeInTheDocument();
  });

  it("leaves the manual paths exactly as they were", () => {
    renderWorkspace(PROVEN);
    expect(screen.getByTestId("fw-linkmenu-c0")).toBeInTheDocument();
    expect(screen.getByTestId("fw-edit-c0")).toBeInTheDocument();
    expect(screen.getByTestId("fw-remove-c0")).toBeInTheDocument();
  });
});

// THE DIALOG IS A CONNECTION MANAGER.
//
// A checkbox says the state the curator WANTS, not a report of what is. That
// is what makes it possible to undo a connection in the same place it was
// made -- which, before, meant closing the window and hunting for the row.
describe("managing a resource's connections", () => {
  afterEach(() => jest.resetAllMocks());

  const WIRED = {
    charts: [FIGURE],
    scripts: [SCRIPT],
    datasets: [{ id: "d0", readme: "spectra" }],
    tools: [{ id: "t0", packageName: "numpy" }],
    workflow: {
      nodes: [],
      edges: [
        { from: "s0", to: "c0", type: "generates" },
        { from: "s0", to: "d0", type: "links_to" },
      ],
    },
  };

  it("calls the action Apply changes, not Link selected", async () => {
    const u = user();
    renderWorkspace(WIRED);
    await openLinkFor(u, "s0");
    expect(screen.getByTestId("fw-link-apply")).toHaveTextContent(
      /apply changes/i
    );
  });

  it("removes exactly the one connection that was unticked", async () => {
    const u = user();
    const ctx = renderWorkspace(WIRED);
    await openLinkFor(u, "s0");

    await u.click(screen.getByTestId("fw-link-option-s0-d0"));
    await u.click(screen.getByTestId("fw-link-apply"));

    expect(ctx.unlink).toHaveBeenCalledTimes(1);
    expect(ctx.unlink).toHaveBeenCalledWith("s0", "d0");
    // The other connection is untouched, and nothing was added.
    expect(ctx.addEdge).not.toHaveBeenCalled();
    expect(ctx.del).not.toHaveBeenCalled();
  });

  it("adds and removes together, in one Apply", async () => {
    const u = user();
    const ctx = renderWorkspace(WIRED);
    await openLinkFor(u, "s0");

    await u.click(screen.getByTestId("fw-link-option-s0-d0")); // untick
    await u.click(screen.getByTestId("fw-link-option-s0-t0")); // tick
    await u.click(screen.getByTestId("fw-link-apply"));

    expect(ctx.unlink).toHaveBeenCalledWith("s0", "d0");
    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: "s0",
      to: "t0",
      type: "links_to",
    });
  });

  it("removes an incoming connection from the other endpoint", async () => {
    // Opened at the figure, flipped to what points AT it.
    const u = user();
    const ctx = renderWorkspace(WIRED);
    await openLinkFor(u, "c0");
    await u.click(screen.getByTestId("fw-dir-in"));

    const incoming = screen.getByTestId("fw-link-option-s0-c0");
    expect(incoming).toBeChecked();
    await u.click(incoming);
    await u.click(screen.getByTestId("fw-link-apply"));

    expect(ctx.unlink).toHaveBeenCalledWith("s0", "c0");
  });

  it("keeps a pending change when the direction is flipped", async () => {
    // Pending is keyed by EDGE, so turning the dialog round does not lose
    // what has already been decided.
    const u = user();
    const ctx = renderWorkspace(WIRED);
    await openLinkFor(u, "s0");

    await u.click(screen.getByTestId("fw-link-option-s0-d0")); // untick
    await u.click(screen.getByTestId("fw-dir-in"));
    await u.click(screen.getByTestId("fw-dir-out"));
    expect(screen.getByTestId("fw-link-option-s0-d0")).not.toBeChecked();

    await u.click(screen.getByTestId("fw-link-apply"));
    expect(ctx.unlink).toHaveBeenCalledWith("s0", "d0");
  });

  it("Cancel throws away every pending change", async () => {
    const u = user();
    const ctx = renderWorkspace(WIRED);
    await openLinkFor(u, "s0");

    await u.click(screen.getByTestId("fw-link-option-s0-d0")); // untick
    await u.click(screen.getByTestId("fw-link-option-s0-t0")); // tick
    await u.click(screen.getByTestId("fw-link-cancel"));

    expect(ctx.unlink).not.toHaveBeenCalled();
    expect(ctx.addEdge).not.toHaveBeenCalled();
    expect(screen.queryByTestId("fw-link-dialog")).not.toBeInTheDocument();
  });

  it("stays open after Apply, with the new state as the baseline", async () => {
    // Managing connections is rarely one change. Closing the window under a
    // curator costs them the place they were working.
    const u = user();
    const ctx = renderWorkspace(WIRED);
    await openLinkFor(u, "s0");

    await u.click(screen.getByTestId("fw-link-option-s0-t0"));
    await u.click(screen.getByTestId("fw-link-apply"));

    expect(ctx.addEdge).toHaveBeenCalled();
    expect(screen.getByTestId("fw-link-dialog")).toBeInTheDocument();
    // Nothing is pending any more, so there is nothing left to apply.
    expect(screen.getByTestId("fw-link-apply")).toBeDisabled();
  });

  it("does not rebuild the dialog when a box is ticked", async () => {
    // A remounted Modal is the flicker, and a remounted input is why focus
    // used to vanish mid-use.
    const u = user();
    renderWorkspace(WIRED);
    await openLinkFor(u, "s0");

    const dialog = screen.getByTestId("fw-link-dialog");
    const box = screen.getByTestId("fw-link-option-s0-t0");
    await u.click(box);

    expect(screen.getByTestId("fw-link-dialog")).toBe(dialog);
    expect(screen.getByTestId("fw-link-option-s0-t0")).toBe(box);
  });

  it("asks about a loop only for what is being ADDED", async () => {
    const u = user();
    const ctx = renderWorkspace({
      charts: [FIGURE],
      scripts: [SCRIPT],
      workflow: { nodes: [], edges: [{ from: "c0", to: "s0", type: "links_to" }] },
    });
    await openLinkFor(u, "s0");
    await u.click(screen.getByTestId("fw-link-option-s0-c0"));
    await u.click(screen.getByTestId("fw-link-apply"));

    await screen.findByTestId("fw-loop-dialog");
    await u.click(screen.getByTestId("fw-loop-confirm"));
    expect(ctx.addEdge).toHaveBeenCalledWith({
      from: "s0",
      to: "c0",
      type: "links_to",
      feedback: true,
    });
  });

  it("says so when nothing was changed", async () => {
    const u = user();
    const ctx = renderWorkspace(WIRED);
    await openLinkFor(u, "s0");
    expect(screen.getByTestId("fw-link-apply")).toBeDisabled();
    expect(ctx.addEdge).not.toHaveBeenCalled();
  });
});

describe("what a row shows about its wiring", () => {
  afterEach(() => jest.resetAllMocks());

  it("separates what reaches it from what it reaches", () => {
    renderWorkspace(CHAIN);
    openAllRows();
    const wiring = within(screen.getByTestId("fw-wiring-s0"));
    expect(wiring.getByText("Incoming")).toBeInTheDocument();
    expect(wiring.getByText("Outgoing")).toBeInTheDocument();
    // d0 -> s0 and t0 -> s0 come in; s0 -> c0 goes out.
    expect(wiring.getAllByTestId("fw-unlink-d0-s0")).toHaveLength(1);
    expect(wiring.getAllByTestId("fw-unlink-s0-c0")).toHaveLength(1);
  });

  it("shows an association in its own list, not as a flow", () => {
    renderWorkspace({
      charts: [FIGURE, { id: "c1", caption: "Band structure" }],
      workflow: { nodes: [], edges: [{ from: "c0", to: "c1", type: "related_to" }] },
    });
    openAllRows();
    const wiring = within(screen.getByTestId("fw-wiring-c0"));
    expect(wiring.getByText("Related")).toBeInTheDocument();
    expect(wiring.queryByText("Incoming")).not.toBeInTheDocument();
    expect(wiring.queryByText("Outgoing")).not.toBeInTheDocument();
    expect(screen.getByTestId("fw-state-c0")).toHaveTextContent("1 related");
  });
});

// A LIST YOU CAN READ IN ONE SCREEN.
//
// Every row used to arrive with its Incoming, Outgoing and Related lists
// already unfolded, so four resources and three connections filled a screen
// and a half -- and making one connection unfolded the resource being worked
// on together with every resource it reached.
describe("a row is compact until it is asked", () => {
  afterEach(() => jest.resetAllMocks());

  it("shows the counts and nothing else, on every row", () => {
    renderWorkspace(CHAIN);

    ["c0", "s0", "d0", "t0"].forEach((id) => {
      expect(screen.queryByTestId(`fw-wiring-${id}`)).toBeNull();
      expect(screen.queryByTestId(`fw-unlink-d0-s0`)).toBeNull();
    });
    // What a compact row does say: kind, name, counts, and its three actions.
    const row = within(screen.getByTestId("fw-node-s0"));
    expect(row.getByTestId("fw-state-s0")).toHaveTextContent(
      "2 in · 1 out"
    );
    expect(row.getByTestId("fw-linkmenu-s0")).toBeInTheDocument();
    expect(row.getByTestId("fw-edit-s0")).toBeInTheDocument();
    expect(row.getByTestId("fw-remove-s0")).toBeInTheDocument();
  });

  it("says whether it is open, where a screen reader can hear it", async () => {
    const u = user();
    renderWorkspace(CHAIN);
    const control = () => screen.getByTestId("fw-state-s0");

    expect(control()).toHaveAttribute("aria-expanded", "false");
    await u.click(control());
    expect(control()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("fw-wiring-s0")).toBeInTheDocument();

    await u.click(control());
    expect(control()).toHaveAttribute("aria-expanded", "false");
    await waitFor(() =>
      expect(screen.queryByTestId("fw-wiring-s0")).toBeNull()
    );
  });

  it("offers nothing to open on a row with no connections", () => {
    renderWorkspace({ charts: [FIGURE] });
    const state = screen.getByTestId("fw-state-c0");
    expect(state).toHaveTextContent("Not connected");
    // Not a button: a control that opens nothing is worse than no control.
    expect(state.tagName).not.toBe("BUTTON");
  });

  it("keeps the keyboard on the control that was pressed", async () => {
    // The row components are declared inside the workspace, so anything
    // that re-renders the workspace REPLACES their DOM -- and takes the
    // focus with it. Opening a row must not do that.
    const u = user();
    renderWorkspace(CHAIN);
    const before = screen.getByTestId("fw-state-s0");
    before.focus();
    await u.keyboard("{Enter}");

    expect(screen.getByTestId("fw-wiring-s0")).toBeInTheDocument();
    const after = screen.getByTestId("fw-state-s0");
    expect(after).toBe(before);
    expect(document.activeElement).toBe(after);
  });

  it("opens the row that was worked on, and only that one", async () => {
    const u = user();
    renderWorkspace(CHAIN);

    // Undo the arrow s0 draws to c0 -- a change to s0's connections, made
    // from s0's own manager.
    await openLinkFor(u, "s0");
    await u.click(screen.getByTestId("fw-link-option-s0-c0"));
    await u.click(screen.getByTestId("fw-link-apply"));

    // The resource the curator was standing at.
    await waitFor(() =>
      expect(screen.getByTestId("fw-wiring-s0")).toBeInTheDocument()
    );
    // Not the ones at the other end of its arrows, and not the rest.
    ["c0", "d0", "t0"].forEach((id) =>
      expect(screen.queryByTestId(`fw-wiring-${id}`)).toBeNull()
    );
  });

  it("leaves a row the curator opened by hand open", async () => {
    const u = user();
    renderWorkspace(CHAIN);

    await u.click(screen.getByTestId("fw-state-d0"));
    expect(screen.getByTestId("fw-wiring-d0")).toBeInTheDocument();

    // Work on a different resource entirely.
    await openLinkFor(u, "s0");
    await u.click(screen.getByTestId("fw-link-option-s0-c0"));
    await u.click(screen.getByTestId("fw-link-apply"));
    await u.click(screen.getByTestId("fw-link-cancel"));

    // Both are open: the one they chose, and the one they just worked on.
    expect(screen.getByTestId("fw-wiring-d0")).toBeInTheDocument();
    expect(screen.getByTestId("fw-wiring-s0")).toBeInTheDocument();
    expect(screen.queryByTestId("fw-wiring-t0")).toBeNull();
  });
});

// WHAT ONE SCRIPT SAYS ABOUT ITS OWN FILES.
//
// A folder-level list of everything detected everywhere was a thing to go
// and find. The question belongs where a curator already is: on the row of
// the script they are looking at, asked about that script alone.

// EVERY ROW, THE SAME THREE ACTIONS.
//
// A Script row used to carry a fourth: an action that read the script's own
// source and proposed the datasets and figures it touched. It is gone. A
// workflow is what the curator says it is -- Link, the editor, and
// the forms -- and a Script is an ordinary artifact again.
describe("a Script row is an ordinary row", () => {
  afterEach(() => jest.resetAllMocks());

  const EVERY_KIND = {
    charts: [{ id: "c0", caption: "Density of states",
               imageFile: "figures/dos.png" }],
    scripts: [
      { id: "s0", readme: "imported", files: ["scripts/plot_dos.py"] },
      { id: "s1", readme: "typed in by hand" },
    ],
    datasets: [{ id: "d0", readme: "raw data", files: ["data/raw.csv"] }],
    tools: [{ id: "t0", packageName: "numpy" }],
    heads: [{ id: "h0", URLs: ["https://example.org/x"] }],
    workflow: { nodes: [], edges: [] },
  };

  // What the analysis used to carry. A browser that cached one before this
  // change still has these; nothing reads them, and nothing may resurrect a
  // control because they are there.
  const STALE_CACHE = {
    rccAnalysisCache: {
      path: "/proj",
      data: {
        code_links: [{ script: "scripts/plot_dos.py", path: "data/raw.csv",
                       mode: "read", call: "pandas.read_csv",
                       literal: "data/raw.csv", line: 12, cell: null }],
        shell_calls: [{ from: "run.sh", to: "scripts/plot_dos.py", line: 3,
                        command: "python" }],
        code_scan: { skipped: [{ path: "x.py", reason: "size_limit" }] },
      },
    },
  };

  it("has Link, Edit and Remove, and nothing else", () => {
    renderWorkspace(EVERY_KIND);
    ["s0", "s1"].forEach((id) => {
      const group = within(screen.getByTestId(`fw-actions-${id}`));
      expect(group.getByTestId(`fw-linkmenu-${id}`)).toBeInTheDocument();
      expect(group.getByTestId(`fw-edit-${id}`)).toBeInTheDocument();
      expect(group.getByTestId(`fw-remove-${id}`)).toBeInTheDocument();
      expect(group.getAllByRole("button").map((b) => b.innerText || b.textContent))
        .toEqual(["Link", "Edit", "Remove"]);
    });
  });

  it("uses the same action model as every other kind", () => {
    renderWorkspace(EVERY_KIND);
    ["c0", "s0", "s1", "d0", "t0", "h0"].forEach((id) => {
      const group = within(screen.getByTestId(`fw-actions-${id}`));
      expect(group.getByTestId(`fw-linkmenu-${id}`)).toBeInTheDocument();
      expect(group.getByTestId(`fw-edit-${id}`)).toBeInTheDocument();
      expect(group.getByTestId(`fw-remove-${id}`)).toBeInTheDocument();
    });
  });

  it("renders no detector control, dialog or wording", () => {
    renderWorkspace({ ...EVERY_KIND, ...STALE_CACHE });

    ["c0", "s0", "s1", "d0", "t0", "h0"].forEach((id) =>
      expect(screen.queryByTestId(`fw-detect-${id}`)).toBeNull());
    ["fw-detect-dialog", "fw-detect-apply", "fw-detect-cancel",
     "fw-detect-empty", "fw-detect-skipped", "fw-detect-followed",
     "fw-detect-followed-toggle"].forEach((id) =>
      expect(screen.queryByTestId(id)).toBeNull());
    expect(screen.queryAllByTestId(/^fw-detect-/)).toHaveLength(0);

    const page = document.body.textContent;
    [
      "Detect data and figures",
      "Detected from",
      "Sources followed",
      "No exact dataset or figure paths were detected in this script",
      "Add selected suggestions",
    ].forEach((phrase) => expect(page).not.toContain(phrase));
  });

  it("ignores a cached analysis that still carries the old fields", () => {
    // No migration: the fields are simply not read, and the row is the same
    // row it is without them.
    renderWorkspace({ ...EVERY_KIND, ...STALE_CACHE });
    const group = within(screen.getByTestId("fw-actions-s0"));
    expect(group.getAllByRole("button")).toHaveLength(3);
    expect(screen.queryAllByTestId(/^fw-detect-/)).toHaveLength(0);
  });

  it("asks nobody anything, whatever is done to a Script row", async () => {
    const u = user();
    renderWorkspace({ ...EVERY_KIND, ...STALE_CACHE });
    openAllRows();
    await openFlowFor(u, "s0");

    expect(axios.post).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("still links a Script by hand, imported or typed in", async () => {
    // Both Scripts: the one an import created and the one somebody typed.
    // Neither has a detector, and both connect the ordinary way.
    const u = user();
    const ctx = renderWorkspace(EVERY_KIND);

    await openLinkFor(u, "s0");
    await u.click(screen.getByTestId("fw-link-option-s0-c0"));
    await u.click(screen.getByTestId("fw-link-apply"));
    expect(ctx.addEdge).toHaveBeenCalledWith(
      expect.objectContaining({ from: "s0", to: "c0" })
    );

    ctx.addEdge.mockClear();
    await openLinkFor(u, "s1");
    await u.click(screen.getByTestId("fw-link-option-s1-d0"));
    await u.click(screen.getByTestId("fw-link-apply"));
    // The direction the existing rule infers for Script -> Dataset, which is
    // not something this change touched.
    expect(ctx.addEdge).toHaveBeenCalledWith(
      expect.objectContaining({ from: "s1", to: "d0", type: "links_to" })
    );
  });
});
