import { useEffect, useContext, Fragment, useState } from "react";

import { useRouter } from "next/router";

import { Container, Typography, Box, Divider } from "@material-ui/core";

import SEO from "../components/seo";

import { RegularStyledButton } from "../components/button";
import RecordTable from "../components/Table/Table";
import AdvancedSearch from "../components/AdvancedSearch";
import Summary from "../components/Paper/Summary";

import axios from "axios";
import AlertContext from "../Context/Alert/alertContext";
import ServerContext from "../Context/Servers/serverContext";

const search = ({ initialdata, error, selectedservers }) => {
  const { setAlert, unsetAlert } = useContext(AlertContext);
  const { setSelected } = useContext(ServerContext);

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

  const { papers, authors, collections, publications } =
    { ...initialdata, ...data } || {};

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
        searchValue: (data) =>
          data._Search__title +
          data._Search__authors +
          data._Search__tags.join(" "),
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
  if (initialdata.papers) {
    Object.keys(initialdata.papers).forEach((server) => {
      initialdata.papers[server].forEach((paper) => {
        paper["_Search__tags"].forEach((element) => {
          taglist.add(element.toLowerCase());
        });
      });
    });
  }

  const rows = Object.keys(papers)
    .map((server) => {
      return papers[server].map((paper) => {
        paper["_Search__server"] = server;
        return {
          paper: paper,
          year: paper["_Search__year"],
        };
      });
    })
    .flat();

  useEffect(() => {
    setSelected(selectedservers);
    if (error.is || (data && data.error)) {
      setAlert(
        "Search Error !",
        error.msg,
        <RegularStyledButton onClick={refresh}>Retry</RegularStyledButton>
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
            <Typography variant="h4">
              <Box fontWeight="bold">{`${rows.length}  Records Available`}</Box>
            </Typography>
          </Box>
          <Box>
            <AdvancedSearch
              collections={collections}
              authors={authors}
              publications={publications}
              tags={Array.from(taglist)}
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
  const error = { is: false, msg: "" };
  const data = {
    papers: {},
    authors: [],
    collections: [],
    publications: [],
  };

  if (!query.servers || query.servers.length == 0) {
    error.is = true;
    error["msg"] = "No servers selected to be searched";
    return {
      props: { initialdata: data, error: error, servers: null },
    };
  }

  const urls = [
    { endpoint: "search", value: "papers" },
    { endpoint: "collections", value: "collections" },
    { endpoint: "authors", value: "authors" },
    { endpoint: "publications", value: "publications" },
  ];
  const servers = query.servers.split(",");

  for (let i = 0; i < servers.length; i++) {
    const server = servers[i];
    for (let j = 0; j < urls.length; j++) {
      const url = urls[j];
      try {
        var response = await axios
          .get(`${server}/api/${url.endpoint}`)
          .then((res) => res.data);

        if (url.endpoint === "search") {
          data[url.value][server] = response;
        } else {
          data[url.value].push(...response);
        }
      } catch (e) {
        console.error(e);
        error.is = true;
        error.msg += (i == 0 ? "" : ", ") + server;
        break;
      }
    }
  }

  if (error.is) {
    error.msg = "Could not fetch data from these servers: " + error.msg;
  }

  return {
    props: { initialdata: data, error: error, selectedservers: servers },
  };
}

export default search;
