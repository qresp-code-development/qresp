/**
 * Loading a draft or coming back from the preview opens the record with
 * every section closed -- including sections that mount a moment later as
 * the draft fills in -- until the curator starts working.
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Drawer from "../components/drawer";
import {
  closeAllSections,
  collapseAllSections,
  expandAllSections,
  resetSectionCollapse,
  sectionsCollapsing,
} from "../Utils/sectionCollapse";

const header = (name) => screen.getByRole("button", { name });

afterEach(() => resetSectionCollapse());

describe("closing every section after a load", () => {
  it("closes sections that are open", () => {
    render(
      <>
        <Drawer heading="Curator Information" defaultOpen>x</Drawer>
        <Drawer heading="Charts" defaultOpen>y</Drawer>
      </>
    );
    expect(header(/curator information/i)).toHaveAttribute("aria-expanded", "true");
    act(() => collapseAllSections());
    expect(header(/curator information/i)).toHaveAttribute("aria-expanded", "false");
    expect(header(/charts/i)).toHaveAttribute("aria-expanded", "false");
  });

  it("starts sections that mount just after the load closed", () => {
    act(() => collapseAllSections());
    render(<Drawer heading="Publication" defaultOpen>z</Drawer>);
    expect(header(/publication/i)).toHaveAttribute("aria-expanded", "false");
  });

  it("closes a section whose open state the caller controls", () => {
    const onToggle = jest.fn();
    render(<Drawer heading="Build your workflow" open onToggle={onToggle}>w</Drawer>);
    act(() => collapseAllSections());
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("ends at the curator's first click, so sections open normally again", async () => {
    act(() => collapseAllSections());
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    await userEvent.click(document.body);
    expect(sectionsCollapsing()).toBe(false);
    render(<Drawer heading="Licence" defaultOpen>l</Drawer>);
    expect(header(/licence/i)).toHaveAttribute("aria-expanded", "true");
  });

  it("can still be opened by hand while it is on", async () => {
    act(() => collapseAllSections());
    render(<Drawer heading="Datasets" defaultOpen>d</Drawer>);
    await userEvent.click(header(/datasets/i));
    expect(header(/datasets/i)).toHaveAttribute("aria-expanded", "true");
  });
});

describe("the record's Expand all / Collapse all", () => {
  it("opens and closes every section", () => {
    render(
      <>
        <Drawer heading="Curator Information">x</Drawer>
        <Drawer heading="Charts" defaultOpen>y</Drawer>
      </>
    );
    act(() => expandAllSections());
    expect(header(/curator information/i)).toHaveAttribute("aria-expanded", "true");
    expect(header(/charts/i)).toHaveAttribute("aria-expanded", "true");
    act(() => closeAllSections());
    expect(header(/curator information/i)).toHaveAttribute("aria-expanded", "false");
    expect(header(/charts/i)).toHaveAttribute("aria-expanded", "false");
  });

  it("collapsing by button does not keep new sections closed", () => {
    act(() => closeAllSections());
    expect(sectionsCollapsing()).toBe(false);
  });

  it("expanding ends the after-load mode", () => {
    act(() => collapseAllSections());
    act(() => expandAllSections());
    expect(sectionsCollapsing()).toBe(false);
  });
});
