from pathlib import Path
from PIL import Image, ImageOps, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = Path(r"C:\Users\paulo\AppData\Local\Temp")
OUT_DIR = ROOT / "assets" / "proof"

ITEMS = [
    {
        "src": "codex-clipboard-36284b10-64cb-424b-9960-3e667feafaf4.jpg",
        "name": "certificado-vrf-gree",
        "rotate": 90,
        "width": 980,
    },
    {
        "src": "codex-clipboard-0b765c2c-adc3-41cc-b9dd-354bc34fd2d6.jpg",
        "name": "puesta-marcha-inverter",
        "width": 860,
    },
    {
        "src": "codex-clipboard-ecef2602-746a-43a2-a352-8376186bd3b4.jpg",
        "name": "banco-entrenamiento-refrigeracion",
        "width": 860,
    },
    {
        "src": "codex-clipboard-87e2645c-6ecc-4ab8-a5b9-92b892ef9e4b.jpg",
        "name": "herramientas-diagnostico",
        "width": 860,
    },
    {
        "src": "codex-clipboard-f5552dc9-ba88-4a5c-ad28-f145844565b1.jpg",
        "name": "jornadas-tecnicas-cacaav",
        "width": 860,
    },
    {
        "src": "codex-clipboard-92da6f10-d60e-4b2c-b63c-64777c2e1fac.jpg",
        "name": "reparacion-caldera",
        "width": 860,
    },
    {
        "src": "codex-clipboard-4b6eecd6-74ca-41cf-a595-1de01496d345.jpg",
        "name": "simulador-refrigeracion",
        "width": 860,
    },
    {
        "src": "codex-clipboard-9276a383-4095-401b-aea4-d180bbec28d1.jpg",
        "name": "instrumentos-refrigeracion",
        "width": 860,
    },
    {
        "src": "codex-clipboard-08719c92-aa3f-4f35-90fd-e9739c7b68d5.jpg",
        "name": "formacion-cacaav",
        "width": 860,
    },
    {
        "src": "codex-clipboard-b6306e78-6644-413f-b464-3fcc2f2c69c8.jpg",
        "name": "limpieza-fugas",
        "width": 760,
    },
]


def enhance(image: Image.Image) -> Image.Image:
    image = ImageEnhance.Color(image).enhance(1.06)
    image = ImageEnhance.Contrast(image).enhance(1.06)
    image = ImageEnhance.Sharpness(image).enhance(1.28)
    return image.filter(ImageFilter.UnsharpMask(radius=1.2, percent=95, threshold=3))


def fit_cover(image: Image.Image, width: int, height: int) -> Image.Image:
    image = ImageOps.fit(image, (width, height), method=Image.Resampling.LANCZOS, centering=(0.5, 0.48))
    return enhance(image)


OUT_DIR.mkdir(parents=True, exist_ok=True)

for item in ITEMS:
    source = SOURCE_DIR / item["src"]
    image = Image.open(source)
    image = ImageOps.exif_transpose(image).convert("RGB")
    if item.get("rotate"):
        image = image.rotate(item["rotate"], expand=True)

    target_width = min(item["width"], image.width)
    ratio = target_width / image.width
    target_height = round(image.height * ratio)
    full = image.resize((target_width, target_height), Image.Resampling.LANCZOS)
    full = enhance(full)

    full_path = OUT_DIR / f"{item['name']}.webp"
    thumb_path = OUT_DIR / f"{item['name']}-thumb.webp"

    full.save(full_path, "WEBP", quality=74, method=6)
    fit_cover(image, 420, 300).save(thumb_path, "WEBP", quality=70, method=6)

    print(
        f"{item['name']}: {full_path.stat().st_size / 1024:.1f} KB, "
        f"thumb {thumb_path.stat().st_size / 1024:.1f} KB"
    )
