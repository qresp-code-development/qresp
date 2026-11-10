import { useContext } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
import axios from "axios";

jest.mock("../Utils/serverDrafts", () => ({
  saveServerDraft: jest.fn(() =>
    Promise.resolve({ id: "draft123", title: "Saved draft" })
  ),
  loadServerDraft: jest.fn(),
}));
import { saveServerDraft } from "../Utils/serverDrafts";

import KeywordAssist, {
  buildKeywordRequest,
} from "../components/CuratorElements/KeywordAssist";
import PaperInfoForm from "../components/CuratorForms/PaperInfoForm";
import CuratorState from "../Context/Curator/CuratorState";
import CuratorContext from "../Context/Curator/curatorContext";
import SourceTreeContext from "../Context/SourceTree/SourceTreeContext";

// A user for tests that TYPE.
//
// Every keystroke re-renders the surrounding Curator form, so userEvent's
// default inter-key pause dominates any test that enters a phrase and can
// push it past the 5s budget under a full-suite run -- passing alone, failing
// together. `delay: null` removes ONLY the artificial pause: every key event
// still fires, in order, through the same handlers. Nothing asserted changes.
const typingUser = () => userEvent.setup({ delay: null });
// Keyword suggestion reads the record's OWN metadata: what the curator typed,
// and the artifacts they already accepted. Nothing else may leave the
// browser -- above all no file, path or account detail, because there is no
// manuscript upload in Qresp and this must not become one.

const STATE = {
  referenceInfo: {
    kind: "journal",
    title: "Pressure tuning of layered chalcogenides",
    abstract: "We show that pressure tunes the electronic gap.",
    publication: "J. Chem. Phys. 2023, 158 ,014101",
    doi: "10.1234/qresp.demo",
    year: 2023,
  },
  charts: [
    {
      id: "c0",
      caption: "Band structure under pressure",
      properties: ["band gap"],
      imageFile: "charts/fig1/fig1.png",
      files: ["charts/fig1/data.txt"],
      notebookFile: "charts/fig1/plot.ipynb",
    },
  ],
  // Curator state stores a dataset/script description under `readme` --
  // the same name artifactFields.js declares and schema.json publishes.
  datasets: [
    {
      readme: "Relaxed geometries",
      keywords: "geometry",
      URLs: ["https://notebook.rcc.uchicago.edu/files/run/geo"],
      files: ["datasets/geo.xyz"],
    },
  ],
  scripts: [{ readme: "Band plotting", keywords: "matplotlib" }],
  // A Tool stores its description as `description` and its facility as
  // `facilityName` -- artifactFields.js, schema.json and every published
  // record agree.
  tools: [
    {
      packageName: "Quantum ESPRESSO",
      description: "DFT code",
      facilityName: "RCC Midway",
      measurement: "total energy",
      version: "7.2",
    },
  ],
  paperInfo: {
    insertedBy: { firstName: "Ada", emailId: "ada@example.com" },
    tags: ["existing"],
  },
};

const renderAssist = ({ state = STATE, onApply = jest.fn() } = {}) => {
  const collectDraftState = jest.fn(() => state);
  render(
    <CuratorContext.Provider value={{ collectDraftState }}>
      <form onSubmit={(event) => event.preventDefault()}>
        <KeywordAssist onApply={onApply} />
      </form>
    </CuratorContext.Provider>
  );
  return { onApply, collectDraftState };
};

const trigger = () =>
  screen.getByRole("button", { name: /suggest keywords with ai/i });

const openAndSend = async (user, data) => {
  await user.click(trigger());
  axios.post.mockResolvedValue({ data });
  await user.click(
    screen.getByRole("checkbox", {
      name: /i agree to send these details to gemini/i,
    })
  );
  await user.click(
    screen.getByRole("button", { name: /continue and get suggestions/i })
  );
  await waitFor(() => expect(axios.post).toHaveBeenCalled());
};

const SUGGESTIONS = {
  keywords: [
    { keyword: "silicon", existing: true, reason: "in the abstract" },
    { keyword: "chalcogenide", existing: false, reason: "in the title" },
  ],
};

describe("buildKeywordRequest allowlist", () => {
  it("carries the record's own descriptive fields", () => {
    const request = buildKeywordRequest(STATE);
    expect(request.consent).toBe(true);
    expect(request.title).toMatch(/Pressure tuning/);
    expect(request.abstract).toMatch(/electronic gap/);
    expect(request.kind).toBe("journal");
    expect(request.doi).toBe("10.1234/qresp.demo");
    expect(request.year).toBe("2023");
    expect(request.charts[0]).toEqual({
      caption: "Band structure under pressure",
      properties: "band gap",
    });
    // Canonical names: the backend resolves them into its payload shape.
    expect(request.datasets[0]).toEqual({
      readme: "Relaxed geometries",
      keywords: "geometry",
    });
    expect(request.scripts[0]).toEqual({
      readme: "Band plotting",
      keywords: "matplotlib",
    });
    expect(request.tools[0].packageName).toBe("Quantum ESPRESSO");
    expect(request.tools[0].facilityName).toBe("RCC Midway");
  });

  it("sends the dataset and script descriptions the curator actually wrote", () => {
    // The regression this guards: the allowlist asked for `description` and
    // `facility`, which are not the names state uses, so these values were
    // read as undefined and silently never sent. The suggestions were made
    // without the artifacts the UI said they were made with.
    const request = buildKeywordRequest(STATE);
    expect(request.datasets[0].readme).toBe("Relaxed geometries");
    expect(request.scripts[0].readme).toBe("Band plotting");
    expect(request.tools[0].facilityName).toBe("RCC Midway");
    expect(request.datasets[0].description).toBeUndefined();
    expect(request.scripts[0].description).toBeUndefined();
    expect(request.tools[0].facility).toBeUndefined();
  });

  it("does not treat the old payload-side names as canonical state", () => {
    // A record whose state only carries the old names contributes nothing
    // from those fields -- state does not use them, so reading them would
    // be guessing.
    const request = buildKeywordRequest({
      referenceInfo: { title: "T" },
      datasets: [{ description: "Only the old name", keywords: "kw" }],
    });
    expect(request.datasets[0]).toEqual({ keywords: "kw" });
  });

  it("carries nothing else at all", () => {
    const serialized = JSON.stringify(buildKeywordRequest(STATE));
    [
      "charts/fig1/fig1.png",
      "charts/fig1/data.txt",
      "charts/fig1/plot.ipynb",
      "datasets/geo.xyz",
      "notebook.rcc.uchicago.edu",
      "ada@example.com",
      "insertedBy",
      "7.2",
      "c0",
    ].forEach((forbidden) => expect(serialized).not.toContain(forbidden));
  });

  it("omits an artifact kind the record does not have", () => {
    const request = buildKeywordRequest({ referenceInfo: { title: "T" } });
    ["charts", "datasets", "scripts", "tools"].forEach((kind) =>
      expect(request[kind]).toBeUndefined()
    );
  });
});

describe("Suggest Keywords with AI", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends nothing before consent", async () => {
    const user = userEvent.setup();
    renderAssist();

    await user.click(trigger());
    expect(
      screen.getByRole("button", { name: /continue and get suggestions/i })
    ).toBeDisabled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("says what travels and what does not", async () => {
    const user = userEvent.setup();
    renderAssist();
    await user.click(trigger());

    const text = document.body.textContent;
    expect(text).toMatch(/kind, title, abstract, publication, doi and year/i);
    expect(text).toMatch(/keywords already used across qresp/i);
    expect(text).toMatch(/does not send any file, notebook or image/i);
    expect(text).toMatch(/file path or rcc url/i);
    expect(text).toMatch(/nothing is stored or published/i);
  });

  it("posts only the allowlisted request", async () => {
    const user = userEvent.setup();
    renderAssist();
    await openAndSend(user, SUGGESTIONS);

    const [url, payload] = axios.post.mock.calls[0];
    expect(url).toBe("/api/assist/keywords");
    expect(Object.keys(payload).sort()).toEqual([
      "abstract", "charts", "consent", "datasets", "doi", "kind",
      "publication", "scripts", "title", "tools", "year",
    ]);
  });

  it("snapshots the screen at the moment of the click", async () => {
    const user = userEvent.setup();
    const { collectDraftState } = renderAssist();

    await user.click(trigger());

    // collectDraftState runs the registered flushers, so unsaved typed values
    // are included.
    expect(collectDraftState).toHaveBeenCalled();
  });

  it("distinguishes existing Qresp keywords from new suggestions", async () => {
    const user = userEvent.setup();
    renderAssist();
    await openAndSend(user, SUGGESTIONS);

    expect(screen.getByText("Existing Qresp keyword")).toBeInTheDocument();
    expect(screen.getByText("New suggestion")).toBeInTheDocument();
  });

  it("applies only the ticked suggestions, and only on Apply", async () => {
    const user = userEvent.setup();
    const { onApply } = renderAssist();
    await openAndSend(user, SUGGESTIONS);

    expect(screen.getByRole("checkbox", { name: /apply silicon/i }))
      .not.toBeChecked();
    expect(onApply).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /apply selected keywords/i })
    ).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /apply silicon/i }));
    await user.click(
      screen.getByRole("button", { name: /apply selected keywords/i })
    );

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(["silicon"]);
  });

  it("never submits the form it lives in", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn((event) => event.preventDefault());
    const collectDraftState = jest.fn(() => STATE);
    render(
      <CuratorContext.Provider value={{ collectDraftState }}>
        <form onSubmit={onSubmit}>
          <KeywordAssist onApply={jest.fn()} />
        </form>
      </CuratorContext.Provider>
    );

    expect(trigger()).toHaveAttribute("type", "button");
    await user.click(trigger());
    screen.getAllByRole("button").forEach((button) =>
      expect(button).toHaveAttribute("type", "button")
    );

    axios.post.mockResolvedValue({ data: SUGGESTIONS });
    await user.click(
      screen.getByRole("checkbox", {
        name: /i agree to send these details to gemini/i,
      })
    );
    await user.click(
      screen.getByRole("button", { name: /continue and get suggestions/i })
    );
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    await user.click(screen.getByRole("checkbox", { name: /apply silicon/i }));
    await user.click(
      screen.getByRole("button", { name: /apply selected keywords/i })
    );
    await user.click(screen.getByRole("button", { name: /^close$/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("is disabled when there is nothing to read", () => {
    renderAssist({ state: { referenceInfo: {}, paperInfo: {} } });
    expect(trigger()).toBeDisabled();
    expect(screen.getByTestId("keyword-assist-availability")).toHaveTextContent(
      /enter a title or abstract/i
    );
  });

  it("is enabled from reviewed artifacts alone", () => {
    renderAssist({
      state: { referenceInfo: {}, datasets: [{ readme: "Geometries" }] },
    });
    expect(trigger()).toBeEnabled();
  });

  it("eligibility follows the same canonical fields the request does", () => {
    // The button used to light up for a dataset whose only field was
    // `description` -- a name state does not use -- and then send nothing
    // from it. Eligibility and payload must agree.
    renderAssist({
      state: { referenceInfo: {}, datasets: [{ description: "Geometries" }] },
    });
    expect(trigger()).toBeDisabled();
  });
});

describe("each failure says something different", () => {
  beforeEach(() => jest.clearAllMocks());

  const failWith = async (user, status, error) => {
    await user.click(trigger());
    axios.post.mockRejectedValue({ response: { status, data: { error } } });
    await user.click(
      screen.getByRole("checkbox", {
        name: /i agree to send these details to gemini/i,
      })
    );
    await user.click(
      screen.getByRole("button", { name: /continue and get suggestions/i })
    );
    return waitFor(() =>
      expect(screen.getByTestId("keyword-error")).toBeInTheDocument()
    );
  };

  it.each([
    [503, /not configured/i],
    [429, /limit/i],
    [502, /unreadable|could not be reached/i],
  ])("explains a %s without exposing anything", async (status, pattern) => {
    const user = userEvent.setup();
    renderAssist();
    await failWith(user, status, null);
    expect(screen.getByTestId("keyword-error")).toHaveTextContent(pattern);
  });
});

describe("Keywords are appended, never replaced", () => {
  beforeEach(() => jest.clearAllMocks());

  // The action is disabled until the record has something to read, so the
  // probe seeds a title the way the Publication Information form would.
  const Seed = () => {
    const { setReferenceInfo } = useContext(CuratorContext);
    return (
      <button
        type="button"
        onClick={() => setReferenceInfo(STATE.referenceInfo)}
      >
        seed
      </button>
    );
  };

  const renderPaperInfo = () => {
    render(
      <CuratorState draftKey={null}>
        <Seed />
        <SourceTreeContext.Provider
          value={{
            setSaveMethod: jest.fn(),
            openSelector: jest.fn(),
            HideSelector: jest.fn(),
          }}
        >
          <PaperInfoForm editor={jest.fn()} />
        </SourceTreeContext.Provider>
      </CuratorState>
    );
  };

  const keywordsField = () =>
    screen.getByPlaceholderText(/tags for the project/i);

  it("lives under the Keywords input in Qresp Curation Information", () => {
    renderPaperInfo();
    expect(trigger()).toBeInTheDocument();
    expect(keywordsField()).toBeInTheDocument();
  });

  it("appends to what the curator typed, case-insensitively deduplicated",
     async () => {
    const user = typingUser();
    renderPaperInfo();
    await user.click(screen.getByRole("button", { name: "seed" }));

    await user.type(keywordsField(), "DFT, Silicon");
    await openAndSend(user, {
      keywords: [
        { keyword: "silicon", existing: true },
        { keyword: "chalcogenide", existing: false },
      ],
    });
    await user.click(screen.getByRole("checkbox", { name: /apply silicon/i }));
    await user.click(
      screen.getByRole("checkbox", { name: /apply chalcogenide/i })
    );
    await user.click(
      screen.getByRole("button", { name: /apply selected keywords/i })
    );

    // "Silicon" was already there in a different case: not duplicated, and
    // the curator's own spelling survives.
    expect(keywordsField()).toHaveValue("DFT, Silicon, chalcogenide");
  });

  it("does not save or collapse the section when applying", async () => {
    const user = typingUser();
    renderPaperInfo();
    await user.click(screen.getByRole("button", { name: "seed" }));

    await user.type(keywordsField(), "DFT");
    await openAndSend(user, SUGGESTIONS);
    await user.click(screen.getByRole("checkbox", { name: /apply silicon/i }));
    await user.click(
      screen.getByRole("button", { name: /apply selected keywords/i })
    );
    await user.click(screen.getByRole("button", { name: /^close$/i }));

    // The section is still editable and nothing was persisted.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument()
    );
    expect(keywordsField()).toHaveValue("DFT, silicon");
    expect(saveServerDraft).not.toHaveBeenCalled();
  });
});
