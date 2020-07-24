import { Fragment, useContext, useEffect } from "react";
import PropTypes from "prop-types";

import { useRouter } from "next/router";
import { Container, Box, Typography } from "@material-ui/core";

import SEO from "../../components/seo";
import apiEndpoint from "../../Context/axios";
import AlertContext from "../../Context/Alert/alertContext";
import { SmallStyledButton } from "../../components/button";
import ReferenceInfo from "../../components/Paper/Reference";

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
    console.log(data);
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
      <SEO title="Qresp | Paper" description={title} author={authors} />
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
  preview: true,
};

PaperDetails.propTypes = {
  preview: PropTypes.bool,
};

export default PaperDetails;
