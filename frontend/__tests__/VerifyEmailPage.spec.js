import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("axios");
import axios from "axios";

const mockReplace = jest.fn();
let query = {};

jest.mock("next/router", () => ({
  useRouter: () => ({ query, replace: mockReplace, asPath: "/verify-email" }),
}));

import AuthState from "../Context/Auth/AuthState";
import VerifyEmailPage from "../pages/verify-email";

const renderPage = () =>
  render(
    <AuthState>
      <VerifyEmailPage />
    </AuthState>
  );

describe("/verify-email", () => {
  beforeEach(() => {
    query = { token: "tok-123" };
    axios.get.mockResolvedValue({ data: { authenticated: false, user: null, csrf_token: "c" } });
  });
  afterEach(() => {
    jest.resetAllMocks();
    mockReplace.mockReset();
  });

  it("sends the link's token with the password and opens the account", async () => {
    axios.post.mockResolvedValue({
      data: { authenticated: true, user: { email: "a@b.com", name: "A", provider: "local" } },
    });
    renderPage();

    fireEvent.change(screen.getByLabelText(/^password\b/i), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm email/i }));

    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith("/api/auth/verify-email", {
        token: "tok-123",
        password: "secret123",
      })
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/account"));
  });

  it("shows the server's reason when confirmation fails", async () => {
    axios.post.mockRejectedValue({
      response: { status: 400, data: { error: "This confirmation link is invalid or has expired." } },
    });
    renderPage();

    fireEvent.change(screen.getByLabelText(/^password\b/i), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm email/i }));

    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("explains an incomplete link instead of showing the form", () => {
    query = {};
    renderPage();
    expect(screen.getByText(/this confirmation link is incomplete/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm email/i })).toBeNull();
  });
});
