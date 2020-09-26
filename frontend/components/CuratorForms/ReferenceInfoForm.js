import { useContext } from "react";
import PropTypes from "prop-types";

import { Grid, Tooltip, Typography, IconButton } from "@material-ui/core";
import {
  AddCircleOutline,
  RemoveCircleOutline,
  DescriptionOutlined,
} from "@material-ui/icons";

import { TextInputField, RadioInputField } from "../Form/InputFields";
import { SubmitAndReset, FormInputLabel } from "../Form/Util";
import NameInput from "../Form//NameInput";
import Drawer from "../drawer";
import { RegularStyledButton } from "../button";

import { useForm, useFieldArray } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers";
import * as Yup from "yup";

import CuratorContext from "../../Context/Curator/curatorContext";

const ReferenceInfoForm = ({ editor }) => {
  const fetchFromDoi = {
    url: (doi) => `http://dx.doi.org/10.1021/acs.chemmater.6b04126`,
    headers: "Accept: application/json; style=json",
  };

  const { paperInfo, setPaperInfo } = useContext(CuratorContext);

  const schema = Yup.object({
    kind: Yup.string().required("Required"),
    doi: Yup.string().required("Required"),
    authors: Yup.array()
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

  const { register, handleSubmit, errors, watch, control } = useForm({
    resolver: yupResolver(schema),
    defaultValues: paperInfo,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "authors",
  });

  const onSubmit = (values) => {
    setPaperInfo(values);
    editor(false);
  };

  const author = {
    get: (index) => {
      return {
        firstName: `authors[${index}].firstName`,
        middleName: `authors[${index}].middleName`,
        lastName: `authors[${index}].lastName`,
      };
    },
  };

  const radioOptions = [
    { label: "Preprint", value: "preprint" },
    { label: "Journal", value: "journal" },
    { label: "Dissertation", value: "dissertation" },
  ];

  return (
    <Drawer heading="Add Reference to your paper" defaultOpen={true}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Grid container direction="column" spacing={2}>
          <Grid item>
            <RadioInputField
              id="kind"
              name="kind"
              label="Kind"
              helperText="Select Preprint, Dissertation or Journal"
              error={errors.kind}
              required={true}
              options={radioOptions}
              row={true}
              register={register}
            />
          </Grid>
          <Grid item>
            <TextInputField
              id="doi"
              placeholder="Enter doi of the paper"
              name="doi"
              helperText="Enter DOI of the paper (e.g. 10.201/jacs.23wbn) if published"
              label="DOI"
              action={
                <Tooltip
                  title={
                    <Typography variant="subtitle2">
                      Get values for the fields below using the DOI
                    </Typography>
                  }
                  placement="right"
                  arrow
                >
                  <RegularStyledButton size="small">Fetch</RegularStyledButton>
                </Tooltip>
              }
              inputRef={register}
              error={errors.doi}
            />
          </Grid>
          <Grid item>
            <Grid
              container
              justify="flex-start"
              alignItems="center"
              spacing={1}
            >
              <Grid item>
                <FormInputLabel label="Authors" forId="authors" />
              </Grid>
              <Grid item>
                <Tooltip
                  title={
                    <Typography variant="subtitle2">
                      Add an author
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
                    ids={author.get(index)}
                    names={author.get(index)}
                    key={index}
                    id={`authors${index}`}
                    register={register}
                    errors={errors.authors && errors.authors[index]}
                    // defaults={paperInfo.authors[index]}
                    remove={
                      <Tooltip
                        title={
                          <Typography variant="subtitle2">
                            {fields.length == 1
                              ? "Required (minimum one author)"
                              : "Remove author"}
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
                <IconButton size="small">
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
      {/* <Formik
        initialValues={{
          paperStack: "",
          tags: "",
          mainNotebookFile: "",
          pis: [{ firstName: "", middleName: "", lastName: "" }],
        }}
        validationSchema={Yup.object({
          paperStack: Yup.string().required("Required"),
          tags: Yup.string().required("Required"),
          mainNotebookFile: Yup.string(),
          pis: Yup.array()
            .of(
              Yup.object().shape({
                firstName: Yup.string().required("Required"),
                middleName: Yup.string(),
                lastName: Yup.string().required("Required"),
              })
            )
            .required("Required")
            .min(1, "Minimum of 1 PrincipalInvestigator"),
        })}
        onSubmit={(values, { setSubmitting }) => {
          setSubmitting(false);
          alert(JSON.stringify(values, null, 2));
        }}
        validateOnChange={false}
        validateOnBlur={false}
        enableReinitialize={true}
      >
        {({ values }) => (
          <Form>
            <Grid direction="column" container spacing={1}>
              <FieldArray name="pis" id="pis">
                {({ remove, push }) => {
                  return (
                    <Grid item>
                      <Grid
                        container
                        spacing={2}
                        justify="flex-start"
                        alignItems="center"
                      >
                        <Grid item>
                          <FormInputLabel
                            label="Principal Investigators"
                            forId="pis"
                          />
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
                                push({
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
                      {values.pis.map((pi, index) => {
                        return (
                          <NameInput
                            ids={pId.get(index)}
                            names={pId.get(index)}
                            key={index}
                            id={`pi${index}`}
                            remove={
                              <Tooltip
                                title={
                                  <Typography variant="subtitle2">
                                    {values.pis.length == 1
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
                                    if (values.pis.length > 1) {
                                      remove(index);
                                    }
                                  }}
                                  style={{ padding: 0 }}
                                >
                                  <RemoveCircleOutline
                                    color={
                                      values.pis.length == 1
                                        ? "disabled"
                                        : "primary"
                                    }
                                  />
                                </IconButton>
                              </Tooltip>
                            }
                          />
                        );
                      })}
                    </Grid>
                  );
                }}
              </FieldArray>

              <Grid item>
                <TextInputField
                  id="paperstack"
                  placeholder="Enter collection to which project belongs to"
                  name="paperStack"
                  helperText="Enter names(s) defining group of papers (eg. according to the source of fundings)"
                  label="PaperStack"
                  required
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
                />
              </Grid>
              <Grid item>
                <TextInputField
                  id="mainNotebookFile"
                  placeholder="Enter main notebook filename"
                  name="mainNotebookFile"
                  helperText="Enter name of a notebook file, thid file may serve as a table of contents and may contain links to all datasets, charts, scripts, tools and documentation. Use the file picker button to fill this field. "
                  label="Main Notebook File"
                  action={
                    <IconButton size="small">
                      <DescriptionOutlined color="primary" />
                    </IconButton>
                  }
                />
              </Grid>
              <Grid item>
                <SubmitAndReset submitText="Save" />
              </Grid>
            </Grid>
          </Form>
        )}
      </Formik> */}
    </Drawer>
  );
};

ReferenceInfoForm.propTypes = {
  editor: PropTypes.func.isRequired,
};

export default ReferenceInfoForm;
