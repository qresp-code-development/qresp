import React from "react";
import { mount } from "enzyme";

import AlertDialog from "../components/alert";
import AlertState from "../Context/Alert/AlertState";

import {
  Dialog,
  DialogActions,
  DialogContentText,
  DialogTitle,
} from "@material-ui/core";

import { SmallStyledButton } from "../components/button";

describe("Alert Tests", () => {
  const context = {
    open: true,
    title: "Title",
    msg: "Message",
    buttons: null,
    unsetAlert: jest.fn(),
  };

  const tree = mount(
    <AlertState value={context}>
      <AlertDialog />
    </AlertState>
  );

  it("should render", () => {
    expect(tree.find(AlertDialog).exists()).toBe(true);
  });

  it("should have correct title", () => {
    expect(tree.find("h6").dive().text()).toBe("Title");
  });

  it("should have correct message", () => {
    expect(tree.find(DialogContentText).dive().text()).toBe("Message");
  });

  it("should call unsetAlert on close", () => {
    tree.find(SmallStyledButton).dive().simulate("click");
    expect(context.unsetAlert).toHaveBeenCalled();
  });
});
