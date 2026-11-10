import { useContext, useEffect, useRef } from "react";

import ReferenceInfoForm from "../CuratorForms/ReferenceInfoForm";
import ReferenceC from "../Paper/ReferenceC";

import CuratorContext from "../../Context/Curator/curatorContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";

import SwitchFade from "../switchFade";
import { needsRepoUrl, workTypeInfo } from "../../Utils/workTypes";
import {
  guidedChangesAccepted,
  matchesSaved,
  rememberSaved,
  signatureOf,
} from "../../Utils/savedSection";

const filled = (value) =>
  Array.isArray(value) ? value.length > 0 : Boolean(String(value || "").trim());

/** Every field the publication form requires has something in it. A
 * published paper (the default, and every legacy draft) also needs its kind
 * and publication; a code repository needs its URL unless the code is on
 * the file server instead (codeHost, see CODE_HOSTS). */
export const isCompleteReference = (reference, workType, codeHost) => {
  const r = reference || {};
  const info = workTypeInfo(workType);
  const keys = ["title", "authors", "abstract"];
  if (info.paperFields) keys.push("kind", "publication");
  if (needsRepoUrl(workType, codeHost)) keys.push("url");
  return keys.every((key) => filled(r[key]));
};

const ReferenceInfoElement = () => {
  const { referenceInfo, workType, codeHost } = useContext(CuratorContext);
  const { editing, setEditing } = useContext(CuratorHelperContext);

  const signature = signatureOf(referenceInfo);

  // Opened only because the page loaded blank -- not by the curator's Edit.
  const openedForBlank = useRef(false);

  useEffect(() => {
    // Shown as saved, with something in it: remember it, so it is still
    // saved after the page remounts (e.g. coming back from the preview).
    if (!editing.referenceInfo && referenceInfo.title) {
      rememberSaved("referenceInfo", signature);
      return;
    }
    // Filled in by the guided setup (the DOI or arXiv lookup, the abstract
    // from the LaTeX): saved, once every required field has something in it.
    if (editing.referenceInfo && guidedChangesAccepted() && isCompleteReference(referenceInfo, workType, codeHost)) {
      openedForBlank.current = false;
      setEditing("referenceInfo", false);
      return;
    }
    // A blank new record starts in edit mode.
    if (!referenceInfo.title && !editing.referenceInfo) {
      openedForBlank.current = true;
      setEditing("referenceInfo", true);
      return;
    }
    // The draft arrives a moment after the page: if it is exactly what was
    // last saved, it is saved. Importing a manuscript or applying an AI
    // proposal changes it, so those never count as an implicit Save --
    // explicit Save is still the only other way this section closes.
    if (
      openedForBlank.current &&
      editing.referenceInfo &&
      referenceInfo.title &&
      matchesSaved("referenceInfo", signature)
    ) {
      openedForBlank.current = false;
      setEditing("referenceInfo", false);
    }
  }, [editing.referenceInfo, referenceInfo.title, signature, setEditing]);

  return (
    <SwitchFade
      editing={editing.referenceInfo}
      form={
        <ReferenceInfoForm editor={() => setEditing("referenceInfo", false)} />
      }
      display={
        <ReferenceC
          referenceInfo={referenceInfo}
          workType={workType}
          editor={() => setEditing("referenceInfo", true)}
          defaultOpen={true}
        />
      }
    />
  );
};

export default ReferenceInfoElement;
