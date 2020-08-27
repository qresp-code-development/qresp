import { Fragment, useContext, useEffect } from "react";
import PropTypes from "prop-types";

import { useRouter } from "next/router";
import { Container, Box, Typography } from "@material-ui/core";

import SEO from "../../components/seo";
import AlertContext from "../../Context/Alert/alertContext";
import { SmallStyledButton } from "../../components/button";
import ReferenceInfo from "../../components/Paper/Reference";
import ChartInfo from "../../components/Paper/Charts";
import DatasetInfo from "../../components/Paper/Datasets";
import ToolsInfo from "../../components/Paper/Tools";
import ScriptsInfo from "../../components/Paper/Scripts";
import Documentation from "../../components/Paper/Documentation";
import CuratorInfo from "../../components/Paper/Curator";
import FileServerInfo from "../../components/Paper/FileServer";
import Workflow from "../../components/Paper/Workflow";
import LicenseInfo from "../../components/Paper/License";

import SimpleReactLightbox from "simple-react-lightbox";

import axios from "axios";

const PaperDetails = ({ data, error, preview, query }) => {
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
    scripts,
    documentation,
    firstName,
    middleName,
    lastName,
    emailId,
    affiliation,
    heads,
    license,
  } = data.paperdetail;

  const workflows = data.workflowdetail;
  const curator = { firstName, middleName, lastName, emailId, affiliation };

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

  const showWorkflows =
    workflows.edges.length > 0 && Object.keys(workflows.nodes).length > 0;

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
        <Box mb={7} mt={1}>
          <ReferenceInfo referenceData={referenceData} />
          <SimpleReactLightbox>
            <ChartInfo
              charts={charts}
              fileserverpath={fileServerPath}
              downloadPath={downloadPath}
              datasets={datasets}
              tools={tools}
              scripts={scripts}
              external={heads}
              showWorkflows={showWorkflows}
              server={query.server}
            />
          </SimpleReactLightbox>
          <DatasetInfo datasets={datasets} fileserverpath={fileServerPath} />
          <ToolsInfo tools={tools} />
          <ScriptsInfo scripts={scripts} fileserverpath={fileServerPath} />
          {showWorkflows ? (
            <Workflow
              workflow={workflows}
              charts={charts}
              datasets={datasets}
              tools={tools}
              scripts={scripts}
              external={heads}
            />
          ) : null}
          {documentation ? (
            <Documentation documentation={documentation} />
          ) : null}
          <CuratorInfo curator={curator} />
          <FileServerInfo fileserverpath={fileServerPath} />
          {license ? <LicenseInfo type={license} /> : null}
        </Box>
      </Container>
    </Fragment>
  );
};

export async function getServerSideProps(ctx) {
  // Query contains the args from the url
  const { query } = ctx;

  var error = false;
  const data = { paperdetail: {}, workflowdetail: {} };

  try {
    const paperdetails = await axios
      .get(`${query.server}/api/paper/${query.id}`)
      .then((res) => res.data);
    data.paperdetail = paperdetails;

    const workflowdetails = await axios
      .get(`${query.server}/api/workflow/${query.id}`)
      .then((res) => res.data);
    data.workflowdetail = workflowdetails;
  } catch (e) {
    console.error(e);
    error = true;
  }

  return {
    props: { data, error, query },
  };
}

PaperDetails.defaultProps = {
  preview: false,
};

PaperDetails.propTypes = {
  preview: PropTypes.bool,
};

export default PaperDetails;
