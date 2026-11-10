import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import FileTree from "../components/FileTree";
import SourceTreeContext from "../Context/SourceTree/SourceTreeContext";
import CuratorContext from "../Context/Curator/curatorContext";

// The folder picker used by every curator form. It is a PICKER: confirming
// hands one path back to whichever form opened it and closes the picker —
// nothing is saved, published, or committed here.
//
// It also has to stay usable. The actions used to live inside DialogTitle,
// whose height changed with the selection, so ticking a folder resized the
// dialog and could push the only way to confirm out of a container that
// cannot scroll. These tests pin the structure that prevents that: a fixed
// header, ONE scrolling region, and a fixed footer that always holds the
// actions.

const ROOT = "https://notebook.rcc.uchicago.edu/files/10.1021.acs.jpcc.5c01077";
const FIGURES = "/10.1021.acs.jpcc.5c01077/figures_tables";
const DATA = "/10.1021.acs.jpcc.5c01077/data_with_a_very_long_unbroken_name";

const TREE = [
  {
    label: "figures_tables",
    value: FIGURES,
    children: [
      {
        label: "figure_S1",
        value: `${FIGURES}/figure_S1`,
        children: [],
      },
    ],
  },
  { label: "data_with_a_very_long_unbroken_name", value: DATA, children: [] },
  { label: "scripts", value: "/10.1021.acs.jpcc.5c01077/scripts" },
];

const Harness = ({ save, closeSelector, multiple = false, confirmLabel = "Use" }) => {
  const [checked, setChecked] = useState([]);
  return (
    <CuratorContext.Provider value={{ fileServerPath: ROOT }}>
      <SourceTreeContext.Provider
        value={{
          selectorOpen: true,
          showSelector: true,
          tree: TREE,
          checked,
          setChecked,
          title: "Please select the source directory on the server",
          multiple,
          save,
          confirmLabel,
          closeSelector,
          setChildren: jest.fn(),
        }}
      >
        <FileTree />
      </SourceTreeContext.Provider>
    </CuratorContext.Provider>
  );
};

const renderTree = (props = {}) => {
  const save = jest.fn();
  const closeSelector = jest.fn();
  render(<Harness save={save} closeSelector={closeSelector} {...props} />);
  return { save, closeSelector };
};

const confirmButton = (label = /^use$/i) =>
  screen.getByRole("button", { name: label });

const cancelButton = () => screen.getByRole("button", { name: /^cancel$/i });

// react-checkbox-tree renders a native checkbox per node, labelled by the
// node's own name.
const folderCheckbox = (name) => {
  const label = screen
    .getAllByText(name, { selector: ".rct-label, .rct-title" })
    .map((node) => node.closest("label"))
    .find(Boolean);
  return within(label).getByRole("checkbox", { hidden: true });
};

describe("FileTree picker", () => {
  it("shows the confirmation up front, disabled until something is picked",
     () => {
    renderTree();

    const use = confirmButton();
    expect(use).toBeInTheDocument();
    expect(use).toBeVisible();
    expect(use).toBeDisabled();
    // Exactly the label the opening form asked for, on one line.
    expect(use).toHaveTextContent(/^Use$/);
    expect(use).toHaveStyle("white-space: nowrap");
    // Never a submit: the picker must not post a form it happens to sit in.
    expect(use).toHaveAttribute("type", "button");
    expect(cancelButton()).toHaveAttribute("type", "button");
  });

  it("enables the confirmation once a folder is picked, and keeps it on screen",
     async () => {
    const user = userEvent.setup();
    renderTree();

    await user.click(folderCheckbox("figures_tables"));

    const use = confirmButton();
    expect(use).toBeEnabled();
    expect(use).toBeVisible();
    // Still in the fixed footer, not somewhere inside the scrolling tree.
    expect(screen.getByTestId("filetree-actions")).toContainElement(use);
  });

  it("keeps the dialog's structure identical before and after a selection",
     async () => {
    const user = userEvent.setup();
    renderTree();

    const heading = screen.getByRole("heading", {
      name: /please select the source directory/i,
    });
    const before = {
      title: heading.textContent,
      selectionLines: screen.getByTestId("filetree-selection").textContent
        .split("\n").length,
      actions: screen.getByTestId("filetree-actions").childElementCount,
    };

    await user.click(folderCheckbox("figures_tables"));

    // The heading does not swap to another sentence, the selection stays one
    // line, and the footer keeps the same controls: nothing in the fixed
    // areas can change height, so the tree cannot move under the pointer.
    expect(heading.textContent).toBe(before.title);
    expect(
      screen.getByTestId("filetree-selection").textContent.split("\n").length
    ).toBe(before.selectionLines);
    expect(screen.getByTestId("filetree-actions").childElementCount).toBe(
      before.actions
    );
    // The picked path is readable at the top the whole time.
    expect(screen.getByTestId("filetree-selection")).toHaveTextContent(FIGURES);
  });

  it("shows the current selection before anything is picked", () => {
    renderTree();
    expect(screen.getByTestId("filetree-selection")).toHaveTextContent(
      /nothing currently selected/i
    );
  });

  it("hands the picked folder back exactly once, then closes", async () => {
    const user = userEvent.setup();
    const { save, closeSelector } = renderTree();

    await user.click(folderCheckbox("figures_tables"));
    await user.click(confirmButton());

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(FIGURES);
    expect(closeSelector).toHaveBeenCalledTimes(1);
  });

  it("confirming commits nothing itself — it only calls the picker callback",
     async () => {
    const user = userEvent.setup();
    const setFileServerPath = jest.fn();
    const save = jest.fn();
    const closeSelector = jest.fn();
    render(
      <CuratorContext.Provider
        value={{ fileServerPath: ROOT, setFileServerPath }}
      >
        <SourceTreeContext.Provider
          value={{
            selectorOpen: true, showSelector: true, tree: TREE,
            checked: [FIGURES], setChecked: jest.fn(),
            title: "Please select the source directory on the server",
            multiple: false, save, confirmLabel: "Use", closeSelector,
            setChildren: jest.fn(),
          }}
        >
          <FileTree />
        </SourceTreeContext.Provider>
      </CuratorContext.Provider>
    );

    await user.click(confirmButton());

    expect(save).toHaveBeenCalledWith(FIGURES);
    // Saving the File Server path is a separate, explicit action elsewhere.
    expect(setFileServerPath).not.toHaveBeenCalled();
  });

  it("cancel commits nothing", async () => {
    const user = userEvent.setup();
    const { save, closeSelector } = renderTree();

    await user.click(folderCheckbox("figures_tables"));
    await user.click(cancelButton());

    expect(save).not.toHaveBeenCalled();
    expect(closeSelector).toHaveBeenCalledTimes(1);
  });

  it("disables the confirmation again when the folder is unpicked", async () => {
    const user = userEvent.setup();
    renderTree();

    await user.click(folderCheckbox("figures_tables"));
    expect(confirmButton()).toBeEnabled();

    await user.click(folderCheckbox("figures_tables"));
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByTestId("filetree-selection")).toHaveTextContent(
      /nothing currently selected/i
    );
  });

  it("replaces the previous folder when another one is picked", async () => {
    const user = userEvent.setup();
    const { save } = renderTree();

    await user.click(folderCheckbox("figures_tables"));
    await user.click(folderCheckbox("data_with_a_very_long_unbroken_name"));

    // One folder means ONE path: the previous one is gone, not appended.
    expect(screen.getByTestId("filetree-selection")).toHaveTextContent(DATA);
    expect(screen.getByTestId("filetree-selection")).not.toHaveTextContent(
      FIGURES
    );

    await user.click(confirmButton());
    expect(save).toHaveBeenCalledWith(DATA);
  });

  it("keeps the actions outside the scrolling area, however deep the tree",
     async () => {
    const user = userEvent.setup();
    renderTree();

    // Expand a folder: the tree grows, and the footer must not move with it.
    await user.click(screen.getAllByRole("button", { name: /expand node/i })[0]);
    expect(await screen.findByText("figure_S1")).toBeInTheDocument();

    const content = screen.getByTestId("filetree-content");
    const actions = screen.getByTestId("filetree-actions");
    expect(content).not.toContainElement(actions);
    expect(content).not.toContainElement(confirmButton());
    expect(content).not.toContainElement(
      screen.getByTestId("filetree-selection")
    );
    // The tree itself is inside the one scrolling region.
    expect(content).toContainElement(screen.getByText("figure_S1"));
  });

  it("scrolls in exactly one place", () => {
    renderTree();

    const dialog = screen.getByRole("dialog");
    const scrollable = Array.from(dialog.querySelectorAll("*")).filter((el) => {
      const style = getComputedStyle(el);
      return /(auto|scroll)/.test(style.overflowY);
    });
    expect(scrollable).toHaveLength(1);
    expect(scrollable[0]).toBe(screen.getByTestId("filetree-content"));
    // ...and it never scrolls sideways: long folder names wrap instead.
    expect(scrollable[0]).toHaveStyle("overflow-x: hidden");
  });

  it("does not resize the dialog to fit its own margins", () => {
    renderTree();
    // A max-height that ignores the Paper's margin makes the dialog taller
    // than a container that cannot scroll, and the header leaves the screen.
    const paper = screen.getByRole("dialog");
    expect(paper).toHaveClass("MuiDialog-paper");
    // Its height is the container MINUS its own margin — never a viewport
    // unit that ignores it.
    expect(getComputedStyle(paper).maxHeight).toMatch(/^calc\(100% - \d+px\)$/);
    expect(paper).toHaveStyle("overflow: hidden");
    // Rows of a stated size, so nothing inside can resize the dialog.
    expect(paper).toHaveStyle("display: grid");
    expect(paper).toHaveStyle("flex-direction: column");
    // The tree row of the grid, free to shrink to whatever is left.
    expect(paper).toHaveStyle("grid-template-rows: auto 4px minmax(0, 1fr) auto");
    expect(screen.getByTestId("filetree-content")).toHaveStyle("min-height: 0");
    expect(screen.getByTestId("filetree-content")).toHaveStyle(
      "min-height: 0"
    );
  });

  it("keeps the tree viewport anchored when a checkbox changes", async () => {
    const user = userEvent.setup();
    renderTree();
    const content = screen.getByTestId("filetree-content");
    content.scrollTop = 240;

    await user.click(folderCheckbox("figures_tables"));

    expect(content.scrollTop).toBe(240);
    expect(confirmButton()).toBeEnabled();
  });

  it("still multi-selects, and labels itself, for the other pickers",
     async () => {
    const user = userEvent.setup();
    const { save } = renderTree({ multiple: true, confirmLabel: "Save" });

    const saveButton = confirmButton(/^save$/i);
    expect(saveButton).toBeDisabled();

    await user.click(folderCheckbox("figures_tables"));
    await user.click(folderCheckbox("data_with_a_very_long_unbroken_name"));
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    // Both, comma-joined — the shape those forms have always stored.
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(`${FIGURES}, ${DATA}`);
  });

  it("shows the multi-selection at the top too", async () => {
    const user = userEvent.setup();
    renderTree({ multiple: true, confirmLabel: "Save" });

    await user.click(folderCheckbox("figures_tables"));
    expect(screen.getByTestId("filetree-selection")).toHaveTextContent(FIGURES);
  });
});

// What the picker stores when a row is ticked. jsdom has no layout, so these
// pin the SELECTION contract only — the layout is held by the real-Chrome
// probe in scripts/filetree-layout-probe.mjs, which measures the Paper, the
// scroll position and the row under the pointer in an actual browser.
describe("what a tick selects", () => {
  // A parent whose children are already loaded: the tree the picker sees
  // after a folder has been expanded once.
  const selectionOf = () => screen.getByTestId("filetree-selection").textContent;

  it("stores the ticked folder itself, and only that", async () => {
    const user = userEvent.setup();
    const { save } = renderTree();

    await user.click(folderCheckbox("figures_tables"));

    // The parent carries a loaded child; the child is not selected with it.
    expect(selectionOf()).toContain(FIGURES);
    expect(selectionOf()).not.toContain("figure_S1");
    await user.click(confirmButton());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(FIGURES);
  });

  it("keeps exactly one path when a parent with children is ticked", async () => {
    const user = userEvent.setup();
    const { save } = renderTree();

    // Expand first, so the child rows are mounted and could be swept in.
    await user.click(screen.getAllByRole("button", { name: /expand node/i })[0]);
    expect(await screen.findByText("figure_S1")).toBeInTheDocument();

    await user.click(folderCheckbox("figures_tables"));
    await user.click(confirmButton());

    // One folder means ONE path — never "parent, child".
    expect(save).toHaveBeenCalledWith(FIGURES);
    expect(save.mock.calls[0][0].split(",")).toHaveLength(1);
  });

  it("replaces the previous folder rather than adding to it", async () => {
    const user = userEvent.setup();
    const { save } = renderTree();

    await user.click(folderCheckbox("figures_tables"));
    await user.click(folderCheckbox("data_with_a_very_long_unbroken_name"));

    expect(selectionOf()).toContain(DATA);
    expect(selectionOf()).not.toContain(FIGURES);
    await user.click(confirmButton());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(DATA);
  });

  it("clears the selection when the same folder is ticked again", async () => {
    const user = userEvent.setup();
    renderTree();

    await user.click(folderCheckbox("figures_tables"));
    expect(confirmButton()).toBeEnabled();

    await user.click(folderCheckbox("figures_tables"));
    expect(selectionOf()).toMatch(/nothing currently selected/i);
    expect(confirmButton()).toBeDisabled();
  });

  it("selects a child that arrived from a lazy expand", async () => {
    const user = userEvent.setup();
    const { save } = renderTree();

    await user.click(screen.getAllByRole("button", { name: /expand node/i })[0]);
    expect(await screen.findByText("figure_S1")).toBeInTheDocument();

    await user.click(folderCheckbox("figure_S1"));
    await user.click(confirmButton());

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(`${FIGURES}/figure_S1`);
  });

  it("cancel hands back nothing at all", async () => {
    const user = userEvent.setup();
    const { save, closeSelector } = renderTree();

    await user.click(folderCheckbox("figures_tables"));
    await user.click(cancelButton());

    expect(save).toHaveBeenCalledTimes(0);
    expect(closeSelector).toHaveBeenCalledTimes(1);
  });

  it("still accumulates for the multi-select pickers", async () => {
    const user = userEvent.setup();
    const { save } = renderTree({ multiple: true, confirmLabel: "Save" });

    await user.click(folderCheckbox("figures_tables"));
    await user.click(folderCheckbox("data_with_a_very_long_unbroken_name"));
    await user.click(confirmButton(/^save$/i));

    // Unchanged shape: the comma-joined list those forms have always stored.
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(`${FIGURES}, ${DATA}`);
  });

  it("lays the dialog out as fixed rows, so the tree cannot push the actions",
     () => {
    renderTree();
    const paper = screen.getByRole("dialog");
    // A grid of stated rows: header, progress slot, tree, actions. A flex
    // column let the Paper keep a scroll position of its own, which is how
    // the actions ended up thousands of pixels above the dialog.
    expect(paper).toHaveStyle("display: grid");
    expect(paper).toHaveStyle("grid-template-rows: auto 4px minmax(0, 1fr) auto");
    expect(paper).toHaveStyle("grid-template-columns: minmax(0, 1fr)");
    // The tree's scroller is the positioned ancestor, so the library's
    // absolutely positioned hidden checkboxes belong to IT and not to the
    // Paper. Focusing one can no longer scroll the dialog.
    expect(screen.getByTestId("filetree-content")).toHaveStyle(
      "position: relative"
    );
  });
});
