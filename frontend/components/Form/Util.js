import PropTypes from "prop-types";
import { Grid, Typography, Box, InputLabel } from "@material-ui/core";
import { RegularStyledButton } from "../button";

const FormInputLabel = ({ label, required, forId }) => {
  return (
    <InputLabel htmlFor={forId}>
      <Typography variant="h6" color="secondary">
        {label} {required ? <span style={{ color: "red" }}> *</span> : null}
      </Typography>
    </InputLabel>
  );
};

FormInputLabel.propTypes = {
  label: PropTypes.string.isRequired,
  required: PropTypes.bool,
  forId: PropTypes.string.isRequired,
};

const SaveAndReset = () => {
  return (
    <Box mt={1}>
      <Grid container direction="row" spacing={1}>
        <Grid item xs={6} sm={1}>
          <RegularStyledButton type="save" fullWidth>
            Save
          </RegularStyledButton>
        </Grid>
        <Grid item xs={6} sm={1}>
          <RegularStyledButton type="reset" fullWidth>
            Reset
          </RegularStyledButton>
        </Grid>
      </Grid>
    </Box>
  );
};

const SearchAndReset = () => {
  return (
    <Box mt={1}>
      <Grid container direction="row" spacing={1}>
        <Grid item xs={6} sm={1}>
          <RegularStyledButton type="save" fullWidth>
            Search
          </RegularStyledButton>
        </Grid>
        <Grid item xs={6} sm={1}>
          <RegularStyledButton type="reset" fullWidth>
            Reset
          </RegularStyledButton>
        </Grid>
      </Grid>
    </Box>
  );
};

export { SaveAndReset, SearchAndReset, FormInputLabel };
