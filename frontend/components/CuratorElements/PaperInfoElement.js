import { useState, useContext, useEffect } from "react";

import PaperInfoForm from "../CuratorForms/PaperInfoForm";
import FileServerInfo from "../Paper/FileServer";

import CuratorContext from "../../Context/Curator/curatorContext";
import SwitchFade from "../switchFade";

const FileServerElement = () => {
  //   const { fileServerPath } = useContext(CuratorContext);

  const [editing, setEditing] = useState(true);

  //   useEffect(() => {
  //     if (fileServerPath != "") {
  //       setEditing(false);
  //     }
  //   }, [fileServerPath]);

  return (
    <SwitchFade
      editing={editing}
      form={<PaperInfoForm editor={setEditing} />}
      display={<div>okay</div>}
    />
  );
};

export default FileServerElement;
