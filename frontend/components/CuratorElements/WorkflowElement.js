import WorkflowInfoForm from "../CuratorForms/WorkflowInfoForm";

// THE ONE WORKFLOW GRAPH.
//
// "Organize figures and resources" manages resources: add, link, edit,
// remove. This is where the graph itself lives and is edited, and there is
// no second drawing of it anywhere in the Curator -- two pictures of one
// graph is two things to keep in step and two places to learn.
//
// It is mounted UNCONDITIONALLY. It used to appear only once the workflow
// already had nodes, which also hid the External Data form it owns -- the
// one way to enter external data anywhere in the Curator disappeared exactly
// when a curator had none of it yet.

const WorkflowInfoElement = () => <WorkflowInfoForm />;

export default WorkflowInfoElement;
