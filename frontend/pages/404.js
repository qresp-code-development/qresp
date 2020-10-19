import { Fragment } from "react";
import Link from "next/link";
import { InternalStyledButton } from "../components/button";
import { Box, Typography, Container } from "@material-ui/core";
import SEO from "../components/seo";

export default () => {
  return (
    <Fragment>
      <SEO
        title="Qresp | Page Not Found"
        description="The page you're looking for does not exist"
        authors="Qresp Team"
      />
      <Box
        display="flex"
        flexGrow={1}
        alignItems="center"
        justifyContent="center"
      >
        <Container>
          <Typography variant="h2" align="center" gutterBottom>
            <Box fontWeight="bold">
              {" "}
              Oops! <br /> The page you're looking for does not exist.
            </Box>
          </Typography>
          <Typography variant="h6" align="center">
            If you think this is an error, please{" "}
            <Link href="/contact">
              <a>contact</a>
            </Link>{" "}
            us!
          </Typography>
          <Box display="flex" flexDirection="row" m={4} justifyContent="center">
            <Box m={1}>
              <InternalStyledButton text="Go to Explorer" url="/explorer" />
            </Box>
            <Box m={1}>
              <InternalStyledButton text="Go to Curator" url="/curator" />
            </Box>
          </Box>
        </Container>
      </Box>
      <style jsx>{`
        a {
          color: #9a0000;
        }
      `}</style>
    </Fragment>
  );
};
