import { useState, useContext, useEffect } from "react";

import PaperInfoForm from "../CuratorForms/PaperInfoForm";
import PaperInfo from "../Paper/Info";

import CuratorContext from "../../Context/Curator/curatorContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";
import SwitchFade from "../switchFade";

const FileServerElement = () => {
  const { paperInfo } = useContext(CuratorContext);
  const { editing, setEditing } = useContext(CuratorHelperContext);

  useEffect(() => {
    if (paperInfo.tags.length > 0) {
      setEditing("paperInfo", false);
    } else setEditing("paperInfo", true);
  }, [paperInfo]);

  return (
    <SwitchFade
      editing={editing.paperInfo}
      form={<PaperInfoForm editor={() => setEditing("paperInfo", false)} />}
      display={
        <PaperInfo
          paperInfo={paperInfo}
          editor={() => setEditing("paperInfo", true)}
          defaultOpen={true}
        />
      }
    />
  );
};

export default FileServerElement;
