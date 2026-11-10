import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
import axios from "axios";

const push = jest.fn();
jest.mock("next/router", () => ({ useRouter: () => ({ push }) }));

import EditModeController from "../components/CuratorElements/EditMode";
import AuthContext from "../Context/Auth/authContext";
import CuratorContext from "../Context/Curator/curatorContext";
import CuratorHelperContext from "../Context/CuratorHelpers/curatorHelperContext";
import ServerContext from "../Context/Servers/serverContext";
import AlertContext from "../Context/Alert/alertContext";
import LoadingContext from "../Context/Loading/loadingContext";

import paperDoc from "./fixtures/paperDoc.json";
import { convertReqSchematoState } from "../Utils/model";

const setAlert = jest.fn();

const renderController = ({
  metadata,
  setAll = jest.fn(),
  editId = "abc123",
  auth = { loading: false, authenticated: true },
} = {}) =>
  render(
    <AuthContext.Provider value={auth}>
    <CuratorContext.Provider value={{ metadata, setAll }}>
      <CuratorHelperContext.Provider value={{ editing: {} }}>
        <ServerContext.Provider value={{ selectedHttp: null }}>
          <AlertContext.Provider value={{ setAlert }}>
            <LoadingContext.Provider
              value={{ showLoader: jest.fn(), hideLoader: jest.fn() }}
            >
              <EditModeController
                editId={editId}
                server="https://localhost:8443"
              >
                {(editMode) => <div>FORMS {editMode ? "edit" : "create"}</div>}
              </EditModeController>
            </LoadingContext.Provider>
          </AlertContext.Provider>
        </ServerContext.Provider>
      </CuratorHelperContext.Provider>
    </CuratorContext.Provider>
    </AuthContext.Provider>
  );

const mockPermissionAndRaw = ({ canEdit, authenticated = true }) => {
  axios.get.mockImplementation((url) => {
    if (url.endsWith("/permissions")) {
      return Promise.resolve({
        data: { can_edit: canEdit, authenticated, reason: "owner" },
      });
    }
    if (url.endsWith("/raw")) {
      return Promise.resolve({ data: { id: "abc123", paper: paperDoc } });
    }
    return Promise.reject(new Error("unexpected GET " + url));
  });
};

describe("EditModeController", () => {
  afterEach(() => jest.resetAllMocks());

  it("renders create mode for authenticated users when no edit id is present", () => {
    renderController({ editId: null });
    expect(screen.getByText("FORMS create")).toBeInTheDocument();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("asks anonymous visitors to sign in before creating (no forms, no publish)", () => {
    renderController({
      editId: null,
      auth: { loading: false, authenticated: false },
    });
    expect(
      screen.getByText(/sign in to start curating/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/FORMS/)).not.toBeInTheDocument();
  });

  it("gives the anonymous create gate a direct Sign in to curate action", () => {
    renderController({
      editId: null,
      auth: { loading: false, authenticated: false },
    });
    // A primary action right where the visitor is blocked — no hunting in
    // the header, and it returns them to the curator afterwards.
    const action = screen.getByRole("link", { name: /sign in to curate/i });
    expect(action).toHaveAttribute("href", "/login?next=%2Fcurator");
    // The old "use the header / Dev sign in" instructions are gone.
    expect(screen.queryByText(/dev sign in/i)).toBeNull();
    expect(screen.queryByText(/in the header/i)).toBeNull();
  });

  it("waits for the auth state before deciding on create mode", () => {
    renderController({
      editId: null,
      auth: { loading: true, authenticated: false },
    });
    expect(screen.getByText(/checking sign-in/i)).toBeInTheDocument();
    expect(screen.queryByText(/FORMS/)).not.toBeInTheDocument();
  });

  it("blocks unauthorized users: message, no forms, no save", async () => {
    mockPermissionAndRaw({ canEdit: false });
    const setAll = jest.fn();
    renderController({ setAll });
    expect(
      await screen.findByText(/only the record owner, an editor, or an admin/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/FORMS/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save changes/i })
    ).not.toBeInTheDocument();
    expect(setAll).not.toHaveBeenCalled();
  });

  it("asks anonymous visitors to sign in", async () => {
    mockPermissionAndRaw({ canEdit: false, authenticated: false });
    renderController({});
    expect(
      await screen.findByText(/sign in to edit this record/i)
    ).toBeInTheDocument();
  });

  it("loads the record into curator state for authorized editors", async () => {
    mockPermissionAndRaw({ canEdit: true });
    const setAll = jest.fn();
    renderController({ setAll });
    expect(await screen.findByText("FORMS edit")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save changes/i })
    ).toBeInTheDocument();
    expect(setAll).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceInfo: expect.objectContaining({
          title: paperDoc.reference.title,
        }),
      })
    );
  });

  it("saves through PUT /api/paper/{id} and returns to paperdetails", async () => {
    mockPermissionAndRaw({ canEdit: true });
    axios.put.mockResolvedValue({ data: { id: "abc123", success: true } });
    const metadata = convertReqSchematoState(paperDoc);
    const user = userEvent.setup();
    renderController({ metadata });
    await user.click(
      await screen.findByRole("button", { name: /save changes/i })
    );
    expect(axios.put).toHaveBeenCalledWith(
      "/api/paper/abc123",
      expect.objectContaining({
        reference: expect.objectContaining({
          title: paperDoc.reference.title,
        }),
        tags: paperDoc.tags,
      })
    );
    expect(push).toHaveBeenCalledWith(
      "/paperdetails/abc123?server=https%3A%2F%2Flocalhost%3A8443"
    );
  });

  it("edits a DEACTIVATED record and returns to /account (not the 404 detail page)", async () => {
    // Deactivated records are editable by the owner, but their public detail
    // route 404s (SSR is anonymous), so the save must land on /account.
    axios.get.mockImplementation((url) => {
      if (url.endsWith("/permissions")) {
        return Promise.resolve({
          data: {
            can_edit: true,
            authenticated: true,
            reason: "owner",
            is_active: false,
          },
        });
      }
      if (url.endsWith("/raw")) {
        return Promise.resolve({
          data: { id: "abc123", paper: { ...paperDoc, is_active: false } },
        });
      }
      return Promise.reject(new Error("unexpected GET " + url));
    });
    axios.put.mockResolvedValue({ data: { id: "abc123", success: true } });
    const metadata = convertReqSchematoState(paperDoc);
    const user = userEvent.setup();
    renderController({ metadata });
    await user.click(
      await screen.findByRole("button", { name: /save changes/i })
    );
    // The edit payload must not carry is_active (only /active toggles it).
    const putPayload = axios.put.mock.calls[0][1];
    expect(putPayload).not.toHaveProperty("is_active");
    expect(push).toHaveBeenCalledWith("/account");
  });

  it("shows the backend reason when saving is forbidden", async () => {
    mockPermissionAndRaw({ canEdit: true });
    axios.put.mockRejectedValue({
      response: {
        status: 403,
        data: { error: "only the record owner or an admin can edit this record" },
      },
    });
    const metadata = convertReqSchematoState(paperDoc);
    const user = userEvent.setup();
    renderController({ metadata });
    await user.click(
      await screen.findByRole("button", { name: /save changes/i })
    );
    expect(setAlert).toHaveBeenCalledWith(
      "Error !",
      expect.anything(),
      null
    );
    expect(push).not.toHaveBeenCalled();
  });
});
