import fs from "fs";
import path from "path";

import { render, screen, within } from "@testing-library/react";

import { DOCS_NAV, DOCS_PAGES, neighbours } from "../components/Docs/nav";
import { SCHEMAS } from "../pages/documentation/download";

// Every page the table of contents lists, keyed by its URL. A page added to
// the nav without a module here fails the first test below.
const PAGES = {
  "/documentation": require("../pages/documentation").default,
  "/documentation/about": require("../pages/documentation/about").default,
  "/documentation/curation-and-exploration": require("../pages/documentation/curation-and-exploration").default,
  "/documentation/download": require("../pages/documentation/download").default,
  "/documentation/installation": require("../pages/documentation/installation").default,
  "/documentation/installation/qresp": require("../pages/documentation/installation/qresp").default,
  "/documentation/installation/qresp-organizer": require("../pages/documentation/installation/qresp-organizer").default,
  "/documentation/tutorial": require("../pages/documentation/tutorial").default,
  "/documentation/tutorial/data-organization": require("../pages/documentation/tutorial/data-organization").default,
  "/documentation/folder-standard": require("../pages/documentation/folder-standard").default,
  "/documentation/tutorial/curation": require("../pages/documentation/tutorial/curation").default,
  "/documentation/tutorial/metadata-collection": require("../pages/documentation/tutorial/metadata-collection").default,
  "/documentation/tutorial/exploration": require("../pages/documentation/tutorial/exploration").default,
  "/documentation/reference": require("../pages/documentation/reference").default,
};

const PUBLIC = path.join(__dirname, "..", "public");

describe("the documentation table of contents", () => {
  it("lists exactly the pages that exist", () => {
    expect(DOCS_PAGES.map((page) => page.href).sort()).toEqual(Object.keys(PAGES).sort());
  });

  it("has no duplicate entries", () => {
    const hrefs = DOCS_PAGES.map((page) => page.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("chains previous and next through every page in order", () => {
    expect(neighbours(DOCS_PAGES[0].href).previous).toBeNull();
    expect(neighbours(DOCS_PAGES[DOCS_PAGES.length - 1].href).next).toBeNull();
    DOCS_PAGES.slice(1).forEach((page, index) => {
      expect(neighbours(page.href).previous).toEqual(DOCS_PAGES[index]);
    });
  });

  it("covers every section of the qresp.org manual", () => {
    expect(DOCS_NAV.map((section) => section.group)).toEqual([
      "Getting started",
      "Installation",
      "Tutorial",
      "Reference",
    ]);
  });
});

describe.each(Object.entries(PAGES))("the documentation page %s", (href, Page) => {
  it("renders one level-1 heading", () => {
    render(<Page />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("marks itself as the current page in the contents", () => {
    render(<Page />);
    const nav = screen.getByRole("navigation", { name: "Documentation" });
    const current = within(nav).getByRole("link", { current: "page" });
    expect(current).toHaveAttribute("href", href);
  });

  it("opens every external link safely in a new tab", () => {
    const { container } = render(<Page />);
    container.querySelectorAll('a[href^="http"]').forEach((link) => {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("rel")).toContain("noreferrer");
    });
  });
});

describe("the documentation content", () => {
  const show = (href) => {
    const Page = PAGES[href];
    return render(<Page />);
  };
  const textOf = (href) => show(href).container.textContent;

  it("describes the four steps of curation and exploration", () => {
    const text = textOf("/documentation/about");
    ["Paper Organization", "Metadata Generation", "Metadata Collection", "Paper Exploration"]
      .forEach((step) => expect(text).toContain(step));
  });

  it("lists the active Qresp nodes", () => {
    const text = textOf("/documentation/curation-and-exploration");
    expect(text).toContain("https://paperstack.uchicago.edu");
    expect(text).toContain("https://qresp.hybrid3.duke.edu/");
  });

  it("gives the Docker install commands and the main environment variables", () => {
    const text = textOf("/documentation/installation/qresp");
    expect(text).toContain("cp .env.prod.example .env.prod");
    expect(text).toContain("docker-compose up -d --build");
    ["QRESP_FLASK_SECRET_KEY", "QRESP_GOOGLE_CLIENT_ID", "QRESP_GOOGLE_REDIRECT_URI",
      "QRESP_FROM_ADDR", "QRESP_MAIL_PWD", "QRESP_SMTP_SERVER", "QRESP_SMTP_PORT",
      "QRESP_ADMIN_EMAILS", "QRESP_MONGODB_HOST", "QRESP_MONGODB_USERNAME",
      "QRESP_MONGODB_PASSWORD"]
      .forEach((name) => expect(text).toContain(name));
  });

  it("documents every qresp_config command", () => {
    const text = textOf("/documentation/installation/qresp-organizer");
    ["pip install qresp_config", "qresp_config collection", "qresp_config paper",
      "qresp_config zenodo upload"].forEach((command) => expect(text).toContain(command));
  });

  it("walks through every Curator section", () => {
    const text = textOf("/documentation/tutorial/curation");
    ["Curator Information", "Access Paper Content", "Paper Information", "Charts",
      "Tools", "Datasets", "Scripts", "Workflow", "License", "Publish Metadata",
      "Preview", "Finish"].forEach((section) => expect(text).toContain(section));
  });

  it("gives the citation with its DOI", () => {
    show("/documentation/reference");
    expect(
      screen.getByRole("link", { name: /10\.1038\/sdata\.2019\.2/ })
    ).toHaveAttribute("href", "https://doi.org/10.1038/sdata.2019.2");
  });

  it("does not redraw a second folder layout on the data organization page", () => {
    // The Folder Standard is the one published layout; this page names the
    // roles and links to it.
    show("/documentation/tutorial/data-organization");
    expect(screen.queryByTestId("folder-guide-tree")).toBeNull();
    expect(
      screen.getByRole("link", { name: /read the qresp folder standard v1/i })
    ).toHaveAttribute("href", "/documentation/folder-standard");
  });
});

describe("the downloadable schema files", () => {
  it.each(SCHEMAS.map(({ version }) => version))("serves schema v%s as valid JSON", (version) => {
    const file = path.join(PUBLIC, "schema", `v${version}.json`);
    expect(fs.existsSync(file)).toBe(true);
    expect(() => JSON.parse(fs.readFileSync(file, "utf8"))).not.toThrow();
  });

  it("links each schema version to its file", () => {
    const Download = PAGES["/documentation/download"];
    render(<Download />);
    SCHEMAS.forEach(({ version }) => {
      expect(screen.getByRole("link", { name: version })).toHaveAttribute(
        "href",
        `/schema/v${version}.json`
      );
    });
  });
});
