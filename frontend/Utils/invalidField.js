import { useCallback, useRef } from "react";

// Send the curator to the field they actually have to fix.
//
// Pressing Save with a required field empty used to do nothing visible: the
// form refused to submit and left the curator to hunt for the offender, which
// on a long dialog is usually scrolled off the top.
//
// react-hook-form hands back an errors OBJECT whose key order belongs to the
// resolver, not to the form. The order that matters is the one on screen, so
// the target is chosen by DOM position — which is also why it stays the same
// when a two-column layout collapses to one column, and why no form has to
// hardcode its own field names or pixel positions here.

const escapeName = (value) =>
  typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value;

// Every control react-hook-form registered under this name. A radio group has
// one per option; an array field registers `name.0.label`, so a prefix match
// is the fallback.
const controlsNamed = (form, name) => {
  const exact = Array.from(
    form.querySelectorAll(`[name="${escapeName(name)}"]`)
  );
  if (exact.length) return exact;
  return Array.from(
    form.querySelectorAll(`[name^="${escapeName(name)}."]`)
  );
};

// Something a curator can actually type into. MUI renders a select as a
// hidden native input beside a focusable trigger, and a disabled or read-only
// input cannot take a caret, so neither is the thing to focus.
const isTypeable = (element) => {
  if (!element) return false;
  const tag = element.tagName;
  if (tag !== "INPUT" && tag !== "TEXTAREA") return false;
  if (element.type === "hidden" || element.disabled || element.readOnly) {
    return false;
  }
  if (element.getAttribute("aria-hidden") === "true") return false;
  return !element.classList.contains("MuiSelect-nativeInput");
};

// The control to put the caret on for one invalid field.
export const controlFor = (form, name) => {
  if (!form || !name) return null;
  const named = controlsNamed(form, name);
  if (!named.length) return null;

  // A radio group: the chosen option, or the first one to arrow from.
  const radios = named.filter((element) => element.type === "radio");
  if (radios.length) {
    return radios.find((element) => element.checked) || radios[0];
  }

  const control = named[0];
  if (isTypeable(control)) return control;

  // A select's trigger, or the button a file-picker field is driven by.
  const group =
    control.closest(".MuiFormControl-root, .MuiInputBase-root") ||
    control.parentElement ||
    form;
  return (
    group.querySelector('[role="combobox"], .MuiSelect-select, button') ||
    control
  );
};

// The invalid control that comes FIRST in the form, whatever order the
// resolver reported the errors in.
export const firstInvalidControl = (form, errors) => {
  if (!form || !errors) return null;
  const controls = Object.keys(errors)
    .map((name) => controlFor(form, name))
    .filter(Boolean);
  if (!controls.length) return null;
  return controls.reduce((first, element) =>
    first === element ||
    !(
      first.compareDocumentPosition(element) &
      Node.DOCUMENT_POSITION_PRECEDING
    )
      ? first
      : element
  );
};

const prefersReducedMotion = () => {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (err) {
    return false;
  }
};

// Bring one control into view and put the caret in it. The scroll animation
// is dropped for anyone who asked for less motion; `preventScroll` keeps the
// focus call from fighting the smooth scroll it was just given.
export const revealControl = (element) => {
  if (!element) return null;
  if (typeof element.scrollIntoView === "function") {
    element.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "center",
    });
  }
  if (typeof element.focus === "function") {
    element.focus({ preventScroll: true });
  }
  return element;
};

// What a form wires into react-hook-form's invalid handler:
//
//   const { formRef, focusFirstInvalid } = useInvalidFieldFocus();
//   <form ref={formRef} onSubmit={handleSubmit(onSubmit, focusFirstInvalid)}>
//
// The valid path is untouched, so a complete form saves exactly as before and
// nothing scrolls.
export const useInvalidFieldFocus = () => {
  const formRef = useRef(null);
  const focusFirstInvalid = useCallback(
    (errors) => revealControl(firstInvalidControl(formRef.current, errors)),
    []
  );
  return { formRef, focusFirstInvalid };
};

export default useInvalidFieldFocus;
