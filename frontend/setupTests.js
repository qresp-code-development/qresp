// React Testing Library matchers (replaces the Enzyme adapter setup).
import "@testing-library/jest-dom";

// "Close every section after a load" is a module-level mode; a test that
// loads a draft must not leave the next test's sections closed.
import { resetSectionCollapse } from "./Utils/sectionCollapse";
afterEach(() => resetSectionCollapse());
