import { render, screen } from "@testing-library/react";

import CuratorProfileCard from "../components/Paper/CuratorProfileCard";

const curator = {
  firstName: "Robin",
  middleName: "",
  lastName: "Sharedname",
  emailId: "robin@example.edu",
  affiliation: "Dept. of Physics, Example University",
};

describe("CuratorProfileCard", () => {
  it("builds a generic card with initials when the owner has no profile", () => {
    render(<CuratorProfileCard curator={curator} profile={null} />);
    expect(screen.getByText("Robin Sharedname")).toBeInTheDocument();
    expect(screen.getByText("RS")).toBeInTheDocument();
    expect(screen.getByText(curator.affiliation)).toHaveStyle("font-style: italic");
    expect(screen.getByRole("link", { name: curator.emailId })).toHaveAttribute(
      "href",
      "mailto:robin@example.edu"
    );
  });

  it("shows the owner's bio, photo and links when a profile exists", () => {
    render(
      <CuratorProfileCard
        curator={curator}
        profile={{
          bio: "Studies gadgetite lattices.",
          orcid_id: "0000-0002-1825-0097",
          website_url: "https://www.example.edu/robin",
          google_scholar_url: "https://scholar.google.com/citations?user=abc",
          avatar_b64: "data:image/png;base64,AAAA",
        }}
      />
    );
    expect(screen.getByText("Studies gadgetite lattices.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Robin Sharedname" })).toHaveAttribute(
      "src",
      "data:image/png;base64,AAAA"
    );
    expect(screen.getByRole("link", { name: /0000-0002-1825-0097/ })).toHaveAttribute(
      "href",
      "https://orcid.org/0000-0002-1825-0097"
    );
    expect(screen.getByRole("link", { name: "example.edu" })).toHaveAttribute(
      "href",
      "https://www.example.edu/robin"
    );
    expect(screen.getByRole("link", { name: /google scholar/i })).toBeInTheDocument();
  });

  it("never links to non-http profile URLs", () => {
    render(
      <CuratorProfileCard
        curator={curator}
        profile={{ website_url: "javascript:alert(1)", avatar_b64: "javascript:x" }}
      />
    );
    expect(screen.queryByRole("link", { name: /alert/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("prefers the up-to-date profile name and affiliation over the record's copy", () => {
    render(
      <CuratorProfileCard
        curator={curator}
        profile={{ name: "Robin Q. Sharedname", affiliation: "New Institute" }}
      />
    );
    expect(screen.getByText("Robin Q. Sharedname")).toBeInTheDocument();
    expect(screen.getByText("New Institute")).toBeInTheDocument();
    expect(screen.queryByText(curator.affiliation)).not.toBeInTheDocument();
  });
});
