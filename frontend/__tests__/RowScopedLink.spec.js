import { useContext, useEffect } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
import axios from "axios";

// The workflow drawing is vis-network, which jsdom cannot host. The External
// data dialog under test lives in the same component, not in the drawing.
jest.mock("../components/Workflow/Graph", () => () => null);
jest.mock("../components/Workflow/Legend", () => () => null);

import FigureWorkspace from "../components/CuratorElements/FigureWorkspace";
import WorkflowInfoForm from "../components/CuratorForms/WorkflowInfoForm";
import CuratorContext from "../Context/Curator/curatorContext";
import CuratorState from "../Context/Curator/CuratorState";
import CuratorHelperState from "../Context/CuratorHelpers/curatorHelperState";
import SourceTreeState from "../Context/SourceTree/SourceTreeState";
import SpotlightState from "../Context/Spotlight/SpotlightState";
import AlertContext from "../Context/Alert/alertContext";

// ROW-SCOPED CREATION, END TO END.
//
// Real Curator state, the real resource manager, the real RCC importer and
// the real manual forms. The only stand-ins are the network (a fixture folder
// analysis) and the alert sink. What is checked is what ends up in the draft:
// how many records, how many edges, which way the edges point.
//
// The central case is the one that used to go wrong: LINK on an existing
// row, From RCC, pick a candidate, confirm -- and the imported record arrived
// as an independent node, with the link the curator had asked for dropped.

const FOLDER = "https://notebook.rcc.uchicago.edu/files/proj";

const datasetCandidate = (over = {}) => ({
  id: "dataset-0",
  kind: "dataset",
  label: "short_traj",
  file_count: 2,
  confidence: "medium",
  evidence: ["2 data file(s) in data/short_traj"],
  needs_input: [],
  paths: ["data/short_traj/traj_1.xyz", "data/short_traj/traj_2.xyz"],
  ai_sources: [],
  inventory: { file_count: 2, extensions: [], sample_names: [] },
  proposal: {
    files: ["data/short_traj"],
    readme: "A short trajectory",
    URLs: [],
    extraFields: [],
  },
  ...over,
});

const analysisWith = (datasets) => ({
  root: FOLDER,
  truncated: false,
  warnings: [],
  counts: { files: 3, directories: 2 },
  candidates: {
    charts: [],
    datasets,
    scripts: [],
    tools: [],
    unclassified: [],
    unclassified_total: 0,
    grouped_unclassified: [],
    boundary_trees: {},
    applied_boundaries: {},
    possible_dependencies: [],
  },
});

// Everything the draft holds, read straight off Curator state.
const Probe = () => {
  const { charts, scripts, datasets, tools, heads, workflow } =
    useContext(CuratorContext);
  const all = [charts, scripts, datasets, tools, heads].flat();
  return (
    <div>
      <span data-testid="live-ids">{all.map((a) => a.id).join(" ")}</span>
      <span data-testid="live-datasets">
        {datasets.map((d) => `${d.id}:${d.readme}`).join("|") || "none"}
      </span>
      <span data-testid="live-heads">
        {heads.map((h) => `${h.id}:${h.readme}`).join("|") || "none"}
      </span>
      <span data-testid="live-edges">
        {((workflow || {}).edges || [])
          .map((e) => `${e.from}>${e.to}:${e.type}${e.feedback ? ":fb" : ""}`)
          .join(" ") || "none"}
      </span>
    </div>
  );
};

const Seed = ({ extra = {} }) => {
  const { setAll, setFileServerPath } = useContext(CuratorContext);
  useEffect(() => {
    setAll({
      scripts: [{ id: "s0", readme: "analysis.py", files: ["analysis.py"] }],
      charts: [{ id: "c0", caption: "Density of states" }],
      workflow: { nodes: [], edges: [] },
      ...extra,
    });
    setFileServerPath(FOLDER);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

const renderLive = (extra) => {
  localStorage.clear();
  return render(
    <AlertContext.Provider value={{ setAlert: jest.fn(), unsetAlert: jest.fn() }}>
      <CuratorState draftKey={null}>
        <SourceTreeState>
          <CuratorHelperState>
            <SpotlightState>
              <Seed extra={extra} />
              <FigureWorkspace />
              {/* Where the External data dialog lives on the real page. */}
              <WorkflowInfoForm dialogOnly />
              <Probe />
            </SpotlightState>
          </CuratorHelperState>
        </SourceTreeState>
      </CuratorState>
    </AlertContext.Provider>
  );
};

const user = () => userEvent.setup({ delay: null });

const edgesNow = () => screen.getByTestId("live-edges").textContent;
const datasetsNow = () => screen.getByTestId("live-datasets").textContent;

// source row -> LINK -> From RCC -> Datasets
const openRccFromRow = async (u, rowId = "s0") => {
  await u.click(await screen.findByTestId(`fw-linkmenu-${rowId}`));
  await u.hover(await screen.findByTestId("fw-source-rcc"));
  await u.click(await screen.findByTestId("fw-rcc-dataset"));
  return screen.findByRole("checkbox", { name: /select short_traj/i });
};

// source row -> LINK -> Enter manually -> Dataset
const openManualFromRow = async (u, rowId = "s0") => {
  await u.click(await screen.findByTestId(`fw-linkmenu-${rowId}`));
  await u.hover(await screen.findByTestId("fw-source-manual"));
  await u.click(await screen.findByTestId(`fw-add-${rowId}-dataset`));
  return screen.findByRole("dialog");
};

// The network, by route: the folder analysis gets the fixture, and the file
// tree the Curator lists for its pickers gets an empty folder.
let analysisResponse;
const answerByRoute = (url) =>
  Promise.resolve(
    /analyze-folder/.test(url)
      ? { data: analysisResponse }
      : { data: { files: [] } }
  );

beforeEach(() => {
  jest.clearAllMocks();
  analysisResponse = analysisWith([datasetCandidate()]);
  axios.post.mockImplementation(answerByRoute);
  axios.get.mockImplementation(answerByRoute);
});

describe("LINK -> From RCC", () => {
  it("creates the imported record AND its link, never an independent node",
     async () => {
    const u = user();
    renderLive();
    const box = await openRccFromRow(u);
    await u.click(box);
    await u.click(screen.getByTestId("apply-selected"));

    // Exactly one imported record...
    await waitFor(() => expect(datasetsNow()).toBe("d0:A short trajectory"));
    // ...and exactly one edge, joining it to the row LINK was opened on.
    expect(edgesNow()).toBe("d0>s0:consumes");
  });

  it("says what it will do before it does it", async () => {
    const u = user();
    renderLive();
    const box = await openRccFromRow(u);
    await u.click(box);

    const section = within(screen.getByTestId("connection-section"));
    // Concrete ends: the candidate's own name and the source row's.
    expect(
      section.getByLabelText("Dataset: short_traj · 2 files → Script: analysis.py")
    ).toBeChecked();
    expect(
      section.getByLabelText("Script: analysis.py → Dataset: short_traj · 2 files")
    ).not.toBeChecked();
    expect(screen.getByTestId("connection-type")).toHaveValue("consumes");
    expect(screen.getByTestId("connection-summary")).toHaveTextContent(
      "Dataset: short_traj · 2 files → consumes → Script: analysis.py"
    );
    expect(screen.getByTestId("apply-selected")).toHaveTextContent(
      /create and link/i
    );
  });

  it("uses the direction and relationship chosen in the dialog", async () => {
    const u = user();
    renderLive();
    const box = await openRccFromRow(u);
    await u.click(box);
    // Script -> Dataset is not `consumes`, so the relationship falls back to
    // the generic arrow, which the curator can see before confirming.
    await u.click(screen.getByTestId("connection-dir-source-to-new"));
    expect(screen.getByTestId("connection-type")).toHaveValue("links_to");
    await u.click(screen.getByTestId("apply-selected"));

    await waitFor(() => expect(edgesNow()).toBe("s0>d0:links_to"));
    expect(datasetsNow()).toBe("d0:A short trajectory");
  });

  it("shows the new record connected on every surface", async () => {
    const u = user();
    renderLive();
    await u.click(await openRccFromRow(u));
    await u.click(screen.getByTestId("apply-selected"));
    await waitFor(() => expect(edgesNow()).toBe("d0>s0:consumes"));

    expect(screen.getByTestId("fw-state-d0")).not.toHaveTextContent(
      "Not connected"
    );
    fireEvent.click(screen.getByTestId("fw-state-d0"));
    fireEvent.click(screen.getByTestId("fw-state-s0"));
    expect(
      within(screen.getByTestId("fw-node-d0")).getByTestId("fw-unlink-d0-s0")
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("fw-node-s0")).getByTestId("fw-unlink-d0-s0")
    ).toBeInTheDocument();
  });

  it("cannot be confirmed twice into a second record or edge", async () => {
    const u = user();
    renderLive();
    await u.click(await openRccFromRow(u));
    const confirm = screen.getByTestId("apply-selected");
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await waitFor(() => expect(edgesNow()).toBe("d0>s0:consumes"));
    expect(datasetsNow()).toBe("d0:A short trajectory");
  });

  it("creates nothing when cancelled", async () => {
    const u = user();
    renderLive();
    await u.click(await openRccFromRow(u));
    await u.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(datasetsNow()).toBe("none");
    expect(edgesNow()).toBe("none");
  });

  it("creates and links a candidate with a blank field -- nothing is required", async () => {
    analysisResponse = analysisWith([
      datasetCandidate({
        // No files: fine, they can be filled in later.
        proposal: { files: [], readme: "Short trajectory", URLs: [],
                    extraFields: [] },
      }),
    ]);
    const u = user();
    renderLive();
    await u.click(await openRccFromRow(u));
    await u.click(screen.getByTestId("apply-selected"));

    expect(screen.queryByTestId("blocked-summary")).toBeNull();
    await waitFor(() => expect(edgesNow()).toBe("d0>s0:consumes"));
    expect(datasetsNow()).toBe("d0:Short trajectory");
  });

  it("creates nothing when the source row is gone before confirming", async () => {
    // The intent names s0. If s0 is removed while the importer is open, the
    // import is refused -- not quietly downgraded to an unconnected record.
    const u = user();
    renderLive();
    await u.click(await openRccFromRow(u));
    // Remove the source from underneath the open dialog.
    fireEvent.click(screen.getByTestId("fw-remove-s0"));
    await u.click(screen.getByTestId("apply-selected"));

    expect(screen.getByTestId("connection-problem")).toHaveTextContent(
      /no longer in this paper/i
    );
    expect(datasetsNow()).toBe("none");
    expect(edgesNow()).toBe("none");
  });
});

describe("NEW RESOURCE -> From RCC", () => {
  it("stays intentionally independent: one record, no edge", async () => {
    const u = user();
    renderLive();
    await u.click(await screen.findByTestId("fw-new-resource"));
    await u.hover(await screen.findByTestId("fw-source-rcc"));
    await u.click(await screen.findByTestId("fw-rcc-dataset"));
    await u.click(
      await screen.findByRole("checkbox", { name: /select short_traj/i })
    );

    // No connection is offered, and the button says what it always said.
    expect(screen.queryByTestId("connection-section")).toBeNull();
    expect(screen.getByTestId("apply-selected")).not.toHaveTextContent(
      /create and link/i
    );
    await u.click(screen.getByTestId("apply-selected"));

    await waitFor(() => expect(datasetsNow()).toBe("d0:A short trajectory"));
    expect(edgesNow()).toBe("none");
  });

  it("offers no Link existing, because there is nothing to link to", async () => {
    const u = user();
    renderLive();
    await u.click(await screen.findByTestId("fw-new-resource"));
    expect(screen.queryByText(/link existing/i)).toBeNull();
  });
});

describe("LINK -> Enter manually", () => {
  const fillDataset = async (u, readme) => {
    const node = await screen.findByRole("dialog");
    fireEvent.change(node.querySelector('[name="files"]'), {
      target: { value: "data/raw.csv" },
    });
    fireEvent.change(node.querySelector('[name="readme"]'), {
      target: { value: readme },
    });
    return within(node);
  };

  it("creates the record and the chosen edge in one save", async () => {
    const u = user();
    renderLive();
    await openManualFromRow(u);
    const dialog = await fillDataset(u, "raw spectra");

    // The endpoint text follows what was typed.
    expect(
      dialog.getByLabelText("Dataset: raw spectra → Script: analysis.py")
    ).toBeChecked();
    await u.click(dialog.getByRole("button", { name: /create and link/i }));

    await waitFor(() => expect(datasetsNow()).toBe("d0:raw spectra"));
    expect(edgesNow()).toBe("d0>s0:consumes");
  });

  it("honours an edited direction and relationship", async () => {
    const u = user();
    renderLive();
    await openManualFromRow(u);
    const dialog = await fillDataset(u, "raw spectra");
    await u.click(dialog.getByTestId("connection-dir-source-to-new"));
    await u.click(dialog.getByRole("button", { name: /create and link/i }));

    await waitFor(() => expect(edgesNow()).toBe("s0>d0:links_to"));
  });

  it("creates and links a blank record -- nothing is required", async () => {
    const u = user();
    renderLive();
    await openManualFromRow(u);
    const dialog = within(await screen.findByRole("dialog"));
    await u.click(dialog.getByRole("button", { name: /create and link/i }));

    await waitFor(() => expect(edgesNow()).toBe("d0>s0:consumes"));
    expect(datasetsNow()).toMatch(/^d0:/);
  });

  it("defaults a new Figure under a Script to Script -> Figure, generates",
     async () => {
    const u = user();
    renderLive();
    await u.click(await screen.findByTestId("fw-linkmenu-s0"));
    await u.hover(await screen.findByTestId("fw-source-manual"));
    await u.click(await screen.findByTestId("fw-add-s0-chart"));
    const dialog = within(await screen.findByRole("dialog"));

    expect(dialog.getByTestId("connection-dir-source-to-new")).toBeChecked();
    expect(dialog.getByTestId("connection-type")).toHaveValue("generates");
  });
});

describe("LINK -> Enter manually -> External data", () => {
  it("creates the external record and its link in one save", async () => {
    const u = user();
    renderLive();
    await u.click(await screen.findByTestId("fw-linkmenu-s0"));
    await u.hover(await screen.findByTestId("fw-source-manual"));
    await u.click(await screen.findByTestId("fw-add-s0-head"));
    const node = await screen.findByRole("dialog");
    fireEvent.change(node.querySelector('[name="readme"]'), {
      target: { value: "Materials Project entry" },
    });
    const dialog = within(node);
    expect(
      dialog.getByTestId("connection-dir-source-to-new")
    ).toBeChecked();
    await u.click(dialog.getByRole("button", { name: /create and link/i }));

    await waitFor(() =>
      expect(screen.getByTestId("live-heads")).toHaveTextContent(
        "h0:Materials Project entry"
      )
    );
    expect(edgesNow()).toBe("s0>h0:links_to");
  });
});
