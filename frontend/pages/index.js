import Layout from "../components/layout";
import StyledButton from "../components/button";
import SEO from "../components/seo";
import { Box, Typography, Container } from "@material-ui/core";

export default function Home() {
  return (
    <Layout>
      {/* <SEO title="Qresp" description="" author=""></SEO> */}
      <Box display="flex" flexDirection="column" flexGrow={1}>
        <Box className="full-width">
          <img
            src="/images/qresp-poster.png"
            height="478px"
            width="100%"
            className="blur"
          ></img>
          <img
            src="/images/qresp-poster.png"
            height="478px"
            width="60%"
            className="poster"
          ></img>
        </Box>
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
              <StyledButton text="Explorer" url="/explorer" />
              <StyledButton text="Curator" url="/curator" />
            </Box>
          </Container>
        </Box>
      </Box>
      <style jsx>
        {`
          .full-width {
            width: 100%;
          }
          .poster {
            object-fit: cover;
            object-position: left top;
            position: absolute;
            left: 50%;
            transform: translate(-50%);
          }

          .blur {
            filter: blur(25px);
          }
        `}
      </style>
    </Layout>
  );
}
