"""Refresh the self-hosted typefaces FROM THE RUNNING PRODUCTION SITE.

Not from Google, deliberately.

Google reissues these files, and a fresh download is not necessarily the same
drawing. Taking them from Google two days after the last production build gave
a Faustina whose ṣ — the dot-under s in Naimiṣa, the app's own name — was drawn
differently enough that Sailavan spotted it immediately. The point of holding
the files here is that the type stops changing underneath us; downloading a
new one to achieve that would defeat it.

So the source of truth is whatever production is serving. To take a genuinely
newer version, deploy it to dev first and look at the ṣ.

Each file carries a unicode-range, which is why these rules are hand-held
rather than passed to next/font/local, which has no way to express one.
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
