import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
import axios from "axios";

jest.mock("next/router", () => ({
  useRouter: () => ({ pathname: "/account", asPath: "/account", push: jest.fn() }),
}));

import AccountPage from "../pages/account";
import RecordsPage from "../pages/account/records";
import DraftsPage from "../pages/account/drafts";
import AdminPage from "../pages/account/admin";
import AuthContext from "../Context/Auth/authContext";

// /account is the profile; records, drafts and the admin tools each have
// their own page under /account/ inside the same AccountLayout.
const renderWith = (Page) => (auth) =>
  render(
    <AuthContext.Provider value={auth}>
      <Page />
    </AuthContext.Provider>
  );
const renderAccount = renderWith(AccountPage);
const renderRecords = renderWith(RecordsPage);
const renderDrafts = renderWith(DraftsPage);
const renderAdmin = renderWith(AdminPage);

const authedUser = {
  loading: false,
  authenticated: true,
  user: {
    email: "owner@example.com",
    name: "Owner Example",
    is_admin: false,
    provider: "google",
  },
};

const mockAccountApi = ({
  papers = [],
  drafts = [],
  adminPapers = [],
  ownerless = [],
} = {}) => {
  axios.get.mockImplementation((url) => {
    if (url === "/api/account/papers") {
      return Promise.resolve({ data: { count: papers.length, papers } });
    }
    if (url === "/api/account/drafts") {
      return Promise.resolve({ data: { count: drafts.length, drafts } });
    }
    if (url === "/api/admin/papers") {
      return Promise.resolve({
        data: { count: adminPapers.length, papers: adminPapers },
      });
    }
    if (url === "/api/admin/ownerless-papers") {
      return Promise.resolve({
        data: { count: ownerless.length, papers: ownerless },
      });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
};


const activePaper = {
  id: "p1",
  title: "Active Paper",
  authors: "A. Author",
  year: 2020,
  is_active: true,
};
const hiddenPaper = { ...activePaper, title: "Hidden Paper", is_active: false };
const admin = { ...authedUser, user: { ...authedUser.user, is_admin: true } };

describe("Account profile page", () => {
  afterEach(() => {
    jest.resetAllMocks();
    localStorage.clear();
  });

  it("prompts anonymous visitors to sign in and fetches nothing", () => {
    renderAccount({ loading: false, authenticated: false, user: null });
    expect(
      screen.getByText(/please sign in to view your account/i)
    ).toBeInTheDocument();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("shows the profile and links to records, favorites and drafts", () => {
    renderAccount(authedUser);
    // Name and email appear in the sidebar and in the identity card.
    expect(screen.getAllByText("Owner Example").length).toBeGreaterThan(0);
    expect(screen.getAllByText("owner@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText(/signed in with google/i)).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /my records/i })[0]
    ).toHaveAttribute("href", "/account/records");
    expect(
      screen.getAllByRole("link", { name: /drafts/i })[0]
    ).toHaveAttribute("href", "/account/drafts");
  });

  it("labels a Microsoft session on the profile", () => {
    renderAccount({
      ...authedUser,
      user: { ...authedUser.user, provider: "microsoft" },
    });
    expect(screen.getByText(/signed in with microsoft/i)).toBeInTheDocument();
  });

  it("shows the admin badge for admins only", () => {
    const { unmount } = renderAccount(admin);
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
    unmount();
    renderAccount(authedUser);
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });
});

describe("My Records page", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("asks anonymous visitors to sign in and fetches nothing", () => {
    renderRecords({ loading: false, authenticated: false, user: null });
    expect(screen.getByText(/please sign in/i)).toBeInTheDocument();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("lists the user's records with view/edit links", async () => {
    mockAccountApi({
      papers: [
        {
          id: "abc123",
          title: "Photoelectron Spectra",
          authors: "Alex Gaiduk",
          year: 2016,
          owner_email: "owner@example.com",
        },
      ],
    });
    renderRecords(authedUser);
    expect(
      await screen.findByText(/photoelectron spectra \(2016\)/i)
    ).toBeInTheDocument();
    expect(axios.get).toHaveBeenCalledWith("/api/account/papers");
    const view = screen.getByRole("link", { name: /^view$/i });
    expect(view.getAttribute("href")).toContain("/paperdetails/abc123");
    const edit = screen.getByRole("link", { name: /edit in curator/i });
    expect(edit.getAttribute("href")).toContain("/curator?edit=abc123");
  });

  it("hides View and offers Reactivate for a deactivated record", async () => {
    mockAccountApi({ papers: [hiddenPaper] });
    renderRecords(authedUser);
    expect(await screen.findByText(/hidden paper/i)).toBeInTheDocument();
    expect(screen.getByText("deactivated")).toBeInTheDocument();
    // No View link that would land on the public 404 detail page.
    expect(
      screen.queryByRole("link", { name: /^view$/i })
    ).not.toBeInTheDocument();
    // Edit stays available; Reactivate is offered.
    expect(
      screen.getByRole("link", { name: /edit in curator/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reactivate/i })
    ).toBeInTheDocument();
  });

  it("shows View and Deactivate for an active record", async () => {
    mockAccountApi({ papers: [activePaper] });
    renderRecords(authedUser);
    expect(await screen.findByText(/active paper/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^view$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^deactivate$/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reactivate/i })
    ).not.toBeInTheDocument();
  });

  it("deactivates a record via the confirm dialog and updates the UI", async () => {
    mockAccountApi({ papers: [activePaper] });
    axios.put.mockResolvedValue({
      data: { id: "p1", is_active: false, success: true },
    });
    const user = userEvent.setup();
    renderRecords(authedUser);
    await screen.findByText(/active paper/i);
    await user.click(screen.getByRole("button", { name: /^deactivate$/i }));
    const dialog = screen.getByRole("dialog");
    // Wording makes clear this is a soft, reversible hide (not a hard delete).
    expect(within(dialog).getByText(/not deleted/i)).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: /^deactivate$/i })
    );
    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith("/api/paper/p1/active", {
        active: false,
      })
    );
    // findByRole polls past the dialog's close animation (which keeps the
    // background aria-hidden briefly) before the row roles become queryable.
    expect(
      await screen.findByRole("button", { name: /reactivate/i })
    ).toBeInTheDocument();
    expect(screen.getByText("deactivated")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^view$/i })
    ).not.toBeInTheDocument();
  });

  it("reactivates a record via the confirm dialog and updates the UI", async () => {
    mockAccountApi({ papers: [hiddenPaper] });
    axios.put.mockResolvedValue({
      data: { id: "p1", is_active: true, success: true },
    });
    const user = userEvent.setup();
    renderRecords(authedUser);
    await screen.findByText(/hidden paper/i);
    await user.click(screen.getByRole("button", { name: /reactivate/i }));
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: /reactivate/i })
    );
    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith("/api/paper/p1/active", {
        active: true,
      })
    );
    expect(
      await screen.findByRole("link", { name: /^view$/i })
    ).toBeInTheDocument();
    expect(screen.queryByText("deactivated")).not.toBeInTheDocument();
  });

  it("marks editor records edit-only: editor chip, no manage buttons", async () => {
    mockAccountApi({
      papers: [
        {
          ...activePaper,
          title: "Shared Paper",
          role: "editor",
          editor_emails: ["owner@example.com"],
        },
      ],
    });
    renderRecords(authedUser);
    expect(await screen.findByText(/shared paper/i)).toBeInTheDocument();
    expect(screen.getByText("editor")).toBeInTheDocument();
    // Editors can view and edit, but never manage.
    expect(screen.getByRole("link", { name: /^view$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /edit in curator/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /deactivate/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("record-sharing")).not.toBeInTheDocument();
  });

  it("shows the admin sections to admins", async () => {
    mockAccountApi({
      adminPapers: [
        {
          id: "x1",
          title: "Foreign Paper",
          authors: "Someone Else",
          year: 2018,
          owner_email: "someone@example.com",
          editor_emails: [],
          is_active: true,
        },
      ],
    });
    renderRecords(admin);
    expect(
      await screen.findByText(/no published records yet/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/admin — all records/i)).toBeInTheDocument();
    // A record the admin neither owns nor edits appears there.
    expect(await screen.findByText(/foreign paper/i)).toBeInTheDocument();
    expect(axios.get).toHaveBeenCalledWith("/api/admin/papers");
  });

  it("hides the admin sections from non-admins", async () => {
    mockAccountApi();
    renderRecords(authedUser);
    await screen.findByText(/no published records yet/i);
    expect(screen.queryByText(/admin — all records/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/admin — ownerless records/i)
    ).not.toBeInTheDocument();
    expect(axios.get).not.toHaveBeenCalledWith("/api/admin/papers");
  });
});

describe("Admin page", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("gives admins All records, listing records they do not own", async () => {
    mockAccountApi({
      adminPapers: [
        {
          id: "x1",
          title: "Foreign Paper",
          authors: "Someone Else",
          year: 2018,
          owner_email: "someone@example.com",
          editor_emails: [],
          is_active: true,
        },
      ],
    });
    renderAdmin(admin);
    expect(screen.getByText("All Records")).toBeInTheDocument();
    expect(screen.getByText("Ownerless Records")).toBeInTheDocument();
    expect(await screen.findByText(/foreign paper/i)).toBeInTheDocument();
    expect(axios.get).toHaveBeenCalledWith("/api/admin/papers");
  });

  it("refuses non-admins and fetches nothing", () => {
    renderAdmin(authedUser);
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByText("All Records")).not.toBeInTheDocument();
    expect(axios.get).not.toHaveBeenCalled();
  });
});

describe("My Drafts page", () => {
  afterEach(() => {
    jest.resetAllMocks();
    localStorage.clear();
  });

  it("surfaces a browser draft with Resume and Clear", async () => {
    mockAccountApi();
    localStorage.setItem(
      "state",
      JSON.stringify({
        referenceInfo: { title: "My draft paper" },
        charts: [{ id: "c0" }],
      })
    );
    const user = userEvent.setup();
    renderDrafts(authedUser);
    expect(await screen.findByText("My draft paper")).toBeInTheDocument();
    expect(screen.getByText("charts")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /resume/i })
    ).toHaveAttribute("href", "/curator?resumeDraft=1");

    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.queryByText("My draft paper")).not.toBeInTheDocument();
    expect(localStorage.getItem("state")).toBeNull();
    expect(
      screen.getByText(/no local draft saved in this browser/i)
    ).toBeInTheDocument();
  });

  it("lists multiple account drafts with resume and delete actions", async () => {
    mockAccountApi({
      drafts: [
        { id: "draft1", title: "First draft", updated_at: "2026-07-08T12:00:00" },
        { id: "draft2", title: "Second draft", updated_at: "2026-07-08T13:00:00" },
      ],
    });
    axios.delete.mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();

    renderDrafts(authedUser);

    expect(await screen.findByText("First draft")).toBeInTheDocument();
    expect(screen.getByText("Second draft")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /resume/i })[0]).toHaveAttribute(
      "href",
      "/curator?draft=draft1"
    );

    // Delete is confirmed in a dialog before anything is removed.
    await user.click(screen.getAllByRole("button", { name: /^delete$/i })[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/first draft/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    await waitFor(() =>
      expect(axios.delete).toHaveBeenCalledWith("/api/account/drafts/draft1")
    );
    await waitFor(() =>
      expect(screen.queryByText("First draft")).not.toBeInTheDocument()
    );
    expect(screen.getByText("Second draft")).toBeInTheDocument();
  });

  it("renames an account draft through the rename dialog", async () => {
    mockAccountApi({
      drafts: [
        { id: "draft1", title: "Old name", updated_at: "2026-07-08T12:00:00" },
      ],
    });
    axios.put.mockResolvedValue({
      data: { id: "draft1", title: "New name", updated_at: "2026-07-08T14:00:00" },
    });
    const user = userEvent.setup();

    renderDrafts(authedUser);
    await screen.findByText("Old name");
    await user.click(screen.getByRole("button", { name: /rename/i }));

    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText(/draft title/i);
    await user.clear(input);
    await user.type(input, "New name");
    await user.click(within(dialog).getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith("/api/account/drafts/draft1", {
        title: "New name",
      })
    );
    expect(await screen.findByText("New name")).toBeInTheDocument();
  });
});
