import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
import axios from "axios";

import AllRecords from "../components/Account/AllRecords";

const activeRecord = {
  id: "r1",
  title: "Active Paper",
  authors: "A. Author",
  year: 2020,
  owner_email: "someone@example.com",
  editor_emails: ["helper@example.com"],
  is_active: true,
  updated_at: "2026-07-09T10:00:00",
  updated_by_email: "someone@example.com",
};

const deactivatedRecord = {
  id: "r2",
  title: "Hidden Paper",
  authors: "B. Author",
  year: 2019,
  owner_email: null,
  editor_emails: [],
  is_active: false,
  updated_at: null,
  updated_by_email: null,
};

const mockList = (papers) => {
  axios.get.mockResolvedValue({ data: { count: papers.length, papers } });
};

describe("AllRecords (admin)", () => {
  afterEach(() => jest.resetAllMocks());

  it("lists every record with owner, editors, status and audit info", async () => {
    mockList([activeRecord, deactivatedRecord]);
    render(<AllRecords />);
    expect(await screen.findByText(/active paper \(2020\)/i)).toBeInTheDocument();
    expect(axios.get).toHaveBeenCalledWith("/api/admin/papers");
    // A record the admin neither owns nor edits is present.
    expect(
      screen.getByText(/owner: someone@example\.com/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/editors: helper@example\.com/i)).toBeInTheDocument();
    expect(
      screen.getByText(/updated .+ by someone@example\.com/i)
    ).toBeInTheDocument();
    // The ownerless deactivated record is flagged.
    expect(screen.getByText(/hidden paper \(2019\)/i)).toBeInTheDocument();
    expect(screen.getByText("ownerless")).toBeInTheDocument();
    expect(screen.getByText("deactivated")).toBeInTheDocument();
  });

  it("offers View/Edit/Editors/Reassign Owner/Deactivate on an active record", async () => {
    mockList([activeRecord]);
    render(<AllRecords />);
    await screen.findByText(/active paper/i);
    expect(screen.getByRole("link", { name: /^view$/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/paperdetails/r1")
    );
    expect(
      screen.getByRole("link", { name: /edit in curator/i })
    ).toHaveAttribute("href", expect.stringContaining("/curator?edit=r1"));
    expect(screen.getByRole("button", { name: /editors/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reassign owner/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^deactivate$/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reactivate/i })
    ).not.toBeInTheDocument();
  });

  it("hides View and offers Reactivate on a deactivated record", async () => {
    mockList([deactivatedRecord]);
    render(<AllRecords />);
    await screen.findByText(/hidden paper/i);
    expect(
      screen.queryByRole("link", { name: /^view$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /edit in curator/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reactivate/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^deactivate$/i })
    ).not.toBeInTheDocument();
  });

  it("reassigns the owner through the confirm dialog and updates the row", async () => {
    mockList([activeRecord]);
    axios.put.mockResolvedValue({
      data: { id: "r1", owner_email: "new@example.com", success: true },
    });
    const user = userEvent.setup();
    render(<AllRecords />);
    await screen.findByText(/active paper/i);
    await user.click(screen.getByRole("button", { name: /reassign owner/i }));

    const dialog = screen.getByRole("dialog");
    // Explains the reassignment consequence before confirming.
    expect(
      within(dialog).getByText(/previous owner loses edit access/i)
    ).toBeInTheDocument();
    const input = within(dialog).getByLabelText(/owner email/i);
    expect(input).toHaveValue("someone@example.com");
    await user.clear(input);
    await user.type(input, "new@example.com");
    await user.click(within(dialog).getByRole("button", { name: /reassign/i }));

    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith("/api/paper/r1/owner", {
        owner_email: "new@example.com",
        force: true,
      })
    );
    expect(
      await screen.findByText(/owner: new@example\.com/i)
    ).toBeInTheDocument();
  });

  it("updates editors through the Editors dialog and updates the row", async () => {
    mockList([activeRecord]);
    axios.put.mockResolvedValue({
      data: {
        id: "r1",
        editor_emails: ["helper@example.com", "second@example.com"],
        success: true,
      },
    });
    const user = userEvent.setup();
    render(<AllRecords />);
    await screen.findByText(/active paper/i);
    await user.click(screen.getByRole("button", { name: /^editors$/i }));

    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText(/editor emails/i);
    expect(input).toHaveValue("helper@example.com");
    await user.clear(input);
    await user.type(input, "helper@example.com, second@example.com");
    await user.click(within(dialog).getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith("/api/paper/r1/editors", {
        editor_emails: ["helper@example.com", "second@example.com"],
      })
    );
    expect(
      await screen.findByText(
        /editors: helper@example\.com, second@example\.com/i
      )
    ).toBeInTheDocument();
  });

  it("deactivates through the confirm dialog and flips the row to Reactivate", async () => {
    mockList([activeRecord]);
    axios.put.mockResolvedValue({
      data: { id: "r1", is_active: false, success: true },
    });
    const user = userEvent.setup();
    render(<AllRecords />);
    await screen.findByText(/active paper/i);
    await user.click(screen.getByRole("button", { name: /^deactivate$/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/not deleted/i)).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: /^deactivate$/i })
    );

    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith("/api/paper/r1/active", {
        active: false,
      })
    );
    expect(
      await screen.findByRole("button", { name: /reactivate/i })
    ).toBeInTheDocument();
    expect(screen.getByText("deactivated")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^view$/i })
    ).not.toBeInTheDocument();
  });

  it("reactivates through the confirm dialog and restores View", async () => {
    mockList([deactivatedRecord]);
    axios.put.mockResolvedValue({
      data: { id: "r2", is_active: true, success: true },
    });
    const user = userEvent.setup();
    render(<AllRecords />);
    await screen.findByText(/hidden paper/i);
    await user.click(screen.getByRole("button", { name: /reactivate/i }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /reactivate/i,
      })
    );

    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith("/api/paper/r2/active", {
        active: true,
      })
    );
    expect(
      await screen.findByRole("link", { name: /^view$/i })
    ).toBeInTheDocument();
    expect(screen.queryByText("deactivated")).not.toBeInTheDocument();
  });

  it("shows the backend error inline when an action fails", async () => {
    mockList([activeRecord]);
    axios.put.mockRejectedValue({
      response: {
        status: 400,
        data: { error: "owner_email must be a valid email address" },
      },
    });
    const user = userEvent.setup();
    render(<AllRecords />);
    await screen.findByText(/active paper/i);
    await user.click(screen.getByRole("button", { name: /reassign owner/i }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /reassign/i }));
    expect(
      await within(dialog).findByText(/must be a valid email address/i)
    ).toBeInTheDocument();
    // The row is unchanged.
    expect(screen.getByText(/owner: someone@example\.com/i)).toBeInTheDocument();
  });
});
