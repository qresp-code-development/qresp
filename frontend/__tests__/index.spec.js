import { render, screen } from "@testing-library/react";

// SEO writes only into <head>; nothing visible to queries in jsdom.
jest.mock("../components/seo", () => function SEO() { return null; });

import Home from "../pages/index";
import { WORK_TYPES, WORK_TYPE_KEYS } from "../Utils/workTypes";

describe("Home page", () => {
  it("links to the explorer, curator, documentation and contact", () => {
    render(<Home />);
    expect(screen.getByRole("link", { name: /explore/i })).toHaveAttribute("href", "/explorer");
    expect(screen.getByRole("link", { name: /^curate/i })).toHaveAttribute("href", "/curator");
    expect(screen.getByRole("link", { name: /documentation/i })).toHaveAttribute("href", "/documentation");
    expect(screen.getByRole("link", { name: /contact/i })).toHaveAttribute("href", "/contact");
  });

  it("says Qresp is for more than published papers", () => {
    render(<Home />);
    expect(
      screen.getByText(/curate a published paper, a report still in progress, a code repository, a dataset/i)
    ).toBeInTheDocument();
  });

  it("offers every kind of work, each opening the curator set to it", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: /what can you make reproducible/i })).toBeInTheDocument();
    WORK_TYPE_KEYS.forEach((type) => {
      const card = screen.getByTestId(`home-curate-${type}`);
      expect(card).toHaveAttribute("href", `/curator?type=${type}`);
      expect(card).toHaveTextContent(WORK_TYPES[type].label);
    });
  });

  it("explains what Qresp does, including private sharing", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: /how qresp helps/i })).toBeInTheDocument();
    expect(screen.getByText(/keep a record private and invite collaborators/i)).toBeInTheDocument();
  });
});
