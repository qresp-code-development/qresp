import { useContext } from "react";

import TreeSelect, { TreeNode, SHOW_PARENT } from "rc-tree-select";

import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@material-ui/core";

import { RegularStyledButton } from "../components/button";

import SourceTreeContext from "../Context/SourceTree/SourceTreeContext";

const FileTree = () => {
  const {
    tree,
    showSelector,
    closeSelector,
    selected,
    selectedMultiple,
    multiple,
    title,
    setSelected,
    setSelectedMultiple,
  } = useContext(SourceTreeContext);

  const onChange = (value, ...rest) => {
    console.log("onSingleCheck", value, rest);
    setSelected(value);
  };

  const onMultipleChange = (value) => {
    console.log("onMultipleChange", value);
    setSelectedMultiple(value);
  };

  return (
    <Dialog open={showSelector} onClose={closeSelector}>
      <DialogTitle onClose={closeSelector}>{title}</DialogTitle>
      <DialogContent>
        <TreeSelect
          style={{ zIndex: 100000 }}
          transitionName="rc-tree-select-dropdown-slide-up"
          choiceTransitionName="rc-tree-select-selection__choice-zoom"
          dropdownStyle={{
            maxHeight: "50vh",
            overflow: "auto",
            zIndex: 100000,
          }}
          multiple={multiple}
          value={multiple ? selectedMultiple : selected}
          treeData={tree}
          treeNodeFilterProp="title"
          onChange={multiple ? onMultipleChange : onChange}
          allowClear
        />
      </DialogContent>
      <DialogActions>
        <RegularStyledButton>Save</RegularStyledButton>
        <RegularStyledButton onClick={closeSelector}>
          Cancel
        </RegularStyledButton>
      </DialogActions>
    </Dialog>
  );
};

export default FileTree;
