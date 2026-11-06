import { render, screen } from "@testing-library/react";

import ReferenceInfo from "../components/Paper/Reference";

// The paper-details byline. Institution is optional and record-level -- see
// project.models.Paper.institution -- so an old record simply shows no chip.
const referenceData = (overrides = {}) => ({
  title: "Rareword resonance of gadgetite lattices",
  authors: "Robin Sharedname, Casey Otherperson",
  tags: [],
  collections: [],
  PIs: [],
  publication: "Journal of Placeholder Science",
  year: 2021,
  doi: "10.1000/near",
  cite: "",
  downloadPath: "",
  notebookFile: "",
  notebookPath: "",
  abstract: "",
  fileServerPath: "",
  ...overrides,
});

describe("the institution chip on the paper-details byline", () => {
  it("shows the curator's exact institution text beside the authors", () => {
    render(
      <ReferenceInfo
        referenceData={referenceData({ institution: "University of Chicago" })}
      />
    );
    const chip = screen.getByTestId("record-institution");
    // The label says what the value IS, visibly -- not only to a screen
    // reader -- so a bare institution name beside a byline cannot be read as
    // something else, and it is the curator's exact text, never abbreviated.
    expect(chip).toHaveTextContent("Institution: University of Chicago");
    expect(chip).not.toHaveTextContent("UChicago");
  });

  it("renders no chip for an old record with no institution on file", () => {
    render(<ReferenceInfo referenceData={referenceData()} />);
    expect(
      screen.queryByTestId("record-institution")
    ).not.toBeInTheDocument();
  });

  it("puts the institution chip on the byline row, beside the authors", () => {
    render(
      <ReferenceInfo
        referenceData={referenceData({ institution: "Duke University" })}
      />
    );
    const byline = screen.getByText(/by robin sharedname/i);
    const chip = screen.getByTestId("record-institution");
    expect(chip.parentElement).toBe(byline.closest("div"));
  });
});
