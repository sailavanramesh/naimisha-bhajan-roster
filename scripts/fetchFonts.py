"""Download the three typefaces and rewrite the @font-face block in globals.css.

Google serves one file per (weight, subset) with a unicode-range on each, and
that range is the reason these rules are hand-held rather than passed to
next/font/local, which has no way to express one. Without the split every
visitor would download the accented file to render a word with no accents in
it.
"""

import pathlib
import re
import subprocess

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

FAMILIES = [
    ("Faustina", "500;600;700", "faustina"),
    ("IBM+Plex+Sans", "400;500;600", "plex-sans"),
    ("IBM+Plex+Mono", "400;500;600", "plex-mono"),
]

KEEP = ("latin", "latin-ext")
START = "/* BEGIN self-hosted fonts — scripts/fetchFonts.sh */"
END = "/* END self-hosted fonts */"

faces = []
pathlib.Path("public/fonts").mkdir(parents=True, exist_ok=True)

for family, weights, slug in FAMILIES:
    url = f"https://fonts.googleapis.com/css2?family={family}:wght@{weights}&display=swap"
    css = subprocess.run(
        ["curl", "-fsS", "-H", f"User-Agent: {UA}", url], capture_output=True, text=True, check=True
    ).stdout

    for subset, block in re.findall(r"/\*\s*([a-z0-9-]+)\s*\*/\s*(@font-face\s*\{[^}]+\})", css):
        if subset not in KEEP:
            continue
        weight = re.search(r"font-weight:\s*(\d+)", block).group(1)
        src = re.search(r"url\((https://[^)]+\.woff2)\)", block).group(1)
        name = f"{slug}-{weight}-{subset}.woff2"
        subprocess.run(["curl", "-fsS", "-o", f"public/fonts/{name}", src], check=True)
        faces.append(block.replace(src, f"/fonts/{name}").strip())

print(f"{len(faces)} faces written to public/fonts")

path = pathlib.Path("app/globals.css")
css = path.read_text(encoding="utf8")
if START in css and END in css:
    before = css[: css.index(START)]
    after = css[css.index(END) + len(END) :]
    path.write_text(before + START + "\n" + "\n\n".join(faces) + "\n" + END + after, encoding="utf8")
    print("app/globals.css updated in place")
else:
    print("Markers not found in app/globals.css — paste these in by hand:")
    print("\n\n".join(faces))
