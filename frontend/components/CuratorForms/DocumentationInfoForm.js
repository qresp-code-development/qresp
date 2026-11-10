import { useContext, useEffect } from "react";
import PropTypes from "prop-types";

import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as Yup from "yup";

import { Grid } from "@mui/material";

import { TextInputField } from "../Form/InputFields";
import { SubmitAndReset } from "../Form/Util";
import Drawer from "../drawer";

import CuratorContext from "../../Context/Curator/curatorContext";

const DocumentationInfoForm = ({ editor }) => {
  const { documentation, setDocumentation, registerDraftFlusher } =
    useContext(CuratorContext);

  const schema = Yup.object({
    documentation: Yup.string(),
  });

  const { register, handleSubmit, formState: { errors }, getValues } = useForm({
    resolver: yupResolver(schema),
    defaultValues: { documentation },
  });

  useEffect(() => {
    if (!registerDraftFlusher) return undefined;
    return registerDraftFlusher("documentation", () => ({
      documentation: getValues("documentation") || "",
    }));
  }, [getValues, registerDraftFlusher]);

  const onSubmit = (values) => {
    setDocumentation(values.documentation);
    editor();
  };

  return (
    <Drawer heading="Add additional documentation" defaultOpen={true} editing autoSave>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Grid container direction="column" spacing={1}>
          <Grid>
            <TextInputField
              id="documentation"
              placeholder="Enter additional documentation for the paper"
              name="documentation"
              helperText="Enter additional documentation for the paper"
              label="Readme"
              register={register}
              errore={errors.documentation}
              defaultValue={documentation}
              multiline
              rows={10}
            />
          </Grid>
          <Grid>
            <SubmitAndReset submitText="Save" />
          </Grid>
        </Grid>
      </form>
    </Drawer>
  );
};

DocumentationInfoForm.propTypes = {
  editor: PropTypes.func.isRequired,
};

export default DocumentationInfoForm;
