import { Container, Typography, Box, Divider } from "@material-ui/core";

import RecordTable from "../components/Search/Table";
import AdvancedSearch from "../components/Search/AdvancedSearch";

const search = ({ papers, query, error }) => {
  console.log(query);
  const nPapers = papers.length;

  return (
    <Container>
      <Box display="flex" flexDirection="column" m={2}>
        <Box display="flex" alignItems="center" justifyContent="center" p={2}>
          <Typography variant="h3">
            <Box fontWeight="bold"> Search {nPapers} records for...</Box>{" "}
          </Typography>
        </Box>
        <AdvancedSearch />
        <Divider />
        <RecordTable />
      </Box>
    </Container>
  );
};

export async function getServerSideProps(ctx) {
  const { query } = ctx;
  var error = false;
  var papers = [];

  //   try {
  //     const response = await apiEndpoint.get("/static/qresp_servers.json");
  //     servers = response.data;
  //   } catch (e) {
  //     error = true;
  //   }

  return {
    props: { query, papers, error },
  };
}

export default search;
