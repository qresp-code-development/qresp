import { Fragment, useEffect } from "react";
import { Typography, Box, Container } from "@mui/material";

import Link from "next/link";
import axios from "axios";

import { resolveServerSideApiBase } from "../../Utils/serverSideApi";
import { clearBrowserDraft } from "../../Utils/browserDraft";

import SEO from "../../components/seo";
import StyledButton from "../../components/button";

const Verify = ({ id, server, error }) => {
  useEffect(() => {
    if (id && error.length === 0) {
      clearBrowserDraft();
    }
  }, [id, error]);

  return (
    <Fragment>
      <SEO
        title="Qresp | Verification"
        description="Publish Verification Page"
        author="Qresp Team"
      />
      <Box sx={{ display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
        <Container>
          {error.length == 0 ? (
            <Fragment>
              <Typography variant="h2" gutterBottom>
                Success ! <br /> Your paper has been added to the qresp database
                on {new URL(server).host}.
              </Typography>
              <StyledButton
                component={Link}
                href={`/paperdetails/${encodeURIComponent(
                  id
                )}?server=${server}`}
              >
                Go to Paper
              </StyledButton>
            </Fragment>
          ) : (
            <Fragment>
              <Typography variant="h2" gutterBottom>
                We couldn&rsquo;t finish publishing
              </Typography>
              {/* Backend messages here are secret-free and specific (invalid
                  or already-used link, already published, missing server).
                  Show them directly instead of a generic "contact us". */}
              <Typography variant="h5" gutterBottom>
                {error}
              </Typography>
              <Typography variant="body1" color="secondary" gutterBottom>
                If you have already published this paper, it may already be in
                the database. If the problem persists, please contact the
                administrators.
              </Typography>
              {server ? (
                <StyledButton component={Link} href="/explorer">
                  Browse published papers
                </StyledButton>
              ) : null}
            </Fragment>
          )}
        </Container>
      </Box>
    </Fragment>
  );
};

export async function getServerSideProps(ctx) {
  const { query } = ctx;
  var data = { id: "", error: "" };

  if (!("server" in query) || !query.server)
    return {
      props: {
        id: data.id,
        error: "Bad Request, Missing query parameter: server",
        server: "",
      },
    };

  // SSR runs inside the gui container, where a localhost/same-origin
  // query.server is unreachable (staging verification links failed with
  // ECONNREFUSED 127.0.0.1:8443) — resolve the fetch base the same way
  // paperdetails/search do. The public query.server passed to the page for
  // user-facing links stays untouched.
  const apiBase = resolveServerSideApiBase(ctx, query.server);

  try {
    const response = await axios
      .get(`${apiBase}/api/verify/${query.id}`)
      .then((res) => res.data);
    data = response;
  } catch (error) {
    console.error(
      ">>>>>>>>>>> START >>>>>>>>>>>\n",
      error,
      "\n<<<<<<<<<<< END <<<<<<<<<<<\n"
    );
    if (error.response) {
      if (error.response.data != undefined) {
        data = error.response.data;
      }
    } else {
      data.error = error.message;
    }
  }

  return {
    props: { id: data.id, error: data.error, server: query.server },
  };
}

export default Verify;
