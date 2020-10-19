import { useContext } from "react";
import PropTypes from "prop-types";

import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers";
import * as Yup from "yup";

import { Grid } from "@material-ui/core";

import { TextInputField } from "../Form/InputFields";
import { SubmitAndReset } from "../Form/Util";
import Drawer from "../drawer";

import CuratorContext from "../../Context/Curator/curatorContext";

const DocumentationInfoForm = ({ editor }) => {
  const { documentation, setDocumentation } = useContext(CuratorContext);

  const schema = Yup.object({
    documentation: Yup.string(),
  });

  const { register, handleSubmit, errors, setValue } = useForm({
    resolver: yupResolver(schema),
  });

  const onSubmit = (values) => {
    setDocumentation(values.documentation);
    editor();
  };

  return (
    <Drawer heading="Add additional documentation" defaultOpen={true}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Grid container direction="column" spacing={1}>
          <Grid item>
            <TextInputField
              id="documentation"
              placeholder="Enter additional documentation for the paper"
              name="documentation"
              helperText="Enter additional documentation for the paper"
              label="Readme"
              inputRef={register}
              errore={errors.documentation}
              defaultValue={documentation}
              multiline
              rows={10}
            />
          </Grid>
          <Grid item>
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
