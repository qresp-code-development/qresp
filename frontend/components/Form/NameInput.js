import PropTypes from "prop-types";

import { Grid } from "@material-ui/core";
import TextInput from "./TextInput";

const NameInput = ({ ids, names, remove, id, register, errors }) => {
  const width = 4;
  return (
    <Grid container direction="row" spacing={2} justify="space-around" id={id}>
      <Grid item xs={12} sm={width}>
        <TextInput
          id={ids.firstName}
          label="First Name"
          placeholder="Enter first name"
          name={names.firstName}
          helperText="eg. Jane"
          inputRef={register({
            required: true,
          })}
          error={errors[names.firstName]}
        />
      </Grid>
      <Grid item xs={12} sm={remove ? width - 1 : width}>
        <TextInput
          id={ids.middleName}
          label="Middle Name"
          placeholder="Enter middle name"
          name={names.middleName}
          helperText="eg. L."
          inputRef={register()}
          error={errors[names.middleName]}
        />
      </Grid>
      <Grid item xs={12} sm={width}>
        <TextInput
          id={ids.lastName}
          label="Last Name"
          placeholder="Enter last name"
          name={names.lastName}
          helperText="eg. Doe"
          inputRef={register({
            required: true,
          })}
          error={errors[names.lastName]}
        />
      </Grid>
      {remove ? (
        <Grid item item xs={12} sm={1} style={{ margin: "auto" }}>
          {remove}
        </Grid>
      ) : null}
    </Grid>
  );
};

NameInput.defaultProps = {
  ids: {
    firstName: "firstName",
    middleName: "middleName",
    lastName: "lastName",
  },
  names: {
    firstName: "firstName",
    middleName: "middleName",
    lastName: "lastName",
  },
  remove: null,
};

NameInput.propTypes = {
  ids: PropTypes.object,
  id: PropTypes.string.isRequired,
  names: PropTypes.object,
  remove: PropTypes.object,
  register: PropTypes.func.isRequired,
  errors: PropTypes.object.isRequired,
};

export default NameInput;
