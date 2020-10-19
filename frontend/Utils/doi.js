import axios from "axios";
import { namesUtil } from "./utils";

const doiUtil = {
  url: (doi) => `https://dx.doi.org/${doi}`,
  headers: { Accept: "application/json; style=json" },
  get: (doi) =>
    axios
      .get(doiUtil.url(doi), {
        headers: doiUtil.headers,
      })
      .then((res) => res.data),
  set: (values, method) => {
    method("title", values.title);
    method("journal", values["container-title"]);
    method("page", values.page || values["article-number"]);
    method("volume", values.volume);
    method("title", values.title);
    method("url", values.URL);
    method("year", values.created["date-parts"][0][0]);
    method("authors", doiUtil.formatNames(values.author));
  },
  formatNames: (authors) => {
    const names = authors.map((author) => {
      return `${author.given} ${author.family}`;
    });
    return namesUtil.get(names.join(", "));
  },
};

export { doiUtil };
