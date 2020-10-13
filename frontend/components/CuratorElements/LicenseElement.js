import { useState, useContext, useEffect } from "react";

import LicenseInfoForm from "../CuratorForms/LicenseInfoForm";
import LicenseInfo from "../Paper/License";

import CuratorContext from "../../Context/Curator/curatorContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";
import SwitchFade from "../switchFade";

const LicenseInfoElement = () => {
  const { license } = useContext(CuratorContext);

  const { editing, setEditing } = useContext(CuratorHelperContext);

  useEffect(() => {
    if (license != "") {
      setEditing("licenseInfo", false);
    } else setEditing("licenseInfo", true);
  }, [license]);

  return (
    <SwitchFade
      editing={editing.licenseInfo}
      form={<LicenseInfoForm editor={() => setEditing("licenseInfo", false)} />}
      display={
        <LicenseInfo
          type={license}
          editor={() => setEditing("licenseInfo", true)}
          defaultOpen={true}
        />
      }
    />
  );
};

export default LicenseInfoElement;
