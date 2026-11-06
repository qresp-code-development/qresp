import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("../Utils/Scraper", () => ({ getList: jest.fn() }));
import { getList } from "../Utils/Scraper";

import FileServerInfoForm from "../components/CuratorForms/FileServerInfoForm";
import FileServerElement from "../components/CuratorElements/FileServerElement";
import ServerContext from "../Context/Servers/serverContext";
import AlertContext from "../Context/Alert/alertContext";
import SourceTreeContext from "../Context/SourceTree/SourceTreeContext";
import LoadingContext from "../Context/Loading/loadingContext";
import CuratorContext from "../Context/Curator/curatorContext";
import CuratorHelperContext from "../Context/CuratorHelpers/curatorHelperContext";
import sourceTreeReducer, {
  DEFAULT_CONFIRM_LABEL,
} from "../Context/SourceTree/SourceTreeReducer";
import { SET_SAVE_BUTTON_ACTION, SET_CONFIRM_LABEL } from "../Context/types";

const ROOT = "https://notebook.rcc.uchicago.edu/files";
const FOLDER = `${ROOT}/10.1021.acs.jpcc.5c01077`;

const renderForm = (curator = {}, tree = {}) => {
  const setFileServerPath = jest.fn();
  const editor = jest.fn();
  const setSaveMethod = jest.fn();
  const openSelector = jest.fn();
  const setConfirmLabel = jest.fn();
  const setAlert = jest.fn();
  render(
    <ServerContext.Provider
      value={{
        httpServers: [{ label: "RCC", value: ROOT }],
        setSelectedHttp: jest.fn(),
      }}
    >
      <AlertContext.Provider value={{ setAlert }}>
        <SourceTreeContext.Provider
          value={{
            setTree: jest.fn(),
            openSelector,
            setSaveMethod,
            setConfirmLabel,
            ...tree,
          }}
        >
          <LoadingContext.Provider
            value={{ showLoader: jest.fn(), hideLoader: jest.fn() }}
          >
            <CuratorContext.Provider
              value={{ fileServerPath: "", setFileServerPath, ...curator }}
            >
              <FileServerInfoForm editor={editor} />
            </CuratorContext.Provider>
          </LoadingContext.Provider>
        </SourceTreeContext.Provider>
      </AlertContext.Provider>
    </ServerContext.Provider>
  );
  return { setFileServerPath, editor, setSaveMethod, openSelector, setAlert };
};

const chooseRoot = async (user) => {
  await user.click(screen.getByRole("combobox"));
  await user.click(await screen.findByRole("option", { name: /rcc/i }));
};

// Runs a real Search and hands back the callback the file tree would invoke
// when the curator confirms a folder.
const searchAndGetPicker = async (user, handles) => {
  await chooseRoot(user);
  await user.click(screen.getByRole("button", { name: /^search$/i }));
  await waitFor(() => expect(handles.openSelector).toHaveBeenCalled());
  return handles.setSaveMethod.mock.calls[0][0];
};

describe("FileServerInfoForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getList.mockResolvedValue({
      files: [{ label: "folder", value: FOLDER }],
      details: {},
    });
  });

  it("registers the default File Server radio value without crashing", () => {
    renderForm();

    expect(screen.getByRole("radio", { name: /file server/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /zenodo/i })).not.toBeChecked();
  });

  it("updates the connection type radio through RHF control", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("radio", { name: /zenodo/i }));

    expect(screen.getByRole("radio", { name: /zenodo/i })).toBeChecked();
    expect(
      screen.getByPlaceholderText(/enter zenodo record url/i)
    ).toBeInTheDocument();
  });

  it("picking a folder records the choice WITHOUT saving or closing", async () => {
    const user = userEvent.setup();
    const handles = renderForm();
    const pick = await searchAndGetPicker(user, handles);

    pick(FOLDER);

    // The whole point of the repair: no commit, no section close.
    await waitFor(() =>
      expect(screen.getByTestId("selected-folder")).toHaveTextContent(FOLDER)
    );
    expect(handles.setFileServerPath).not.toHaveBeenCalled();
    expect(handles.editor).not.toHaveBeenCalled();
    // The form is still on screen and offers the explicit save step.
    expect(
      screen.getByRole("button", { name: /^search$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save file server/i })
    ).toBeEnabled();
  });

  it("shows nothing selected before a folder is picked, and cannot save", () => {
    renderForm();
    expect(screen.getByTestId("selected-folder")).toHaveTextContent(
      /none yet/i
    );
    expect(
      screen.getByRole("button", { name: /save file server/i })
    ).toBeDisabled();
    expect(
      screen.getByText(/search above, then pick and save one folder/i)
    ).toBeInTheDocument();
  });

  it("keeps the full URL readable in a compact preview, not inline prose", () => {
    renderForm({ fileServerPath: FOLDER });
    const preview = screen.getByTestId("selected-folder");
    // The exact URL is preserved verbatim as selectable text...
    expect(preview).toHaveTextContent(FOLDER);
    expect(preview.textContent).toBe(FOLDER);
    // ...and it is the ONLY thing in that area — no explanatory sentence.
    expect(preview.textContent).not.toMatch(/analyze|save|search/i);
  });

  it("keeps folder saving separate from artifact imports", () => {
    renderForm({ fileServerPath: FOLDER });
    const save = screen.getByRole("button", { name: /save file server/i });
    const row = screen.getByTestId("fileserver-actions");
    expect(row).toContainElement(save);
    expect(
      screen.queryByRole("button", { name: /analyze rcc folder/i })
    ).toBeNull();
    const caption = screen.getByText(/use the rcc import button/i);
    expect(row).not.toContainElement(caption);
    expect(caption).toHaveClass("MuiTypography-caption");
  });

  it("does not offer artifact import for an unsaved selection", async () => {
    const user = userEvent.setup();
    const handles = renderForm();
    const pick = await searchAndGetPicker(user, handles);

    pick(FOLDER);
    await waitFor(() =>
      expect(screen.getByTestId("selected-folder")).toHaveTextContent(FOLDER)
    );
    expect(screen.queryByText(/import charts from rcc/i)).toBeNull();
    expect(handles.setFileServerPath).not.toHaveBeenCalled();
    expect(handles.editor).not.toHaveBeenCalled();
  });

  it("Save File Server is the only action that commits and exits", async () => {
    const user = userEvent.setup();
    const handles = renderForm();
    const pick = await searchAndGetPicker(user, handles);
    pick(FOLDER);
    await waitFor(() =>
      expect(screen.getByTestId("selected-folder")).toHaveTextContent(FOLDER)
    );

    await user.click(screen.getByRole("button", { name: /save file server/i }));

    expect(handles.setFileServerPath).toHaveBeenCalledWith(FOLDER);
    expect(handles.editor).toHaveBeenCalled();
  });

  it("seeds the selection from an already saved path so editing is not empty", () => {
    renderForm({ fileServerPath: FOLDER });
    expect(screen.getByTestId("selected-folder")).toHaveTextContent(FOLDER);
    expect(
      screen.getByRole("button", { name: /save file server/i })
    ).toBeEnabled();
  });

  it("a failed search never erases the saved path or the selection", async () => {
    const user = userEvent.setup();
    getList.mockRejectedValue(new Error("unreachable"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    const handles = renderForm({ fileServerPath: FOLDER });

    await user.click(screen.getByRole("button", { name: /^search$/i }));
    await waitFor(() => expect(handles.setAlert).toHaveBeenCalled());

    expect(screen.getByTestId("selected-folder")).toHaveTextContent(FOLDER);
    expect(handles.setFileServerPath).not.toHaveBeenCalled();
    console.error.mockRestore();
  });

  it("starting a new search does not clear the current selection", async () => {
    const user = userEvent.setup();
    const handles = renderForm({ fileServerPath: FOLDER });

    await user.click(screen.getByRole("button", { name: /^search$/i }));
    await waitFor(() => expect(handles.openSelector).toHaveBeenCalled());

    expect(screen.getByTestId("selected-folder")).toHaveTextContent(FOLDER);
    expect(handles.setFileServerPath).not.toHaveBeenCalled();
  });

  it("renames the file tree confirmation for the file-server picker only", async () => {
    const user = userEvent.setup();
    const setConfirmLabel = jest.fn();
    const handles = renderForm({}, { setConfirmLabel });
    await searchAndGetPicker(user, handles);
    // Short: "Use Folder" wrapped onto two lines beside Cancel.
    expect(setConfirmLabel).toHaveBeenCalledWith("Use");
  });

  it("asks the shared picker for ONE folder, whoever used it last", async () => {
    // The selector is shared, and the chart/dataset/script/tool pickers leave
    // it in multi-select mode. Inheriting that hid the current-selection line
    // and let several folders be ticked into one comma-joined path.
    const user = userEvent.setup();
    const setMultiple = jest.fn();
    const handles = renderForm({}, { setMultiple });
    await searchAndGetPicker(user, handles);

    expect(setMultiple).toHaveBeenCalledWith(false);
  });
});

describe("file tree confirmation label", () => {
  it("defaults to Save and never leaks between selector consumers", () => {
    // The chart/dataset/script/tool/notebook pickers do not opt in, so
    // setting their save method must restore the default wording.
    const initial = { save: null, confirmLabel: DEFAULT_CONFIRM_LABEL };
    expect(DEFAULT_CONFIRM_LABEL).toBe("Save");

    const forFileServer = sourceTreeReducer(
      sourceTreeReducer(initial, {
        type: SET_SAVE_BUTTON_ACTION,
        payload: jest.fn(),
      }),
      { type: SET_CONFIRM_LABEL, payload: "Use Folder" }
    );
    expect(forFileServer.confirmLabel).toBe("Use Folder");

    const forChart = sourceTreeReducer(forFileServer, {
      type: SET_SAVE_BUTTON_ACTION,
      payload: jest.fn(),
    });
    expect(forChart.confirmLabel).toBe("Save");
  });
});

describe("File Server display card", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderElement = (fileServerPath) =>
    render(
      <AlertContext.Provider value={{ setAlert: jest.fn() }}>
        <CuratorContext.Provider
          value={{ fileServerPath, addMany: jest.fn() }}
        >
          <CuratorHelperContext.Provider
            value={{
              editing: { fileServerPathInfo: false },
              setEditing: jest.fn(),
            }}
          >
            <FileServerElement />
          </CuratorHelperContext.Provider>
        </CuratorContext.Provider>
      </AlertContext.Provider>
    );

  it("shows only the saved path and edit action", async () => {
    renderElement(FOLDER);
    expect(
      screen.queryByRole("button", { name: /analyze rcc folder/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /save file server/i })
    ).toBeNull();
    expect(await screen.findByText(FOLDER)).toBeInTheDocument();
  });
});

// Code on GitHub or GitLab has no folder; the empty section must not count as
// unsaved, or publishing is refused with "File Server Information".
describe("the file server section for a code repository", () => {
  const renderCode = (codeHost) => {
    const setEditing = jest.fn();
    render(
      <AlertContext.Provider value={{ setAlert: jest.fn() }}>
        <CuratorContext.Provider
          value={{ fileServerPath: "", workType: "software", codeHost, addMany: jest.fn() }}
        >
          <CuratorHelperContext.Provider
            value={{ editing: { fileServerPathInfo: false }, setEditing }}
          >
            <FileServerElement />
          </CuratorHelperContext.Provider>
        </CuratorContext.Provider>
      </AlertContext.Provider>
    );
    return setEditing;
  };

  it("is finished, not unsaved, when the code is on GitHub or GitLab", () => {
    const setEditing = renderCode("repository");
    expect(setEditing).toHaveBeenLastCalledWith("fileServerPathInfo", false);
    expect(screen.getByTestId("fileserver-not-needed")).toHaveTextContent(/not needed/i);
  });

  it("suggests a folder, without requiring one, when the code is on the file server", () => {
    const setEditing = renderCode("fileserver");
    expect(setEditing).toHaveBeenLastCalledWith("fileServerPathInfo", false);
    expect(screen.getByTestId("fileserver-not-needed")).toHaveTextContent(/optional/i);
  });

  it("never blocks publishing for any kind of record", () => {
    for (const workType of ["paper", "report", "dataset", "other"]) {
      const setEditing = jest.fn();
      const { unmount } = render(
        <AlertContext.Provider value={{ setAlert: jest.fn() }}>
          <CuratorContext.Provider value={{ fileServerPath: "", workType, addMany: jest.fn() }}>
            <CuratorHelperContext.Provider value={{ editing: { fileServerPathInfo: false }, setEditing }}>
              <FileServerElement />
            </CuratorHelperContext.Provider>
          </CuratorContext.Provider>
        </AlertContext.Provider>
      );
      expect(setEditing).toHaveBeenLastCalledWith("fileServerPathInfo", false);
      unmount();
    }
  });
});

// Every chart, dataset, script and tool path is stored RELATIVE to the file
// server folder. Changing the folder re-points all of them at once, which
// shows up much later as "the images stopped working".
describe("changing the file server folder with charts already added", () => {
  const OTHER = `${ROOT}/10.1021.acs.nanolett.7b00283`;

  beforeEach(() => {
    jest.clearAllMocks();
    getList.mockResolvedValue({
      files: [{ label: "folder", value: OTHER }],
      details: {},
    });
  });

  const pickOther = async (user, handles) => {
    const pick = await searchAndGetPicker(user, handles);
    pick(OTHER);
    await waitFor(() =>
      expect(screen.getByTestId("selected-folder")).toHaveTextContent(OTHER)
    );
  };

  it("asks first, and commits nothing until the curator agrees", async () => {
    const user = userEvent.setup();
    const handles = renderForm({
      fileServerPath: FOLDER,
      charts: [{ id: "c0", imageFile: "figures/f1.png" }],
    });
    await pickOther(user, handles);

    await user.click(screen.getByRole("button", { name: /save file server/i }));

    expect(
      await screen.findByRole("heading", {
        name: /change the paper.s file server folder/i,
      })
    ).toBeInTheDocument();
    expect(handles.setFileServerPath).not.toHaveBeenCalled();
    expect(handles.editor).not.toHaveBeenCalled();
  });

  it("explains what happens to the existing relative paths", async () => {
    const user = userEvent.setup();
    const handles = renderForm({
      fileServerPath: FOLDER,
      charts: [{ id: "c0", imageFile: "figures/f1.png" }],
    });
    await pickOther(user, handles);
    await user.click(screen.getByRole("button", { name: /save file server/i }));
    await screen.findByRole("heading", { name: /file server folder/i });

    const text = document.body.textContent;
    expect(text).toMatch(/relative to the file server folder/i);
    expect(text).toMatch(/nothing is rewritten for you/i);
    expect(text).toMatch(/type-specific rcc import buttons/i);
    // Both roots are shown so the change is legible.
    const paths = screen.getByTestId("root-change-paths");
    expect(paths).toHaveTextContent(FOLDER);
    expect(paths).toHaveTextContent(OTHER);
  });

  it("keeps the current folder when the curator declines", async () => {
    const user = userEvent.setup();
    const handles = renderForm({
      fileServerPath: FOLDER,
      charts: [{ id: "c0", imageFile: "figures/f1.png" }],
    });
    await pickOther(user, handles);
    await user.click(screen.getByRole("button", { name: /save file server/i }));
    await user.click(
      await screen.findByRole("button", { name: /keep the current folder/i })
    );

    expect(handles.setFileServerPath).not.toHaveBeenCalled();
    expect(handles.editor).not.toHaveBeenCalled();
  });

  it("commits on confirmation, without touching any stored path", async () => {
    const user = userEvent.setup();
    const charts = [{ id: "c0", imageFile: "figures/f1.png" }];
    const handles = renderForm({ fileServerPath: FOLDER, charts });
    await pickOther(user, handles);
    await user.click(screen.getByRole("button", { name: /save file server/i }));
    await user.click(
      await screen.findByRole("button", { name: /change it anyway/i })
    );

    expect(handles.setFileServerPath).toHaveBeenCalledWith(OTHER);
    expect(handles.editor).toHaveBeenCalled();
    // The existing chart is left exactly as it was.
    expect(charts[0].imageFile).toBe("figures/f1.png");
  });

  it("does not ask when there is nothing to re-point", async () => {
    const user = userEvent.setup();
    const handles = renderForm({ fileServerPath: FOLDER, charts: [] });
    await pickOther(user, handles);

    await user.click(screen.getByRole("button", { name: /save file server/i }));

    await waitFor(() =>
      expect(handles.setFileServerPath).toHaveBeenCalledWith(OTHER)
    );
    expect(
      screen.queryByRole("heading", { name: /file server folder\?/i })
    ).toBeNull();
  });
});
