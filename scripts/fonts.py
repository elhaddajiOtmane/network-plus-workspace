"""Fetch the exact required fonts and their licenses. No application data is fetched."""
from pathlib import Path
from urllib.request import urlopen

target = Path(__file__).resolve().parent.parent / 'dist' / 'fonts'
base = 'https://raw.githubusercontent.com/google/fonts/main/ofl/'
assets = {
    'Outfit.ttf': 'outfit/Outfit%5Bwght%5D.ttf',
    'Outfit-OFL.txt': 'outfit/OFL.txt',
    'WorkSans.ttf': 'worksans/WorkSans%5Bwght%5D.ttf',
    'WorkSans-OFL.txt': 'worksans/OFL.txt',
}
for filename, remote in assets.items():
    with urlopen(base + remote, timeout=30) as response:
        content = response.read()
    (target / filename).write_bytes(content)
    print(f'{filename}: {len(content)} bytes')
