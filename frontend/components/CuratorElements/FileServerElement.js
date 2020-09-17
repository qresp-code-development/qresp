import { useState, useContext } from "react";

import FileServerInfoForm from "../CuratorForms/FileServerInfoForm";
import FileServerInfo from "../Paper/FileServer";

import CuratorContext from "../../Context/Curator/curatorContext";

const FileServerElement = () => {
  const { fileServerPath } = useContext(CuratorContext);

  const [editing, setEditing] = useState(fileServerPath === "");

  if (editing) return <FileServerInfoForm editor={setEditing} />;
  else
    return (
      <FileServerInfo
        fileserverpath={fileServerPath}
        editor={setEditing}
        defaultOpen={true}
      />
    );
};

export default FileServerElement;
