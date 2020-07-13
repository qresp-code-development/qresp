import { Fragment, useState, useContext, useEffect } from "react";
import Router from "next/router";

import StyledButton, { SmallStyledButton } from "../components/button";
import SEO from "../components/seo";

import apiEndpoint from "../Context/axios";

import { Box, Typography, Container, TextField } from "@material-ui/core";
import Autocomplete from "@material-ui/lab/Autocomplete";

import AlertContext from "../Context/Alert/alertContext";

const explorer = ({ servers, error }) => {
  const { setAlert, unsetAlert } = useContext(AlertContext);

  const explorerDescription =
    "The explorer provides a portal for the scientific community to access datasets, explore workflows and download curated data, published in scientific papers.";
  const explorerAuthor = "Giulia Galli, Macro Govoni";

  const [selectedServers, setSelectedServers] = useState("");

  // Get the list of selected servers, on change in list
  const handleChange = (event, values) => {
    setSelectedServers(values.join(","));
  };

  const refresh = () => {
    Router.reload();
  };

  const searchSelected = () => {
    if (selectedServers.length === 0) {
      const title = "Error, No nodes selected";
      const msg =
        "You didn't select any servers. Did you mean to search on all of them ?";
      const buttons = (
        <SmallStyledButton onClick={searchAll}>Search All</SmallStyledButton>
      );
      setAlert(title, msg, buttons);
      return;
    }
    alert("Nice", selectedServers);
  };

  const searchAll = () => {
    unsetAlert();
    alert("Searching on All Servers", servers);
  };

  const errortitle = "Oops!";
  const errormsg = (
    <Fragment>
      There was an error trying to get the available Qresp nodes! <br />
      If problems persist please contact the administrator
    </Fragment>
  );

  if (error) {
    servers = [];
  }

  useEffect(() => {
    if (error) {
      setAlert(
        errortitle,
        errormsg,
        <SmallStyledButton onClick={refresh}>Retry</SmallStyledButton>
      );
    }
  }, []);

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
          <Box display="flex" flexDirection="row" justifyContent="center" m={4}>
            <StyledButton onClick={searchSelected} disabled={error}>
              Search Selected
            </StyledButton>
            <StyledButton onClick={searchAll} disabled={error}>
              Search All
            </StyledButton>
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
            padding: 40px;
          }
        `}
      </style>
    </Fragment>
  );
};

export async function getServerSideProps(ctx) {
  var error = false;
  var servers = [];

  try {
    const response = await apiEndpoint.get("/static/qresp_servers.json");
    servers = response.data;
  } catch (e) {
    error = true;
  }

  return {
    props: { servers, error },
  };
}

export default explorer;
