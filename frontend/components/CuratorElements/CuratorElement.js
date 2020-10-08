import { useState, useContext, useEffect } from "react";

import CuratorInfoForm from "../CuratorForms/CuratorInfoForm";
import CuratorInfo from "../Paper/Curator";

import CuratorContext from "../../Context/Curator/curatorContext";
import SwitchFade from "../switchFade";

const CuratorElement = () => {
  const { curatorInfo } = useContext(CuratorContext);

  const [editing, setEditing] = useState(
    curatorInfo.firstName == "" ||
      curatorInfo.lastName == "" ||
      curatorInfo.emailIdName == ""
  );

  useEffect(() => {
    if (
      curatorInfo.firstName !== "" &&
      curatorInfo.lastName !== "" &&
      curatorInfo.emailIdName !== ""
    )
      setEditing(false);
    else setEditing(true);
  }, [curatorInfo]);

  return (
    <SwitchFade
      editing={editing}
      form={<CuratorInfoForm editor={setEditing} />}
      display={
        <CuratorInfo
          curator={curatorInfo}
          editor={setEditing}
          defaultOpen={true}
        />
      }
    />
  );
};

export default CuratorElement;
