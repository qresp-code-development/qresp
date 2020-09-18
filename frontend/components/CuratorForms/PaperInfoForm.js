import PropTypes from "prop-types";

import { Grid } from "@material-ui/core";

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
        fname: `pis[${index}].firstName`,
        mname: `pis[${index}].middleName`,
        lname: `pis[${index}].lastName`,
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
          alert(JSON.stringify(values));
        }}
      >
        <Form>
          <Grid direction="column" container spacing={1}>
            <Grid item>
              <FieldArray
                name="pis"
                render={() => (
                  <div>
                    {values.pis.map((pi, index) => (
                      <div key={index}>
                        <NameInput
                          ids={pId.get(index)}
                          names={pId.get(index)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              />
            </Grid>
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
              />
            </Grid>
            <Grid item>
              <SubmitAndReset submitText="Save" />
            </Grid>
          </Grid>
        </Form>
      </Formik>
    </Drawer>
  );
};

PaperInfoForm.propTypes = {
  editor: PropTypes.func.isRequired,
};

export default PaperInfoForm;
