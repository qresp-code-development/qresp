import axios from "axios";

const apiEndpoint = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

export default apiEndpoint;
// Alter defaults after instance has been created
// apiEndpoint.defaults.headers.common["Authorization"] = AUTH_TOKEN;

// axios.defaults.headers.common["Authorization"] = AUTH_TOKEN;
// axios.defaults.headers.post["Content-Type"] =
// "application/x-www-form-urlencoded";
