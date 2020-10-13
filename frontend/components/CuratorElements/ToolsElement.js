import { useContext } from "react";

import ToolsInfoForm from "../CuratorForms/ToolsInfoForm";
import ToolsInfo from "../Paper/Tools";
import { EditAndRemove } from "../Form/Util";

import CuratorContext from "../../Context/Curator/curatorContext";
import Drawer from "../drawer";

import { Typography } from "@material-ui/core";

const ToolsInfoElement = () => {
  const { tools } = useContext(CuratorContext);

  return (
    <Drawer heading="Add Tools from your paper" defaultOpen={true}>
      <ToolsInfoForm />
      {tools.length > 0 ? (
        <ToolsInfo
          tools={tools}
          inDrawer={false}
          editColumn={[
            {
              label: "Edit/Remove",
              name: "details",
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
          No tools added yet
        </Typography>
      )}
    </Drawer>
  );
};

export default ToolsInfoElement;
