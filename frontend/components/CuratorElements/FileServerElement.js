import { useState, useContext, useEffect } from "react";

import FileServerInfoForm from "../CuratorForms/FileServerInfoForm";
import FileServerInfo from "../Paper/FileServer";

import CuratorContext from "../../Context/Curator/curatorContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";
import SwitchFade from "../switchFade";

const FileServerElement = () => {
  const { fileServerPath } = useContext(CuratorContext);
  const { editing, setEditing } = useContext(CuratorHelperContext);

  useEffect(() => {
    if (fileServerPath != "") {
      setEditing("fileServerPathInfo", false);
    } else setEditing("fileServerPathInfo", true);
  }, [fileServerPath]);

  return (
    <SwitchFade
      editing={editing.fileServerPathInfo}
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
