import { render, screen } from "@testing-library/react";

jest.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
    events: { on: jest.fn(), off: jest.fn() },
  }),
}));

// yet-another-react-lightbox ships ESM-only, which jest does not transform
// from node_modules; the lightbox is irrelevant to the defaults under test.
jest.mock("yet-another-react-lightbox", () => () => null);
jest.mock("yet-another-react-lightbox/plugins/captions", () => ({}));

import ChartInfo from "../components/Paper/Charts";
import DatasetInfo from "../components/Paper/Datasets";
import ToolsInfo from "../components/Paper/Tools";
import ScriptsInfo from "../components/Paper/Scripts";
import LoadingState from "../Context/Loading/LoadingState";
import AlertState from "../Context/Alert/AlertState";

// React 19 no longer applies function-component .defaultProps. These
// components spread their optional editColumn prop into the table columns
// (`...editColumn`), so rendering them WITHOUT the optional props — exactly
// what pages/paperdetails does — crashed SSR with "TypeError: ... is not
// iterable". The defaults now live in the function signatures; this suite
// renders each component with only its required props.
describe("paper detail components without optional props (React 19)", () => {
  it("ChartInfo renders without editColumn/inDrawer/showSlider", () => {
    render(
      <LoadingState>
        <AlertState>
          <ChartInfo
            charts={[]}
            fileserverpath=""
            downloadPath=""
            tools={[]}
            scripts={[]}
            datasets={[]}
            external={[]}
            server=""
          />
        </AlertState>
      </LoadingState>
    );
    expect(screen.getByText("Charts")).toBeInTheDocument();
  });

  it("DatasetInfo renders without editColumn/inDrawer", () => {
    render(<DatasetInfo datasets={[]} fileserverpath="" />);
    expect(screen.getByText("Datasets")).toBeInTheDocument();
  });

  it("ToolsInfo renders without editColumn/inDrawer", () => {
    render(<ToolsInfo tools={[]} />);
    expect(screen.getByText("Tools")).toBeInTheDocument();
  });

  it("ScriptsInfo renders without editColumn/inDrawer", () => {
    render(<ScriptsInfo scripts={[]} fileserverpath="" />);
    expect(screen.getByText("Scripts")).toBeInTheDocument();
  });
});
