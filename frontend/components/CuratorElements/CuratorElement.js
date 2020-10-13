import { useState, useContext, useEffect } from "react";

import CuratorInfoForm from "../CuratorForms/CuratorInfoForm";
import CuratorInfo from "../Paper/Curator";

import CuratorContext from "../../Context/Curator/curatorContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";
import SwitchFade from "../switchFade";

const CuratorElement = () => {
  const { curatorInfo } = useContext(CuratorContext);
  const { editing, setEditing } = useContext(CuratorHelperContext);

  useEffect(() => {
    if (
      curatorInfo.firstName !== "" &&
      curatorInfo.lastName !== "" &&
      curatorInfo.emailIdName !== ""
    )
      setEditing("curatorInfo", false);
    else setEditing("curatorInfo", true);
  }, [curatorInfo]);

  return (
    <SwitchFade
      editing={editing.curatorInfo}
      form={<CuratorInfoForm editor={() => setEditing("curatorInfo", false)} />}
      display={
        <CuratorInfo
          curator={curatorInfo}
          editor={() => setEditing("curatorInfo", true)}
          defaultOpen={true}
        />
      }
    />
  );
};

export default CuratorElement;
