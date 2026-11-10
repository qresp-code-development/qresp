import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";

import ExtraFieldInput, {
  cleanExtraFields,
} from "../components/Form/ExtraFieldInput";

const Harness = ({ defaults }) => {
  const {
    register,
    control,
    formState: { errors },
  } = useForm();
  return (
    <ExtraFieldInput
      control={control}
      register={register}
      errors={errors.extraFields}
      defaults={defaults}
    />
  );
};

const labelInputs = () =>
  screen.queryAllByPlaceholderText("Enter custom label");

// Stored records routinely carry a legacy placeholder row
// [{extrakey: "", extravalue: ""}]; editing an item must not render a
// phantom empty row for it (and must still show real saved fields).
describe("ExtraFieldInput seeding", () => {
  it("renders no rows for legacy placeholder extra fields", () => {
    render(<Harness defaults={[{ extrakey: "", extravalue: "" }]} />);
    expect(screen.getByText("Extra Fields")).toBeInTheDocument();
    expect(labelInputs()).toHaveLength(0);
  });

  it("renders no rows for empty/missing defaults", () => {
    const { unmount } = render(<Harness defaults={[]} />);
    expect(labelInputs()).toHaveLength(0);
    unmount();
    render(<Harness defaults={undefined} />);
    expect(labelInputs()).toHaveLength(0);
    expect(
      screen.queryAllByPlaceholderText("Enter value")
    ).toHaveLength(0);
  });

  it("still renders real saved extra fields with their values", () => {
    render(
      <Harness
        defaults={[
          { label: "Funding", value: "DOE" },
          { extrakey: "", extravalue: "" }, // legacy junk mixed in
        ]}
      />
    );
    expect(labelInputs()).toHaveLength(1);
    expect(screen.getByPlaceholderText("Enter custom label")).toHaveValue(
      "Funding"
    );
    expect(screen.getByPlaceholderText("Enter value")).toHaveValue("DOE");
  });

  it("adds a fresh row only when the user clicks the plus button", async () => {
    const user = userEvent.setup();
    render(<Harness defaults={[]} />);
    expect(labelInputs()).toHaveLength(0);
    await user.click(screen.getByRole("button"));
    expect(labelInputs()).toHaveLength(1);
    expect(screen.getByPlaceholderText("Enter custom label")).toHaveValue("");
  });
});

describe("cleanExtraFields", () => {
  it("drops legacy and empty rows, keeps real and half-filled ones", () => {
    expect(
      cleanExtraFields([
        { extrakey: "", extravalue: "" },
        { label: "", value: "" },
        { label: "  ", value: "" },
        null,
        { label: "Funding", value: "DOE" },
        { label: "OnlyLabel", value: "" },
      ])
    ).toEqual([
      { label: "Funding", value: "DOE" },
      { label: "OnlyLabel", value: "" },
    ]);
    expect(cleanExtraFields(undefined)).toEqual([]);
  });
});
