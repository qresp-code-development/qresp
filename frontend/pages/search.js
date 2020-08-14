import { useEffect, useContext, Fragment, useState } from "react";

import { useRouter } from "next/router";

import { Container, Typography, Box, Divider } from "@material-ui/core";

import SEO from "../components/seo";

import { SmallStyledButton } from "../components/button";
import RecordTable from "../components/Table/Table";
import AdvancedSearch from "../components/AdvancedSearch";
import Summary from "../components/Paper/Summary";

import apiEndpoint from "../Context/axios";
import AlertContext from "../Context/Alert/alertContext";

const search = ({ initialdata, error, servers }) => {
  const { setAlert, unsetAlert } = useContext(AlertContext);

  const searchDescription =
    "Search allows users to find data on specific Qresp instances using various filters";
  const searchAuthor = "Giulia Galli, Macro Govoni";

  const router = useRouter();
  const refresh = () => {
    router.reload();
    unsetAlert();
  };

  const [data, setData] = useState(initialdata);

  const clearSearch = (e) => {
    setData(initialdata);
  };

  const {
    allPapersSize = null,
    allpaperslist = null,
    authorslist = null,
    collectionlist = null,
    publicationlist = null,
  } = { ...initialdata, ...data } || {};

  const columns = [
    {
      label: "Record",
      name: "paper",
      view: Summary,
      options: {
        align: "left",
        sort: true,
        searchable: true,
        value: (data) => data._Search__title,
        searchValue: (data) => data._Search__title + data._Search__authors,
      },
    },
    {
      label: "Year",
      name: "year",
      view: null,
      options: {
        align: "right",
        sort: true,
        searchable: true,
        value: (data) => data,
      },
    },
  ];

  const taglist = new Set();
  if (initialdata.allpaperslist) {
    initialdata.allpaperslist.forEach((paper) => {
      paper["_Search__tags"].forEach((element) => {
        taglist.add(element.toLowerCase());
      });
    });
  }

  const rows = allpaperslist.map((paper) => {
    paper["_Search__servers"] = servers;
    return {
      paper: paper,
      year: paper["_Search__year"],
    };
  });

  const views = { paper: Summary, year: null };

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
                {`${allpaperslist.length}  Records Available`}
              </Box>
            </Typography>
          </Box>
          <Box>
            <AdvancedSearch
              collections={collectionlist || []}
              authors={authorslist || []}
              publications={publicationlist || []}
              tags={Array.from(taglist) || []}
              setData={setData}
              clearSearch={clearSearch}
            />
          </Box>
          <Divider />
          <RecordTable rows={rows} columns={columns} />
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
    const response = await apiEndpoint.get("/search", {
      params: query,
    });
    data = response.data;
  } catch (e) {
    console.error(e);
    error = true;
  }

  return {
    props: { initialdata: data, error, servers: query.servers },
  };
}

export default search;
