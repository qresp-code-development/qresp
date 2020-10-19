import { Fragment, useState, useContext } from "react";
import PropTypes from "prop-types";

import {
  Collapse,
  Button,
  Grid,
  Typography,
  TextField,
  Box,
} from "@material-ui/core";
import { Search, ExpandMore, Clear } from "@material-ui/icons";
import Autocomplete from "@material-ui/lab/Autocomplete";

import LoadingContext from "../Context/Loading/loadingContext";
import AlertContext from "../Context/Alert/alertContext";
import ServerContext from "../Context/Servers/serverContext";

import { useRouter } from "next/router";
import axios from "axios";

const TextSearchField = ({ title, placeholder, value, onChange, name }) => {
  return (
    <Grid container direction="column" alignItems="stretch" justify="center">
      <Grid item xs={12}>
        <Typography variant="h6" color="secondary" align="center">
          <Box fontWeight="bold">{title}</Box>
        </Typography>
      </Grid>
      <Grid item xs={12}>
        <TextField
          variant="outlined"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(name, e.target.value)}
          size="small"
          fullWidth
        />
      </Grid>
    </Grid>
  );
};

const ChipSearchField = ({
  title,
  onChange,
  options,
  name,
  placeholder,
  value,
}) => {
  return (
    <Grid container direction="column" alignItems="stretch" justify="center">
      <Grid item xs={12}>
        <Typography variant="h6" color="secondary" align="center">
          <Box fontWeight="bold">{title}</Box>
        </Typography>
      </Grid>
      <Grid item xs={12}>
        <Autocomplete
          value={value}
          multiple
          options={Array.from(options)}
          filterSelectedOptions
          renderInput={(params) => (
            <TextField
              {...params}
              variant="outlined"
              placeholder={placeholder}
            />
          )}
          ChipProps={{ color: "primary", variant: "outlined" }}
          onChange={(event, values) => onChange(name, values)}
          size="small"
          fullWidth
          limitTags={2}
        />
      </Grid>
    </Grid>
  );
};

const AdvancedSearch = ({
  authors,
  publications,
  tags,
  collections,
  setData,
  clearSearch,
}) => {
  const [show, setShow] = useState(false);

  const initialState = {
    paperTitle: "",
    doi: "",
    tags: [],
    collectionList: [],
    authorsList: [],
    publicationList: [],
  };

  const [search, setSearch] = useState(initialState);

  const router = useRouter();

  const handleClick = () => {
    setShow(!show);
  };

  const onChange = (name, value) => {
    setSearch({ ...search, [name]: value });
  };

  const { showLoader, hideLoader } = useContext(LoadingContext);
  const { setAlert } = useContext(AlertContext);
  const { selected } = useContext(ServerContext);

  const onSubmit = async (e) => {
    e.preventDefault();
    showLoader();
    const data = { papers: {} };
    const error = { is: false, msg: "" };
    const query = [];

    for (let [key, value] of Object.entries(search)) {
      if (Array.isArray(value)) {
        query.push(`${key}=${value.join(",")}`);
      } else {
        query.push(`${key}=${value}`);
      }
    }

    for (let i = 0; i < selected.length; i++) {
      const server = selected[i];
      try {
        var response = await axios
          .get(`${server}/api/search?${query.join("&")}`)
          .then((res) => res.data);
        data.papers[server] = response;
      } catch (e) {
        console.error(e);
        error.is = true;
        error.msg += (i == 0 ? "" : ", ") + server;
      }
    }
    if (Object.keys(data.papers).length == selected.length && !error.is) {
      setData(data);
    } else if (Object.keys(data.papers).length > 0) {
      setData(data);
    }
    if (error.is) {
      setAlert(
        "Error encountered while searching !",
        "Could not search in the following servers: " + error.msg,
        null
      );
    }
    hideLoader();
  };

  const onClear = () => {
    setSearch(initialState);
    clearSearch();
  };

  return (
    <Fragment>
      <Button
        onClick={handleClick}
        fullWidth={false}
        style={{ textTransform: "none" }}
      >
        Advanced Search
        <div className="rotateIcon">
          <ExpandMore />
        </div>
      </Button>
      <style jsx>
        {`
          .rotateIcon {
            display: inherit;
            align-items: inherit;
            justify-content: inherit;
            margin:auto;
            transform: rotate(0deg);
            overflow: hidden;
            transition: all 0.3s linear;
            transform: ${show ? `rotate(180deg)` : ""};          }
          }
        `}
      </style>
      <Collapse in={show}>
        <Box m={2}>
          <form onSubmit={onSubmit}>
            <Grid container direction="column" spacing={1} alignItems="center">
              <Grid
                item
                container
                direction="row"
                spacing={1}
                justify="center"
                alignItems="stretch"
                xs={12}
              >
                <Grid item xs={12} sm={6} md={4}>
                  <TextSearchField
                    title="Title"
                    placeholder="Enter a title"
                    value={search.paperTitle}
                    onChange={onChange}
                    name="paperTitle"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <TextSearchField
                    title="DOI"
                    placeholder="Enter a DOI"
                    value={search.doi}
                    onChange={onChange}
                    name="doi"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <ChipSearchField
                    title="Tags"
                    options={tags}
                    onChange={onChange}
                    name="tags"
                    placeholder="Enter Tag(s)"
                    value={search.tags}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <ChipSearchField
                    title="Collections"
                    options={collections}
                    onChange={onChange}
                    name="collectionList"
                    placeholder="Enter Collection(s) Name"
                    value={search.collectionList}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <ChipSearchField
                    title="Paper Authors"
                    options={authors}
                    onChange={onChange}
                    name="authorsList"
                    placeholder="Enter Author(s) name"
                    value={search.authorsList}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <ChipSearchField
                    title="Publication"
                    options={publications}
                    onChange={onChange}
                    name="publicationList"
                    placeholder="Enter publication(s) name"
                    value={search.publicationList}
                  />
                </Grid>
              </Grid>
              <Grid item container spacing={1} justify="center">
                <Grid item>
                  <Button
                    variant="contained"
                    endIcon={<Search />}
                    type="submit"
                  >
                    Search
                  </Button>
                </Grid>
                <Grid item>
                  <Button
                    variant="contained"
                    endIcon={<Clear />}
                    onClick={onClear}
                  >
                    Clear
                  </Button>
                </Grid>
              </Grid>
            </Grid>
          </form>
        </Box>
      </Collapse>
    </Fragment>
  );
};

AdvancedSearch.propTypes = {
  setData: PropTypes.func.isRequired,
  authors: PropTypes.array.isRequired,
  publications: PropTypes.array.isRequired,
  tags: PropTypes.array.isRequired,
  collections: PropTypes.array.isRequired,
  clearSearch: PropTypes.func.isRequired,
};

export default AdvancedSearch;
