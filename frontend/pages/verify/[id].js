import { Fragment } from "react";
import { Typography, Box, Container } from "@material-ui/core";

import Link from "next/link";

import SEO from "../../components/seo";
import StyledButton from "../../components/button";

const Verify = ({ id, error }) => {
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
          {!error ? (
            <Fragment>
              <Typography variant="h2" gutterBottom>
                Success ! <br /> Your paper has been added to the qresp database
                on this instance.
              </Typography>
              <Link href={`/paperdetails/${encodeURIComponent(id)}`} passHref>
                <StyledButton>Go to Paper</StyledButton>
              </Link>
            </Fragment>
          ) : (
            <Fragment>
              <Typography variant="h2">Error !</Typography>
              <Typography variant="h4">
                Your paper could not be published, please contact the
                administrators
              </Typography>
            </Fragment>
          )}
        </Container>
      </Box>
    </Fragment>
  );
};

export async function getServerSideProps({ query }) {
  var error = false;
  return {
    props: { id: query.id, error: error },
  };
}

export default Verify;
