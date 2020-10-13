import { useContext } from "react";
import PropTypes from "prop-types";

import { Grid, Tooltip, Typography, IconButton } from "@material-ui/core";
import {
  AddCircleOutline,
  RemoveCircleOutline,
  DescriptionOutlined,
} from "@material-ui/icons";

import { namesUtil } from "../../Utils/utils";

import { TextInputField } from "../Form/InputFields";
import { SubmitAndReset, FormInputLabel } from "../Form/Util";
import NameInput from "../Form//NameInput";
import Drawer from "../drawer";

import { useForm, useFieldArray } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers";
import * as Yup from "yup";

import CuratorContext from "../../Context/Curator/curatorContext";
import SourceTreeContext from "../../Context/SourceTree/SourceTreeContext";

const PaperInfoForm = ({ editor }) => {
  const {
    paperInfo,
    setPaperInfo,
    setReferenceAuthors,
    fileServerPath,
  } = useContext(CuratorContext);
  const { setSaveMethod, openSelector, HideSelector } = useContext(
    SourceTreeContext
  );

  const schema = Yup.object({
    PIs: Yup.array()
      .of(
        Yup.object().shape({
          firstName: Yup.string().required("Required"),
          middleName: Yup.string(),
          lastName: Yup.string().required("Required"),
        })
      )
      .required("Required")
      .min(1, "Minimum of 1 PrincipalInvestigator"),
    collections: Yup.string().required("Required"),
    tags: Yup.string().required("Required"),
    notebookFile: Yup.string(),
  });

  const formattedNames = namesUtil.get(paperInfo.PIs);
  const { register, handleSubmit, errors, watch, control, setValue } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      ...paperInfo,
      PIs: formattedNames,
      tags: paperInfo.tags.join(", "),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "PIs",
  });

  const onSubmit = (values) => {
    values.collections = values.collections.split(",").map((el) => el.trim());
    values.tags = values.tags.split(",").map((el) => el.trim());
    values.PIs = namesUtil.set(values.PIs);
    if (values.notebookFile.length > 0)
      values["notebookPath"] = fileServerPath + values.notebookFile;
    setPaperInfo(values);
    setReferenceAuthors(values.PIs);
    editor();
  };

  const onOpenFileSelector = () => {
    setSaveMethod((val) => setValue("notebookFile", val));
    openSelector();
  };

  const pId = {
    get: (index) => {
      return {
        firstName: `PIs[${index}].firstName`,
        middleName: `PIs[${index}].middleName`,
        lastName: `PIs[${index}].lastName`,
      };
    },
  };

  return (
    <Drawer heading="Add info about your paper" defaultOpen={true}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Grid container direction="column" spacing={1}>
          <Grid item>
            <Grid
              container
              justify="flex-start"
              alignItems="center"
              spacing={1}
            >
              <Grid item>
                <FormInputLabel label="Principal Investigators" forId="pis" />
              </Grid>
              <Grid item>
                <Tooltip
                  title={
                    <Typography variant="subtitle2">
                      Add a principle investigator
                    </Typography>
                  }
                  placement="right"
                  arrow
                >
                  <IconButton
                    onClick={() =>
                      append({
                        firstName: "",
                        middleName: "",
                        lastName: "",
                      })
                    }
                    style={{ padding: 0 }}
                  >
                    <AddCircleOutline color="primary" />
                  </IconButton>
                </Tooltip>
              </Grid>
            </Grid>
            {fields.map((pi, index) => {
              return (
                <Grid item key={index}>
                  <NameInput
                    ids={pId.get(index)}
                    names={pId.get(index)}
                    key={index}
                    id={`pi${index}`}
                    register={register}
                    errors={errors.PIs && errors.PIs[index]}
                    defaults={formattedNames[index]}
                    remove={
                      <Tooltip
                        title={
                          <Typography variant="subtitle2">
                            {fields.length == 1
                              ? "Required (minimum one P.I.)"
                              : "Remove principle investigator"}
                          </Typography>
                        }
                        placement="right"
                        arrow
                      >
                        <IconButton
                          size="small"
                          onClick={() => {
                            if (fields.length > 1) {
                              remove(index);
                            }
                          }}
                          style={{ padding: 0 }}
                        >
                          <RemoveCircleOutline
                            color={fields.length == 1 ? "disabled" : "primary"}
                          />
                        </IconButton>
                      </Tooltip>
                    }
                  />
                </Grid>
              );
            })}
          </Grid>
          <Grid item>
            <TextInputField
              id="paperstack"
              placeholder="Enter collection to which project belongs to"
              name="collections"
              helperText="Enter names(s) defining group of papers (eg. according to the source of fundings)"
              label="PaperStack"
              required
              inputRef={register}
              error={errors.collections}
            />
          </Grid>
          <Grid item>
            <TextInputField
              id="tags"
              placeholder="Ener tags for the project"
              name="tags"
              helperText="Enter keywords(s) (e.g. DFT, oragnic materials, charge transfer)"
              label="Keywords"
              required
              inputRef={register}
              error={errors.tags}
            />
          </Grid>
          <Grid item>
            <TextInputField
              id="mainNotebookFile"
              placeholder="Enter main notebook filename"
              name="notebookFile"
              helperText="Enter name of a notebook file, thid file may serve as a table of contents and may contain links to all datasets, charts, scripts, tools and documentation. Use the file picker button to fill this field. "
              label="Main Notebook File"
              action={
                <IconButton size="small" onClick={onOpenFileSelector}>
                  <DescriptionOutlined color="primary" />
                </IconButton>
              }
              inputRef={register}
              error={errors.notebookFile}
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

PaperInfoForm.propTypes = {
  editor: PropTypes.func.isRequired,
};

export default PaperInfoForm;
