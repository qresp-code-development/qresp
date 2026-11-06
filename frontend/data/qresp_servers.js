// `qresp_server_name` is the SHORT human label a reader sees beside a record
// ("UChicago", "Duke"). It is data, not a guess made from a hostname: the
// Explorer shows records from several nodes in one list, and a tag saying
// where a record came from has to come from the federation list rather than
// from a regex over a URL that happens to contain a university's name.
// `backend/project/data/qresp_servers.json` carries the same field, and
// `test_federation.py` asserts the two files stay in step.
export default [
  {
    qresp_server_url: "https://paperstack.uchicago.edu",
    qresp_server_name: "UChicago",
    qresp_server_full_name: "University of Chicago",
    isActive: "Yes",
    qresp_maintainer_emails: ["datadev@lists.uchicago.edu"],
  },
  {
    qresp_server_url: "https://qresp.hybrid3.duke.edu",
    qresp_server_name: "Duke",
    qresp_server_full_name: "Duke University",
    isActive: "Yes",
    qresp_maintainer_emails: [""],
  },
];
