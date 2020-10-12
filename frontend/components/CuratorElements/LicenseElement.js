import { useState, useContext, useEffect } from "react";

import LicenseInfoForm from "../CuratorForms/LicenseInfoForm";
import LicenseInfo from "../Paper/License";

import CuratorContext from "../../Context/Curator/curatorContext";
import SwitchFade from "../switchFade";

const LicenseInfoElement = () => {
  const { license } = useContext(CuratorContext);

  const [editing, setEditing] = useState(license === "");

  useEffect(() => {
    if (license != "") {
      setEditing(false);
    } else setEditing(true);
  }, [license]);

  return (
    <SwitchFade
      editing={editing}
      form={<LicenseInfoForm editor={setEditing} />}
      display={
        <LicenseInfo type={license} editor={setEditing} defaultOpen={true} />
      }
    />
  );
};

export default LicenseInfoElement;
