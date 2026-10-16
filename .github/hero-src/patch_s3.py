"""Rewrite the old Kaiwu domain baked into the s3.png phone screenshot (pixel-exact re-typeset)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
FONTS = HERE.parents[1] / "apps" / "ui" / "sources" / "assets" / "fonts"
OLD, NEW = "kaiwu.chengqiyun.com", "kaiwu.wujilabs.cn"

src = Image.open(HERE / "s3.png").convert("RGB")
im = src.copy()
px = src.load()
d = ImageDraw.Draw(im)


def ink_cols(x0, x1, y0, y1, bg):
    return [x for x in range(x0, x1) if any(sum(abs(a - b) for a, b in zip(px[x, y], bg)) > 60 for y in range(y0, y1))]


def baseline(x0, x1, y0, y1, bg):
    rows = [y for y in range(y0, y1) if any(sum(abs(a - b) for a, b in zip(px[x, y], bg)) > 60 for x in range(x0, x1))]
    return rows[-1] + 1


def brightest(x0, x1, y0, y1):
    return max((px[x, y] for x in range(x0, x1) for y in range(y0, y1)), key=sum)


def fit(path, width):
    best = None
    for s10 in range(200, 600):
        f = ImageFont.truetype(str(path), s10 / 10)
        l, _, r, _ = f.getbbox(OLD, anchor="ls")
        e = abs((r - l) - width)
        if best is None or e < best[0]:
            best = (e, f, l)
    return best[1], best[2]


def proportional(x0, x1, y0, y1, dom_end, suffix_end, gap_after=None, center=None, prefix=None):
    """Replace OLD (ink from x0..dom_end) by NEW, keep suffix pixels (dom_end..suffix_end)."""
    bg = px[x0 - 20, y0]
    cols = ink_cols(x0, dom_end + 1, y0, y1, bg)
    ox0, ox1 = cols[0], cols[-1] + 1
    base = baseline(ox0, ox0 + 60, y0, y1, bg)  # "kaiwu" has no descenders
    color = brightest(ox0, ox1, base - 12, base)
    f, lb = fit(FONTS / "Inter-Regular.ttf", ox1 - ox0)
    l, _, r, _ = f.getbbox(NEW, anchor="ls")
    nw = r - l
    suffix = src.crop((ox1, y0, suffix_end, y1))
    pre = src.crop((prefix[0], y0, prefix[1], y1)) if prefix else None
    lo = prefix[0] if prefix else ox0
    d.rectangle((lo, y0, suffix_end, y1 - 1), fill=bg)
    if center is not None:
        pw = (ox0 - prefix[0]) if prefix else 0
        total = pw + nw + suffix.width
        start = round(center - total / 2)
        if pre:
            im.paste(pre, (start, y0))
        nx = start + pw
    else:
        nx = ox0
    im.paste(suffix, (nx + nw, y0))
    d.text((nx - l, base), NEW, font=f, fill=color, anchor="ls")


def mono(y0, y1, x_text, n_chars_line, line_end):
    """Code block line 'https://<OLD>/…' in IBM Plex Mono: retypeset domain, shift suffix left."""
    bg = px[x_text - 20, (y0 + y1) // 2]
    adv = (line_end - x_text) / (n_chars_line - 0.15)
    f = ImageFont.truetype(str(FONTS / "IBMPlexMono-Regular.ttf"), adv / 0.6)
    dx0 = x_text - f.getbbox("h", anchor="ls")[0] + 8 * adv  # cell origin, not ink start
    dx1 = x_text + 28 * adv
    base = baseline(int(dx0), int(dx0 + 5 * adv), y0, y1, bg)
    color = brightest(int(dx0), int(dx1), base - 12, base)
    suffix = src.crop((round(dx1), y0, 990, y1))  # stop before the copy icon
    d.rectangle((round(dx0) - 1, y0, 990, y1 - 1), fill=bg)
    im.paste(suffix, (round(dx1 - (len(OLD) - len(NEW)) * adv), y0))
    for i, ch in enumerate(NEW):  # per glyph: PIL rounds mono advance to whole px (22 vs 21.6)
        d.text((dx0 + i * adv, base), ch, font=f, fill=color, anchor="ls")


# 1) header subtitle: "● kaiwu.chengqiyun.com ⌄" centered at x=585
proportional(391, 780, 95, 140, 779, 812, center=585, prefix=(352, 391))
# 2) description: "kaiwu.chengqiyun.com。仅在偏好终端方式时打开手动"
proportional(63, 1110, 612, 668, 516, 1110)
# 3) Windows install: https://kaiwu.chengqiyun.com/install.ps1  (40 chars, ink 102..961)
mono(1000, 1050, 102, 40, 962)
# 4) macOS/Linux: https://kaiwu.chengqiyun.com/install |  (same grid)
mono(1435, 1485, 102, 40, 962)

im.save(HERE / "s3-fixed.png")
print("ok")
