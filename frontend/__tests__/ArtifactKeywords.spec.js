import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DatasetsInfoForm from "../components/CuratorForms/DatasetsInfoForm";
import ScriptsInfoForm from "../components/CuratorForms/ScriptsInfoForm";
import CuratorContext from "../Context/Curator/curatorContext";
import CuratorHelperContext from "../Context/CuratorHelpers/curatorHelperContext";
import SourceTreeContext from "../Context/SourceTree/SourceTreeContext";

// A dataset's and a script's "Keywords" input used to write to `URLs`, so a
// curator's keywords were stored as links. Keywords is a real field now and
// URLs is gone from the UI entirely -- but it is still a storage key, and a
// record that has one keeps it. It is never read as, shown as, or converted
// into keywords.

const FORMS = [
  ["dataset", DatasetsInfoForm, "datasets"],
  ["script", ScriptsInfoForm, "scripts"],
];

const renderForm = (kind, Form, section, { item = null, items = [] } = {}) => {
  const add = jest.fn();
  const edit = jest.fn();
  render(
    <CuratorContext.Provider
      value={{ [section]: items, add, edit, fileServerPath: "" }}
    >
      <CuratorHelperContext.Provider
        value={{
          [`${section}Helper`]: { def: item, open: true },
          openForm: jest.fn(),
          closeForm: jest.fn(),
          setDefault: jest.fn(),
        }}
      >
        <SourceTreeContext.Provider
          value={{
            setSaveMethod: jest.fn(),
            openSelector: jest.fn(),
            HideSelector: jest.fn(),
          }}
        >
          <Form />
        </SourceTreeContext.Provider>
      </CuratorHelperContext.Provider>
    </CuratorContext.Provider>
  );
  return { add, edit };
};

const field = (pattern) => screen.getByPlaceholderText(pattern);
const files = () => field(/enter files for the/i);
const description = () => field(/enter descriptions? for/i);
const keywords = () => field(/enter keywords for the/i);

describe.each(FORMS)("%s form", (kind, Form, section) => {
  beforeEach(() => jest.clearAllMocks());

  it("offers Files, Description and Keywords -- and no URL input", () => {
    renderForm(kind, Form, section);

    expect(files()).toBeInTheDocument();
    expect(description()).toBeInTheDocument();
    expect(keywords()).toHaveAttribute("name", "keywords");
    // The URL input is gone from the UI.
    expect(screen.queryByPlaceholderText(/enter urls/i)).toBeNull();
    expect(screen.queryByLabelText(/^urls$/i)).toBeNull();
  });

  it("stores keywords in the keywords list", async () => {
    const user = userEvent.setup();
    const { add } = renderForm(kind, Form, section);

    await user.type(files(), "data/a.xyz, data/b.xyz");
    await user.type(description(), "Relaxed geometries");
    await user.type(keywords(), "density functional theory, silicon");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    const [, values] = add.mock.calls[0];
    expect(values.keywords).toEqual([
      "density functional theory",
      "silicon",
    ]);
    expect(values.readme).toBe("Relaxed geometries");
    // A new record does not invent an empty legacy field.
    expect(values.URLs).toBeUndefined();
  });

  it("keeps a legacy URLs list through an edit, and never shows it",
     async () => {
    const user = userEvent.setup();
    const legacy = {
      id: "x1",
      files: ["data/a.xyz"],
      readme: "Relaxed geometries",
      URLs: ["https://example.org/a"],
      extraFields: [],
    };
    const { edit } = renderForm(kind, Form, section, {
      item: legacy,
      items: [legacy],
    });

    // The links are nowhere on screen, and they did NOT become keywords.
    expect(screen.queryByDisplayValue(/example\.org/i)).toBeNull();
    expect(keywords()).toHaveValue("");

    await user.type(keywords(), "silicon");
    await user.click(screen.getByRole("button", { name: /^update$/i }));

    await waitFor(() => expect(edit).toHaveBeenCalledTimes(1));
    const [, values] = edit.mock.calls[0];
    expect(values.URLs).toEqual(["https://example.org/a"]);
    expect(values.keywords).toEqual(["silicon"]);
  });

  it("round-trips keywords on an existing record", async () => {
    const user = userEvent.setup();
    const item = {
      id: "x1",
      files: ["data/a.xyz"],
      readme: "Relaxed geometries",
      keywords: ["silicon", "band gap"],
      extraFields: [],
    };
    const { edit } = renderForm(kind, Form, section, { item, items: [item] });

    expect(keywords()).toHaveValue("silicon, band gap");

    await user.click(screen.getByRole("button", { name: /^update$/i }));

    await waitFor(() => expect(edit).toHaveBeenCalledTimes(1));
    expect(edit.mock.calls[0][1].keywords).toEqual(["silicon", "band gap"]);
  });

  it("saves with only Keywords filled in -- nothing is required", async () => {
    const user = userEvent.setup();
    const { add } = renderForm(kind, Form, section);

    await user.type(keywords(), "silicon");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(add.mock.calls[0][1].files).toEqual([]);
    expect(add.mock.calls[0][1].keywords).toEqual(["silicon"]);
    expect(screen.queryByText(/^required$/i)).not.toBeInTheDocument();
  });

  it("saves with Keywords left empty", async () => {
    const user = userEvent.setup();
    const { add } = renderForm(kind, Form, section);

    await user.type(files(), "data/a.xyz");
    await user.type(description(), "Relaxed geometries");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(add.mock.calls[0][1].keywords).toEqual([]);
  });
});
