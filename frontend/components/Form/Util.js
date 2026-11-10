import { Fragment, useContext } from "react";
import PropTypes from "prop-types";
import { Grid, Typography, Box, InputLabel } from "@mui/material";
import { RegularStyledButton } from "../button";

import CuratorContext from "../../Context/Curator/curatorContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";

// Text that is read aloud but not drawn. The standard clip-rect recipe, so a
// screen reader gets a word where a sighted reader gets a symbol.
const visuallyHidden = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

// The required marker, in ONE place.
//
// A red `*` on its own carries the meaning in two channels a reader may not
// have: colour, and a symbol whose convention has to be known. Screen readers
// commonly announce it as "star" or skip it entirely, and somebody who cannot
// distinguish the red is looking at ordinary punctuation.
//
// So the asterisk is marked `aria-hidden` — it is decoration — and the word
// "required" is added beside it for assistive technology. `RequiredFieldLegend`
// explains the same symbol to everyone who can see it.
const RequiredMark = () => (
  <Fragment>
    <Box component="span" aria-hidden="true" sx={{ color: "error.main" }}>
      {" *"}
    </Box>
    <Box component="span" sx={visuallyHidden}>
      {" (required)"}
    </Box>
  </Fragment>
);

const FormInputLabel = ({ label, required, forId }) => {
  return (
    <InputLabel htmlFor={forId} sx={{ whiteSpace: "normal" }}>
      <Typography
        component="div"
        sx={{ fontSize: "0.95rem", fontWeight: 600, color: "text.primary", mb: 0.5 }}
      >
        {label}
        {required ? <RequiredMark /> : null}
      </Typography>
    </InputLabel>
  );
};

// One line under a label saying what the field is for and why it matters.
const FieldDescription = ({ children }) => (
  <Typography
    variant="body2"
    color="text.secondary"
    component="div"
    sx={{ mb: 1, lineHeight: 1.5, maxWidth: 720 }}
  >
    {children}
  </Typography>
);

FormInputLabel.propTypes = {
  label: PropTypes.string.isRequired,
  required: PropTypes.bool,
  forId: PropTypes.string.isRequired,
};

// What the asterisk means, said once per form.
//
// Every curator form marks its required inputs with a coloured `*` and none
// of them ever said what it stood for. The convention is widespread but not
// universal, and it is invisible to a reader who cannot see the colour
// difference; a legend costs one line and removes the guess.
//
// Placed at the TOP of a form, before the first field, so it is read before
// the symbol it explains rather than after.
const RequiredFieldLegend = () => (
  <Typography
    variant="body2"
    color="secondary"
    component="p"
    data-testid="required-field-legend"
    sx={{ mb: 1 }}
  >
    <Box component="span" aria-hidden="true" sx={{ color: "error.main" }}>
      *
    </Box>{" "}
    Required field
  </Typography>
);

const SubmitAndReset = ({ submitText, reset = false }) => {
  return (
    <Box sx={{ mt: 1 }}>
      <Grid container direction="row" spacing={1}>
        <Grid size={{ xs: 6, sm: 2, md: 1 }}>
          <RegularStyledButton type="submit" fullWidth>
            {submitText}
          </RegularStyledButton>
        </Grid>
        {reset ? (
          <Grid size={{ xs: 6, sm: 2, md: 1 }}>
            <RegularStyledButton type="reset" fullWidth>
              Reset
            </RegularStyledButton>
          </Grid>
        ) : null}
      </Grid>
    </Box>
  );
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
      <Grid>
        <RegularStyledButton onClick={methods.edit} fullWidth>
          Edit
        </RegularStyledButton>
      </Grid>
      <Grid>
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

export {
  FieldDescription,
  SubmitAndReset,
  FormInputLabel,
  RequiredFieldLegend,
  RequiredMark,
  EditAndRemove,
};
