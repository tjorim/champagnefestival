import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FestivalFacts from "@/components/FestivalFacts";

vi.mock("@/paraglide/messages", () => ({
  m: {
    festival_facts_label: () => "Festival at a glance",
    festival_facts_when: () => "When",
    festival_facts_where: () => "Where",
    registration_cta: () => "Register Now",
    registration_opens_on: ({ date }: { date: string }) => `Registrations open on ${date}`,
    schedule_title: () => "Schedule",
  },
}));

const baseProps = {
  dateRange: "March 6-7-8, 2027",
  venueName: "Brussels Expo",
  city: "Brussels",
  canRegister: false,
  registrationOpensOn: null,
  onRegister: () => {},
};

describe("FestivalFacts", () => {
  it("states when and where the festival takes place", () => {
    render(<FestivalFacts {...baseProps} />);

    const region = screen.getByRole("region", { name: "Festival at a glance" });
    expect(region).toHaveTextContent("WhenMarch 6-7-8, 2027");
    expect(screen.getByRole("link", { name: "Brussels Expo, Brussels" })).toHaveAttribute(
      "href",
      "#map",
    );
  });

  it("offers registration when an event is registrable", () => {
    const onRegister = vi.fn();
    render(<FestivalFacts {...baseProps} canRegister onRegister={onRegister} />);

    fireEvent.click(screen.getByRole("button", { name: "Register Now" }));
    expect(onRegister).toHaveBeenCalledOnce();
  });

  it("explains when registrations open instead of showing a disabled button", () => {
    render(<FestivalFacts {...baseProps} registrationOpensOn="1 January 2027" />);

    expect(screen.getByText("Registrations open on 1 January 2027")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("falls back to the schedule when there is nothing to register for", () => {
    render(<FestivalFacts {...baseProps} />);

    expect(screen.getByRole("link", { name: "Schedule" })).toHaveAttribute("href", "#schedule");
  });
});
