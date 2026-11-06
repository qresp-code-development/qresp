import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
import axios from "axios";

import OwnerlessRecords from "../components/Account/OwnerlessRecords";

const ownerless = {
  data: {
    count: 1,
    papers: [
      {
        id: "leg1",
        title: "Legacy Record",
        authors: "Jane Doe",
        year: 2015,
        suggested_owner_email: "jane@example.com",
      },
    ],
  },
};

describe("OwnerlessRecords (admin)", () => {
  afterEach(() => jest.resetAllMocks());

  it("lists ownerless records with the suggested owner prefilled", async () => {
    axios.get.mockResolvedValue(ownerless);
    render(<OwnerlessRecords />);
    expect(await screen.findByText(/legacy record \(2015\)/i)).toBeInTheDocument();
    expect(axios.get).toHaveBeenCalledWith("/api/admin/ownerless-papers");
    expect(screen.getByLabelText(/owner email/i)).toHaveValue("jane@example.com");
  });

  it("assigns the owner and drops the row on success", async () => {
    axios.get.mockResolvedValue(ownerless);
    axios.put.mockResolvedValue({
      data: { id: "leg1", owner_email: "jane@example.com", success: true },
    });
    const user = userEvent.setup();
    render(<OwnerlessRecords />);
    await screen.findByText(/legacy record \(2015\)/i);
    await user.click(screen.getByRole("button", { name: /^assign$/i }));
    expect(axios.put).toHaveBeenCalledWith("/api/paper/leg1/owner", {
      owner_email: "jane@example.com",
    });
    await waitFor(() =>
      expect(screen.queryByText(/legacy record \(2015\)/i)).not.toBeInTheDocument()
    );
    expect(
      screen.getByText(/no ownerless records/i)
    ).toBeInTheDocument();
  });

  it("surfaces the backend error and keeps the row on failure", async () => {
    axios.get.mockResolvedValue(ownerless);
    axios.put.mockRejectedValue({
      response: { status: 400, data: { error: "owner_email must be a valid email address" } },
    });
    const user = userEvent.setup();
    render(<OwnerlessRecords />);
    await screen.findByText(/legacy record \(2015\)/i);
    await user.click(screen.getByRole("button", { name: /^assign$/i }));
    expect(
      await screen.findByText(/must be a valid email address/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/legacy record \(2015\)/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no ownerless records", async () => {
    axios.get.mockResolvedValue({ data: { count: 0, papers: [] } });
    render(<OwnerlessRecords />);
    expect(
      await screen.findByText(/no ownerless records/i)
    ).toBeInTheDocument();
  });
});
