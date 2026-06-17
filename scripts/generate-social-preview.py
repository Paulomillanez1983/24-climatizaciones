from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "social-preview.png"
W, H = 1200, 630


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    paths = {
        "regular": r"C:\Windows\Fonts\segoeui.ttf",
        "bold": r"C:\Windows\Fonts\segoeuib.ttf",
        "black": r"C:\Windows\Fonts\arialbd.ttf",
    }
    return ImageFont.truetype(paths[name], size)


def rounded(draw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def add_shadow(base, xy, radius, blur=22, opacity=90):
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(shadow)
    d.rounded_rectangle(xy, radius=radius, fill=(2, 8, 18, opacity))
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(shadow)


def text(draw, xy, value, font_obj, fill, **kwargs):
    draw.text(xy, value, font=font_obj, fill=fill, **kwargs)


def gradient_background() -> Image.Image:
    img = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    px = img.load()
    c1 = (232, 248, 255)
    c2 = (255, 255, 255)
    c3 = (255, 238, 221)
    for y in range(H):
        for x in range(W):
            t = (x * 0.75 + y * 0.45) / (W * 0.75 + H * 0.45)
            if t < 0.52:
                k = t / 0.52
                c = tuple(int(c1[i] * (1 - k) + c2[i] * k) for i in range(3))
            else:
                k = (t - 0.52) / 0.48
                c = tuple(int(c2[i] * (1 - k) + c3[i] * k) for i in range(3))
            px[x, y] = (*c, 255)
    return img


def radial(base, center, radius, color, alpha):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = layer.load()
    cx, cy = center
    for y in range(max(0, cy - radius), min(H, cy + radius)):
        for x in range(max(0, cx - radius), min(W, cx + radius)):
            dist = math.hypot(x - cx, y - cy)
            if dist <= radius:
                k = 1 - dist / radius
                px[x, y] = (*color, int(alpha * (k**1.7)))
    base.alpha_composite(layer)


def draw_logo(base):
    d = ImageDraw.Draw(base)
    add_shadow(base, (78, 98, 398, 418), 82, blur=24, opacity=70)
    logo = Image.new("RGBA", (320, 320), (0, 0, 0, 0))
    ld = ImageDraw.Draw(logo)
    for y in range(320):
        for x in range(320):
            t = (x + y * 0.72) / 550
            if t < 0.45:
                c = (
                    int(27 * (1 - t / 0.45) + 12 * (t / 0.45)),
                    int(199 * (1 - t / 0.45) + 104 * (t / 0.45)),
                    255,
                    255,
                )
            elif t < 0.72:
                k = (t - 0.45) / 0.27
                c = (int(12 * (1 - k) + 8 * k), int(104 * (1 - k) + 19 * k), int(255 * (1 - k) + 48 * k), 255)
            else:
                k = (t - 0.72) / 0.28
                c = (int(8 * (1 - k) + 248 * k), int(19 * (1 - k) + 116 * k), int(48 * (1 - k) + 26 * k), 255)
            logo.putpixel((x, y), c)
    mask = Image.new("L", (320, 320), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, 320, 320), radius=82, fill=255)
    logo.putalpha(mask)
    base.alpha_composite(logo, (78, 98))
    d.rounded_rectangle((104, 124, 372, 392), radius=70, outline=(255, 255, 255, 58), width=7)

    # house
    house = [(238, 160), (326, 242), (302, 242), (302, 348), (174, 348), (174, 242), (150, 242)]
    d.polygon(house, fill=(245, 253, 255, 255))
    d.line([(238, 160), (326, 242), (302, 242), (302, 348), (174, 348), (174, 242), (150, 242), (238, 160)], fill=(255, 255, 255, 245), width=7, joint="curve")
    text(d, (174, 229), "24", font("black", 78), (7, 18, 38), anchor=None)
    text(d, (278, 214), "°", font("bold", 34), (7, 18, 38))
    d.rounded_rectangle((204, 316, 271, 323), radius=4, fill=(24, 117, 255))
    d.rounded_rectangle((204, 335, 271, 342), radius=4, fill=(255, 130, 37))

    # snowflake
    cx, cy = 154, 174
    for angle in range(0, 180, 60):
        a = math.radians(angle)
        x1, y1 = cx + math.cos(a) * 36, cy + math.sin(a) * 36
        x2, y2 = cx - math.cos(a) * 36, cy - math.sin(a) * 36
        d.line((x1, y1, x2, y2), fill=(230, 252, 255), width=8)
    d.ellipse((147, 167, 161, 181), fill=(230, 252, 255))

    # flame
    d.pieslice((294, 148, 363, 220), 105, 300, fill=(255, 215, 136))
    d.pieslice((318, 130, 370, 205), 110, 305, fill=(255, 151, 58))


def draw_phone(base):
    d = ImageDraw.Draw(base)
    add_shadow(base, (764, 117, 1086, 523), 38, blur=26, opacity=68)
    rounded(d, (764, 117, 1086, 523), 38, (9, 21, 42), (201, 224, 255, 70), 2)
    rounded(d, (790, 145, 1060, 495), 28, (246, 252, 255), None)
    rounded(d, (810, 166, 1040, 226), 20, (230, 246, 255), None)
    d.ellipse((824, 178, 858, 212), fill=(36, 214, 111))
    text(d, (870, 176), "Solicitud lista", font("bold", 22), (7, 18, 38))
    text(d, (870, 205), "por WhatsApp", font("regular", 16), (87, 104, 132))
    for i, color in enumerate([(24, 117, 255), (36, 214, 111), (255, 130, 37)]):
        y = 260 + i * 58
        d.ellipse((820, y, 844, y + 24), fill=color)
        rounded(d, (860, y + 2, 1020, y + 13), 6, (194, 211, 230))
        rounded(d, (860, y + 23, 980, y + 34), 6, (224, 234, 246))
    rounded(d, (820, 440, 1026, 470), 15, (36, 214, 111))
    text(d, (923, 446), "Enviar presupuesto", font("bold", 17), (4, 39, 18), anchor="ma")


def draw_whatsapp_card(base):
    d = ImageDraw.Draw(base)
    add_shadow(base, (790, 332, 1092, 506), 28, blur=20, opacity=46)
    rounded(d, (790, 332, 1092, 506), 28, (255, 255, 255), (219, 232, 247), 2)
    rounded(d, (812, 354, 1070, 398), 18, (230, 248, 239), None)
    d.ellipse((828, 365, 854, 391), fill=(36, 214, 111))
    text(d, (868, 360), "Solicitud por WhatsApp", font("bold", 21), (7, 18, 38))
    text(d, (868, 386), "mensaje ordenado", font("regular", 15), (86, 105, 130))
    rows = [
        ("Problema", (24, 117, 255)),
        ("Domicilio", (36, 214, 111)),
        ("Fotos sugeridas", (255, 130, 37)),
    ]
    for i, (label, color) in enumerate(rows):
        y = 422 + i * 25
        d.ellipse((822, y, 834, y + 12), fill=color)
        rounded(d, (846, y, 1036, y + 12), 6, (219, 232, 247))
        text(d, (1046, y - 3), label, font("regular", 13), (91, 109, 135))


def draw():
    img = gradient_background()
    radial(img, (158, 95), 410, (28, 200, 255), 90)
    radial(img, (1108, 560), 430, (255, 122, 26), 78)
    d = ImageDraw.Draw(img)

    # subtle brand frame
    rounded(d, (34, 28, 1166, 602), 34, (255, 255, 255, 0), (219, 232, 247, 210), 2)
    d.rounded_rectangle((34, 28, 1166, 602), radius=34, outline=(255, 255, 255, 130), width=1)
    d.rectangle((34, 28, 1166, 34), fill=(24, 117, 255))
    d.rectangle((520, 28, 820, 34), fill=(36, 214, 111))
    d.rectangle((820, 28, 1166, 34), fill=(255, 130, 37))

    draw_logo(img)
    # copy
    text(d, (456, 115), "24 Climatizaciones", font("black", 58), (7, 18, 38))
    rounded(d, (456, 184, 748, 222), 19, (231, 243, 255), (24, 117, 255, 82), 1)
    text(d, (476, 191), "CÓRDOBA Y ALREDEDORES", font("bold", 21), (11, 91, 215))
    text(d, (456, 264), "Presupuesto claro", font("black", 52), (7, 18, 38))
    text(d, (456, 322), "por WhatsApp", font("black", 52), (7, 18, 38))
    text(d, (456, 392), "Instalación, reparación y mantenimiento", font("bold", 28), (20, 38, 68))
    text(d, (456, 432), "Aires acondicionados · Calderas · Calefacción", font("bold", 24), (84, 101, 128))

    chips = [
        ("Solicitar presupuesto", (36, 214, 111), (4, 39, 18), 456),
        ("Ubicación precisa", (255, 255, 255), (20, 38, 68), 714),
    ]
    for label, fill, fg, x in chips:
        w = 226 if label == "Solicitar presupuesto" else 206
        rounded(d, (x, 476, x + w, 528), 26, fill, (217, 229, 244), 2)
        text(d, (x + w / 2, 490), label, font("bold", 21), fg, anchor="ma")

    # bottom
    text(d, (92, 554), "24-climatizaciones.vercel.app", font("bold", 28), (11, 32, 65))
    text(d, (1106, 554), "Respuesta rapida", font("bold", 23), (36, 214, 111), anchor="ra")
    d.ellipse((1074, 559, 1088, 573), fill=(36, 214, 111))

    img.convert("RGB").save(OUT, "PNG", optimize=True)


if __name__ == "__main__":
    draw()
