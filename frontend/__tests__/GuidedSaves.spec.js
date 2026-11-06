import { render } from "@testing-library/react";

import ReferenceInfoElement from "../components/CuratorElements/ReferenceElement";
import CuratorContext from "../Context/Curator/curatorContext";
import CuratorHelperContext from "../Context/CuratorHelpers/curatorHelperContext";
import {
  acceptGuidedChanges,
  guidedChangesAccepted,
  resetGuidedChanges,
} from "../Utils/savedSection";

jest.mock("../components/CuratorForms/ReferenceInfoForm", () => () => <div data-testid="reference-form" />);
jest.mock("../components/Paper/ReferenceC", () => () => <div data-testid="reference-display" />);

const COMPLETE = {
  kind: "preprint",
  title: "An NV- center in MgO",
  authors: "Vrindaa Somjit, Giulia Galli",
  publication: "arXiv 2024, ,",
  abstract: "We identify a defect.",
};

const renderReference = (referenceInfo) => {
  const setEditing = jest.fn();
  render(
    <CuratorContext.Provider value={{ referenceInfo }}>
      <CuratorHelperContext.Provider value={{ editing: { referenceInfo: true }, setEditing }}>
        <ReferenceInfoElement />
      </CuratorHelperContext.Provider>
    </CuratorContext.Provider>
  );
  return setEditing;
};

describe("what the guided setup fills in counts as saved", () => {
  afterEach(() => {
    resetGuidedChanges();
    window.sessionStorage.clear();
  });

  it("opens a short window, and only on request", () => {
    expect(guidedChangesAccepted()).toBe(false);
    acceptGuidedChanges();
    expect(guidedChangesAccepted()).toBe(true);
  });

  it("closes Publication Information once the setup has filled every required field", () => {
    acceptGuidedChanges();
    const setEditing = renderReference(COMPLETE);
    expect(setEditing).toHaveBeenCalledWith("referenceInfo", false);
  });

  it("leaves it open while a required field is still missing", () => {
    acceptGuidedChanges();
    const setEditing = renderReference({ ...COMPLETE, abstract: "" });
    expect(setEditing).not.toHaveBeenCalledWith("referenceInfo", false);
  });

  it("does not treat a change from anywhere else as a Save", () => {
    const setEditing = renderReference(COMPLETE);
    expect(setEditing).not.toHaveBeenCalledWith("referenceInfo", false);
  });
});
