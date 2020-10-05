import { useContext } from "react";
import PropTypes from "prop-types";
import { Grid, Typography, Box, InputLabel } from "@material-ui/core";
import { RegularStyledButton } from "../button";

import CuratorContext from "../../Context/Curator/curatorContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";

const FormInputLabel = ({ label, required, forId }) => {
  return (
    <InputLabel htmlFor={forId}>
      <Typography
        color="secondary"
        style={{ fontSize: "1.1rem", margin: "auto" }}
        component="div"
        gutterBottom
      >
        <Box fontWeight="bold">
          {label}
          {required ? <span style={{ color: "red" }}> *</span> : null}
        </Box>
      </Typography>
    </InputLabel>
  );
};

FormInputLabel.propTypes = {
  label: PropTypes.string.isRequired,
  required: PropTypes.bool,
  forId: PropTypes.string.isRequired,
};

const SubmitAndReset = ({ submitText, reset }) => {
  return (
    <Box mt={1}>
      <Grid container direction="row" spacing={1}>
        <Grid item xs={6} sm={2} md={1}>
          <RegularStyledButton type="save" fullWidth>
            {submitText}
          </RegularStyledButton>
        </Grid>
        {reset ? (
          <Grid item xs={6} sm={2} md={1}>
            <RegularStyledButton type="reset" fullWidth>
              Reset
            </RegularStyledButton>
          </Grid>
        ) : null}
      </Grid>
    </Box>
  );
};

SubmitAndReset.defaultProps = {
  reset: false,
};

SubmitAndReset.propTypes = {
  submitText: PropTypes.string.isRequired,
  reset: PropTypes.bool,
};

const EditAndRemove = ({ rowdata }) => {
  const { id } = rowdata;
  const { charts, tools, datasets, scripts, del } = useContext(CuratorContext);
  const { setDefault, openForm } = useContext(CuratorHelperContext);

  const methods = { edit: null, delete: null };
  var type = "";
  var typelist = [];
  switch (id.charAt(0)) {
    case "c":
      type = "chart";
      typelist = charts;
      break;
    case "t":
      type = "tool";
      typelist = tools;
      break;
    case "d":
      type = "dataset";
      typelist = datasets;
      break;
    case "s":
      type = "script";
      typelist = scripts;
      break;
  }

  methods.edit = () => {
    openForm(type);
    setDefault(
      type,
      typelist.find((el) => el.id == id)
    );
  };
  methods.delete = () => del(type, id);

  return (
    <Grid container spacing={1} direction="column">
      <Grid item>
        <RegularStyledButton onClick={methods.edit} fullWidth>
          Edit
        </RegularStyledButton>
      </Grid>
      <Grid item>
        <RegularStyledButton onClick={methods.delete} fullWidth>
          Remove
        </RegularStyledButton>
      </Grid>
    </Grid>
  );
};

EditAndRemove.propTypes = {
  rowdata: PropTypes.object.isRequired,
};

export { SubmitAndReset, FormInputLabel, EditAndRemove };
