import { useState, useContext, useEffect } from "react";

import FileServerInfoForm from "../CuratorForms/FileServerInfoForm";
import FileServerInfo from "../Paper/FileServer";

import CuratorContext from "../../Context/Curator/curatorContext";
import SwitchFade from "../switchFade";

const FileServerElement = () => {
  const { fileServerPath } = useContext(CuratorContext);

  const [editing, setEditing] = useState(fileServerPath === "");

  useEffect(() => {
    if (fileServerPath != "") {
      setEditing(false);
    }
  }, [fileServerPath]);

  return (
    <SwitchFade
      editing={editing}
      form={<FileServerInfoForm editor={setEditing} />}
      display={
        <FileServerInfo
          fileserverpath={fileServerPath}
          editor={setEditing}
          defaultOpen={true}
        />
      }
    />
  );
};

export default FileServerElement;
