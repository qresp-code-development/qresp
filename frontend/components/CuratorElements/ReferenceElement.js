import { useState, useContext, useEffect } from "react";

import ReferenceInfoForm from "../CuratorForms/ReferenceInfoForm";
// import PaperInfo from "../Paper/Info";

import CuratorContext from "../../Context/Curator/curatorContext";
import SwitchFade from "../switchFade";

const ReferenceInfoElement = () => {
  //   const { paperInfo } = useContext(CuratorContext);

    const [editing, setEditing] = useState(true);

  //     useEffect(() => {
  //       if (paperInfo.tags.length > 0 ) {
  //         setEditing(false);
  //       }
  //     }, [paperInfo]);

  return (
    <SwitchFade
      editing={editing}
      form={<ReferenceInfoForm editor={setEditing} />}
      display={<div>Ok</div>}
      //   display={<PaperInfo paperInfo={paperInfo} editor={setEditing} defaultOpen={true}/>}
    />
  );
};

export default ReferenceInfoElement;
