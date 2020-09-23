import PropTypes from "prop-types";

import { Grid, Tooltip, Typography, IconButton } from "@material-ui/core";
import {
  AddCircleOutline,
  RemoveCircleOutline,
  DescriptionOutlined,
} from "@material-ui/icons";

import { TextInputField } from "../Form/InputFields";
import { SubmitAndReset, FormInputLabel } from "../Form/Util";
import NameInput from "../Form//NameInput";
import Drawer from "../drawer";
import { Formik, Form, FieldArray } from "formik";
import * as Yup from "yup";

const PaperInfoForm = ({ editor }) => {
  const pId = {
    get: (index) => {
      return {
        firstName: `pis[${index}].firstName`,
        middleName: `pis[${index}].middleName`,
        lastName: `pis[${index}].lastName`,
      };
    },
  };

  return (
    <Drawer heading="Where is the paper" defaultOpen={true}>
      <Formik
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
      </Formik>
    </Drawer>
  );
};

PaperInfoForm.propTypes = {
  editor: PropTypes.func.isRequired,
};

export default PaperInfoForm;
