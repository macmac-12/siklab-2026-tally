#!/usr/bin/env python3
"""Prepare transparent web assets from the supplied official PNG originals.

Requires ImageMagick 7 (`magick`). Only transparent padding is removed;
the entire artwork is contained within a consistently padded output canvas.
"""

from pathlib import Path
import shutil
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "docs" / "logos-design"
OUTPUT = ROOT / "public" / "branding"
CRESTS = {
    "buhi": "BC Fierce Foxes.png",
    "cas": "CAS Red Monarchs.png",
    "ccs": "CCS Golden Cheetahs.png",
    "cea": "CEA Raging Bulls.png",
    "chs": "CHS Venom Vipers.png",
    "ctde": "CTDE Blue Sentinels.png",
    "cthbm": "CTHBM Soaring Vanguards.png",
}
OFFICIAL = "SIKLAB 2026 Official Logo.png"


def prepare(source: str, name: str, artwork: str, canvas: str) -> None:
    target = OUTPUT / f"{name}.webp"
    temporary = OUTPUT / f".{name}.tmp.webp"
    subprocess.run(
        [
            "magick", str(SOURCES / source),
            "-trim", "+repage", "-resize", artwork,
            "-gravity", "center", "-background", "none", "-extent", canvas,
            "-strip", "-define", "webp:method=6", "-quality", "92",
            str(temporary),
        ],
        check=True,
    )
    temporary.replace(target)
    print(f"{target.relative_to(ROOT)} ({target.stat().st_size:,} bytes)")


def main() -> None:
    if not shutil.which("magick"):
        raise SystemExit("ImageMagick 7 (`magick`) is required.")
    for filename in [*CRESTS.values(), OFFICIAL]:
        if not (SOURCES / filename).is_file():
            raise SystemExit(f"Missing supplied logo: {filename}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, source in CRESTS.items():
        prepare(source, name, "464x464", "512x512")
    prepare(OFFICIAL, "siklab-2026", "288x480", "320x512")


if __name__ == "__main__":
    main()
