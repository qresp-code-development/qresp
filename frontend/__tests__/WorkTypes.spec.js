import { useContext } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
jest.mock("next/router", () => ({
  __esModule: true,
  default: { push: jest.fn() },
  useRouter: () => ({ pathname: "/curator", query: {}, asPath: "/curator" }),
}));

import ReferenceInfoForm from "../components/CuratorForms/ReferenceInfoForm";
import WorkTypeChooser, { WorkTypeBadge } from "../components/CuratorElements/WorkTypeChooser";
import { isCompleteReference } from "../components/CuratorElements/ReferenceElement";
import Summary from "../components/Paper/Summary";
import ReferenceInfo from "../components/Paper/Reference";
import { validate } from "../components/CuratorElements/Publish";
import CuratorContext from "../Context/Curator/curatorContext";
import CuratorState from "../Context/Curator/CuratorState";
import AlertContext from "../Context/Alert/alertContext";
import LoadingContext from "../Context/Loading/loadingContext";
import AuthContext from "../Context/Auth/authContext";
import { TableSearchContext } from "../components/Table/TableSearch";
import { convertReqSchematoState, convertStatetoReqSchema } from "../Utils/model";
import { WORK_TYPE_KEYS, codeHostOf, isRepoFilesPath, needsFolder, needsRepoUrl, workTypeOf } from "../Utils/workTypes";
import { buildImageUrl, rawFileUrl } from "../Utils/fileServerUrl";

const ShowType = () => {
  const { workType } = useContext(CuratorContext);
  return <div data-testid="state-work-type">{workType || "(none)"}</div>;
};

describe("choosing what to curate", () => {
  it("offers every work type and records the choice", async () => {
    const user = userEvent.setup();
    render(
      <CuratorState draftKey={null}>
        <WorkTypeChooser />
        <ShowType />
      </CuratorState>
    );
    expect(screen.getByText(/what are you curating\?/i)).toBeInTheDocument();
    WORK_TYPE_KEYS.forEach((type) =>
      expect(screen.getByTestId(`work-type-${type}`)).toBeInTheDocument()
    );
    expect(screen.getByTestId("state-work-type")).toHaveTextContent("(none)");
    await user.click(screen.getByTestId("work-type-software"));
    expect(screen.getByTestId("state-work-type")).toHaveTextContent("software");
  });

  it("lets the type be changed later from the header", async () => {
    const user = userEvent.setup();
    const setWorkType = jest.fn();
    render(
      <CuratorContext.Provider value={{ workType: "dataset", setWorkType }}>
        <WorkTypeBadge />
      </CuratorContext.Provider>
    );
    expect(screen.getByTestId("work-type-current")).toHaveTextContent("Dataset");
    await user.click(screen.getByTestId("work-type-change"));
    await user.click(within(screen.getByRole("dialog")).getByTestId("work-type-report"));
    expect(setWorkType).toHaveBeenCalledWith("report");
  });
});

describe("where a code repository's code lives", () => {
  const URL = "https://github.com/a/b";
  const FOLDER = "https://notebook.rcc.uchicago.edu/files/x";

  it("uses the curator's choice", () => {
    expect(codeHostOf({ codeHost: "fileserver", referenceInfo: { url: URL } })).toBe("fileserver");
  });

  it("otherwise reads it from what the record has", () => {
    expect(codeHostOf({ referenceInfo: { url: URL } })).toBe("repository");
    expect(codeHostOf({ fileServerPath: FOLDER })).toBe("fileserver");
    expect(codeHostOf({ referenceInfo: { url: URL }, fileServerPath: FOLDER })).toBe("both");
    expect(codeHostOf({ codeHost: "", referenceInfo: { url: "" } })).toBe("repository");
    expect(codeHostOf()).toBe("repository");
  });

  it("does not mistake files read from the repository for an RCC folder", () => {
    const base = "https://github.com/a/b/blob/0123456789abcdef0123456789abcdef01234567";
    expect(isRepoFilesPath(base)).toBe(true);
    expect(isRepoFilesPath("https://gitlab.com/g/p/-/blob/abc")).toBe(true);
    expect(isRepoFilesPath(FOLDER)).toBe(false);
    expect(codeHostOf({ referenceInfo: { url: URL }, fileServerPath: base })).toBe("repository");
  });

  it("draws repository figures from the raw file, not the page", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    expect(buildImageUrl(`https://github.com/a/b/blob/${sha}`, "figures/x.png")).toBe(
      `https://raw.githubusercontent.com/a/b/${sha}/figures/x.png`
    );
    expect(rawFileUrl("https://gitlab.com/g/sub/p/-/blob/abc/f.png")).toBe("https://gitlab.com/g/sub/p/-/raw/abc/f.png");
    // RCC is untouched.
    expect(buildImageUrl(FOLDER, "Figure1.png")).toBe(`${FOLDER}/Figure1.png`);
  });

  it("asks for the URL, the folder or both", () => {
    expect([needsRepoUrl("software", "repository"), needsFolder("software", "repository")]).toEqual([true, false]);
    expect([needsRepoUrl("software", "fileserver"), needsFolder("software", "fileserver")]).toEqual([false, true]);
    expect([needsRepoUrl("software", "both"), needsFolder("software", "both")]).toEqual([true, true]);
  });

  it("leaves every other work type as it was", () => {
    ["paper", "report", "dataset", "other"].forEach((type) => {
      expect(needsRepoUrl(type, "repository")).toBe(false);
      expect(needsFolder(type, "repository")).toBe(true);
    });
  });

  it("does not ask code on the file server for a repository URL", () => {
    const reference = { title: "west", authors: "Ada Lovelace", abstract: "GW code", url: "" };
    expect(isCompleteReference(reference, "software", "repository")).toBe(false);
    expect(isCompleteReference(reference, "software", "fileserver")).toBe(true);
  });
});

describe("work types in the stored record", () => {
  it("treats legacy records and unknown values as published papers", () => {
    expect(workTypeOf(undefined)).toBe("paper");
    expect(workTypeOf("poem")).toBe("paper");
    expect(convertReqSchematoState({}).workType).toBe("paper");
    expect(convertReqSchematoState({ work_type: "software" }).workType).toBe("software");
  });

  it("publishes the chosen work type", () => {
    const state = convertReqSchematoState({ work_type: "dataset" });
    expect(convertStatetoReqSchema(state, {}).work_type).toBe("dataset");
  });

  it("only a published paper needs figures and datasets to publish", () => {
    const payload = (work_type) => ({ work_type, charts: [], datasets: [] });
    expect(validate({}, payload("paper")).valid).toBe(false);
    expect(validate({}, payload(undefined)).valid).toBe(false);
    const asCode = validate({}, payload("software"));
    // Past the figure gate; whatever remains is the schema's own check.
    expect(
      asCode.errors.some((e) => String(e?.props?.children).includes("Charts"))
    ).toBe(false);
  });

  it("knows when each type's reference is complete", () => {
    const base = { title: "T", authors: "A B", abstract: "X", kind: "", publication: "" };
    expect(isCompleteReference(base, "paper")).toBe(false);
    expect(isCompleteReference(base, "dataset")).toBe(true);
    expect(isCompleteReference(base, "software")).toBe(false);
    expect(isCompleteReference({ ...base, url: "https://github.com/a/b" }, "software")).toBe(true);
  });
});

const renderReferenceForm = (workType, referenceInfo = {}) => {
  const setReferenceInfo = jest.fn();
  const editor = jest.fn();
  render(
    <CuratorContext.Provider
      value={{
        workType,
        setReferenceInfo,
        referenceInfo: {
          kind: "",
          doi: "",
          authors: "Ada Lovelace",
          title: "qresp",
          publication: "",
          year: 2024,
          url: "",
          abstract: "Curation tool",
          ...referenceInfo,
        },
      }}
    >
      <AlertContext.Provider value={{ setAlert: jest.fn() }}>
        <LoadingContext.Provider value={{ showLoader: jest.fn(), hideLoader: jest.fn() }}>
          <ReferenceInfoForm editor={editor} />
        </LoadingContext.Provider>
      </AlertContext.Provider>
    </CuratorContext.Provider>
  );
  return { setReferenceInfo, editor };
};

describe("the reference section for each work type", () => {
  it("asks a code repository for its repository URL, not a journal", async () => {
    const user = userEvent.setup();
    const { setReferenceInfo, editor } = renderReferenceForm("software");
    expect(screen.getByText("About This Code Repository")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/enter full journal name/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/enter page number/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/enter volume number/i)).not.toBeInTheDocument();
    expect(screen.getByText(/repository or project name/i)).toBeInTheDocument();
    expect(screen.getByText("Developers")).toBeInTheDocument();

    // The repository URL is asked for, but not required.
    expect(screen.queryByText(/^required$/i)).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("https://github.com/org/repo"), "https://github.com/qresp/qresp");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(editor).toHaveBeenCalled());
    expect(setReferenceInfo.mock.calls[0][0]).toMatchObject({
      kind: "software",
      url: "https://github.com/qresp/qresp",
    });
  });

  it("saves a dataset with no journal, volume, page or URL", async () => {
    const user = userEvent.setup();
    const { editor } = renderReferenceForm("dataset");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(editor).toHaveBeenCalled());
  });

  it("offers a report an optional institution or series", () => {
    renderReferenceForm("report");
    const venue = screen.getByPlaceholderText(/institution or series/i);
    expect(venue).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/enter page number/i)).not.toBeInTheDocument();
  });
});

describe("non-paper works on the explorer and record page", () => {
  const card = (row) =>
    render(
      <AuthContext.Provider value={{ authenticated: false, loading: false }}>
        <TableSearchContext.Provider value={{ query: "", setQuery: () => {} }}>
          <Summary
            rowdata={{
              _Search__id: "p1",
              _Search__title: "qresp",
              _Search__authors: "A",
              _Search__tags: [],
              _Search__publication: "",
              _Search__server: "https://x",
              _Search__sources: [],
              ...row,
            }}
          />
        </TableSearchContext.Provider>
      </AuthContext.Provider>
    );

  it("badges a code repository and leaves papers unbadged", () => {
    card({ _Search__work_type: "software" });
    expect(screen.getByTestId("record-work-type-badge")).toHaveTextContent("Code");
  });

  it("shows no badge on a paper or a record from an older server", () => {
    card({});
    expect(screen.queryByTestId("record-work-type-badge")).not.toBeInTheDocument();
  });

  it("labels a code repository's record page and links its repository", () => {
    render(
      <ReferenceInfo
        referenceData={{
          title: "qresp",
          authors: "A",
          abstract: "A curation tool",
          year: 2024,
          publication: "",
          workType: "software",
          url: "https://github.com/qresp/qresp",
        }}
      />
    );
    expect(screen.getByTestId("record-work-type")).toHaveTextContent("Code repository · 2024");
    expect(screen.getByTestId("record-url-action")).toHaveAttribute(
      "href",
      "https://github.com/qresp/qresp"
    );
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.queryByText(/published in/i)).not.toBeInTheDocument();
  });
});

describe("the saved reference summary", () => {
  // eslint-disable-next-line global-require
  const ReferenceC = require("../components/Paper/ReferenceC").default;

  it("shows a report's institution, not the raw publication string", () => {
    render(
      <ReferenceC
        workType="report"
        referenceInfo={{
          title: "T",
          authors: "A",
          abstract: "X",
          publication: "Argonne National Laboratory 2024,  ,",
          url: "",
        }}
      />
    );
    expect(screen.getByText("Argonne National Laboratory")).toBeInTheDocument();
    expect(screen.queryByText(/2024, {2},/)).not.toBeInTheDocument();
  });
});
