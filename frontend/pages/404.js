import { Fragment } from "react";
import Link from "next/link";
import { InternalStyledButton } from "../components/button";
import { Box, Typography, Container } from "@mui/material";
import SEO from "../components/seo";

export default () => {
  return (
    <Fragment>
      <SEO
        title="Qresp | Page Not Found"
        description="The page you're looking for does not exist"
        authors="Qresp Team"
      />
      <Box sx={{ display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
        <Container>
          <Typography variant="h2" align="center" gutterBottom>
            <Box sx={{ fontWeight: "bold" }}>
              {" "}
              Oops! <br /> The page you're looking for does not exist.
            </Box>
          </Typography>
          <Typography variant="h6" align="center">
            If you think this is an error, please{" "}
            <span className="contact-link">
              <Link href="/contact">contact</Link>
            </span>{" "}
            us!
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "row", m: 4, justifyContent: "center" }}>
            <Box sx={{ m: 1 }}>
              <InternalStyledButton text="Go to Explorer" url="/explorer" />
            </Box>
            <Box sx={{ m: 1 }}>
              <InternalStyledButton text="Go to Curator" url="/curator" />
            </Box>
          </Box>
        </Container>
      </Box>
      <style jsx>{`
        .contact-link :global(a) {
          color: #9a0000;
        }
      `}</style>
    </Fragment>
  );
};
