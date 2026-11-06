/**
 * Explorer is a pure SSR redirect — no component UI is rendered.
 *
 * The old Explorer had a server-picker component with Autocomplete and
 * "Search all / Search selected" buttons. That UI was removed when the page
 * was changed to redirect straight to /search so a reader never has to choose
 * nodes manually. The redirect is verified in ExplorerDefaultServer.spec.js.
 */
import { render } from "@testing-library/react";
import Explorer from "../pages/explorer";

describe("Explorer component", () => {
  it("renders nothing — navigation is handled by getServerSideProps", () => {
    const { container } = render(<Explorer />);
    expect(container).toBeEmptyDOMElement();
  });
});
