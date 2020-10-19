import { useContext } from "react";
import WorkflowInfoForm from "../CuratorForms/WorkflowInfoForm";
import CuratorContext from "../../Context/Curator/curatorContext";

const WorkflowInfoElement = () => {
  const { workflow } = useContext(CuratorContext);

  return workflow.nodes.length > 0 && <WorkflowInfoForm />;
};

export default WorkflowInfoElement;
