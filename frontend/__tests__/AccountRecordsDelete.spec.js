import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
jest.mock("next/router", () => ({
  useRouter: () => ({ pathname: "/account/records", query: {} }),
}));
import axios from "axios";

import RecordsPage from "../pages/account/records";
import AuthContext from "../Context/Auth/authContext";

const auth = {
  loading: false,
  authenticated: true,
  user: { email: "owner@example.com", name: "Owner", is_admin: false },
};

const paper = (overrides = {}) => ({
  id: "p1",
  title: "My Paper",
  authors: "A. Author",
  year: 2020,
  is_active: true,
  ...overrides,
});

const renderRecords = (papers) => {
  axios.get.mockImplementation((url) =>
    url === "/api/account/papers"
      ? Promise.resolve({ data: { count: papers.length, papers } })
      : Promise.reject(new Error(`Unexpected URL: ${url}`))
  );
  return render(
    <AuthContext.Provider value={auth}>
      <RecordsPage />
    </AuthContext.Provider>
  );
};

describe("deleting a record from My Records", () => {
  afterEach(() => jest.resetAllMocks());

  it("offers Delete beside Deactivate on the owner's record", async () => {
    renderRecords([paper()]);
    await screen.findByText(/my paper/i);
    expect(screen.getByRole("button", { name: /^deactivate$/i })).toBeInTheDocument();
    expect(screen.getByTestId("record-delete")).toBeInTheDocument();
  });

  it("also offers Delete on a deactivated record", async () => {
    renderRecords([paper({ is_active: false })]);
    await screen.findByText(/my paper/i);
    expect(screen.getByTestId("record-delete")).toBeInTheDocument();
  });

  it("never offers Delete to an editor", async () => {
    renderRecords([paper({ role: "editor" })]);
    await screen.findByText(/my paper/i);
    expect(screen.queryByTestId("record-delete")).not.toBeInTheDocument();
  });

  it("deletes only after the word is typed, then drops the row", async () => {
    axios.delete.mockResolvedValue({ data: { id: "p1", deleted: true } });
    const user = userEvent.setup();
    renderRecords([paper(), paper({ id: "p2", title: "Other Paper" })]);
    await screen.findByText(/my paper/i);

    await user.click(screen.getAllByTestId("record-delete")[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument();
    const confirm = within(dialog).getByTestId("record-delete-confirm");
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByTestId("record-delete-confirm-input"), "delete");
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith("/api/paper/p1"));
    await waitFor(() => expect(screen.queryByText(/my paper/i)).not.toBeInTheDocument());
    expect(screen.getByText(/other paper/i)).toBeInTheDocument();
  });

  it("keeps the row and shows the server's reason when delete fails", async () => {
    axios.delete.mockRejectedValue({ response: { data: { error: "only the record owner or an admin can manage this record" } } });
    const user = userEvent.setup();
    renderRecords([paper()]);
    await screen.findByText(/my paper/i);
    await user.click(screen.getByTestId("record-delete"));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByTestId("record-delete-confirm-input"), "delete");
    await user.click(within(dialog).getByTestId("record-delete-confirm"));
    expect(await within(dialog).findByText(/only the record owner/i)).toBeInTheDocument();
    expect(screen.getAllByText(/my paper/i).length).toBeGreaterThan(0);
  });
});
