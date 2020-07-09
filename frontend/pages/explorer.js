import { Fragment } from "react";
import StyledButton from "../components/button";
import SEO from "../components/seo";
import { Box, Typography, Container, TextField } from "@material-ui/core";
import axios from "axios";

import Autocomplete from "@material-ui/lab/Autocomplete";

const explorer = ({ servers }) => {
  const explorerDescription =
    "The explorer provides a portal for the scientific community to access datasets, explore workflows and download curated data, published in scientific papers.";
  const explorerAuthor = "Giulia Galli, Macro Govoni";

  const handleChange = (event, values) => {
    console.log(values);
  };

  return (
    <Fragment>
      <SEO
        title="Qresp | Explorer"
        description={explorerDescription}
        author={explorerAuthor}
      />
      <Container>
        <div>
          <Box display="flex" alignItems="center" justifyContent="center" m={4}>
            <Typography variant="h3">
              <Box fontWeight="bold">Select Qresp node to search</Box>
            </Typography>
          </Box>
          <Box
            display="flex"
            flexDirection="row"
            alignItems="center"
            justifyContent="center"
            flexGrow={1}
            m={4}
          >
            <Autocomplete
              multiple
              options={servers}
              getOptionLabel={(option) => option.qresp_server_url}
              filterSelectedOptions
              renderInput={(params) => (
                <TextField
                  {...params}
                  variant="outlined"
                  label="Select one or more nodes!"
                />
              )}
              fullWidth
              ChipProps={{ color: "primary", variant: "outlined" }}
              onChange={handleChange}
            />
            <StyledButton text="Search" url="" external={true} />
          </Box>
          <Box display="flex" alignItems="center" justifyContent="center" m={4}>
            <Typography variant="h5" align="center">
              <Box fontWeight="bolder">
                Qresp | Explorer allows you to search for paper contents and to
                view and download the data organized in the paper.
              </Box>
            </Typography>
          </Box>
        </div>
      </Container>
      <style jsx>
        {`
          div {
            border-width: thin;
            border-style: solid;
            border-radius: 5px;
            border-color: rgba(0, 0, 0, 0.125);
            margin: 40px;
            padding: 8px;
          }
        `}
      </style>
    </Fragment>
  );
};

export const getStaticProps = async () => {
  const servers = [
    {
      qresp_server_url: "https://paperstack.uchicago.edu",
      isActive: "Yes",
      qresp_maintainer_emails: ["datadev@lists.uchicago.edu"],
    },
  ];
  try {
    const servers = await axios.get("http://localhost:5000/qrespservers");
  } catch (error) {
    console.error(error);
  }

  return {
    props: {
      servers,
    },
  };
};

export default explorer;
