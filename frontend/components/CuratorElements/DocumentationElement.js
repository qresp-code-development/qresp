import { useState, useContext, useEffect } from "react";

import DocumentationInfoForm from "../CuratorForms/DocumentationInfoForm";
import Documentation from "../Paper/Documentation";

import CuratorContext from "../../Context/Curator/curatorContext";
import SwitchFade from "../switchFade";

const CuratorElement = () => {
  const { documentation } = useContext(CuratorContext);

  const [editing, setEditing] = useState(documentation == "");

  useEffect(() => {
    if (documentation !== "") {
      setEditing(false);
    }
  }, [documentation]);

  return (
    <SwitchFade
      editing={editing}
      form={<DocumentationInfoForm editor={setEditing} />}
      display={
        <Documentation
          documentation={documentation}
          editor={setEditing}
          defaultOpen={true}
        />
      }
    />
  );
};

export default CuratorElement;
