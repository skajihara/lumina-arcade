"""各ステージの開始画面（.qa/stages/<game>/NN.png）を、ゲームごとに1枚の一覧画像にする。

使い方：python3 scripts/contact-sheet.py
出力：.qa/stages-<game>.png（見た目の確認用。Read で開いて崩れを探す）
"""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
src = root / '.qa' / 'stages'
out = root / '.qa'
out.mkdir(parents=True, exist_ok=True)

COLS, W = 4, 400
for game in sorted(p for p in src.iterdir() if p.is_dir()) if src.exists() else []:
    files = sorted(game.glob('*.png'))
    if not files:
        continue
    first = Image.open(files[0])
    h = int(first.height * W / first.width)
    rows = (len(files) + COLS - 1) // COLS
    sheet = Image.new('RGB', (COLS * W, rows * h), (0, 0, 0))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(files):
        im = Image.open(f).convert('RGB').resize((W, h))
        x, y = (i % COLS) * W, (i // COLS) * h
        sheet.paste(im, (x, y))
        # 番号は右下に（画面の左上の HUD と重ならないように）
        d.rectangle([x + W - 34, y + h - 20, x + W, y + h], fill=(0, 0, 0))
        d.text((x + W - 28, y + h - 16), f.stem, fill=(255, 220, 120))
    sheet.save(out / f'stages-{game.name}.png')
    print('wrote', out / f'stages-{game.name}.png', len(files))
