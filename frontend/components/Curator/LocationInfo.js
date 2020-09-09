import { Grid } from "@material-ui/core";

import Drawer from "../drawer";
import RadioInput from "../Form/RadioInput";
import { SelectInputField, TextInputField } from "../Form/InputFields";
import { SearchAndReset } from "../../components/Form/Util";

import { getList } from "../../Utils/Scraper";

import { Formik, Form, useFormikContext } from "formik";
import * as Yup from "yup";

const FormField = () => {
  const { values } = useFormikContext();

  const httpServerOptions = [
    {
      label: "RCC (https://notebook.rcc.uchicago.edu/files/)",
      value: "https://notebook.rcc.uchicago.edu/files/",
    },
  ];

  if (values.connectiontype == "http") {
    return (
      <SelectInputField
        id="connectionType"
        placeholder="Select a server"
        helperText="Select URL of remote server where paper content is organized and located. e.g. https://notebook.rcc.uchicago.edu/files/"
        name="dataserver"
        label="File Server"
        options={httpServerOptions}
      />
    );
  } else {
    return (
      <TextInputField
        id="connectionType"
        placeholder="Enter zenodo record URL"
        name="dataserver"
        type="email"
        helperText="eg. https://zenodo.org/record/3981451"
        label="Zenodo"
      />
    );
  }
};

const LocationInfo = () => {
  const options = [
    {
      label: "File Server",
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
        initialValues={{
          connectiontype: "http",
          dataserver: "",
        }}
        validationSchema={Yup.object({
          connectiontype: Yup.string().required("Required"),
          dataserver: Yup.string().required("Required"),
        })}
        onSubmit={(values, { setSubmitting }) => {
          alert(JSON.stringify(values));
          setSubmitting(false);
          getList(values.dataserver, values.connectiontype).then((el) =>
            console.log(el)
          );
        }}
      >
        <Form>
          <Grid direction="column" container spacing={1}>
            <Grid item>
              <RadioInput
                name="connectiontype"
                helperText="Select location type of the data source"
                options={options}
                row={true}
              />
            </Grid>
            <Grid item>
              <FormField />
            </Grid>
            <Grid item>
              <SearchAndReset />
            </Grid>
          </Grid>
        </Form>
      </Formik>
    </Drawer>
  );
};

export default LocationInfo;
