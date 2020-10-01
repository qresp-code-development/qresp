import { useContext } from "react";
import PropTypes from "prop-types";
import { Grid, Typography, Box, InputLabel } from "@material-ui/core";
import { RegularStyledButton } from "../button";

import CuratorContext from "../../Context/Curator/curatorContext";

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
  const { section, index } = rowdata;
  const { charts, setChartDefault, deleteChart, openChartForm } = useContext(
    CuratorContext
  );

  const methods = { edit: null, delete: null };

  switch (section) {
    case "CHART":
      methods.edit = () => {
        openChartForm();
        setChartDefault(charts.find((el) => el.index == index));
      };
      methods.delete = () => deleteChart(index);
  }

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
