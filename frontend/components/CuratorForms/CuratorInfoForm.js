import { useContext } from "react";
import PropTypes from "prop-types";

import { Formik, Form } from "formik";
import * as Yup from "yup";

import { Grid } from "@material-ui/core";

import { TextInputField, NameInputField } from "../Form/InputFields";
import { SubmitAndReset } from "../Form/Util";
import Drawer from "../drawer";

import CuratorContext from "../../Context/Curator/curatorContext";

const CuratorInfoForm = ({ editor }) => {
  const { curatorInfo, setCuratorInfo } = useContext(CuratorContext);

  const nameIds = {
    fname: "curatorFirstName",
    mname: "curatorMiddleName",
    lname: "curatorLastName",
  };

  return (
    <Drawer heading="Who is Curating the paper" defaultOpen={true}>
      <Formik
        initialValues={curatorInfo}
        validationSchema={Yup.object({
          firstName: Yup.string()
            .max(15, "Must be 15 characters or less")
            .required("Required"),
          middleName: Yup.string().max(20, "Must be 20 character or less"),
          lastName: Yup.string()
            .max(20, "Must be 20 characters or less")
            .required("Required"),
          emailId: Yup.string()
            .email("Invalid email address")
            .required("Required"),
          affiliation: Yup.string(),
        })}
        onSubmit={(values, { setSubmitting }) => {
          setCuratorInfo(values);
          setSubmitting(false);
          editor(false);
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
                name="emailId"
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
              <SubmitAndReset submitText="Save" />
            </Grid>
          </Grid>
        </Form>
      </Formik>
    </Drawer>
  );
};

CuratorInfoForm.propTypes = {
  editor: PropTypes.func.isRequired,
};

export default CuratorInfoForm;
