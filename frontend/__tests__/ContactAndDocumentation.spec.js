import { render, screen } from "@testing-library/react";

import Contact, {
  EMAIL,
  ISSUES,
  MAILTO,
  PULL_REQUESTS,
  REPOSITORY,
} from "../pages/contact";
import Documentation, {
  FOLDER_STANDARD_PATH,
} from "../pages/documentation";
import FolderStandardPage from "../pages/documentation/folder-standard";
import {
  TIPS,
  TREE,
  TREE_TEXT,
} from "../components/FolderStandard/content";
import Header from "../components/header";

jest.mock("next/router", () => ({
  useRouter: () => ({ pathname: "/", asPath: "/", push: jest.fn() }),
}));

jest.mock("../components/AuthControls", () => {
  const AuthControls = () => null;
  return AuthControls;
});

describe("the Contact page", () => {
  it("shows the DataDev address as readable text", () => {
    // A bare `mailto:` in the navigation bar showed the address to nobody:
    // it either opened a mail client or, with none configured, did nothing.
    render(<Contact />);
    expect(screen.getAllByText(EMAIL).length).toBeGreaterThan(0);
    expect(EMAIL).toBe("datadev@lists.uchicago.edu");
  });

  it("links the address inline, with no button", () => {
    // An address is a fact to read, not a call to action. The mail client
    // stays one click away; the subject is pre-filled so whoever reads a
    // shared inbox can sort this mail without opening it.
    render(<Contact />);
    const link = screen.getByTestId("email-datadev");
    expect(link).toHaveAttribute("href", MAILTO);
    expect(MAILTO).toBe("mailto:datadev@lists.uchicago.edu?subject=Qresp");
    expect(link).toHaveTextContent(EMAIL);
    expect(link.tagName).toBe("A");
    expect(
      screen.queryByRole("button", { name: /email/i })
    ).not.toBeInTheDocument();
  });

  it("points at the canonical project repository, never a personal fork", () => {
    render(<Contact />);
    [REPOSITORY, ISSUES, PULL_REQUESTS].forEach((href) => {
      expect(href).toContain("github.com/qresp-code-development/qresp");
      expect(href).not.toMatch(/hongsimi7/i);
    });
  });

  it("says questions, bugs and feature requests all have a home", () => {
    const { container } = render(<Contact />);
    expect(container.textContent).toMatch(/questions about qresp/i);
    expect(container.textContent).toMatch(/bug report/i);
    expect(container.textContent).toMatch(/feature request/i);
  });

  it("links the repository, the issue tracker and pull requests", () => {
    render(<Contact />);
    expect(REPOSITORY).toBe("https://github.com/qresp-code-development/qresp");
    expect(ISSUES).toBe(`${REPOSITORY}/issues`);
    expect(PULL_REQUESTS).toBe(`${REPOSITORY}/pulls`);
    [REPOSITORY, ISSUES, PULL_REQUESTS].forEach((href) => {
      const link = screen
        .getAllByRole("link")
        .find((node) => node.getAttribute("href") === href);
      expect(link).toBeDefined();
    });
  });

  it("names each external link by where it goes", () => {
    // A link read out of context still has to say what it does; "click here"
    // does not.
    render(<Contact />);
    expect(
      screen.getByRole("link", { name: /open an issue in the qresp issue tracker/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /open a pull request/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /qresp on github/i })
    ).toBeInTheDocument();
  });

  it("opens external links safely and says that they open a new tab", () => {
    render(<Contact />);
    [REPOSITORY, ISSUES, PULL_REQUESTS].forEach((href) => {
      const link = screen
        .getAllByRole("link")
        .find((node) => node.getAttribute("href") === href);
      expect(link).toHaveAttribute("target", "_blank");
      // `noopener` denies the opened page a handle on this one; `noreferrer`
      // keeps the referring URL out of the request.
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("rel")).toContain("noreferrer");
      expect(link).toHaveTextContent(/opens in a new tab/i);
    });
  });
});

describe("the navigation entry points", () => {
  it("sends Contact to the page rather than to a mail client", () => {
    render(<Header />);
    const contact = screen.getAllByRole("link", { name: /^contact$/i })[0];
    expect(contact).toHaveAttribute("href", "/contact");
    expect(contact.getAttribute("href")).not.toMatch(/^mailto:/);
  });

  it("sends Documentation to the in-app page", () => {
    render(<Header />);
    const docs = screen.getAllByRole("link", { name: /^documentation$/i })[0];
    expect(docs).toHaveAttribute("href", "/documentation");
  });
});

// The Folder Standard was reachable only from a dialog inside the Curator --
// the wrong audience and the wrong moment for a researcher laying out a folder
// before anyone curates it. It now has a URL.
describe("the public Folder Standard page", () => {
  it("renders the standard, its tree and its rules", () => {
    render(<FolderStandardPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /qresp folder standard v1/i })
    ).toBeInTheDocument();
    const tree = screen.getByTestId("folder-guide-tree");
    ["paper-folder/", "datasets/", "charts/", "scripts/", "tools/", "docs/"]
      .forEach((entry) => expect(tree).toHaveTextContent(entry));
    expect(screen.getByTestId("folder-guide-standard")).toBeInTheDocument();
  });

  it("keeps the copy action the Curator guide has", () => {
    render(<FolderStandardPage />);
    expect(
      screen.getByRole("button", { name: /copy standard structure/i })
    ).toBeInTheDocument();
  });

  it("keeps the legacy-folder notes visibly separate from the standard", () => {
    // A compatibility path read as a second, looser layout is how a new paper
    // ends up organized the old way on purpose.
    render(<FolderStandardPage />);
    expect(
      screen.getByRole("heading", { name: /several images in one figure folder/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("folder-guide-legacy")).toBeInTheDocument();
  });

  it("offers a way back to the documentation index", () => {
    render(<FolderStandardPage />);
    expect(screen.getByTestId("back-to-documentation")).toHaveAttribute(
      "href",
      "/documentation"
    );
  });

  it("renders the SAME standard the Curator dialog does, not a copy", () => {
    // The failure this prevents: a researcher lays a folder out from the
    // public page, then the Curator describes a different layout. Both
    // surfaces import components/FolderStandard/content, so a rule added in
    // one appears in the other or in neither.
    render(<FolderStandardPage />);
    const page = screen.getByTestId("folder-guide-standard").textContent;
    TIPS.forEach((tip) => expect(page).toContain(tip));
    const tree = screen.getByTestId("folder-guide-tree").textContent;
    TREE.forEach((entry) => expect(tree).toContain(entry.name));
    // And the copyable text is derived from the drawn tree, so what lands on
    // a clipboard cannot drift from what was read.
    TREE.forEach((entry) => expect(TREE_TEXT).toContain(entry.name));
  });
});

// ONE published folder structure, and it is the Folder Standard. The index
// used to carry a second, general research-package template (project/,
// data/raw/, data/processed/, figures/) with a copy button of its own. Two
// copyable structures side by side asked a reader to choose, and the one they
// were most likely to copy was the one on this page -- which the RCC analyzer
// does not read.
describe("the documentation index points at the standard", () => {
  it("links the Folder Standard page", () => {
    render(<Documentation />);
    expect(screen.getByTestId("folder-standard-link")).toHaveAttribute(
      "href",
      FOLDER_STANDARD_PATH
    );
    expect(FOLDER_STANDARD_PATH).toBe("/documentation/folder-standard");
  });

  it("names the Folder Standard as the layout Qresp reads", () => {
    render(<Documentation />);
    const callout = screen.getByTestId("folder-standard-callout");
    expect(callout).toHaveTextContent(/qresp folder standard v1/i);
  });

  it("publishes no second folder structure of its own", () => {
    const { container } = render(<Documentation />);
    // The general template, its copy button, and its status line are gone --
    // not relabelled. A caveat under a copy button is no match for the button.
    expect(screen.queryByTestId("directory-template")).toBeNull();
    expect(screen.queryByTestId("copy-template")).toBeNull();
    expect(screen.queryByTestId("copy-status")).toBeNull();
    // The standard's own tree is not restated here either; it lives on one
    // page, and this one links to it.
    expect(screen.queryByTestId("folder-guide-tree")).toBeNull();
    // No <pre> block: there is nothing on this page to copy.
    expect(container.querySelector("pre")).toBeNull();
  });

  it("does not suggest the folder names the analyzer does not read", () => {
    // `figures/` and `data/raw/` are not `charts/` and `datasets/`. Offering
    // them as a structure to follow is what made the two pages contradict.
    const { container } = render(<Documentation />);
    const text = container.textContent;
    expect(text).not.toMatch(/figures\//);
    expect(text).not.toMatch(/data\/raw\//);
    expect(text).not.toMatch(/data\/processed\//);
    expect(text).not.toMatch(/\bproject\/\s*$/m);
  });

  it("uses no wording that reads as a second, looser example", () => {
    const { container } = render(<Documentation />);
    const text = container.textContent;
    expect(text).not.toMatch(/reasonable (general )?default/i);
    expect(text).not.toMatch(/example (project )?(directory )?structure/i);
    expect(text).not.toMatch(/general(-purpose)? (template|layout)/i);
  });

  it("still says legacy folder names keep working", () => {
    // Removing a SUGGESTION from the docs must not read as removing SUPPORT.
    // The analyzer's legacy aliases are untouched.
    const { container } = render(<Documentation />);
    expect(container.textContent).toMatch(/keep working/i);
    expect(container.textContent).toMatch(/Figures_Tables|Plot_Scripts/);
  });
});
