import { useState, useContext, useEffect } from "react";

import PaperInfoForm from "../CuratorForms/PaperInfoForm";
import PaperInfo from "../Paper/Info";

import CuratorContext from "../../Context/Curator/curatorContext";
import SwitchFade from "../switchFade";

const FileServerElement = () => {
  const { paperInfo } = useContext(CuratorContext);

  const [editing, setEditing] = useState(true);

    useEffect(() => {
      if (paperInfo.tags.length > 0 ) {
        setEditing(false);
      }
    }, [paperInfo]);

  return (
    <SwitchFade
      editing={editing}
      form={<PaperInfoForm editor={setEditing}/>}
      display={<PaperInfo paperInfo={paperInfo} editor={setEditing} defaultOpen={true}/>}
    />
  );
};

export default FileServerElement;
