import Drawer from "../drawer";
import RadioInput from "../Form/RadioInput";

import { Formik, Form } from "formik";
import * as Yup from "yup";

const LocationInfo = () => {
  const options = [
    {
      label: "HTTP Connection",
      value: "http",
    },
    {
      label: "Zenodo",
      value: "zenodo",
    },
  ];
  return (
    <Drawer heading="Where is the paper">
      <Formik
        initialValues={{ connectiontype: "" }}
        validationSchema={Yup.object({
          connectiontype: Yup.string().required("Required"),
        })}
        onSubmit={(values, { setSubmitting }) => {
          alert(JSON.stringify(values));
          setSubmitting(false);
        }}
      >
        <Form>
          <RadioInput
            name="connectiontype"
            helperText="Select connection type"
            options={options}
          />
          <button type="submit">TEST BUTTON</button>
        </Form>
      </Formik>
    </Drawer>
  );
};

export default LocationInfo;
