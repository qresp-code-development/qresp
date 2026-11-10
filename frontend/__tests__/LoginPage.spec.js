import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("axios");
import axios from "axios";

const mockReplace = jest.fn();
let query = {};

jest.mock("next/router", () => ({
  useRouter: () => ({ query, replace: mockReplace, asPath: "/login" }),
}));

import AuthState from "../Context/Auth/AuthState";
import LoginPage from "../pages/login";
import safeNext, { providerHref, loginHref } from "../Utils/safeNext";

const renderLogin = () =>
  render(
    <AuthState>
      <LoginPage />
    </AuthState>
  );

const anonymous = () =>
  axios.get.mockResolvedValue({ data: { authenticated: false, user: null, csrf_token: "tok" } });

describe("/login", () => {
  beforeEach(() => {
    query = {};
  });
  afterEach(() => {
    jest.resetAllMocks();
    mockReplace.mockReset();
  });

  it("offers exactly the three supported OAuth providers as links", async () => {
    anonymous();
    renderLogin();

    const microsoft = await screen.findByRole("link", {
      name: /continue with microsoft/i,
    });
    const google = screen.getByRole("link", { name: /continue with google/i });
    const github = screen.getByRole("link", { name: /continue with github/i });
    expect(microsoft).toHaveAttribute("href", "/api/auth/microsoft?next=%2F");
    expect(google).toHaveAttribute("href", "/api/auth/google?next=%2F");
    expect(github).toHaveAttribute("href", "/api/auth/github?next=%2F");
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("shows a heading and email/password form with OAuth providers always visible", async () => {
    anonymous();
    renderLogin();

    const heading = await screen.findByRole("heading", {
      name: /sign in to qresp/i,
    });
    expect(heading).toBeInTheDocument();
    // Email/password form fields are visible in sign-in mode.
    expect(screen.getByLabelText(/email address/i)).toBeVisible();
    expect(screen.getByLabelText(/^password\b/i)).toBeVisible();
    // Nothing gates the providers behind an accordion.
    expect(screen.queryByRole("button", { name: /expand/i })).toBeNull();
    expect(document.querySelector(".MuiAccordion-root")).toBeNull();
    expect(
      screen.getByRole("link", { name: /continue with microsoft/i })
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /continue with google/i })
    ).toBeVisible();
  });

  it("spells Microsoft correctly everywhere it appears", async () => {
    anonymous();
    const { container } = renderLogin();
    await screen.findByRole("link", { name: /continue with google/i });
    const text = container.textContent;
    expect(text).toContain("Microsoft");
    [/micosoft/i, /micorsoft/i, /microsft/i, /mircosoft/i].forEach((typo) => {
      expect(text).not.toMatch(typo);
    });
  });

  it("describes Microsoft as work/school without over-claiming", async () => {
    anonymous();
    renderLogin();
    expect(
      await screen.findByText(/use your work or school account/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/all universit/i)).toBeNull();
    expect(screen.queryByText(/every universit/i)).toBeNull();
  });

  it("carries a safe same-origin next into both provider flows", async () => {
    query = { next: "/curator" };
    anonymous();
    renderLogin();

    expect(
      await screen.findByRole("link", { name: /continue with microsoft/i })
    ).toHaveAttribute("href", "/api/auth/microsoft?next=%2Fcurator");
    expect(
      screen.getByRole("link", { name: /continue with google/i })
    ).toHaveAttribute("href", "/api/auth/google?next=%2Fcurator");
  });

  it("refuses an external next and falls back to the site root", async () => {
    query = { next: "https://evil.example.com/steal" };
    anonymous();
    renderLogin();

    expect(
      await screen.findByRole("link", { name: /continue with google/i })
    ).toHaveAttribute("href", "/api/auth/google?next=%2F");
  });

  it("shows no CILogon, dev-login, or configuration detail", async () => {
    anonymous();
    const { container } = renderLogin();
    await screen.findByRole("link", { name: /continue with google/i });

    const text = container.textContent.toLowerCase();
    ["cilogon", "institutional login", "dev sign in", "dev login",
     "client id", "client secret", "api key", "redirect uri", "drive",
     "gmail", "scope"].forEach((forbidden) => {
      expect(text).not.toContain(forbidden);
    });
  });

  it("sends an already-authenticated visitor on instead of asking again", async () => {
    query = { next: "/curator" };
    axios.get.mockResolvedValue({
      data: {
        authenticated: true,
        user: { email: "o@e.com", name: "O", is_admin: false,
                provider: "google" },
      },
    });
    renderLogin();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/curator"));
    expect(
      screen.queryByRole("link", { name: /continue with google/i })
    ).toBeNull();
  });

  it("sends an authenticated visitor with no next to their account", async () => {
    axios.get.mockResolvedValue({
      data: {
        authenticated: true,
        user: { email: "o@e.com", name: "O", is_admin: false,
                provider: "microsoft" },
      },
    });
    renderLogin();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/account"));
  });

  it("switches to create-account mode showing name and confirm-password fields", async () => {
    anonymous();
    renderLogin();
    await screen.findByRole("heading", { name: /sign in to qresp/i });

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(screen.getByLabelText(/name.*optional/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it("calls local-login on form submit and redirects on success", async () => {
    anonymous();
    axios.post.mockResolvedValue({
      data: { authenticated: true, user: { email: "a@b.com", name: "A", is_admin: false, provider: "local" } },
    });
    renderLogin();
    await screen.findByRole("heading", { name: /sign in to qresp/i });

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/^password\b/i), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in with email/i }));

    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith("/api/auth/local-login", {
        email: "a@b.com",
        password: "secret123",
      })
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/account"));
  });

  it("shows an error when local-login fails", async () => {
    anonymous();
    axios.post.mockRejectedValue({
      response: { status: 401, data: { error: "Invalid email or password." } },
    });
    renderLogin();
    await screen.findByRole("heading", { name: /sign in to qresp/i });

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/^password\b/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in with email/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
  });

  it("rejects mismatched passwords on create-account without a network call", async () => {
    anonymous();
    renderLogin();
    await screen.findByRole("heading", { name: /sign in to qresp/i });

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "x@y.com" } });
    fireEvent.change(screen.getByLabelText(/^password\b/i), { target: { value: "abcdefgh" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "different" } });
    fireEvent.click(screen.getByRole("button", { name: /create account with email/i }));

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe("/login email confirmation", () => {
  beforeEach(() => {
    query = {};
  });
  afterEach(() => {
    jest.resetAllMocks();
    mockReplace.mockReset();
  });

  it("tells a new account to confirm its email instead of signing in", async () => {
    anonymous();
    axios.post.mockResolvedValue({
      data: { authenticated: false, verification_required: true, email: "x@y.com" },
    });
    renderLogin();
    await screen.findByRole("heading", { name: /sign in to qresp/i });

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "x@y.com" } });
    fireEvent.change(screen.getByLabelText(/^password\b/i), { target: { value: "abcdefgh" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "abcdefgh" } });
    fireEvent.click(screen.getByRole("button", { name: /create account with email/i }));

    expect(await screen.findByText(/we sent a confirmation link to x@y\.com/i)).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
    // Back in sign-in mode, with the address kept for the next attempt.
    expect(screen.getByRole("button", { name: /sign in with email/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toHaveValue("x@y.com");
  });

  it("offers the staging confirmation link when no email is sent", async () => {
    anonymous();
    axios.post.mockResolvedValue({
      data: {
        authenticated: false, verification_required: true, email: "x@y.com",
        verify_link: "https://localhost:8444/verify-email?token=t",
      },
    });
    renderLogin();
    await screen.findByRole("heading", { name: /sign in to qresp/i });

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "x@y.com" } });
    fireEvent.change(screen.getByLabelText(/^password\b/i), { target: { value: "abcdefgh" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "abcdefgh" } });
    fireEvent.click(screen.getByRole("button", { name: /create account with email/i }));

    expect(
      await screen.findByRole("link", { name: /open confirmation link/i })
    ).toHaveAttribute("href", "https://localhost:8444/verify-email?token=t");
  });

  it("explains an unconfirmed account on sign-in rather than calling it an error", async () => {
    anonymous();
    axios.post.mockRejectedValue({
      response: {
        status: 403,
        data: {
          verification_required: true,
          error: "Please confirm your email address first. We sent a confirmation link to a@b.com.",
        },
      },
    });
    renderLogin();
    await screen.findByRole("heading", { name: /sign in to qresp/i });

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/^password\b/i), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in with email/i }));

    expect(await screen.findByText(/please confirm your email address first/i)).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe("safeNext", () => {
  it("accepts same-origin paths only", () => {
    expect(safeNext("/curator")).toBe("/curator");
    expect(safeNext("/paperdetails/abc?x=1")).toBe("/paperdetails/abc?x=1");
  });

  it("rejects every off-site shape", () => {
    ["https://evil.com", "//evil.com", "http://evil.com/x", "\\\\evil.com",
     "/\\evil.com", "javascript:alert(1)", "evil.com", "", null, undefined,
     42].forEach((value) => {
      expect(safeNext(value)).toBe("/");
    });
  });

  it("builds encoded provider and login hrefs", () => {
    expect(providerHref("google", "/curator")).toBe(
      "/api/auth/google?next=%2Fcurator"
    );
    expect(providerHref("microsoft", "https://evil.com")).toBe(
      "/api/auth/microsoft?next=%2F"
    );
    expect(loginHref("/explorer")).toBe("/login?next=%2Fexplorer");
    expect(loginHref("//evil.com")).toBe("/login?next=%2F");
  });
});
