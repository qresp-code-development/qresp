import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
import axios from "axios";

jest.mock("../Utils/Scraper", () => ({ getList: jest.fn() }));
import { getList } from "../Utils/Scraper";
import ServerContext from "../Context/Servers/serverContext";
import SourceTreeContext from "../Context/SourceTree/SourceTreeContext";

import GuidedSetup from "../components/CuratorElements/GuidedSetup";
import AuthContext from "../Context/Auth/authContext";
import CuratorContext from "../Context/Curator/curatorContext";

const blankState = {
  curatorInfo: { firstName: "", middleName: "", lastName: "", emailId: "", affiliation: "" },
  referenceInfo: { doi: "", title: "" },
  paperInfo: { tags: [], collections: [], PIs: "" },
  fileServerPath: "",
  charts: [],
  datasets: [],
  scripts: [],
  tools: [],
  heads: [],
  workflow: { nodes: [], edges: [] },
};

const renderSetup = ({ state = blankState, auth = {}, resetVersion = 0 } = {}) => {
  const curator = {
    ...state,
    resetVersion,
    metadata: state,
    prefillCuratorInfo: jest.fn(),
    collectDraftState: jest.fn(() => state),
    setAll: jest.fn(),
    remountForms: jest.fn(),
    importBundle: jest.fn(),
    cacheRccAnalysis: jest.fn(),
    edit: jest.fn(),
  };
  const tree = (value) => (
    <AuthContext.Provider value={{ loading: false, authenticated: false, user: null, ...auth }}>
      <CuratorContext.Provider value={value}>
        <GuidedSetup />
      </CuratorContext.Provider>
    </AuthContext.Provider>
  );
  const { rerender } = render(tree(curator));
  curator.rerenderWith = (changes) => rerender(tree({ ...curator, ...changes }));
  return curator;
};

describe("GuidedSetup", () => {
  afterEach(() => jest.resetAllMocks());

  it("fills the curator from the signed-in profile", () => {
    const curator = renderSetup({
      auth: {
        authenticated: true,
        user: { name: "Ada Lovelace", email: "ada@example.edu", affiliation: "Analytical Engines" },
      },
    });
    expect(curator.prefillCuratorInfo).toHaveBeenCalledWith({
      firstName: "Ada",
      middleName: "",
      lastName: "Lovelace",
      emailId: "ada@example.edu",
      affiliation: "Analytical Engines",
    });
  });

  it("fills the curator again after Start Fresh clears the form", () => {
    const profile = { name: "Ada Lovelace", email: "ada@example.edu" };
    const filled = { firstName: "Ada", middleName: "", lastName: "Lovelace", emailId: "ada@example.edu", affiliation: "" };
    const curator = renderSetup({
      state: { ...blankState, curatorInfo: filled },
      auth: { authenticated: true, user: profile },
    });
    expect(curator.prefillCuratorInfo).not.toHaveBeenCalled();

    // Start Fresh: the form is blank again and resetVersion moves on.
    curator.rerenderWith({ curatorInfo: blankState.curatorInfo, resetVersion: 1 });
    expect(curator.prefillCuratorInfo).toHaveBeenCalledWith(filled);
  });

  it("never overwrites curator details that are already there", () => {
    const curator = renderSetup({
      state: { ...blankState, curatorInfo: { ...blankState.curatorInfo, firstName: "Kept" } },
      auth: { authenticated: true, user: { name: "Other Person", email: "o@x.org" } },
    });
    expect(curator.prefillCuratorInfo).not.toHaveBeenCalled();
  });

  it("asks anonymous users to sign in and makes no requests", () => {
    renderSetup();
    expect(screen.getAllByRole("link", { name: /sign in/i }).length).toBeGreaterThan(0);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("shows each step's summary once it is done", () => {
    axios.post.mockResolvedValue({ data: { candidates: {}, suggestions: {} } });
    renderSetup({
      state: {
        ...blankState,
        curatorInfo: { firstName: "Ada", middleName: "", lastName: "Lovelace", emailId: "ada@example.edu", affiliation: "" },
        referenceInfo: { doi: "10.1038/x.1", title: "A paper title", authors: "A B", year: 2025 },
        fileServerPath: "https://notebook.rcc.uchicago.edu/files/10.1038.x.1",
      },
      auth: { authenticated: true, user: { name: "Ada Lovelace", email: "ada@example.edu" } },
    });
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("A paper title")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "https://notebook.rcc.uchicago.edu/files/10.1038.x.1" })
    ).toBeInTheDocument();
    // A folder and no artifacts yet: the folder is scanned automatically.
    expect(axios.post).toHaveBeenCalledWith("/api/curation/analyze-folder", {
      path: "https://notebook.rcc.uchicago.edu/files/10.1038.x.1",
    });
  });
});

describe("GuidedSetup project folder", () => {
  afterEach(() => jest.resetAllMocks());

  const withPaper = {
    ...blankState,
    referenceInfo: { doi: "10.1038/x.1", title: "A paper title" },
  };

  it("lets the folder be pasted in and used without leaving the setup", async () => {
    const user = userEvent.setup();
    axios.post.mockResolvedValue({ data: { found: false, tried: [] } });
    const curator = renderSetup({
      state: withPaper,
      auth: { authenticated: true, user: { name: "Ada Lovelace", email: "ada@example.edu" } },
    });
    const field = await screen.findByLabelText(/folder address/i);
    await user.type(field, "https://notebook.rcc.uchicago.edu/files/my.folder/");
    await user.click(screen.getByRole("button", { name: /use this folder/i }));
    expect(curator.setAll).toHaveBeenCalledWith(
      expect.objectContaining({ fileServerPath: "https://notebook.rcc.uchicago.edu/files/my.folder" })
    );
    expect(curator.remountForms).toHaveBeenCalled();
  });

  it("refuses an address that is not a web address", async () => {
    const user = userEvent.setup();
    const curator = renderSetup({ state: withPaper });
    await user.type(screen.getByLabelText(/folder address/i), "my folder");
    await user.click(screen.getByRole("button", { name: /use this folder/i }));
    expect(screen.getByText(/starting with https/i)).toBeInTheDocument();
    expect(curator.setAll).not.toHaveBeenCalled();
  });

  it("opens the change editor in place instead of scrolling away", async () => {
    const user = userEvent.setup();
    renderSetup({
      state: { ...withPaper, fileServerPath: "https://notebook.rcc.uchicago.edu/files/a" },
    });
    await user.click(screen.getByRole("button", { name: /^change$/i }));
    expect(screen.getByLabelText(/folder address/i)).toHaveValue(
      "https://notebook.rcc.uchicago.edu/files/a"
    );
    expect(screen.getByRole("button", { name: /browse/i })).toBeInTheDocument();
  });
});

describe("GuidedSetup file server", () => {
  afterEach(() => jest.resetAllMocks());

  const RCC = "https://notebook.rcc.uchicago.edu/files";

  it("browses the chosen file server and uses the picked folder", async () => {
    const user = userEvent.setup();
    getList.mockResolvedValue({ details: { root: RCC }, files: [{ id: "x" }] });
    const tree = {
      setTree: jest.fn(),
      openSelector: jest.fn(),
      setSaveMethod: jest.fn(),
      setConfirmLabel: jest.fn(),
      setMultiple: jest.fn(),
    };
    const curator = {
      ...blankState,
      metadata: blankState,
      resetVersion: 0,
      prefillCuratorInfo: jest.fn(),
      collectDraftState: jest.fn(() => blankState),
      setAll: jest.fn(),
      remountForms: jest.fn(),
      importBundle: jest.fn(),
      cacheRccAnalysis: jest.fn(),
      edit: jest.fn(),
    };
    render(
      <AuthContext.Provider value={{ loading: false, authenticated: false, user: null }}>
        <ServerContext.Provider
          value={{ httpServers: [{ value: RCC, label: "RCC (" + RCC + ")" }], setSelectedHttp: jest.fn() }}
        >
          <SourceTreeContext.Provider value={tree}>
            <CuratorContext.Provider value={curator}>
              <GuidedSetup />
            </CuratorContext.Provider>
          </SourceTreeContext.Provider>
        </ServerContext.Provider>
      </AuthContext.Provider>
    );

    // RCC is the default server.
    expect(screen.getByLabelText(/file server/i)).toHaveValue("RCC (" + RCC + ")");
    await user.click(screen.getByRole("button", { name: /browse/i }));
    expect(getList).toHaveBeenCalledWith(RCC, "http", true, null);
    expect(tree.openSelector).toHaveBeenCalled();

    // The picker hands back a folder; it is applied straight away.
    const save = tree.setSaveMethod.mock.calls[0][0];
    save(RCC + "/10.1038.x.1");
    expect(curator.setAll).toHaveBeenCalledWith(
      expect.objectContaining({ fileServerPath: RCC + "/10.1038.x.1" })
    );
  });

  it("has no Find-from-DOI button", () => {
    renderSetup({ state: { ...blankState, referenceInfo: { doi: "10.1/x", title: "T" } } });
    expect(screen.queryByRole("button", { name: /find it from the doi/i })).toBeNull();
  });
});

describe("GuidedSetup captions from LaTeX", () => {
  afterEach(() => jest.resetAllMocks());

  const withFigures = {
    ...blankState,
    curatorInfo: { firstName: "Ada", middleName: "", lastName: "Lovelace", emailId: "ada@example.edu", affiliation: "" },
    referenceInfo: { doi: "10.1038/x.1", title: "An NV- center in MgO" },
    fileServerPath: "https://notebook.rcc.uchicago.edu/files/10.1038.x.1",
    charts: [
      { id: "c0", imageFile: "/Figures_Tables/Figure1.pdf", number: "1", caption: "", properties: ["DFT"] },
      { id: "c1", imageFile: "/Figures_Tables/Figure2.pdf", number: "", caption: "", properties: ["DFT"] },
    ],
  };

  it("finds the arXiv id, reads the captions and applies them to the figures", async () => {
    const user = userEvent.setup();
    axios.post.mockImplementation((url, body) => {
      if (url === "/api/curation/find-arxiv") {
        return Promise.resolve({ data: { found: true, arxiv: "2409.00246" } });
      }
      if (url === "/api/curation/latex-captions") {
        return Promise.resolve({
          data: {
            source: "arXiv:2409.00246",
            figures: [{}, {}],
            matches: [
              { id: "c0", caption: "Screening of spin defects.", number: "1", how: "file" },
              { id: "c1", caption: "Ground state properties.", number: "2", how: "file" },
            ],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
    const curator = renderSetup({
      state: withFigures,
      auth: { authenticated: true, user: { name: "Ada Lovelace", email: "ada@example.edu" } },
    });

    const field = await screen.findByLabelText(/arxiv id or link/i);
    await screen.findByDisplayValue("2409.00246");
    expect(field).toHaveValue("2409.00246");

    await user.click(screen.getByRole("button", { name: /get captions/i }));
    expect(axios.post).toHaveBeenCalledWith("/api/curation/latex-captions", {
      arxiv: "2409.00246",
      charts: [
        { id: "c0", imageFile: "/Figures_Tables/Figure1.pdf", number: "1" },
        { id: "c1", imageFile: "/Figures_Tables/Figure2.pdf", number: "" },
      ],
    });

    await user.click(await screen.findByRole("button", { name: /apply 2 captions/i }));
    expect(curator.edit).toHaveBeenCalledWith(
      "chart",
      expect.objectContaining({ id: "c0", caption: "Screening of spin defects.", number: "1" })
    );
    // A missing figure number is filled from LaTeX too.
    expect(curator.edit).toHaveBeenCalledWith(
      "chart",
      expect.objectContaining({ id: "c1", caption: "Ground state properties.", number: "2" })
    );
  });

  it("explains how to get an Overleaf project's source", async () => {
    const user = userEvent.setup();
    axios.post.mockResolvedValue({ data: { found: false } });
    renderSetup({
      state: withFigures,
      auth: { authenticated: true, user: { name: "Ada Lovelace", email: "ada@example.edu" } },
    });
    await user.click(screen.getByRole("button", { name: /overleaf/i }));
    expect(screen.getByText(/download → source/i)).toBeInTheDocument();
    expect(screen.getByText(/upload the overleaf \.zip/i)).toBeInTheDocument();
  });
});

describe("GuidedSetup AI assistant", () => {
  afterEach(() => jest.resetAllMocks());

  const state = {
    ...blankState,
    curatorInfo: { firstName: "Ada", middleName: "", lastName: "Lovelace", emailId: "ada@example.edu", affiliation: "" },
    referenceInfo: { doi: "10.1038/x.1", title: "An NV- center in MgO", abstract: "We identify a defect." },
    paperInfo: { tags: ["DFT"], collections: [], PIs: "" },
    fileServerPath: "https://notebook.rcc.uchicago.edu/files/10.1038.x.1",
    charts: [
      { id: "c0", imageFile: "/F/Figure1.pdf", number: "1", caption: "Screening of spin defects.", properties: ["DFT"] },
      { id: "c1", imageFile: "/F/Figure2.pdf", number: "2", caption: "Defect levels.", properties: ["hand written"] },
    ],
    scripts: [{ id: "s0", files: ["/Scripts/plot.py"], readme: "" }],
    datasets: [],
  };
  const auth = { authenticated: true, user: { name: "Ada Lovelace", email: "ada@example.edu" } };

  it("does nothing until the curator consents", () => {
    axios.post.mockResolvedValue({ data: { found: false } });
    renderSetup({ state, auth });
    expect(screen.getByRole("button", { name: /^suggest keywords$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^suggest missing links$/i })).toBeDisabled();
  });

  it("suggests and applies keywords, keeping hand-written ones unless chosen", async () => {
    const user = userEvent.setup();
    axios.post.mockImplementation((url) =>
      Promise.resolve({
        data:
          url === "/api/curation/suggest-figure-keywords"
            ? {
                figures: [
                  { id: "c0", keywords: ["spin defects", "screening"] },
                  { id: "c1", keywords: ["defect levels"] },
                ],
                paper_keywords: ["spin qubit"],
              }
            : { found: false },
      })
    );
    const curator = renderSetup({ state, auth });
    await user.click(screen.getByRole("checkbox", { name: /send the paper's title/i }));
    await user.click(screen.getByRole("button", { name: /^suggest keywords$/i }));
    expect(axios.post).toHaveBeenCalledWith(
      "/api/curation/suggest-figure-keywords",
      expect.objectContaining({ consent: true })
    );
    await user.click(await screen.findByRole("button", { name: /apply selected keywords/i }));
    // One change: c0 had only the paper-tag default, so it is replaced;
    // c1's own keywords stay.
    const written = curator.setAll.mock.calls[curator.setAll.mock.calls.length - 1][0];
    expect(written.charts.find((c) => c.id === "c0").properties).toEqual(["spin defects", "screening"]);
    expect(written.charts.find((c) => c.id === "c1").properties).toEqual(["hand written"]);
  });

  it("suggests links with reasons and adds the chosen ones", async () => {
    const user = userEvent.setup();
    axios.post.mockImplementation((url) =>
      Promise.resolve({
        data:
          url === "/api/curation/suggest-links"
            ? {
                links: [
                  { from: "s0", to: "c0", type: "generates", confidence: "high", reason: "Plots the screening." },
                  { from: "s0", to: "c1", type: "generates", confidence: "low", reason: "Maybe." },
                ],
              }
            : { found: false },
      })
    );
    const curator = renderSetup({ state, auth });
    await user.click(screen.getByRole("checkbox", { name: /send the paper's title/i }));
    await user.click(screen.getByRole("button", { name: /^suggest missing links$/i }));
    expect(await screen.findByText("Plots the screening.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /add selected links/i }));
    // Low-confidence suggestions start unticked.
    expect(curator.importBundle).toHaveBeenCalledWith([], [{ from: "s0", to: "c0", type: "generates" }]);
  });

  it("says when AI is not set up on the server", async () => {
    const user = userEvent.setup();
    axios.post.mockImplementation((url) =>
      url === "/api/curation/suggest-figure-keywords"
        ? Promise.reject({ response: { status: 503, data: { error: "AI suggestions are not configured on this server." } } })
        : Promise.resolve({ data: { found: false } })
    );
    renderSetup({ state, auth });
    await user.click(screen.getByRole("checkbox", { name: /send the paper's title/i }));
    await user.click(screen.getByRole("button", { name: /^suggest keywords$/i }));
    expect(await screen.findByText(/QRESP_GEMINI_ENABLED/)).toBeInTheDocument();
  });

  it("shows the provider's own reason when Gemini is busy or rate limited", async () => {
    const user = userEvent.setup();
    axios.post.mockImplementation((url) =>
      url === "/api/curation/suggest-figure-keywords"
        ? Promise.reject({ response: { status: 429, data: { error: "You have reached the AI usage limit." } } })
        : Promise.resolve({ data: { found: false } })
    );
    renderSetup({ state, auth });
    await user.click(screen.getByRole("checkbox", { name: /send the paper's title/i }));
    await user.click(screen.getByRole("button", { name: /^suggest keywords$/i }));
    expect(await screen.findByText("You have reached the AI usage limit.")).toBeInTheDocument();
  });
});

describe("GuidedSetup finish step", () => {
  afterEach(() => jest.resetAllMocks());

  const done = {
    ...blankState,
    curatorInfo: { firstName: "Ada", middleName: "", lastName: "Lovelace", emailId: "ada@example.edu", affiliation: "" },
    referenceInfo: { doi: "10.1/x", title: "T", authors: "Vrindaa  Somjit, Giulia  Galli" },
    fileServerPath: "https://notebook.rcc.uchicago.edu/files/x",
    charts: [{ id: "c0", imageFile: "a.png", number: "1", caption: "C", properties: ["k"] }],
    paperInfo: { PIs: "", collections: [], tags: [] },
  };

  it("offers the last author as P.I. and lets optional details be skipped", async () => {
    const user = userEvent.setup();
    axios.post.mockResolvedValue({ data: { found: false } });
    const curator = renderSetup({ state: done });
    await user.click(screen.getByRole("button", { name: "Use last author: Giulia Galli" }));
    expect(curator.setAll).toHaveBeenCalledWith(
      expect.objectContaining({ paperInfo: expect.objectContaining({ PIs: "Giulia Galli" }) })
    );
    expect(screen.getByText(/all of this is optional/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /skip, leave blank/i }));
    expect(screen.queryByText(/all of this is optional/i)).not.toBeInTheDocument();
  });
});

describe("GuidedSetup AI folder curation", () => {
  afterEach(() => jest.resetAllMocks());

  const state = {
    ...blankState,
    curatorInfo: { firstName: "Ada", middleName: "", lastName: "Lovelace", emailId: "ada@example.edu", affiliation: "" },
    referenceInfo: { doi: "10.1/x", title: "T", abstract: "A" },
    paperInfo: { tags: [], collections: [], PIs: "" },
    fileServerPath: "https://notebook.rcc.uchicago.edu/files/x",
    charts: [{ id: "c0", imageFile: "Figures/Figure1.pdf", number: "1", caption: "C", properties: ["k"] }],
  };
  const auth = { authenticated: true, user: { name: "Ada Lovelace", email: "ada@example.edu" } };

  it("proposes what Qresp missed and adds the chosen items with their links", async () => {
    const user = userEvent.setup();
    axios.post.mockImplementation((url) =>
      Promise.resolve({
        data:
          url === "/api/curation/ai-curate"
            ? {
                proposal: {
                  charts: [{ key: "n1", imageFile: "plots/fig_energy.png", number: "2", keywords: ["energy"], reason: "A results figure." }],
                  datasets: [{ key: "n2", files: ["raw"], description: "Raw runs.", reason: "Read by the script." }],
                  scripts: [{ key: "n3", files: ["code/plot.py"], description: "Plots it.", reason: "Saves fig_energy.png." }],
                  tools: [],
                },
                links: [
                  { from: "n3", to: "n1", type: "generates", confidence: "high", reason: "Saves it." },
                  { from: "n3", to: "c0", type: "generates", confidence: "medium", reason: "Plots figure 1 too." },
                ],
                models: ["gemini-3.8-flash"],
              }
            : { found: false },
      })
    );
    const curator = renderSetup({ state, auth });
    await user.click(screen.getByRole("checkbox", { name: /send the paper's title/i }));
    await user.click(screen.getByRole("button", { name: /^curate the whole folder with ai$/i }));
    expect(axios.post).toHaveBeenCalledWith(
      "/api/curation/ai-curate",
      expect.objectContaining({
        consent: true,
        path: "https://notebook.rcc.uchicago.edu/files/x",
        existing: expect.objectContaining({ charts: [expect.objectContaining({ id: "c0" })] }),
      })
    );
    expect(await screen.findByText("A results figure.")).toBeInTheDocument();
    expect(screen.getByText("Suggested by gemini-3.8-flash")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /add selected/i }));
    const [records, links] = curator.importBundle.mock.calls[0];
    expect(records.map((r) => [r.key, r.list])).toEqual([["n1", "charts"], ["n2", "datasets"], ["n3", "scripts"]]);
    expect(records[0].value).toEqual(expect.objectContaining({ imageFile: "plots/fig_energy.png", number: "2", properties: ["energy"] }));
    expect(records[2].value).toEqual(expect.objectContaining({ files: ["code/plot.py"], readme: "Plots it." }));
    expect(links).toEqual([
      { from: "n3", to: "n1", type: "generates" },
      { from: "n3", to: "c0", type: "generates" },
    ]);
  });
});


describe("GuidedSetup keyword apply keeps every change", () => {
  afterEach(() => jest.resetAllMocks());

  it("writes figure keywords and paper keywords together, in one change", async () => {
    const user = userEvent.setup();
    const state = {
      ...blankState,
      curatorInfo: { firstName: "Ada", middleName: "", lastName: "Lovelace", emailId: "ada@example.edu", affiliation: "" },
      referenceInfo: { doi: "10.1/x", title: "T", abstract: "A" },
      paperInfo: { tags: [], collections: [], PIs: "" },
      fileServerPath: "https://notebook.rcc.uchicago.edu/files/x",
      charts: [
        { id: "c0", imageFile: "a.pdf", number: "1", caption: "Cap 1", properties: [] },
        { id: "c1", imageFile: "b.pdf", number: "2", caption: "Cap 2", properties: [] },
      ],
    };
    axios.post.mockImplementation((url) =>
      Promise.resolve({
        data:
          url === "/api/curation/suggest-figure-keywords"
            ? {
                figures: [
                  { id: "c0", keywords: ["screening"] },
                  { id: "c1", keywords: ["defect levels"] },
                ],
                paper_keywords: ["spin qubit"],
                models: ["gemini-3.8-flash"],
              }
            : { found: false },
      })
    );
    const curator = renderSetup({
      state,
      auth: { authenticated: true, user: { name: "Ada Lovelace", email: "ada@example.edu" } },
    });
    await user.click(screen.getByRole("checkbox", { name: /send the paper's title/i }));
    await user.click(screen.getByRole("button", { name: /^suggest keywords$/i }));
    await user.click(await screen.findByRole("button", { name: /apply selected keywords/i }));

    // Nothing is written piecemeal that a later snapshot could undo.
    expect(curator.edit).not.toHaveBeenCalled();
    expect(curator.setAll).toHaveBeenCalledTimes(1);
    const written = curator.setAll.mock.calls[0][0];
    expect(written.charts.map((c) => c.properties)).toEqual([["screening"], ["defect levels"]]);
    expect(written.paperInfo.tags).toEqual(["spin qubit"]);
  });
});


describe("GuidedSetup ready-to-publish", () => {
  afterEach(() => jest.resetAllMocks());

  it("hides optional fields once skipped and offers preview and save draft", async () => {
    const user = userEvent.setup();
    axios.post.mockResolvedValue({ data: { found: false } });
    const state = {
      ...blankState,
      curatorInfo: { firstName: "Ada", middleName: "", lastName: "Lovelace", emailId: "ada@example.edu", affiliation: "" },
      referenceInfo: { doi: "10.1/x", title: "A paper", abstract: "A", authors: "A B" },
      fileServerPath: "https://notebook.rcc.uchicago.edu/files/x",
      paperInfo: { PIs: "A B", collections: [], tags: [] },
      charts: [{ id: "c0", imageFile: "a.png", number: "", caption: "", properties: [] }],
      datasets: [{ id: "d0", files: ["Data/x"], readme: "Raw data." }],
    };
    const saveDraftToServer = jest.fn(() => Promise.resolve("draft1"));
    const curator = renderSetup({
      state: { ...state },
      auth: { authenticated: true, user: { name: "Ada Lovelace", email: "ada@example.edu" } },
    });
    curator.rerenderWith({ saveDraftToServer, getDraftTitle: () => "A paper" });

    // Optional figure fields are offered until skipped...
    expect(screen.getByLabelText("Figure Caption")).toBeInTheDocument();
    expect(screen.queryByTestId("record-ready")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /skip, leave blank/i }));
    // ...then hidden, and the record is ready.
    expect(screen.queryByLabelText("Figure Caption")).not.toBeInTheDocument();
    const ready = screen.getByTestId("record-ready");
    expect(ready).toHaveTextContent(/your curated record is ready/i);
    expect(screen.getByRole("button", { name: /^save & preview$/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^save draft$/i }));
    expect(saveDraftToServer).toHaveBeenCalledWith("A paper");
    expect(await screen.findByText(/saved to your account drafts/i)).toBeInTheDocument();
  });

  it("offers descriptions as optional, so skipping them leaves the record ready", async () => {
    const user = userEvent.setup();
    axios.post.mockResolvedValue({ data: { found: false } });
    renderSetup({
      state: {
        ...blankState,
        curatorInfo: { firstName: "Ada", middleName: "", lastName: "Lovelace", emailId: "ada@example.edu", affiliation: "" },
        referenceInfo: { title: "T", abstract: "A" },
        fileServerPath: "https://x/files/y",
        paperInfo: { PIs: "A B", collections: ["c"], tags: ["t"] },
        charts: [{ id: "c0", imageFile: "a.png", number: "1", caption: "Cap", properties: ["k"] }],
        scripts: [{ id: "s0", files: ["plot.py"], readme: "" }],
      },
    });
    expect(screen.queryByText(/required to publish/i)).not.toBeInTheDocument();
    expect(screen.getByText(/1 dataset or script has no description/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /skip, leave blank/i }));
    expect(screen.queryByLabelText("Description")).not.toBeInTheDocument();
    expect(screen.getByTestId("record-ready")).toBeInTheDocument();
  });

  it("requires nothing: a resource with no files is only a suggestion", async () => {
    const user = userEvent.setup();
    axios.post.mockResolvedValue({ data: { found: false } });
    renderSetup({
      state: {
        ...blankState,
        referenceInfo: { title: "T", abstract: "A" },
        fileServerPath: "https://x/files/y",
        paperInfo: { PIs: "A B", collections: [], tags: [] },
        datasets: [{ id: "d0", files: [], readme: "Raw data." }],
      },
    });
    expect(screen.queryByText(/required to publish/i)).not.toBeInTheDocument();
    expect(screen.getByText(/all of this is optional/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /skip, leave blank/i }));
    expect(screen.getByTestId("record-ready")).toBeInTheDocument();
  });

  it("is ready to publish with nothing filled in at all", async () => {
    const user = userEvent.setup();
    axios.post.mockResolvedValue({ data: { found: false } });
    renderSetup({ state: blankState });
    expect(screen.queryByText(/is required/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /skip, leave blank/i }));
    expect(screen.getByTestId("record-ready")).toBeInTheDocument();
  });

  it("saves a typed description with its Save button, once", async () => {
    const user = userEvent.setup();
    axios.post.mockResolvedValue({ data: { found: false } });
    const curator = renderSetup({
      state: {
        ...blankState,
        referenceInfo: { title: "T", abstract: "A" },
        fileServerPath: "https://x/files/y",
        paperInfo: { PIs: "A B", collections: [], tags: [] },
        scripts: [{ id: "s0", files: ["plot.py"], readme: "" }],
      },
    });
    const save = screen.getByRole("button", { name: "Save Description" });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText("Description"), "Plots figure 2.");
    expect(save).toBeEnabled();
    await user.click(save);
    expect(curator.edit).toHaveBeenCalledTimes(1);
    expect(curator.edit).toHaveBeenCalledWith(
      "script",
      expect.objectContaining({ id: "s0", readme: "Plots figure 2." })
    );
  });
});


describe("GuidedSetup AI backups and gap filling", () => {
  afterEach(() => jest.resetAllMocks());

  const ada = { firstName: "Ada", middleName: "", lastName: "Lovelace", emailId: "ada@example.edu", affiliation: "" };
  const auth = { authenticated: true, user: { name: "Ada Lovelace", email: "ada@example.edu" } };
  const folder = "https://notebook.rcc.uchicago.edu/files/x";

  it("offers an AI search when the folder scan finds no figures or scripts, after consent", async () => {
    const user = userEvent.setup();
    axios.post.mockImplementation((url) => {
      if (url === "/api/curation/analyze-folder") return Promise.resolve({ data: { candidates: {}, suggestions: {} } });
      if (url === "/api/curation/ai-curate") {
        return Promise.resolve({
          data: {
            proposal: {
              charts: [{ key: "n1", imageFile: "plots/bands.png", number: "", keywords: [], reason: "A results figure." }],
              datasets: [],
              scripts: [{ key: "n2", files: ["code/plot_bands.py"], description: "Plots the bands.", reason: "Saves bands.png." }],
              tools: [],
            },
            links: [{ from: "n2", to: "n1", type: "generates", confidence: "high", reason: "savefig('bands.png')" }],
            edits: [],
            notes: [],
            models: ["gemini-test"],
          },
        });
      }
      return Promise.resolve({ data: { found: false } });
    });
    const curator = renderSetup({
      state: { ...blankState, curatorInfo: ada, referenceInfo: { doi: "10.1/x", title: "T" }, fileServerPath: folder },
      auth,
    });
    const find = await screen.findByRole("button", { name: /^find figures, datasets and scripts with ai$/i });
    expect(screen.getByText(/the folder scan found no figures, datasets and scripts/i)).toBeInTheDocument();

    // Consent is asked for before anything is sent.
    await user.click(find);
    expect(axios.post).not.toHaveBeenCalledWith("/api/curation/ai-curate", expect.anything());
    await user.click(screen.getByRole("button", { name: /send and continue/i }));
    expect(axios.post).toHaveBeenCalledWith(
      "/api/curation/ai-curate",
      expect.objectContaining({ consent: true, path: folder, focus: ["charts", "datasets", "scripts"] })
    );
    expect(await screen.findByText("A results figure.")).toBeInTheDocument();
    // The consent dialog closes before the page is usable again.
    await user.click(await screen.findByRole("button", { name: /^add selected$/i }));
    const [records, links] = curator.importBundle.mock.calls[0];
    expect(records.map((r) => r.list)).toEqual(["charts", "scripts"]);
    expect(links).toEqual([{ from: "n2", to: "n1", type: "generates" }]);
    expect(await screen.findByText(/added 2 items and 1 link/i)).toBeInTheDocument();
  });

  it("explains each AI button in a popover", async () => {
    const user = userEvent.setup();
    axios.post.mockResolvedValue({ data: { found: false } });
    renderSetup({
      state: {
        ...blankState, curatorInfo: ada, referenceInfo: { doi: "10.1/x", title: "T" }, fileServerPath: folder,
        charts: [{ id: "c0", imageFile: "a.png", number: "1", caption: "C", properties: ["k"] }],
        datasets: [{ id: "d0", files: ["raw"], readme: "" }],
      },
      auth,
    });
    await user.click(screen.getByRole("button", { name: "About Suggest descriptions" }));
    expect(await screen.findByText(/one- or two-sentence description for each dataset and script/i)).toBeInTheDocument();
    expect(screen.getByText("What is sent")).toBeInTheDocument();
    for (const name of ["Suggest keywords", "Suggest missing links", "Curate the whole folder with AI", "Find with AI"]) {
      // The open popover hides the rest of the page from the a11y tree.
      expect(screen.getByRole("button", { name: `About ${name}`, hidden: true })).toBeInTheDocument();
    }
  });

  it("matches captions with AI when the LaTeX file names differ", async () => {
    const user = userEvent.setup();
    const figures = [
      { kind: "figure", number: "1", graphics: ["fig1.pdf"], caption: "Band structure.", label: "fig:bands" },
    ];
    axios.post.mockImplementation((url) => {
      if (url === "/api/curation/latex-captions") {
        return Promise.resolve({ data: { source: "main.tex", figures, matches: [] } });
      }
      if (url === "/api/curation/match-captions") {
        return Promise.resolve({
          data: {
            matches: [{ id: "c0", caption: "Band structure.", number: "1", how: "ai", confidence: "medium", reason: "Both show bands." }],
            models: ["gemini-test"],
          },
        });
      }
      return Promise.resolve({ data: { found: false } });
    });
    const curator = renderSetup({
      state: {
        ...blankState, curatorInfo: ada, referenceInfo: { doi: "10.1/x", title: "T" }, fileServerPath: folder,
        charts: [{ id: "c0", imageFile: "plots/bands.png", number: "", caption: "", properties: ["k"] }],
      },
      auth,
    });
    await user.type(screen.getByLabelText(/arxiv id or link/i), "2409.00246");
    await user.click(screen.getByRole("button", { name: /get captions/i }));
    expect(await screen.findByText(/none of them could be matched/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^match 1 remaining figure with ai$/i }));
    await user.click(screen.getByRole("button", { name: /send and continue/i }));
    expect(axios.post).toHaveBeenCalledWith("/api/curation/match-captions", {
      consent: true,
      figures,
      charts: [{ id: "c0", imageFile: "plots/bands.png", number: "" }],
    });
    expect(await screen.findByText("Both show bands.")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /apply 1 caption/i }));
    expect(curator.edit).toHaveBeenCalledWith(
      "chart",
      expect.objectContaining({ id: "c0", caption: "Band structure.", number: "1" })
    );
  });

  it("suggests descriptions for datasets and scripts and applies them in one change", async () => {
    const user = userEvent.setup();
    axios.post.mockImplementation((url) =>
      Promise.resolve({
        data:
          url === "/api/curation/suggest-descriptions"
            ? {
                descriptions: [
                  { id: "d0", description: "Raw outputs of the runs.", confidence: "high" },
                  { id: "s0", description: "Plots Figure 1.", confidence: "medium" },
                ],
                models: ["gemini-test"],
              }
            : { found: false },
      })
    );
    const state = {
      ...blankState, curatorInfo: ada, referenceInfo: { doi: "10.1/x", title: "T" }, fileServerPath: folder,
      charts: [{ id: "c0", imageFile: "a.png", number: "1", caption: "C", properties: ["k"] }],
      datasets: [{ id: "d0", files: ["raw"], readme: "" }],
      scripts: [{ id: "s0", files: ["plot.py"], readme: "Written by hand." }],
    };
    const curator = renderSetup({ state, auth });
    await user.click(screen.getByRole("checkbox", { name: /send the paper's title/i }));
    await user.click(screen.getByRole("button", { name: /^suggest descriptions$/i }));
    expect(axios.post).toHaveBeenCalledWith(
      "/api/curation/suggest-descriptions",
      expect.objectContaining({
        consent: true,
        path: folder,
        datasets: [{ id: "d0", files: ["raw"], readme: "" }],
        scripts: [{ id: "s0", files: ["plot.py"], readme: "Written by hand." }],
      })
    );
    expect(await screen.findByText("Replaces: Written by hand.")).toBeInTheDocument();
    // A hand-written description is kept unless chosen.
    expect(screen.getByRole("checkbox", { name: /description for plot\.py/i })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: /apply selected descriptions/i }));
    const written = curator.setAll.mock.calls[0][0];
    expect(written.datasets[0].readme).toBe("Raw outputs of the runs.");
    expect(written.scripts[0].readme).toBe("Written by hand.");
  });

  it("reviews the whole record and applies the chosen improvements", async () => {
    const user = userEvent.setup();
    axios.post.mockImplementation((url) =>
      Promise.resolve({
        data:
          url === "/api/curation/ai-curate"
            ? {
                proposal: { charts: [], datasets: [], scripts: [], tools: [] },
                links: [],
                edits: [
                  { id: "c0", field: "number", value: "1", current: "", reason: "Named Figure1." },
                  { id: "d0", field: "readme", value: "Raw outputs.", current: "raw", reason: "Only the name." },
                ],
                notes: ["Figure 3 has no image in the record."],
                models: ["gemini-test"],
              }
            : { found: false },
      })
    );
    const state = {
      ...blankState, curatorInfo: ada, referenceInfo: { doi: "10.1/x", title: "T" }, fileServerPath: folder,
      charts: [{ id: "c0", imageFile: "Figures/Figure1.png", number: "", caption: "C", properties: ["k"] }],
      datasets: [{ id: "d0", files: ["raw"], readme: "raw" }],
    };
    const curator = renderSetup({ state, auth });
    await user.click(screen.getByRole("checkbox", { name: /send the paper's title/i }));
    await user.click(screen.getByRole("button", { name: /^curate the whole folder with ai$/i }));
    expect(axios.post).toHaveBeenCalledWith(
      "/api/curation/ai-curate",
      expect.objectContaining({
        review: true,
        existing: expect.objectContaining({ datasets: [expect.objectContaining({ id: "d0", readme: "raw" })] }),
      })
    );
    expect(await screen.findByText("Figure 3 has no image in the record.")).toBeInTheDocument();
    expect(screen.getByText("Replaces: raw")).toBeInTheDocument();
    // Filling an empty field starts ticked; replacing a value does not.
    expect(screen.getByRole("checkbox", { name: /figure number for figure1\.png/i })).toBeChecked();
    const replace = screen.getByRole("checkbox", { name: /description for raw/i });
    expect(replace).not.toBeChecked();
    await user.click(replace);
    await user.click(screen.getByRole("button", { name: /^add selected$/i }));
    const written = curator.setAll.mock.calls[0][0];
    expect(written.charts[0].number).toBe("1");
    expect(written.datasets[0].readme).toBe("Raw outputs.");
    expect(curator.importBundle).not.toHaveBeenCalled();
    expect(await screen.findByText(/updated 2 fields/i)).toBeInTheDocument();
  });
});


describe("GuidedSetup paper lookup", () => {
  afterEach(() => jest.resetAllMocks());

  it("looks a paper up from its arXiv link, fills the P.I. and counts it as saved", async () => {
    const { guidedChangesAccepted, resetGuidedChanges } = require("../Utils/savedSection");
    resetGuidedChanges();
    const user = userEvent.setup();
    axios.get.mockResolvedValue({
      data: {
        type: "article",
        title: "An NV- center in magnesium oxide",
        DOI: "10.48550/ARXIV.2409.00246",
        publisher: "arXiv",
        URL: "https://arxiv.org/abs/2409.00246",
        issued: { "date-parts": [[2024]] },
        abstract: "Recent predictions suggest...",
        author: [
          { given: "Vrindaa", family: "Somjit" },
          { given: "Giulia", family: "Galli" },
        ],
      },
    });
    axios.post.mockResolvedValue({ data: { found: false } });
    const curator = renderSetup({
      auth: { authenticated: true, user: { name: "Ada Lovelace", email: "ada@example.edu" } },
    });
    await user.type(screen.getByLabelText(/paper doi or arxiv link/i), "https://arxiv.org/abs/2409.00246v2");
    await user.click(screen.getByRole("button", { name: /look up/i }));

    await screen.findByRole("button", { name: /look up/i });
    expect(axios.get.mock.calls[0][0]).toBe("https://dx.doi.org/10.48550/arXiv.2409.00246");
    const written = curator.setAll.mock.calls[0][0];
    expect(written.referenceInfo).toEqual(
      expect.objectContaining({ title: "An NV- center in magnesium oxide", kind: "preprint", doi: "10.48550/arXiv.2409.00246" })
    );
    expect(written.paperInfo.PIs).toBe("Giulia Galli");
    expect(guidedChangesAccepted()).toBe(true);
    expect(axios.post).toHaveBeenCalledWith("/api/curation/locate-folder", { doi: "10.48550/arXiv.2409.00246" });
  });
});


describe("GuidedSetup when a step cannot be finished", () => {
  afterEach(() => jest.resetAllMocks());

  const ada = { firstName: "Ada", middleName: "", lastName: "Lovelace", emailId: "ada@example.edu", affiliation: "" };
  const auth = { authenticated: true, user: { name: "Ada Lovelace", email: "ada@example.edu" } };
  const folder = "https://notebook.rcc.uchicago.edu/files/x";

  it("lets missing captions be skipped for now and goes to the AI assistant", async () => {
    const user = userEvent.setup();
    const scroll = jest.fn();
    Element.prototype.scrollIntoView = scroll;
    axios.post.mockResolvedValue({ data: { found: false } });
    renderSetup({
      state: {
        ...blankState, curatorInfo: ada, referenceInfo: { doi: "10.1/x", title: "T" }, fileServerPath: folder,
        charts: [{ id: "c0", imageFile: "plots/bands.png", number: "1", caption: "", properties: ["k"] }],
      },
      auth,
    });
    expect(screen.getByText(/1 figure has no caption yet/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /skip for now — go to the ai assistant/i }));
    expect(scroll).toHaveBeenCalled();
    expect(screen.getByText(/skipped for now — you can come back to it/i)).toBeInTheDocument();
  });

  it("offers the AI assistant with only a folder, when the scan failed", async () => {
    axios.post.mockImplementation((url) =>
      url === "/api/curation/analyze-folder"
        ? Promise.reject({ response: { data: { error: "The folder could not be read." } } })
        : Promise.resolve({ data: { found: false } })
    );
    renderSetup({
      state: { ...blankState, curatorInfo: ada, referenceInfo: { doi: "10.1/x", title: "T" }, fileServerPath: folder },
      auth,
    });
    expect(await screen.findByText("The folder could not be read.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /skip for now — go to the ai assistant/i })).toBeInTheDocument();
    // The AI can still look, both in this step and in the AI assistant.
    expect(screen.getByRole("button", { name: /^find figures, datasets and scripts with ai$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^curate the whole folder with ai$/i })).toBeInTheDocument();
  });

  it("drafts a description for a figure with no caption, written where its caption goes", async () => {
    const user = userEvent.setup();
    axios.post.mockImplementation((url) =>
      Promise.resolve({
        data:
          url === "/api/curation/suggest-descriptions"
            ? { descriptions: [{ id: "c0", description: "Band structure of the defect.", confidence: "medium" }], models: [] }
            : { found: false },
      })
    );
    const curator = renderSetup({
      state: {
        ...blankState, curatorInfo: ada, referenceInfo: { doi: "10.1/x", title: "T" }, fileServerPath: folder,
        charts: [{ id: "c0", imageFile: "plots/bands.png", number: "1", caption: "", properties: ["k"] }],
      },
      auth,
    });
    await user.click(screen.getByRole("checkbox", { name: /send the paper's title/i }));
    await user.click(screen.getByRole("button", { name: /^suggest descriptions$/i }));
    expect(axios.post).toHaveBeenCalledWith(
      "/api/curation/suggest-descriptions",
      expect.objectContaining({
        figures: [{ id: "c0", number: "1", caption: "", imageFile: "plots/bands.png" }],
      })
    );
    expect(await screen.findByText(/ai-drafted description, not the paper's caption/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /apply selected descriptions/i }));
    expect(curator.setAll.mock.calls[0][0].charts[0].caption).toBe("Band structure of the defect.");
  });

  it("shows the figure number at full width in the finish step", () => {
    axios.post.mockResolvedValue({ data: { found: false } });
    renderSetup({
      state: {
        ...blankState, referenceInfo: { title: "T" }, fileServerPath: folder,
        paperInfo: { PIs: "A B", collections: [], tags: [] },
        charts: [{ id: "c0", imageFile: "a.png", number: "", caption: "C", properties: ["k"] }],
      },
    });
    const field = screen.getByLabelText("Figure Number");
    expect(field.closest(".MuiTextField-root")).toHaveClass("MuiFormControl-fullWidth");
    // Not squeezed into a narrow first column beside another field.
    const grid = field.closest(".MuiTextField-root").parentElement.parentElement.parentElement;
    expect(getComputedStyle(grid).gridTemplateColumns).toBe("1fr");
  });
});
