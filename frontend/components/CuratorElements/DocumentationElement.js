import { useState, useContext, useEffect } from "react";

import DocumentationInfoForm from "../CuratorForms/DocumentationInfoForm";
import Documentation from "../Paper/Documentation";

import CuratorContext from "../../Context/Curator/curatorContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";
import SwitchFade from "../switchFade";

const CuratorElement = () => {
  const { documentation } = useContext(CuratorContext);
  const { editing, setEditing } = useContext(CuratorHelperContext);

  useEffect(() => {
    if (documentation !== "") {
      setEditing("documentationInfo", false);
    } else setEditing("documentationInfo", true);
  }, [documentation]);

  return (
    <SwitchFade
      editing={editing.documentationInfo}
      form={
        <DocumentationInfoForm
          editor={() => setEditing("documentationInfo", false)}
        />
      }
      display={
        <Documentation
          documentation={documentation}
          editor={() => setEditing("documentationInfo", true)}
          defaultOpen={true}
        />
      }
    />
  );
};

export default CuratorElement;
