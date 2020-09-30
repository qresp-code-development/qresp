const capitalizeFirstLetter = (text) => {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

const namesUtil = {
  get: (names) => {
    if (names.length == 0) {
      return [{ firstName: "", middleName: "", lastName: "" }];
    }

    const result = names.split(",").map((el) => {
      const splits = el.trim().split(" ");
      const obj = { firstName: splits[0], middleName: "", lastName: "" };
      if (splits.length >= 3) {
        obj.middleName = splits
          .slice(1, splits.length - 1)
          .join(" ")
          .trim();
        obj.lastName = splits[splits.length - 1].trim();
      } else {
        obj.lastName = splits[1].trim();
      }
      return obj;
    });

    return result;
  },
  set: (names) => {
    const result = names.map((name) => {
      const n = [];
      Object.keys(name).forEach((key) => {
        n.push(name[key].trim());
      });
      return n.join(" ");
    });
    return result.join(", ");
  },
};

const referenceUtil = {
  set: ({ journal, year, page, volume }) =>
    `${journal} ${year}, ${volume} ,${page}`,

  get: (text) => {
    const values = { journal: "", year: null, page: "", volume: null };
    if (!text) return values;
    const split1 = text.split(",");
    const split2 = split1[0].split(" ");
    values.journal = split2.slice(0, split2.length - 1).join(" ");
    values.year = split2[split2.length - 1];
    values.page = split1[2];
    values.volume = split1[1];
    return values;
  },
};

export { capitalizeFirstLetter, namesUtil, referenceUtil };
