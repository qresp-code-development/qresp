import PropTypes from "prop-types";

import { Grid } from "@material-ui/core";
import TextInput from "./TextInput";

const NameInput = ({ ids }) => {
  return (
    <Grid container direction="row" spacing={2} justify="space-between">
      <Grid item xs={12} sm={4}>
        <TextInput
          id={ids.fname}
          placeholder="Enter first name"
          name="firstName"
          helperText="eg. Jane"
        />
      </Grid>
      <Grid item xs={12} sm={4}>
        <TextInput
          id={ids.mname}
          placeholder="Enter middle name"
          name="middleName"
          helperText="eg. L."
        />
      </Grid>
      <Grid item xs={12} sm={4}>
        <TextInput
          id={ids.lname}
          placeholder="Enter last name"
          name="lastName"
          helperText="eg. Doe"
        />
      </Grid>
    </Grid>
  );
};

NameInput.defaultProps = {
  ids: {
    fname: "firstName",
    mname: "middleName",
    lname: "lastName",
  },
};

NameInput.propTypes = {
  ids: PropTypes.object,
};

export default NameInput;
