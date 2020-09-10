import React from "react";
import { mount } from "enzyme";

import AlertDialog from "../components/alert";
import AlertState from "../Context/Alert/AlertState";

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
});
