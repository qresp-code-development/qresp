import { buildQrespServerList } from "../Utils/qrespServers";

const servers = [
  {
    qresp_server_url: "https://paperstack.uchicago.edu",
    isActive: "Yes",
    qresp_maintainer_emails: [],
  },
];

describe("buildQrespServerList", () => {
  it("prepends the current localhost node for staging tunnel searches", () => {
    const list = buildQrespServerList(servers, "https://localhost:8443/");
    expect(list.map((server) => server.qresp_server_url)).toEqual([
      "https://localhost:8443",
      "https://paperstack.uchicago.edu",
    ]);
  });

  it("does not duplicate an existing current node", () => {
    const list = buildQrespServerList(
      [
        {
          qresp_server_url: "https://localhost:8443",
          isActive: "Yes",
          qresp_maintainer_emails: [],
        },
      ],
      "https://localhost:8443/"
    );
    expect(list).toHaveLength(1);
  });

  it("leaves the production federation list unchanged", () => {
    expect(buildQrespServerList(servers, "https://qresp.org")).toBe(servers);
  });
});

