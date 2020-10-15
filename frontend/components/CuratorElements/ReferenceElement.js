import { useState, useContext, useEffect } from "react";

import ReferenceInfoForm from "../CuratorForms/ReferenceInfoForm";
import ReferenceC from "../Paper/ReferenceC";

import CuratorContext from "../../Context/Curator/curatorContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";

import SwitchFade from "../switchFade";

const ReferenceInfoElement = () => {
  const { referenceInfo } = useContext(CuratorContext);
  const { editing, setEditing } = useContext(CuratorHelperContext);

  useEffect(() => {
    if (referenceInfo.title) {
      setEditing("referenceInfo", false);
    } else setEditing("referenceInfo", true);
  }, [referenceInfo]);

  return (
    <SwitchFade
      editing={editing.referenceInfo}
      form={
        <ReferenceInfoForm editor={() => setEditing("referenceInfo", false)} />
      }
      display={
        <ReferenceC
          referenceInfo={referenceInfo}
          editor={() => setEditing("referenceInfo", true)}
          defaultOpen={true}
        />
      }
    />
  );
};

export default ReferenceInfoElement;
