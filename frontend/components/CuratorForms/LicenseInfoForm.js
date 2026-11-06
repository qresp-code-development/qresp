import { useContext, useEffect } from "react";
import PropTypes from "prop-types";

import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as Yup from "yup";

import { Grid, Box } from "@mui/material";

import { SelectInputField } from "../Form/InputFields";
import { SubmitAndReset } from "../Form/Util";
import Drawer from "../drawer";
import { RegularStyledButton } from "../button";

import licenses from "../../data/licenses";

import CuratorContext from "../../Context/Curator/curatorContext";

const LicenseInfoForm = ({ editor }) => {
  const { license, setLicense, registerDraftFlusher } =
    useContext(CuratorContext);

  const schema = Yup.object({
    // Optional: a new record starts under CC BY 4.0 anyway.
    license: Yup.string(),
  });

  const { control, handleSubmit, formState: { errors }, getValues } = useForm({
    resolver: yupResolver(schema),
    defaultValues: { license: license || "" },
  });

  useEffect(() => {
    if (!registerDraftFlusher) return undefined;
    return registerDraftFlusher("license", () => ({
      license: getValues("license") || "",
    }));
  }, [getValues, registerDraftFlusher]);

  const onSubmit = (values) => {
    setLicense(values.license);
    editor();
  };

  const options = Object.keys(licenses).map((license) => {
    return { label: licenses[license].title, value: license };
  });

  return (
    <Drawer heading="Choose a License" defaultOpen={true} editing autoSave unsaved>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Grid container spacing={1} direction="column">
          <Grid>
            <SelectInputField
              id="license"
              placeholder="Select the license under which the data will be published"
              helperText=""
              label="Choose a License"
              options={options}
              name="license"
              error={errors.license}
              control={control}
            />
          </Grid>
          <Grid>
            <Grid container direction="row" spacing={1} alignItems="center">
              <Grid>
                <SubmitAndReset submitText="Save" />
              </Grid>
              <Grid>
                <Box sx={{ mt: 1 }}>
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
