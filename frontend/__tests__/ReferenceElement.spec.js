import { render, screen, waitFor } from "@testing-library/react";

import ReferenceInfoElement from "../components/CuratorElements/ReferenceElement";
import CuratorContext from "../Context/Curator/curatorContext";
import CuratorHelperContext from "../Context/CuratorHelpers/curatorHelperContext";

jest.mock("../components/CuratorForms/ReferenceInfoForm", () => () => (
  <div data-testid="reference-form">form</div>
));
jest.mock("../components/Paper/ReferenceC", () => () => (
  <div data-testid="reference-display">display</div>
));
jest.mock("../components/switchFade", () => ({ editing, form, display }) =>
  editing ? form : display
);

const renderElement = ({ referenceInfo, editing }) => {
  const setEditing = jest.fn();
  const view = (nextReference, nextEditing) => (
    <CuratorContext.Provider value={{ referenceInfo: nextReference }}>
      <CuratorHelperContext.Provider
        value={{ editing: { referenceInfo: nextEditing }, setEditing }}
      >
        <ReferenceInfoElement />
      </CuratorHelperContext.Provider>
    </CuratorContext.Provider>
  );
  const result = render(view(referenceInfo, editing));
  return { ...result, setEditing, view };
};

describe("ReferenceInfoElement", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("opens a blank new bibliography for editing", async () => {
    const { setEditing } = renderElement({
      referenceInfo: { title: "" },
      editing: false,
    });

    await waitFor(() =>
      expect(setEditing).toHaveBeenCalledWith("referenceInfo", true)
    );
  });

  it("does not close an open form when an import fills its title", async () => {
    const { rerender, setEditing, view } = renderElement({
      referenceInfo: { title: "" },
      editing: true,
    });

    rerender(view({ title: "Imported title" }, true));

    await waitFor(() =>
      expect(screen.getByTestId("reference-form")).toBeInTheDocument()
    );
    expect(setEditing).not.toHaveBeenCalledWith("referenceInfo", false);
    expect(screen.queryByTestId("reference-display")).not.toBeInTheDocument();
  });

  it("keeps an already saved bibliography in its display state", () => {
    const { setEditing } = renderElement({
      referenceInfo: { title: "Saved title" },
      editing: false,
    });

    expect(screen.getByTestId("reference-display")).toBeInTheDocument();
    expect(setEditing).not.toHaveBeenCalled();
  });

  it("stays saved when the page comes back from the preview", async () => {
    const saved = { title: "Saved title", doi: "10.1/x" };
    // Shown as saved once: remembered.
    const first = renderElement({ referenceInfo: saved, editing: false });
    first.unmount();

    // Back from the preview: the page mounts blank, then the draft arrives.
    const { rerender, setEditing, view } = renderElement({
      referenceInfo: { title: "" },
      editing: false,
    });
    await waitFor(() => expect(setEditing).toHaveBeenCalledWith("referenceInfo", true));
    rerender(view({ ...saved }, true));
    await waitFor(() => expect(setEditing).toHaveBeenLastCalledWith("referenceInfo", false));
  });

  it("asks for a save when what arrives is not what was saved", async () => {
    renderElement({ referenceInfo: { title: "Saved title" }, editing: false }).unmount();
    const { rerender, setEditing, view } = renderElement({
      referenceInfo: { title: "" },
      editing: false,
    });
    await waitFor(() => expect(setEditing).toHaveBeenCalledWith("referenceInfo", true));
    rerender(view({ title: "A different title" }, true));
    expect(setEditing).not.toHaveBeenCalledWith("referenceInfo", false);
  });

  it("leaves the form open when the curator presses Edit on a saved section", () => {
    const { rerender, setEditing, view } = renderElement({
      referenceInfo: { title: "Saved title" },
      editing: false,
    });
    rerender(view({ title: "Saved title" }, true));
    expect(setEditing).not.toHaveBeenCalledWith("referenceInfo", false);
    expect(screen.getByTestId("reference-form")).toBeInTheDocument();
  });
});
