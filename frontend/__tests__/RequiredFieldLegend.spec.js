import { render, screen, within } from "@testing-library/react";

import {
  FormInputLabel,
  RequiredFieldLegend,
} from "../components/Form/Util";
import { TextInputField } from "../components/Form/InputFields";

// "What does the red star mean?" had no answer anywhere in the curator, and
// the star itself carried the rule in two channels a reader may not have:
// colour, and a symbol whose convention has to be known.

describe("the required-field legend", () => {
  it("says what the asterisk means, in words", () => {
    render(<RequiredFieldLegend />);
    const legend = screen.getByTestId("required-field-legend");
    expect(legend).toHaveTextContent("Required field");
  });

  it("hides the decorative asterisk from assistive technology", () => {
    // The legend's own text carries the meaning; the symbol beside it would
    // otherwise be announced as "star".
    const { container } = render(<RequiredFieldLegend />);
    const hidden = container.querySelector('[aria-hidden="true"]');
    expect(hidden).not.toBeNull();
    expect(hidden).toHaveTextContent("*");
  });
});

describe("a required field's marker", () => {
  it("is announced as required, not as a star", () => {
    render(<FormInputLabel forId="title" label="Title" required />);
    // The accessible name carries the word; the asterisk is decoration.
    expect(screen.getByText(/\(required\)/i)).toBeInTheDocument();
  });

  it("draws exactly one asterisk", () => {
    // MUI's own `required` prop would append a second one to the field's
    // label, giving two markers for one rule.
    const { container } = render(
      <FormInputLabel forId="title" label="Title" required />
    );
    const stars = container.textContent.match(/\*/g) || [];
    expect(stars).toHaveLength(1);
  });

  it("marks nothing when the field is optional", () => {
    const { container } = render(
      <FormInputLabel forId="notes" label="Notes" />
    );
    expect(container.textContent).not.toContain("*");
    expect(screen.queryByText(/\(required\)/i)).not.toBeInTheDocument();
  });

  it("puts aria-required on the input itself", () => {
    const { container } = render(
      <TextInputField
        id="title"
        name="title"
        label="Title"
        placeholder="Title"
        required
      />
    );
    expect(container.querySelector("input")).toHaveAttribute(
      "aria-required",
      "true"
    );
    // ...and still only one visible marker.
    expect((container.textContent.match(/\*/g) || [])).toHaveLength(1);
  });

  it("leaves an optional input unmarked", () => {
    const { container } = render(
      <TextInputField
        id="notes"
        name="notes"
        label="Notes"
        placeholder="Notes"
      />
    );
    expect(container.querySelector("input")).not.toHaveAttribute(
      "aria-required"
    );
  });
});

describe("the curator forms", () => {
  // Nothing a curator enters is required to publish, so no publishing form
  // marks a field required -- and explaining a symbol that is not on the
  // form is noise. FileServerInfoForm's markers belong to its folder SEARCH
  // box, which needs a server to search, not to the record.
  const WITH_REQUIRED = ["FileServerInfoForm"];
  const WITHOUT_REQUIRED = [
    "ChartsInfoForm",
    "CuratorInfoForm",
    "DatasetsInfoForm",
    "DocumentationInfoForm",
    "LicenseInfoForm",
    "PaperInfoForm",
    "ReferenceInfoForm",
    "ScriptsInfoForm",
    "ToolsInfoForm",
    "WorkflowInfoForm",
  ];

  const source = (name) =>
    require("fs").readFileSync(
      require("path").join(
        __dirname,
        "..",
        "components",
        "CuratorForms",
        `${name}.js`
      ),
      "utf-8"
    );

  it.each(WITH_REQUIRED)("%s carries the legend", (name) => {
    const text = source(name);
    expect(text).toContain("RequiredFieldLegend");
    expect(text).toMatch(/import \{[^}]*RequiredFieldLegend[^}]*\} from "\.\.\/Form\/Util";/);
  });

  it.each(WITHOUT_REQUIRED)("%s has no required field and no legend", (name) => {
    const text = source(name);
    expect(text).not.toContain("RequiredFieldLegend");
    expect(text).not.toMatch(/^\s+required$/m);
    expect(text).not.toMatch(/required=\{/);
    expect(text).not.toMatch(/\.required\(/);
  });
});
