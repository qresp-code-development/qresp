import { Fragment, useContext, useEffect } from "react";
import PropTypes from "prop-types";

import { useRouter } from "next/router";
import { Container, Box, Typography } from "@material-ui/core";

import SEO from "../../components/seo";
import apiEndpoint from "../../Context/axios";
import AlertContext from "../../Context/Alert/alertContext";
import { SmallStyledButton } from "../../components/button";
import ReferenceInfo from "../../components/Paper/Reference";
import ChartInfo from "../../components/Paper/Charts";
import DatasetInfo from "../../components/Paper/Datasets";
import ToolsInfo from "../../components/Paper/Tools";

import SimpleReactLightbox from "simple-react-lightbox";

const PaperDetails = ({ data, error, preview }) => {
  const {
    title,
    authors,
    tags,
    collections,
    PIs,
    publication,
    year,
    doi,
    cite,
    downloadPath,
    notebookFile,
    notebookPath,
    abstract,
    charts,
    fileServerPath,
    datasets,
    tools,
  } = data;

  const referenceData = {
    title,
    authors,
    tags,
    collections,
    PIs,
    publication,
    year,
    doi,
    cite,
    downloadPath,
    notebookFile,
    notebookPath,
    abstract,
  };

  const { setAlert, unsetAlert } = useContext(AlertContext);

  const router = useRouter();
  const refresh = () => {
    router.reload();
    unsetAlert();
  };

  useEffect(() => {
    if (error || (data && data.error)) {
      setAlert(
        "Error Getting Paper Data !",
        "There was error trying to get paper details. Please try again ! If problems persist please contact the administrator.",
        <SmallStyledButton onClick={refresh}>Retry</SmallStyledButton>
      );
    }
  }, []);

  return (
    <Fragment>
      <SEO title={"Qresp | " + title} description={abstract} author={authors} />
      <Container>
        <Box mt={5}>
          {" "}
          {preview ? (
            <Typography variant="subtitle2" color="error" gutterBottom>
              <Box fontWeight="bold">* This is unpublished content !</Box>
            </Typography>
          ) : null}
        </Box>
        <ReferenceInfo referenceData={referenceData} />
        <Box mb={7} mt={1}>
          <SimpleReactLightbox>
            <ChartInfo charts={charts} fileserverpath={fileServerPath} />
          </SimpleReactLightbox>
          <DatasetInfo datasets={datasets} fileserverpath={fileServerPath} />
          <ToolsInfo tools={tools} />
        </Box>
      </Container>
    </Fragment>
  );
};

export async function getServerSideProps(ctx) {
  // Query contains the args from the url
  const { query } = ctx;

  var error = false;
  var data = null;

  try {
    const response = await apiEndpoint.get("/api/paper/" + query.id);
    data = response.data;
  } catch (e) {
    console.error(e);
    error = true;
  }

  return {
    props: { data, error },
  };
}

PaperDetails.defaultProps = {
  preview: false,
};

PaperDetails.propTypes = {
  preview: PropTypes.bool,
};

export default PaperDetails;
