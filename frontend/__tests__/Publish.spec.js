import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";

import Publish, {
  getPublishErrorMessage,
  publishSchemaValidator,
  stripSchemaIds,
} from "../components/CuratorElements/Publish";
import AlertContext from "../Context/Alert/alertContext";
import CuratorContext from "../Context/Curator/curatorContext";
import CuratorHelperContext from "../Context/CuratorHelpers/curatorHelperContext";
import LoadingContext from "../Context/Loading/loadingContext";
import ServerContext from "../Context/Servers/serverContext";
import { convertReqSchematoState } from "../Utils/model";
import paperDoc from "./fixtures/paperDoc.json";

jest.mock("axios", () => ({
  post: jest.fn(),
}));

const renderPublish = ({ setAlert = jest.fn() } = {}) => {
  const metadata = convertReqSchematoState(paperDoc);
  const showLoader = jest.fn();
  const hideLoader = jest.fn();
  render(
    <CuratorContext.Provider value={{ metadata }}>
      <CuratorHelperContext.Provider value={{ editing: {} }}>
        <ServerContext.Provider value={{ selectedHttp: null }}>
          <AlertContext.Provider value={{ setAlert }}>
            <LoadingContext.Provider value={{ showLoader, hideLoader }}>
              <Publish />
            </LoadingContext.Provider>
          </AlertContext.Provider>
        </ServerContext.Provider>
      </CuratorHelperContext.Provider>
    </CuratorContext.Provider>
  );
  return { setAlert, showLoader, hideLoader };
};

describe("Publish", () => {
  let consoleError;

  beforeEach(() => {
    axios.post.mockResolvedValue({ data: {} });
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    jest.clearAllMocks();
  });

  it("submits immediately after validation without the stale warning dialog", async () => {
    const user = userEvent.setup();
    const { setAlert, showLoader, hideLoader } = renderPublish();

    await user.click(screen.getByRole("button", { name: /^publish$/i }));

    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
    expect(axios.post.mock.calls[0][0]).toMatch(/\/api\/publish$/);
    expect(showLoader).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(hideLoader).toHaveBeenCalledTimes(1));
    expect(setAlert).not.toHaveBeenCalledWith(
      "Warning",
      expect.anything(),
      null
    );
  });

  it("says the record is published and links to it, with no email step", async () => {
    axios.post.mockResolvedValueOnce({ data: { success: true, id: "abc123" } });
    const user = userEvent.setup();
    const { setAlert } = renderPublish();

    await user.click(screen.getByRole("button", { name: /^publish$/i }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        "Success",
        expect.anything(),
        expect.anything()
      )
    );
    const [, message, buttons] = setAlert.mock.calls[0];
    const { container } = render(message);
    expect(screen.getByText(/your record is published/i)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/email|verif/i);
    render(buttons);
    expect(
      screen.getByRole("link", { name: /view the record/i }).getAttribute("href")
    ).toMatch(/^\/paperdetails\/abc123\?server=/);
  });

  it("saves a draft from beside the publish button", async () => {
    const saveDraftToServer = jest.fn(() => Promise.resolve("draft1"));
    const setAlert = jest.fn();
    const metadata = convertReqSchematoState(paperDoc);
    render(
      <CuratorContext.Provider value={{ metadata, saveDraftToServer, getDraftTitle: () => "My paper" }}>
        <CuratorHelperContext.Provider value={{ editing: {} }}>
          <ServerContext.Provider value={{ selectedHttp: null }}>
            <AlertContext.Provider value={{ setAlert }}>
              <LoadingContext.Provider value={{ showLoader: jest.fn(), hideLoader: jest.fn() }}>
                <Publish />
              </LoadingContext.Provider>
            </AlertContext.Provider>
          </ServerContext.Provider>
        </CuratorHelperContext.Provider>
      </CuratorContext.Provider>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^save draft$/i }));
    expect(saveDraftToServer).toHaveBeenCalledWith("My paper");
    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith("Draft saved", expect.anything(), null)
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  const renderWithDraft = (saveDraftToServer, setAlert = jest.fn()) => {
    const metadata = convertReqSchematoState(paperDoc);
    render(
      <CuratorContext.Provider value={{ metadata, saveDraftToServer, getDraftTitle: () => "My paper" }}>
        <CuratorHelperContext.Provider value={{ editing: {} }}>
          <ServerContext.Provider value={{ selectedHttp: null }}>
            <AlertContext.Provider value={{ setAlert }}>
              <LoadingContext.Provider value={{ showLoader: jest.fn(), hideLoader: jest.fn() }}>
                <Publish />
              </LoadingContext.Provider>
            </AlertContext.Provider>
          </ServerContext.Provider>
        </CuratorHelperContext.Provider>
      </CuratorContext.Provider>
    );
    return setAlert;
  };

  it("saves the draft, then previews the record", async () => {
    axios.post.mockReturnValueOnce(new Promise(() => {}));
    const saveDraftToServer = jest.fn(() => Promise.resolve("draft1"));
    renderWithDraft(saveDraftToServer);
    await userEvent.setup().click(screen.getByRole("button", { name: /save & preview record/i }));
    expect(saveDraftToServer).toHaveBeenCalledWith("My paper");
    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
    expect(axios.post.mock.calls[0][0]).toMatch(/\/api\/preview$/);
  });

  it("does not preview when the draft cannot be saved", async () => {
    const saveDraftToServer = jest.fn(() => Promise.reject(new Error("401")));
    const setAlert = renderWithDraft(saveDraftToServer);
    await userEvent.setup().click(screen.getByRole("button", { name: /save & preview record/i }));
    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith("Save your draft to preview", expect.anything(), null)
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("extracts useful publish errors from current and legacy backend shapes", () => {
    expect(
      getPublishErrorMessage({ response: { data: { msg: "schema failed" } } })
    ).toBe("schema failed");
    expect(
      getPublishErrorMessage({ response: { data: { error: "CSRF failed" } } })
    ).toBe("CSRF failed");
    expect(
      getPublishErrorMessage({ response: { data: "Internal Server Error" } })
    ).toBe("Internal Server Error");
  });
});

describe("the client-side publishing check", () => {
  it("compiles despite the schema's duplicate anchors", () => {
    expect(publishSchemaValidator()).toEqual(expect.any(Function));
  });

  it("accepts typed workflow connections as well as legacy pairs", () => {
    const check = publishSchemaValidator();
    const doc = JSON.parse(JSON.stringify(paperDoc));
    doc.workflow = {
      nodes: (doc.workflow && doc.workflow.nodes) || [],
      edges: [["s0", "c0"], { from: "c16", to: "d7", type: "links_to" }],
    };
    expect(check(doc)).toBe(true);
    doc.workflow.edges = [{ to: "c0" }];
    expect(check(doc)).toBe(false);
  });

  it("lets a record with nothing filled in publish", () => {
    // Exactly what an untouched curator form sends, for any work type.
    const blank = {
      PIs: [], charts: [], datasets: [], scripts: [], tools: [],
      collections: [], tags: [], schema: "x", license: "cc_by",
      info: { ProjectName: "", insertedBy: {} },
      reference: { journal: { fullName: "" }, year: null, authors: [] },
      workflow: { nodes: [], edges: [] },
    };
    const check = publishSchemaValidator();
    ["paper", "report", "software", "dataset", "other"].forEach((workType) => {
      expect(check({ ...blank, work_type: workType })).toBe(true);
    });
    // A tool with no version, a figure with only its id.
    expect(check({ ...blank, tools: [{ id: "t0", kind: "software", packageName: "numpy" }], charts: [{ id: "c0" }] })).toBe(true);
    // Structure still counts.
    expect(check({ ...blank, charts: [{ imageFile: "a.png" }] })).toBe(false);
  });

  it("publishes what is typed in sections that are still open", async () => {
    const user = userEvent.setup();
    const metadata = convertReqSchematoState(paperDoc);
    const typed = { ...metadata, referenceInfo: { ...metadata.referenceInfo, title: "Typed, not saved" } };
    render(
      <CuratorContext.Provider value={{ metadata, collectDraftState: () => typed }}>
        <CuratorHelperContext.Provider value={{ editing: { referenceInfo: true, curatorInfo: true } }}>
          <ServerContext.Provider value={{ selectedHttp: null }}>
            <AlertContext.Provider value={{ setAlert: jest.fn() }}>
              <LoadingContext.Provider value={{ showLoader: jest.fn(), hideLoader: jest.fn() }}>
                <Publish />
              </LoadingContext.Provider>
            </AlertContext.Provider>
          </ServerContext.Provider>
        </CuratorHelperContext.Provider>
      </CuratorContext.Provider>
    );
    axios.post.mockResolvedValue({ data: {} });
    await user.click(screen.getByRole("button", { name: /^publish$/i }));
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    expect(axios.post.mock.calls[0][1].reference.title).toBe("Typed, not saved");
  });

  it("strips only anchors, never a property named id", () => {
    expect(
      stripSchemaIds({ $id: "#/a", properties: { id: { type: "string", $id: "#/b" } } })
    ).toEqual({ properties: { id: { type: "string" } } });
  });
});
