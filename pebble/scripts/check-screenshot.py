"""Assert that an emulator screenshot contains the expected app background and text."""

import argparse
import struct
import sys
import zlib
from collections import Counter
from pathlib import Path


def read_png_rgba(path):
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} is not a PNG")
    width = height = None
    compressed = bytearray()
    position = 8
    while position < len(data):
        (length,) = struct.unpack(">I", data[position : position + 4])
        kind = data[position + 4 : position + 8]
        payload = data[position + 8 : position + 8 + length]
        position += 12 + length
        if kind == b"IHDR":
            width, height, depth, color = struct.unpack(">IIBB", payload[:10])
            if (depth, color) != (8, 6):
                raise ValueError(f"expected 8-bit RGBA, got depth {depth} color type {color}")
        elif kind == b"IDAT":
            compressed += payload
        elif kind == b"IEND":
            break
    if width is None:
        raise ValueError(f"{path} has no IHDR")

    raw = zlib.decompress(bytes(compressed))
    stride = width * 4
    previous = bytearray(stride)
    pixels = []
    position = 0
    for _ in range(height):
        filter_type = raw[position]
        line = bytearray(raw[position + 1 : position + 1 + stride])
        position += 1 + stride
        for index in range(stride):
            left = line[index - 4] if index >= 4 else 0
            up = previous[index]
            up_left = previous[index - 4] if index >= 4 else 0
            if filter_type == 0:
                value = line[index]
            elif filter_type == 1:
                value = line[index] + left
            elif filter_type == 2:
                value = line[index] + up
            elif filter_type == 3:
                value = line[index] + (left + up) // 2
            elif filter_type == 4:
                estimate = left + up - up_left
                distances = (
                    abs(estimate - left),
                    abs(estimate - up),
                    abs(estimate - up_left),
                )
                value = line[index] + (left, up, up_left)[distances.index(min(distances))]
            else:
                raise ValueError(f"unsupported PNG filter {filter_type}")
            line[index] = value & 0xFF
        pixels.extend((line[i], line[i + 1], line[i + 2]) for i in range(0, stride, 4))
        previous = line
    return pixels


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("screenshot", type=Path)
    parser.add_argument("--background", choices=("dark", "light"), required=True)
    parser.add_argument("--min-ink", type=float, default=0.5)
    args = parser.parse_args()

    pixels = read_png_rgba(args.screenshot)
    counts = Counter(pixels)
    background, count = counts.most_common(1)[0]
    level = sum(background) / 3
    ink = 100.0 * (len(pixels) - count) / len(pixels)
    expected = level <= 120 if args.background == "dark" else level >= 180
    print(f"{args.screenshot}: background rgb{background}, ink {ink:.2f}%")
    if not expected:
        print(f"FAIL: dominant color is not the expected {args.background} app background", file=sys.stderr)
        return 1
    if ink < args.min_ink:
        print(f"FAIL: only {ink:.2f}% non-background pixels; the app did not draw text", file=sys.stderr)
        return 1
    print("OK: the watchapp rendered.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
