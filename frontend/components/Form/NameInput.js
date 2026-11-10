import PropTypes from "prop-types";

import { Grid } from "@mui/material";
import TextInput from "./TextInput";

const NameInput = ({
  ids = { firstName: "firstName", middleName: "middleName", lastName: "lastName" },
  names = { firstName: "firstName", middleName: "middleName", lastName: "lastName" },
  remove = null,
  id,
  register,
  errors,
  defaults,
}) => {
  const width = 4;

  return (
    <Grid container direction="row" spacing={2} id={id} style={{marginTop:remove?0:"0.1rem"}} sx={{ justifyContent: "space-around" }}>
      <Grid size={{ xs: 12, sm: width }}>
        <TextInput
          id={ids.firstName}
          label="First Name"
          placeholder="Enter first name"
          name={names.firstName}
          helperText="eg. Jane"
          register={register}
          error={errors?.firstName || errors?.[names.firstName]}
          defaultValue={defaults?.firstName || ""}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: remove ? width - 1 : width }}>
        <TextInput
          id={ids.middleName}
          label="Middle Name"
          placeholder="Enter middle name"
          name={names.middleName}
          helperText="eg. L."
          register={register}
          error={errors?.middleName || errors?.[names.middleName]}
          defaultValue={defaults?.middleName || ""}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: width }}>
        <TextInput
          id={ids.lastName}
          label="Last Name"
          placeholder="Enter last name"
          name={names.lastName}
          helperText="eg. Doe"
          register={register}
          error={errors?.lastName || errors?.[names.lastName]}
          defaultValue={defaults?.lastName || ""}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Grid>
      {remove ? (
        <Grid style={{ margin: "auto" }} size={{ xs: 12, sm: 1 }}>
          {remove}
        </Grid>
      ) : null}
    </Grid>
  );
};

NameInput.propTypes = {
  ids: PropTypes.object,
  id: PropTypes.string.isRequired,
  names: PropTypes.object,
  remove: PropTypes.object,
  register: PropTypes.func.isRequired,
  errors: PropTypes.object,
  defaults: PropTypes.object,
};

export default NameInput;
