import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
jest.mock("next/router", () => ({ __esModule: true, default: { push: jest.fn() } }));
import axios from "axios";
import Router from "next/router";

import AuthContext from "../Context/Auth/authContext";
import PermissionNotice from "../components/Paper/PermissionNotice";

const renderNotice = (authValue) =>
  render(
    <AuthContext.Provider value={authValue}>
      <PermissionNotice paperId="abc123" server="https://localhost:8443" />
    </AuthContext.Provider>
  );

const mockPermissions = (perm) => {
  axios.get.mockResolvedValue({ data: perm });
};

describe("PermissionNotice", () => {
  afterEach(() => jest.resetAllMocks());

  it("tells owners/admins they can edit and links to the curator edit mode", async () => {
    mockPermissions({
      can_edit: true,
      reason: "owner",
      owner_email: "owner@example.com",
      authenticated: true,
      is_admin: false,
    });
    renderNotice({ authenticated: true, loading: false });
    expect(
      await screen.findByText(/you can edit this record/i)
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /edit in curator/i });
    expect(link).toHaveAttribute(
      "href",
      "/curator?edit=abc123&server=https%3A%2F%2Flocalhost%3A8443"
    );
    expect(axios.get).toHaveBeenCalledWith("/api/paper/abc123/permissions");
  });

  it("asks anonymous visitors to sign in and shows no edit link", async () => {
    mockPermissions({
      can_edit: false,
      reason: "authentication required",
      owner_email: "owner@example.com",
      authenticated: false,
      is_admin: false,
    });
    renderNotice({ authenticated: false, loading: false });
    expect(
      await screen.findByText(/sign in to edit this record/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /edit in curator/i })
    ).not.toBeInTheDocument();
  });

  it("explains owner/admin-only for other users without the edit link", async () => {
    mockPermissions({
      can_edit: false,
      reason: "only the record owner, an editor, or an admin can edit this record",
      owner_email: "owner@example.com",
      authenticated: true,
      is_admin: false,
    });
    renderNotice({ authenticated: true, loading: false });
    expect(
      await screen.findByText(/only the record owner, an editor, or an admin/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /edit in curator/i })
    ).not.toBeInTheDocument();
  });

  it("offers Assign owner to admins on ownerless records and refetches after assigning", async () => {
    mockPermissions({
      can_edit: true,
      reason: "admin",
      owner_email: null,
      authenticated: true,
      is_admin: true,
    });
    axios.put.mockResolvedValue({
      data: { id: "abc123", owner_email: "new@example.com", success: true },
    });
    const user = userEvent.setup();
    renderNotice({ authenticated: true, loading: false });
    await user.click(
      await screen.findByRole("button", { name: /assign owner/i })
    );
    await user.type(screen.getByLabelText(/owner email/i), "new@example.com");
    const getCallsBefore = axios.get.mock.calls.length;
    await user.click(screen.getByRole("button", { name: /^assign$/i }));
    expect(axios.put).toHaveBeenCalledWith("/api/paper/abc123/owner", {
      owner_email: "new@example.com",
    });
    // permissions are refetched so the notice reflects the new owner
    expect(axios.get.mock.calls.length).toBeGreaterThan(getCallsBefore);
  });

  it("shows the backend error when assigning fails", async () => {
    mockPermissions({
      can_edit: true,
      reason: "admin",
      owner_email: null,
      authenticated: true,
      is_admin: true,
    });
    axios.put.mockRejectedValue({
      response: {
        status: 400,
        data: { error: "owner_email must be a valid email address" },
      },
    });
    const user = userEvent.setup();
    renderNotice({ authenticated: true, loading: false });
    await user.click(
      await screen.findByRole("button", { name: /assign owner/i })
    );
    await user.click(screen.getByRole("button", { name: /^assign$/i }));
    expect(
      await screen.findByText(/must be a valid email address/i)
    ).toBeInTheDocument();
  });

  it("hides Assign owner from non-admins and on records that have an owner", async () => {
    mockPermissions({
      can_edit: true,
      reason: "owner",
      owner_email: "owner@example.com",
      authenticated: true,
      is_admin: false,
    });
    const { unmount } = renderNotice({ authenticated: true, loading: false });
    await screen.findByText(/you can edit this record/i);
    expect(
      screen.queryByRole("button", { name: /assign owner/i })
    ).not.toBeInTheDocument();
    unmount();

    jest.resetAllMocks();
    mockPermissions({
      can_edit: true,
      reason: "admin",
      owner_email: "owner@example.com", // owned record: no assign button
      authenticated: true,
      is_admin: true,
    });
    renderNotice({ authenticated: true, loading: false });
    await screen.findByText(/you can edit this record/i);
    expect(
      screen.queryByRole("button", { name: /assign owner/i })
    ).not.toBeInTheDocument();
  });

  it("lets owners deactivate an active record after confirmation and refetches", async () => {
    mockPermissions({
      can_edit: true,
      reason: "owner",
      owner_email: "owner@example.com",
      authenticated: true,
      is_admin: false,
      is_active: true,
      can_manage: true,
    });
    axios.put.mockResolvedValue({
      data: { id: "abc123", is_active: false, success: true },
    });
    const user = userEvent.setup();
    renderNotice({ authenticated: true, loading: false });
    await user.click(
      await screen.findByRole("button", { name: /^deactivate$/i })
    );
    // Confirmation dialog, not an immediate destructive action.
    const confirm = within(
      screen.getByRole("dialog")
    ).getByRole("button", { name: /^deactivate$/i });
    const getCallsBefore = axios.get.mock.calls.length;
    await user.click(confirm);
    expect(axios.put).toHaveBeenCalledWith("/api/paper/abc123/active", {
      active: false,
    });
    expect(axios.get.mock.calls.length).toBeGreaterThan(getCallsBefore);
  });

  it("shows a deactivated notice and a Reactivate action to the owner", async () => {
    mockPermissions({
      can_edit: true,
      reason: "owner",
      owner_email: "owner@example.com",
      authenticated: true,
      is_admin: false,
      is_active: false,
      can_manage: true,
    });
    renderNotice({ authenticated: true, loading: false });
    expect(
      await screen.findByText(/this record is deactivated/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^reactivate$/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^deactivate$/i })
    ).not.toBeInTheDocument();
  });

  it("gives editors the edit link but no deactivate control (edit-only role)", async () => {
    mockPermissions({
      can_edit: true,
      reason: "editor",
      owner_email: "owner@example.com",
      authenticated: true,
      is_admin: false,
      is_active: true,
      role: "editor",
      can_manage: false,
    });
    renderNotice({ authenticated: true, loading: false });
    expect(
      await screen.findByText(/you can edit this record \(editor\)/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /edit in curator/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /deactivate/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reactivate/i })
    ).not.toBeInTheDocument();
  });

  it("does not offer deactivate to users who cannot edit", async () => {
    mockPermissions({
      can_edit: false,
      reason: "only the record owner, an editor, or an admin can edit this record",
      owner_email: "owner@example.com",
      authenticated: true,
      is_admin: false,
      is_active: true,
    });
    renderNotice({ authenticated: true, loading: false });
    await screen.findByText(/only the record owner, an editor, or an admin/i);
    expect(
      screen.queryByRole("button", { name: /deactivate/i })
    ).not.toBeInTheDocument();
  });

  it("shows the backend error when deactivating fails", async () => {
    mockPermissions({
      can_edit: true,
      reason: "owner",
      owner_email: "owner@example.com",
      authenticated: true,
      is_admin: false,
      is_active: true,
      can_manage: true,
    });
    axios.put.mockRejectedValue({
      response: { status: 403, data: { error: "not allowed here" } },
    });
    const user = userEvent.setup();
    renderNotice({ authenticated: true, loading: false });
    await user.click(
      await screen.findByRole("button", { name: /^deactivate$/i })
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^deactivate$/i,
      })
    );
    expect(await screen.findByText(/not allowed here/i)).toBeInTheDocument();
  });

  it("renders nothing when the permission fetch fails (e.g. previews)", async () => {
    axios.get.mockRejectedValue({ response: { status: 404 } });
    const { container } = renderNotice({ authenticated: false, loading: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  describe("permanent delete", () => {
    const owner = {
      can_edit: true,
      reason: "owner",
      owner_email: "owner@example.com",
      authenticated: true,
      is_admin: false,
      is_active: true,
      can_manage: true,
    };

    it("deletes after the word is typed and returns to My Records", async () => {
      mockPermissions(owner);
      axios.delete.mockResolvedValue({ data: { id: "abc123", deleted: true } });
      const user = userEvent.setup();
      renderNotice({ authenticated: true, loading: false });
      await user.click(await screen.findByTestId("paper-delete"));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument();
      const confirm = within(dialog).getByTestId("paper-delete-confirm");
      expect(confirm).toBeDisabled();
      await user.type(within(dialog).getByTestId("paper-delete-confirm-input"), "delete");
      await user.click(confirm);
      expect(axios.delete).toHaveBeenCalledWith("/api/paper/abc123");
      expect(Router.push).toHaveBeenCalledWith("/account/records");
    });

    it("is not offered to an editor", async () => {
      mockPermissions({ ...owner, reason: "editor", role: "editor", can_manage: false });
      renderNotice({ authenticated: true, loading: false });
      await screen.findByText(/you can edit this record/i);
      expect(screen.queryByTestId("paper-delete")).not.toBeInTheDocument();
    });
  });
});
