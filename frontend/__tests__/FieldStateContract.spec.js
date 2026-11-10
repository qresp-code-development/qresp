/**
 * ONE contract for what a Folder Analysis field currently is.
 *
 * Three separate facts used to be conflated, and the conflation was visible:
 *
 *   - what the ANALYSIS proposed          (candidate.proposal)
 *   - what the field CONTAINS now         (the draft)
 *   - how strong the analysis' evidence was (candidate.field_evidence)
 *
 * The card rendered the third whenever the second was non-empty, so a Chart
 * caption the analyser had marked `needs_input` still wore a "Needs input"
 * chip AFTER the AI filled it -- while the header, which reads the draft,
 * correctly counted it as no longer missing. The same staleness let a
 * "High" chip, earned by a path the analyser detected, stay attached to a
 * value the curator had since replaced.
 *
 * These helpers are the single place the three are combined.
 */
import {
  APPLIED,
  BLANK,
  CHANGED,
  NOT_APPLIED,
  PARTIALLY_APPLIED,
  UNCHANGED,
  evidenceChipFor,
  suggestionApplied,
  suggestionState,
  valueState,
} from "../Utils/artifactFields";

describe("valueState", () => {
  it("calls an empty field blank, whatever the analysis proposed", () => {
    expect(valueState("chart", "caption", { caption: "" }, { caption: "" }))
      .toBe(BLANK);
    expect(
      valueState("chart", "caption", { caption: "   " }, { caption: "x" })
    ).toBe(BLANK);
  });

  it("calls a value identical to the proposal unchanged", () => {
    expect(
      valueState(
        "chart",
        "imageFile",
        { imageFile: "charts/f1/f1.png" },
        { imageFile: "charts/f1/f1.png" }
      )
    ).toBe(UNCHANGED);
  });

  it("ignores surrounding whitespace when comparing", () => {
    expect(
      valueState("chart", "imageFile", { imageFile: " a.png " },
                 { imageFile: "a.png" })
    ).toBe(UNCHANGED);
  });

  it("calls a value the proposal did not contain changed", () => {
    expect(
      valueState("chart", "caption", { caption: "AI wrote this" },
                 { caption: "" })
    ).toBe(CHANGED);
    expect(
      valueState("chart", "imageFile", { imageFile: "other.png" },
                 { imageFile: "a.png" })
    ).toBe(CHANGED);
  });

  it("compares a list field on its members, not its spacing", () => {
    // `properties` is stored as a list and edited as comma-separated text, so
    // "a, b" and "a,b" are the same value and neither is an edit.
    expect(
      valueState("chart", "properties", { properties: "a, b" },
                 { properties: "a,b" })
    ).toBe(UNCHANGED);
    expect(
      valueState("chart", "properties", { properties: "a, c" },
                 { properties: "a,b" })
    ).toBe(CHANGED);
  });
});

describe("evidenceChipFor", () => {
  const chip = (kind, key, draftValue, originalValue, evidence) =>
    evidenceChipFor(kind, key, {
      draft: { [key]: draftValue },
      original: { [key]: originalValue },
      fieldEvidence: { [key]: evidence },
    });

  it("NEVER shows needs_input on a field that has a value", () => {
    // The reported bug, exactly: the analyser marked caption `needs_input`
    // because it was blank, the AI then filled it, and the chip stayed.
    expect(chip("chart", "caption", "A caption", "", "needs_input")).toBeNull();
    expect(chip("chart", "properties", "dft, water", "", "needs_input"))
      .toBeNull();
  });

  it("shows no chip on an empty field, required or not", () => {
    // Required-and-empty is already said three times -- the asterisk, the
    // helper text, and the card header's missing count. A fourth signal is
    // noise, and flagging OPTIONAL fields this way (an empty Reproduction
    // Notebook is a complete Chart) was a bug once already.
    expect(chip("chart", "caption", "", "", "needs_input")).toBeNull();
    expect(chip("chart", "notebookFile", "", "", "needs_input")).toBeNull();
    expect(chip("chart", "files", "", "", "needs_input")).toBeNull();
  });

  it("makes needs_input unreachable in either direction", () => {
    // Blank: not rendered. Filled: never the stale analysis-time standing.
    // There is no third state, so the label cannot appear at all.
    ["", "a value"].forEach((value) => {
      expect(chip("chart", "caption", value, "", "needs_input")).toBeNull();
    });
  });

  it("keeps deterministic evidence while the value is the proposed one", () => {
    expect(chip("chart", "imageFile", "a.png", "a.png", "high")).toBe("high");
    expect(chip("dataset", "files", "data/x", "data/x", "medium"))
      .toBe("medium");
  });

  it("drops deterministic evidence once the value is changed", () => {
    // "High" meant "Qresp detected THIS file". It says nothing about a path
    // the curator typed over it, and leaving it there would vouch for a
    // value nothing verified.
    expect(chip("chart", "imageFile", "typed-by-hand.png", "a.png", "high"))
      .toBeNull();
    expect(chip("dataset", "files", "data/y", "data/x", "medium")).toBeNull();
  });

  it("shows nothing for a filled field the analysis had no evidence for", () => {
    expect(chip("chart", "caption", "text", "text", undefined)).toBeNull();
    expect(chip("chart", "caption", "text", "text", "")).toBeNull();
  });

  it("tolerates a candidate with no field_evidence at all", () => {
    expect(
      evidenceChipFor("chart", "caption", {
        draft: { caption: "x" },
        original: { caption: "x" },
      })
    ).toBeNull();
  });
});

describe("suggestionApplied", () => {
  it("is true only when the field holds exactly the suggested value", () => {
    expect(suggestionApplied("chart", "caption", { caption: "AI text" },
                             "AI text")).toBe(true);
    expect(suggestionApplied("chart", "caption", { caption: "AI text!" },
                             "AI text")).toBe(false);
    expect(suggestionApplied("chart", "caption", { caption: "" }, "AI text"))
      .toBe(false);
  });

  it("is false when there is nothing suggested", () => {
    expect(suggestionApplied("chart", "caption", { caption: "x" }, ""))
      .toBe(false);
  });

  it("compares keyword lists by member, so re-spacing is still applied", () => {
    expect(
      suggestionApplied("chart", "properties", { properties: "a, b" }, "a,b")
    ).toBe(true);
    expect(
      suggestionApplied("chart", "properties", { properties: "a" }, "a,b")
    ).toBe(false);
  });
});

describe("suggestionState", () => {
  // One suggestion can offer a description, keywords, or both. "applied" is a
  // statement about ALL of what it offered, so a panel that only knows
  // all-or-nothing contradicts its own buttons the moment one is used.
  const CAPTION = { key: "caption", value: "A caption" };
  const KEYWORDS = { key: "properties", value: "dft, water" };

  it("is not_applied when nothing has been used yet", () => {
    expect(
      suggestionState("chart", { caption: "", properties: "" },
                      [CAPTION, KEYWORDS])
    ).toBe(NOT_APPLIED);
  });

  it("is partially_applied when some of what it offered is in place", () => {
    expect(
      suggestionState("chart", { caption: "A caption", properties: "" },
                      [CAPTION, KEYWORDS])
    ).toBe(PARTIALLY_APPLIED);
    expect(
      suggestionState("chart", { caption: "", properties: "dft, water" },
                      [CAPTION, KEYWORDS])
    ).toBe(PARTIALLY_APPLIED);
  });

  it("is applied when everything it offered is in place", () => {
    expect(
      suggestionState(
        "chart",
        { caption: "A caption", properties: "dft, water" },
        [CAPTION, KEYWORDS]
      )
    ).toBe(APPLIED);
  });

  it("is applied as soon as the ONLY thing it offered is used", () => {
    // A description-only suggestion is fully applied after one click. Asking
    // for a second one that was never offered would strand it.
    expect(
      suggestionState("chart", { caption: "A caption" }, [CAPTION])
    ).toBe(APPLIED);
  });

  it("ignores offers the suggestion did not actually make", () => {
    // Empty keywords are not an offer, so they cannot hold the panel back.
    expect(
      suggestionState("chart", { caption: "A caption", properties: "" },
                      [CAPTION, { key: "properties", value: "" }])
    ).toBe(APPLIED);
  });

  it("is not_applied when the suggestion offered nothing at all", () => {
    expect(suggestionState("chart", { caption: "x" }, [])).toBe(NOT_APPLIED);
    expect(
      suggestionState("chart", { caption: "x" },
                      [{ key: "caption", value: "" }])
    ).toBe(NOT_APPLIED);
  });

  it("falls back as the curator edits an applied value", () => {
    const both = { caption: "A caption", properties: "dft, water" };
    expect(suggestionState("chart", both, [CAPTION, KEYWORDS])).toBe(APPLIED);

    const edited = { ...both, caption: "A caption, reworded" };
    expect(suggestionState("chart", edited, [CAPTION, KEYWORDS]))
      .toBe(PARTIALLY_APPLIED);

    const bothEdited = { caption: "mine", properties: "mine" };
    expect(suggestionState("chart", bothEdited, [CAPTION, KEYWORDS]))
      .toBe(NOT_APPLIED);
  });

  it("falls back when an applied value is cleared", () => {
    expect(
      suggestionState("chart", { caption: "A caption", properties: "" },
                      [CAPTION, KEYWORDS])
    ).toBe(PARTIALLY_APPLIED);
    expect(
      suggestionState("chart", { caption: "", properties: "" },
                      [CAPTION, KEYWORDS])
    ).toBe(NOT_APPLIED);
  });

  it("tolerates a field with no target on this record kind", () => {
    // A Tool has no keyword field, so the server never sends keywords for
    // one and there is no `key` to compare against.
    expect(
      suggestionState("tool", { description: "A DFT code" },
                      [{ key: "description", value: "A DFT code" },
                       { key: undefined, value: "ignored" }])
    ).toBe(APPLIED);
  });
});
