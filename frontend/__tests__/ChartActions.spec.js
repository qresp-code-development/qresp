import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next/router", () => ({
  useRouter: () => ({ pathname: "/documentation/tutorial/exploration", query: {}, asPath: "/" }),
}));

import ChartActions, { CHART_ACTIONS } from "../components/Paper/ChartActions";
import Exploration from "../pages/documentation/tutorial/exploration";

describe("figure action buttons", () => {
  it("shows a labelled button for each available action", () => {
    render(
      <ChartActions
        filesHref="https://files.example.org/paper"
        onWorkflow={() => {}}
        downloadHref="https://globus.example.org/x"
        notebookHref="https://nbviewer.org/x.ipynb"
      />
    );
    ["Files", "Workflow", "Download", "Notebook"].forEach((label) =>
      expect(screen.getByRole("link", { name: new RegExp(`^${label}:`) })).toBeInTheDocument()
    );
    expect(screen.getByTestId("chart-action-files")).toHaveAttribute(
      "href",
      "https://files.example.org/paper"
    );
    expect(screen.getByTestId("chart-action-notebook")).toHaveAttribute("target", "_blank");
  });

  it("leaves out actions the curator did not provide", () => {
    render(<ChartActions filesHref="https://files.example.org/paper" />);
    expect(screen.getByTestId("chart-action-files")).toBeInTheDocument();
    expect(screen.queryByTestId("chart-action-workflow")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chart-action-download")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chart-action-notebook")).not.toBeInTheDocument();
  });

  it("explains each action on hover", async () => {
    const user = userEvent.setup();
    render(<ChartActions filesHref="https://f" downloadHref="https://d" />);
    await user.hover(screen.getByTestId("chart-action-download"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      CHART_ACTIONS.download.tooltip
    );
  });

  it("opens the chart workflow in place", async () => {
    const onWorkflow = jest.fn((e) => e.preventDefault());
    const user = userEvent.setup();
    render(<ChartActions onWorkflow={onWorkflow} />);
    await user.click(screen.getByTestId("chart-action-workflow"));
    expect(onWorkflow).toHaveBeenCalled();
  });
});

describe("Paper Exploration documentation", () => {
  it("describes the same four actions the record page shows", () => {
    const { container } = render(<Exploration />);
    const lists = [...container.querySelectorAll("dl")];
    const actions = lists.find((dl) => within(dl).queryByText("Workflow"));
    Object.values(CHART_ACTIONS).forEach(({ label, description }) => {
      expect(within(actions).getByText(label)).toBeInTheDocument();
      expect(within(actions).getByText(description)).toBeInTheDocument();
    });
  });
});
