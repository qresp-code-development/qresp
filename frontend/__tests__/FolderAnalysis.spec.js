import { useContext, useEffect, useState } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
import axios from "axios";

import FolderAnalysis from "../components/CuratorElements/FolderAnalysis";
import CuratorState from "../Context/Curator/CuratorState";
import { readFileSync } from "fs";
import { join as pathJoin } from "path";

// A CARD RENDER COUNTER THAT NEEDS NO INSTRUMENTATION IN THE PRODUCT.
//
// `CandidateCard` calls `toDraft(kind, proposal)` exactly once per render,
// with THIS candidate's own proposal object, so a spy on it says which cards
// React rendered and how many times. The only other caller is the effect that
// builds the initial drafts, which runs when an analysis arrives and not on
// any interaction -- the tests below clear the spy after opening the dialog.
//
// Everything else about the module stays real: `...actual` keeps the field
// contract itself under test rather than replacing it with a stub.
// The chart-image row's own render counter: it calls buildFileUrl(base, path)
// once per render for its own image, and nothing else in this dialog calls it.
jest.mock("../Utils/fileServerUrl", () => {
  const actual = jest.requireActual("../Utils/fileServerUrl");
  return { ...actual, buildFileUrl: jest.fn(actual.buildFileUrl) };
});
import { buildFileUrl } from "../Utils/fileServerUrl";

jest.mock("../Utils/artifactFields", () => {
  const actual = jest.requireActual("../Utils/artifactFields");
  return { ...actual, toDraft: jest.fn(actual.toDraft) };
});
import {
  missingRequired,
  requiredKeys,
  toDraft,
} from "../Utils/artifactFields";
import CuratorContext from "../Context/Curator/curatorContext";
import AlertContext from "../Context/Alert/alertContext";

const FOLDER = "https://notebook.rcc.uchicago.edu/files/10.1021.acs.jpcc.5c01077";

const analysis = {
  root: FOLDER,
  truncated: false,
  warnings: [],
  counts: { files: 12, directories: 8 },
  candidates: {
    charts: [
      {
        id: "chart-0",
        kind: "chart",
        label: "figure1.png",
        file_count: 1,
        confidence: "high",
        evidence: [
          "figures/figure1.png is a .png image",
          "Filename hints (not metadata): figure",
        ],
        needs_input: ["caption", "number", "properties"],
        paths: ["figures/figure1.png"],
        // An image and nothing else: no README, no notebook markdown, so
        // there is nothing to caption FROM.
        ai_sources: [],
        inventory: {
          file_count: 1,
          extensions: [{ extension: ".png", count: 1 }],
          sample_names: ["figure1.png"],
        },
        proposal: {
          imageFile: "figures/figure1.png",
          files: [],
          notebookFile: "",
          number: "",
          caption: "",
          properties: [],
          extraFields: [],
        },
      },
    ],
    datasets: [
      {
        id: "dataset-0",
        kind: "dataset",
        label: "short_traj",
        file_count: 2,
        confidence: "medium",
        evidence: ["2 data file(s) in data/short_traj"],
        needs_input: ["readme"],
        paths: ["data/short_traj/traj_1.xyz", "data/short_traj/traj_2.xyz"],
        ai_sources: [
          {
            type: "readme",
            path: "data/short_traj/README.md",
            excerpt: "A short 2 ps trajectory of 64 water molecules.",
          },
        ],
        inventory: {
          file_count: 2,
          extensions: [{ extension: ".xyz", count: 2 }],
          sample_names: ["traj_1.xyz", "traj_2.xyz"],
        },
        proposal: {
          files: ["data/short_traj/traj_1.xyz", "data/short_traj/traj_2.xyz"],
          readme: "",
          URLs: [],
          extraFields: [],
        },
      },
    ],
    scripts: [
      {
        id: "script-0",
        kind: "script",
        label: "plot_vdos.py",
        file_count: 1,
        confidence: "high",
        evidence: [
          "scripts/plot_vdos.py is a .py script",
          "Header/docstring found (shown as evidence, not copied into the " +
            "description): Plot the vibrational density of states.",
        ],
        needs_input: ["readme"],
        paths: ["scripts/plot_vdos.py"],
        ai_sources: [
          {
            type: "docstring",
            path: "scripts/plot_vdos.py",
            excerpt: "Plot the vibrational density of states.",
          },
          {
            type: "python_symbols",
            path: "scripts/plot_vdos.py",
            names: ["load_vdos", "plot_vdos"],
          },
        ],
        inventory: {
          file_count: 1,
          extensions: [{ extension: ".py", count: 1 }],
          sample_names: ["plot_vdos.py"],
        },
        proposal: {
          files: ["scripts/plot_vdos.py"],
          readme: "",
          URLs: [],
          extraFields: [],
        },
      },
    ],
    tools: [
      {
        id: "tool-0",
        kind: "tool",
        label: "numpy 1.26.4",
        file_count: 1,
        confidence: "high",
        evidence: ["numpy 1.26.4 pinned in requirements.txt"],
        needs_input: ["description"],
        paths: ["requirements.txt"],
        ai_sources: [
          { type: "declarations", path: "", names: ["numpy 1.26.4"] },
        ],
        inventory: {
          file_count: 1,
          extensions: [{ extension: ".txt", count: 1 }],
          sample_names: ["requirements.txt"],
        },
        proposal: {
          kind: "software",
          packageName: "numpy",
          version: "1.26.4",
          executableName: "",
          patches: [],
          description: "",
          urls: "",
          extraFields: [],
        },
      },
    ],
    unclassified: [],
    unclassified_total: 1,
    grouped_unclassified: [
      {
        path: "",
        name: "folder root",
        file_count: 1,
        extensions: [".md"],
        sample_names: ["README.md"],
      },
    ],
    boundary_trees: {},
    applied_boundaries: {},
    possible_dependencies: ["ase"],
  },
};

// A user with userEvent's artificial inter-event delay removed.
//
// The Folder Analysis dialog is one of the largest trees in the app, and
// userEvent pauses between the events it dispatches. That pause dominates any
// test that drives this dialog hard -- a 14-character description spends most
// of a 5s budget waiting between keystrokes, and a click that re-renders 30
// candidate cards is not much cheaper.
//
// `delay: null` removes ONLY the pause. Every event still fires, in the same
// order, through the same handlers -- nothing asserted changes, and no
// product behaviour is involved. Used where it was MEASURED to matter, not
// everywhere: a test that clicks one button does not need it.
const noDelayUser = () => userEvent.setup({ delay: null });

// Puts `text` into a field in ONE event, the way pasting does.
//
// `user.type` fires a key event per character, and every one of them
// re-renders the whole Folder Analysis dialog -- one of the largest trees in
// the app. A 14-character description costs ~1.4s that way even with the
// inter-key delay removed, which is most of a 5s test budget spent on
// re-renders that assert nothing.
//
// The tests that use this are about a value the curator ENTERED, not about
// keystroke mechanics, and a paste is a real thing a curator does. Tests that
// are genuinely about editing or appending keep `user.type`.
const fill = async (user, element, text) => {
  await user.click(element);
  await user.paste(text);
};

// WHAT RCC CANNOT KNOW, answered the way a curator would.
//
// A folder holds an image; it does not hold the figure's number in the paper
// or the caption the paper printed under it. Import now refuses an
// incomplete artifact exactly as the Add form does, so a test that wants one
// added has to answer the same questions -- which is the point of the gate,
// and the reason these values live in one place rather than in twenty tests.
const ANSWER_FOR = {
  number: "1",
  caption: "Density of states",
  properties: "dos",
  readme: "Notes on this record",
  files: "data/example",
  imageFile: "figures/figure1.png",
  packageName: "Quantum ESPRESSO",
  version: "7.2",
};

// Answers every BLANK required field on every card currently showing its
// fields -- a card shows them once it is selected. Blank only: a value the
// test typed is the thing the test is about and is never written over.
//
// `fireEvent.change` rather than typing, because these tests are about what
// the record ends up holding, not about keystrokes.
// Nothing is required any more (requiredKeys is empty for every kind). Tests
// that check WHAT an import creates still answer the fields a curator would
// usually fill, which are the ones that used to be required.
const FORMERLY_REQUIRED = {
  chart: ["imageFile", "number", "properties"],
  dataset: ["files"],
  script: ["files"],
  tool: ["packageName", "version"],
};

const completeRequired = () => {
  screen.queryAllByTestId(/^field-group-/).forEach((group) => {
    const rest = group.dataset.testid.replace("field-group-", "");
    const field = rest.split("-").pop();
    const kind = rest.split("-")[0];
    if (!(FORMERLY_REQUIRED[kind] || []).includes(field)) return;
    const input = group.querySelector("input, textarea");
    if (!input || input.value) return;
    fireEvent.change(input, { target: { value: ANSWER_FOR[field] || "x" } });
  });
};

// A card says nothing about a missing field until an Add has been asked for
// and refused. A test about that message asks first.
const askToAdd = async (user, name = /add selected items/i) =>
  user.click(screen.getByRole("button", { name }));

const renderWith = (context = {}) => {
  const addMany = jest.fn();
  const setAlert = jest.fn();
  render(
    <AlertContext.Provider value={{ setAlert }}>
      <CuratorContext.Provider
        value={{ fileServerPath: FOLDER, addMany, ...context }}
      >
        <FolderAnalysis />
      </CuratorContext.Provider>
    </AlertContext.Provider>
  );
  return { addMany, setAlert };
};

const analyzeButton = () =>
  screen.getByRole("button", { name: /analyze rcc folder/i });

const openAnalysis = async (user) => {
  await user.click(analyzeButton());
  await screen.findByRole("tab", { name: /charts \(1\)/i });
};

describe("Analyze RCC Folder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: analysis });
  });

  it("is unavailable until a folder is selected, and sends nothing", () => {
    renderWith({ fileServerPath: "" });
    const button = analyzeButton();
    expect(button).toBeDisabled();
    // The reason rides on the trigger as a tooltip, so the button can sit in
    // a tight action row without a sentence beside it.
    expect(
      screen.getByLabelText(/pick a file server folder first/i)
    ).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("an explicit empty path wins over a saved one (nothing picked yet)", () => {
    // The File Server form passes its own selection, so a stale saved path
    // can never be analyzed behind the curator's back.
    render(
      <AlertContext.Provider value={{ setAlert: jest.fn() }}>
        <CuratorContext.Provider
          value={{ fileServerPath: FOLDER, addMany: jest.fn() }}
        >
          <FolderAnalysis path="" />
        </CuratorContext.Provider>
      </AlertContext.Provider>
    );
    expect(analyzeButton()).toBeDisabled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("analyzes the SAVED path only — no second URL input exists", async () => {
    const user = userEvent.setup();
    renderWith();
    // The component offers no way to type a different location.
    expect(screen.queryByRole("textbox")).toBeNull();

    await openAnalysis(user);
    expect(axios.post).toHaveBeenCalledWith("/api/curation/analyze-folder", {
      path: FOLDER,
    });
  });

  it("renders each kind in its own group with a compact summary", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);

    expect(screen.getByRole("tab", { name: /datasets \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /scripts \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /tools \(1\)/i })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /unclassified \(1\)/i })
    ).toBeInTheDocument();

    // No evidence badge: it answered how the ANALYSER reached the proposal,
    // not anything the curator has to act on. Ranking still uses it.
    expect(screen.queryByTestId("confidence-chart-0")).toBeNull();
    expect(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    ).toBeInTheDocument();
    // And nothing about what is missing. A folder of twelve figures used to
    // open as twelve identical warnings about work nobody had started yet.
    expect(screen.queryByTestId("needs-input-chart-0")).toBeNull();
    expect(screen.queryByText(/needs /i)).toBeNull();
  });

  it("uses compact labels per kind and keeps full paths under Details", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);

    // A short name in the header; the exact path stays in Details.
    expect(screen.getByText("figure1.png")).toBeInTheDocument();
    expect(screen.queryByText(/figure1\.png is a \.png image/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: /^details$/i }));
    // The exact relative path and the evidence live here.
    expect(
      await screen.findByText(/figures\/figure1\.png is a \.png image/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Files: figures\/figure1\.png/i)
    ).toBeInTheDocument();
  });

  it("labels scripts, datasets and tools compactly too", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);

    await user.click(screen.getByRole("tab", { name: /scripts \(1\)/i }));
    // Basename first, parent directory as secondary text.
    expect(screen.getByText("plot_vdos.py · 1 file")).toBeInTheDocument();
    expect(screen.getByText("scripts")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /datasets \(1\)/i }));
    expect(screen.getByText("short_traj · 2 files")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /tools \(1\)/i }));
    expect(screen.getByText("numpy 1.26.4")).toBeInTheDocument();
  });

  it("does not render editable fields for unselected candidates", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);

    // A compact card: no six empty inputs sitting there by default.
    expect(screen.queryByLabelText(/^figure caption ?\*?$/i)).toBeNull();
    expect(screen.queryByLabelText(/^figure image ?\*?$/i)).toBeNull();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);

    // Selecting reveals them...
    await user.click(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    );
    expect(await screen.findByLabelText(/^figure caption ?\*?$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^figure image ?\*?$/i)).toBeInTheDocument();
    // The rule is stated ONCE, in the note at the top.
    expect(screen.getByTestId("required-note")).toHaveTextContent(
      /nothing here is required/i
    );
    expect(screen.queryAllByText(/nothing here is required/i)).toHaveLength(1);
  });

  it("Edit proposal opens the fields without selecting the candidate", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);

    await user.click(screen.getByRole("button", { name: /edit proposal/i }));

    expect(await screen.findByLabelText(/^figure caption ?\*?$/i)).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: /add selected items/i })
    ).toBeDisabled();
  });

  it("keeps candidate actions in their own non-breaking action group", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);

    const actions = screen.getByTestId("actions-chart-0");
    // The three actions live together, so they wrap as one block rather than
    // the row tearing a label apart.
    ["Details", "Edit Proposal", "Remove"].forEach((label) => {
      expect(actions).toHaveTextContent(label);
    });
    // Multi-word labels must never break word by word.
    expect(
      screen.getByRole("button", { name: "Edit Proposal" })
    ).toHaveStyle("white-space: nowrap");
    // The group wraps its buttons onto another line rather than keeping the
    // full four-button width and pushing the card sideways.
    expect(actions).toHaveStyle("flex-wrap: wrap");
    expect(actions).toHaveStyle("min-width: 0");
  });

  it("separates the editable fields from the header with real spacing", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);

    // Closed by default...
    expect(screen.queryByTestId("fields-chart-0")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Edit Proposal" }));
    const fields = await screen.findByTestId("fields-chart-0");
    // ...and when open it is a spaced grid, visually detached from the
    // header/evidence above (a divider precedes it).
    expect(fields.previousElementSibling).toHaveClass("MuiDivider-root");
    // The required note is stated ONCE, at the top of the dialog.
    expect(screen.getAllByTestId("required-note")).toHaveLength(1);
    expect(screen.getByLabelText(/^figure caption ?\*?$/i)).toBeInTheDocument();
  });

  it("labels evidence per field, not one badge for the whole card", async () => {
    axios.post.mockResolvedValue({
      data: {
        ...analysis,
        candidates: {
          ...analysis.candidates,
          charts: [
            {
              ...analysis.candidates.charts[0],
              field_evidence: {
                imageFile: "high",
                notebookFile: "medium",
                number: "needs_input",
                caption: "needs_input",
              },
            },
          ],
        },
      },
    });
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await user.click(screen.getByRole("button", { name: "Edit Proposal" }));

    // The detected path and the unverifiable figure number must not look
    // alike.
    // No per-field evidence chip either. The curator judges the VALUE, which
    // is in the input in front of them.
    await screen.findByTestId("fields-chart-0");
    expect(
      screen.queryByTestId("field-evidence-chart-0-imageFile")
    ).toBeNull();
    expect(
      screen.queryByTestId("field-evidence-chart-0-number")
    ).toBeNull();
    expect(
      screen.queryByTestId("field-evidence-chart-0-notebookFile")
    ).toBeNull();
    expect(
      screen.queryByTestId("field-evidence-chart-0-caption")
    ).toBeNull();
  });

  it("shows filename hints in Details, clearly marked as unverified", async () => {
    axios.post.mockResolvedValue({
      data: {
        ...analysis,
        candidates: {
          ...analysis.candidates,
          charts: [
            {
              ...analysis.candidates.charts[0],
              filename_hints: [
                "Detected from filename (not verified metadata): embedded",
                "Name-similar file, relationship not verified: data/f1.csv",
              ],
            },
          ],
        },
      },
    });
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);

    // Not on the card by default.
    expect(screen.queryByTestId("hints-chart-0")).toBeNull();

    await user.click(screen.getByRole("button", { name: /^details$/i }));
    const hints = await screen.findByTestId("hints-chart-0");
    expect(hints).toHaveTextContent(/not verified metadata, never used as a/i);
    expect(hints).toHaveTextContent("embedded");
    expect(hints).toHaveTextContent("data/f1.csv");

    // And still not a field value.
    await user.click(screen.getByRole("button", { name: "Edit Proposal" }));
    // A chart's keywords are STORED in `properties` for compatibility, but
    // every surface calls them Keywords.
    expect(
      screen.getByLabelText(/^keywords/i, { selector: "input" })
    ).toHaveValue("");
  });

  it("a Low evidence candidate still shows its name and path", async () => {
    // Low confidence is about how sure we are it is a Chart — it must never
    // cost the candidate its identity.
    axios.post.mockResolvedValue({
      data: {
        ...analysis,
        candidates: {
          ...analysis.candidates,
          charts: [
            {
              ...analysis.candidates.charts[0],
              id: "chart-9",
              label: "fig9",
              file_count: 2,
              confidence: "low",
              paths: ["charts/fig9/panel_a.png", "charts/fig9/panel_b.png"],
              proposal: {
                ...analysis.candidates.charts[0].proposal,
                imageFile: "",
                files: [],
              },
            },
          ],
        },
      },
    });
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);

    // A weakly-evidenced candidate is still listed, with its name and path,
    // and is no longer labelled with the analyser's confidence.
    expect(screen.getByText("fig9")).toBeInTheDocument();
    expect(screen.queryByTestId("confidence-chart-9")).toBeNull();
    expect(
      screen.getByRole("checkbox", { name: /select fig9/i })
    ).toBeInTheDocument();
    // The exact path is reachable, on the header tooltip and in Details.
    expect(screen.getByText("fig9").closest("[title]")).toHaveAttribute(
      "title",
      "charts/fig9/panel_a.png"
    );
  });

  it("names each dataset after its own boundary, never the role root", async () => {
    axios.post.mockResolvedValue({
      data: {
        ...analysis,
        candidates: {
          ...analysis.candidates,
          datasets: [
            {
              ...analysis.candidates.datasets[0],
              id: "dataset-0",
              label: "DFT",
              file_count: 3,
              paths: ["data/DFT/Figure2/a.in"],
              proposal: { files: ["data/DFT"], readme: "", URLs: [],
                extraFields: [] },
            },
            {
              ...analysis.candidates.datasets[0],
              id: "dataset-1",
              label: "other",
              file_count: 1,
              paths: ["data/other/x.dat"],
              proposal: { files: ["data/other"], readme: "", URLs: [],
                extraFields: [] },
            },
            {
              ...analysis.candidates.datasets[0],
              id: "dataset-2",
              label: "loose.csv",
              file_count: 1,
              paths: ["data/loose.csv"],
              proposal: { files: ["data/loose.csv"], readme: "", URLs: [],
                extraFields: [] },
            },
          ],
        },
      },
    });
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await user.click(screen.getByRole("tab", { name: /datasets \(3\)/i }));

    // Three distinct names and three real counts — not "data · 1 file"
    // three times over.
    expect(screen.getByText("DFT · 3 files")).toBeInTheDocument();
    expect(screen.getByText("other · 1 file")).toBeInTheDocument();
    expect(screen.getByText("loose.csv · 1 file")).toBeInTheDocument();
    expect(screen.queryByText("data · 1 file")).toBeNull();
  });

  it("a nameless candidate is never rendered, selected, or added", async () => {
    axios.post.mockResolvedValue({
      data: {
        ...analysis,
        candidates: {
          ...analysis.candidates,
          datasets: [
            analysis.candidates.datasets[0],
            // Malformed: no label and no paths. It must not reach the UI.
            {
              id: "dataset-broken",
              kind: "dataset",
              label: "",
              file_count: 0,
              confidence: "low",
              evidence: [],
              needs_input: [],
              paths: [],
              proposal: { files: [], readme: "", URLs: [], extraFields: [] },
            },
          ],
        },
      },
    });
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await openAnalysis(user);

    // The tab counts only what a curator can actually judge.
    expect(
      screen.getByRole("tab", { name: /datasets \(1\)/i })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);

    // Select everything on offer and apply: the broken one cannot ride along.
    await user.click(screen.getByRole("tab", { name: /datasets \(1\)/i }));
    await user.click(
      screen.getByRole("checkbox", { name: /select short_traj/i })
    );
    completeRequired();
    await user.click(
      screen.getByRole("button", { name: /add selected items/i })
    );
    const [[, records]] = addMany.mock.calls;
    expect(records).toHaveLength(1);
    expect(JSON.stringify(records)).not.toContain("dataset-broken");
  });

  it("nothing is selected by default", async () => {
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await openAnalysis(user);

    screen.getAllByRole("checkbox").forEach((box) => {
      expect(box).not.toBeChecked();
    });
    expect(
      screen.getByRole("button", { name: /add selected items/i })
    ).toBeDisabled();
    expect(addMany).not.toHaveBeenCalled();
  });

  it("collapses a long list behind Show all, discarding nothing", async () => {
    const many = {
      ...analysis,
      candidates: {
        ...analysis.candidates,
        charts: Array.from({ length: 40 }, (unused, index) => ({
          ...analysis.candidates.charts[0],
          id: `chart-${index}`,
          label: `figure${index}.png`,
          // Later ones have weaker evidence, so they sort to the back.
          confidence: index < 5 ? "high" : "medium",
          paths: [`figures/figure${index}.png`],
          proposal: {
            ...analysis.candidates.charts[0].proposal,
            imageFile: `figures/figure${index}.png`,
          },
        })),
      },
    };
    axios.post.mockResolvedValue({ data: many });
    // 40 candidate cards rendered, then re-rendered by Show all (~0.8s for
    // that click alone). Measured: the artificial inter-event delay is what
    // pushed this past the 5s budget under a full run.
    const user = noDelayUser();
    renderWith();
    await user.click(analyzeButton());
    await screen.findByRole("tab", { name: /charts \(40\)/i });

    // The tab count is honest about the total; the list shows the first 25.
    expect(screen.getAllByRole("checkbox")).toHaveLength(25);
    // Strongest evidence still leads -- the ORDER is unchanged, it is only
    // the badge that is gone, so this checks the order by name.
    expect(screen.queryAllByTestId(/^confidence-/)).toHaveLength(0);
    expect(screen.getAllByRole("checkbox")[0]).toHaveAccessibleName(
      /select figure0\.png/i
    );
    // And the rest are explicitly reachable, described as collapsed.
    expect(
      screen.getByText(/15 more with weaker evidence are collapsed, not discarded/i)
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /show all 40 candidates/i })
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(40);
    expect(
      screen.queryByRole("button", { name: /show all/i })
    ).toBeNull();
  });

  it("a selected candidate is never hidden by the collapse", async () => {
    const many = {
      ...analysis,
      candidates: {
        ...analysis.candidates,
        charts: Array.from({ length: 30 }, (unused, index) => ({
          ...analysis.candidates.charts[0],
          id: `chart-${index}`,
          label: `figure${index}.png`,
          paths: [`figures/figure${index}.png`],
          proposal: {
            ...analysis.candidates.charts[0].proposal,
            imageFile: `figures/figure${index}.png`,
          },
        })),
      },
    };
    axios.post.mockResolvedValue({ data: many });
    // 30 candidate cards, expanded and then re-rendered by a click: the
    // artificial inter-event delay is the difference between ~3s and over
    // the 5s budget. Measured, not guessed.
    const user = noDelayUser();
    renderWith();
    await user.click(analyzeButton());
    await screen.findByRole("tab", { name: /charts \(30\)/i });

    await user.click(screen.getByRole("button", { name: /show all 30/i }));
    await user.click(
      screen.getByRole("checkbox", { name: /select figure29\.png/i })
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(30);
  });

  it("renders grouped folder rows, never a raw path dump", async () => {
    axios.post.mockResolvedValue({
      data: {
        ...analysis,
        candidates: {
          ...analysis.candidates,
          unclassified: [],
          unclassified_total: 141,
          grouped_unclassified: [
            {
              path: "doc",
              name: "doc",
              file_count: 120,
              extensions: [".png", ".md"],
              sample_names: ["logo.png", "guide.md"],
            },
            {
              path: "misc",
              name: "misc",
              file_count: 21,
              extensions: [".dat"],
              sample_names: ["a.dat"],
            },
          ],
        },
      },
    });
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await user.click(screen.getByRole("tab", { name: /unclassified \(141\)/i }));

    // The full count is preserved so nothing looks silently discarded.
    expect(
      screen.getByText(/141 file\(s\) were not classified/i)
    ).toBeInTheDocument();
    // One row per folder, with its count and representative extensions.
    expect(screen.getByRole("button", { name: "doc (120)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "misc (21)" })).toBeInTheDocument();
    expect(screen.getByText(".png .md")).toBeInTheDocument();

    // Names only after an explicit expansion, and only a bounded sample.
    expect(screen.queryByText("logo.png")).toBeNull();
    await user.click(screen.getByRole("button", { name: "doc (120)" }));
    expect(await screen.findByText("logo.png")).toBeInTheDocument();
    expect(screen.getByText(/and 118 more in this folder/i)).toBeInTheDocument();
  });

  it("filters folder rows and caps how many render at once", async () => {
    const rows = Array.from({ length: 30 }, (unused, index) => ({
      path: `f${String(index).padStart(2, "0")}`,
      name: `f${String(index).padStart(2, "0")}`,
      file_count: 2,
      extensions: [".txt"],
      sample_names: ["a.txt"],
    }));
    axios.post.mockResolvedValue({
      data: {
        ...analysis,
        candidates: {
          ...analysis.candidates,
          unclassified: [],
          unclassified_total: 60,
          grouped_unclassified: rows,
        },
      },
    });
    const user = noDelayUser();
    renderWith();
    await openAnalysis(user);
    await user.click(screen.getByRole("tab", { name: /unclassified \(60\)/i }));

    // 25 rows initially, the rest behind an explicit action.
    expect(screen.getByRole("button", { name: "f24 (2)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "f25 (2)" })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /show more \(5 more folders\)/i })
    );
    expect(screen.getByRole("button", { name: "f29 (2)" })).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/filter unclassified folders/i),
      "f03"
    );
    expect(screen.getByRole("button", { name: "f03 (2)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "f04 (2)" })).toBeNull();
  });

  it("shows how the folder was read, and why", async () => {
    axios.post.mockResolvedValue({
      data: {
        ...analysis,
        structure_mode: "legacy",
        normalized_roles: { data: "datasets", figures_tables: "charts" },
        structure_issues: [
          {
            path: "figures_tables",
            reason:
              "Read as charts (Qresp Folder Standard name: charts). Nothing " +
              "on the file server is renamed.",
          },
        ],
      },
    });
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);

    // How the folder was READ is a diagnostic, so the default view no longer
    // carries a status chip for it -- only the two ways to ask.
    const controls = screen.getByTestId("structure-mode");
    expect(controls).not.toHaveTextContent("Legacy-compatible");
    expect(screen.queryByTestId("folder-mapping")).toBeNull();

    // It is still SAID, in scan details.
    await user.click(
      screen.getByRole("button", { name: /show scan details/i })
    );
    expect(
      await screen.findByTestId("scan-details-structure-mode")
    ).toHaveTextContent("Legacy-compatible");

    await user.click(
      screen.getByRole("button", { name: /show folder mapping/i })
    );
    const mapping = await screen.findByTestId("folder-mapping");
    // Every legacy name, and what it was read as -- in words. An arrow
    // here is the workflow's glyph for a relationship between artifacts,
    // and a directory being classified is not one.
    expect(mapping).toHaveTextContent("Folder names read as roles");
    expect(mapping).toHaveTextContent("data is read as datasets");
    expect(mapping).toHaveTextContent("figures_tables is read as charts");
    expect(mapping.textContent).not.toContain("→");
    expect(mapping).toHaveTextContent(/figures_tables: Read as charts/);
    expect(mapping).toHaveTextContent(/Nothing on the file server is renamed/);
  });

  it("flags a folder that needs reorganizing", async () => {
    axios.post.mockResolvedValue({
      data: {
        ...analysis,
        structure_mode: "invalid",
        structure_issues: [
          { path: "mystery", reason: "Not a Qresp Folder Standard role." },
        ],
      },
    });
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    expect(screen.getByTestId("structure-mode")).not.toHaveTextContent(
      "Needs reorganization"
    );
    await user.click(
      screen.getByRole("button", { name: /show scan details/i })
    );
    expect(
      await screen.findByTestId("scan-details-structure-mode")
    ).toHaveTextContent("Needs reorganization");
  });

  it("selects nothing by default and cannot apply until something is checked", async () => {
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await openAnalysis(user);

    const box = screen.getByRole("checkbox", {
      name: /select figure1\.png/i,
    });
    expect(box).not.toBeChecked();
    const apply = screen.getByRole("button", {
      name: /add selected items/i,
    });
    expect(apply).toBeDisabled();
    expect(addMany).not.toHaveBeenCalled();
  });

  it("applies only the selected candidates, with the curator's edits", async () => {
    // delay: null — see the note in the field-contract suite below.
    const user = noDelayUser();
    const { addMany } = renderWith();
    await openAnalysis(user);

    await user.click(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    );
    await fill(user, screen.getByLabelText(/^figure caption ?\*?$/i), "Density of states");
    completeRequired();
    await user.click(
      screen.getByRole("button", { name: /add selected items/i })
    );

    expect(addMany).toHaveBeenCalledTimes(1);
    expect(addMany).toHaveBeenCalledWith("chart", [
      expect.objectContaining({
        imageFile: "figures/figure1.png",
        caption: "Density of states",
        // The figure's number and its keywords are required, and RCC cannot
        // read either from a folder. They are answered here, on the card,
        // exactly as the Add form would ask for them -- an import that left
        // them blank is now refused.
        number: "1",
        properties: ["dos"],
        files: [],
        notebookFile: "",
        extraFields: [],
      }),
    ]);
    // No id is invented client-side: the reducer mints collision-safe ids.
    expect(addMany.mock.calls[0][1][0]).not.toHaveProperty("id");
  });

  it("removed candidates cannot be applied", async () => {
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await openAnalysis(user);

    await user.click(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    );
    await user.click(screen.getByRole("button", { name: /^remove$/i }));
    expect(screen.getByRole("tab", { name: /charts \(0\)/i })).toBeInTheDocument();

    // Nothing selectable is left, so Apply is disabled again for charts.
    await user.click(screen.getByRole("tab", { name: /tools \(1\)/i }));
    await user.click(
      screen.getByRole("checkbox", { name: /select numpy 1\.26\.4/i })
    );
    completeRequired();
    await user.click(
      screen.getByRole("button", { name: /add selected items/i })
    );
    const kinds = addMany.mock.calls.map((call) => call[0]);
    expect(kinds).toEqual(["tool"]);
  });

  it("maps tools to the manual Tool form's stored shape", async () => {
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await openAnalysis(user);
    await user.click(screen.getByRole("tab", { name: /tools \(1\)/i }));
    await user.click(
      screen.getByRole("checkbox", { name: /select numpy 1\.26\.4/i })
    );
    completeRequired();
    await user.click(
      screen.getByRole("button", { name: /add selected items/i })
    );

    expect(addMany).toHaveBeenCalledWith("tool", [
      {
        kind: "software",
        packageName: "numpy",
        version: "1.26.4",
        executableName: "",
        patches: [],
        description: "",
        urls: "",
        extraFields: [],
      },
    ]);
  });

  it("keeps dataset/script paths relative and FileTree-compatible", async () => {
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await openAnalysis(user);
    await user.click(screen.getByRole("tab", { name: /datasets \(1\)/i }));
    await user.click(
      screen.getByRole("checkbox", { name: /select short_traj/i })
    );
    completeRequired();
    await user.click(
      screen.getByRole("button", { name: /add selected items/i })
    );

    const [[, records]] = addMany.mock.calls;
    expect(records[0].files).toEqual([
      "data/short_traj/traj_1.xyz",
      "data/short_traj/traj_2.xyz",
    ]);
    records[0].files.forEach((path) => {
      expect(path.startsWith("/")).toBe(false);
      expect(path).not.toContain("://");
    });
  });

  it("never publishes or saves — applying only calls addMany", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await user.click(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    );
    completeRequired();
    await user.click(
      screen.getByRole("button", { name: /add selected items/i })
    );

    const posted = axios.post.mock.calls.map((call) => call[0]);
    expect(posted).toEqual(["/api/curation/analyze-folder"]);
    expect(axios.put).not.toHaveBeenCalled();
  });

  it("cancel applies nothing", async () => {
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await openAnalysis(user);
    await user.click(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    );
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(addMany).not.toHaveBeenCalled();
  });

  it("shows a readable error instead of candidates when the folder is refused", async () => {
    axios.post.mockRejectedValue({
      response: {
        status: 400,
        data: {
          error:
            "That folder is outside the file server roots this Qresp server " +
            "is allowed to read.",
        },
      },
    });
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await user.click(analyzeButton());
    expect(
      await screen.findByText(/outside the file server roots/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add selected items/i })
    ).toBeDisabled();
    expect(addMany).not.toHaveBeenCalled();
  });

  it("says plainly that a truncated analysis is partial, and why", async () => {
    axios.post.mockResolvedValue({
      data: {
        ...analysis,
        truncated: true,
        counts: { files: 1971, directories: 260 },
        limits: {
          max_depth: 4,
          max_files: 2000,
          max_directory_listings: 120,
          max_evidence_files: 30,
        },
        warnings: ["Only the first 4 folder levels were inspected."],
      },
    });
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);

    // The four-line Alert is no longer in the way on every open -- but the
    // fact it carried is not lost, and a curator who wonders why the list
    // looks short is one click from it.
    expect(screen.queryByTestId("partial-notice")).toBeNull();
    expect(
      screen.queryByText(/this is a partial view of the folder/i)
    ).toBeNull();

    // The numbers and the specific reason are in the scan details, closed
    // until asked for.
    expect(screen.queryByTestId("scan-details")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /show scan details/i })
    );
    const details = await screen.findByTestId("scan-details");
    // The partial-view fact, moved here rather than deleted.
    expect(details).toHaveTextContent(/this is a partial view/i);
    expect(details).toHaveTextContent(/do not represent everything/i);
    expect(details).toHaveTextContent("1971 file(s) across 260 folder(s)");
    expect(details).toHaveTextContent("at most 4 folder levels, 2000 files");
    expect(details).toHaveTextContent("120 directory listings");
    expect(details).toHaveTextContent("30 manifest/script files");
    expect(details).toHaveTextContent(
      /only the first 4 folder levels were inspected/i
    );
  });

  it("shows import hints as hints, not as tools", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await user.click(screen.getByRole("tab", { name: /tools \(1\)/i }));
    const hint = screen.getByText(/possible dependencies seen in script imports/i);
    expect(hint).toHaveTextContent("ase");
    expect(hint).toHaveTextContent(/not added as tools/i);
    expect(
      screen.queryByRole("checkbox", { name: /select ase/i })
    ).toBeNull();
  });
});

describe("type-specific RCC imports", () => {
  const TypedHarness = () => {
    const [cache, setCache] = useState({ path: "", data: null });
    const value = {
      fileServerPath: FOLDER,
      addMany: jest.fn(),
      rccAnalysisCache: cache,
      cacheRccAnalysis: (path, data) => setCache({ path, data }),
    };
    return (
      <AlertContext.Provider value={{ setAlert: jest.fn() }}>
        <CuratorContext.Provider value={value}>
          <FolderAnalysis artifactType="chart" />
          <FolderAnalysis artifactType="dataset" />
          <FolderAnalysis artifactType="script" />
          <FolderAnalysis artifactType="tool" />
        </CuratorContext.Provider>
      </AlertContext.Provider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: analysis });
  });

  it("offers one import action beside each artifact type", () => {
    render(<TypedHarness />);
    expect(
      screen.getByRole("button", { name: /import charts from rcc/i })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /import datasets from rcc/i })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /import scripts from rcc/i })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /import tools from rcc/i })
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /analyze rcc folder/i })
    ).toBeNull();
  });

  it("shows only the requested type and reuses the runtime scan", async () => {
    const user = userEvent.setup();
    render(<TypedHarness />);

    await user.click(
      screen.getByRole("button", { name: /import charts from rcc/i })
    );
    expect(
      await screen.findByRole("heading", { name: /import charts from rcc/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByText("figure1.png")).toBeInTheDocument();
    expect(screen.queryByText("short_traj")).toBeNull();
    expect(axios.post).toHaveBeenCalledTimes(1);

    const chartDialog = screen.getByRole("dialog", {
      name: /import charts from rcc/i,
    });
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    await waitForElementToBeRemoved(chartDialog);
    await user.click(
      screen.getByRole("button", { name: /import datasets from rcc/i })
    );
    expect(
      await screen.findByRole("heading", { name: /import datasets from rcc/i })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/short_traj/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("figure1.png")).toBeNull();
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it("requires a saved file server path", () => {
    render(
      <AlertContext.Provider value={{ setAlert: jest.fn() }}>
        <CuratorContext.Provider
          value={{ fileServerPath: "", addMany: jest.fn() }}
        >
          <FolderAnalysis artifactType="chart" />
        </CuratorContext.Provider>
      </AlertContext.Provider>
    );
    expect(
      screen.getByRole("button", { name: /import charts from rcc/i })
    ).toBeDisabled();
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe("Analyze RCC Folder — record boundaries", () => {
  const legacy = {
    ...analysis,
    structure_mode: "legacy",
    boundary_trees: {
      data: {
        role: "datasets",
        nodes: [
          { path: "data/DFT", name: "DFT", level: 1, file_count: 12,
            extensions: [".in"], sample_names: [] },
          { path: "data/DFT/Figure2", name: "Figure2", level: 2,
            file_count: 8, extensions: [".in"], sample_names: [] },
          { path: "data/other", name: "other", level: 1, file_count: 3,
            extensions: [".dat"], sample_names: [] },
        ],
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: legacy });
  });

  const openPicker = async (user) => {
    await openAnalysis(user);
    await user.click(
      screen.getByRole("button", { name: /choose record boundaries/i })
    );
    return screen.findByTestId("boundary-picker");
  };

  it("explains the choice and starts with nothing selected", async () => {
    const user = userEvent.setup();
    renderWith();
    await openPicker(user);

    expect(
      screen.getByText(/one selected folder becomes one proposed dataset or/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/nothing on the file server is changed/i)
    ).toBeInTheDocument();
    screen
      .getAllByRole("checkbox", { name: /use data\//i })
      .forEach((box) => expect(box).not.toBeChecked());
    // Rebuild is pointless until something is chosen.
    expect(
      screen.getByRole("button", { name: /rebuild proposals/i })
    ).toBeDisabled();
  });

  it("selecting a parent excludes its descendants", async () => {
    const user = userEvent.setup();
    renderWith();
    await openPicker(user);

    await user.click(
      screen.getByRole("checkbox", { name: "Use data/DFT as one record" })
    );
    // The child can no longer be chosen at the same time.
    expect(
      screen.getByRole("checkbox", { name: "Use data/DFT/Figure2 as one record" })
    ).toBeDisabled();
    // An unrelated sibling stays available.
    expect(
      screen.getByRole("checkbox", { name: "Use data/other as one record" })
    ).toBeEnabled();
  });

  it("selecting a child excludes its ancestor", async () => {
    const user = userEvent.setup();
    renderWith();
    await openPicker(user);

    await user.click(
      screen.getByRole("checkbox", { name: "Use data/DFT/Figure2 as one record" })
    );
    expect(
      screen.getByRole("checkbox", { name: "Use data/DFT as one record" })
    ).toBeDisabled();
  });

  it("choosing the parent after the child replaces it", async () => {
    const user = userEvent.setup();
    renderWith();
    await openPicker(user);

    const child = screen.getByRole("checkbox", {
      name: "Use data/DFT/Figure2 as one record",
    });
    await user.click(child);
    await user.click(child); // unselect
    await user.click(
      screen.getByRole("checkbox", { name: "Use data/DFT as one record" })
    );
    expect(child).toBeDisabled();
  });

  it("rebuilds through the BACKEND with the chosen boundaries", async () => {
    const user = userEvent.setup();
    renderWith();
    await openPicker(user);

    await user.click(
      screen.getByRole("checkbox", { name: "Use data/DFT/Figure2 as one record" })
    );
    await user.click(
      screen.getByRole("button", { name: /rebuild proposals/i })
    );

    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2));
    expect(axios.post.mock.calls[1][1]).toEqual({
      path: FOLDER,
      boundaries: { data: ["data/DFT/Figure2"] },
    });
    // The first analysis carried no boundaries: defaults are the default.
    expect(axios.post.mock.calls[0][1]).toEqual({ path: FOLDER });
  });

  it("Use default boundaries clears the choice and re-analyzes", async () => {
    const user = userEvent.setup();
    renderWith();
    await openPicker(user);

    await user.click(
      screen.getByRole("checkbox", { name: "Use data/DFT as one record" })
    );
    await user.click(
      screen.getByRole("button", { name: /use default boundaries/i })
    );
    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2));
    expect(axios.post.mock.calls[1][1]).toEqual({ path: FOLDER });
  });

  it("shows the REAL relative path, spelling and case preserved", async () => {
    axios.post.mockResolvedValue({
      data: {
        ...analysis,
        structure_mode: "legacy",
        normalized_roles: { Datasets: "datasets", Scripts: "scripts" },
        boundary_trees: {
          Datasets: {
            role: "datasets",
            nodes: [
              { path: "Datasets/Run_A", name: "Run_A", level: 1,
                file_count: 4, extensions: [".csv"], sample_names: [] },
            ],
          },
        },
      },
    });
    const user = userEvent.setup();
    renderWith();
    await openPicker(user);

    // The path a boundary must be submitted with, not a prettified name.
    expect(screen.getByText("Datasets/Run_A (4 files)")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Use Datasets/Run_A as one record" })
    ).toBeInTheDocument();
    expect(screen.getByText("Datasets → datasets")).toBeInTheDocument();
  });

  it("says so when a legacy root has nothing selectable", async () => {
    axios.post.mockResolvedValue({
      data: {
        ...analysis,
        structure_mode: "legacy",
        boundary_trees: { scripts: { role: "scripts", nodes: [] } },
      },
    });
    const user = userEvent.setup();
    renderWith();
    await openPicker(user);

    // Explicit guidance beats a silently hidden control.
    expect(screen.getByTestId("no-boundaries-scripts")).toHaveTextContent(
      /no selectable dataset\/script boundaries were found in scripts/i
    );
    expect(
      screen.getByRole("button", { name: /rebuild proposals/i })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /use default boundaries/i })
    ).toBeEnabled();
  });

  it("a standard layout is never asked to pick boundaries", async () => {
    axios.post.mockResolvedValue({
      data: {
        ...analysis,
        structure_mode: "standard",
        // Even if a tree were present, standard layouts do not choose.
        boundary_trees: {
          datasets: { role: "datasets", nodes: [
            { path: "datasets/d1", name: "d1", level: 1, file_count: 1,
              extensions: [".csv"], sample_names: [] },
          ] },
        },
      },
    });
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    expect(screen.queryByTestId("boundary-picker")).toBeNull();
  });
});

describe("Analyze RCC Folder — capitalized legacy folders", () => {
  // The reported staging screen: Datasets/ Figures/ Scripts/ showed no
  // Legacy-compatible badge, no selector, and three identical
  // "Datasets · 1 file" rows.
  const capitalized = {
    ...analysis,
    structure_mode: "legacy",
    normalized_roles: {
      Datasets: "datasets",
      Figures: "charts",
      Scripts: "scripts",
    },
    structure_issues: [
      { path: "Datasets", reason: "Read as datasets (Qresp Folder Standard name: datasets). Nothing on the file server is renamed." },
    ],
    boundary_trees: {
      Datasets: {
        role: "datasets",
        nodes: [
          { path: "Datasets/Run_A", name: "Run_A", level: 1, file_count: 2,
            extensions: [".csv"], sample_names: [] },
        ],
      },
      Scripts: { role: "scripts", nodes: [] },
    },
    applied_boundaries: {},
    candidates: {
      ...analysis.candidates,
      datasets: [
        { id: "dataset-0", kind: "dataset", label: "Run_A", file_count: 2,
          confidence: "medium", evidence: [], needs_input: ["readme"],
          paths: ["Datasets/Run_A/a.csv", "Datasets/Run_A/a2.csv"],
          proposal: { files: ["Datasets/Run_A"], readme: "", URLs: [],
            extraFields: [] } },
        { id: "dataset-1", kind: "dataset", label: "Run_B", file_count: 1,
          confidence: "medium", evidence: [], needs_input: ["readme"],
          paths: ["Datasets/Run_B/b.csv"],
          proposal: { files: ["Datasets/Run_B"], readme: "", URLs: [],
            extraFields: [] } },
        { id: "dataset-2", kind: "dataset", label: "loose.csv",
          file_count: 1, confidence: "medium", evidence: [],
          needs_input: ["readme"], paths: ["Datasets/loose.csv"],
          proposal: { files: ["Datasets/loose.csv"], readme: "", URLs: [],
            extraFields: [] } },
      ],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: capitalized });
  });

  it("shows the Legacy-compatible state and the boundary controls", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);

    // The state lives in scan details now; the boundary controls are what
    // this test is really about.
    expect(screen.getByTestId("structure-mode")).not.toHaveTextContent(
      "Legacy-compatible"
    );
    await user.click(
      screen.getByRole("button", { name: /choose record boundaries/i })
    );
    expect(await screen.findByTestId("boundary-picker")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /rebuild proposals/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /use default boundaries/i })
    ).toBeInTheDocument();
    // Real spelling and case, and the empty root explains itself.
    expect(screen.getByText("Datasets/Run_A (2 files)")).toBeInTheDocument();
    expect(screen.getByTestId("no-boundaries-Scripts")).toBeInTheDocument();
  });

  it("gives each dataset its own name and count", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await user.click(screen.getByRole("tab", { name: /datasets \(3\)/i }));

    expect(screen.getByText("Run_A · 2 files")).toBeInTheDocument();
    expect(screen.getByText("Run_B · 1 file")).toBeInTheDocument();
    expect(screen.getByText("loose.csv · 1 file")).toBeInTheDocument();
    // The regression: the role root repeated for every row.
    expect(screen.queryByText("Datasets · 1 file")).toBeNull();
    expect(screen.queryByText("Datasets · 2 files")).toBeNull();
  });

  it("rebuilds with a capitalized boundary path", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await user.click(
      screen.getByRole("button", { name: /choose record boundaries/i })
    );
    await user.click(
      await screen.findByRole("checkbox", {
        name: "Use Datasets/Run_A as one record",
      })
    );
    await user.click(
      screen.getByRole("button", { name: /rebuild proposals/i })
    );

    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2));
    expect(axios.post.mock.calls[1][1]).toEqual({
      path: FOLDER,
      boundaries: { Datasets: ["Datasets/Run_A"] },
    });
  });
});

describe("Analyze RCC Folder — needs reorganization", () => {
  const invalid = {
    ...analysis,
    structure_mode: "invalid",
    structure_issues: [
      {
        path: "mystery_stuff",
        reason:
          "Not a Qresp Folder Standard role (datasets, charts, scripts, " +
          "tools, docs) and not a layout Qresp recognizes.",
      },
    ],
    candidates: {
      charts: [],
      datasets: [],
      scripts: [],
      tools: [],
      unclassified: [],
      unclassified_total: 121,
      grouped_unclassified: [
        {
          path: "mystery_stuff",
          name: "mystery_stuff",
          file_count: 121,
          extensions: [".png", ".csv"],
          sample_names: ["a.png", "b.csv"],
          reason: "Not a Qresp Folder Standard role.",
        },
      ],
      boundary_trees: {},
      possible_dependencies: [],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: invalid });
  });

  it("warns, names the folder, and blocks adding anything", async () => {
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await user.click(analyzeButton());
    await screen.findByTestId("structure-mode");

    const badge = screen.getByTestId("structure-mode");
    expect(badge).not.toHaveTextContent("Needs reorganization");
    // The reason is one click away rather than pasted onto a chip.
    await user.click(
      screen.getByRole("button", { name: /show folder mapping/i })
    );
    const mapping = await screen.findByTestId("folder-mapping");
    expect(mapping).toHaveTextContent(/mystery_stuff:/);
    expect(mapping).toHaveTextContent(/not a layout Qresp recognizes/i);

    // No candidate can be added while the layout cannot be read.
    expect(
      screen.getByRole("button", { name: /add selected items/i })
    ).toBeDisabled();
    expect(addMany).not.toHaveBeenCalled();

    // Grouped summary only — no raw path paragraph.
    await user.click(screen.getByRole("tab", { name: /unclassified \(121\)/i }));
    expect(
      screen.getByRole("button", { name: "mystery_stuff (121)" })
    ).toBeInTheDocument();
    expect(screen.queryByText("a.png")).toBeNull();
  });

  it("offers no boundary picker for an unreadable layout", async () => {
    const user = userEvent.setup();
    renderWith();
    await user.click(analyzeButton());
    await screen.findByTestId("structure-mode");
    expect(screen.queryByTestId("boundary-picker")).toBeNull();
  });
});

describe("Analyze RCC Folder — consent-gated AI enhancement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: analysis });
  });

  // AI is per candidate now: the button lives on the card, and the Add
  // checkboxes no longer decide what gets described.
  const enhanceButton = (id = "chart-0") => screen.getByTestId(`enhance-${id}`);

  const consentBox = () =>
    screen.getByRole("checkbox", {
      name: /i agree to send this evidence to gemini for this request/i,
    });

  const sendButton = () =>
    screen.getByRole("button", { name: /send and get suggestions/i });

  // Opens the consent dialog for ONE candidate. Nothing is selected: the
  // Add checkbox and the AI action are separate concepts.
  const selectAndOpenConsent = async (user, tab, _name, id) => {
    if (tab) {
      await user.click(screen.getByRole("tab", { name: tab }));
    }
    // The candidate id follows the tab unless one is named explicitly.
    const target =
      id || (tab && String(tab).includes("script") ? "script-0" : "chart-0");
    // Open the fields so an accepted suggestion has somewhere visible to
    // land. Selecting the candidate is no longer required to enhance it.
    const edit = screen.queryAllByRole("button", { name: "Edit Proposal" });
    if (edit.length) await user.click(edit[0]);
    await user.click(enhanceButton(target));
    return screen.findByRole("heading", { name: /send .* to gemini\?/i });
  };

  const consentAndSend = async (user, reply) => {
    axios.post.mockResolvedValue({ data: reply });
    await user.click(consentBox());
    await user.click(sendButton());
  };

  it("is available per candidate, without selecting anything", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);

    // No Add checkbox needs ticking: the two concepts are separate.
    expect(enhanceButton("chart-0")).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /enhance selected with ai/i })
    ).toBeNull();
    // Only the analyze call has happened.
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it("opens a consent dialog that sends nothing by itself", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(
      user, null, /select figure1\.png/i
    );

    // The dialog names the ONE candidate and the exact scope BEFORE
    // anything moves.
    expect(
      screen.getByRole("heading", { name: /send .*figure1\.png.* to gemini\?/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("ai-consent-scope")).toHaveTextContent(
      /caption and keywords/i
    );
    // The scope is stated in one sentence rather than nine bullets, and it
    // must still be TRUE: this candidate's own readable evidence, plus the
    // paper's background.
    const scope = screen.getByTestId("ai-consent-scope");
    expect(scope).toHaveTextContent(/readable evidence/i);
    expect(scope).toHaveTextContent(/file names/i);
    expect(scope).toHaveTextContent(/title and abstract/i);
    // What comes back, and that it is not applied for you.
    expect(
      screen.getByText(/suggestions only/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/nothing is filled in, saved or published/i)
    ).toBeInTheDocument();

    // Unchecked by default, and the send action is blocked.
    expect(consentBox()).not.toBeChecked();
    expect(sendButton()).toBeDisabled();
    // Opening the dialog is not a request.
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it("makes NO request when consent is refused", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(user, null, /select figure1\.png/i);

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][0]).toBe("/api/curation/analyze-folder");
  });

  it("asks for consent again on every request — it is never remembered", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(user, null, /select figure1\.png/i);
    await consentAndSend(user, {
      suggestions: {
        "chart-0": { description: "d", keywords: [], confidence: "low" },
      },
    });
    await screen.findByTestId("ai-confidence-chart-0");

    // Second run: the box is unchecked again and send is blocked again.
    await user.click(enhanceButton());
    await screen.findByRole("heading", { name: /send .* to gemini\?/i });
    expect(consentBox()).not.toBeChecked();
    expect(sendButton()).toBeDisabled();
  });

  it("sends only the SELECTED candidates and only allowlisted evidence", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(
      user, /scripts \(1\)/i, /select plot_vdos\.py/i
    );
    await consentAndSend(user, {
      suggestions: {
        "script-0": {
          description: "Plots the VDOS.",
          keywords: ["VDOS"],
          confidence: "medium",
          reason: "module docstring",
        },
      },
    });
    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2));

    const [url, body] = axios.post.mock.calls[1];
    expect(url).toBe("/api/curation/describe-candidates");
    expect(body.consent).toBe(true);
    expect(body.items).toHaveLength(1);
    const item = body.items[0];
    expect(Object.keys(item).sort()).toEqual([
      "id",
      "inventory",
      "kind",
      "name",
      "paths",
      "sources",
    ]);
    item.paths.forEach((path) => {
      expect(path.startsWith("/")).toBe(false);
      expect(path).not.toContain("://");
    });
    // Unselected candidates never travel.
    const serialized = JSON.stringify(body.items);
    expect(serialized).not.toContain("chart-0");
    expect(serialized).not.toContain("dataset-0");
    expect(serialized).not.toContain("tool-0");
    // ...nor another candidate's README.
    expect(serialized).not.toContain("data/short_traj/README.md");
    expect(serialized).not.toContain("64 water molecules");
  });

  it("sends the candidate's own structured evidence, not free text", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(
      user, /scripts \(1\)/i, /select plot_vdos\.py/i
    );
    await consentAndSend(user, { suggestions: {} });
    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2));

    const item = axios.post.mock.calls[1][1].items[0];
    expect(item.sources).toEqual([
      {
        type: "docstring",
        path: "scripts/plot_vdos.py",
        excerpt: "Plot the vibrational density of states.",
      },
      {
        type: "python_symbols",
        path: "scripts/plot_vdos.py",
        names: ["load_vdos", "plot_vdos"],
      },
    ]);
    expect(item.inventory.file_count).toBe(1);
  });

  it("never sends what the curator typed into this candidate", async () => {
    // The exact leak this replaced: `context` used to be built from
    // draft.readme + draft.description, so the model was handed the
    // curator's own answer to the field it was being asked to fill.
    const user = noDelayUser();
    renderWith();
    await openAnalysis(user);
    // selectAndOpenConsent opens the fields itself, so the value is typed
    // between opening them and opening the consent dialog.
    await user.click(await screen.findByRole("tab", { name: /scripts \(1\)/i }));
    await user.click(
      await screen.findByRole("button", { name: "Edit Proposal" })
    );
    const readme = await screen.findByLabelText(/^description ?\*?$/i);
    await user.clear(readme);
    await fill(user, readme, "LEAKCANARY");

    await user.click(screen.getByTestId("enhance-script-0"));
    await screen.findByRole("heading", { name: /send .* to gemini\?/i });
    await consentAndSend(user, { suggestions: {} });
    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2));

    const body = axios.post.mock.calls[1][1];
    expect(JSON.stringify(body)).not.toContain("LEAKCANARY");
    expect(body.items[0].context).toBeUndefined();
  });

  it("sends the paper's title and abstract as background", async () => {
    const user = userEvent.setup();
    const collectDraftState = jest.fn(() => ({
      referenceInfo: {
        title: "Vibrational spectra of liquid water",
        abstract: "We compute the VDOS of liquid water.",
        doi: "10.1021/secret",
      },
    }));
    renderWith({ collectDraftState });
    await openAnalysis(user);
    await selectAndOpenConsent(
      user, /scripts \(1\)/i, /select plot_vdos\.py/i
    );
    await consentAndSend(user, { suggestions: {} });
    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2));

    const body = axios.post.mock.calls[1][1];
    expect(body.paper_context).toEqual({
      title: "Vibrational spectra of liquid water",
      abstract: "We compute the VDOS of liquid water.",
    });
    // Nothing else about the paper: the DOI is not background.
    expect(JSON.stringify(body)).not.toContain("10.1021/secret");
  });

  it("explains an evidence-based abstention distinctly from an empty answer", async () => {
    // The server refuses to ask about a candidate with no evidence of its
    // own and returns it in `no_suggestion`. chart-0 is exactly that case:
    // an image with no README and no notebook.
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(user, /charts \(1\)/i, /select figure1\.png/i);
    await consentAndSend(user, {
      suggestions: {},
      no_suggestion: ["chart-0"],
    });

    const notice = await screen.findByTestId("ai-notice-chart-0");
    expect(notice).toHaveTextContent(
      /no reliable candidate-specific evidence was found/i
    );
    expect(notice).toHaveTextContent(/nothing was sent to the AI service/i);
    // No suggestion is parked, so nothing can be accepted into a field.
    expect(screen.queryByTestId("ai-confidence-chart-0")).toBeNull();
  });

  it("still says 'no suggestion returned' when evidence WAS sent", async () => {
    // script-0 has a docstring, so the request really was made and the
    // provider simply had nothing usable. The two messages must not blur.
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(user, /scripts \(1\)/i, /select plot_vdos\.py/i);
    await consentAndSend(user, {
      suggestions: {},
      no_suggestion: ["script-0"],
    });

    const notice = await screen.findByTestId("ai-notice-script-0");
    expect(notice).toHaveTextContent(/no reliable suggestion was returned/i);
    expect(notice).not.toHaveTextContent(/nothing was sent/i);
  });

  it("an abstention leaves the curator's own draft value alone", async () => {
    const user = noDelayUser();
    const { addMany } = renderWith();
    await openAnalysis(user);
    await user.click(await screen.findByRole("tab", { name: /charts \(1\)/i }));
    await user.click(
      await screen.findByRole("button", { name: "Edit Proposal" })
    );
    const caption = await screen.findByLabelText(/^figure caption ?\*?$/i);
    await user.clear(caption);
    await fill(user, caption, "MINE");

    await user.click(screen.getByTestId("enhance-chart-0"));
    await screen.findByRole("heading", { name: /send .* to gemini\?/i });
    await consentAndSend(user, { suggestions: {}, no_suggestion: ["chart-0"] });
    await screen.findByTestId("ai-notice-chart-0");

    expect(screen.getByLabelText(/^figure caption ?\*?$/i)).toHaveValue("MINE");
    expect(addMany).not.toHaveBeenCalled();
  });

  it("warns before sending when there is nothing readable to send", async () => {
    // The consent dialog used to itemise every source. That list restated
    // what the server enforces anyway, and nine lines of it taught curators
    // to click past the one step that must not become reflex. What survives
    // is the case the reader cannot predict: nothing readable was found, so
    // the request will come back empty.
    axios.post.mockResolvedValue({
      data: {
        ...analysis,
        candidates: {
          ...analysis.candidates,
          scripts: [
            { ...analysis.candidates.scripts[0], ai_sources: [] },
          ],
        },
      },
    });
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(
      user, /scripts \(1\)/i, /select plot_vdos\.py/i
    );
    expect(
      await screen.findByTestId("ai-consent-sources")
    ).toHaveTextContent(/not enough evidence/i);
  });

  it("says nothing alarming when there IS evidence to send", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(
      user, /scripts \(1\)/i, /select plot_vdos\.py/i
    );
    await screen.findByTestId("ai-consent-scope");
    expect(screen.queryByTestId("ai-consent-sources")).toBeNull();
  });

  it("warns in the consent dialog when a candidate has no readable text", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(
      user, /charts \(1\)/i, /select figure1\.png/i
    );
    const listed = await screen.findByTestId("ai-consent-sources");
    expect(listed).toHaveTextContent(/no readable text/i);
    expect(listed).toHaveTextContent(/not enough evidence/i);
  });

  it("shows suggestions in a labelled AI area, applying nothing", async () => {
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(
      user, /scripts \(1\)/i, /select plot_vdos\.py/i
    );
    await consentAndSend(user, {
      suggestions: {
        "script-0": {
          description: "AI text",
          keywords: ["md"],
          confidence: "medium",
          reason: "module docstring",
        },
      },
    });

    // The label names the source and its own confidence, distinctly from
    // the deterministic evidence chip.
    const badge = await screen.findByTestId("ai-confidence-script-0");
    expect(badge).toHaveTextContent("AI suggestion: medium");
    expect(screen.getByTestId("ai-reason-script-0")).toHaveTextContent(
      /based on: module docstring/i
    );
    expect(screen.getByText(/not applied/i)).toBeInTheDocument();
    // Nothing was written into the form and nothing was added.
    expect(screen.getByLabelText(/^description ?\*?$/i)).toHaveValue("");
    expect(addMany).not.toHaveBeenCalled();
  });

  it("never shows a numeric percentage for AI confidence", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(
      user, /scripts \(1\)/i, /select plot_vdos\.py/i
    );
    await consentAndSend(user, {
      suggestions: {
        "script-0": { description: "d", keywords: [], confidence: "medium" },
      },
    });
    await screen.findByTestId("ai-confidence-script-0");
    // The dialog is portalled, so check the whole document.
    expect(document.body.textContent).not.toMatch(/\d+\s*%/);
    expect(document.body.textContent).toContain("AI suggestion: medium");
  });

  it("applies a suggestion only on explicit per-field acceptance", async () => {
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(
      user, /scripts \(1\)/i, /select plot_vdos\.py/i
    );
    await consentAndSend(user, {
      suggestions: {
        "script-0": {
          description: "AI text",
          keywords: ["md"],
          confidence: "low",
        },
      },
    });
    await screen.findByTestId("ai-confidence-script-0");

    expect(screen.getByLabelText(/^description ?\*?$/i)).toHaveValue("");
    await user.click(screen.getByRole("button", { name: /use as description/i }));
    expect(screen.getByLabelText(/^description ?\*?$/i)).toHaveValue("AI text");

    // Accepting is not adding: Curator state is still untouched.
    expect(addMany).not.toHaveBeenCalled();
  });

  it("refuses to overwrite a value the curator typed", async () => {
    const user = noDelayUser();
    renderWith();
    await openAnalysis(user);
    await user.click(screen.getByRole("tab", { name: /scripts \(1\)/i }));
    await user.click(
      screen.getByRole("checkbox", { name: /select plot_vdos\.py/i })
    );
    await user.type(screen.getByLabelText(/^description ?\*?$/i), "Mine");
    await user.click(enhanceButton("script-0"));
    await screen.findByRole("heading", { name: /send .* to gemini\?/i });
    await consentAndSend(user, {
      suggestions: {
        "script-0": { description: "AI text", keywords: [], confidence: "low" },
      },
    });
    await screen.findByTestId("ai-confidence-script-0");

    // The suggestion is visible but cannot be applied over the user's text.
    expect(screen.getByText("AI text")).toBeInTheDocument();
    expect(screen.getByLabelText(/^description ?\*?$/i)).toHaveValue("Mine");
    expect(
      screen.getByRole("button", { name: /use as description/i })
    ).toBeDisabled();
    expect(
      screen.getByText(/your text is kept — clear the field to use this instead/i)
    ).toBeInTheDocument();
  });

  it("leaves every restricted factual field untouched", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(user, null, /select figure1\.png/i);
    await consentAndSend(user, {
      suggestions: {
        "chart-0": {
          description: "A nice figure",
          keywords: ["dft"],
          confidence: "medium",
          // A hostile/confused provider trying to set factual fields.
          number: 7,
          imageFile: "invented.png",
          notebookFile: "invented.ipynb",
          files: "invented.csv",
          packageName: "fake",
          version: "9.9",
        },
      },
    });
    await screen.findByTestId("ai-confidence-chart-0");

    expect(screen.getByLabelText(/^figure image ?\*?$/i)).toHaveValue(
      "figures/figure1.png"
    );
    expect(screen.getByLabelText(/figure number/i, { selector: "input" })).toHaveValue("");
    expect(screen.getByLabelText(/^reproduction notebook ?\*?$/i)).toHaveValue("");
    expect(
      screen.getByLabelText(/^input \/ supporting files/i)
    ).toHaveValue("");

    // Only caption/properties are offered, and only on request.
    await user.click(screen.getByRole("button", { name: /use as figure caption/i }));
    expect(screen.getByLabelText(/^figure caption ?\*?$/i)).toHaveValue("A nice figure");
    expect(screen.getByLabelText(/^figure image ?\*?$/i)).toHaveValue(
      "figures/figure1.png"
    );
    expect(screen.getByLabelText(/figure number/i, { selector: "input" })).toHaveValue("");
  });

  it("offers no keyword target where the record type has no keyword field", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(
      user, /scripts \(1\)/i, /select plot_vdos\.py/i
    );
    await consentAndSend(user, {
      suggestions: {
        "script-0": {
          description: "d",
          keywords: ["md", "water"],
          confidence: "low",
        },
      },
    });
    await screen.findByTestId("ai-confidence-script-0");

    expect(screen.getByText("md")).toBeInTheDocument();
    // A script stores keywords in its own field, so the suggestion has
    // somewhere to go and the dead-end message is gone.
    expect(
      screen.queryByText(/this record type has no keyword field/i)
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /use as keywords/i })
    ).toBeInTheDocument();
    // ...and never into a chart's properties.
    expect(
      screen.queryByRole("button", { name: /use as properties/i })
    ).toBeNull();
  });

  it("offers a kind second-opinion as a NOTE, never a reclassification", async () => {
    const unsure = {
      ...analysis,
      candidates: {
        ...analysis.candidates,
        scripts: [{ ...analysis.candidates.scripts[0], confidence: "medium" }],
      },
    };
    axios.post.mockResolvedValue({ data: unsure });
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await user.click(analyzeButton());
    await screen.findByRole("tab", { name: /charts \(1\)/i });
    await selectAndOpenConsent(
      user, /scripts \(1\)/i, /select plot_vdos\.py/i
    );
    await consentAndSend(user, {
      suggestions: {
        "script-0": {
          description: "d",
          keywords: [],
          kind: "dataset",
          confidence: "low",
        },
      },
    });

    const note = await screen.findByTestId("ai-kind-script-0");
    expect(note).toHaveTextContent(/reads this more like a dataset/i);
    expect(note).toHaveTextContent(/nothing has been moved/i);
    expect(
      screen.getByRole("tab", { name: /scripts \(1\)/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /datasets \(1\)/i })).toBeInTheDocument();
    expect(addMany).not.toHaveBeenCalled();
  });

  it("stays quiet about kind when the deterministic evidence was strong", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(user, null, /select figure1\.png/i);
    await consentAndSend(user, {
      suggestions: {
        "chart-0": {
          description: "d",
          keywords: [],
          kind: "dataset",
          confidence: "low",
        },
      },
    });
    await screen.findByTestId("ai-confidence-chart-0");
    expect(screen.queryByTestId("ai-kind-chart-0")).toBeNull();
  });

  it("an AI response never adds, saves, or publishes on its own", async () => {
    const user = userEvent.setup();
    const { addMany, setAlert } = renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(user, null, /select figure1\.png/i);
    await consentAndSend(user, {
      suggestions: {
        "chart-0": { description: "x", keywords: [], confidence: "low" },
      },
    });
    await screen.findByTestId("ai-confidence-chart-0");

    expect(addMany).not.toHaveBeenCalled();
    expect(setAlert).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
    expect(axios.post.mock.calls.map((call) => call[0])).toEqual([
      "/api/curation/analyze-folder",
      "/api/curation/describe-candidates",
    ]);
  });

  it("Add selected items still works after an AI review", async () => {
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(user, null, /select figure1\.png/i);
    await consentAndSend(user, {
      suggestions: {
        "chart-0": {
          description: "AI caption",
          keywords: [],
          confidence: "medium",
        },
      },
    });
    await screen.findByTestId("ai-confidence-chart-0");
    await user.click(screen.getByRole("button", { name: /use as figure caption/i }));

    // Enhancing does not select anything, so Add is chosen explicitly.
    await user.click(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    );
    completeRequired();
    await user.click(
      screen.getByRole("button", { name: /add selected items/i })
    );
    expect(addMany).toHaveBeenCalledWith("chart", [
      expect.objectContaining({
        imageFile: "figures/figure1.png",
        caption: "AI caption",
      }),
    ]);
  });

  it("enhances exactly one candidate while several stay selected",
     async () => {
    const many = {
      ...analysis,
      candidates: {
        ...analysis.candidates,
        charts: Array.from({ length: 3 }, (unused, index) => ({
          ...analysis.candidates.charts[0],
          id: `chart-${index}`,
          label: `figure${index}.png`,
          paths: [`figures/figure${index}.png`],
          proposal: {
            ...analysis.candidates.charts[0].proposal,
            imageFile: `figures/figure${index}.png`,
          },
        })),
      },
    };
    axios.post.mockResolvedValue({ data: many });
    const user = userEvent.setup();
    renderWith();
    await user.click(analyzeButton());
    await screen.findByRole("tab", { name: /charts \(3\)/i });

    // Three ticked for Add to Curator...
    for (let index = 0; index < 3; index += 1) {
      await user.click(
        screen.getByRole("checkbox", {
          name: new RegExp(`select figure${index}\.png`, "i"),
        })
      );
    }

    // ...and one enhanced, without clearing any of them.
    await user.click(enhanceButton("chart-1"));
    await screen.findByRole("heading", { name: /send .* to gemini\?/i });
    axios.post.mockResolvedValue({
      data: { suggestions: { "chart-1": { description: "d", keywords: [],
                                          confidence: "low" } } },
    });
    await user.click(consentBox());
    await user.click(sendButton());
    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2));

    const [url, body] = axios.post.mock.calls[1];
    expect(url).toBe("/api/curation/describe-candidates");
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("chart-1");

    // Every Add checkbox is still ticked.
    for (let index = 0; index < 3; index += 1) {
      expect(
        screen.getByRole("checkbox", {
          name: new RegExp(`select figure${index}\.png`, "i"),
        })
      ).toBeChecked();
    }
  });

  it("is non-blocking when Gemini is not configured", async () => {
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await openAnalysis(user);
    await selectAndOpenConsent(user, null, /select figure1\.png/i);

    axios.post.mockRejectedValue({
      response: {
        status: 503,
        data: { error: "AI descriptions are not configured on this server." },
      },
    });
    await user.click(consentBox());
    await user.click(sendButton());

    expect(
      await screen.findByText(/not configured on this server/i)
    ).toBeInTheDocument();
    // The deterministic review is unaffected and still appliable. The
    // failure is local to that candidate: the rest of the dialog works and
    // Add goes through, blank fields and all.
    await user.click(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    );
    await askToAdd(user);
    expect(screen.queryByTestId("blocked-summary")).toBeNull();
    expect(addMany).toHaveBeenCalledTimes(1);
  });
});

// Seeds the saved file server path in real CuratorState.
const Seed = () => {
  const { setFileServerPath } = useContext(CuratorContext);
  useEffect(() => setFileServerPath(FOLDER), []);
  return null;
};

// Real CuratorState: proves applied candidates land in Curator state with
// collision-safe ids and WITHOUT disturbing records the curator already has.
const StateProbe = () => {
  const { charts, tools, add } = useContext(CuratorContext);
  return (
    <div>
      <span data-testid="chart-ids">
        {charts.map((c) => `${c.id}:${c.imageFile}`).join("|") || "none"}
      </span>
      <span data-testid="tool-ids">
        {tools.map((t) => `${t.id}:${t.packageName}`).join("|") || "none"}
      </span>
      <button
        onClick={() =>
          add("chart", { id: "c0", imageFile: "hand-made.png", caption: "Mine" })
        }
      >
        Add manual chart
      </button>
    </div>
  );
};

describe("Analyze RCC Folder applied into real Curator state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  const renderLive = () => {
    render(
      <CuratorState draftKey={null}>
        <AlertContext.Provider value={{ setAlert: jest.fn() }}>
          <Seed />
          <FolderAnalysis />
          <StateProbe />
        </AlertContext.Provider>
      </CuratorState>
    );
  };

  it("appends without overwriting existing records and mints unique ids", async () => {
    axios.post.mockResolvedValue({
      data: {
        ...analysis,
        candidates: {
          ...analysis.candidates,
          charts: [
            analysis.candidates.charts[0],
            {
              ...analysis.candidates.charts[0],
              id: "chart-1",
              label: "figure2.png",
              paths: ["figures/figure2.png"],
              proposal: {
                ...analysis.candidates.charts[0].proposal,
                imageFile: "figures/figure2.png",
                number: 2,
              },
            },
          ],
        },
      },
    });
    const user = userEvent.setup();
    renderLive();

    await user.click(screen.getByRole("button", { name: /add manual chart/i }));
    expect(screen.getByTestId("chart-ids")).toHaveTextContent(
      "c0:hand-made.png"
    );

    await user.click(analyzeButton());
    await screen.findByRole("tab", { name: /charts \(2\)/i });
    await user.click(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    );
    await user.click(
      screen.getByRole("checkbox", { name: /select figure2\.png/i })
    );
    completeRequired();
    await user.click(
      screen.getByRole("button", { name: /add selected items/i })
    );

    await waitFor(() =>
      expect(screen.getByTestId("chart-ids")).toHaveTextContent("c2")
    );
    const ids = screen.getByTestId("chart-ids").textContent.split("|");
    // The hand-made chart survives untouched, and the batch gets distinct ids
    // (a naive `c${charts.length}` would have produced c1 twice).
    expect(ids[0]).toBe("c0:hand-made.png");
    expect(ids.map((entry) => entry.split(":")[0])).toEqual(["c0", "c1", "c2"]);
    expect(new Set(ids).size).toBe(3);
  });
});

// The field contract, per record type. Folder analysis is a review step: a
// proposal may be added while required fields are still blank, because the
// curator finishes them in the section afterwards. What must NOT happen is a
// suggestion arriving for a field the record cannot hold, or an optional
// field being reported as missing.
describe("Folder Analysis field contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: analysis });
  });

  const openFields = async (user, tab, name, id) => {
    await openAnalysis(user);
    if (tab) await user.click(screen.getByRole("tab", { name: tab }));
    await user.click(screen.getByRole("checkbox", { name }));
    return screen.findByTestId(`fields-${id}`);
  };

  const input = (pattern) =>
    screen.getByLabelText(pattern, { selector: "input" });

  it("offers a dataset Files, Description and Keywords -- and no URLs",
     async () => {
    const user = noDelayUser();
    renderWith();
    await openFields(user, /datasets \(1\)/i, /select short_traj/i,
                     "dataset-0");

    // Nothing is required: a dataset may be added and published blank.
    expect(input(/^files/i)).not.toBeRequired();
    expect(input(/^description/i)).not.toBeRequired();
    const keywords = input(/^keywords/i);
    expect(keywords).not.toBeRequired();

    // URLs is a legacy storage key. It is preserved on records that have it,
    // but it is not an input on any current surface.
    expect(screen.queryByLabelText(/^urls/i)).toBeNull();

    await fill(user, keywords, "silicon");
    expect(keywords).toHaveValue("silicon");
  });

  it("marks no field required, and says so once", async () => {
    const user = userEvent.setup();
    renderWith();
    await openFields(user, null, /select figure1\.png/i, "chart-0");

    [
      /^figure image ?\*?$/i,
      /^figure number ?\*?$/i,
      /^figure caption ?\*?$/i,
      /^keywords ?\*?$/i,
      /^reproduction notebook ?\*?$/i,
      /^input \/ supporting files/i,
    ].forEach((label) => expect(input(label)).not.toBeRequired());

    expect(screen.getByTestId("required-note")).toHaveTextContent(
      "Nothing here is required: add a proposal with any field blank and " +
        "fill it in later, here on the card or in the artifact’s own form."
    );
  });

  it("shows no long helper prose under any edit field", async () => {
    // The specific sentences that used to sit under each input. Six of them
    // per candidate is what made a proposal card unreadable.
    const user = userEvent.setup();
    renderWith();
    await openFields(user, null, /select figure1\.png/i, "chart-0");

    const fields = screen.getByTestId("fields-chart-0");
    [
      /the image file for this figure/i,
      /qresp never guesses/i,
      /use the paper.s caption/i,
      /keyword\(s\) for what the figure shows/i,
    ].forEach((prose) => expect(fields.textContent).not.toMatch(prose));
    // The label and the value stay.
    expect(input(/^figure image ?\*?$/i)).toHaveValue("figures/figure1.png");
  });

  it("shows no evidence chips anywhere in the dialog", async () => {
    // Header and expanded fields both. Evidence still ranks candidates and
    // bounds the AI behind the scenes; it is simply not a badge any more.
    const user = userEvent.setup();
    renderWith();
    await openFields(user, null, /select figure1\.png/i, "chart-0");

    expect(screen.queryAllByTestId(/^confidence-/)).toHaveLength(0);
    expect(screen.queryAllByTestId(/^field-evidence-/)).toHaveLength(0);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).not.toMatch(/high evidence/i);
    expect(dialog.textContent).not.toMatch(/medium evidence/i);
    expect(dialog.textContent).not.toMatch(/low evidence/i);
  });

  it("keeps Add to Curator working without the prose, with fields blank", async () => {
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await openFields(user, null, /select figure1\.png/i, "chart-0");

    // Figure Number and Keywords are blank, and that is fine.
    await user.click(
      screen.getByRole("button", { name: /add selected items/i })
    );
    expect(addMany).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("needs-input-chart-0")).toBeNull();
    expect(screen.queryByTestId("blocked-summary")).toBeNull();
  });

  it("keeps both disclosures closed by default and openable", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);

    expect(screen.queryByTestId("scan-details")).toBeNull();
    expect(screen.queryByTestId("folder-mapping")).toBeNull();

    const details = screen.getByRole("button", { name: /show scan details/i });
    expect(details).toHaveAttribute("aria-expanded", "false");
    await user.click(details);
    expect(await screen.findByTestId("scan-details")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /hide scan details/i })
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("states the rule once, not under every field", async () => {
    const user = userEvent.setup();
    renderWith();
    await openFields(user, null, /select figure1\.png/i, "chart-0");

    expect(screen.queryAllByText(/nothing here is required/i)).toHaveLength(1);
    expect(
      screen.queryByText(/required before save\/update and publish/i)
    ).toBeNull();
    expect(
      screen.queryByText(/required to save, update, or publish/i)
    ).toBeNull();
  });

  it("keeps a real scan warning visible while the prose is trimmed", async () => {
    // Cutting explanatory text must not cut the facts a curator needs to
    // know the view is incomplete. This is the line that says so.
    axios.post.mockResolvedValue({
      data: {
        ...analysis,
        truncated: true,
        counts: { files: 1971, directories: 260 },
      },
    });
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);

    // Trimming the prose must not trim the FACT. It is no longer an Alert
    // above the candidates, but it is one click away and still says the
    // list is incomplete.
    expect(screen.queryByTestId("partial-notice")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /show scan details/i })
    );
    const details = await screen.findByTestId("scan-details");
    expect(details).toHaveTextContent(/this is a partial view/i);
    expect(details).toHaveTextContent("1971 file(s) across 260 folder(s)");
  });

  it("does not call an empty optional field a missing one", async () => {
    const user = noDelayUser();
    renderWith();
    await openFields(user, /scripts \(1\)/i, /select plot_vdos\.py/i,
                     "script-0");

    // The description and keywords are blank, and both are optional: asking
    // to add is not refused and nothing is flagged.
    expect(input(/^description ?\*?$/i)).toHaveValue("");
    expect(input(/^description ?\*?$/i)).not.toBeRequired();
    expect(input(/^keywords/i)).toHaveValue("");
    expect(screen.queryByLabelText(/^urls/i)).toBeNull();
    await askToAdd(user);
    expect(screen.queryByTestId("needs-input-script-0")).toBeNull();
    expect(screen.queryByTestId("blocked-summary")).toBeNull();
  });

  it("adds a script whose optional description is still blank",
     async () => {
    // A description helps readers but is not required: the script is added
    // as it is, and the curator can describe it later.
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await openFields(user, /scripts \(1\)/i, /select plot_vdos\.py/i,
                     "script-0");

    await askToAdd(user);
    expect(screen.queryByTestId("blocked-summary")).toBeNull();
    expect(addMany).toHaveBeenCalledTimes(1);
    const [kind, records] = addMany.mock.calls[0];
    expect(kind).toBe("script");
    expect(records).toHaveLength(1);
    expect(records[0].readme).toBe("");
    // ...and it carries the separate keywords list. A brand-new record does
    // not invent an empty legacy URLs array.
    expect(records[0].keywords).toEqual([]);
    expect(records[0]).not.toHaveProperty("URLs");
  });
});

describe("AI proposals land only where the record can hold them", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: analysis });
  });

  const input = (pattern) =>
    screen.getByLabelText(pattern, { selector: "input" });

  const suggestForScript = async (user, suggestions) => {
    await openAnalysis(user);
    await user.click(screen.getByRole("tab", { name: /scripts \(1\)/i }));
    await user.click(
      screen.getByRole("checkbox", { name: /select plot_vdos\.py/i })
    );
    await user.click(
      screen.getByTestId("enhance-script-0")
    );
    await screen.findByRole("heading", { name: /send .* to gemini\?/i });
    axios.post.mockResolvedValue({ data: { suggestions } });
    await user.click(
      screen.getByRole("checkbox", {
        name: /i agree to send this evidence to gemini for this request/i,
      })
    );
    await user.click(
      screen.getByRole("button", { name: /send and get suggestions/i })
    );
    return screen.findByTestId("ai-confidence-script-0");
  };

  it("accepts script keywords into the keywords field", async () => {
    const user = userEvent.setup();
    renderWith();
    await suggestForScript(user, {
      "script-0": {
        description: "Plots the VDOS.",
        keywords: ["vibrational spectra", "phonons"],
        confidence: "medium",
      },
    });

    await user.click(screen.getByRole("button", { name: /use as keywords/i }));

    expect(input(/^keywords/i)).toHaveValue("vibrational spectra, phonons");
    expect(screen.queryByLabelText(/^urls/i)).toBeNull();
  });

  it("accepting a suggestion adds, saves and publishes nothing", async () => {
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await suggestForScript(user, {
      "script-0": { description: "Plots the VDOS.", keywords: ["phonons"],
                    confidence: "medium" },
    });

    await user.click(screen.getByRole("button", { name: /use as keywords/i }));

    expect(addMany).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
  });

  it("carries an accepted keyword through to the applied record", async () => {
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await suggestForScript(user, {
      "script-0": { description: "Plots the VDOS.", keywords: ["phonons"],
                    confidence: "medium" },
    });

    await user.click(screen.getByRole("button", { name: /use as keywords/i }));
    completeRequired();
    await user.click(
      screen.getByRole("button", { name: /add selected items/i })
    );

    const [kind, records] = addMany.mock.calls[0];
    expect(kind).toBe("script");
    expect(records[0].keywords).toEqual(["phonons"]);
    expect(records[0]).not.toHaveProperty("URLs");
  });
});

// The reported staleness, in the shape it was reported: a Chart whose caption
// and keywords the analyser could not determine, filled by AI, still wearing
// the analysis-time "Needs input" chips underneath -- while the card header,
// which reads the draft, correctly said they were no longer missing.
describe("a card never contradicts itself about what a field holds", () => {
  // The real analyzer's output for a chart folder: the image was detected,
  // everything a human has to supply is `needs_input`.
  const CHART_EVIDENCE = {
    imageFile: "high",
    files: "needs_input",
    notebookFile: "needs_input",
    number: "needs_input",
    caption: "needs_input",
    properties: "needs_input",
  };

  const withEvidence = {
    ...analysis,
    candidates: {
      ...analysis.candidates,
      charts: [
        { ...analysis.candidates.charts[0], field_evidence: CHART_EVIDENCE },
      ],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: withEvidence });
  });

  const input = (pattern) =>
    screen.getByLabelText(pattern, { selector: "input" });

  const caption = () => input(/^figure caption ?\*?$/i);
  const keywords = () => input(/^keywords ?\*?$/i);

  // EXACT: "applied" is a substring of "partially applied", so a loose
  // matcher would let the two states pass for each other.
  const expectState = (label) =>
    expect(screen.getByTestId("ai-applied-chart-0").textContent.trim()).toBe(
      label
    );

  const suggestForChart = async (user, suggestion) => {
    await openAnalysis(user);
    await user.click(screen.getByRole("button", { name: "Edit Proposal" }));
    await user.click(screen.getByTestId("enhance-chart-0"));
    await screen.findByRole("heading", { name: /send .* to gemini\?/i });
    axios.post.mockResolvedValue({
      data: { suggestions: { "chart-0": suggestion } },
    });
    await user.click(
      screen.getByRole("checkbox", {
        name: /i agree to send this evidence to gemini for this request/i,
      })
    );
    await user.click(
      screen.getByRole("button", { name: /send and get suggestions/i })
    );
    return screen.findByTestId("ai-confidence-chart-0");
  };

  const SUGGESTION = {
    description: "Measured and computed VDOS of liquid water.",
    keywords: ["vibrational spectra", "liquid water"],
    confidence: "medium",
    reason: "notebook markdown",
  };

  it("fills the fields from the AI, and never says a field is needed", async () => {
    const user = userEvent.setup();
    renderWith();
    await suggestForChart(user, SUGGESTION);

    await user.click(screen.getByTestId("ai-use-description-chart-0"));
    await user.click(screen.getByTestId("ai-use-keywords-chart-0"));

    // Nothing is required, so no field is ever reported missing.
    expect(screen.queryByTestId("needs-input-chart-0")).toBeNull();
    expect(caption()).toHaveValue(SUGGESTION.description);
    expect(screen.queryByTestId("field-evidence-chart-0-caption")).toBeNull();
    expect(
      screen.queryByTestId("field-evidence-chart-0-properties")
    ).toBeNull();
    // ...and nowhere on the card does "Needs input" survive.
    expect(screen.queryByText(/needs input/i)).toBeNull();
  });

  it("marks the suggestion applied once its values are in the fields", async () => {
    const user = userEvent.setup();
    renderWith();
    await suggestForChart(user, SUGGESTION);

    expectState("not applied");

    await user.click(screen.getByTestId("ai-use-description-chart-0"));
    // One of two used: neither applied nor un-applied. Saying "not applied"
    // here contradicted the keywords button already reading "Applied to ...".
    expectState("partially applied");

    await user.click(screen.getByTestId("ai-use-keywords-chart-0"));
    expectState("applied");
    expect(screen.getByTestId("ai-use-description-chart-0")).toBeDisabled();
  });

  it("un-marks applied when the curator edits the value afterwards", async () => {
    const user = noDelayUser();
    renderWith();
    await suggestForChart(user, SUGGESTION);

    await user.click(screen.getByTestId("ai-use-description-chart-0"));
    await user.click(screen.getByTestId("ai-use-keywords-chart-0"));
    expectState("applied");

    // Editing ONE of two applied values leaves the other still applied.
    // One character, typed: what is being checked is that an edit un-marks
    // the value, and a seventh keystroke checks nothing the first one did
    // not -- it only re-rendered the dialog six more times.
    await user.type(caption(), "X");
    expectState("partially applied");

    // Editing the last one too leaves nothing applied.
    await user.type(keywords(), "X");
    expectState("not applied");
  });

  it("frees the AI value again when an applied value is cleared", async () => {
    const user = userEvent.setup();
    renderWith();
    await suggestForChart(user, SUGGESTION);

    await user.click(screen.getByTestId("ai-use-keywords-chart-0"));
    expectState("partially applied");

    await user.clear(keywords());
    expect(screen.queryByTestId("needs-input-chart-0")).toBeNull();
    expectState("not applied");
    // The Use button comes back, because the field is free again.
    expect(screen.getByTestId("ai-use-keywords-chart-0")).toBeEnabled();
  });

  it("is applied as soon as a description-only suggestion is used", async () => {
    // Nothing else was offered, so one click is the whole of it. Waiting for
    // a second field that does not exist would strand the panel.
    const user = userEvent.setup();
    renderWith();
    await suggestForChart(user, {
      description: "Measured and computed VDOS of liquid water.",
      keywords: [],
      confidence: "medium",
    });

    expectState("not applied");
    expect(screen.queryByTestId("ai-use-keywords-chart-0")).toBeNull();

    await user.click(screen.getByTestId("ai-use-description-chart-0"));
    expectState("applied");
  });

  it("goes back to partially applied when one applied value is cleared", async () => {
    const user = userEvent.setup();
    renderWith();
    await suggestForChart(user, SUGGESTION);

    await user.click(screen.getByTestId("ai-use-description-chart-0"));
    await user.click(screen.getByTestId("ai-use-keywords-chart-0"));
    expectState("applied");

    await user.clear(keywords());
    expectState("partially applied");
    // ...and the stale-chip fix is not disturbed by any of this: caption
    // still holds the AI's text, so it carries no chip.
    expect(screen.queryByTestId("field-evidence-chart-0-caption")).toBeNull();
    expect(screen.queryByText(/needs input/i)).toBeNull();
  });

  it("does not overwrite the curator's own text on any state", async () => {
    const user = noDelayUser();
    renderWith();
    await openAnalysis(user);
    await user.click(screen.getByRole("button", { name: "Edit Proposal" }));
    await fill(user, caption(), "MY OWN CAPTION");

    await user.click(screen.getByTestId("enhance-chart-0"));
    await screen.findByRole("heading", { name: /send .* to gemini\?/i });
    axios.post.mockResolvedValue({
      data: { suggestions: { "chart-0": SUGGESTION } },
    });
    await user.click(
      screen.getByRole("checkbox", {
        name: /i agree to send this evidence to gemini for this request/i,
      })
    );
    await user.click(
      screen.getByRole("button", { name: /send and get suggestions/i })
    );
    await screen.findByTestId("ai-confidence-chart-0");

    // The curator's text is in the field, so the button is disabled and the
    // suggestion is not applied -- and the text is untouched.
    expect(screen.getByTestId("ai-use-description-chart-0")).toBeDisabled();
    expect(caption()).toHaveValue("MY OWN CAPTION");
    expectState("not applied");

    // Using the keywords, which the curator did NOT fill, is still allowed.
    await user.click(screen.getByTestId("ai-use-keywords-chart-0"));
    expectState("partially applied");
    expect(caption()).toHaveValue("MY OWN CAPTION");
  });

  it("shows no evidence badge to contradict, before or after an edit", async () => {
    // This used to be about a chip that said "High evidence" going away when
    // the curator typed over the analysed value -- a badge vouching for
    // something nothing had verified. The badge is gone from the UI
    // altogether, so there is nothing left to contradict the field.
    //
    // The rule it protected still exists where it matters: the backend keeps
    // per-field evidence, and `evidenceChipFor` still refuses to call an
    // edited value analysed.
    const user = noDelayUser();
    renderWith();
    await openAnalysis(user);
    await user.click(screen.getByRole("button", { name: "Edit Proposal" }));
    await screen.findByTestId("fields-chart-0");

    expect(screen.queryByTestId("field-evidence-chart-0-imageFile")).toBeNull();
    await user.clear(input(/^figure image ?\*?$/i));
    await fill(user, input(/^figure image ?\*?$/i), "typed/by/hand.png");
    expect(screen.queryByTestId("field-evidence-chart-0-imageFile")).toBeNull();
    // The value the curator typed is what the field holds.
    expect(input(/^figure image ?\*?$/i)).toHaveValue("typed/by/hand.png");
  });

  it("applying a suggestion saves, publishes and adds nothing", async () => {
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await suggestForChart(user, SUGGESTION);

    await user.click(screen.getByTestId("ai-use-description-chart-0"));
    await user.click(screen.getByTestId("ai-use-keywords-chart-0"));

    expect(addMany).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
    // The only posts are the analysis and the one describe request.
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  it("does not leak applied state onto a re-analysed candidate", async () => {
    const user = userEvent.setup();
    renderWith();
    await suggestForChart(user, SUGGESTION);
    await user.click(screen.getByTestId("ai-use-description-chart-0"));
    expect(screen.getByTestId("ai-applied-chart-0")).toHaveTextContent(
      "applied"
    );

    // Close and reopen: a fresh analysis, the same candidate id, no memory of
    // the previous one's suggestion or of what was applied to it.
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    axios.post.mockResolvedValue({ data: withEvidence });
    // MUI keeps aria-hidden on the app root until the dialog has finished
    // leaving, so the trigger is found by retrying rather than immediately.
    await user.click(
      await screen.findByRole("button", { name: /analyze rcc folder/i })
    );
    await screen.findByRole("tab", { name: /charts \(1\)/i });
    await user.click(screen.getByRole("button", { name: "Edit Proposal" }));

    expect(screen.queryByTestId("ai-applied-chart-0")).toBeNull();
    expect(screen.queryByTestId("ai-panel-chart-0")).toBeNull();
    expect(caption()).toHaveValue("");
    // Nothing is claimed about missing fields on a card nobody has asked for.
    expect(screen.queryByTestId("needs-input-chart-0")).toBeNull();
  });
});
// A Chart stores exactly ONE image, so the unit a curator decides about is the
// image FILE, not the folder. Every image found is listed under the folder it
// really sits in, each with one role, and the boundary panel is the only place
// those roles are chosen — a candidate card shows the resulting Figure Image
// and nothing else.
describe("Charts in the record boundary panel", () => {
  const FIGURE = "figures_tables/figure_S1/figure_S1.png";
  const DIAGRAM = "figures_tables/figure_S1/diagram.png";
  const NOTEBOOK = "figures_tables/figure_S1/figure_S1.ipynb";

  // Verbatim from the real /api/curation/analyze-folder response; the backend
  // route test asserts this exact serialization.
  const CHART_GROUPS = [
    {
      folder: "figures_tables/figure_S1",
      role_root: "figures_tables",
      images: [
        {
          path: DIAGRAM,
          reason: "image found in this chart folder",
          suggested_action: "review",
        },
        {
          path: FIGURE,
          reason: "filename matches the chart folder",
          suggested_action: "chart",
        },
      ],
      notebooks: [{ path: NOTEBOOK }],
    },
  ];

  const chartCandidate = (id, imageFile, extra = {}) => ({
    id,
    kind: "chart",
    label: imageFile.split("/").pop(),
    file_count: 1,
    confidence: "medium",
    evidence: [`One chart: the image ${imageFile}`],
    needs_input: ["caption", "number", "properties"],
    paths: [imageFile],
    proposal: {
      imageFile,
      files: [],
      notebookFile: "",
      number: "",
      caption: "",
      properties: [],
      extraFields: [],
      ...extra,
    },
  });

  const withCharts = (extra = {}) => ({
    ...analysis,
    structure_mode: "standard",
    boundary_trees: {},
    chart_image_groups: CHART_GROUPS,
    applied_chart_plan: [],
    candidates: {
      ...analysis.candidates,
      charts: [chartCandidate("chart-0", FIGURE, { notebookFile: NOTEBOOK })],
    },
    ...extra,
  });

  // A legacy tree, so the Dataset/Script folder picker and the Charts section
  // are on screen together.
  const LEGACY = withCharts({
    structure_mode: "legacy",
    boundary_trees: {
      data: {
        role: "datasets",
        nodes: [
          { path: "data/DFT", name: "DFT", level: 1, file_count: 12,
            extensions: [".in"], sample_names: [] },
        ],
      },
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: withCharts() });
  });

  const openPanel = async (user) => {
    await openAnalysis(user);
    await user.click(
      screen.getByRole("button", { name: /choose record boundaries/i })
    );
    return screen.findByTestId("chart-plan");
  };

  const roleSelect = (name) =>
    screen.getByLabelText(new RegExp(`^role for ${name}`, "i"));

  const setRole = async (user, name, label) => {
    await user.click(roleSelect(name));
    await user.click(await screen.findByRole("option", { name: label }));
  };

  const rebuild = async (user) =>
    user.click(screen.getByRole("button", { name: /rebuild proposals/i }));

  it("lists every image under the folder it really sits in", async () => {
    const user = userEvent.setup();
    renderWith();
    const panel = await openPanel(user);

    expect(
      screen.getByTestId("chart-folder-figures_tables/figure_S1")
    ).toBeInTheDocument();
    // The real folder path, not a name reconstructed from a candidate.
    expect(panel).toHaveTextContent("figures_tables/figure_S1");
    expect(panel).toHaveTextContent("figure_S1.png");
    // The second image is NOT hidden just because Qresp would not pick it.
    expect(panel).toHaveTextContent("diagram.png");
    // ...but HOW the analyser noticed each file is not repeated per row. The
    // curator is choosing a role for a file whose name they can see.
    expect(panel).not.toHaveTextContent(/filename matches the chart folder/i);
    expect(panel).not.toHaveTextContent(/image found in this chart folder/i);
  });

  it("leaves only what is needed to pick a file and give it a role",
     async () => {
    // The panel opened with a paragraph of Folder Standard theory above the
    // list. It is the same guidance the Curator's Folder Guide and the public
    // /documentation/folder-standard page carry in full, and repeating it
    // here pushed the files -- the thing being decided about -- down.
    const user = userEvent.setup();
    renderWith();
    const panel = await openPanel(user);

    expect(panel).not.toHaveTextContent(
      /in the qresp folder standard one charts/i
    );
    expect(panel).not.toHaveTextContent(/none is hidden/i);
    expect(panel).not.toHaveTextContent(/related afterwards in workflow/i);

    // What a curator actually needs is all still here: the folder, each
    // filename, a role control per image, and a way to look at the file.
    expect(panel).toHaveTextContent("figures_tables/figure_S1");
    expect(panel).toHaveTextContent("figure_S1.png");
    expect(panel).toHaveTextContent("diagram.png");
    expect(screen.getAllByLabelText(/^role for /i)).toHaveLength(2);
    expect(
      screen.getAllByRole("link", { name: /open image/i }).length
    ).toBeGreaterThan(0);
  });

  it("shows a notebook as an attachment, never as a Chart choice", async () => {
    const user = userEvent.setup();
    renderWith();
    await openPanel(user);

    expect(screen.getByTestId(`chart-notebook-${NOTEBOOK}`)).toHaveTextContent(
      /figure_S1\.ipynb — Reproduction Notebook/i
    );
    // No role control for it: a notebook is never a Chart of its own.
    expect(screen.queryByLabelText(/^role for figure_S1\.ipynb/i)).toBeNull();
    expect(screen.getAllByLabelText(/^role for /i)).toHaveLength(2);
  });

  it("defaults only the folder-named image to Create Chart", async () => {
    const user = userEvent.setup();
    renderWith();
    await openPanel(user);

    expect(roleSelect("figure_S1.png")).toHaveTextContent("Create Chart");
    // Everything else waits for a decision, and the ROLE control is where
    // that is said -- the separate "Review" chip was the same fact twice.
    expect(roleSelect("diagram.png")).toHaveTextContent("Ignore");
    expect(screen.queryByTestId(`chart-review-${DIAGRAM}`)).toBeNull();
    expect(screen.queryByTestId(`chart-review-${FIGURE}`)).toBeNull();
  });

  it("offers the three roles, and a Chart target only for a supporting file",
     async () => {
    const user = userEvent.setup();
    renderWith();
    await openPanel(user);

    await user.click(roleSelect("diagram.png"));
    expect(
      screen.getAllByRole("option").map((option) => option.textContent)
    ).toEqual(["Create Chart", "Supporting File", "Ignore"]);
    await user.keyboard("{Escape}");

    expect(screen.queryByLabelText(/^chart for diagram\.png/i)).toBeNull();
    await setRole(user, "diagram.png", "Supporting File");

    const attach = screen.getByLabelText(/^chart for diagram\.png/i);
    // It can only attach to a Chart in the same folder.
    expect(attach).toHaveTextContent("figure_S1.png");
  });

  it("says so when a supporting file has no Chart to attach to", async () => {
    const user = userEvent.setup();
    renderWith();
    await openPanel(user);

    await setRole(user, "figure_S1.png", "Ignore");
    await setRole(user, "diagram.png", "Supporting File");

    expect(
      screen.getByText(/a supporting file needs a Chart in\s+the same folder/i)
    ).toBeInTheDocument();
    // ...and the server is never asked to refuse it.
    expect(
      screen.getByRole("button", { name: /rebuild proposals/i })
    ).toBeDisabled();
  });

  it("sends the folder boundaries AND the chart plan on Rebuild", async () => {
    axios.post.mockResolvedValue({ data: LEGACY });
    const user = userEvent.setup();
    renderWith();
    await openPanel(user);

    await user.click(
      screen.getByRole("checkbox", { name: "Use data/DFT as one record" })
    );
    await setRole(user, "diagram.png", "Supporting File");
    await rebuild(user);

    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2));
    expect(axios.post.mock.calls[1][1]).toEqual({
      path: FOLDER,
      boundaries: { data: ["data/DFT"] },
      chart_plan: [
        { path: DIAGRAM, action: "supporting", target: FIGURE },
        { path: FIGURE, action: "chart" },
      ],
    });
    // The first analysis carried neither: defaults are the default.
    expect(axios.post.mock.calls[0][1]).toEqual({ path: FOLDER });
  });

  it("sends a plan with no boundaries when only roles changed", async () => {
    const user = userEvent.setup();
    renderWith();
    await openPanel(user);

    await setRole(user, "diagram.png", "Create Chart");
    await rebuild(user);

    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2));
    expect(axios.post.mock.calls[1][1]).toEqual({
      path: FOLDER,
      chart_plan: [
        { path: DIAGRAM, action: "chart" },
        { path: FIGURE, action: "chart" },
      ],
    });
  });

  it("two Create Chart images become two candidates, each with one image",
     async () => {
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await openPanel(user);

    axios.post.mockResolvedValueOnce({
      data: withCharts({
        applied_chart_plan: [
          { path: DIAGRAM, action: "chart", target: "" },
          { path: FIGURE, action: "chart", target: "" },
        ],
        candidates: {
          ...analysis.candidates,
          charts: [
            chartCandidate("chart-0", DIAGRAM),
            chartCandidate("chart-1", FIGURE, { notebookFile: NOTEBOOK }),
          ],
        },
      }),
    });
    await setRole(user, "diagram.png", "Create Chart");
    await rebuild(user);

    await screen.findByRole("tab", { name: /charts \(2\)/i });
    await user.click(
      screen.getByRole("checkbox", { name: /select diagram\.png/i })
    );
    await user.click(
      screen.getByRole("checkbox", { name: /select figure_S1\.png/i })
    );
    completeRequired();
    await user.click(
      screen.getByRole("button", { name: /add selected items/i })
    );

    const [kind, records] = addMany.mock.calls[0];
    expect(kind).toBe("chart");
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.imageFile)).toEqual([
      DIAGRAM,
      FIGURE,
    ]);
    records.forEach((record) => {
      expect(record).not.toHaveProperty("imageFiles");
      expect(record).not.toHaveProperty("relatedImageFiles");
      // The proposal arrives incomplete, like any other folder proposal --
      // and is answered before it can be added, so what reaches the Curator
      // satisfies the same contract a hand-entered figure does.
      expect(missingRequired("chart", record)).toEqual([]);
    });
    // Only the image whose name matches keeps the notebook.
    expect(records[0].notebookFile).toBe("");
    expect(records[1].notebookFile).toBe(NOTEBOOK);
  });

  it("keeps a supporting file in the target Chart's files, not as a Chart",
     async () => {
    const user = userEvent.setup();
    const { addMany } = renderWith();
    await openPanel(user);

    axios.post.mockResolvedValueOnce({
      data: withCharts({
        applied_chart_plan: [
          { path: DIAGRAM, action: "supporting", target: FIGURE },
          { path: FIGURE, action: "chart", target: "" },
        ],
        candidates: {
          ...analysis.candidates,
          charts: [
            chartCandidate("chart-0", FIGURE, {
              files: [DIAGRAM],
              notebookFile: NOTEBOOK,
            }),
          ],
        },
      }),
    });
    await setRole(user, "diagram.png", "Supporting File");
    await rebuild(user);
    await screen.findByRole("tab", { name: /charts \(1\)/i });

    await user.click(
      screen.getByRole("checkbox", { name: /select figure_S1\.png/i })
    );
    completeRequired();
    await user.click(
      screen.getByRole("button", { name: /add selected items/i })
    );
    const [, records] = addMany.mock.calls[0];
    expect(records).toHaveLength(1);
    expect(records[0].imageFile).toBe(FIGURE);
    expect(records[0].files).toEqual([DIAGRAM]);
  });

  it("shows the applied roles after a rebuild, not the suggestions", async () => {
    const user = userEvent.setup();
    renderWith();
    await openPanel(user);

    axios.post.mockResolvedValueOnce({
      data: withCharts({
        applied_chart_plan: [
          { path: DIAGRAM, action: "supporting", target: FIGURE },
          { path: FIGURE, action: "chart", target: "" },
        ],
      }),
    });
    await setRole(user, "diagram.png", "Supporting File");
    await rebuild(user);
    await screen.findByTestId("chart-plan");

    // What the SERVER applied, not what this component remembered.
    expect(roleSelect("diagram.png")).toHaveTextContent("Supporting File");
    expect(screen.queryByTestId(`chart-review-${DIAGRAM}`)).toBeNull();
  });

  it("Rebuild changes proposals only — nothing is added, saved or published",
     async () => {
    const user = userEvent.setup();
    const { addMany, setAlert } = renderWith();
    await openPanel(user);

    await setRole(user, "diagram.png", "Create Chart");
    await rebuild(user);
    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2));

    expect(addMany).not.toHaveBeenCalled();
    expect(setAlert).not.toHaveBeenCalled();
    const posted = axios.post.mock.calls.map((call) => call[0]);
    expect(posted.every((url) => url === "/api/curation/analyze-folder")).toBe(
      true
    );
  });

  it("Use default boundaries clears the roles and sends no plan", async () => {
    const user = userEvent.setup();
    renderWith();
    await openPanel(user);

    await setRole(user, "diagram.png", "Create Chart");
    await user.click(
      screen.getByRole("button", { name: /use default boundaries/i })
    );

    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2));
    expect(axios.post.mock.calls[1][1]).toEqual({ path: FOLDER });
    await screen.findByTestId("chart-plan");
    expect(roleSelect("diagram.png")).toHaveTextContent("Ignore");
  });

  it("forgets the roles when the dialog is closed and reopened", async () => {
    const user = userEvent.setup();
    renderWith();
    await openPanel(user);
    await setRole(user, "diagram.png", "Create Chart");
    expect(roleSelect("diagram.png")).toHaveTextContent("Create Chart");

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    await user.click(
      await screen.findByRole("button", { name: /analyze rcc folder/i })
    );
    await screen.findByRole("tab", { name: /charts \(1\)/i });
    await user.click(
      screen.getByRole("button", { name: /choose record boundaries/i })
    );

    expect(roleSelect("diagram.png")).toHaveTextContent("Ignore");
    expect(roleSelect("figure_S1.png")).toHaveTextContent("Create Chart");
  });

  it("has no second image-role controller on a candidate card", async () => {
    const user = userEvent.setup();
    renderWith();
    const panel = await openPanel(user);

    await user.click(screen.getByRole("button", { name: "Edit Proposal" }));
    const fields = await screen.findByTestId("fields-chart-0");

    // Every role controller on screen lives in the boundary panel. The card
    // has none: it shows the RESULT, and the panel is the only place a role
    // is decided.
    const roles = screen.getAllByLabelText(/^role for /i);
    expect(roles).toHaveLength(2);
    roles.forEach((control) => expect(panel).toContainElement(control));
    expect(within(fields).queryAllByLabelText(/^role for /i)).toHaveLength(0);
    expect(screen.queryByTestId("image-roles-chart-0")).toBeNull();

    const imageField = within(fields).getByLabelText(
      /^figure image ?\*?$/i,
      { selector: "input" }
    );
    expect(imageField).toHaveValue(FIGURE);
    // A plain text input, not a second chooser.
    expect(imageField.tagName).toBe("INPUT");
  });

  it("still enhances exactly one candidate at a time", async () => {
    const user = userEvent.setup();
    renderWith();
    await openAnalysis(user);

    axios.post.mockResolvedValueOnce({
      data: { suggestions: { "chart-0": { description: "A figure",
                                          keywords: [], confidence: "low" } } },
    });
    await user.click(screen.getByTestId("enhance-chart-0"));
    await user.click(
      screen.getByLabelText(/i agree to send this evidence to gemini/i)
    );
    await user.click(
      screen.getByRole("button", { name: /send and get suggestions/i })
    );

    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2));
    const [url, body] = axios.post.mock.calls[1];
    expect(url).toBe("/api/curation/describe-candidates");
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("chart-0");
  });

  it("wraps its controls instead of overflowing a narrow dialog", async () => {
    const user = userEvent.setup();
    renderWith();
    await openPanel(user);

    const row = screen.getByTestId(`chart-image-${DIAGRAM}`);
    // The row wraps rather than pushing the dialog sideways...
    expect(row).toHaveStyle("flex-wrap: wrap");
    expect(row).toHaveStyle("max-width: 100%");
    // ...and the long filename breaks instead of widening the row.
    expect(screen.getByText("diagram.png")).toHaveStyle(
      "overflow-wrap: anywhere"
    );
  });
});

// The typed import dialog is a review surface, not a dashboard. The title
// already names the artifact, the state of the scan is one chip, and the
// numbers behind it are one click away. These pin the layout contract so the
// four dialogs cannot drift back into a wall of alerts.
describe("typed import dialog ??readable by default", () => {
  const TypedChart = () => {
    const [cache, setCache] = useState({ path: "", data: null });
    return (
      <AlertContext.Provider value={{ setAlert: jest.fn() }}>
        <CuratorContext.Provider
          value={{
            fileServerPath: FOLDER,
            addMany: jest.fn(),
            rccAnalysisCache: cache,
            cacheRccAnalysis: (path, data) => setCache({ path, data }),
          }}
        >
          <FolderAnalysis artifactType="chart" />
        </CuratorContext.Provider>
      </AlertContext.Provider>
    );
  };

  const legacyAnalysis = {
    ...analysis,
    candidates: {
      ...analysis.candidates,
      charts: [
        {
          ...analysis.candidates.charts[0],
          // Per-field standing, exactly as the backend sends it.
          field_evidence: {
            imageFile: "high",
            files: "needs_input",
            notebookFile: "needs_input",
            number: "needs_input",
            caption: "needs_input",
            properties: "needs_input",
          },
        },
      ],
    },
    structure_mode: "legacy",
    truncated: true,
    counts: { files: 1971, directories: 260 },
    limits: {
      max_depth: 4,
      max_files: 2000,
      max_directory_listings: 120,
      max_evidence_files: 30,
    },
    warnings: ["Only the first 4 folder levels were inspected."],
    normalized_roles: { data: "datasets", figures_tables: "charts" },
    structure_issues: [
      { path: "figures_tables", reason: "Read as charts (Qresp Folder Standard name: charts)." },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: legacyAnalysis });
  });

  const openChartImport = async (user) => {
    render(<TypedChart />);
    await user.click(
      screen.getByRole("button", { name: /import charts from rcc/i })
    );
    return screen.findByRole("dialog", { name: /import charts from rcc/i });
  };

  // The figure-first Curator calls an image candidate a FIGURE everywhere
  // else, so the import that creates one says the same word. Wording only:
  // the selection, the validation and the add path are untouched.
  it("calls the action Add selected figures", async () => {
    const user = userEvent.setup();
    await openChartImport(user);

    expect(
      screen.getByRole("button", { name: /add selected figures/i })
    ).toBeInTheDocument();
    // The generic wording is gone from this action.
    expect(
      screen.queryByRole("button", { name: /add selected items to curator/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add selected charts to curator/i })
    ).not.toBeInTheDocument();
  });

  it("counts proposed figures, agreeing with the number", async () => {
    const user = userEvent.setup();
    await openChartImport(user);
    // "1 proposed figures" would tell a curator nobody read this line.
    expect(screen.getByTestId("candidate-count")).toHaveTextContent(
      /\d+ proposed figures? · \d+ selected/
    );
  });

  it("adds exactly what it added before the rename", async () => {
    // The whole point of a wording change is that nothing else moves.
    const user = userEvent.setup();
    const added = [];
    render(
      <AlertContext.Provider value={{ setAlert: jest.fn() }}>
        <CuratorContext.Provider
          value={{
            fileServerPath: FOLDER,
            addMany: (kind, records) => added.push([kind, records]),
          }}
        >
          <FolderAnalysis artifactType="chart" />
        </CuratorContext.Provider>
      </AlertContext.Provider>
    );
    await user.click(
      screen.getByRole("button", { name: /import charts from rcc/i })
    );
    await screen.findByRole("dialog", { name: /import charts from rcc/i });
    await user.click(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    );
    completeRequired();
    await user.click(
      screen.getByRole("button", { name: /add selected figures/i })
    );

    expect(added).toHaveLength(1);
    expect(added[0][0]).toBe("chart");
    expect(added[0][1]).toHaveLength(1);
  });

  it("says figures, not items, in the success message", async () => {
    const user = userEvent.setup();
    const setAlert = jest.fn();
    render(
      <AlertContext.Provider value={{ setAlert }}>
        <CuratorContext.Provider
          value={{ fileServerPath: FOLDER, addMany: jest.fn() }}
        >
          <FolderAnalysis artifactType="chart" />
        </CuratorContext.Provider>
      </AlertContext.Provider>
    );
    await user.click(
      screen.getByRole("button", { name: /import charts from rcc/i })
    );
    await screen.findByRole("dialog", { name: /import charts from rcc/i });
    await user.click(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    );
    completeRequired();
    await user.click(
      screen.getByRole("button", { name: /add selected figures/i })
    );

    const body = setAlert.mock.calls[0][1];
    expect(body).toMatch(/figure was added/i);
    expect(body).not.toMatch(/item\(s\)/i);
  });

  it("names the type once ??no second Charts (N) heading inside", async () => {
    const user = userEvent.setup();
    const dialog = await openChartImport(user);

    expect(
      screen.getByRole("heading", { name: /import charts from rcc/i })
    ).toBeInTheDocument();
    // The old duplicate: a "Charts (1)" heading under a dialog already
    // titled "Import Charts from RCC".
    expect(
      within(dialog).queryByText(/^charts \(\d+\)$/i)
    ).toBeNull();
    expect(within(dialog).queryByRole("tab")).toBeNull();
    // The count itself is kept, as a count of what is on screen.
    expect(screen.getByTestId("candidate-count")).toHaveTextContent(
      "1 proposed figure · 0 selected"
    );
  });

  it("opens with one line of guidance and no summary alerts", async () => {
    const user = userEvent.setup();
    const dialog = await openChartImport(user);

    // Nothing to read past: the partial-view Alert and the structure chip
    // are both diagnostics now, behind Show scan details.
    expect(within(dialog).queryAllByRole("alert")).toHaveLength(0);
    expect(screen.queryByTestId("partial-notice")).toBeNull();
    expect(screen.queryByTestId("scan-details")).toBeNull();
    expect(screen.queryByTestId("folder-mapping")).toBeNull();
    const badge = screen.getByTestId("structure-mode");
    expect(badge).not.toHaveTextContent("Legacy-compatible");
  });

  it("keeps every scan number and every warning behind Show scan details",
     async () => {
    const user = userEvent.setup();
    await openChartImport(user);

    await user.click(
      screen.getByRole("button", { name: /show scan details/i })
    );
    const details = await screen.findByTestId("scan-details");
    expect(details).toHaveTextContent("1971 file(s) across 260 folder(s)");
    expect(details).toHaveTextContent("at most 4 folder levels");
    expect(details).toHaveTextContent("2000 files");
    expect(details).toHaveTextContent("120 directory listings");
    expect(details).toHaveTextContent("30 manifest/script files");
    expect(details).toHaveTextContent(
      /only the first 4 folder levels were inspected/i
    );

    // It closes again, and it is not a scroll container of its own.
    expect(getComputedStyle(details).overflowY).not.toMatch(/auto|scroll/);
    await user.click(
      screen.getByRole("button", { name: /hide scan details/i })
    );
    await waitForElementToBeRemoved(() => screen.queryByTestId("scan-details"));
  });

  it("keeps the whole legacy mapping behind Show folder mapping", async () => {
    const user = userEvent.setup();
    await openChartImport(user);

    await user.click(
      screen.getByRole("button", { name: /show folder mapping/i })
    );
    const mapping = await screen.findByTestId("folder-mapping");
    expect(mapping).toHaveTextContent("data is read as datasets");
    expect(mapping).toHaveTextContent("figures_tables is read as charts");
    expect(mapping).toHaveTextContent(/Read as charts/);
    expect(mapping).toHaveTextContent(/Nothing on the file server is renamed/i);
    expect(getComputedStyle(mapping).overflowY).not.toMatch(/auto|scroll/);
  });

  it("groups a candidate's status and actions so they wrap together",
     async () => {
    const user = userEvent.setup();
    await openChartImport(user);

    const identity = screen.getByTestId("identity-chart-0");
    const status = screen.getByTestId("status-chart-0");
    const actions = screen.getByTestId("actions-chart-0");

    // Three regions. The two right-hand ones wrap INTERNALLY and may shrink:
    // a group that refuses to shrink keeps the full width of four buttons in
    // a row and pushes the card sideways at phone width. Measured in Chrome
    // at 390px: with flex-shrink 0 the card was 414px wide inside a 294px
    // column; allowing it to shrink removed the horizontal scroll entirely.
    expect(status).toHaveStyle("flex-wrap: wrap");
    expect(status).toHaveStyle("min-width: 0");
    expect(actions).toHaveStyle("flex-wrap: wrap");
    expect(actions).toHaveStyle("min-width: 0");
    expect(identity).toHaveStyle("min-width: 0");
    // ...while a button's own label never breaks word by word.
    expect(
      within(actions).getByRole("button", { name: /edit proposal/i })
    ).toHaveStyle("white-space: nowrap");
    // A long relative path breaks instead of pushing the buttons away.
    expect(
      within(identity).getByText("figures", { exact: false })
    ).toHaveStyle("overflow-wrap: anywhere");
    // The header row itself wraps, with real gaps between the groups.
    const header = identity.parentElement;
    expect(header).toHaveStyle("flex-wrap: wrap");
    expect(header).toHaveStyle("column-gap: 12px");
    expect(header).toHaveStyle("row-gap: 12px");
  });

  it("separates the proposal form from the header, and gives the first field room",
     async () => {
    const user = userEvent.setup();
    await openChartImport(user);

    await user.click(screen.getByRole("button", { name: /edit proposal/i }));
    const fields = await screen.findByTestId("fields-chart-0");

    // A rule, then real space before the first input.
    const divider = screen.getByTestId("fields-divider-chart-0");
    expect(divider).toHaveClass("MuiDivider-root");
    expect(fields.previousElementSibling).toBe(divider);
    expect(fields).toHaveStyle("padding-top: 20px");
    // 20px between rows, 16px between the two columns. MUI's Grid carries
    // its spacing as custom properties, so that is what is asserted.
    const grid = getComputedStyle(fields);
    expect(grid.getPropertyValue("--Grid-rowSpacing").trim()).toBe("20px");
    expect(grid.getPropertyValue("--Grid-columnSpacing").trim()).toBe("16px");
  });

  it("keeps the field group to the input alone, with no prose or chip",
     async () => {
    const user = userEvent.setup();
    await openChartImport(user);

    await user.click(screen.getByRole("button", { name: /edit proposal/i }));
    await screen.findByTestId("fields-chart-0");

    const group = screen.getByTestId("field-group-chart-0-imageFile");
    // The layout rule survives; what it lays out is now one thing.
    expect(group).toHaveStyle("display: flex");
    expect(group).toHaveStyle("flex-direction: column");
    expect(group).toHaveStyle("gap: 8px");

    const input = within(group).getByLabelText(/^figure image ?\*?$/i, {
      selector: "input",
    });
    expect(group).toContainElement(input);
    // Neither the paragraph under the input nor the evidence badge.
    expect(
      screen.queryByTestId("field-evidence-chart-0-imageFile")
    ).toBeNull();
    expect(group.textContent).not.toMatch(/the image file for this figure/i);
    expect(group.textContent).not.toMatch(/qresp never guesses/i);
  });

  it("shows no evidence or missing chip on an untouched optional field",
     async () => {
    const user = userEvent.setup();
    await openChartImport(user);

    await user.click(screen.getByRole("button", { name: /edit proposal/i }));
    await screen.findByTestId("fields-chart-0");

    // notebookFile is optional and empty here: no chip of any kind.
    expect(
      screen.queryByTestId("field-evidence-chart-0-notebookFile")
    ).toBeNull();
    // Nothing is required, so nothing is ever reported missing -- not
    // before Add, and not after it.
    expect(screen.queryByTestId("needs-input-chart-0")).toBeNull();
    await user.click(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    );
    await user.click(
      screen.getByRole("button", { name: /add selected figures/i })
    );
    expect(screen.queryByTestId("needs-input-chart-0")).toBeNull();
    expect(screen.queryByTestId("field-evidence-chart-0-caption")).toBeNull();
  });

  it("adds exactly what it added before the layout changed", async () => {
    const user = userEvent.setup();
    const addMany = jest.fn();
    const Harness = () => {
      const [cache, setCache] = useState({ path: "", data: null });
      return (
        <AlertContext.Provider value={{ setAlert: jest.fn() }}>
          <CuratorContext.Provider
            value={{
              fileServerPath: FOLDER,
              addMany,
              rccAnalysisCache: cache,
              cacheRccAnalysis: (path, data) => setCache({ path, data }),
            }}
          >
            <FolderAnalysis artifactType="chart" />
          </CuratorContext.Provider>
        </AlertContext.Provider>
      );
    };
    render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: /import charts from rcc/i })
    );
    await screen.findByRole("dialog", { name: /import charts from rcc/i });

    // The request is untouched by the presentation work.
    expect(axios.post).toHaveBeenCalledWith("/api/curation/analyze-folder", {
      path: FOLDER,
    });

    await user.click(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    );
    completeRequired();
    await user.click(
      screen.getByRole("button", { name: /add selected figures/i })
    );

    expect(addMany).toHaveBeenCalledTimes(1);
    expect(addMany).toHaveBeenCalledWith("chart", [
      expect.objectContaining({
        imageFile: "figures/figure1.png",
        // Answered on the card before it could be added: the layout work
        // did not change what an import is allowed to create.
        number: "1",
        // Optional, so left as the folder had it.
        caption: "",
        properties: ["dos"],
        files: [],
        notebookFile: "",
        extraFields: [],
      }),
    ]);
  });
});

// Remove takes a candidate off the list. It has to take the tick with it:
// a card the curator can no longer see must not keep the count up, keep the
// Add button alive, or make "Add selected" report items it never added.
describe("removing a candidate clears its selection", () => {
  const chart = (index, label) => ({
    id: `chart-${index}`,
    kind: "chart",
    label,
    file_count: 1,
    confidence: "high",
    evidence: [`figures/${label} is a .png image`],
    needs_input: ["caption", "number", "properties"],
    paths: [`figures/${label}`],
    proposal: {
      imageFile: `figures/${label}`,
      files: [],
      notebookFile: "",
      number: "",
      caption: "",
      properties: [],
      extraFields: [],
    },
  });

  const threeCharts = {
    ...analysis,
    structure_mode: "standard",
    candidates: {
      ...analysis.candidates,
      charts: [
        chart(0, "figure1.png"),
        chart(1, "figure2.png"),
        chart(2, "figure3.png"),
      ],
    },
  };

  const TypedHarness = ({ addMany, setAlert }) => {
    const [cache, setCache] = useState({ path: "", data: null });
    return (
      <AlertContext.Provider value={{ setAlert }}>
        <CuratorContext.Provider
          value={{
            fileServerPath: FOLDER,
            addMany,
            rccAnalysisCache: cache,
            cacheRccAnalysis: (path, data) => setCache({ path, data }),
          }}
        >
          <FolderAnalysis artifactType="chart" />
        </CuratorContext.Provider>
      </AlertContext.Provider>
    );
  };

  const renderTyped = () => {
    const addMany = jest.fn();
    const setAlert = jest.fn();
    render(<TypedHarness addMany={addMany} setAlert={setAlert} />);
    return { addMany, setAlert };
  };

  const openTyped = async (user) => {
    await user.click(
      screen.getByRole("button", { name: /import charts from rcc/i })
    );
    return screen.findByRole("dialog", { name: /import charts from rcc/i });
  };

  // This suite is about the BOOKKEEPING of selection -- what the count says,
  // what Add would send, what Remove takes with it. Each card is answered as
  // it is ticked so that the Add button reflects the selection and nothing
  // else; readiness has its own tests.
  const pick = async (user, name) => {
    await user.click(screen.getByRole("checkbox", { name: `Select ${name}` }));
    completeRequired();
  };

  // Remove sits in the card's own action group, so it is addressed through
  // the card rather than by index.
  const removeCard = async (user, name) => {
    const card = screen
      .getByRole("checkbox", { name: `Select ${name}` })
      .closest("[class*='MuiBox-root']").parentElement;
    await user.click(within(card).getByRole("button", { name: /^remove$/i }));
  };

  const addButton = () =>
    screen.getByRole("button", { name: /add selected figures/i });

  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: threeCharts });
  });

  it("counts one selection, then none once it is removed", async () => {
    const user = userEvent.setup();
    renderTyped();
    await openTyped(user);

    expect(screen.getByTestId("candidate-count")).toHaveTextContent(
      "3 proposed figures · 0 selected"
    );

    await pick(user, "figure1.png");
    expect(screen.getByTestId("candidate-count")).toHaveTextContent(
      "3 proposed figures · 1 selected"
    );
    expect(addButton()).toBeEnabled();

    await removeCard(user, "figure1.png");

    // The card is gone, and so is everything it was counted in.
    expect(screen.queryByText("figure1.png")).toBeNull();
    expect(screen.getByTestId("candidate-count")).toHaveTextContent(
      "2 proposed figures · 0 selected"
    );
    expect(addButton()).toBeDisabled();
  });

  it("never reports adding something it did not add", async () => {
    const user = userEvent.setup();
    const { addMany, setAlert } = renderTyped();
    await openTyped(user);

    await pick(user, "figure1.png");
    await removeCard(user, "figure1.png");

    // The button is the guard: with nothing selectable left it cannot be
    // pressed, so no "0 item(s) were added" alert and no silent close.
    expect(addButton()).toBeDisabled();
    expect(addMany).not.toHaveBeenCalled();
    expect(setAlert).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: /import charts from rcc/i })
    ).toBeInTheDocument();
  });

  it("drops exactly the removed one from the count and the payload", async () => {
    const user = userEvent.setup();
    const { addMany } = renderTyped();
    await openTyped(user);

    await pick(user, "figure1.png");
    await pick(user, "figure2.png");
    await pick(user, "figure3.png");
    expect(screen.getByTestId("candidate-count")).toHaveTextContent(
      "3 proposed figures · 3 selected"
    );

    await removeCard(user, "figure2.png");
    expect(screen.getByTestId("candidate-count")).toHaveTextContent(
      "2 proposed figures · 2 selected"
    );

    await user.click(addButton());
    const [kind, records] = addMany.mock.calls[0];
    expect(kind).toBe("chart");
    expect(records.map((record) => record.imageFile)).toEqual([
      "figures/figure1.png",
      "figures/figure3.png",
    ]);
  });

  it("leaves the other candidates' selection alone", async () => {
    const user = userEvent.setup();
    const { addMany } = renderTyped();
    await openTyped(user);

    await pick(user, "figure1.png");
    await pick(user, "figure3.png");
    // figure2 was never ticked; removing it must not disturb the two that
    // were.
    await removeCard(user, "figure2.png");

    expect(screen.getByTestId("candidate-count")).toHaveTextContent(
      "2 proposed figures · 2 selected"
    );
    expect(
      screen.getByRole("checkbox", { name: "Select figure1.png" })
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Select figure3.png" })
    ).toBeChecked();

    await user.click(addButton());
    expect(addMany.mock.calls[0][1]).toHaveLength(2);
  });

  it("keeps the curator's edits on the candidates that stay", async () => {
    const user = userEvent.setup();
    const { addMany } = renderTyped();
    await openTyped(user);

    await pick(user, "figure1.png");
    // Pasted rather than typed: every keystroke re-renders the open dialog,
    // and what this test is about is the draft surviving a Remove. Written
    // OVER the answer `pick` gave, so the value asserted below can only be
    // the curator's own.
    await user.clear(screen.getByLabelText(/^figure caption ?\*?$/i));
    await user.click(screen.getByLabelText(/^figure caption ?\*?$/i));
    await user.paste("The curator's own caption");
    await removeCard(user, "figure3.png");

    await user.click(addButton());
    expect(addMany.mock.calls[0][1]).toEqual([
      expect.objectContaining({
        imageFile: "figures/figure1.png",
        caption: "The curator's own caption",
      }),
    ]);
  });

  it("applies the same rule in the whole-folder dialog", async () => {
    const user = userEvent.setup();
    const addMany = jest.fn();
    const setAlert = jest.fn();
    render(
      <AlertContext.Provider value={{ setAlert }}>
        <CuratorContext.Provider value={{ fileServerPath: FOLDER, addMany }}>
          <FolderAnalysis />
        </CuratorContext.Provider>
      </AlertContext.Provider>
    );
    await user.click(screen.getByRole("button", { name: /analyze rcc folder/i }));
    await screen.findByRole("tab", { name: /charts \(3\)/i });

    const apply = screen.getByRole("button", {
      name: /add selected items/i,
    });
    await pick(user, "figure1.png");
    expect(apply).toBeEnabled();

    await removeCard(user, "figure1.png");
    expect(
      screen.getByRole("tab", { name: /charts \(2\)/i })
    ).toBeInTheDocument();
    // The count lives on the tab here, and the button must agree with it.
    expect(apply).toBeDisabled();
    expect(addMany).not.toHaveBeenCalled();
    expect(setAlert).not.toHaveBeenCalled();
  });
});

// Everything a candidate card expands sits on ONE axis, centred in the card.
//
// The fields used to carry `pl: { xs: 0, sm: 5 }` — 40px of padding on the
// left and none on the right — so the two-column form sat 40px right of the
// card's own centre and the right margin looked half the left one. jsdom has
// no layout, so these pin the CONTRACT; the actual insets are measured in
// Chrome (see the report accompanying this change: 57/17 before, 33/33 after
// at 1440x900 and 900x800).
describe("a card's expanded areas share one centred axis", () => {
  const openTyped = async (user) => {
    await user.click(
      screen.getByRole("button", { name: /import charts from rcc/i })
    );
    return screen.findByRole("dialog", { name: /import charts from rcc/i });
  };

  const renderTyped = () => {
    const addMany = jest.fn();
    const setAlert = jest.fn();
    render(
      <AlertContext.Provider value={{ setAlert }}>
        <CuratorContext.Provider
          value={{ fileServerPath: FOLDER, addMany, charts: [] }}
        >
          <FolderAnalysis artifactType="chart" />
        </CuratorContext.Provider>
      </AlertContext.Provider>
    );
    return { addMany, setAlert };
  };

  const horizontalPadding = (element) => {
    const style = getComputedStyle(element);
    return { left: style.paddingLeft, right: style.paddingRight };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: analysis });
  });

  it("pads the proposal form symmetrically, never on one side", async () => {
    const user = userEvent.setup();
    renderTyped();
    await openTyped(user);
    await user.click(screen.getByRole("button", { name: "Edit Proposal" }));

    const wrapper = await screen.findByTestId("fields-wrapper-chart-0");
    const padding = horizontalPadding(wrapper);
    expect(padding.left).toBe(padding.right);
    // A left-only inset is exactly what pushed the form off centre.
    expect(padding.left).not.toBe("40px");
    expect(wrapper).toHaveStyle("width: 100%");
    expect(wrapper).toHaveStyle("box-sizing: border-box");
    expect(wrapper).toHaveStyle("margin-left: auto");
    expect(wrapper).toHaveStyle("margin-right: auto");
  });

  it("gives Details the same axis as the proposal form", async () => {
    const user = userEvent.setup();
    renderTyped();
    await openTyped(user);
    await user.click(screen.getByRole("button", { name: /^details$/i }));
    await user.click(screen.getByRole("button", { name: "Edit Proposal" }));

    const details = await screen.findByTestId("details-chart-0");
    const fields = await screen.findByTestId("fields-wrapper-chart-0");
    // Same wrapper contract on both, so opening one does not shift the other.
    expect(horizontalPadding(details)).toEqual(horizontalPadding(fields));
    expect(details).toHaveStyle("width: 100%");
    expect(details).toHaveStyle("box-sizing: border-box");
  });

  it("keeps the AI suggestion on that axis too", async () => {
    const user = userEvent.setup();
    renderTyped();
    await openTyped(user);

    axios.post.mockResolvedValueOnce({
      data: { suggestions: { "chart-0": { description: "A figure",
                                          keywords: [], confidence: "low" } } },
    });
    await user.click(screen.getByTestId("enhance-chart-0"));
    await user.click(
      screen.getByLabelText(/i agree to send this evidence to gemini/i)
    );
    await user.click(
      screen.getByRole("button", { name: /send and get suggestions/i })
    );
    const panel = await screen.findByTestId("ai-panel-chart-0");
    await user.click(screen.getByRole("button", { name: "Edit Proposal" }));

    expect(horizontalPadding(panel)).toEqual(
      horizontalPadding(screen.getByTestId("fields-wrapper-chart-0"))
    );
  });

  it("no expanded area carries a one-sided inset any more", async () => {
    const user = userEvent.setup();
    renderTyped();
    await openTyped(user);
    await user.click(screen.getByRole("button", { name: /^details$/i }));
    await user.click(screen.getByRole("button", { name: "Edit Proposal" }));

    ["details-chart-0", "fields-wrapper-chart-0"].forEach((id) => {
      const padding = horizontalPadding(screen.getByTestId(id));
      expect(padding.left).toBe(padding.right);
    });
    // The grid itself only spaces its rows and columns; the inset is the
    // wrapper's job, in one place.
    const grid = screen.getByTestId("fields-chart-0");
    expect(getComputedStyle(grid).paddingLeft).toBe(
      getComputedStyle(grid).paddingRight
    );
  });

  it("still stacks the fields into one column on a phone", async () => {
    const user = userEvent.setup();
    renderTyped();
    await openTyped(user);
    await user.click(screen.getByRole("button", { name: "Edit Proposal" }));

    // Mobile-first, straight from MUI's own classes: all 12 columns until
    // the md breakpoint puts two fields on a row.
    const items = Array.from(
      screen.getByTestId("fields-chart-0").children
    );
    expect(items.length).toBeGreaterThan(1);
    items.forEach((item) => {
      expect(item).toHaveClass("MuiGrid-grid-xs-12");
      expect(item).toHaveClass("MuiGrid-grid-md-6");
      // ...and it can shrink, so a long path wraps instead of widening the
      // row and pushing the form sideways again.
      expect(getComputedStyle(item).minWidth).toBe("0");
    });
  });

  it("changes nothing about selecting, removing or adding", async () => {
    const user = userEvent.setup();
    const { addMany } = renderTyped();
    await openTyped(user);

    await user.click(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    );
    expect(screen.getByTestId("candidate-count")).toHaveTextContent(
      "1 proposed figure · 1 selected"
    );
    completeRequired();
    await user.click(
      screen.getByRole("button", { name: /add selected figures/i })
    );

    expect(addMany).toHaveBeenCalledTimes(1);
    expect(addMany.mock.calls[0][1]).toEqual([
      expect.objectContaining({ imageFile: "figures/figure1.png" }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// IMPORT IS HELD TO THE SAME CONTRACT AS TYPING IT IN BY HAND.
//
// Manual entry has always refused to save a Chart with no caption. Import did
// not: finding a .png in a folder was enough to create one, and the refusal
// arrived at publish, from the server, long after the folder was closed.
//
// The contract is not restated here or in the component. `missingRequired`
// from Utils/artifactFields is what the Add form's resolver checks, what the
// card checks, and what schema.json requires of a published paper.
describe("an RCC import may not create what a curator could not type", () => {
  const complete = {
    ...analysis,
    candidates: {
      ...analysis.candidates,
      charts: [
        {
          ...analysis.candidates.charts[0],
          needs_input: [],
          proposal: {
            ...analysis.candidates.charts[0].proposal,
            number: "1",
            caption: "Vibrational density of states",
            properties: ["vdos"],
          },
        },
      ],
      datasets: [
        {
          ...analysis.candidates.datasets[0],
          needs_input: [],
          proposal: {
            ...analysis.candidates.datasets[0].proposal,
            readme: "A short 2 ps trajectory",
          },
        },
      ],
      scripts: [
        {
          ...analysis.candidates.scripts[0],
          needs_input: [],
          proposal: {
            ...analysis.candidates.scripts[0].proposal,
            readme: "Plots the VDOS",
          },
        },
      ],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("adds a candidate of any kind that already has everything", async () => {
    // The quick path is untouched: a folder that answers every required
    // question is one tick and one button, with nothing to fill in and
    // nothing said about fields.
    axios.post.mockResolvedValue({ data: complete });
    const user = noDelayUser();
    const { addMany } = renderWith();
    await openAnalysis(user);

    const kinds = [
      [/charts \(1\)/i, /select figure1\.png/i, "chart-0"],
      [/datasets \(1\)/i, /select short_traj/i, "dataset-0"],
      [/scripts \(1\)/i, /select plot_vdos\.py/i, "script-0"],
      [/tools \(1\)/i, /select numpy 1\.26\.4/i, "tool-0"],
    ];
    for (const [tab, box, id] of kinds) {
      await user.click(screen.getByRole("tab", { name: tab }));
      expect(screen.queryByTestId(`needs-input-${id}`)).toBeNull();
      await user.click(screen.getByRole("checkbox", { name: box }));
    }

    expect(screen.queryByTestId("blocked-summary")).toBeNull();
    await user.click(screen.getByTestId("apply-selected"));

    expect(addMany).toHaveBeenCalledTimes(4);
    const added = Object.fromEntries(
      addMany.mock.calls.map(([kind, records]) => [kind, records])
    );
    ["chart", "dataset", "script", "tool"].forEach((kind) => {
      expect(added[kind]).toHaveLength(1);
      expect(missingRequired(kind, added[kind][0])).toEqual([]);
    });
  });

  it("says nothing about missing fields on a folder nobody has asked for",
     async () => {
    // A folder of proposals opened as a wall of identical warnings, one per
    // card, about work the curator had not started. The reading was right
    // and the moment was wrong.
    axios.post.mockResolvedValue({ data: analysis });
    const user = noDelayUser();
    renderWith();
    await openAnalysis(user);

    for (const [tab, id] of [
      [/charts \(1\)/i, "chart-0"],
      [/datasets \(1\)/i, "dataset-0"],
      [/scripts \(1\)/i, "script-0"],
      [/tools \(1\)/i, "tool-0"],
    ]) {
      await user.click(screen.getByRole("tab", { name: tab }));
      expect(screen.queryByTestId(`needs-input-${id}`)).toBeNull();
    }
    expect(screen.queryByTestId("blocked-summary")).toBeNull();
    // What a card does carry: its name, its kind, its path and its tick.
    await user.click(screen.getByRole("tab", { name: /scripts \(1\)/i }));
    expect(
      screen.getByRole("checkbox", { name: /select plot_vdos\.py/i })
    ).toBeInTheDocument();
  });

  it("never refuses an Add for a blank field", async () => {
    axios.post.mockResolvedValue({ data: analysis });
    const user = noDelayUser();
    const { addMany } = renderWith();
    await openAnalysis(user);
    await user.click(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    );

    await askToAdd(user);

    expect(addMany).toHaveBeenCalledTimes(1);
    const [kind, records] = addMany.mock.calls[0];
    expect(kind).toBe("chart");
    // Added as the folder had it: number and keywords blank.
    expect(records[0]).toMatchObject({
      imageFile: "figures/figure1.png",
      number: "",
      properties: [],
    });
    expect(screen.queryByTestId("blocked-summary")).toBeNull();
    // And no input is marked invalid for being empty.
    ["number", "properties", "caption"].forEach((field) =>
      expect(
        within(screen.queryByTestId(`field-group-chart-0-${field}`) || document.body)
          .queryAllByRole("textbox")
          .filter((box) => box.getAttribute("aria-invalid") === "true")
      ).toHaveLength(0)
    );
  });

  it("adds a whole batch together, complete or not", async () => {
    axios.post.mockResolvedValue({
      data: {
        ...complete,
        candidates: {
          ...complete.candidates,
          // Two figures: one complete, one with no keywords.
          charts: [
            complete.candidates.charts[0],
            {
              ...analysis.candidates.charts[0],
              id: "chart-1",
              label: "figure2.png",
              paths: ["figures/figure2.png"],
              proposal: {
                ...analysis.candidates.charts[0].proposal,
                imageFile: "figures/figure2.png",
                number: "2",
                caption: "",
                properties: [],
              },
            },
          ],
        },
      },
    });
    const user = noDelayUser();
    const { addMany } = renderWith();
    await user.click(analyzeButton());
    await screen.findByRole("tab", { name: /charts \(2\)/i });

    await user.click(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    );
    await user.click(
      screen.getByRole("checkbox", { name: /select figure2\.png/i })
    );
    await askToAdd(user);

    expect(addMany).toHaveBeenCalledTimes(1);
    expect(addMany.mock.calls[0][1]).toHaveLength(2);
    expect(screen.queryByTestId("blocked-summary")).toBeNull();
  });

  it("adds an AI suggestion's values without asking for the rest", async () => {
    // The AI fills fields; the figure's NUMBER is not something a model may
    // invent, and it is simply left blank.
    axios.post.mockResolvedValue({ data: analysis });
    const user = noDelayUser();
    const { addMany } = renderWith();
    await openAnalysis(user);
    await user.click(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    );
    await user.click(screen.getByTestId("enhance-chart-0"));
    await screen.findByRole("heading", { name: /send .* to gemini\?/i });
    axios.post.mockResolvedValue({
      data: {
        suggestions: {
          "chart-0": { description: "A density of states plot",
                       keywords: ["dos"] },
        },
      },
    });
    await user.click(
      screen.getByRole("checkbox", {
        name: /i agree to send this evidence to gemini for this request/i,
      })
    );
    await user.click(
      screen.getByRole("button", { name: /send and get suggestions/i })
    );
    await screen.findByTestId("ai-use-description-chart-0");
    await user.click(screen.getByTestId("ai-use-description-chart-0"));
    await user.click(screen.getByTestId("ai-use-keywords-chart-0"));

    await askToAdd(user);
    expect(addMany).toHaveBeenCalledTimes(1);
    expect(addMany.mock.calls[0][1][0]).toMatchObject({
      caption: "A density of states plot",
      properties: ["dos"],
      number: "",
    });
  });

  it("agrees with manual entry and the server: nothing is required", () => {
    // Three statements of one contract, checked against each other rather
    // than trusted: the shared module the forms and the cards both read, and
    // the server's own publish schema.
    const schema = JSON.parse(
      readFileSync(
        pathJoin(__dirname, "..", "..", "backend", "project", "schema.json"),
        "utf8"
      )
    );
    const sections = schema.properties;
    // `id` is minted by the reducer and never entered by anyone, so it is
    // the one required key that is not a question for a curator.
    const serverRequires = (node) =>
      ((node && node.required) || []).filter((key) => key !== "id").sort();

    ["chart", "dataset", "script", "tool"].forEach((kind) =>
      expect(requiredKeys(kind)).toEqual([])
    );
    expect(serverRequires(sections.charts.items)).toEqual([]);
    expect(serverRequires(sections.datasets.items)).toEqual([]);
    expect(serverRequires(sections.scripts.items)).toEqual([]);
    // No tool branch requires a package, a version, a facility or a
    // measurement.
    (sections.tools.items.allOf || []).forEach((branch) =>
      expect(serverRequires(branch.then)).toEqual([])
    );
  });
});

// A candidate is completed WHERE IT IS.
//
// There was briefly a second route -- "Complete in form" handed the card to
// the artifact's own Add form, watched the Curator for a save, and took the
// card off the list. It worked, and it was a whole parallel flow for a job
// the card already does: the card's inputs ARE the contract's fields, under
// the contract's labels, prefilled with whatever the folder answered.
describe("there is one way to complete a candidate, not two", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: analysis });
  });

  it("offers no second route out of the card", async () => {
    const user = noDelayUser();
    renderWith();
    await openAnalysis(user);
    await user.click(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    );

    expect(screen.queryByTestId("complete-chart-0")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /complete in form/i })
    ).toBeNull();
    // What is there instead: the fields themselves, on the card.
    expect(
      screen.getByTestId("field-group-chart-0-caption")
    ).toBeInTheDocument();
  });
});


// "No connections were detected" and "no connections were detected, and four
// scripts were never opened" are different answers. A curator acting on the
// first when the second is true has been misled by silence.
// ---------------------------------------------------------------------------
// A FOLDER WITH TWO DOZEN CANDIDATES IN IT.
//
// One of everything is enough to test what a card SAYS. It is not enough to
// test what touching one card costs, because the whole point is what happens
// to the other twenty-three: before the card became its own component, every
// checkbox, keystroke and Details toggle re-rendered all of them, and a
// single toggle on a folder this size cost about 92ms.
//
// 24 fits under the collapse threshold (25), so every card is really on the
// page and no "Show all" click is needed to get there.
const chartAt = (index) => ({
  id: `chart-${index}`,
  kind: "chart",
  label: `figure${index}.png`,
  file_count: 1,
  confidence: "high",
  evidence: [`figures/figure${index}.png is a .png image`],
  needs_input: ["caption", "number", "properties"],
  paths: [`figures/figure${index}.png`],
  ai_sources: [],
  inventory: {
    file_count: 1,
    extensions: [{ extension: ".png", count: 1 }],
    sample_names: [`figure${index}.png`],
  },
  proposal: {
    imageFile: `figures/figure${index}.png`,
    files: [],
    notebookFile: "",
    number: "",
    caption: "",
    properties: [],
    extraFields: [],
  },
});

const CROWD = 24;
const crowded = {
  ...analysis,
  candidates: {
    ...analysis.candidates,
    charts: Array.from({ length: CROWD }, (_, index) => chartAt(index)),
  },
};

describe("touching one candidate touches one candidate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: crowded });
  });

  // Opens the dialog on the crowded folder and hands back a clean render
  // counter: the initial-draft effect has already run by this point, so
  // everything the spy records from here is a card rendering.
  const openCrowd = async (user) => {
    renderWith();
    await user.click(analyzeButton());
    await screen.findByRole("tab", { name: new RegExp(`charts \\(${CROWD}\\)`, "i") });
    toDraft.mockClear();
  };

  // Which cards React rendered since the last clear, by candidate id. The
  // proposal objects are the fixture's own, so identity names the card.
  const rendered = () =>
    toDraft.mock.calls.map(([, proposal]) => {
      const match = crowded.candidates.charts.find(
        (candidate) => candidate.proposal === proposal
      );
      return match ? match.id : "other";
    });

  const distinct = () => Array.from(new Set(rendered()));

  const tick = (index) =>
    screen.getByRole("checkbox", { name: `Select figure${index}.png` });
  const detailsButton = (index) =>
    within(screen.getByTestId(`actions-chart-${index}`)).getByRole("button", {
      name: "Details",
    });
  const editButton = (index) =>
    within(screen.getByTestId(`actions-chart-${index}`)).getByRole("button", {
      name: "Edit Proposal",
    });
  const captionInput = (index) =>
    within(screen.getByTestId(`field-group-chart-${index}-caption`)).getByRole(
      "textbox"
    );

  // --- what re-renders -----------------------------------------------------

  it("renders one card when one checkbox is ticked, not twenty-four", async () => {
    const user = noDelayUser();
    await openCrowd(user);

    await user.click(tick(7));

    expect(distinct()).toEqual(["chart-7"]);
  });

  it("stays at one card per tick across a run of them", async () => {
    // The regression this guards is not one expensive click, it is a
    // curator working down a list: six ticks used to be six full renders of
    // the whole list.
    const user = noDelayUser();
    await openCrowd(user);

    for (const index of [1, 3, 5, 7, 9, 11]) {
      await user.click(tick(index));
    }

    expect(rendered()).toHaveLength(6);
    expect(distinct()).toHaveLength(6);
  });

  it("renders one card per keystroke, whatever else is on the page", async () => {
    const user = noDelayUser();
    await openCrowd(user);
    await user.click(tick(2));
    await user.click(tick(9));
    toDraft.mockClear();

    await user.type(captionInput(2), "abc");

    // Three characters, three renders, all of them the same card.
    expect(rendered()).toHaveLength(3);
    expect(distinct()).toEqual(["chart-2"]);
  });

  it("renders one card when Details opens", async () => {
    const user = noDelayUser();
    await openCrowd(user);

    await user.click(detailsButton(4));
    expect(distinct()).toEqual(["chart-4"]);

    toDraft.mockClear();
    await user.click(detailsButton(4));
    expect(distinct()).toEqual(["chart-4"]);
  });

  it("leaves another card's own DOM nodes in place when one is ticked", async () => {
    const user = noDelayUser();
    await openCrowd(user);
    const neighbourBox = tick(3);
    const neighbourIdentity = screen.getByTestId("identity-chart-3");

    await user.click(tick(7));

    // Not "looks the same" — the same node. A remount replaces it, which is
    // what loses focus, selection and scroll position in the real dialog.
    expect(tick(3)).toBe(neighbourBox);
    expect(screen.getByTestId("identity-chart-3")).toBe(neighbourIdentity);
  });

  it("leaves another card's input in place, with its value, while one is typed into", async () => {
    const user = noDelayUser();
    await openCrowd(user);
    await user.click(tick(2));
    await user.click(tick(9));
    await fill(user, captionInput(9), "NEIGHBOUR");
    const neighbourInput = captionInput(9);

    await user.type(captionInput(2), "mine");

    expect(captionInput(9)).toBe(neighbourInput);
    expect(captionInput(9)).toHaveValue("NEIGHBOUR");
    expect(captionInput(2)).toHaveValue("mine");
  });

  it("keeps the caret in the field being typed into", async () => {
    const user = noDelayUser();
    await openCrowd(user);
    await user.click(tick(5));

    const field = captionInput(5);
    // Three characters is three re-renders of this card; a tenth character
    // proves nothing the third did not, and costs seven more.
    await user.type(field, "abc");

    expect(document.activeElement).toBe(field);
  });

  it("keeps focus on a checkbox that was just ticked", async () => {
    const user = noDelayUser();
    await openCrowd(user);

    await user.click(tick(6));

    expect(document.activeElement).toBe(tick(6));
    expect(tick(6)).toBeChecked();
  });

  it("keeps focus on the Details button that opened Details", async () => {
    const user = noDelayUser();
    await openCrowd(user);

    const button = detailsButton(8);
    await user.click(button);

    expect(detailsButton(8)).toBe(button);
    expect(document.activeElement).toBe(button);
  });

  it("leaves an unrelated card's opened fields open", async () => {
    const user = noDelayUser();
    await openCrowd(user);
    await user.click(editButton(10));
    const opened = screen.getByTestId("fields-chart-10");

    await user.click(tick(0));
    await user.click(detailsButton(20));

    expect(screen.getByTestId("fields-chart-10")).toBe(opened);
  });

  // --- what still changes --------------------------------------------------

  it("asks the backend nothing at all for any of this", async () => {
    const user = noDelayUser();
    await openCrowd(user);
    // One call: the analysis itself.
    expect(axios.post).toHaveBeenCalledTimes(1);

    await user.click(tick(1));
    await user.click(tick(2));
    await user.click(detailsButton(3));
    await user.click(detailsButton(3));
    await user.click(editButton(4));
    await user.type(captionInput(1), "typed");
    await askToAdd(user);

    // Selecting, opening, typing and being refused are all local. Nothing
    // here may turn into a request per interaction.
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it("keeps the consent dialog's own controls in place while it is answered", async () => {
    const user = noDelayUser();
    await openCrowd(user);
    await user.click(screen.getByTestId("enhance-chart-0"));
    const heading = await screen.findByRole("heading", {
      name: /send .* to gemini\?/i,
    });
    const box = screen.getByRole("checkbox", {
      name: /i agree to send this evidence to gemini for this request/i,
    });

    await user.click(box);

    // Ticking consent must not rebuild the dialog under the curator's
    // pointer: same heading, same checkbox, still focused, now ticked.
    expect(
      screen.getByRole("heading", { name: /send .* to gemini\?/i })
    ).toBe(heading);
    expect(box).toBeChecked();
    expect(document.activeElement).toBe(box);
    // And declining sends nothing.
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(axios.post).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// THE OTHER REPEATED ROW.
//
// The chart-image row carries a thumbnail and two MUI selects per image, in a
// panel that sits on the same screen as the candidate list. It was a function
// call inside FolderAnalysis, so a keystroke in a candidate field three
// panels away re-rendered every one of them. It is a component now; these
// tests are what keep it one.
describe("a chart image row is its own component", () => {
  const FOLDER_A = "figures_tables/figure_S1";
  const FOLDER_B = "figures_tables/figure_S2";
  const A_MAIN = `${FOLDER_A}/figure_S1.png`;
  const A_ALT = `${FOLDER_A}/overview.png`;
  const A_SIDE = `${FOLDER_A}/panel_b.png`;
  const B_MAIN = `${FOLDER_B}/figure_S2.png`;
  const B_SIDE = `${FOLDER_B}/inset.png`;

  // Two folders, two images each, in the response's own shape: one image the
  // analyser would make the Chart, one it wants a decision about.
  const GROUPS = [
    {
      folder: FOLDER_A,
      role_root: "figures_tables",
      // Three images, two of them Charts, so a supporting file in this
      // folder has a real choice to make rather than one forced answer.
      images: [
        { path: A_SIDE, reason: "image found in this chart folder",
          suggested_action: "review" },
        { path: A_MAIN, reason: "filename matches the chart folder",
          suggested_action: "chart" },
        { path: A_ALT, reason: "image found in this chart folder",
          suggested_action: "chart" },
      ],
      notebooks: [],
    },
    {
      folder: FOLDER_B,
      role_root: "figures_tables",
      images: [
        { path: B_SIDE, reason: "image found in this chart folder",
          suggested_action: "review" },
        { path: B_MAIN, reason: "filename matches the chart folder",
          suggested_action: "chart" },
      ],
      notebooks: [],
    },
  ];

  // ...and candidates alongside them, because the point is what a click on
  // one of THOSE costs the rows. Eight, not two dozen: the render counter
  // below is exact -- it reads zero or it does not -- so a longer list would
  // add seconds to every test in this block and nothing to what any of them
  // proves. The two-dozen list lives in "touching one candidate touches one
  // candidate", where the size IS the point.
  const CROWD = 8;
  const crowdChart = (index) => ({
    id: `chart-${index}`,
    kind: "chart",
    label: `figure${index}.png`,
    file_count: 1,
    confidence: "high",
    evidence: [`figures/figure${index}.png is a .png image`],
    needs_input: ["caption", "number", "properties"],
    paths: [`figures/figure${index}.png`],
    ai_sources: [],
    inventory: {
      file_count: 1,
      extensions: [{ extension: ".png", count: 1 }],
      sample_names: [`figure${index}.png`],
    },
    proposal: {
      imageFile: `figures/figure${index}.png`,
      files: [],
      notebookFile: "",
      number: "",
      caption: "",
      properties: [],
      extraFields: [],
    },
  });

  const withGroups = {
    ...analysis,
    structure_mode: "standard",
    boundary_trees: {},
    chart_image_groups: GROUPS,
    applied_chart_plan: [],
    candidates: {
      ...analysis.candidates,
      charts: Array.from({ length: CROWD }, (_, i) => crowdChart(i)),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: withGroups });
  });

  // A row calls buildFileUrl(base, image.path) once per render, for its own
  // image, so a spy on it counts renders per row the way toDraft counts
  // renders per card. Nothing else in this dialog calls it.
  const rowRenders = () =>
    buildFileUrl.mock.calls.map(([, path]) => path);

  const openPanel = async (user) => {
    renderWith();
    await user.click(analyzeButton());
    await screen.findByRole("tab", { name: new RegExp(`charts \\(${CROWD}\\)`, "i") });
    await user.click(
      screen.getByRole("button", { name: /choose record boundaries/i })
    );
    await screen.findByTestId("chart-plan");
    buildFileUrl.mockClear();
  };

  const nameOf = (path) => path.split("/").pop();
  const row = (path) => screen.getByTestId(`chart-image-${path}`);
  const thumb = (path) => row(path).querySelector("img");
  const roleSelect = (path) =>
    screen.getByLabelText(new RegExp(`^role for ${nameOf(path)}`, "i"));
  const targetSelect = (path) =>
    screen.getByLabelText(new RegExp(`^chart for ${nameOf(path)}`, "i"));
  const pick = async (user, select, option) => {
    await user.click(select);
    await user.click(await screen.findByRole("option", { name: option }));
  };

  // --- what re-renders -----------------------------------------------------

  it("does not re-render when an unrelated candidate is ticked", async () => {
    const user = noDelayUser();
    await openPanel(user);

    await user.click(
      screen.getByRole("checkbox", { name: "Select figure7.png" })
    );

    // The candidate list and the chart plan are on the same screen. A tick in
    // one is not a reason to rebuild four thumbnails and eight selects.
    expect(rowRenders()).toEqual([]);
  });

  it("does not re-render when an unrelated candidate is typed into", async () => {
    const user = noDelayUser();
    await openPanel(user);
    await user.click(
      screen.getByRole("checkbox", { name: "Select figure3.png" })
    );
    buildFileUrl.mockClear();

    await user.type(
      within(screen.getByTestId("field-group-chart-3-caption")).getByRole(
        "textbox"
      ),
      "abc"
    );

    expect(rowRenders()).toEqual([]);
  });

  it("re-renders only the row whose role changed", async () => {
    const user = noDelayUser();
    await openPanel(user);

    await pick(user, roleSelect(A_SIDE), "Supporting File");

    // Its own role changed and nothing else did: the Charts this folder
    // offers are the same before and after, so its siblings are not touched
    // and neither is the other folder.
    expect(Array.from(new Set(rowRenders()))).toEqual([A_SIDE]);
  });

  it("re-renders the sibling too when the folder's Chart list changes",
     async () => {
    const user = noDelayUser();
    await openPanel(user);

    // Taking a Chart out of folder A shortens what a supporting file there
    // could attach to, which every row in that folder has to show.
    await pick(user, roleSelect(A_MAIN), "Ignore");

    const touched = Array.from(new Set(rowRenders())).sort();
    expect(touched).toEqual([A_MAIN, A_ALT, A_SIDE].sort());
    // Folder B's list did not change, so folder B is not re-rendered.
    expect(touched).not.toContain(B_MAIN);
    expect(touched).not.toContain(B_SIDE);
  });

  it("re-renders only the row whose Chart target changed", async () => {
    const user = noDelayUser();
    await openPanel(user);
    // Becoming a supporting file attaches it to the first Chart in the
    // folder; this moves it to the other one.
    await pick(user, roleSelect(A_SIDE), "Supporting File");
    buildFileUrl.mockClear();

    await pick(user, targetSelect(A_SIDE), "overview.png");

    expect(Array.from(new Set(rowRenders()))).toEqual([A_SIDE]);
  });

  // --- what survives -------------------------------------------------------

  it("keeps every other row's thumbnail and selects when one role changes",
     async () => {
    const user = noDelayUser();
    await openPanel(user);
    const otherRow = row(B_SIDE);
    const otherThumb = thumb(B_SIDE);
    const otherSelect = roleSelect(B_SIDE);

    await pick(user, roleSelect(A_SIDE), "Supporting File");

    expect(row(B_SIDE)).toBe(otherRow);
    expect(thumb(B_SIDE)).toBe(otherThumb);
    expect(otherThumb).toHaveAttribute("src", expect.stringContaining("inset.png"));
    expect(roleSelect(B_SIDE)).toBe(otherSelect);
  });

  it("keeps its own DOM when an unrelated candidate is opened", async () => {
    const user = noDelayUser();
    await openPanel(user);
    const kept = row(A_MAIN);
    const keptSelect = roleSelect(A_MAIN);

    await user.click(
      within(screen.getByTestId("actions-chart-5")).getByRole("button", {
        name: "Details",
      })
    );

    expect(row(A_MAIN)).toBe(kept);
    expect(roleSelect(A_MAIN)).toBe(keptSelect);
  });

  it("leaves focus on the select that was just used", async () => {
    const user = noDelayUser();
    await openPanel(user);

    await pick(user, roleSelect(A_SIDE), "Supporting File");

    // MUI returns focus to the trigger when the menu closes. The row must
    // still be the same one for that to land anywhere.
    expect(document.activeElement).toBe(roleSelect(A_SIDE));
  });

  it("keeps the chosen Chart target after it is picked", async () => {
    const user = noDelayUser();
    await openPanel(user);
    await pick(user, roleSelect(A_SIDE), "Supporting File");
    // Becoming a supporting file attaches it to the first Chart in the
    // folder, so there is something to move AWAY from.
    expect(targetSelect(A_SIDE)).toHaveTextContent("figure_S1.png");

    await pick(user, targetSelect(A_SIDE), "overview.png");

    expect(targetSelect(A_SIDE)).toHaveTextContent("overview.png");
    expect(document.activeElement).toBe(targetSelect(A_SIDE));
    // ...and the row it belongs to was never rebuilt around it.
    expect(within(row(A_SIDE)).getByLabelText(/^chart for panel_b/i)).toBe(
      targetSelect(A_SIDE)
    );
  });

  // --- what the callbacks are told -----------------------------------------

  it("reports a role change once, for the right image in the right folder",
     async () => {
    const user = noDelayUser();
    await openPanel(user);

    await pick(user, roleSelect(B_SIDE), "Create Chart");

    // The plan the Rebuild would send: folder B's second image is a Chart
    // now, and nothing in folder A moved.
    await user.click(screen.getByRole("button", { name: /rebuild proposals/i }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2));
    const plan = axios.post.mock.calls[1][1].chart_plan;
    expect(plan).toEqual(
      expect.arrayContaining([
        { path: B_SIDE, action: "chart" },
        { path: B_MAIN, action: "chart" },
        { path: A_MAIN, action: "chart" },
        { path: A_ALT, action: "chart" },
        { path: A_SIDE, action: "ignore" },
      ])
    );
    expect(plan).toHaveLength(5);
  });

  it("reports a target change against the image it was chosen for", async () => {
    const user = noDelayUser();
    await openPanel(user);
    await pick(user, roleSelect(B_SIDE), "Supporting File");
    await pick(user, targetSelect(B_SIDE), "figure_S2.png");

    await user.click(screen.getByRole("button", { name: /rebuild proposals/i }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2));
    const plan = axios.post.mock.calls[1][1].chart_plan;
    expect(plan).toContainEqual({
      path: B_SIDE,
      action: "supporting",
      target: B_MAIN,
    });
    // A's untouched suggestion is still what it was.
    expect(plan).toContainEqual({ path: A_SIDE, action: "ignore" });
  });

  // --- and the response that has none of this ------------------------------

  it("renders a response with no chart_image_groups at all", async () => {
    // The ordinary case, and the one this refactor must not have disturbed:
    // most folders produce no such group, and then there is no panel, no
    // row, and nothing for buildFileUrl to be asked.
    axios.post.mockResolvedValue({ data: analysis });
    const user = noDelayUser();
    renderWith();
    await openAnalysis(user);

    expect(screen.queryByTestId("boundary-picker")).toBeNull();
    expect(screen.queryByTestId("chart-plan")).toBeNull();
    expect(screen.queryByLabelText(/^role for /i)).toBeNull();
    // ...and the rest of the dialog is untouched by its absence.
    expect(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", { name: /select figure1\.png/i })
    );
    expect(screen.getByTestId("apply-selected")).toBeEnabled();
    expect(buildFileUrl).not.toHaveBeenCalled();
  });
});

// The analysis used to read every script and notebook in the folder a second
// time, to report the file I/O each one stated. That fed one consumer -- the
// Script workflow detector -- and it is gone, so the pass is gone and so is
// the notice that said which files it could not open. An import is unchanged:
// it never depended on any of it.
describe("the folder analysis says nothing about a code scan", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: analysis });
  });

  it("shows no scan notice, even for a response that still carries one", async () => {
    // A server or a cache from before the change. The field is simply not
    // read; there is nothing to migrate.
    axios.post.mockResolvedValue({
      data: {
        ...analysis,
        code_scan: { skipped: [{ path: "scripts/huge.py",
                                 reason: "size_limit" }] },
        code_links: [{ script: "scripts/plot_vdos.py", path: "data/x.csv",
                       mode: "read", call: "pandas.read_csv",
                       literal: "data/x.csv", line: 3, cell: null }],
        shell_calls: [{ from: "run.sh", to: "scripts/plot_vdos.py", line: 1,
                        command: "python" }],
      },
    });
    const user = noDelayUser();
    renderWith();
    await openAnalysis(user);

    expect(screen.queryByTestId("code-scan-notice")).toBeNull();
    expect(screen.queryByTestId("code-scan-details")).toBeNull();
    expect(screen.queryByTestId("code-scan-unread")).toBeNull();
    expect(document.body.textContent).not.toContain(
      "Some scripts were not analyzed"
    );
  });

  it("still offers every candidate the import is for", async () => {
    const user = noDelayUser();
    renderWith();
    await openAnalysis(user);

    // The four kinds an import creates, from the same fixture as always.
    expect(
      screen.getByRole("tab", { name: /charts \(1\)/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /datasets \(1\)/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /scripts \(1\)/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /tools \(1\)/i })
    ).toBeInTheDocument();
  });
});
