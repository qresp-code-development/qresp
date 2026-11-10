const normalizeOrigin = (origin) =>
  typeof origin === "string" ? origin.replace(/\/+$/, "") : "";

const isLocalOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    return (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1" ||
      parsed.hostname.endsWith(".localhost")
    );
  } catch (e) {
    return false;
  }
};

const toServerOption = (origin) => ({
  qresp_server_url: normalizeOrigin(origin),
  isActive: "Yes",
  qresp_maintainer_emails: [],
});

export const buildQrespServerList = (servers, currentOrigin) => {
  const list = Array.isArray(servers) ? servers : [];
  const normalizedOrigin = normalizeOrigin(currentOrigin);
  if (!normalizedOrigin || !isLocalOrigin(normalizedOrigin)) {
    return list;
  }

  const seen = new Set(
    list.map((server) => normalizeOrigin(server.qresp_server_url))
  );
  if (seen.has(normalizedOrigin)) {
    return list;
  }

  return [toServerOption(normalizedOrigin), ...list];
};

