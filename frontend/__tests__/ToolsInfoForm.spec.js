import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ToolsInfoForm from "../components/CuratorForms/ToolsInfoForm";
import CuratorContext from "../Context/Curator/curatorContext";
import CuratorHelperContext from "../Context/CuratorHelpers/curatorHelperContext";
import SourceTreeContext from "../Context/SourceTree/SourceTreeContext";

// Regression: RHF v7 does not register visually prefilled values. The Tools
// dialog preselects "Software" via RadioGroup defaultValue only, so saving
// with package name + version still failed with kind "Required"; editing a
// tool failed the same way for its untouched prefilled text fields.
const renderForm = ({ def = null, tools = [] } = {}) => {
  const add = jest.fn();
  const edit = jest.fn();
  const closeForm = jest.fn();
  render(
    <CuratorContext.Provider value={{ tools, add, edit }}>
      <CuratorHelperContext.Provider
        value={{
          toolsHelper: { def, open: true },
          openForm: jest.fn(),
          closeForm,
          setDefault: jest.fn(),
        }}
      >
        <SourceTreeContext.Provider
          value={{
            setSaveMethod: jest.fn(),
            openSelector: jest.fn(),
            setMultiple: jest.fn(),
          }}
        >
          <ToolsInfoForm />
        </SourceTreeContext.Provider>
      </CuratorHelperContext.Provider>
    </CuratorContext.Provider>
  );
  return { add, edit, closeForm };
};

describe("ToolsInfoForm", () => {
  it("saves a new software tool without touching the preselected Type radio", async () => {
    const { add, closeForm } = renderForm();
    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText(/enter name of the software package/i),
      "WEST"
    );
    await user.type(
      screen.getByPlaceholderText(/enter version of the software package/i),
      "3.1.6"
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(add).toHaveBeenCalled());
    expect(add).toHaveBeenCalledWith(
      "tool",
      expect.objectContaining({
        kind: "software",
        packageName: "WEST",
        version: "3.1.6",
      })
    );
    expect(closeForm).toHaveBeenCalledWith("tool");
    expect(screen.queryAllByText("Required")).toHaveLength(0);
  });

  it("updates an existing tool without retyping its prefilled fields", async () => {
    const def = {
      id: "t0",
      kind: "software",
      packageName: "WEST",
      version: "3.1.6",
      executableName: "wstat.x",
      patches: ["p1.patch"],
      description: "",
      extraFields: [{ extrakey: "", extravalue: "" }],
    };
    const { edit } = renderForm({ def, tools: [def] });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^update$/i }));
    await waitFor(() => expect(edit).toHaveBeenCalled());
    expect(edit).toHaveBeenCalledWith(
      "tool",
      expect.objectContaining({
        kind: "software",
        packageName: "WEST",
        version: "3.1.6",
        patches: ["p1.patch"],
        extraFields: [],
      })
    );
  });

  it("switches to Experiment and saves its fields", async () => {
    const { add } = renderForm();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Experiment"));
    await user.type(
      await screen.findByPlaceholderText(/enter name of the facility/i),
      "Argonne"
    );
    await user.type(
      screen.getByPlaceholderText(/enter type of measurement/i),
      "XPS"
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(add).toHaveBeenCalled());
    expect(add).toHaveBeenCalledWith(
      "tool",
      expect.objectContaining({
        kind: "experiment",
        facilityName: "Argonne",
        measurement: "XPS",
      })
    );
  });
});
