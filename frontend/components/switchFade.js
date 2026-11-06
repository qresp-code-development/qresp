import React, { Fragment, useRef } from "react";
import PropTypes from "prop-types";

import { SwitchTransition, Transition } from "react-transition-group";

// React 19 removed findDOMNode, which react-transition-group falls back to
// when a Transition has no nodeRef — this crashed /curator
// ("findDOMNode is not a function" in performExit) because SwitchTransition
// exits the old side on every form/display toggle. Each transition instance
// owns a ref to the div it renders (same pattern as FadeTableRow in
// Table/Table.js).
const FadeTransition = ({ children, ...rest }) => {
  const nodeRef = useRef(null);

  return (
    <Transition {...rest} nodeRef={nodeRef} unmountOnExit mountOnEnter>
      {(state) => (
        <Fragment>
          <div ref={nodeRef}>{children}</div>
          <style jsx>{`
            div {
              transition: 0.035s;
              opacity: ${state === "entered" ? 1 : 0};
              display: ${state === "exited" ? "none" : "block"};
            }
          `}</style>
        </Fragment>
      )}
    </Transition>
  );
};

FadeTransition.propTypes = {
  children: PropTypes.node,
};

const SwitchFade = ({ editing, form, display }) => (
  <SwitchTransition mode="out-in">
    <FadeTransition key={editing ? "form" : "display"} timeout={35}>
      {editing ? form : display}
    </FadeTransition>
  </SwitchTransition>
);

SwitchFade.propTypes = {
  editing: PropTypes.bool.isRequired,
  form: PropTypes.object.isRequired,
  display: PropTypes.object.isRequired,
};

export default SwitchFade;
