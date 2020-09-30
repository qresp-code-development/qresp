import { useState, useContext, useEffect } from "react";

import ChartsInfoForm from "../CuratorForms/ChartsInfoForm";
import ChartsInfo from "../Paper/Charts";

import CuratorContext from "../../Context/Curator/curatorContext";
import SwitchFade from "../switchFade";

const ChartsInfoElement = () => {
  const { charts } = useContext(CuratorContext);

  //   const [editing, setEditing] = useState(true);

  //   useEffect(() => {
  //     if (referenceInfo.title) {
  //       setEditing(false);
  //     }
  //   }, [referenceInfo]);

  return (
    <SwitchFade
      editing={true}
      form={<ChartsInfoForm />}
      display={<p></p>}
      //   display={
      //     <ReferenceC
      //       referenceInfo={referenceInfo}
      //       editor={setEditing}
      //       defaultOpen={true}
      //     />
      //   }
    />
  );
};

export default ChartsInfoElement;
