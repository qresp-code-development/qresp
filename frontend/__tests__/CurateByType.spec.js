import { useContext } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
import axios from "axios";

const mockReplace = jest.fn();
let mockQuery = {};
let mockPathname = "/curator";
jest.mock("next/router", () => ({
  __esModule: true,
  default: { push: jest.fn() },
  useRouter: () => ({ pathname: mockPathname, query: mockQuery, replace: mockReplace }),
}));
jest.mock("../Utils/Scraper", () => ({ getList: jest.fn() }));

import { parseRepoUrl, lookupRepo, referenceFromRepo } from "../Utils/repoLookup";
import CuratorNavMenu from "../components/CuratorNavMenu";
import GuidedSetup from "../components/CuratorElements/GuidedSetup";
import { ChooserFromQuery, WorkTypeFromQuery } from "../pages/curator";
import CuratorState from "../Context/Curator/CuratorState";
import CuratorContext from "../Context/Curator/curatorContext";
import AuthContext from "../Context/Auth/authContext";
import { WORK_TYPE_KEYS } from "../Utils/workTypes";

const GITHUB = "https://api.github.com";

// GitHub's public API, as the lookup reads it.
const mockGitHub = ({ users = {}, release = "2025-03-01T00:00:00Z" } = {}) => {
  axios.get.mockImplementation((url) => {
    if (url === `${GITHUB}/repos/west-code/west`) {
      return Promise.resolve({
        data: {
          name: "west",
          description: "Large-scale GW calculations",
          html_url: "https://github.com/west-code/west",
          pushed_at: "2024-06-01T00:00:00Z",
          topics: ["gw", "dft"],
          owner: { login: "west-code", type: "Organization" },
        },
      });
    }
    if (url === `${GITHUB}/repos/west-code/west/releases/latest`) {
      return release ? Promise.resolve({ data: { published_at: release } }) : Promise.reject({ response: { status: 404 } });
    }
    if (url === `${GITHUB}/repos/west-code/west/contributors`) {
      return Promise.resolve({
        data: [
          { login: "mgovoni", type: "User" },
          { login: "nobody", type: "User" },
          { login: "dependabot[bot]", type: "Bot" },
        ],
      });
    }
    const login = url.replace(`${GITHUB}/users/`, "");
    if (login in users) return Promise.resolve({ data: { name: users[login] } });
    return Promise.reject({ response: { status: 404 } });
  });
};

describe("repository links", () => {
  it("understands the usual ways of writing a repository", () => {
    expect(parseRepoUrl("https://github.com/west-code/west")).toMatchObject({ host: "github", path: "west-code/west" });
    expect(parseRepoUrl("github.com/west-code/west/tree/main/src")).toMatchObject({ path: "west-code/west" });
    expect(parseRepoUrl("git@github.com:west-code/west.git")).toMatchObject({ path: "west-code/west" });
    expect(parseRepoUrl("west-code/west")).toMatchObject({ host: "github" });
    expect(parseRepoUrl("https://gitlab.com/group/sub/proj/-/tree/main")).toMatchObject({
      host: "gitlab",
      path: "group/sub/proj",
    });
    expect(parseRepoUrl("https://example.org/x")).toBeNull();
    expect(parseRepoUrl("")).toBeNull();
  });

  it("reads name, description, developers with full names, release year and topics", async () => {
    mockGitHub({ users: { mgovoni: "Marco Govoni", nobody: "nobody" } });
    const result = await lookupRepo("https://github.com/west-code/west");
    expect(result).toMatchObject({
      title: "west",
      description: "Large-scale GW calculations",
      developers: ["Marco Govoni"],
      year: 2025,
      url: "https://github.com/west-code/west",
      topics: ["gw", "dft"],
      contributorsWithoutNames: 1,
    });
    // Bots are never asked about.
    expect(axios.get).not.toHaveBeenCalledWith(`${GITHUB}/users/dependabot[bot]`);
  });

  it("falls back to the last push when there is no release", async () => {
    mockGitHub({ release: null });
    expect((await lookupRepo("west-code/west")).year).toBe(2024);
  });

  it("explains a missing repository and a rate limit", async () => {
    axios.get.mockRejectedValue({ response: { status: 404 } });
    await expect(lookupRepo("a/b")).rejects.toThrow(/no public repository/i);
    axios.get.mockRejectedValue({ response: { status: 403 } });
    await expect(lookupRepo("a/b")).rejects.toThrow(/limiting requests/i);
    await expect(lookupRepo("not a repo")).rejects.toThrow(/does not look like/i);
  });

  it("keeps what the host does not supply", () => {
    const next = referenceFromRepo(
      { title: "west", description: "", developers: [], year: null, url: "https://github.com/a/b", topics: [] },
      { abstract: "Kept", authors: "Ada Lovelace", year: 2020 }
    );
    expect(next).toMatchObject({ kind: "software", abstract: "Kept", authors: "Ada Lovelace", year: 2020 });
  });
});

describe("the header's Curator menu", () => {
  afterEach(() => {
    mockPathname = "/curator";
    mockQuery = {};
  });

  it("lists every kind of work on hover, each opening the curator set to it", async () => {
    const user = userEvent.setup();
    render(<CuratorNavMenu text="Curator" />);
    expect(screen.queryByTestId("curator-nav-menu")).not.toBeInTheDocument();
    await user.hover(screen.getByRole("link", { name: /curator/i }));
    expect(await screen.findByTestId("curator-nav-menu")).toBeInTheDocument();
    WORK_TYPE_KEYS.forEach((type) =>
      expect(screen.getByTestId(`curator-nav-${type}`)).toHaveAttribute("href", `/curator?type=${type}`)
    );
  });

  it("opens the curator from other pages", () => {
    mockPathname = "/explorer";
    render(<CuratorNavMenu text="Curator" />);
    expect(screen.getByRole("link", { name: /curator/i })).toHaveAttribute("href", "/curator");
  });

  it("goes back to the chooser when clicked on a new record's forms", () => {
    render(<CuratorNavMenu text="Curator" />);
    expect(screen.getByRole("link", { name: /curator/i })).toHaveAttribute("href", "/curator?choose=1");
  });

  it("leaves edit mode the way it always has", () => {
    mockQuery = { edit: "abc" };
    render(<CuratorNavMenu text="Curator" />);
    expect(screen.getByRole("link", { name: /curator/i })).toHaveAttribute("href", "/curator");
  });

  it("opens for keyboard users too", async () => {
    const user = userEvent.setup();
    render(<CuratorNavMenu text="Curator" />);
    await user.tab();
    expect(await screen.findByTestId("curator-nav-menu")).toBeInTheDocument();
  });
});

describe("opening the curator from a menu link", () => {
  const ShowType = () => {
    const { workType } = useContext(CuratorContext);
    return <div data-testid="state-work-type">{workType || "(none)"}</div>;
  };

  afterEach(() => {
    mockQuery = {};
    mockReplace.mockReset();
  });

  it("starts the record as the chosen type and tidies the URL", async () => {
    mockQuery = { type: "dataset" };
    render(
      <CuratorState draftKey={null}>
        <WorkTypeFromQuery />
        <ShowType />
      </CuratorState>
    );
    await waitFor(() => expect(screen.getByTestId("state-work-type")).toHaveTextContent("dataset"));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/curator", query: {} }, undefined, { shallow: true });
  });

  it("starts over at the chooser for ?choose=1 and tidies the URL", async () => {
    const SetType = () => {
      const { setWorkType } = useContext(CuratorContext);
      return <button onClick={() => setWorkType("software")}>pick</button>;
    };
    const user = userEvent.setup();
    const { rerender } = render(
      <CuratorState draftKey={null}>
        <SetType />
        <ChooserFromQuery />
        <ShowType />
      </CuratorState>
    );
    await user.click(screen.getByText("pick"));
    expect(screen.getByTestId("state-work-type")).toHaveTextContent("software");
    mockQuery = { choose: "1" };
    rerender(
      <CuratorState draftKey={null}>
        <SetType />
        <ChooserFromQuery />
        <ShowType />
      </CuratorState>
    );
    await waitFor(() => expect(screen.getByTestId("state-work-type")).toHaveTextContent("(none)"));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/curator", query: {} }, undefined, { shallow: true });
  });

  it("ignores an unknown type", () => {
    mockQuery = { type: "poem" };
    render(
      <CuratorState draftKey={null}>
        <WorkTypeFromQuery />
        <ShowType />
      </CuratorState>
    );
    expect(screen.getByTestId("state-work-type")).toHaveTextContent("(none)");
  });
});

describe("the guided setup for a code repository", () => {
  const blank = {
    workType: "software",
    curatorInfo: { firstName: "", middleName: "", lastName: "", emailId: "", affiliation: "" },
    referenceInfo: { doi: "", title: "", url: "" },
    paperInfo: { tags: [], collections: [], PIs: "" },
    fileServerPath: "",
    charts: [],
    datasets: [],
    scripts: [],
    tools: [],
    heads: [],
    workflow: { nodes: [], edges: [] },
  };

  const renderSetup = (state = blank, auth = { loading: false, authenticated: false, user: null }) => {
    const curator = {
      codeHost: "repository",
      setCodeHost: jest.fn(),
      ...state,
      resetVersion: 0,
      metadata: state,
      prefillCuratorInfo: jest.fn(),
      collectDraftState: jest.fn(() => state),
      setAll: jest.fn(),
      remountForms: jest.fn(),
      importBundle: jest.fn(),
      cacheRccAnalysis: jest.fn(),
      edit: jest.fn(),
      setFileServerPath: jest.fn(),
    };
    render(
      <AuthContext.Provider value={auth}>
        <CuratorContext.Provider value={curator}>
          <GuidedSetup />
        </CuratorContext.Provider>
      </AuthContext.Provider>
    );
    return curator;
  };

  afterEach(() => jest.resetAllMocks());

  it("asks for the GitHub link and fills the record from it", async () => {
    mockGitHub({ users: { mgovoni: "Marco Govoni" } });
    const user = userEvent.setup();
    const curator = renderSetup();
    expect(screen.getByText("The code repository")).toBeInTheDocument();
    // No LaTeX captions step for code.
    expect(screen.queryByText("Figure captions")).not.toBeInTheDocument();

    await user.type(screen.getByTestId("guided-repo-input"), "https://github.com/west-code/west");
    await user.click(screen.getByTestId("guided-repo-lookup-button"));

    await waitFor(() => expect(curator.setAll).toHaveBeenCalled());
    const applied = curator.setAll.mock.calls[0][0];
    expect(applied.referenceInfo).toMatchObject({
      kind: "software",
      title: "west",
      abstract: "Large-scale GW calculations",
      authors: "Marco Govoni",
      year: 2025,
      url: "https://github.com/west-code/west",
    });
    expect(applied.paperInfo.tags).toEqual(["gw", "dft"]);
  });

  it("can look a Zenodo release up by DOI instead", async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByRole("link", { name: /look it up by doi/i }));
    expect(screen.getByLabelText("Software DOI")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: /use the repository link instead/i }));
    expect(screen.getByTestId("guided-repo-input")).toBeInTheDocument();
  });

  it("needs no project folder when the code is on GitHub or GitLab", () => {
    renderSetup();
    expect(screen.getByTestId("code-host-repository")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Project folder")).not.toBeInTheDocument();
    expect(screen.queryByText("Figures, data & scripts")).not.toBeInTheDocument();
    expect(screen.getByText(/no rcc folder needed/i)).toBeInTheDocument();
    // Code needs no figures, so Finish is open straight away.
    expect(screen.queryByText(/available once figures/i)).not.toBeInTheDocument();
  });

  it("lets the curator say the code is on the RCC file server instead", async () => {
    const user = userEvent.setup();
    const curator = renderSetup();
    await user.click(screen.getByTestId("code-host-fileserver"));
    expect(curator.setCodeHost).toHaveBeenCalledWith("fileserver");
  });

  it("asks code on the file server for its folder, not a repository link", () => {
    renderSetup({ ...blank, codeHost: "fileserver" });
    expect(screen.getByText("Project folder")).toBeInTheDocument();
    expect(screen.queryByTestId("guided-repo-input")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Software DOI")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /use the repository link instead/i })).not.toBeInTheDocument();
  });

  it("asks for both when the code is in both places", () => {
    renderSetup({ ...blank, codeHost: "both" });
    expect(screen.getByText("Project folder")).toBeInTheDocument();
    expect(screen.getByTestId("guided-repo-input")).toBeInTheDocument();
  });

  describe("reading the repository", () => {
    const SHA = "0123456789abcdef0123456789abcdef01234567";
    const BASE = `https://github.com/west-code/west/blob/${SHA}`;
    const signedIn = { loading: false, authenticated: true, user: { email: "a@b.c", name: "" } };
    const withRepo = {
      ...blank,
      referenceInfo: { ...blank.referenceInfo, title: "west", url: "https://github.com/west-code/west" },
    };
    const analysis = {
      root: BASE,
      repo: { host: "github", path: "west-code/west", commit: SHA, branch: "main", files_base: BASE },
      warnings: ["2 test file(s) were left out: tests check the code rather than produce results."],
      candidates: {
        charts: [],
        datasets: [],
        scripts: [
          { id: "script-0", label: "examples/si/", proposal: { files: ["examples/si"], readme: "" } },
          { id: "script-1", label: "west/ (source code)", proposal: { files: ["west"], readme: "" } },
          // Writes no figure: listed, not selected.
          { id: "script-2", label: "tools/helper.py", selected: false, proposal: { files: ["tools/helper.py"], readme: "" } },
        ],
        tools: [
          { id: "tool-0", label: "west v6.4.0",
            proposal: { kind: "software", packageName: "west", version: "v6.4.0", urls: "https://github.com/west-code/west" } },
        ],
      },
      suggestions: {
        numbers: {},
        links: [{ from: "tool-0", to: "script-0", type: "uses_tool", reason: "part of west", confidence: "medium" }],
      },
    };

    it("reads the repository instead of a folder and adds what it found", async () => {
      axios.post.mockImplementation((url) =>
        url === "/api/curation/analyze-repo"
          ? Promise.resolve({ data: analysis })
          : Promise.resolve({ data: {} })
      );
      const user = userEvent.setup();
      const curator = renderSetup(withRepo, signedIn);
      expect(screen.getByText("Scripts, data & tools")).toBeInTheDocument();
      await waitFor(() =>
        expect(axios.post).toHaveBeenCalledWith("/api/curation/analyze-repo", { url: "https://github.com/west-code/west" })
      );
      expect(axios.post).not.toHaveBeenCalledWith("/api/curation/analyze-folder", expect.anything());
      expect(await screen.findByTestId("guided-repo-notes")).toHaveTextContent("commit 0123456");
      expect(screen.getByText(/test file\(s\) were left out/)).toBeInTheDocument();
      expect(screen.getByTestId("guided-unselected")).toHaveTextContent("1 more item was found but not selected");

      await user.click(screen.getByRole("button", { name: /add 3 items to the record/i }));
      // Files link to the commit that was read.
      expect(curator.setFileServerPath).toHaveBeenCalledWith(BASE);
      expect(curator.importBundle).toHaveBeenCalledTimes(1);
      const [records, links] = curator.importBundle.mock.calls[0];
      expect(records.map((r) => r.list)).toEqual(["scripts", "scripts", "tools"]);
      expect(records.map((r) => r.key)).not.toContain("cand:script-2");
      expect(links).toEqual([{ from: "cand:tool-0", to: "cand:script-0", type: "uses_tool" }]);
    });

    it("lets an unselected item be added from the list", async () => {
      axios.post.mockImplementation((url) =>
        url === "/api/curation/analyze-repo" ? Promise.resolve({ data: analysis }) : Promise.resolve({ data: {} })
      );
      const user = userEvent.setup();
      const curator = renderSetup(withRepo, signedIn);
      await screen.findByTestId("guided-unselected");
      await user.click(screen.getByRole("button", { name: /review the list/i }));
      const box = screen.getByRole("checkbox", { name: "tools/helper.py" });
      expect(box).not.toBeChecked();
      await user.click(box);
      await user.click(screen.getByRole("button", { name: /add 4 items to the record/i }));
      expect(curator.importBundle.mock.calls[0][0].map((r) => r.key)).toContain("cand:script-2");
    });

    it("waits for the repository link", () => {
      renderSetup(blank, signedIn);
      expect(screen.getByText(/available once the repository link is set/i)).toBeInTheDocument();
      expect(axios.post).not.toHaveBeenCalledWith("/api/curation/analyze-repo", expect.anything());
    });

    it("explains a repository that could not be read", async () => {
      axios.post.mockImplementation((url) =>
        url === "/api/curation/analyze-repo"
          ? Promise.reject({ response: { data: { error: "No public repository was found at that link." } } })
          : Promise.resolve({ data: {} })
      );
      renderSetup(withRepo, signedIn);
      expect(await screen.findByText("No public repository was found at that link.")).toBeInTheDocument();
    });

    it("still scans the RCC folder when the code is there", async () => {
      axios.post.mockResolvedValue({ data: { candidates: {}, suggestions: {} } });
      const folder = "https://notebook.rcc.uchicago.edu/files/west";
      renderSetup({ ...withRepo, codeHost: "both", fileServerPath: folder }, signedIn);
      await waitFor(() =>
        expect(axios.post).toHaveBeenCalledWith("/api/curation/analyze-folder", { path: folder })
      );
      expect(axios.post).not.toHaveBeenCalledWith("/api/curation/analyze-repo", expect.anything());
    });
  });

  it("asks a dataset for its data DOI", () => {
    renderSetup({ ...blank, workType: "dataset" });
    expect(screen.getByLabelText("Dataset DOI")).toBeInTheDocument();
    expect(screen.getByTestId("guided-doi-hint")).toHaveTextContent(/zenodo, figshare, dryad/i);
    expect(screen.queryByTestId("guided-repo-input")).not.toBeInTheDocument();
  });
});
