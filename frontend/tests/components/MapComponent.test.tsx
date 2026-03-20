import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import MapComponent from "@/components/MapComponent";

vi.mock("@/paraglide/messages", () => ({
  m: {
    error_loading_map: () => "Error loading map",
    location_map_label: () => "Festival location map",
    location_map_title: () => "Map of festival venue",
    location_country: () => "Belgium",
    location_open_in_maps: () => "Open in Google Maps",
  },
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="marker">{children}</div>
  ),
  Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="popup">{children}</div>,
}));

// Extend the leaflet setup mock to include Icon.Default.mergeOptions
vi.mock("leaflet", () => ({
  default: {
    Icon: {
      Default: {
        mergeOptions: vi.fn(),
      },
    },
  },
  Icon: {
    Default: {
      mergeOptions: vi.fn(),
    },
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
    expect(screen.getByTestId("marker")).toBeInTheDocument();
  });

  it("shows location name and address in popup", () => {
    render(
      <MapComponent
        address="Kapelstraat 76"
        location="Event Center"
        coordinates={validCoordinates}
      />,
    );
    const popup = screen.getByTestId("popup");
    expect(popup).toHaveTextContent("Event Center");
    expect(popup).toHaveTextContent("Kapelstraat 76");
  });

  it("shows error message for coordinates out of valid range", () => {
    render(<MapComponent address="Test" location="Test" coordinates={{ lat: 200, lng: 0 }} />);
    expect(screen.getByText("Error loading map")).toBeInTheDocument();
  });

  it("renders Google Maps link in popup", () => {
    render(
      <MapComponent
        address="Kapelstraat 76"
        location="Event Center"
        coordinates={validCoordinates}
      />,
    );
    const link = screen.getByText("Open in Google Maps");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", expect.stringContaining("google.com/maps"));
  });
});
