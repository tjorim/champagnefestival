import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import MapComponent from "@/components/MapComponent";

vi.mock("@/paraglide/messages", () => ({
  m: {
    error_loading_map: () => "Error loading map",
    location_map_label: () => "Festival location map",
    location_map_title: () => "Map of festival venue",
    location_open_in_maps: () => "Open in Google Maps",
  },
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({
    children,
    "aria-describedby": ariaDescribedBy,
  }: {
    children: React.ReactNode;
    "aria-describedby"?: string;
  }) => (
    <div data-testid="map-container" aria-describedby={ariaDescribedBy}>
      {children}
    </div>
  ),
  TileLayer: ({ url }: { url: string }) => <div data-testid="tile-layer" data-url={url} />,
  Marker: ({ children, icon }: { children: React.ReactNode; icon?: unknown }) => (
    <div data-testid="marker" data-has-icon={Boolean(icon)}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="popup">{children}</div>,
}));

vi.mock("leaflet", () => ({
  default: {
    icon: vi.fn(() => ({ kind: "venue-icon" })),
  },
}));

const validCoordinates = { lat: 51.252562, lng: 2.974563 };

describe("MapComponent", () => {
  it("renders map container with valid coordinates", () => {
    render(
      <MapComponent
        address="Kapelstraat 76"
        location="Event Center"
        coordinates={validCoordinates}
      />,
    );
    expect(screen.getByTestId("map-container")).toBeInTheDocument();
  });

  it("renders tile layer and marker", () => {
    render(
      <MapComponent
        address="Kapelstraat 76"
        location="Event Center"
        coordinates={validCoordinates}
      />,
    );
    expect(screen.getByTestId("tile-layer")).toBeInTheDocument();
    expect(screen.getByTestId("marker")).toHaveAttribute("data-has-icon", "true");
  });

  it("uses the canonical OpenStreetMap tile endpoint", () => {
    render(
      <MapComponent
        address="Kapelstraat 76"
        location="Event Center"
        coordinates={validCoordinates}
      />,
    );
    expect(screen.getByTestId("tile-layer")).toHaveAttribute(
      "data-url",
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    );
  });

  it("shows location name and address in popup", () => {
    render(
      <MapComponent
        address="Kapelstraat 76"
        city="Ostend"
        country="Belgium"
        location="Event Center"
        postalCode="8400"
        coordinates={validCoordinates}
      />,
    );
    const popup = screen.getByTestId("popup");
    expect(popup).toHaveTextContent("Event Center");
    expect(popup).toHaveTextContent("Kapelstraat 76");
    expect(popup).toHaveTextContent("8400 Ostend");
    expect(popup).toHaveTextContent("Belgium");
  });

  it("shows error message for coordinates out of valid range", () => {
    render(<MapComponent address="Test" location="Test" coordinates={{ lat: 200, lng: 0 }} />);
    expect(screen.getByText("Error loading map")).toBeInTheDocument();
  });

  it("renders Google Maps link in popup", () => {
    render(
      <MapComponent
        address="Kapelstraat 76"
        city="Ostend"
        country="Belgium"
        location="Event Center"
        postalCode="8400"
        coordinates={validCoordinates}
      />,
    );
    const link = screen.getByText("Open in Google Maps");
    const href = link.closest("a")?.getAttribute("href");
    expect(href).toBeDefined();
    expect(new URL(href!).searchParams.get("query")).toBe(
      "Event Center, Kapelstraat 76, 8400, Ostend, Belgium",
    );
  });

  it("uses a unique accessible description for each map", () => {
    render(
      <>
        <MapComponent location="First venue" coordinates={validCoordinates} />
        <MapComponent location="Second venue" coordinates={validCoordinates} />
      </>,
    );

    const descriptionIds = screen
      .getAllByTestId("map-container")
      .map((container) => container.getAttribute("aria-describedby"));
    expect(descriptionIds[0]).toBeTruthy();
    expect(descriptionIds[1]).toBeTruthy();
    expect(descriptionIds[0]).not.toBe(descriptionIds[1]);
    expect(document.getElementById(descriptionIds[0]!)).toHaveTextContent("First venue");
    expect(document.getElementById(descriptionIds[1]!)).toHaveTextContent("Second venue");
  });
});
