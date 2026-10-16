"""Ghép nhiều ảnh thành 1 trang xem nhanh, mỗi ảnh có nhãn tên file."""
import sys
from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1]
files = sys.argv[2:]
COLS = 5
TW, TH = 420, 580
LABEL = 44
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 17)
rows = (len(files) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * (TW + 16) + 16, rows * (TH + LABEL + 16) + 16), (235, 237, 240))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    r, c = divmod(i, COLS)
    x = 16 + c * (TW + 16)
    y = 16 + r * (TH + LABEL + 16)
    im = Image.open(f).convert('RGB')
    im.thumbnail((TW, TH))
    sheet.paste(im, (x + (TW - im.width) // 2, y + (TH - im.height) // 2))
    name = f.replace('\\', '/').split('/')[-1]
    d.text((x + TW / 2, y + TH + 8), f'{i + 1}. {name[:44]}', font=font, fill=(20, 20, 20), anchor='mt')
sheet.save(out, quality=88)
print(out, sheet.size)
