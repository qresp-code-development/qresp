import { render, screen } from "@testing-library/react";

// `isMixedContent` reads window.location, which jsdom pins to http and will
// not let a test redefine. The real implementation is exercised directly by
// the unit tests below; this seam is only for driving the two COMPONENT
// branches that depend on its answer. null = use the real one.
let mockMixedContent = null;
jest.mock("../Utils/fileServerUrl", () => {
  const actual = jest.requireActual("../Utils/fileServerUrl");
  return {
    __esModule: true,
    ...actual,
    isMixedContent: (url, pageUrl) =>
      mockMixedContent === null
        ? actual.isMixedContent(url, pageUrl)
        : mockMixedContent,
  };
});

// The lightbox ships ESM that jest does not transform, and it is irrelevant
// to URL building.
jest.mock("yet-another-react-lightbox", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("yet-another-react-lightbox/plugins/captions", () => ({
  __esModule: true,
  default: {},
}));
jest.mock("yet-another-react-lightbox/styles.css", () => ({}), {
  virtual: true,
});
jest.mock("yet-another-react-lightbox/plugins/captions.css", () => ({}), {
  virtual: true,
});
jest.mock("next/router", () => ({
  useRouter: () => ({ query: {}, asPath: "/curator", push: jest.fn() }),
}));

import buildFileUrl, {
  isMixedContent,
  buildDirectoryUrl,
} from "../Utils/fileServerUrl";
import ChartsInfo from "../components/Paper/Charts";
import AlertContext from "../Context/Alert/alertContext";
import LoadingContext from "../Context/Loading/loadingContext";

const ROOT = "https://notebook.rcc.uchicago.edu/files/10.1021.acs.jpcc.5c01077";

describe("file server URL building", () => {
  it("joins a saved root and a relative path", () => {
    expect(buildFileUrl(ROOT, "figures/figure1.png")).toBe(
      `${ROOT}/figures/figure1.png`
    );
  });

  it("normalizes the leading slash the manual picker leaves behind", () => {
    // Utils/Scraper.node strips the server prefix and leaves "/figures/...",
    // which used to produce a double slash.
    expect(buildFileUrl(ROOT, "/figures/figure1.png")).toBe(
      `${ROOT}/figures/figure1.png`
    );
    expect(buildFileUrl(`${ROOT}/`, "/figures/figure1.png")).toBe(
      `${ROOT}/figures/figure1.png`
    );
  });

  it("encodes segments but keeps separators", () => {
    expect(buildFileUrl(ROOT, "my figures/fig #1.png")).toBe(
      `${ROOT}/my%20figures/fig%20%231.png`
    );
  });

  it("does not double-encode an already encoded path", () => {
    expect(buildFileUrl(ROOT, "my%20figures/a.png")).toBe(
      `${ROOT}/my%20figures/a.png`
    );
  });

  it("returns nothing when there is no root or no path", () => {
    // This is the real failure: a chart applied from folder analysis before
    // "Save File Server" had no root, so "" + "/" + path pointed at the
    // Qresp origin and rendered blank.
    expect(buildFileUrl("", "figures/figure1.png")).toBe("");
    expect(buildFileUrl(ROOT, "")).toBe("");
    expect(buildFileUrl(undefined, undefined)).toBe("");
  });

  it("builds the containing directory link", () => {
    expect(buildDirectoryUrl(ROOT, "figures/figure1.png")).toBe(
      `${ROOT}/figures`
    );
    expect(buildDirectoryUrl(ROOT, "/a/b/c.png")).toBe(`${ROOT}/a/b`);
    expect(buildDirectoryUrl("", "a/b.png")).toBe("");
  });
});

const renderCharts = (charts, fileserverpath) =>
  render(
    <AlertContext.Provider value={{ setAlert: jest.fn() }}>
      <LoadingContext.Provider
        value={{ showLoader: jest.fn(), hideLoader: jest.fn() }}
      >
        <ChartsInfo
          charts={charts}
          fileserverpath={fileserverpath}
          showSlider={false}
          inDrawer={false}
        />
      </LoadingContext.Provider>
    </AlertContext.Provider>
  );

const analyzedChart = {
  id: "c0",
  imageFile: "figures/figure1.png",
  caption: "",
  number: "",
  properties: [],
  files: [],
  notebookFile: "",
};

// A chart added the manual way: Scraper.node leaves a leading slash.
const manualChart = {
  id: "c1",
  imageFile: "/figures/figure2.png",
  caption: "Hand written caption",
  number: "2",
  properties: ["dft"],
  files: [],
  notebookFile: "",
};

describe("Chart image rendering", () => {
  it("renders a folder-analysis chart against the saved file server path", () => {
    renderCharts([analyzedChart], ROOT);
    const image = screen.getByTestId("chart-image");
    expect(image).toHaveAttribute("src", `${ROOT}/figures/figure1.png`);
  });

  it("renders a manually curated chart exactly as before", () => {
    renderCharts([manualChart], ROOT);
    const image = screen.getByTestId("chart-image");
    // Same URL, now without the stray double slash.
    expect(image).toHaveAttribute("src", `${ROOT}/figures/figure2.png`);
    expect(image).toHaveAttribute("alt", "Hand written caption");
  });

  it("explains itself instead of rendering a blank chart with no server path", () => {
    renderCharts([analyzedChart], "");
    expect(screen.queryByTestId("chart-image")).toBeNull();
    expect(screen.getByTestId("chart-image-missing")).toHaveTextContent(
      /file server path not saved/i
    );
  });

  it("says so when the chart has no image file at all", () => {
    renderCharts([{ ...analyzedChart, imageFile: "" }], ROOT);
    expect(screen.getByTestId("chart-image-missing")).toHaveTextContent(
      /figure image not selected/i
    );
  });

  it("shows a labelled failure when the image cannot be loaded", () => {
    renderCharts([analyzedChart], ROOT);
    const image = screen.getByTestId("chart-image");
    const note = screen.getByTestId("chart-image-error");
    expect(note).not.toBeVisible();

    // Simulate the browser failing to fetch the file.
    image.dispatchEvent(new Event("error", { bubbles: false }));
    expect(note).toHaveTextContent(/image unavailable from the rcc file server/i);
  });
});

// Each way an image can fail needs a different thing from the reader, so each
// says something different. A browser refusing the RCC certificate looks
// exactly like a 404 from the page's side -- both are named rather than
// guessed between, and the URL is shown verbatim so it can be tried by hand.
describe("image failures are told apart", () => {
  const CASES = [
    ["File Server path not saved", { imageFile: "figures/f1.png" }, ""],
    ["Figure Image not selected", { imageFile: "" }, ROOT],
    ["Invalid image path", { imageFile: "../../etc/passwd" }, ROOT],
    ["Invalid image path", { imageFile: "https://elsewhere.example/x.png" },
     ROOT],
    ["Invalid image path",
     { imageFile: "figures" + String.fromCharCode(92) + "f1.png" },
     ROOT],
  ];

  it.each(CASES)("says %s", (expected, overrides, server) => {
    renderCharts([{ ...analyzedChart, ...overrides }], server);
    expect(screen.queryByTestId("chart-image")).toBeNull();
    expect(screen.getByTestId("chart-image-missing")).toHaveTextContent(
      expected
    );
  });

  // The one remote cause that IS knowable from inside the page. An https page
  // may not load an http sub-resource: the browser refuses before any request
  // is made, and the <img> errors exactly as it would on a 404. Blaming the
  // certificate there sends the reader to fix something that is not broken.
  describe("an http file server on an https page", () => {
    // Never leaks into another test: the default is the real detector.
    afterEach(() => {
      mockMixedContent = null;
    });

    const HTTPS_PAGE = "https://qresp.example.org/paperdetails/1";
    const HTTP_PAGE = "http://qresp.example.org/paperdetails/1";

    it("is recognised before the request, from the URL alone", () => {
      expect(
        isMixedContent("http://files.example.org/a.png", HTTPS_PAGE)
      ).toBe(true);
      expect(
        isMixedContent("https://files.example.org/a.png", HTTPS_PAGE)
      ).toBe(false);
    });

    it("is not claimed on an http page, where it is not a problem", () => {
      expect(
        isMixedContent("http://files.example.org/a.png", HTTP_PAGE)
      ).toBe(false);
    });

    it("says nothing it cannot establish", () => {
      // An unparseable URL, and no page to compare against, are both
      // "cannot tell" -- which must read as false, not as an accusation.
      expect(isMixedContent("", HTTPS_PAGE)).toBe(false);
      expect(isMixedContent("http://files.example.org/a.png", "")).toBe(false);
      expect(isMixedContent("http://files.example.org/a.png", "not a url")).toBe(
        false
      );
    });

    it("treats a protocol-relative URL as the page's own protocol", () => {
      expect(isMixedContent("//files.example.org/a.png", HTTPS_PAGE)).toBe(
        false
      );
    });

    // What the reader is told when it IS mixed content. jsdom serves the test
    // page over http and will not let `window.location` be redefined, so the
    // detector is driven directly rather than by faking the page's origin.
    it("names the real fix instead of the certificate", () => {
      mockMixedContent = true;
      renderCharts([analyzedChart], "http://files.example.org/paper");
      const note = screen.getByTestId("chart-image-error");
      expect(note).toHaveTextContent(/blocked/i);
      expect(note).toHaveTextContent(/https:\/\//i);
      expect(note).not.toHaveTextContent(/image unavailable from the rcc/i);
      // Both escape hatches remain, and Open image still points at the file.
      const links = note.querySelectorAll("a");
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute(
        "href",
        "http://files.example.org/paper/figures/figure1.png"
      );
    });

    it("keeps the certificate wording for every other remote failure", () => {
      mockMixedContent = false;
      renderCharts([analyzedChart], ROOT);
      const note = screen.getByTestId("chart-image-error");
      expect(note).toHaveTextContent(/image unavailable from the rcc file server/i);
      expect(note).not.toHaveTextContent(/blocked/i);
    });
  });

  it("says one short line and offers the two actions", () => {
    // Deliberately terse. Qresp cannot tell a moved file from an unpublished
    // directory from an expired certificate (Chrome's
    // NET::ERR_CERT_DATE_INVALID) from inside the page, and must not work
    // around any of them -- so the note states what is certainly true and
    // Open image is what shows the reader the browser's own reason.
    renderCharts([analyzedChart], ROOT);
    const note = screen.getByTestId("chart-image-error");

    expect(note).toHaveTextContent(/image unavailable from the rcc file server/i);
    // The old paragraph is gone, including the guess it used to make.
    expect(note).not.toHaveTextContent(/remote image could not be loaded/i);
    expect(note).not.toHaveTextContent(/may not trust the rcc certificate/i);
    expect(note.textContent.trim().length).toBeLessThan(120);
    // The note starts hidden and is revealed by the img onError handler, so
    // its links are read from the node rather than by page role.
    const links = Array.from(note.querySelectorAll("a")).map((anchor) => ({
      text: anchor.textContent.trim(),
      href: anchor.getAttribute("href"),
    }));
    expect(links.map((link) => link.text)).toEqual([
      "Open image",
      "Check file server access",
    ]);
    expect(links[0].href).toBe(
      `${ROOT}/${analyzedChart.imageFile}`.replace(/ /g, "%20")
    );
  });
});

describe("PDF chart figures", () => {
  const pdfChart = {
    id: "c2",
    imageFile: "/Figures_Tables/Figure1.pdf",
    caption: "Energy levels",
    number: "1",
    properties: [],
    files: [],
    notebookFile: "",
  };

  it("embeds a PDF figure in the browser's PDF viewer instead of an <img>", () => {
    renderCharts([pdfChart], ROOT);
    expect(screen.queryByTestId("chart-image")).toBeNull();
    const viewer = screen.getByTestId("chart-pdf");
    expect(viewer.tagName).toBe("OBJECT");
    expect(viewer).toHaveAttribute("type", "application/pdf");
    expect(viewer.getAttribute("data")).toMatch(
      new RegExp(`^${ROOT}/Figures_Tables/Figure1\\.pdf#`)
    );
    expect(screen.getByTestId("chart-pdf-open")).toHaveAttribute(
      "href",
      `${ROOT}/Figures_Tables/Figure1.pdf`
    );
  });

  it("recognises PDFs case-insensitively and ignores query strings", () => {
    const { isPdfFile } = require("../components/Paper/Charts");
    expect(isPdfFile("a/FIG.PDF")).toBe(true);
    expect(isPdfFile("a/fig.pdf?raw=1")).toBe(true);
    expect(isPdfFile("a/fig.png")).toBe(false);
    expect(isPdfFile("a/pdf.png")).toBe(false);
  });

  it("still renders image figures as images alongside PDFs", () => {
    renderCharts([pdfChart, analyzedChart], ROOT);
    expect(screen.getByTestId("chart-pdf")).toBeInTheDocument();
    expect(screen.getByTestId("chart-image")).toBeInTheDocument();
  });
});

describe("chart details column", () => {
  it("shows the figure number, caption and key words beside the figure", () => {
    renderCharts(
      [{ id: "c3", imageFile: "/Figures_Tables/Figure2.png", caption: "Band structure of MgO.",
         number: "2", properties: ["band gap", "MgO"], files: [], notebookFile: "" }],
      ROOT
    );
    const details = screen.getByTestId("chart-details");
    expect(details).toHaveTextContent("Figure 2");
    expect(details).toHaveTextContent("Band structure of MgO.");
    expect(details).toHaveTextContent(/key words/i);
    expect(screen.getByText("band gap")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /expand figure 2/i })).toBeInTheDocument();
    expect(screen.queryByText(/^properties$/i)).toBeNull();
  });

  it("labels tables as written", () => {
    const { figureLabel } = require("../components/Paper/Charts");
    expect(figureLabel("S1")).toBe("Figure S1");
    expect(figureLabel("Table 1")).toBe("Table 1");
    expect(figureLabel("")).toBe("");
  });
});
