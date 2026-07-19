import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MarqueeSlider from "@/components/MarqueeSlider";
import { CAROUSEL_SPEED_MS } from "@/config/constants";

const autoplayMock = vi.hoisted(() => ({
  pause: vi.fn(),
  resume: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("swiper/react", () => ({
  Swiper: ({
    children,
    autoplay,
    modules,
    onSwiper,
    speed,
  }: {
    children: React.ReactNode;
    autoplay?: boolean | object;
    modules?: unknown[];
    onSwiper?: (swiper: { autoplay: typeof autoplayMock }) => void;
    speed?: number;
  }) => {
    const initialized = React.useRef(false);
    if (!initialized.current) {
      initialized.current = true;
      onSwiper?.({ autoplay: autoplayMock });
    }
    return (
      <div
        data-testid="swiper"
        data-autoplay={autoplay === false ? "disabled" : "enabled"}
        data-module-count={modules?.length ?? 0}
        data-speed={speed}
      >
        <button type="button" data-testid="swiper-focus-target">
          Carousel control
        </button>
        {children}
      </div>
    );
  },
  SwiperSlide: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="swiper-slide">{children}</div>
  ),
}));

vi.mock("swiper/modules", () => ({
  A11y: {},
  Autoplay: {},
  Navigation: {},
  Pagination: {},
}));

vi.mock("swiper/css", () => ({}));
vi.mock("swiper/css/autoplay", () => ({}));
vi.mock("swiper/css/navigation", () => ({}));
vi.mock("swiper/css/pagination", () => ({}));

describe("MarqueeSlider component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the Swiper container with accessibility support", () => {
    render(<MarqueeSlider />);
    expect(screen.getByTestId("swiper")).toHaveAttribute("data-module-count", "4");
    expect(screen.getByTestId("swiper")).toHaveAttribute(
      "data-speed",
      String(CAROUSEL_SPEED_MS),
    );
  });

  it("disables autoplay when reduced motion is requested", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query === "(prefers-reduced-motion: reduce)",
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList,
    );

    render(<MarqueeSlider />);

    expect(screen.getByTestId("swiper")).toHaveAttribute("data-autoplay", "enabled");
    expect(screen.getByTestId("swiper")).toHaveAttribute("data-speed", "0");
    expect(autoplayMock.stop).toHaveBeenCalledOnce();
  });

  it("pauses autoplay while keyboard focus is inside the carousel", () => {
    render(<MarqueeSlider />);
    const target = screen.getByTestId("swiper-focus-target");

    fireEvent.focus(target);
    expect(autoplayMock.pause).toHaveBeenCalledOnce();

    fireEvent.blur(target, { relatedTarget: null });
    expect(autoplayMock.resume).toHaveBeenCalledOnce();
  });

  it("does not resume after pointer leave while keyboard focus remains inside", () => {
    render(<MarqueeSlider />);
    const target = screen.getByTestId("swiper-focus-target");
    const carousel = target.closest(".marquee-slider");
    if (!carousel) throw new Error("Expected carousel wrapper");

    fireEvent.mouseEnter(carousel);
    fireEvent.focus(target);
    autoplayMock.resume.mockClear();
    fireEvent.mouseLeave(carousel);

    expect(autoplayMock.resume).not.toHaveBeenCalled();

    fireEvent.blur(target, { relatedTarget: null });
    expect(autoplayMock.resume).toHaveBeenCalledOnce();
  });

  it("does not resume after blur while the pointer remains inside", () => {
    render(<MarqueeSlider />);
    const target = screen.getByTestId("swiper-focus-target");
    const carousel = target.closest(".marquee-slider");
    if (!carousel) throw new Error("Expected carousel wrapper");

    fireEvent.mouseEnter(carousel);
    fireEvent.focus(target);
    autoplayMock.resume.mockClear();
    fireEvent.blur(target, { relatedTarget: null });

    expect(autoplayMock.resume).not.toHaveBeenCalled();

    fireEvent.mouseLeave(carousel);
    expect(autoplayMock.resume).toHaveBeenCalledOnce();
  });

  it("stops autoplay when reduced motion is enabled after mount", () => {
    let matches = false;
    let changeListener: ((event: MediaQueryListEvent) => void) | undefined;
    vi.spyOn(window, "matchMedia").mockImplementation(
      () =>
        ({
          get matches() {
            return matches;
          },
          media: "(prefers-reduced-motion: reduce)",
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn((_type, listener: (event: MediaQueryListEvent) => void) => {
            changeListener = listener;
          }),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    );

    render(<MarqueeSlider />);
    expect(screen.getByTestId("swiper")).toHaveAttribute(
      "data-speed",
      String(CAROUSEL_SPEED_MS),
    );

    act(() => {
      matches = true;
      changeListener?.({ matches: true } as MediaQueryListEvent);
    });

    expect(autoplayMock.stop).toHaveBeenCalledOnce();
    expect(screen.getByTestId("swiper")).toHaveAttribute("data-autoplay", "enabled");
    expect(screen.getByTestId("swiper")).toHaveAttribute("data-speed", "0");
  });

  it("restarts configured autoplay when reduced motion is disabled", () => {
    let matches = true;
    let changeListener: ((event: MediaQueryListEvent) => void) | undefined;
    vi.spyOn(window, "matchMedia").mockImplementation(
      () =>
        ({
          get matches() {
            return matches;
          },
          media: "(prefers-reduced-motion: reduce)",
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn((_type, listener: (event: MediaQueryListEvent) => void) => {
            changeListener = listener;
          }),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    );

    render(<MarqueeSlider />);
    expect(screen.getByTestId("swiper")).toHaveAttribute("data-speed", "0");

    autoplayMock.start.mockClear();
    act(() => {
      matches = false;
      changeListener?.({ matches: false } as MediaQueryListEvent);
    });

    expect(autoplayMock.start).toHaveBeenCalledOnce();
    expect(screen.getByTestId("swiper")).toHaveAttribute(
      "data-speed",
      String(CAROUSEL_SPEED_MS),
    );
  });

  it("renders default items when no items prop provided", () => {
    render(<MarqueeSlider />);
    // Default items include "Champagne Tasting" - duplicated by the slider for fill
    expect(screen.getAllByText("Champagne Tasting")).not.toHaveLength(0);
  });

  it("renders provided items", () => {
    const items = [
      { id: 1, name: "Maison A", image: "/images/a.jpg" },
      { id: 2, name: "Maison B", image: "/images/b.jpg" },
    ];
    render(<MarqueeSlider items={items} />);
    expect(screen.getAllByText("Maison A")).not.toHaveLength(0);
    expect(screen.getAllByText("Maison B")).not.toHaveLength(0);
  });

  it("duplicates items to fill minimum slide count", () => {
    const items = [{ id: 1, name: "Single Item", image: "/images/a.jpg" }];
    render(<MarqueeSlider items={items} />);
    // Item is duplicated to have at least 8 slides
    const slides = screen.getAllByTestId("swiper-slide");
    expect(slides.length).toBe(8);
  });

  it("renders images with alt text", () => {
    const items = [{ id: 1, name: "Maison A", image: "/images/a.jpg" }];
    render(<MarqueeSlider items={items} />);
    const images = screen.getAllByAltText("Maison A");
    expect(images.length).toBeGreaterThan(0);
  });
});
