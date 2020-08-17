import apiEndpoint from "../../../Context/axios";

export default async (req, res) => {
  if (req.method == "POST") {
    try {
      const response = await apiEndpoint.get(`/chartworkflow`, {
        params: {
          chartid: req.body.chartid,
          paperid: req.body.paperid,
          servers: req.body.servers,
        },
      });
      res.status(200).json(response.data);
    } catch (error) {
      console.error(error);
      res.status(500).json(error);
    }
  }
};
