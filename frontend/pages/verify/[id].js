import { Fragment } from "react";
import { Typography, Box, Container } from "@material-ui/core";

import Link from "next/link";
import axios from "axios";

import SEO from "../../components/seo";
import StyledButton from "../../components/button";

const Verify = ({ id, server, error }) => {
  console.log(server)
  return (
    <Fragment>
      <SEO
        title="Qresp | Verification"
        description="Publish Verification Page"
        author="Qresp Team"
      />
      <Box
        display="flex"
        flexGrow={1}
        alignItems="center"
        justifyContent="center"
      >
        <Container>
          {error.length == 0 ? (
            <Fragment>
              <Typography variant="h2" gutterBottom>
                Success ! <br /> Your paper has been added to the qresp database
                on {new URL(server).host}.
              </Typography>
              <Link
                href={`/paperdetails/${encodeURIComponent(
                  id
                )}?server=${server}`}
                passHref
              >
                <StyledButton>Go to Paper</StyledButton>
              </Link>
            </Fragment>
          ) : (
            <Fragment>
              <Typography variant="h2">Error !</Typography>
              <Typography variant="h4" gutterBottom>
                Your paper could not be published, please contact the
                administrators.
              </Typography>
              <Typography variant="caption">Error Message: {error}</Typography>
            </Fragment>
          )}
        </Container>
      </Box>
    </Fragment>
  );
};

export async function getServerSideProps({ query }) {
  var data = { id: "", error: "" };

  if (!("server" in query) || !query.server)
    return {
      props: {
        id: data.id,
        error: "Bad Request, Missing query parameter: server",
        server: "",
      },
    };

  try {
    const response = await axios
      .get(`${query.server}/api/verify/${query.id}`)
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
