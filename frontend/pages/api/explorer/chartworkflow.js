import apiEndpoint from "../../../Context/axios";

export default async (req, res) => {
  if (req.method == "POST") {
    try {
      const response = await apiEndpoint.get(
        `/api/paper/${req.body.paperid}/chart/${req.body.chartid}`
      );
      res.status(200).json(response.data);
    } catch (error) {
      console.error(error);
      res.status(500).json(error);
    }
  }
};
