import { Formik, Form } from "formik";
import * as Yup from "yup";

import { Grid } from "@material-ui/core";

import {
  TextInputField,
  NameInputField,
} from "../../components/Form/InputFields";
import NameInput from "../../components/Form/NameInput";
import { SaveAndReset, FormInputLabel } from "../../components/Form/Util";
import Drawer from "../drawer";

const CuratorInfo = () => {
  const nameIds = {
    fname: "curatorFirstName",
    mname: "curatorMiddleName",
    lname: "curatorLastName",
  };

  return (
    <Drawer heading="Who is Curating the paper" defaultOpen={true}>
      <Formik
        initialValues={{
          firstName: "",
          lastName: "",
          email: "",
          affiliation: "",
        }}
        validationSchema={Yup.object({
          firstName: Yup.string()
            .max(15, "Must be 15 characters or less")
            .required("Required"),
          middleName: Yup.string().max(20, "Must be 20 character or less"),
          lastName: Yup.string()
            .max(20, "Must be 20 characters or less")
            .required("Required"),
          email: Yup.string()
            .email("Invalid email address")
            .required("Required"),
          affiliation: Yup.string(),
        })}
        onSubmit={(values, { setSubmitting }) => {
          alert(JSON.stringify(values, null, 2));
          setSubmitting(false);
        }}
      >
        <Form>
          <Grid container direction="column" spacing={1}>
            <Grid item>
              <NameInputField ids={nameIds} label="Name" required={true} />
            </Grid>
            <Grid item>
              <TextInputField
                id="curatorEmail"
                placeholder="Enter email address"
                name="email"
                type="email"
                helperText="eg. Jane@univ.com"
                label="Email"
                required={true}
              />
            </Grid>
            <Grid item>
              <TextInputField
                id="curatorAffiliation"
                placeholder="Enter your university/organization"
                name="affiliation"
                helperText="eg. Dept. of Physics, University of XYZ"
                label="Affiliation"
              />
            </Grid>
            <Grid item>
              <SaveAndReset />
            </Grid>
          </Grid>
        </Form>
      </Formik>
    </Drawer>
  );
};

export default CuratorInfo;
