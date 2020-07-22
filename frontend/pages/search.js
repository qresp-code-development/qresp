import { useEffect, useContext, Fragment } from "react";

import { useRouter } from "next/router";

import { Container, Typography, Box, Divider } from "@material-ui/core";

import SEO from "../components/seo";

import { SmallStyledButton } from "../components/button";
import RecordTable from "../components/Table/Table";
import AdvancedSearch from "../components/Search/AdvancedSearch";

import apiEndpoint from "../Context/axios";
import AlertContext from "../Context/Alert/alertContext";

const search = ({ data, error, servers }) => {
  const { setAlert, unsetAlert } = useContext(AlertContext);

  const searchDescription =
    "Search allows users to find data on specific Qresp instances using various filters";
  const searchAuthor = "Giulia Galli, Macro Govoni";

  const router = useRouter();
  const refresh = () => {
    router.reload();
    unsetAlert();
  };

  const {
    allPapersSize = null,
    allpaperslist = null,
    authorslist = null,
    collectionlist = null,
    publicationlist = null,
  } = data || {};

  useEffect(() => {
    if (error || (data && data.error)) {
      setAlert(
        "Search Error !",
        "There was error trying to search on the selected nodes. Please try again ! If problems persist please contact the administrator.",
        <SmallStyledButton onClick={refresh}>Retry</SmallStyledButton>
      );
    }
  }, []);

  return (
    <Fragment>
      <SEO
        title="Qresp | Search"
        description={searchDescription}
        author={searchAuthor}
      />
      <Container>
        <Box display="flex" flexDirection="column" m={2}>
          <Box display="flex" alignItems="center" justifyContent="center" p={2}>
            <Typography variant="h3">
              <Box fontWeight="bold">
                {" "}
                Search {allPapersSize} records for...
              </Box>{" "}
            </Typography>
          </Box>
          <AdvancedSearch />
          <Divider />
          <RecordTable rows={allpaperslist} servers={servers} />
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
    const response = await apiEndpoint.get("/backend/search", {
      params: query,
    });
    data = response.data;
  } catch (e) {
    console.error(e);
    error = true;
  }

  return {
    props: { data, error, servers: query.servers },
  };
}

export default search;
