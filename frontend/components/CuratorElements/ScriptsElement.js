import { useContext } from "react";

import ScriptsInfoForm from "../CuratorForms/ScriptsInfoForm";
import ScriptInfo from "../Paper/Scripts";
import { EditAndRemove } from "../Form/Util";

import CuratorContext from "../../Context/Curator/curatorContext";
import Drawer from "../drawer";

import { Typography } from "@material-ui/core";

const ScriptsInfoElement = () => {
  const { scripts, fileServerPath } = useContext(CuratorContext);

  return (
    <Drawer heading="Add Scripts from your paper" defaultOpen={true}>
      <ScriptsInfoForm />
      {scripts.length > 0 ? (
        <ScriptInfo
          scripts={scripts}
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
          No Scripts added yet
          <br />
          {fileServerPath == ""
            ? "(Please select the server path in the 'Where is the paper' section above)"
            : null}
        </Typography>
      )}
    </Drawer>
  );
};

export default ScriptsInfoElement;
