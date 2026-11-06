import { render, screen } from "@testing-library/react";

import LicenseInfo from "../components/Paper/License";

describe("LicenseInfo", () => {
  it("renders known licenses with their canonical link and icons", () => {
    const { container } = render(<LicenseInfo type="cc_by" defaultOpen />);

    expect(
      screen.getByRole("link", {
        name: /creative commons attribution 4.0 international license/i,
      })
    ).toHaveAttribute("href", "https://creativecommons.org/licenses/by/4.0/");
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  it("renders unknown legacy license values without crashing", () => {
    const { container } = render(<LicenseInfo type="cc" defaultOpen />);

    expect(screen.getByText(/licensed under a/i)).toHaveTextContent(
      "licensed under a cc"
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("renders nothing when there is no license", () => {
    const { container } = render(<LicenseInfo type="" defaultOpen />);

    expect(container).toBeEmptyDOMElement();
  });
});

