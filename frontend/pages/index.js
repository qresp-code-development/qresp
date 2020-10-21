import { Fragment } from "react";
import { InternalStyledButton } from "../components/button";
import SEO from "../components/seo";
import Picture from "../components/picture";
import { Box, Typography, Container } from "@material-ui/core";

export default function Home() {
  const qrespDescription =
    "Qresp facilitates scientific data reproducibility by making available all data & procedures presented in scientific papers, together with metadata to render them searchable and discoverable";
  const qrespAuthor = "Giulia Galli, Macro Govoni";

  return (
    <Fragment>
      <SEO
        title="Qresp"
        description={qrespDescription}
        author={qrespAuthor}
      ></SEO>
      <Box display="flex" flexDirection="column" flexGrow={1}>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            maxHeight: "48vh",
          }}
        >
          <Picture
            imgSrc="/images/qrespPoster"
            imgAlt="Qresp Banner Blurred Background"
            width="100%"
            className="blur"
          />
          <Picture
            imgSrc="/images/qrespPoster"
            imgAlt="Qresp Banner"
            className="poster"
          />
        </div>
        <Box display="flex" m={3} alignItems="center" justifyContent="center">
          <Container>
            <Typography variant="h5" align="center" gutterBottom>
              <Box fontWeight="fontWeightBold">
                The open source software Qresp "Curation and Exploration of
                Reproducible Scientific Papers" <br /> facilitates the
                organization, annotation and exploration of data presented in
                scientific papers.
              </Box>
            </Typography>
            <Box
              display="flex"
              flexDirection="row"
              justifyContent="center"
              p={1}
            >
              <Box m={1}>
                <InternalStyledButton text="Explorer" url="/explorer" />
              </Box>
              <Box m={1}>
                <InternalStyledButton text="Curator" url="/curator" />
              </Box>
            </Box>
          </Container>
        </Box>
      </Box>
    </Fragment>
  );
}
