import { Fragment, useContext, useEffect } from "react";
import PropTypes from "prop-types";

import { useRouter } from "next/router";
import { Alert, Button, Container, Box, Typography } from "@mui/material";
import { ArrowBack } from "@mui/icons-material";
import Link from "next/link";
import FavoriteButton from "../../components/FavoriteButton";

import SEO from "../../components/seo";
import AlertContext from "../../Context/Alert/alertContext";
import { RegularStyledButton } from "../../components/button";
import ReferenceInfo from "../../components/Paper/Reference";
import ChartInfo from "../../components/Paper/Charts";
import DatasetInfo from "../../components/Paper/Datasets";
import ToolsInfo from "../../components/Paper/Tools";
import ScriptsInfo from "../../components/Paper/Scripts";
import Documentation from "../../components/Paper/Documentation";
import Workflow from "../../components/Paper/Workflow";
import AboutRecord from "../../components/Paper/AboutRecord";
import SectionHeading from "../../components/Paper/SectionHeading";
import PermissionNotice from "../../components/Paper/PermissionNotice";
import RelatedResearch from "../../components/Paper/RelatedResearch";

import axios from "axios";

import {
  resolveServerSideApiBase,
  sessionHeadersFor,
} from "../../Utils/serverSideApi";

import CuratorHelperState from "../../Context/CuratorHelpers/curatorHelperState";

const PaperDetails = ({ paper, error, preview = false, query }) => {
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
    institution,
    work_type,
    url,
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
    institution,
    workType: work_type,
    url,
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
      <SEO title={"Qresp | " + (title || "Untitled record")} description={abstract || ""} author={authors} />
      <Container maxWidth="lg">
        <Box sx={{ mt: 4, mb: 8 }}>
          {preview ? (
            <Alert
              severity="warning"
              sx={{ mb: 2, borderRadius: 2, alignItems: "center" }}
              action={
                <Button
                  component={Link}
                  href="/curator?resumeDraft=1"
                  variant="contained"
                  disableElevation
                  size="small"
                  startIcon={<ArrowBack />}
                  sx={{ textTransform: "none", whiteSpace: "nowrap" }}
                >
                  Back to editing
                </Button>
              }
            >
              This is unpublished content — a preview of a record under curation.
            </Alert>
          ) : (
            <PermissionNotice paperId={query.id} server={query.server} />
          )}
          <ReferenceInfo
            referenceData={referenceData}
            actions={
              preview ? null : (
                <FavoriteButton
                  paperId={query.id}
                  size="medium"
                  server={query.server || ""}
                  title={title || ""}
                  authors={typeof authors === "string" ? authors : (authors || []).join(", ")}
                  year={year ? Number(year) : null}
                />
              )
            }
          />

          <SectionHeading>Research artifacts</SectionHeading>
          {/* yet-another-react-lightbox needs no provider wrapper. */}
          <CuratorHelperState>
            {/* A code repository or dataset may have no figures at all. */}
            {charts && charts.length > 0 ? (
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
            ) : null}
          </CuratorHelperState>
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

          <SectionHeading>About this record</SectionHeading>
          <AboutRecord
            paperId={query.id}
            preview={preview}
            curator={curator}
            fileServerPath={fileServerPath}
            license={license}
          />

          {/* Related Research is computed at view time from the published
              record, so it has nothing to show for an unpublished preview. */}
          {preview ? null : (
            <RelatedResearch paperId={query.id} server={query.server} />
          )}
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
      <Box sx={{ display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
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

  // SSR runs inside the gui container, where the public origin
  // (query.server) may not be reachable — resolve the fetch base instead.
  // The public query.server passed to the page/props stays untouched.
  const apiBase = resolveServerSideApiBase(ctx, query.server);

  var error = false;
  var paper;
  var preview = false;
  try {
    if (query.id.startsWith("PREVIEW")) {
      paper = await axios
        .get(`${apiBase}/api/preview/${query.id}`)
        .then((res) => res.data);
      preview = true;
    } else {
      // The reader's session goes along (own backend only) so a private
      // record renders for the accounts it is shared with.
      paper = await axios
        .get(`${apiBase}/api/paper/${query.id}`, {
          headers: sessionHeadersFor(ctx, query.server),
        })
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

PaperDetails.propTypes = {
  preview: PropTypes.bool,
};

export default PaperDetails;
