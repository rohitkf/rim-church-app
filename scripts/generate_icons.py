#!/usr/bin/env python3
"""Draw the RIM app icons.

The project has no image tooling in its toolchain and an icon is not the
sort of thing that should arrive as an opaque binary nobody can regenerate,
so the mark is defined here as geometry — a rounded tile with the RIM
monogram — and rasterised with 4x supersampling into the PNGs a PWA
manifest needs. Re-run this after changing the brand colour or the mark:

    python3 scripts/generate_icons.py
"""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "frontend" / "public"

# The brand purple the app uses for `--color-primary` in dark mode. An icon
# sits on the user's home screen against wallpaper we don't control, so it
# keeps one identity rather than following the in-app light/dark swap.
BRAND = (124, 58, 237)
INK = (255, 255, 255)


def _clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


def _dist_to_segment(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    length2 = dx * dx + dy * dy
    t = 0.0 if length2 == 0 else _clamp(((px - x1) * dx + (py - y1) * dy) / length2, 0.0, 1.0)
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


class Shape:
    """A predicate over the unit square, so the mark scales to any size."""

    def contains(self, x, y):  # pragma: no cover - overridden
        raise NotImplementedError


class RoundedRect(Shape):
    def __init__(self, x, y, w, h, r):
        self.x, self.y, self.w, self.h, self.r = x, y, w, h, r

    def contains(self, px, py):
        # Distance to the rectangle shrunk by the corner radius.
        cx = _clamp(px, self.x + self.r, self.x + self.w - self.r)
        cy = _clamp(py, self.y + self.r, self.y + self.h - self.r)
        return math.hypot(px - cx, py - cy) <= self.r + 1e-9


class Stroke(Shape):
    """A line segment with a thickness — every straight part of a letter."""

    def __init__(self, x1, y1, x2, y2, weight):
        self.x1, self.y1, self.x2, self.y2, self.weight = x1, y1, x2, y2, weight

    def contains(self, px, py):
        return _dist_to_segment(px, py, self.x1, self.y1, self.x2, self.y2) <= self.weight / 2


class Arc(Shape):
    """A thick elliptical arc — the bowl of the R, which is wider than tall."""

    def __init__(self, cx, cy, rx, ry, weight, start_deg, end_deg):
        self.cx, self.cy, self.rx, self.ry, self.weight = cx, cy, rx, ry, weight
        self.start, self.end = math.radians(start_deg), math.radians(end_deg)

    def contains(self, px, py):
        u, v = (px - self.cx) / self.rx, (py - self.cy) / self.ry
        f = math.hypot(u, v)
        if f == 0:
            return False
        # First-order distance from the point to the ellipse: the implicit
        # value divided by the length of its gradient. Exact enough for a
        # stroke this thin, and far cheaper than solving the quartic.
        gradient = math.hypot(u / self.rx, v / self.ry)
        if gradient == 0 or abs((f - 1) / gradient) > self.weight / 2:
            return False
        angle = math.atan2(py - self.cy, px - self.cx) % (2 * math.pi)
        start, end = self.start % (2 * math.pi), self.end % (2 * math.pi)
        return start <= angle <= end if start <= end else angle >= start or angle <= end


def monogram(width, left, top):
    """R I M drawn from strokes and one arc, sized to `width`.

    Proportions are in cap heights, the way a type designer would set them,
    so the mark keeps its rhythm at 180px and at 512px alike.
    """
    # Advances, in cap heights: R, gap, I, gap, M.
    r_w, gap, i_w, m_w = 0.62, 0.20, 0.17, 0.80
    height = width / (r_w + gap + i_w + gap + m_w)
    h = height
    weight = 0.17 * h
    half = weight / 2
    y0, y1 = top, top + h

    shapes = []

    # R: stem, bowl, leg.
    r_x = left + half
    shapes.append(Stroke(r_x, y0 + half, r_x, y1 - half, weight))
    bowl_bottom = y0 + 0.52 * h
    shapes.append(
        Arc(
            r_x,
            (y0 + bowl_bottom) / 2,
            r_w * h - weight,
            (bowl_bottom - y0) / 2 - half,
            weight,
            -90,
            90,
        )
    )
    shapes.append(Stroke(r_x + half, bowl_bottom - half, left + r_w * h - half, y1 - half, weight))

    # I: one stem.
    i_x = left + (r_w + gap) * h + half
    shapes.append(Stroke(i_x, y0 + half, i_x, y1 - half, weight))

    # M: two stems and the V between them.
    m_left = left + (r_w + gap + i_w + gap) * h + half
    m_right = m_left + m_w * h - weight
    apex_x = (m_left + m_right) / 2
    shapes.append(Stroke(m_left, y0 + half, m_left, y1 - half, weight))
    shapes.append(Stroke(m_right, y0 + half, m_right, y1 - half, weight))
    shapes.append(Stroke(m_left, y0 + half, apex_x, y0 + 0.66 * h, weight))
    shapes.append(Stroke(m_right, y0 + half, apex_x, y0 + 0.66 * h, weight))

    return shapes, height


def render(size, mark_scale=0.62, full_bleed=False):
    """Rasterise one icon at `size` px, supersampled 4x for clean edges."""
    ss = 4
    # A maskable icon is cropped to whatever shape the launcher wants, so
    # its colour has to run to every edge; everywhere else the rounded tile
    # is the icon, matching the logo mark inside the app.
    tile = RoundedRect(0, 0, 1, 1, 0.0 if full_bleed else 0.225)
    letters, mark_h = monogram(mark_scale, (1 - mark_scale) / 2, 0.5)
    # Centre the mark now that its height is known.
    letters, _ = monogram(mark_scale, (1 - mark_scale) / 2, (1 - mark_h) / 2)

    rows = []
    step = 1.0 / (size * ss)
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = a = 0
            for sy in range(ss):
                for sx_ in range(ss):
                    x = (px * ss + sx_ + 0.5) * step
                    y = (py * ss + sy + 0.5) * step
                    inside_tile = tile.contains(x, y)
                    if not inside_tile:
                        continue
                    on_ink = inside_tile and any(s.contains(x, y) for s in letters)
                    colour = INK if on_ink else BRAND
                    r += colour[0]
                    g += colour[1]
                    b += colour[2]
                    a += 255
            n = ss * ss
            if a == 0:
                row += bytes((0, 0, 0, 0))
            else:
                # Un-premultiply so edge pixels keep their colour.
                covered = a // 255
                row += bytes((r // covered, g // covered, b // covered, a // n))
        rows.append(bytes(row))
    return _png(size, size, rows)


def _png(width, height, rows):
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    targets = [
        # Regular icons: the tile is the icon, edge to edge.
        ("icon-192.png", render(192)),
        ("icon-512.png", render(512)),
        # Maskable: Android crops to its own shape, so the mark sits inside
        # the 80% safe zone and the brand colour bleeds to every edge.
        ("icon-maskable-512.png", render(512, mark_scale=0.46, full_bleed=True)),
        # iOS draws its own rounded mask and wants no transparency.
        ("apple-touch-icon.png", render(180, mark_scale=0.58, full_bleed=True)),
    ]
    for name, data in targets:
        (OUT / name).write_bytes(data)
        print(f"{name}: {len(data):,} bytes")


if __name__ == "__main__":
    main()
