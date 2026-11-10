import fs from "fs";
import path from "path";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ChartsInfoForm from "../components/CuratorForms/ChartsInfoForm";
import DatasetsInfoForm from "../components/CuratorForms/DatasetsInfoForm";
import ScriptsInfoForm from "../components/CuratorForms/ScriptsInfoForm";
import ToolsInfoForm from "../components/CuratorForms/ToolsInfoForm";
import CuratorContext from "../Context/Curator/curatorContext";
import CuratorHelperContext from "../Context/CuratorHelpers/curatorHelperContext";
import SourceTreeContext from "../Context/SourceTree/SourceTreeContext";
import {
  controlFor,
  firstInvalidControl,
  revealControl,
} from "../Utils/invalidField";

// Nothing a curator enters is required to publish, so a blank form saves.
// What can still be invalid is a value that is malformed -- in these forms,
// a custom field with a label and no value (or the reverse). Pressing Save
// then sends the curator to the FIRST invalid field in the form's own order
// -- not the first key the resolver happened to report, and not whichever
// one is nearest the button -- scrolls it to the middle, and focuses it.

const FORMS = {
  chart: ChartsInfoForm,
  dataset: DatasetsInfoForm,
  script: ScriptsInfoForm,
  tool: ToolsInfoForm,
};

const HELPER_KEY = {
  chart: "chartsHelper",
  dataset: "datasetsHelper",
  script: "scriptsHelper",
  tool: "toolsHelper",
};

const STATE_KEY = {
  chart: "charts",
  dataset: "datasets",
  script: "scripts",
  tool: "tools",
};

const renderForm = (kind, { def = null, records = [] } = {}) => {
  const Form = FORMS[kind];
  const add = jest.fn();
  const edit = jest.fn();
  const closeForm = jest.fn();
  const view = render(
    <CuratorContext.Provider
      value={{ [STATE_KEY[kind]]: records, add, edit }}
    >
      <CuratorHelperContext.Provider
        value={{
          [HELPER_KEY[kind]]: { def, open: true },
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
          <Form />
        </SourceTreeContext.Provider>
      </CuratorHelperContext.Provider>
    </CuratorContext.Provider>
  );
  return { add, edit, closeForm, unmount: view.unmount };
};

const save = async (user) =>
  user.click(screen.getByRole("button", { name: /^(save|update)$/i }));

// A record whose custom field has a label and no value.
const INCOMPLETE = {
  chart: { id: "c9", extraFields: [{ label: "Temperature", value: "" }] },
  dataset: { id: "d9", files: ["a.csv"], extraFields: [{ label: "Temperature", value: "" }] },
  script: { id: "s9", files: ["a.py"], extraFields: [{ label: "Temperature", value: "" }] },
  tool: { id: "t9", kind: "software", extraFields: [{ label: "Temperature", value: "" }] },
};
const renderIncomplete = (kind, extraFields) =>
  renderForm(kind, {
    def: extraFields ? { ...INCOMPLETE[kind], extraFields } : INCOMPLETE[kind],
  });
const customLabel = (index = 0) => screen.getAllByPlaceholderText(/enter custom label/i)[index];
const customValue = (index = 0) => screen.getAllByPlaceholderText(/^enter value$/i)[index];

// jsdom has no layout, so scrollIntoView is not implemented there.
let scrollSpy;
beforeEach(() => {
  scrollSpy = jest.fn();
  Element.prototype.scrollIntoView = scrollSpy;
});

describe("nothing is required to save", () => {
  it.each(["chart", "dataset", "script", "tool"])(
    "%s: saves with every field blank, and moves nothing",
    async (kind) => {
      const user = userEvent.setup({ delay: null });
      const { add } = renderForm(kind);

      await save(user);

      await waitFor(() => expect(add).toHaveBeenCalled());
      expect(scrollSpy).not.toHaveBeenCalled();
    }
  );
});

describe("a failed Save goes to the first invalid field", () => {
  it("chart: an incomplete custom field, not the blank fields above it", async () => {
    const user = userEvent.setup({ delay: null });
    const { add, edit } = renderIncomplete("chart");

    await save(user);

    await waitFor(() => expect(customLabel()).toHaveFocus());
    expect(screen.getByPlaceholderText(/enter chart image file name/i)).not.toHaveFocus();
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith(
      expect.objectContaining({ block: "center" })
    );
    // Nothing was saved, and the reducer was never touched.
    expect(add).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
  });

  it("saves normally, and scrolls nothing, once the custom field is complete",
     async () => {
    const user = userEvent.setup({ delay: null });
    const { add } = renderIncomplete("chart");

    await user.type(customValue(), "300 K");
    await save(user);

    await waitFor(() => expect(add).toHaveBeenCalled());
    expect(add).toHaveBeenCalledWith(
      "chart",
      expect.objectContaining({
        extraFields: [{ label: "Temperature", value: "300 K" }],
      })
    );
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it.each(["dataset", "script", "tool"])(
    "%s: goes to the incomplete custom field",
    async (kind) => {
      const user = userEvent.setup({ delay: null });
      const { add } = renderIncomplete(kind);

      await save(user);

      await waitFor(() => expect(customLabel()).toHaveFocus());
      expect(scrollSpy).toHaveBeenCalledTimes(1);
      expect(add).not.toHaveBeenCalled();
    }
  );

  it("respects prefers-reduced-motion", async () => {
    const matchMedia = jest.fn().mockReturnValue({
      matches: true,
      addListener: jest.fn(),
      removeListener: jest.fn(),
    });
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: matchMedia,
    });
    const user = userEvent.setup({ delay: null });
    renderIncomplete("dataset");

    await save(user);
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: "auto",
      block: "center",
    });

    delete window.matchMedia;
  });

  it("uses smooth scrolling when no such preference is set", async () => {
    const user = userEvent.setup({ delay: null });
    renderIncomplete("dataset");

    await save(user);
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });
});

// The target is chosen from the DOM, so the same rule holds for a radio
// group, a select and a picker-driven field without any form naming its own
// fields here.
describe("choosing the control to focus", () => {
  const mount = (html) => {
    const form = document.createElement("form");
    form.innerHTML = html;
    document.body.appendChild(form);
    return form;
  };

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("takes the first control in DOM order, whatever order the errors are in",
     () => {
    const form = mount(`
      <input name="first" />
      <input name="second" />
      <input name="third" />
    `);
    // Reported last-first: the answer is still the topmost one.
    const target = firstInvalidControl(form, { third: {}, first: {}, second: {} });
    expect(target).toBe(form.querySelector('[name="first"]'));
  });

  it("keeps that order when a two-column row wraps to one column", () => {
    // Columns are a painting decision; the DOM order is the form's order.
    const form = mount(`
      <div style="display:flex;flex-direction:column">
        <input name="left" />
        <input name="right" />
      </div>
    `);
    expect(firstInvalidControl(form, { right: {}, left: {} })).toBe(
      form.querySelector('[name="left"]')
    );
  });

  it("focuses the first radio of a group, or the chosen one", () => {
    const form = mount(`
      <input type="radio" name="kind" value="software" />
      <input type="radio" name="kind" value="experiment" />
    `);
    expect(controlFor(form, "kind")).toBe(
      form.querySelector('[value="software"]')
    );

    form.querySelector('[value="experiment"]').checked = true;
    expect(controlFor(form, "kind")).toBe(
      form.querySelector('[value="experiment"]')
    );
  });

  it("focuses a select's trigger, never its hidden native input", () => {
    const form = mount(`
      <div class="MuiFormControl-root">
        <div role="combobox" tabindex="0" id="trigger">Pick one</div>
        <input name="server" class="MuiSelect-nativeInput" aria-hidden="true" />
      </div>
    `);
    expect(controlFor(form, "server")).toBe(form.querySelector("#trigger"));
  });

  it("focuses the picker button when the field itself cannot be typed in",
     () => {
    const form = mount(`
      <div class="MuiFormControl-root">
        <input name="imageFile" readonly />
        <button type="button" id="picker">Pick a file</button>
      </div>
    `);
    expect(controlFor(form, "imageFile")).toBe(form.querySelector("#picker"));
  });

  it("finds an array field's own inputs", () => {
    const form = mount(`
      <input name="extraFields.0.label" />
      <input name="extraFields.0.value" />
    `);
    expect(controlFor(form, "extraFields")).toBe(
      form.querySelector('[name="extraFields.0.label"]')
    );
  });

  it("does nothing when there is nothing to focus", () => {
    const form = mount(`<input name="known" />`);
    expect(firstInvalidControl(form, { unknown: {} })).toBeNull();
    expect(firstInvalidControl(null, { known: {} })).toBeNull();
    expect(revealControl(null)).toBeNull();
  });
});

// react-hook-form focuses the first errored field itself, AFTER the invalid
// handler runs, unless it is told not to. Left on, it would land on whichever
// element it holds a ref for — the hidden native input of a select, not the
// trigger; the text field, not the picker button — and its plain .focus()
// would scroll that element into view its own way, undoing the
// block: "center" placement this feature exists to give. The custom handler
// is the only thing that moves focus.

// jsdom exposes HTMLElement.focus through an accessor, which jest.spyOn
// cannot replace, so the counter is installed by hand.
const watchFocus = () => {
  const original = HTMLElement.prototype.focus;
  const instances = [];
  Object.defineProperty(HTMLElement.prototype, "focus", {
    configurable: true,
    writable: true,
    value: function focus(...args) {
      instances.push(this);
      return original.apply(this, args);
    },
  });
  return {
    instances,
    on: (element) => instances.filter((instance) => instance === element).length,
    restore: () =>
      Object.defineProperty(HTMLElement.prototype, "focus", {
        configurable: true,
        writable: true,
        value: original,
      }),
  };
};

describe("only one thing moves the focus", () => {

  it("focuses the target exactly once, and nothing focuses it later",
     async () => {
    const focusSpy = watchFocus();
    const user = userEvent.setup({ delay: null });
    renderIncomplete("chart");

    await save(user);
    const target = customLabel();
    await waitFor(() => expect(target).toHaveFocus());

    expect(focusSpy.on(target)).toBe(1);
    expect(scrollSpy).toHaveBeenCalledTimes(1);

    // react-hook-form's own focus runs after the invalid callback, and MUI
    // transitions settle on a timer; neither may add a second one.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(focusSpy.on(target)).toBe(1);
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(target).toHaveFocus();

    focusSpy.restore();
  });

  it("does not focus the field react-hook-form would have picked instead",
     async () => {
    const focusSpy = watchFocus();
    const user = userEvent.setup({ delay: null });
    renderIncomplete("chart");

    await save(user);
    await waitFor(() => expect(customLabel()).toHaveFocus());

    // Every other field is left alone: one jump, one field.
    ["enter the figure caption", "enter keywords", "enter chart image file name"].forEach((placeholder) => {
      const other = screen.getByPlaceholderText(new RegExp(placeholder, "i"));
      expect(focusSpy.on(other)).toBe(0);
      expect(other).not.toHaveFocus();
    });
    expect(focusSpy.on(customValue())).toBe(0);

    focusSpy.restore();
  });

  it("moves nothing at all when the form is valid", async () => {
    const focusSpy = watchFocus();
    const user = userEvent.setup({ delay: null });
    const { add } = renderForm("chart");

    await user.type(screen.getByPlaceholderText(/enter the figure caption/i), "Density of states");
    const focusesBefore = focusSpy.instances.length;
    await save(user);

    await waitFor(() => expect(add).toHaveBeenCalled());
    expect(scrollSpy).not.toHaveBeenCalled();
    // The Save button takes focus from the click; nothing else moves.
    expect(focusSpy.instances.length - focusesBefore).toBeLessThanOrEqual(1);

    focusSpy.restore();
  });

  it("holds for every artifact form, not just charts", async () => {
    for (const kind of ["dataset", "script", "tool"]) {
      const focusSpy = watchFocus();
      const user = userEvent.setup({ delay: null });
      const { unmount } = renderIncomplete(kind);

      // eslint-disable-next-line no-await-in-loop
      await save(user);
      const field = customLabel();
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(field).toHaveFocus());
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(focusSpy.on(field)).toBe(1);

      focusSpy.restore();
      unmount();
      scrollSpy.mockClear();
    }
  });

  it("states the contract in every form's useForm call", () => {
    // A form that forgets this gets two focus owners again, and the symptom
    // (a jump that lands somewhere else, or scrolls the field to the edge
    // instead of the middle) is easy to mistake for a broken selector.
    ["ChartsInfoForm", "DatasetsInfoForm", "ScriptsInfoForm", "ToolsInfoForm"]
      .forEach((file) => {
        const source = fs.readFileSync(
          path.join(__dirname, "..", "components", "CuratorForms", `${file}.js`),
          "utf8"
        );
        expect(source).toMatch(/shouldFocusError:\s*false/);
        expect(source).toMatch(/handleSubmit\(onSubmit,\s*focusFirstInvalid\)/);
      });
  });
});
