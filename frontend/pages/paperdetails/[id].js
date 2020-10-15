import { Fragment, useContext, useEffect } from "react";
import PropTypes from "prop-types";

import { useRouter } from "next/router";
import { Container, Box, Typography } from "@material-ui/core";

import SEO from "../../components/seo";
import AlertContext from "../../Context/Alert/alertContext";
import { RegularStyledButton } from "../../components/button";
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

import CuratorHelperState from "../../Context/CuratorHelpers/curatorHelperState";

const PaperDetails = ({ paper, error, preview, query }) => {
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
  } = paper;

  const workflows = paper.workflows;
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
    fileServerPath,
  };

  const { setAlert, unsetAlert } = useContext(AlertContext);

  const router = useRouter();
  const refresh = () => {
    router.reload();
    unsetAlert();
  };

  useEffect(() => {
    if (error || (paper && paper.error)) {
      setAlert(
        "Error Getting Paper Data !",
        "There was error trying to get paper details. Please try again ! If problems persist please contact the administrator.",
        <RegularStyledButton onClick={refresh}>Retry</RegularStyledButton>
      );
    }
  }, []);

  const showWorkflows =
    workflows && workflows.edges.length > 0 && workflows.nodes.length > 0;

  return !error ? (
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
            <CuratorHelperState>
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
            </CuratorHelperState>
          </SimpleReactLightbox>
          <DatasetInfo datasets={datasets} fileserverpath={fileServerPath} />
          <ToolsInfo tools={tools} />
          <ScriptsInfo scripts={scripts} fileserverpath={fileServerPath} />
          <CuratorHelperState>
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
          </CuratorHelperState>
          {documentation ? (
            <Documentation documentation={documentation} />
          ) : null}
          <CuratorInfo curator={curator} />
          <FileServerInfo fileserverpath={fileServerPath} />
          {license ? <LicenseInfo type={license} /> : null}
        </Box>
      </Container>
    </Fragment>
  ) : (
    <Fragment>
      <SEO
        title={"Qresp | Error"}
        description="Error in getting the paper details"
        author="Qresp Team"
      />
      <Box
        display="flex"
        flexGrow={1}
        alignItems="center"
        justifyContent="center"
      >
        <Container>
          <Typography variant="h2">Error !</Typography>
          <Typography variant="h4" gutterBottom>
            The paper details could not be retrieved :(
          </Typography>
          <RegularStyledButton onClick={refresh}>Retry</RegularStyledButton>
        </Container>
      </Box>
    </Fragment>
  );
};

export async function getServerSideProps(ctx) {
  // Query contains the args from the url
  const { query } = ctx;

  var error = false;
  var paper;
  var preview = false;
  try {
    if (query.id.startsWith("PREVIEW")) {
      paper = await axios
        .get(`${query.server}/api/preview/${query.id}`)
        .then((res) => res.data);
      preview = true;
    } else {
      paper = await axios
        .get(`${query.server}/api/paper/${query.id}`)
        .then((res) => res.data);
    }
  } catch (e) {
    console.error(e);
    error = true;
    paper = {};
  }

  return {
    props: { paper, error, query, preview },
  };
}

PaperDetails.defaultProps = {
  preview: false,
};

PaperDetails.propTypes = {
  preview: PropTypes.bool,
};

export default PaperDetails;
