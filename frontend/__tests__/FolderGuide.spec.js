import {
  render,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import FolderGuide from "../components/CuratorElements/FolderGuide";
import {
  LEGACY_NOTES,
  TIPS,
  TREE,
} from "../components/FolderStandard/content";
import { ARTIFACT_FIELDS } from "../Utils/artifactFields";

// The guide states the Qresp Folder Standard v1: a recommended contract for
// accurate automatic analysis, with no power to validate, score or block
// anything. These tests pin the standard it must state, the compatibility
// path it must keep clearly separate from it, and what it must NOT claim.

describe("How to organize an RCC folder", () => {
  it("is reachable and closed until asked for", async () => {
    const user = userEvent.setup();
    render(<FolderGuide />);

    const trigger = screen.getByRole("button", {
      name: /how to organize an rcc folder/i,
    });
    expect(trigger).toBeInTheDocument();
    // Nothing is shown until the curator asks.
    expect(screen.queryByTestId("folder-guide-tree")).toBeNull();

    await user.click(trigger);
    expect(await screen.findByTestId("folder-guide-tree")).toBeInTheDocument();
  });

  it("draws the example as a live tree, not an image of text", async () => {
    const user = userEvent.setup();
    render(<FolderGuide />);
    await user.click(
      screen.getByRole("button", { name: /how to organize an rcc folder/i })
    );

    const tree = await screen.findByTestId("folder-guide-tree");
    // Real, selectable text — every level of the example is present.
    [
      "paper-folder/",
      "README.md",
      "main.ipynb",
      "datasets/",
      "dataset-id/",
      "charts/",
      "figure-id/",
      "preview.png",
      "notebook.ipynb",
      "data/",
      "scripts/",
      "script-id/",
      "tools/",
      "tool-id/",
      "docs/",
    ].forEach((entry) => {
      expect(tree).toHaveTextContent(entry);
    });
    // No bitmap standing in for the diagram.
    expect(tree.querySelector("img")).toBeNull();
    // Icons come from the app's own set (rendered as SVG).
    expect(tree.querySelectorAll("svg").length).toBeGreaterThan(0);
  });

  it("stays scrollable rather than overflowing a narrow dialog", async () => {
    const user = userEvent.setup();
    render(<FolderGuide />);
    await user.click(
      screen.getByRole("button", { name: /how to organize an rcc folder/i })
    );
    expect(await screen.findByTestId("folder-guide-tree")).toHaveStyle(
      "overflow-x: auto"
    );
  });

  it("says the layout is optional and demands no new metadata file", async () => {
    const user = userEvent.setup();
    render(<FolderGuide />);
    await user.click(
      screen.getByRole("button", { name: /how to organize an rcc folder/i })
    );
    await screen.findByTestId("folder-guide-tree");

    const text = document.body.textContent;
    expect(text).toMatch(/all five role folders are optional/i);
    expect(text).toMatch(/existing folders are never renamed or modified/i);
    expect(text).toMatch(
      /no yaml, json, metadata manifest or qresp-specific file is ever required/i
    );
    // The exact standard names, and what a boundary means by default.
    expect(text).toMatch(/datasets, charts, scripts, tools, docs/i);
    expect(text).toMatch(
      /by default each immediate child folder of datasets\/, charts\/, scripts\/ or tools\/ is one qresp record/i
    );
    // Dataset/Script records may be split further; that is the ONLY thing
    // boundary review does to them.
    expect(text).toMatch(
      /dataset and script records can be split further in record boundaries/i
    );
    expect(text).toMatch(
      /docs\/ is excluded from the analysis candidates entirely/i
    );
    expect(text).toMatch(
      /figure number, figure caption, scientific descriptions and tool versions are never inferred/i
    );
    // It must not invent a manifest requirement.
    expect(text).not.toMatch(/qresp\.ya?ml/i);
    expect(text).not.toMatch(/manifest file/i);
    expect(text).not.toMatch(/you must|required format|will be rejected/i);
  });

  it("states the standard's Chart unit: one chart folder, one Chart", async () => {
    const user = userEvent.setup();
    render(<FolderGuide />);
    await user.click(
      screen.getByRole("button", { name: /how to organize an rcc folder/i })
    );
    const standard = await screen.findByTestId("folder-guide-standard");

    expect(standard).toHaveTextContent(
      /one charts\/<figure-id>\/ folder is one chart/i
    );
    // ...and what each file in it is called in the form.
    expect(standard).toHaveTextContent(
      /preview\.png is the figure image/i
    );
    expect(standard).toHaveTextContent(
      /notebook\.ipynb is the reproduction notebook/i
    );
    expect(standard).toHaveTextContent(
      /data\/ holds its input \/ supporting files/i
    );
    // An independent figure gets its own folder — that is the recommendation,
    // not "put several in one and sort it out later".
    expect(standard).toHaveTextContent(
      /give each independent figure its own charts\/<figure-id>\/ folder/i
    );
  });

  it("keeps multi-image review as compatibility, not as a second layout",
     async () => {
    const user = userEvent.setup();
    render(<FolderGuide />);
    await user.click(
      screen.getByRole("button", { name: /how to organize an rcc folder/i })
    );
    await screen.findByTestId("folder-guide-standard");

    // Its own section, named for the folders it is FOR.
    expect(
      screen.getByText(/existing folders with several images in one figure folder/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/compatibility review — for folders that already exist/i)
    ).toBeInTheDocument();

    const legacy = screen.getByTestId("folder-guide-legacy");
    expect(legacy).toHaveTextContent(/older folders/i);
    // Nothing is hidden, and every image gets exactly one of three roles.
    expect(legacy).toHaveTextContent(/none is hidden/i);
    expect(legacy).toHaveTextContent(
      /create chart, supporting file, or ignore/i
    );
    expect(legacy).toHaveTextContent(
      /create chart proposes an independent chart with that single figure image/i
    );
    expect(legacy).toHaveTextContent(
      /supporting file attaches the image to a chart in the same folder/i
    );
    expect(legacy).toHaveTextContent(/ignore proposes nothing/i);
    // It changes proposals only, and relationships live in Workflow.
    expect(legacy).toHaveTextContent(
      /nothing is added to the form, saved or published/i
    );
    expect(legacy).toHaveTextContent(/belong in workflow/i);

    // The standard section must not be where the roles are explained: it
    // describes the layout to aim for, not how to rescue an old one.
    const standard = screen.getByTestId("folder-guide-standard");
    expect(standard).not.toHaveTextContent(/create chart/i);
    expect(standard).not.toHaveTextContent(/several images/i);
  });

  it("describes what the analysis can and cannot do, without overclaiming",
     async () => {
    const user = userEvent.setup();
    render(<FolderGuide />);
    await user.click(
      screen.getByRole("button", { name: /how to organize an rcc folder/i })
    );
    await screen.findByTestId("folder-guide-tree");

    const text = document.body.textContent;
    expect(text).toMatch(
      /can inspect any folder inside the file server roots a Qresp server is allowed to read/i
    );
    expect(text).toMatch(/deterministic for the qresp folder standard v1/i);
    expect(text).toMatch(/legacy folder names qresp recognizes/i);
    expect(text).toMatch(
      /needs reorganization.*rather than guessed at/is
    );
    // A recommended contract, not a storage rule -- and not a promise that
    // any folder at all is analyzed perfectly.
    expect(text).toMatch(
      /not a rule for storing your files — it is the recommended contract/i
    );
    expect(text).toMatch(/can always\s*be reviewed by hand/i);
    expect(text).not.toMatch(/whatever folder you point it at/i);
    expect(text).not.toMatch(/only suggestions|not requirements/i);
  });

  it("uses the artifact contract's own field labels", async () => {
    const user = userEvent.setup();
    render(<FolderGuide />);
    await user.click(
      screen.getByRole("button", { name: /how to organize an rcc folder/i })
    );
    await screen.findByTestId("folder-guide-tree");

    const text = document.body.textContent;
    ["Figure Image", "Figure Number", "Figure Caption",
     "Input / Supporting Files", "Reproduction Notebook"].forEach((label) => {
      // Exactly the labels the Add/Edit Chart form shows.
      expect(ARTIFACT_FIELDS.chart.map((field) => field.label)).toContain(
        label
      );
      expect(text.toLowerCase()).toContain(label.toLowerCase());
    });
    // A figure caption is never called a generic Description here.
    expect(text).not.toMatch(/chart description|image file|notebook file/i);
  });

  it("warns about secrets and does not over-promise inference", async () => {
    const user = userEvent.setup();
    render(<FolderGuide />);
    await user.click(
      screen.getByRole("button", { name: /how to organize an rcc folder/i })
    );
    await screen.findByTestId("folder-guide-tree");

    expect(
      screen.getByText(/never store secrets, api keys, credentials/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /does not let qresp\s*infer figure numbers, captions, scientific properties or package\s*versions without evidence/i
      )
    ).toBeInTheDocument();
  });

  it("copies the standard structure as plain text", async () => {
    const user = userEvent.setup();
    const writeText = jest.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<FolderGuide />);
    await user.click(
      screen.getByRole("button", { name: /how to organize an rcc folder/i })
    );
    await user.click(
      screen.getByRole("button", { name: /copy standard structure/i })
    );

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0];
    expect(copied).toContain("paper-folder/");
    expect(copied).toContain("  datasets/");
    expect(copied).toContain("    figure-id/");
    expect(copied).toContain("      preview.png");
    expect(copied).toContain("      notebook.ipynb");
    expect(await screen.findByText(/^copied\.$/i)).toBeInTheDocument();
  });

  it("says so when the clipboard is unavailable", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    render(<FolderGuide />);
    await user.click(
      screen.getByRole("button", { name: /how to organize an rcc folder/i })
    );
    await user.click(
      screen.getByRole("button", { name: /copy standard structure/i })
    );
    expect(
      await screen.findByText(/could not copy — select the tree above/i)
    ).toBeInTheDocument();
  });

  it("states the shared standard, not a copy of it", async () => {
    // The Curator dialog and /documentation/folder-standard render the SAME
    // module. If this ever forks, a researcher can lay a folder out from the
    // public page and then be told something different here -- with no way to
    // know which one the analyzer implements.
    const user = userEvent.setup();
    render(<FolderGuide />);
    await user.click(
      screen.getByRole("button", { name: /how to organize an rcc folder/i })
    );

    const rules = await screen.findByTestId("folder-guide-standard");
    TIPS.forEach((tip) => expect(rules).toHaveTextContent(tip));
    const legacy = screen.getByTestId("folder-guide-legacy");
    LEGACY_NOTES.forEach((note) => expect(legacy).toHaveTextContent(note));
    const tree = screen.getByTestId("folder-guide-tree");
    TREE.forEach((entry) => expect(tree).toHaveTextContent(entry.name));
  });

  it("points at the public page for anyone who is not a curator here", async () => {
    const user = userEvent.setup();
    render(<FolderGuide />);
    await user.click(
      screen.getByRole("button", { name: /how to organize an rcc folder/i })
    );
    expect(
      await screen.findByTestId("folder-guide-public-link")
    ).toHaveAttribute("href", "/documentation/folder-standard");
  });

  it("closes again and leaves nothing behind", async () => {
    const user = userEvent.setup();
    render(<FolderGuide />);
    await user.click(
      screen.getByRole("button", { name: /how to organize an rcc folder/i })
    );
    await screen.findByTestId("folder-guide-tree");

    await user.click(screen.getByRole("button", { name: /^close$/i }));
    await waitForElementToBeRemoved(() =>
      screen.queryByTestId("folder-guide-tree")
    );
    // Advice only: it stores nothing.
    expect(localStorage.length).toBe(0);
  });
});
