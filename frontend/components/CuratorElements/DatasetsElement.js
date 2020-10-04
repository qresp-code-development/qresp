import { useContext } from "react";

import DatasetsInfoForm from "../CuratorForms/DatasetsInfoForm";
import DatasetInfo from "../Paper/Datasets";
import { EditAndRemove } from "../Form/Util";

import CuratorContext from "../../Context/Curator/curatorContext";
import Drawer from "../drawer";

import { Typography } from "@material-ui/core";

const DatasetsInfoElement = () => {
  const { datasets, fileServerPath } = useContext(CuratorContext);

  return (
    <Drawer heading="Add Datasets from your paper" defaultOpen={true}>
      <DatasetsInfoForm />
      {datasets.length > 0 ? (
        <DatasetInfo
          datasets={datasets}
          fileserverpath={fileServerPath}
          inDrawer={false}
          editColumn={[
            {
              label: "Edit/Remove",
              name: "description",
              view: EditAndRemove,
              options: {
                align: "center",
                sort: false,
                searchable: false,
                value: null,
              },
            },
          ]}
        />
      ) : (
        <Typography
          align="center"
          variant="overline"
          style={{ marginTop: "8px" }}
        >
          No datasets added yet
          <br />
          {fileServerPath == ""
            ? "(Please select the server path in the 'Where is the paper' section above)"
            : null}
        </Typography>
      )}
    </Drawer>
  );
};

export default DatasetsInfoElement;
