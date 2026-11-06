import { Fragment, useContext } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
import axios from "axios";

jest.mock("../Utils/serverDrafts", () => ({
  saveServerDraft: jest.fn(() =>
    Promise.resolve({ id: "draft123", title: "Saved draft" })
  ),
  loadServerDraft: jest.fn(),
}));
import { saveServerDraft } from "../Utils/serverDrafts";

import CuratorState from "../Context/Curator/CuratorState";
import CuratorContext from "../Context/Curator/curatorContext";
import ReferenceInfoForm from "../components/CuratorForms/ReferenceInfoForm";
import PaperInfoForm from "../components/CuratorForms/PaperInfoForm";
import SourceTreeContext from "../Context/SourceTree/SourceTreeContext";
import AlertContext from "../Context/Alert/alertContext";
import LoadingContext from "../Context/Loading/loadingContext";

// Save Draft has to capture what is ON THE SCREEN, not what has been
// committed. A curator who fetches a DOI and then saves a draft without first
// pressing the section's own Save is doing something completely reasonable,
// and losing that work is the worst possible outcome for a draft feature.

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

const SaveDraftButton = () => {
  const { saveDraftToServer } = useContext(CuratorContext);
  return (
    <button type="button" onClick={() => saveDraftToServer("My draft")}>
      Save Draft
    </button>
  );
};

const renderCurator = () => {
  const editor = jest.fn();
  render(
    <CuratorState draftKey={null}>
      <AlertContext.Provider value={{ setAlert: jest.fn() }}>
        <LoadingContext.Provider
          value={{ showLoader: jest.fn(), hideLoader: jest.fn() }}
        >
          <ReferenceInfoForm editor={editor} />
          <SaveDraftButton />
        </LoadingContext.Provider>
      </AlertContext.Provider>
    </CuratorState>
  );
  return { editor };
};

const savedReference = () => {
  const [, state] = saveServerDraft.mock.calls[0];
  return state.referenceInfo;
};

describe("Save Draft captures the open Publication Information form", () => {
  beforeEach(() => jest.clearAllMocks());

  const fetchDoi = async (user) => {
    axios.get.mockResolvedValue({ data: CROSSREF });
    await user.type(
      screen.getByPlaceholderText(/enter doi of the paper/i),
      "10.1021/jacs.6b00225"
    );
    await user.click(screen.getByRole("button", { name: /^fetch$/i }));
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/enter title/i)).toHaveValue(
        "Registry Title"
      )
    );
  };

  it("keeps every DOI-fetched value when the section was never saved",
     async () => {
    const user = userEvent.setup();
    const { editor } = renderCurator();

    await fetchDoi(user);
    // Deliberately NOT pressing the section's Save.
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(saveServerDraft).toHaveBeenCalledTimes(1));
    const reference = savedReference();
    expect(reference.title).toBe("Registry Title");
    expect(reference.abstract).toBe("Registry abstract.");
    expect(reference.doi).toBe("10.1021/jacs.6b00225");
    expect(reference.url).toBe("https://doi.org/10.1021/jacs.6b00225");
    expect(reference.year).toBe("2021");
    expect(reference.authors).toMatch(/Lovelace/);
    // journal, volume and page ride in the one publication string.
    expect(reference.publication).toMatch(/Journal of Computing/);
    expect(reference.publication).toMatch(/12/);
    expect(reference.publication).toMatch(/100-110/);

    // Saving a draft is not saving the section.
    expect(editor).not.toHaveBeenCalled();
  });

  it("keeps values typed by hand when the section was never saved",
     async () => {
    const user = userEvent.setup();
    renderCurator();

    await user.type(screen.getByPlaceholderText(/enter title/i), "Typed title");
    await user.type(
      screen.getByPlaceholderText(/enter abstract/i),
      "Typed abstract"
    );
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(saveServerDraft).toHaveBeenCalledTimes(1));
    expect(savedReference().title).toBe("Typed title");
    expect(savedReference().abstract).toBe("Typed abstract");
  });

  it("saves a draft even though required fields are still empty", async () => {
    const user = userEvent.setup();
    renderCurator();

    await user.type(screen.getByPlaceholderText(/enter title/i), "Only a title");
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    // No yup validation, no handleSubmit: an incomplete draft still saves.
    await waitFor(() => expect(saveServerDraft).toHaveBeenCalledTimes(1));
    expect(savedReference().title).toBe("Only a title");
    expect(screen.queryByText(/^required$/i)).toBeNull();
  });

  it("leaves the section open and in edit mode", async () => {
    const user = userEvent.setup();
    const { editor } = renderCurator();

    await fetchDoi(user);
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(saveServerDraft).toHaveBeenCalled());
    expect(editor).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
    // ...and the fetched values are still on screen.
    expect(screen.getByPlaceholderText(/enter title/i)).toHaveValue(
      "Registry Title"
    );
  });
});

// Resume is the other half: a draft that saves correctly but comes back empty
// is the same data loss seen one step later. The form tree is mounted before
// the draft fetch resolves, and react-hook-form reads defaultValues ONLY at
// mount, so applying a draft to context alone leaves the inputs showing the
// values they had when the page loaded -- blank.
describe("Resuming a draft re-seeds the open form", () => {
  beforeEach(() => jest.clearAllMocks());

  const DRAFT = {
    id: "draft123",
    title: "My draft",
    state: {
      referenceInfo: {
        kind: "journal",
        doi: "10.1021/jacs.6b00225",
        authors: "Ada Lovelace",
        title: "Registry Title",
        publication: "Journal of Computing 2021, 12 ,100-110",
        year: 2021,
        url: "https://doi.org/10.1021/jacs.6b00225",
        abstract: "Registry abstract.",
      },
    },
  };

  const ResumeButton = () => {
    const { applyServerDraft } = useContext(CuratorContext);
    return (
      <button type="button" onClick={() => applyServerDraft(DRAFT)}>
        Resume
      </button>
    );
  };

  const renderWithResume = () => {
    const Tree = () => {
      const { resetVersion: version } = useContext(CuratorContext);
      return (
        <Fragment key={version}>
          <ReferenceInfoForm editor={jest.fn()} />
        </Fragment>
      );
    };
    render(
      <CuratorState draftKey={null}>
        <AlertContext.Provider value={{ setAlert: jest.fn() }}>
          <LoadingContext.Provider
            value={{ showLoader: jest.fn(), hideLoader: jest.fn() }}
          >
            <Tree />
            <ResumeButton />
            <SaveDraftButton />
          </LoadingContext.Provider>
        </AlertContext.Provider>
      </CuratorState>
    );
  };

  it("shows every stored value in the inputs after Resume", async () => {
    const user = userEvent.setup();
    renderWithResume();

    // The form mounted empty, exactly as it does before the draft fetch
    // resolves in the real page.
    expect(screen.getByPlaceholderText(/enter title/i)).toHaveValue("");

    await user.click(screen.getByRole("button", { name: /resume/i }));

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/enter title/i)).toHaveValue(
        "Registry Title"
      )
    );
    expect(screen.getByPlaceholderText(/enter abstract/i)).toHaveValue(
      "Registry abstract."
    );
    expect(screen.getByPlaceholderText(/enter doi of the paper/i)).toHaveValue(
      "10.1021/jacs.6b00225"
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
  });

  it("does not blank the draft when saved again straight after Resume",
     async () => {
    // The compounding failure: a resumed form showing blanks feeds those
    // blanks back through the flusher on the next Save Draft.
    const user = userEvent.setup();
    renderWithResume();

    await user.click(screen.getByRole("button", { name: /resume/i }));
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/enter title/i)).toHaveValue(
        "Registry Title"
      )
    );
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(saveServerDraft).toHaveBeenCalledTimes(1));
    expect(savedReference().title).toBe("Registry Title");
    expect(savedReference().abstract).toBe("Registry abstract.");
  });
});

// The same rule for the other unsaved surface: keywords applied from an AI
// suggestion live in the Qresp Curation Information form until that section
// is saved, so Save Draft has to read them off the screen too.
describe("Save Draft captures applied keywords before the section is saved",
         () => {
  beforeEach(() => jest.clearAllMocks());

  const renderPaperInfo = () => {
    render(
      <CuratorState draftKey={null}>
        <SourceTreeContext.Provider
          value={{
            setSaveMethod: jest.fn(),
            openSelector: jest.fn(),
            HideSelector: jest.fn(),
          }}
        >
          <PaperInfoForm editor={jest.fn()} />
        </SourceTreeContext.Provider>
        <SaveDraftButton />
      </CuratorState>
    );
  };

  it("keeps keywords typed into the field but never saved", async () => {
    const user = userEvent.setup();
    renderPaperInfo();

    await user.type(
      screen.getByPlaceholderText(/tags for the project/i),
      "DFT, silicon"
    );
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(saveServerDraft).toHaveBeenCalledTimes(1));
    const [, state] = saveServerDraft.mock.calls[0];
    expect(state.paperInfo.tags).toEqual(["DFT", "silicon"]);
  });
});
