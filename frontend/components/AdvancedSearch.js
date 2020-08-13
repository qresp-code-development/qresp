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
import { Search, ExpandMore } from "@material-ui/icons";
import Autocomplete from "@material-ui/lab/Autocomplete";

import LoadingContext from "../Context/Loading/loadingContext";
import AlertContext from "../Context/Alert/alertContext";

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

const ChipSearchField = ({ title, onChange, options, name, placeholder }) => {
  return (
    <Grid container direction="column" alignItems="stretch" justify="center">
      <Grid item xs={12}>
        <Typography variant="h6" color="secondary" align="center">
          <Box fontWeight="bold">{title}</Box>
        </Typography>
      </Grid>
      <Grid item xs={12}>
        <Autocomplete
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

  const onSubmit = async (e) => {
    e.preventDefault();
    showLoader();
    try {
      const data = await axios
        .get(`/api/explorer/search`, {
          params: { ...router.query, ...search },
          paramsSerializer: (params) => {
            for (const [key, value] of Object.entries(params)) {
              if (Array.isArray(value)) {
                params[key] = JSON.stringify(value);
              }
            }
            return new URLSearchParams(params).toString();
          },
        })
        .then((res) => res.data);
      setData(data);
    } catch (error) {
      console.error(error);
      setAlert(
        "Error",
        "There was an error trying to search. Please try again with some different keywords. If problems persist please contact the administrator. ",
        null
      );
    }
    hideLoader();
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
                    value={search.title}
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
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <ChipSearchField
                    title="Collections"
                    options={collections}
                    onChange={onChange}
                    name="collectionList"
                    placeholder="Enter Collection(s) Name"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <ChipSearchField
                    title="Paper Authors"
                    options={authors}
                    onChange={onChange}
                    name="authorsList"
                    placeholder="Enter Author(s) name"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <ChipSearchField
                    title="Publication"
                    options={publications}
                    onChange={onChange}
                    name="publicationList"
                    placeholder="Enter publication(s) name"
                  />
                </Grid>
              </Grid>
              <Grid item>
                <Button variant="contained" type="submit">
                  <Search />
                </Button>
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
};

export default AdvancedSearch;
