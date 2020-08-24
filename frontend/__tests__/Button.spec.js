import React from "react";
import { shallow } from "enzyme";

import StyledButton, {
  InternalStyledButton,
  ExternalStyledButton,
} from "../components/button";

import Link from "next/link";

describe("Button Tests", () => {
  describe("StyledButton", () => {
    const tree = shallow(<StyledButton>Click</StyledButton>);
    it("should have correct text", () => {
      expect(tree.text()).toEqual("Click");
    });
  });

  describe("Internal Styled Button", () => {
    const tree = shallow(
      <InternalStyledButton
        text="Click"
        url="http://click.com"
      ></InternalStyledButton>
    );
    it("should have href prop", () => {
      expect(tree.find(Link).prop("href")).toEqual("http://click.com");
    });
    it("should have one Styled Button", () => {
      expect(tree.children()).toHaveLength(1);
    });
    it("the styled button should have the text passed as text", () => {
      expect(tree.find(StyledButton).text()).toEqual("Click");
    });
  });

  describe("External Styled Button", () => {
    const tree = shallow(
      <ExternalStyledButton
        text="Click"
        url="http://click.com"
      ></ExternalStyledButton>
    );
    it("should have href prop", () => {
      expect(tree.find(StyledButton).prop("href")).toEqual("http://click.com");
    });
    it("the styled button should have the text passed as text", () => {
      expect(tree.find(StyledButton).text()).toEqual("Click");
    });
  });
});
