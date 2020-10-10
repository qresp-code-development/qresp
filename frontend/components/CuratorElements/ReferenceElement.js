import { useState, useContext, useEffect } from "react";

import ReferenceInfoForm from "../CuratorForms/ReferenceInfoForm";
import ReferenceC from "../Paper/ReferenceC";

import CuratorContext from "../../Context/Curator/curatorContext";
import SwitchFade from "../switchFade";

const ReferenceInfoElement = () => {
  const { referenceInfo } = useContext(CuratorContext);

  const [editing, setEditing] = useState(true);

  useEffect(() => {
    if (referenceInfo.title) {
      setEditing(false);
    } else setEditing(true);
  }, [referenceInfo]);

  return (
    <SwitchFade
      editing={editing}
      form={<ReferenceInfoForm editor={setEditing} />}
      display={
        <ReferenceC
          referenceInfo={referenceInfo}
          editor={setEditing}
          defaultOpen={true}
        />
      }
    />
  );
};

export default ReferenceInfoElement;
