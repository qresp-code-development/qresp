import { render, screen } from "@testing-library/react";

import ArtifactActionBar from "../components/CuratorElements/ArtifactActionBar";

jest.mock("../components/CuratorElements/FolderAnalysis", () =>
  function MockFolderAnalysis({ artifactType }) {
    return <button>{`Import ${artifactType} from RCC`}</button>;
  }
);

describe("ArtifactActionBar", () => {
  it.each(["chart", "dataset", "script", "tool"])(
    "keeps manual and RCC-assisted %s entry as peer actions",
    (artifactType) => {
      render(
        <ArtifactActionBar artifactType={artifactType}>
          <button>{`Add ${artifactType}`}</button>
        </ArtifactActionBar>
      );

      const actions = screen.getByTestId(`${artifactType}-actions`);
      expect(actions).toHaveStyle("display: grid");
      expect(
        screen.getByRole("button", { name: `Add ${artifactType}` })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: `Import ${artifactType} from RCC` })
      ).toBeInTheDocument();
    }
  );
});
