import { Fragment, useEffect } from "react";
import { Container, Box } from "@material-ui/core";

import CuratorState from "../Context/Curator/CuratorState";
import SourceTreeState from "../Context/SourceTree/SourceTreeState";

import SEO from "../components/seo";
import TopActions from "../components/Curator/TopActions";
import CuratorInfo from "../components/Curator/CuratorInfo";
import LocationInfo from "../components/Curator/LocationInfo";
import FileTree from "../components/FileTree";

const curator = () => {
  const curatorDescription =
    "The curator guides the user in creating metadata from the data associated to a scientific paper. The metadata after being published becomes availabe in a ";

  return (
    <CuratorState>
      <SourceTreeState>
        <SEO title={"Qresp | Curator"} description={curatorDescription} />
        <FileTree />
        <Container>
          <Box mt={4} mb={4}>
            <TopActions />
          </Box>
          <CuratorInfo />
          <LocationInfo />
        </Container>
      </SourceTreeState>
    </CuratorState>
  );
};

export default curator;
