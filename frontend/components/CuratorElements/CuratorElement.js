import { useState, useContext, useEffect, Fragment } from "react";

import CuratorInfoForm from "../CuratorForms/CuratorInfoForm";
import CuratorInfo from "../Paper/Curator";

import CuratorContext from "../../Context/Curator/curatorContext";

import ElementTransition from "../Transition/ElementTransition";

import { TransitionGroup } from "react-transition-group";

const CuratorElement = () => {
  const { curatorInfo } = useContext(CuratorContext);

  const [editing, setEditing] = useState(
    curatorInfo.firstName == "" ||
      curatorInfo.lastName == "" ||
      curatorInfo.emailIdName == ""
  );

  useEffect(() => {
    if (
      curatorInfo.firstName !== "" &&
      curatorInfo.lastName !== "" &&
      curatorInfo.emailIdName !== ""
    ) {
      setEditing(false);
    }
  }, [curatorInfo]);

  return (
    <Fragment>
      <div className="curatorFormInfo">
        <CuratorInfoForm editor={setEditing} />
      </div>
      <div className="curatorInfo">
        <CuratorInfo
          curator={curatorInfo}
          editor={setEditing}
          defaultOpen={true}
        />
      </div>
      <style jsx>{`
        .curatorFormInfo {
          height: ${editing ? "max-content" : "0"};
          opacity: ${editing ? 1 : 0};
          transition: opacity 0.25s linear;
        }
        .curatorInfo {
          height: ${editing ? "0" : "max-content"};
          opacity: ${editing ? 0 : 1};
          transition: opacity 0.25s linear;
        }
      `}</style>
    </Fragment>
  );
};

export default CuratorElement;
