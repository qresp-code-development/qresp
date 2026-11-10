import axios from "axios";

import { arxivIdOf, doiUtil, isArxivDoi, normalizeDoi } from "../Utils/doi";
import { referenceFromCrossref } from "../Utils/autoCurate";

jest.mock("axios", () => ({ get: jest.fn() }));

// An arXiv paper's DOI is 10.48550/arXiv.<id>, registered with DataCite.
describe("arXiv links become DOIs", () => {
  it.each([
    ["https://arxiv.org/abs/2409.00246", "10.48550/arXiv.2409.00246"],
    ["https://arxiv.org/abs/2409.00246v2", "10.48550/arXiv.2409.00246"],
    ["arxiv.org/pdf/2409.00246v1.pdf", "10.48550/arXiv.2409.00246"],
    ["arXiv:2409.00246", "10.48550/arXiv.2409.00246"],
    ["2409.00246", "10.48550/arXiv.2409.00246"],
    ["https://arxiv.org/abs/cond-mat/0601001", "10.48550/arXiv.cond-mat/0601001"],
    ["10.48550/arXiv.2409.00246", "10.48550/arXiv.2409.00246"],
    ["https://doi.org/10.48550/arXiv.2409.00246", "10.48550/arXiv.2409.00246"],
  ])("%s", (input, doi) => {
    expect(normalizeDoi(input)).toBe(doi);
    expect(doiUtil.isValid(input)).toBe(true);
  });

  it("leaves ordinary DOIs and non-arXiv links alone", () => {
    expect(normalizeDoi("10.1038/s41524-025-01558-w")).toBe("10.1038/s41524-025-01558-w");
    expect(arxivIdOf("https://evil.example/abs/2409.00246")).toBe("");
    expect(isArxivDoi("10.1038/x")).toBe(false);
  });
});

describe("looking a DOI up", () => {
  afterEach(() => jest.resetAllMocks());

  const ARXIV_RECORD = {
    type: "article",
    title: "An NV- center in magnesium oxide as a spin qubit",
    DOI: "10.48550/ARXIV.2409.00246",
    publisher: "arXiv",
    URL: "https://arxiv.org/abs/2409.00246",
    issued: { "date-parts": [[2024]] },
    abstract: "Recent predictions suggest...",
    author: [{ given: "Vrindaa", family: "Somjit" }],
  };

  it("asks for CSL-JSON for an arXiv DOI, which DataCite serves", async () => {
    axios.get.mockResolvedValue({ data: ARXIV_RECORD });
    const record = await doiUtil.get("10.48550/arXiv.2409.00246");
    expect(record.title).toMatch(/NV- center/);
    expect(axios.get.mock.calls[0][1].headers.Accept).toBe(
      "application/vnd.citationstyles.csl+json"
    );
  });

  it("falls back to CSL-JSON when the Crossref-style answer is a web page", async () => {
    axios.get
      .mockResolvedValueOnce({ data: "<!DOCTYPE html>..." })
      .mockResolvedValueOnce({ data: ARXIV_RECORD });
    const record = await doiUtil.get("10.5555/datacite.example");
    expect(record.DOI).toBe("10.48550/ARXIV.2409.00246");
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it("asks Qresp's server when doi.org has no record for a new preprint", async () => {
    axios.get
      .mockRejectedValueOnce(new Error("404"))
      .mockResolvedValueOnce({ data: { record: ARXIV_RECORD, source: "arxiv" } });
    const record = await doiUtil.get(normalizeDoi("https://arxiv.org/abs/2409.00246v2"));
    expect(record.title).toMatch(/NV- center/);
    expect(axios.get).toHaveBeenLastCalledWith("/api/curation/arxiv-record", {
      params: { id: "2409.00246" },
    });
  });

  it("fails cleanly when neither has the paper", async () => {
    axios.get.mockRejectedValue(new Error("404"));
    await expect(doiUtil.get("10.48550/arXiv.2409.99999")).rejects.toThrow();
  });

  it("stores DataCite's upper-case arXiv DOI in the one canonical spelling", () => {
    expect(normalizeDoi("10.48550/ARXIV.2409.00246")).toBe("10.48550/arXiv.2409.00246");
    expect(referenceFromCrossref(ARXIV_RECORD, {}).doi).toBe("10.48550/arXiv.2409.00246");
  });

  it("fills an arXiv record in as a preprint on arXiv", () => {
    const reference = referenceFromCrossref(ARXIV_RECORD, {});
    expect(reference.kind).toBe("preprint");
    expect(reference.title).toMatch(/NV- center/);
    expect(reference.url).toBe("https://arxiv.org/abs/2409.00246");
    expect(reference.abstract).toMatch(/Recent predictions/);
    expect(JSON.stringify(reference.publication)).toMatch(/arXiv/);
  });
});
