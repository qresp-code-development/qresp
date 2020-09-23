import PropTypes from "prop-types";
import { Grid, Typography, Box, InputLabel } from "@material-ui/core";
import { RegularStyledButton } from "../button";

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

export { SubmitAndReset, FormInputLabel };
