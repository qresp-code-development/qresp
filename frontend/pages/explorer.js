import SHIPPED_SERVERS from "../data/qresp_servers.js";

// Explorer is a pure server-side redirect to /search.
// Node selection lives in the Advanced Search panel on the search page —
// there is no picker page.
//
// The shipped list is used directly so the redirect is synchronous and the
// browser gets a response immediately. Fetching the live federation API here
// blocked for up to 16 seconds on every page open (two sequential 8-second
// timeout calls before any HTML was sent).
export function getServerSideProps() {
  const ordered = SHIPPED_SERVERS.map((s) => s.qresp_server_url).filter(Boolean);

  const destination =
    ordered.length
      ? `/search?self=1&servers=${ordered.map(encodeURIComponent).join(",")}`
      : "/search?self=1";

  return { redirect: { destination, permanent: false } };
}

// `self=1`: also search THIS site's own records (see withOwnOrigin in
// search.js) -- a staging server is not on the federation list.

// This component never renders — getServerSideProps always redirects.
export default function Explorer() {
  return null;
}
