import apiEndpoint from "../../../Context/axios";
import url from "url";

export default async (req, res) => {
  if (req.method == "GET") {
    try {
      const params = new URLSearchParams(
        url.parse(req.url, true).query
      ).toString();
      const response = await apiEndpoint.get(`/searchWord?${params}`);
      res.status(200).json(response.data);
    } catch (error) {
      console.error(error);
      res.status(500).json(error);
    }
  }
};
