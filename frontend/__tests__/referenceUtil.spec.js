import { referenceUtil } from "../Utils/utils";

// A record's journal, year, volume and page live in ONE stored string. The
// parser used to index straight into `split(",")`, so any legacy value with
// fewer than three commas threw a TypeError -- and because this runs while
// the Curator form builds its defaults, the throw took the whole section down
// on load. A short string is not corrupt data; it is a record from before the
// current writer, and it has to open.

describe("referenceUtil.get on a well-formed value", () => {
  it("splits journal, year, volume and page", () => {
    expect(referenceUtil.get("JACS 2016, 138 ,6912-6915")).toEqual({
      journal: "JACS",
      year: 2016,
      volume: "138",
      page: "6912-6915",
    });
  });

  it("keeps a multi-word journal name whole", () => {
    expect(referenceUtil.get("Journal of Computing 2021, 12 ,100-110")).toEqual(
      { journal: "Journal of Computing", year: 2021, volume: "12",
        page: "100-110" }
    );
  });

  it("round-trips what set writes", () => {
    const original = { journal: "Nature Physics", year: 2019, volume: "15",
                       page: "1010" };
    expect(referenceUtil.get(referenceUtil.set(original))).toEqual({
      ...original,
      year: 2019,
    });
  });
});

describe("referenceUtil.get on a legacy value with missing components", () => {
  const parses = (text) => () => referenceUtil.get(text);

  it("does not throw on any of the short shapes", () => {
    [
      "",
      "arXiv:2301.00001",
      "Journal of Computing",
      "Journal of Computing 2021",
      "Journal of Computing 2021,",
      "Journal of Computing 2021, 12",
      ",,",
      "   ",
    ].forEach((text) => expect(parses(text)).not.toThrow());
  });

  it("reads a bare journal name with no year as the journal", () => {
    expect(referenceUtil.get("Journal of Computing")).toEqual({
      journal: "Journal of Computing",
      year: null,
      volume: "",
      page: "",
    });
  });

  it("reads journal and year when volume and page are absent", () => {
    expect(referenceUtil.get("Journal of Computing 2021")).toEqual({
      journal: "Journal of Computing",
      year: 2021,
      volume: "",
      page: "",
    });
  });

  it("fills in only the component that is missing", () => {
    expect(referenceUtil.get("Journal of Computing 2021, 12")).toEqual({
      journal: "Journal of Computing",
      year: 2021,
      volume: "12",
      page: "",
    });
  });

  it("never reports a year it could not read", () => {
    // NaN in a number input renders as an empty box the curator cannot fix.
    ["arXiv:2301.00001", "Journal of Computing", "Physical Review B"].forEach(
      (text) => expect(referenceUtil.get(text).year).toBeNull()
    );
  });

  it("treats an empty value as empty, not as a parse failure", () => {
    const empty = { journal: "", year: null, volume: "", page: "" };
    expect(referenceUtil.get("")).toEqual(empty);
    expect(referenceUtil.get(null)).toEqual(empty);
    expect(referenceUtil.get(undefined)).toEqual(empty);
  });
});
