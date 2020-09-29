import axios from "axios";

const doiUtil = {
  url: (doi) => `http://dx.doi.org/${doi}`,
  headers: { Accept: "application/json; style=json" },
  get: (doi) =>
    axios
      .get(doiDetails.url(doi), {
        headers: doiDetails.headers,
      })
      .then((res) => res.data),
};

export { doiUtil };
