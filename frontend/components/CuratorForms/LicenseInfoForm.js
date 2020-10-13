import { useContext } from "react";
import PropTypes from "prop-types";

import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers";
import * as Yup from "yup";

import { Grid, Box } from "@material-ui/core";

import { SelectInputField } from "../Form/InputFields";
import { SubmitAndReset } from "../Form/Util";
import Drawer from "../drawer";
import { RegularStyledButton } from "../button";

import licenses from "../../data/licenses";

import CuratorContext from "../../Context/Curator/curatorContext";

const LicenseInfoForm = ({ editor }) => {
  const { setLicense } = useContext(CuratorContext);

  const schema = Yup.object({
    license: Yup.string().required("Required"),
  });

  const { control, handleSubmit, errors } = useForm({
    resolver: yupResolver(schema),
  });

  const onSubmit = (values) => {
    setLicense(values.license);
    editor();
  };

  const options = Object.keys(licenses).map((license) => {
    return { label: licenses[license].title, value: license };
  });

  return (
    <Drawer heading="Choose a License" defaultOpen={true}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Grid container spacing={1} direction="column">
          <Grid item>
            <SelectInputField
              id="license"
              placeholder="Select the license under which the data will be published"
              helperText=""
              label="Choose a License"
              options={options}
              name="license"
              error={errors.license}
              control={control}
              required
            />
          </Grid>
          <Grid item>
            <Grid container direction="row" spacing={1} alignItems="center">
              <Grid item>
                <SubmitAndReset submitText="Save" />
              </Grid>
              <Grid item>
                <Box mt={1}>
                  <RegularStyledButton
                    onClick={() =>
                      window.open("https://creativecommons.org/choose/")
                    }
                  >
                    Help me choose
                  </RegularStyledButton>
                </Box>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </form>
    </Drawer>
  );
};

LicenseInfoForm.propTypes = {
  editor: PropTypes.func.isRequired,
};

export default LicenseInfoForm;
