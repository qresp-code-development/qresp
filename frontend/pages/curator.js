import { Container, Box } from "@material-ui/core";

import CuratorState from "../Context/Curator/CuratorState";
import CuratorHelperState from "../Context/CuratorHelpers/curatorHelperState";
import SourceTreeState from "../Context/SourceTree/SourceTreeState";

import SEO from "../components/seo";
import TopActions from "../components/CuratorElements/TopActions";
import CuratorElement from "../components/CuratorElements/CuratorElement";
import FileServerElement from "../components/CuratorElements/FileServerElement";
import PaperInfoElement from "../components/CuratorElements/PaperInfoElement";
import ReferenceInfoElement from "../components/CuratorElements/ReferenceElement";
import ChartsInfoElement from "../components/CuratorElements/ChartsElement";
import ToolsInfoElement from "../components/CuratorElements/ToolsElement";
import DatasetsInfoElement from "../components/CuratorElements/DatasetsElement";
import ScriptsInfoElement from "../components/CuratorElements/ScriptsElement";
import DocumentationInfoElement from "../components/CuratorElements/DocumentationElement";
import WorkflowInfoElement from "../components/CuratorElements/WorkflowElement";
import LicenseInfoElement from "../components/CuratorElements/LicenseElement";
import FileTree from "../components/FileTree";
import Publish from "../components/CuratorElements/Publish";

const curator = () => {
  const curatorDescription =
    "The curator guides the user in creating metadata from the data associated to a scientific paper. The metadata after being published becomes availabe in a ";

  return (
    <CuratorState>
      <CuratorHelperState>
        <SourceTreeState>
          <SEO title={"Qresp | Curator"} description={curatorDescription} />
          <FileTree />
          <Container>
            <Box mt={4} mb={4}>
              <TopActions />
            </Box>
            <CuratorElement />
            <FileServerElement />
            <PaperInfoElement />
            <ReferenceInfoElement />
            <ChartsInfoElement />
            <ToolsInfoElement />
            <DatasetsInfoElement />
            <ScriptsInfoElement />
            <DocumentationInfoElement />
            <WorkflowInfoElement />
            <LicenseInfoElement />
            <Publish />
          </Container>
        </SourceTreeState>
      </CuratorHelperState>
    </CuratorState>
  );
};

export default curator;
