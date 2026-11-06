import { render, screen } from "@testing-library/react";

import StyledButton, {
  InternalStyledButton,
  ExternalStyledButton,
} from "../components/button";

describe("Button Tests", () => {
  describe("StyledButton", () => {
    it("renders a button with the given text", () => {
      render(<StyledButton>Click</StyledButton>);
      expect(
        screen.getByRole("button", { name: "Click" })
      ).toBeInTheDocument();
    });
  });

  describe("Internal Styled Button", () => {
    it("renders a link with the given href and text", () => {
      render(<InternalStyledButton text="Click" url="/explorer" />);
      const link = screen.getByRole("link", { name: "Click" });
      expect(link).toHaveAttribute("href", "/explorer");
    });
  });

  describe("External Styled Button", () => {
    it("renders an external link with the given href and text", () => {
      render(<ExternalStyledButton text="Click" url="http://click.com" />);
      const link = screen.getByRole("link", { name: "Click" });
      expect(link).toHaveAttribute("href", "http://click.com");
      expect(link).toHaveAttribute("target", "_blank");
    });
  });
});
