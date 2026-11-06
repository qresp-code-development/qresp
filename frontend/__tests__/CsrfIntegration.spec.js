import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// REAL axios (no jest.mock): the point of this suite is to prove the actual
// interceptor pipeline attaches X-CSRF-Token to the curator Save request.
import axios from "axios";

const push = jest.fn();
jest.mock("next/router", () => ({ useRouter: () => ({ push }) }));

// Importing AuthState registers the CSRF interceptors on the real axios.
import AuthState from "../Context/Auth/AuthState";
import AuthContext from "../Context/Auth/authContext";
import EditModeController from "../components/CuratorElements/EditMode";
import CuratorContext from "../Context/Curator/curatorContext";
import CuratorHelperContext from "../Context/CuratorHelpers/curatorHelperContext";
import ServerContext from "../Context/Servers/serverContext";
import AlertContext from "../Context/Alert/alertContext";
import LoadingContext from "../Context/Loading/loadingContext";

import paperDoc from "./fixtures/paperDoc.json";
import { convertReqSchematoState } from "../Utils/model";

const calls = { me: 0, puts: [] };
let failNextPutWithCsrf403 = false;

const stubAdapter = async (config) => {
  const respond = (data) => ({
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  });
  const url = config.url || "";
  if (url === "/api/auth/me") {
    calls.me += 1;
    return respond({
      authenticated: true,
      user: {
        email: "owner@example.com",
        name: "Owner",
        is_admin: false,
        provider: "dev",
      },
      csrf_token: "tok-123",
    });
  }
  if (url.endsWith("/permissions")) {
    return respond({ can_edit: true, authenticated: true, reason: "owner" });
  }
  if (url.endsWith("/raw")) {
    return respond({ id: "abc123", paper: paperDoc });
  }
  if ((config.method || "").toLowerCase() === "put") {
    calls.puts.push(config);
    if (failNextPutWithCsrf403) {
      failNextPutWithCsrf403 = false;
      const error = new Error("Request failed with status code 403");
      error.response = {
        status: 403,
        data: { error: "CSRF token missing or invalid." },
        headers: {},
        config,
      };
      throw error;
    }
    return respond({ id: "abc123", success: true });
  }
  throw new Error("unhandled request " + config.method + " " + url);
};

const putToken = (config) =>
  config.headers && (config.headers["X-CSRF-Token"] || config.headers["x-csrf-token"]);

const renderEditor = ({ withAuthState = false } = {}) => {
  const metadata = convertReqSchematoState(paperDoc);
  const tree = (
    <CuratorContext.Provider value={{ metadata, setAll: jest.fn() }}>
      <CuratorHelperContext.Provider value={{ editing: {} }}>
        <ServerContext.Provider value={{ selectedHttp: null }}>
          <AlertContext.Provider value={{ setAlert: jest.fn() }}>
            <LoadingContext.Provider
              value={{ showLoader: jest.fn(), hideLoader: jest.fn() }}
            >
              <EditModeController editId="abc123" server="https://x">
                {() => <div>FORMS</div>}
              </EditModeController>
            </LoadingContext.Provider>
          </AlertContext.Provider>
        </ServerContext.Provider>
      </CuratorHelperContext.Provider>
    </CuratorContext.Provider>
  );
  return render(
    withAuthState ? (
      <AuthState>{tree}</AuthState>
    ) : (
      <AuthContext.Provider value={{ loading: false, authenticated: true }}>
        {tree}
      </AuthContext.Provider>
    )
  );
};

describe("CSRF integration for curator Save Changes (real axios)", () => {
  const originalAdapter = axios.defaults.adapter;

  beforeAll(() => {
    axios.defaults.adapter = stubAdapter;
  });

  afterAll(() => {
    axios.defaults.adapter = originalAdapter;
  });

  it("fetches the token just in time when nothing cached it yet", async () => {
    // No AuthState mounted: the module-level cache starts empty, so the
    // request interceptor must fetch /api/auth/me itself before the PUT.
    const user = userEvent.setup();
    renderEditor();
    await user.click(
      await screen.findByRole("button", { name: /save changes/i })
    );
    await waitFor(() => expect(calls.puts.length).toBe(1));
    expect(calls.me).toBeGreaterThanOrEqual(1);
    expect(putToken(calls.puts[0])).toBe("tok-123");
  });

  it("attaches the cached token from AuthState's /me call", async () => {
    const user = userEvent.setup();
    renderEditor({ withAuthState: true });
    await user.click(
      await screen.findByRole("button", { name: /save changes/i })
    );
    await waitFor(() => expect(calls.puts.length).toBe(2));
    expect(putToken(calls.puts[1])).toBe("tok-123");
  });

  it("recovers from a stale token: 403 CSRF drops the cache and the retry refetches", async () => {
    failNextPutWithCsrf403 = true;
    const user = userEvent.setup();
    renderEditor();
    const save = await screen.findByRole("button", { name: /save changes/i });
    await user.click(save);
    await waitFor(() => expect(calls.puts.length).toBe(3)); // rejected attempt
    const meBefore = calls.me;
    await user.click(save);
    await waitFor(() => expect(calls.puts.length).toBe(4));
    expect(calls.me).toBe(meBefore + 1); // just-in-time refetch after reset
    expect(putToken(calls.puts[3])).toBe("tok-123");
  });
});
