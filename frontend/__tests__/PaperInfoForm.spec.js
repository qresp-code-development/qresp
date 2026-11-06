import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PaperInfoForm from "../components/CuratorForms/PaperInfoForm";
import CuratorContext from "../Context/Curator/curatorContext";
import SourceTreeContext from "../Context/SourceTree/SourceTreeContext";

// Regression for curator edit mode: state keeps collections/tags as ARRAYS
// (a raw paper loads collections: ["MICCOM"]), while this form edits them as
// comma-separated strings. The missing join for collections made yup fail
// with `collections must be a `string` type` and blocked saving.
const renderForm = (paperInfoOverrides = {}) => {
  const setPaperInfo = jest.fn();
  const curator = {
    paperInfo: {
      PIs: "Giulia Galli",
      collections: ["MICCOM"],
      tags: ["DFT"],
      notebookFile: "",
      notebookPath: "",
      ...paperInfoOverrides,
    },
    setPaperInfo,
    setReferenceAuthors: jest.fn(),
    fileServerPath: "",
  };
  const sourceTree = {
    setSaveMethod: jest.fn(),
    openSelector: jest.fn(),
    HideSelector: jest.fn(),
  };
  render(
    <CuratorContext.Provider value={curator}>
      <SourceTreeContext.Provider value={sourceTree}>
        <PaperInfoForm editor={jest.fn()} />
      </SourceTreeContext.Provider>
    </CuratorContext.Provider>
  );
  return { setPaperInfo };
};

describe("PaperInfoForm with array-backed state (edit mode)", () => {
  it("is pure Qresp curation info: PI/PaperStack/Keywords/notebook, no import, no bibliography", () => {
    renderForm();
    expect(
      screen.getByText(/qresp curation information/i)
    ).toBeInTheDocument();
    // The curation fields are all here...
    expect(
      screen.getByPlaceholderText(/enter collection to which project belongs/i)
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/enter tags for the project/i)
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/enter main notebook filename/i)
    ).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText("Enter first name").length)
      .toBeGreaterThan(0);
    // ...and the primary-paper bibliography/import is NOT (it lives in
    // Publication Information for This Paper).
    expect(
      screen.queryByText(/import information for this paper/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/enter the title of this paper/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/enter abstract/i))
      .not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/enter doi/i))
      .not.toBeInTheDocument();
  });

  it("displays loaded collections and tags as comma-separated strings", () => {
    renderForm({ collections: ["MICCOM", "PARADIM"] });
    // The legacy TextInput overrides InputProps.id, which breaks the MUI
    // label-input pairing, so query by placeholder instead of label.
    expect(
      screen.getByPlaceholderText(/enter collection to which project belongs/i)
    ).toHaveValue("MICCOM, PARADIM");
    expect(screen.getByPlaceholderText(/enter tags for the project/i)).toHaveValue(
      "DFT"
    );
  });

  it("renders one clean row per principal investigator", () => {
    renderForm({ PIs: "Alpha Beta, Gamma Delta" });
    const firstNames = screen.getAllByPlaceholderText("Enter first name");
    expect(firstNames).toHaveLength(2);
    expect(firstNames[0]).toHaveValue("Alpha");
    expect(firstNames[1]).toHaveValue("Gamma");
    expect(screen.getAllByPlaceholderText("Enter last name")).toHaveLength(2);
  });

  it("saves a loaded record without type errors and round-trips arrays", async () => {
    const { setPaperInfo } = renderForm();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(setPaperInfo).toHaveBeenCalled());
    expect(setPaperInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        collections: ["MICCOM"],
        tags: ["DFT"],
      })
    );
  });

  // Optional, record-level, never inferred: see project.models.Paper.institution.
  describe("institution", () => {
    it("offers an optional institution field labelled and placeholder-hinted", () => {
      renderForm();
      expect(screen.getByText(/institution \(optional\)/i)).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/e\.g\. university of chicago/i)
      ).toBeInTheDocument();
    });

    it("shows a blank institution as an empty, valid input -- not an error", () => {
      renderForm();
      expect(
        screen.getByPlaceholderText(/e\.g\. university of chicago/i)
      ).toHaveValue("");
      expect(screen.queryByText(/institution.*required/i)).not.toBeInTheDocument();
    });

    it("preloads a saved institution on edit", () => {
      renderForm({ institution: "University of Chicago" });
      expect(
        screen.getByPlaceholderText(/e\.g\. university of chicago/i)
      ).toHaveValue("University of Chicago");
    });

    it("round-trips a curator-typed institution through save", async () => {
      const { setPaperInfo } = renderForm();
      const user = userEvent.setup();
      await user.type(
        screen.getByPlaceholderText(/e\.g\. university of chicago/i),
        "Duke University"
      );
      await user.click(screen.getByRole("button", { name: /^save$/i }));
      await waitFor(() => expect(setPaperInfo).toHaveBeenCalled());
      expect(setPaperInfo).toHaveBeenCalledWith(
        expect.objectContaining({ institution: "Duke University" })
      );
    });

    it("round-trips a cleared institution as an empty string", async () => {
      const { setPaperInfo } = renderForm({
        institution: "University of Chicago",
      });
      const user = userEvent.setup();
      await user.clear(
        screen.getByPlaceholderText(/e\.g\. university of chicago/i)
      );
      await user.click(screen.getByRole("button", { name: /^save$/i }));
      await waitFor(() => expect(setPaperInfo).toHaveBeenCalled());
      expect(setPaperInfo).toHaveBeenCalledWith(
        expect.objectContaining({ institution: "" })
      );
    });
  });
});
