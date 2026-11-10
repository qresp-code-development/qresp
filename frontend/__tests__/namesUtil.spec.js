import { namesUtil } from "../Utils/utils";

// Names are optional to publish, so a partial name must never break a form.
describe("namesUtil.get", () => {
  it("reads first, middle and last names", () => {
    expect(namesUtil.get("Ada King Lovelace, Alan Turing")).toEqual([
      { firstName: "Ada", middleName: "King", lastName: "Lovelace" },
      { firstName: "Alan", middleName: "", lastName: "Turing" },
    ]);
  });

  it("takes a one-word name as a first name", () => {
    expect(namesUtil.get("Ada")).toEqual([{ firstName: "Ada", middleName: "", lastName: "" }]);
    expect(namesUtil.get("Ada,  Alan  Turing ")).toEqual([
      { firstName: "Ada", middleName: "", lastName: "" },
      { firstName: "Alan", middleName: "", lastName: "Turing" },
    ]);
  });

  it("copes with nothing at all", () => {
    expect(namesUtil.get("")).toEqual([{ firstName: "", middleName: "", lastName: "" }]);
    expect(namesUtil.get(undefined)).toEqual([{ firstName: "", middleName: "", lastName: "" }]);
  });
});
