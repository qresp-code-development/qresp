import { useState, useContext } from "react";

import { IconButton } from "@material-ui/core";
import { Edit } from "@material-ui/icons";

import CuratorInfoForm from "../CuratorForms/CuratorInfoForm";
import CuratorInfo from "../Paper/Curator";

import CuratorContext from "../../Context/Curator/curatorContext";

const CuratorElement = () => {
  const { curatorInfo } = useContext(CuratorContext);

  const [editing, setEditing] = useState(
    curatorInfo.firstName == "" ||
      curatorInfo.lastName == "" ||
      curatorInfo.emailIdName == ""
  );

  if (editing) return <CuratorInfoForm editor={setEditing} />;
  else
    return (
      <CuratorInfo
        curator={curatorInfo}
        editor={setEditing}
        defaultOpen={true}
      />
    );
};

export default CuratorElement;
