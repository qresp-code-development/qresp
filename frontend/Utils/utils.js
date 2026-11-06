const capitalizeFirstLetter = (text) => {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

const getServer = () => {
  var url = window.location.protocol + "//" + window.location.hostname;
  if (window.location.port == "") return url;
  return url + `:${window.location.port}`;
};

const namesUtil = {
  get: (names) => {
    names = String(names || "").trim();
    if (names.length == 0) {
      return [{ firstName: "", middleName: "", lastName: "" }];
    }

    // Names are optional, so a person may be just "Ada": one word is a
    // first name with no last name, never an error.
    const result = names.split(",").map((el) => {
      const splits = el.trim().split(/\s+/).filter(Boolean);
      const obj = { firstName: splits[0] || "", middleName: "", lastName: "" };
      if (splits.length >= 3) {
        obj.middleName = splits.slice(1, splits.length - 1).join(" ");
        obj.lastName = splits[splits.length - 1];
      } else if (splits.length === 2) {
        obj.lastName = splits[1];
      }
      return obj;
    });

    return result;
  },
  set: (names) => {
    const result = names.map((name) => {
      const n = [];
      Object.keys(name).forEach((key) => {
        let tmp = name[key] || "";
        n.push(tmp.trim());
      });
      return n.join(" ");
    });
    return result.join(", ");
  },
};

const referenceUtil = {
  set: ({ journal, year, page, volume }) =>
    `${journal} ${year}, ${volume} ,${page}`,

  // `set` always writes three commas, but a legacy record's publication
  // string may carry fewer — a journal name with no volume/page, or a value
  // typed by hand years ago. Indexing straight into the split threw a
  // TypeError on those and took the whole Curator form down on load, so a
  // missing component now reads as empty and the record still opens.
  get: (text) => {
    // volume is "" rather than null so an empty value and a value whose
    // volume is missing produce the same shape — both feed a text input.
    const values = { journal: "", year: null, page: "", volume: "" };
    if (!text) return values;
    const parts = String(text).split(",");
    const head = (parts[0] || "").trim().split(" ");
    // The trailing token of the first component is the year, when it is one.
    const year = parseInt((head[head.length - 1] || "").trim(), 10);
    if (Number.isNaN(year)) {
      // No year to peel off: the whole component is the journal name.
      values.journal = head.join(" ").trim();
    } else {
      values.journal = head.slice(0, -1).join(" ").trim();
      values.year = year;
    }
    values.volume = (parts[1] || "").trim();
    values.page = (parts[2] || "").trim();
    return values;
  },
};

export { capitalizeFirstLetter, getServer, namesUtil, referenceUtil };
