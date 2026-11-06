import { useContext, useEffect } from "react";

import PaperInfoForm from "../CuratorForms/PaperInfoForm";
import PaperInfo from "../Paper/Info";

import CuratorContext from "../../Context/Curator/curatorContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";
import SwitchFade from "../switchFade";

const FileServerElement = () => {
  const { paperInfo } = useContext(CuratorContext);
  const { editing, setEditing } = useContext(CuratorHelperContext);

  useEffect(() => {
    // Complete once it has a P.I. -- the one field here that publishing
    // requires. Keywords and collections are optional and may stay empty.
    const pis = Array.isArray(paperInfo.PIs)
      ? paperInfo.PIs.filter((pi) => String(pi || "").trim())
      : String(paperInfo.PIs || "").trim();
    setEditing("paperInfo", !(pis && pis.length > 0));
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
