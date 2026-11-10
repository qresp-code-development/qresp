import { useContext, useEffect, useRef } from "react";

import CuratorContext from "../../Context/Curator/curatorContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";
import { isCompleteReference } from "./ReferenceElement";
import {
  WORKFLOW_SAVED_KEY,
  workflowSignature,
} from "../CuratorForms/WorkflowInfoForm";
import { isGraph } from "../../Utils/graph";
import { RELATED_TO, fromStoredEdge } from "../../Utils/workflowGraph";
import { rememberSaved, signatureOf } from "../../Utils/savedSection";

// A LOADED DRAFT IS NOT A PILE OF UNSAVED EDITS.
//
// Most sections decide "saved" from their own content, every time it
// changes, so a loaded draft shows them saved. Two cannot: Publication
// information and the workflow only close on an explicit Save, so after a
// load they asked to be saved again before Publish even when complete.
//
// Rendered OUTSIDE the form remounter: loading a draft rebuilds the form
// tree, and this must handle each load exactly once, not once per rebuild.
const LoadedDraftSaver = () => {
  const { loadVersion, referenceInfo, workflow, workType, codeHost } = useContext(CuratorContext) || {};
  const { setEditing } = useContext(CuratorHelperContext) || {};
  const handled = useRef(0);

  useEffect(() => {
    if (!loadVersion || handled.current === loadVersion || !setEditing) return;
    handled.current = loadVersion;

    if (isCompleteReference(referenceInfo, workType, codeHost)) {
      rememberSaved("referenceInfo", signatureOf(referenceInfo));
      setEditing("referenceInfo", false);
    }

    const flow = workflow || { nodes: [], edges: [] };
    // Both stored edge shapes, endpoints the graph actually has. A loop the
    // curator confirmed as feedback, and an undirected relation, are not the
    // accidental cycles the workflow Save warns about.
    const nodes = flow.nodes || [];
    const known = new Set(nodes);
    const edges = (flow.edges || [])
      .map(fromStoredEdge)
      .filter((edge) => known.has(edge.from) && known.has(edge.to));
    const directed = edges.filter((edge) => !edge.feedback && edge.type !== RELATED_TO);
    if (
      edges.length &&
      isGraph.connected({ nodes, edges }) &&
      !isGraph.cyclic({ nodes, edges: directed })
    ) {
      try {
        window.sessionStorage.setItem(
          WORKFLOW_SAVED_KEY,
          JSON.stringify({ signature: workflowSignature(flow), at: "" })
        );
      } catch (e) {
        // Storage unavailable: the flag below still holds for this visit.
      }
      setEditing("workflowInfo", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadVersion]);

  return null;
};

export default LoadedDraftSaver;
