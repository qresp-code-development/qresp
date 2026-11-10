import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TopActions from "../components/CuratorElements/TopActions";
import AlertContext from "../Context/Alert/alertContext";
import AuthContext from "../Context/Auth/authContext";
import CuratorContext from "../Context/Curator/curatorContext";
import ServerContext from "../Context/Servers/serverContext";

jest.mock("next/router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("../Utils/serverDrafts", () => ({
  listServerDrafts: jest.fn(),
  fetchServerDraft: jest.fn(),
}));
import { fetchServerDraft, listServerDrafts } from "../Utils/serverDrafts";

// A user for tests that TYPE.
//
// Every keystroke re-renders the surrounding Curator form, so userEvent's
// default inter-key pause dominates any test that enters a phrase and can
// push it past the 5s budget under a full-suite run -- passing alone, failing
// together. `delay: null` removes ONLY the artificial pause: every key event
// still fires, in order, through the same handlers. Nothing asserted changes.
const typingUser = () => userEvent.setup({ delay: null });
const metadata = {
  curatorInfo: { firstName: "A", middleName: "", lastName: "B", emailId: "a@b.co" },
  referenceInfo: { title: "Draft title" },
  paperInfo: { tags: ["draft"] },
  charts: [],
  datasets: [],
  tools: [],
  scripts: [],
  heads: [],
  workflow: { nodes: [], edges: [] },
  license: "",
};

const renderTopActions = ({
  hasDraft = true,
  authenticated = true,
  draftTitle = "Draft title",
} = {}) => {
  const setAlert = jest.fn();
  const unsetAlert = jest.fn();
  const resetAll = jest.fn();
  const hasMeaningfulDraft = jest.fn(() => hasDraft);
  const saveDraftToServer = jest.fn(() => Promise.resolve("draft123"));
  const getDraftTitle = jest.fn(() => draftTitle);
  const applyServerDraft = jest.fn();
  render(
    <CuratorContext.Provider
      value={{
        metadata,
        setAll: jest.fn(),
        resetAll,
        getSavedDraft: jest.fn(() => (hasDraft ? metadata : null)),
        resumeDraft: jest.fn(),
        hasMeaningfulDraft,
        getDraftTitle,
        saveDraftToServer,
        applyServerDraft,
        activeDraftId: null,
      }}
    >
      <AuthContext.Provider value={{ authenticated }}>
        <AlertContext.Provider value={{ setAlert, unsetAlert }}>
          <ServerContext.Provider
            value={{
              selectedHttp: null,
              setSelectedHttp: jest.fn(),
            }}
          >
            <TopActions />
          </ServerContext.Provider>
        </AlertContext.Provider>
      </AuthContext.Provider>
    </CuratorContext.Provider>
  );
  return { setAlert, unsetAlert, resetAll, saveDraftToServer, applyServerDraft };
};

describe("TopActions toolbar contents", () => {
  it("no longer offers Import Manuscript Source; the five toolbar controls remain", () => {
    renderTopActions();
    // Manuscript-source upload is no longer a product feature anywhere;
    // publication metadata comes from manual entry and DOI Fetch.
    expect(
      screen.queryByRole("button", { name: /import manuscript source/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /propose draft fields from a doi/i,
      })
    ).not.toBeInTheDocument();
    // The remaining toolbar controls are unchanged (tooltip names; Export
    // renders as a download link, the rest as buttons).
    [
      /save this work as a named draft in your account/i,
      /load a previously exported metadata json file/i,
      /clear the form and start a fresh submission/i,
      /preview how this paper will look when published/i,
    ].forEach((name) => {
      expect(
        screen.getAllByRole("button", { name }).length
      ).toBeGreaterThan(0);
    });
    expect(
      screen.getAllByRole("link", {
        name: /export the current metadata as a json file/i,
      }).length
    ).toBeGreaterThan(0);
  });
});

describe("TopActions draft controls", () => {
  it("saves a named draft straight over the stored copy, without asking", async () => {
    const user = typingUser();
    const { saveDraftToServer, setAlert } = renderTopActions();

    await user.click(
      screen.getAllByRole("button", {
        name: /save this work as a named draft in your account/i,
      })[0]
    );

    expect(screen.queryByLabelText(/draft name/i)).not.toBeInTheDocument();
    await waitFor(() => expect(saveDraftToServer).toHaveBeenCalledWith("Draft title"));
    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith("Draft saved", expect.stringMatching(/Draft title/), null)
    );
  });

  it("asks for a draft name only when the draft is untitled", async () => {
    const user = typingUser();
    const { saveDraftToServer } = renderTopActions({ draftTitle: "Untitled draft" });

    await user.click(
      screen.getAllByRole("button", {
        name: /save this work as a named draft in your account/i,
      })[0]
    );

    expect(screen.getByLabelText(/draft name/i)).toHaveValue("Untitled draft");
    await user.clear(screen.getByLabelText(/draft name/i));
    await user.type(screen.getByLabelText(/draft name/i), "Named QA draft");
    await user.click(screen.getByRole("button", { name: /^save draft$/i }));

    await waitFor(() =>
      expect(saveDraftToServer).toHaveBeenCalledWith("Named QA draft")
    );
  });

  it("asks what to do with the browser draft before starting from scratch", async () => {
    const user = userEvent.setup();
    const { setAlert, unsetAlert, resetAll } = renderTopActions();

    await user.click(
      screen.getAllByRole("button", {
        name: /clear the form and start a fresh submission/i,
      })[0]
    );

    expect(setAlert).toHaveBeenCalledWith(
      "Start from scratch?",
      "Save this work as a draft in your account before clearing the form, or discard it and start fresh.",
      expect.anything(),
      { hideDismiss: true }
    );

    render(setAlert.mock.calls[0][2]);
    expect(
      screen.getByRole("button", { name: /^cancel$/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /download metadata/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save draft and start fresh/i })
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /discard and start fresh/i })
    );
    expect(resetAll).toHaveBeenCalledWith({ preserveDraft: false });
    expect(unsetAlert).toHaveBeenCalledTimes(1);
  });

  it("can save the account draft before starting from scratch", async () => {
    const user = typingUser();
    const { setAlert, unsetAlert, resetAll, saveDraftToServer } =
      renderTopActions();

    await user.click(
      screen.getAllByRole("button", {
        name: /clear the form and start a fresh submission/i,
      })[0]
    );

    render(setAlert.mock.calls[0][2]);
    await user.click(
      screen.getByRole("button", { name: /save draft and start fresh/i })
    );

    expect(await screen.findByLabelText(/draft name/i)).toHaveValue(
      "Draft title"
    );
    await user.clear(screen.getByLabelText(/draft name/i));
    await user.type(screen.getByLabelText(/draft name/i), "Before reset");
    await user.click(
      screen.getByRole("button", { name: /save draft and start fresh/i })
    );

    await waitFor(() =>
      expect(saveDraftToServer).toHaveBeenCalledWith("Before reset")
    );
    expect(resetAll).toHaveBeenCalledWith({ preserveDraft: false });
    expect(unsetAlert).toHaveBeenCalledTimes(2);
  });

  it("leaves the form untouched when cancelling start from scratch", async () => {
    const user = userEvent.setup();
    const { setAlert, unsetAlert, resetAll } = renderTopActions();

    await user.click(
      screen.getAllByRole("button", {
        name: /clear the form and start a fresh submission/i,
      })[0]
    );

    render(setAlert.mock.calls[0][2]);
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(resetAll).not.toHaveBeenCalled();
    expect(unsetAlert).toHaveBeenCalledTimes(1);
  });
});

describe("TopActions Load Draft", () => {
  afterEach(() => jest.resetAllMocks());

  it("lists the account's drafts and loads the chosen one into the form", async () => {
    const user = userEvent.setup();
    listServerDrafts.mockResolvedValue([
      { id: "d1", title: "Water paper", updated_at: "2026-10-01T12:00:00" },
      { id: "d2", title: "Ice paper", updated_at: "2026-09-30T08:00:00" },
    ]);
    const draft = { id: "d2", title: "Ice paper", state: { license: "cc_by" } };
    fetchServerDraft.mockResolvedValue(draft);
    const { applyServerDraft } = renderTopActions();

    await user.click(screen.getByRole("button", { name: /open a draft saved to your account/i }));
    const dialog = await screen.findByRole("dialog", { name: /load draft/i });
    // The current form has work in it, so the dialog warns before replacing.
    expect(dialog).toHaveTextContent(/replaces what is currently in the form/i);

    await user.click(await screen.findByRole("button", { name: /ice paper/i }));

    expect(fetchServerDraft).toHaveBeenCalledWith("d2");
    await waitFor(() => expect(applyServerDraft).toHaveBeenCalledWith(draft));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /load draft/i })).not.toBeInTheDocument()
    );
  });

  it("asks anonymous users to sign in instead of listing drafts", async () => {
    const user = userEvent.setup();
    const { setAlert } = renderTopActions({ authenticated: false });
    await user.click(screen.getByRole("button", { name: /open a draft saved to your account/i }));
    expect(setAlert).toHaveBeenCalledWith(
      "Sign in required",
      expect.stringMatching(/sign in/i),
      null
    );
    expect(listServerDrafts).not.toHaveBeenCalled();
  });

  it("says so when there are no saved drafts", async () => {
    const user = userEvent.setup();
    listServerDrafts.mockResolvedValue([]);
    renderTopActions({ hasDraft: false });
    await user.click(screen.getByRole("button", { name: /open a draft saved to your account/i }));
    expect(await screen.findByText(/no saved drafts yet/i)).toBeInTheDocument();
  });
});
