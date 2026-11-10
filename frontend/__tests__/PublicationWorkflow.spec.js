import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
import axios from "axios";

import ReferenceInfoForm from "../components/CuratorForms/ReferenceInfoForm";
import PaperInfoForm from "../components/CuratorForms/PaperInfoForm";
import CuratorContext from "../Context/Curator/curatorContext";
import SourceTreeContext from "../Context/SourceTree/SourceTreeContext";
import AlertContext from "../Context/Alert/alertContext";
import LoadingContext from "../Context/Loading/loadingContext";

// The curation assistant's final scope: Publication Information is manual
// entry plus DOI Fetch, Qresp keywords are typed by hand, and the only place
// a language model is involved is RCC folder-candidate descriptions (covered
// in FolderAnalysis.spec.js). No manuscript upload, no AI here.

const reference = (overrides = {}) => ({
  kind: "journal",
  doi: "",
  authors: "Ada Lovelace",
  title: "A Title",
  publication: "Journal of Computing 2021, 12 ,100-110",
  year: 2021,
  url: "",
  abstract: "An abstract",
  ...overrides,
});

const renderForm = (overrides = {}, editor = jest.fn()) => {
  const setReferenceInfo = jest.fn();
  render(
    <CuratorContext.Provider
      value={{ referenceInfo: reference(overrides), setReferenceInfo }}
    >
      <AlertContext.Provider value={{ setAlert: jest.fn() }}>
        <LoadingContext.Provider
          value={{ showLoader: jest.fn(), hideLoader: jest.fn() }}
        >
          <ReferenceInfoForm editor={editor} />
        </LoadingContext.Provider>
      </AlertContext.Provider>
    </CuratorContext.Provider>
  );
  return { setReferenceInfo, editor };
};

describe("Publication Information: manual entry and DOI Fetch only", () => {
  beforeEach(() => jest.clearAllMocks());

  it("offers no manuscript upload of any kind", () => {
    renderForm();
    const text = document.body.textContent;
    expect(text).not.toMatch(/import manuscript source/i);
    expect(text).not.toMatch(/overleaf/i);
    expect(text).not.toMatch(/\.tex|\.zip/i);
    expect(text).not.toMatch(/selected source/i);
    // No file input survives anywhere in the section.
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("offers no AI action of any kind", () => {
    renderForm();
    const text = document.body.textContent;
    expect(text).not.toMatch(/suggest missing publication details/i);
    expect(text).not.toMatch(/\bai\b/i);
    expect(text).not.toMatch(/gemini/i);
  });

  it("keeps DOI Fetch as the only automated fill", () => {
    renderForm();
    const fetchButton = screen.getByRole("button", { name: /^fetch$/i });
    expect(fetchButton).toBeInTheDocument();
    // It must never be the form's submit control.
    expect(fetchButton).toHaveAttribute("type", "button");
  });

  it("never posts to an assist endpoint however the section is used",
     async () => {
    const user = userEvent.setup();
    renderForm();
    for (const button of screen.getAllByRole("button")) {
      if (!button.disabled) await user.click(button);
    }
    axios.post.mock.calls.forEach(([url]) => {
      expect(String(url)).not.toMatch(/\/api\/assist\//);
      expect(String(url)).not.toMatch(/\/api\/import\/manuscript/);
    });
  });
});

describe("DOI Fetch fills the form without committing it", () => {
  beforeEach(() => jest.clearAllMocks());

  const CROSSREF = {
    type: "journal-article",
    title: "Registry Title",
    "container-title": "Journal of Computing",
    page: "100-110",
    volume: "12",
    issued: { "date-parts": [[2021]] },
    URL: "https://doi.org/10.1021/jacs.6b00225",
    DOI: "10.1021/jacs.6b00225",
    abstract: "<jats:p>Registry abstract.</jats:p>",
    author: [{ given: "Ada", family: "Lovelace" }],
  };

  const fetchDoi = async (user) => {
    axios.get.mockResolvedValue({ data: CROSSREF });
    await user.type(
      screen.getByPlaceholderText(/enter doi of the paper/i),
      "10.1021/jacs.6b00225"
    );
    await user.click(screen.getByRole("button", { name: /^fetch$/i }));
  };

  it("fills the registry fields and leaves the form open and unsaved",
     async () => {
    const user = userEvent.setup();
    const { setReferenceInfo, editor } = renderForm();

    await fetchDoi(user);

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/enter title/i)).toHaveValue(
        "Registry Title"
      )
    );
    expect(
      screen.getByPlaceholderText(/enter full journal name/i)
    ).toHaveValue("Journal of Computing");
    expect(screen.getByPlaceholderText(/enter volume number/i)).toHaveValue(
      "12"
    );
    expect(screen.getByPlaceholderText(/enter page number/i)).toHaveValue(
      "100-110"
    );
    expect(screen.getByPlaceholderText(/enter year of publication/i))
      .toHaveValue("2021");
    expect(screen.getByPlaceholderText(/enter abstract/i)).toHaveValue(
      "Registry abstract."
    );
    expect(screen.getByPlaceholderText(/enter url/i)).toHaveValue(
      "https://doi.org/10.1021/jacs.6b00225"
    );

    // Nothing has been committed and the section is still editable.
    expect(setReferenceInfo).not.toHaveBeenCalled();
    expect(editor).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
  });

  it("leaves a field the registry did not supply blank rather than guessing",
     async () => {
    const user = userEvent.setup();
    renderForm({ publication: "", year: "", abstract: "" });

    axios.get.mockResolvedValue({ data: { title: "Only A Title" } });
    await user.type(
      screen.getByPlaceholderText(/enter doi of the paper/i),
      "10.1021/jacs.6b00225"
    );
    await user.click(screen.getByRole("button", { name: /^fetch$/i }));

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/enter title/i)).toHaveValue(
        "Only A Title"
      )
    );
    expect(
      screen.getByPlaceholderText(/enter full journal name/i)
    ).toHaveValue("");
    expect(screen.getByPlaceholderText(/enter volume number/i)).toHaveValue("");
  });

  it("commits and switches to display mode only on Save", async () => {
    const user = userEvent.setup();
    const { setReferenceInfo, editor } = renderForm();

    await fetchDoi(user);
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/enter title/i)).toHaveValue(
        "Registry Title"
      )
    );
    expect(setReferenceInfo).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(setReferenceInfo).toHaveBeenCalledTimes(1));
    expect(editor).toHaveBeenCalledTimes(1);
  });

  it("saves with the publication, year and abstract left empty", async () => {
    const user = userEvent.setup();
    // Nothing is required to publish, for any kind of work.
    const { setReferenceInfo, editor } = renderForm({
      publication: "",
      year: "",
      abstract: "",
    });

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(setReferenceInfo).toHaveBeenCalledTimes(1));
    expect(editor).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/^required$/i)).not.toBeInTheDocument();
  });
});

describe("Qresp Curation Information keywords are human-entered", () => {
  beforeEach(() => jest.clearAllMocks());

  const renderPaperInfo = () =>
    render(
      <CuratorContext.Provider
        value={{
          paperInfo: {
            PIs: "", collections: "", tags: "", notebookFile: "",
            notebookPath: "", ProjectName: "",
          },
          setPaperInfo: jest.fn(),
          fileServerPath: "",
          registerDraftFlusher: () => () => {},
        }}
      >
        <SourceTreeContext.Provider
          value={{
            setSaveMethod: jest.fn(),
            openSelector: jest.fn(),
            HideSelector: jest.fn(),
          }}
        >
          <PaperInfoForm editor={jest.fn()} />
        </SourceTreeContext.Provider>
      </CuratorContext.Provider>
    );

  it("offers keyword AI, but nothing that reads a manuscript", () => {
    renderPaperInfo();
    const text = document.body.textContent;
    // Keyword suggestion is back, and it lives here -- not in Publication
    // Information, and not in any import review.
    expect(
      screen.getByRole("button", { name: /suggest keywords with ai/i })
    ).toBeInTheDocument();
    // What is NOT back: the manuscript consent and full-source analysis.
    expect(text).not.toMatch(/full-source analysis/i);
    expect(text).not.toMatch(/manuscript source selected/i);
    expect(text).not.toMatch(/extracted from/i);
  });

  it("still has a Keywords field the curator types into", async () => {
    const user = userEvent.setup();
    renderPaperInfo();

    const keywords = screen.getByPlaceholderText(/tags for the project/i);
    await user.type(keywords, "dft, silicon");

    expect(keywords).toHaveValue("dft, silicon");
  });

  it("never calls the keyword assist endpoint", async () => {
    const user = userEvent.setup();
    renderPaperInfo();
    for (const button of screen.getAllByRole("button")) {
      if (!button.disabled) await user.click(button);
    }
    axios.post.mock.calls.forEach(([url]) => {
      expect(String(url)).not.toBe("/api/assist/keywords");
    });
  });
});

// The form and backend/project/schema.json enforce ONE rule set. The mirror
// image of this block is test_publish_validation.py; if either side moves,
// one of the two fails.
describe("no field is required, and a given value must still be well formed", () => {
  const FIELDS = [
    ["title", /enter title/i],
    ["journal", /enter full journal name/i],
    ["page", /enter page number/i],
    ["abstract", /enter abstract/i],
    ["volume", /enter volume number/i],
    ["year", /enter year of publication/i],
  ];

  it.each(FIELDS)("saves when %s is empty", async (field, placeholder) => {
    const user = userEvent.setup();
    const { setReferenceInfo, editor } = renderForm();

    await user.clear(screen.getByPlaceholderText(placeholder));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(setReferenceInfo).toHaveBeenCalledTimes(1));
    expect(editor).toHaveBeenCalledTimes(1);
  });

  it.each(["preprint", "dissertation"])(
    "saves a %s with no publication details",
    async (kind) => {
      const user = userEvent.setup();
      const { setReferenceInfo, editor } = renderForm({
        kind,
        publication: "",
      });

      await user.click(screen.getByRole("button", { name: /^save$/i }));

      await waitFor(() => expect(setReferenceInfo).toHaveBeenCalledTimes(1));
      expect(editor).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ["year", /enter year of publication/i, "nineteen"],
    ["year", /enter year of publication/i, "1500"],
    ["volume", /enter volume number/i, "twelve"],
    ["url", /enter url/i, "not a url"],
    ["doi", /enter doi of the paper/i, "not-a-doi"],
  ])("still refuses a malformed %s (%s)", async (field, placeholder, bad) => {
    const user = userEvent.setup();
    const { setReferenceInfo, editor } = renderForm();

    const input = screen.getByPlaceholderText(placeholder);
    await user.clear(input);
    await user.type(input, bad);
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    expect(setReferenceInfo).not.toHaveBeenCalled();
    expect(editor).not.toHaveBeenCalled();
  });

  it("saves with DOI and URL left empty", async () => {
    const user = userEvent.setup();
    const { setReferenceInfo, editor } = renderForm({ doi: "", url: "" });

    expect(screen.getByPlaceholderText(/enter doi of the paper/i)).toHaveValue(
      ""
    );
    expect(screen.getByPlaceholderText(/enter url/i)).toHaveValue("");

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(setReferenceInfo).toHaveBeenCalledTimes(1));
    expect(editor).toHaveBeenCalledTimes(1);
  });

  it("opens a legacy record whose publication string is short", () => {
    // This used to throw inside referenceUtil.get while the form built its
    // defaults, so the section never rendered at all.
    expect(() => renderForm({ publication: "arXiv:2301.00001" })).not.toThrow();
    expect(
      screen.getByPlaceholderText(/enter full journal name/i)
    ).toBeInTheDocument();
  });
});
