"""Tạo phiếu trả lời trắc nghiệm tổng hợp dạng "điền A/B/C/D vào ô trống", kèm đáp án chuẩn.

Mỗi phiếu: 1 kiểu bố cục in + chữ viết tay giả lập bằng font viết tay + hiệu ứng ảnh chụp điện thoại hoặc scan.
Có câu bỏ trống, câu gạch xoá rồi viết lại, câu ghi 2 chữ, chữ thường, chữ mờ, chữ lệch ô.
"""
import csv
import json
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), 'fonts')

PRINT = 'C:/Windows/Fonts/arial.ttf'
PRINT_BOLD = 'C:/Windows/Fonts/arialbd.ttf'
TIMES = 'C:/Windows/Fonts/times.ttf'
HANDS = [os.path.join(FONT_DIR, f) for f in sorted(os.listdir(FONT_DIR)) if f.endswith('.ttf')]
NAME_FONT = os.path.join(FONT_DIR, 'PatrickHand.ttf')  # có dấu tiếng Việt
# Tên hư cấu, không phải học sinh thật
NAMES = ['Nguyễn Minh Anh', 'Trần Gia Bảo', 'Lê Khánh Linh', 'Phạm Quốc Huy', 'Võ Ngọc Hân', 'Đặng Tuấn Kiệt',
         'Bùi Thảo Vy', 'Hoàng Đức Minh', 'Đỗ Phương Thảo', 'Huỳnh Nhật Nam', 'Phan Thu Trang', 'Lý Hoài An']
INKS = [(20, 30, 110), (25, 25, 30), (30, 60, 140), (60, 60, 70)]
W, H = 1654, 2339  # A4 ở 200 dpi


def font(path, size):
    return ImageFont.truetype(path, size)


class Hand:
    """Một "học sinh": font, màu mực, độ nghiêng, độ run tay riêng."""

    def __init__(self, rnd):
        self.rnd = rnd
        self.font_path = rnd.choice(HANDS)
        self.ink = rnd.choice(INKS)
        self.slant = rnd.uniform(-8, 8)
        self.jitter = rnd.uniform(0.04, 0.14)
        self.scale = rnd.uniform(0.68, 0.84)

    def glyph(self, text, size, alpha=255, rot=None):
        # size là chiều cao chữ in hoa mong muốn; mỗi font có tỉ lệ khác nhau nên quy đổi theo chữ 'A'
        if not hasattr(self, '_cap'):
            l0, t0, r0, b0 = font(self.font_path, 100).getbbox('A')
            self._cap = (b0 - t0) / 100
        f = font(self.font_path, max(10, int(size / self._cap)))
        l, t, r, b = f.getbbox(text)
        tile = Image.new('RGBA', (r - l + 20, b - t + 20), (0, 0, 0, 0))
        ImageDraw.Draw(tile).text((10 - l, 10 - t), text, font=f, fill=self.ink + (alpha,))
        angle = rot if rot is not None else self.slant + self.rnd.uniform(-6, 6)
        return tile.rotate(angle, expand=True, resample=Image.BICUBIC)

    def write(self, img, box, text, alpha=255, size_mul=1.0, offset=(0, 0)):
        x0, y0, x1, y1 = box
        h = (y1 - y0) * self.scale * size_mul
        g = self.glyph(text, h, alpha)
        cx = (x0 + x1) / 2 + self.rnd.uniform(-1, 1) * self.jitter * (x1 - x0) + offset[0]
        cy = (y0 + y1) / 2 + self.rnd.uniform(-1, 1) * self.jitter * (y1 - y0) + offset[1]
        img.alpha_composite(g, (int(cx - g.width / 2), int(cy - g.height / 2)))
        return (cx, cy, g.width, g.height)

    def strike(self, img, center, w, h):
        d = ImageDraw.Draw(img)
        cx, cy, gw, gh = center
        if self.rnd.random() < 0.5:  # gạch chéo X
            d.line([(cx - gw * 0.35, cy - gh * 0.3), (cx + gw * 0.35, cy + gh * 0.3)], fill=self.ink + (255,), width=4)
            d.line([(cx - gw * 0.35, cy + gh * 0.3), (cx + gw * 0.35, cy - gh * 0.3)], fill=self.ink + (255,), width=4)
        else:  # gạch ngang nhiều lần
            for k in range(3):
                yy = cy - 6 + k * 6
                d.line([(cx - gw * 0.4, yy), (cx + gw * 0.4, yy + self.rnd.uniform(-4, 4))], fill=self.ink + (255,), width=3)


def plan_answers(rnd, n, options):
    """Đáp án học sinh + loại tình huống từng câu."""
    items = []
    for q in range(1, n + 1):
        r = rnd.random()
        choice = rnd.choice(options)
        if r < 0.04:
            items.append({'q': q, 'kind': 'blank', 'truth': ''})
        elif r < 0.07:
            old = rnd.choice([o for o in options if o != choice])
            items.append({'q': q, 'kind': 'crossed', 'old': old, 'truth': choice})
        elif r < 0.09:
            other = rnd.choice([o for o in options if o != choice])
            items.append({'q': q, 'kind': 'multiple', 'text': f'{choice},{other}' if rnd.random() < 0.5 else f'{choice}/{other}', 'truth': ''})
        elif r < 0.12:
            items.append({'q': q, 'kind': 'lower', 'truth': choice})
        elif r < 0.14:
            items.append({'q': q, 'kind': 'faint', 'truth': choice})
        elif r < 0.16:
            items.append({'q': q, 'kind': 'offset', 'truth': choice})
        else:
            items.append({'q': q, 'kind': 'clear', 'truth': choice})
    return items


def fill_cell(img, hand, box, item, rnd):
    k = item['kind']
    w = box[2] - box[0]
    if k == 'blank':
        return
    if k == 'crossed_only':  # gạch bỏ rồi để trống
        c = hand.write(img, box, item['old'], size_mul=0.9)
        hand.strike(img, c, w, box[3] - box[1])
        return
    if k == 'crossed':
        c = hand.write(img, box, item['old'], size_mul=0.9, offset=(-w * 0.18, 0))
        hand.strike(img, c, w, box[3] - box[1])
        hand.write(img, box, item['truth'], size_mul=0.85, offset=(w * 0.22, -(box[3] - box[1]) * 0.08))
    elif k == 'multiple':
        hand.write(img, box, item['text'], size_mul=0.7)
    elif k == 'lower':
        hand.write(img, box, item['truth'].lower())
    elif k == 'faint':
        hand.write(img, box, item['truth'], alpha=95)
    elif k == 'offset':
        hand.write(img, box, item['truth'], offset=(w * 0.3, -(box[3] - box[1]) * 0.25))
    else:
        hand.write(img, box, item['truth'])


def header(img, d, rnd, hand, title, y=70, version=None, compact=False):
    tf = font(PRINT_BOLD, 46 if not compact else 38)
    d.text((W / 2, y), title, font=tf, fill=(0, 0, 0), anchor='mt')
    lf = font(TIMES, 34 if not compact else 30)
    y += 90 if not compact else 70
    d.text((110, y), 'Họ và tên: ........................................................', font=lf, fill=(0, 0, 0))
    name = rnd.choice(NAMES)
    g = Image.new('RGBA', (900, 90), (0, 0, 0, 0))
    ImageDraw.Draw(g).text((0, 0), name, font=font(NAME_FONT, 52), fill=hand.ink + (255,))
    img.alpha_composite(g.rotate(rnd.uniform(-2, 2), expand=False), (300, y - 22))
    d.text((1000, y), 'Lớp: ...................', font=lf, fill=(0, 0, 0))
    hand.write(img, (1090, y - 18, 1290, y + 40), rnd.choice(['5A', '6B', 'S3', 'M2', 'F1']), size_mul=1.0)
    if version:
        d.text((1340, y), 'Mã đề: ......', font=lf, fill=(0, 0, 0))
        hand.write(img, (1460, y - 18, 1580, y + 40), version, size_mul=1.0)
    return name, y + 80


def layout_table_rows(img, d, rnd, hand, items, per_row, top, cell_h=70, left=110, right=None):
    """Bảng ngang: hàng số câu (nền xám) + hàng ô trống để viết."""
    right = right or W - 110
    cw = (right - left) / per_row
    nf = font(PRINT_BOLD, 28 if per_row <= 10 else 22)
    lf = font(PRINT_BOLD, 26)
    y = top
    for start in range(0, len(items), per_row):
        row = items[start:start + per_row]
        d.text((left - 12, y + 18), 'Câu', font=lf, fill=(0, 0, 0), anchor='rm')
        d.text((left - 12, y + 45 + cell_h * 0.5), 'Đ.án', font=lf, fill=(0, 0, 0), anchor='rm')
        for i, it in enumerate(row):
            x0 = left + i * cw
            d.rectangle([x0, y, x0 + cw, y + 45], fill=(225, 225, 225), outline=(0, 0, 0), width=2)
            d.text((x0 + cw / 2, y + 23), str(it['q']), font=nf, fill=(0, 0, 0), anchor='mm')
            box = (x0, y + 45, x0 + cw, y + 45 + cell_h)
            d.rectangle(box, outline=(0, 0, 0), width=2)
            fill_cell(img, hand, (box[0] + 4, box[1] + 4, box[2] - 4, box[3] - 4), it, rnd)
        y += 45 + cell_h + 40
    return y


def layout_vertical(img, d, rnd, hand, items, cols, top, row_h=72, box_w=110):
    """Danh sách dọc nhiều cột: "12." rồi một ô vuông."""
    per_col = math.ceil(len(items) / cols)
    col_w = (W - 220) / cols
    nf = font(TIMES, 34)
    for i, it in enumerate(items):
        c, r = divmod(i, per_col)
        x = 110 + c * col_w
        y = top + r * row_h
        d.text((x + 70, y + row_h / 2), f'{it["q"]}.', font=nf, fill=(0, 0, 0), anchor='rm')
        box = (x + 85, y + 6, x + 85 + box_w, y + row_h - 6)
        d.rectangle(box, outline=(0, 0, 0), width=2)
        fill_cell(img, hand, (box[0] + 3, box[1] + 3, box[2] - 3, box[3] - 3), it, rnd)
    return top + per_col * row_h


def layout_square_grid(img, d, rnd, hand, items, per_row, top, size=150):
    """Ô vuông, số câu nhỏ ở góc trên trái."""
    gap = ((W - 220) - per_row * size) / (per_row - 1)
    nf = font(PRINT, 24)
    for i, it in enumerate(items):
        r, c = divmod(i, per_row)
        x = 110 + c * (size + gap)
        y = top + r * (size + 24)
        d.rectangle([x, y, x + size, y + size], outline=(0, 0, 0), width=2)
        d.text((x + 8, y + 6), str(it['q']), font=nf, fill=(0, 0, 0))
        fill_cell(img, hand, (x + 18, y + 28, x + size - 10, y + size - 10), it, rnd)
    return top + math.ceil(len(items) / per_row) * (size + 24)


def layout_lines(img, d, rnd, hand, items, per_row, top, row_h=95):
    """Viết trên dòng kẻ: "7. ______" không có ô."""
    col_w = (W - 220) / per_row
    nf = font(TIMES, 36)
    for i, it in enumerate(items):
        r, c = divmod(i, per_row)
        x = 110 + c * col_w
        y = top + r * row_h
        d.text((x, y + row_h - 22), f'{it["q"]}.', font=nf, fill=(0, 0, 0), anchor='ls')
        d.line([(x + 62, y + row_h - 22), (x + col_w - 40, y + row_h - 22)], fill=(0, 0, 0), width=2)
        fill_cell(img, hand, (x + 70, y + 10, x + col_w - 60, y + row_h - 26), it, rnd)
    return top + math.ceil(len(items) / per_row) * row_h


def layout_two_col_tables(img, d, rnd, hand, items, blocks, top, row_h=58):
    """Bảng "Câu | Đáp án" kiểu Excel, nhiều khối đặt cạnh nhau."""
    per_block = math.ceil(len(items) / blocks)
    bw = (W - 220 - (blocks - 1) * 40) / blocks
    hf = font(PRINT_BOLD, 26)
    nf = font(PRINT, 28)
    for b in range(blocks):
        x = 110 + b * (bw + 40)
        d.rectangle([x, top, x + bw, top + row_h], fill=(210, 222, 240), outline=(0, 0, 0), width=2)
        d.line([(x + bw * 0.4, top), (x + bw * 0.4, top + row_h)], fill=(0, 0, 0), width=2)
        d.text((x + bw * 0.2, top + row_h / 2), 'Câu', font=hf, fill=(0, 0, 0), anchor='mm')
        d.text((x + bw * 0.7, top + row_h / 2), 'Đáp án', font=hf, fill=(0, 0, 0), anchor='mm')
        for r, it in enumerate(items[b * per_block:(b + 1) * per_block]):
            y = top + (r + 1) * row_h
            d.rectangle([x, y, x + bw, y + row_h], outline=(0, 0, 0), width=1)
            d.line([(x + bw * 0.4, y), (x + bw * 0.4, y + row_h)], fill=(0, 0, 0), width=1)
            d.text((x + bw * 0.2, y + row_h / 2), str(it['q']), font=nf, fill=(0, 0, 0), anchor='mm')
            fill_cell(img, hand, (x + bw * 0.4 + 4, y + 3, x + bw - 4, y + row_h - 3), it, rnd)
    return top + (per_block + 1) * row_h


QUESTION_BANK = [
    ('She ____ to school every day.', ['go', 'goes', 'going', 'gone']),
    ('There ____ two cats under the table.', ['is', 'are', 'be', 'am']),
    ('I have ____ apple in my bag.', ['a', 'an', 'the', 'some']),
    ('Tom is ____ than his brother.', ['tall', 'taller', 'tallest', 'more tall']),
    ('We ____ football yesterday afternoon.', ['play', 'plays', 'played', 'playing']),
    ('Where ____ you live?', ['do', 'does', 'is', 'are']),
    ('My mother can ____ very well.', ['cook', 'cooks', 'cooking', 'cooked']),
    ('They are waiting ____ the bus.', ['at', 'for', 'on', 'in']),
    ('How ____ apples are there?', ['much', 'many', 'any', 'some']),
    ('He doesn\'t like ____ milk.', ['drink', 'drinks', 'drinking', 'drank']),
    ('The book is ____ the bag.', ['in', 'at', 'of', 'to']),
    ('Look! The baby ____ .', ['sleep', 'sleeps', 'is sleeping', 'slept']),
    ('Which word is different?', ['red', 'blue', 'green', 'chair']),
    ('It\'s cold. Put ____ your coat.', ['on', 'off', 'up', 'in']),
    ('My birthday is ____ May.', ['on', 'in', 'at', 'by']),
]


def layout_your_answers(img, d, rnd, hand, items, top, parts, cols=4, show_questions=True, cell_h=62, compact=False, questions=None):
    """Trang đề kiểu Cambridge: câu hỏi in A/B/C/D, cuối mỗi phần là bảng "Your answers:" — ô có số câu, học sinh viết chữ cạnh số."""
    qf = font(TIMES, 30)
    hf = font(PRINT_BOLD, 32)
    af = font('C:/Windows/Fonts/timesbd.ttf', 38)
    nf = font(TIMES, 34)
    y = top
    start = 0
    for p, count in enumerate(parts):
        sec = items[start:start + count]
        d.text((110, y), f'Part {p + 1}. Choose the best answer A, B, C or D.', font=hf, fill=(0, 0, 0))
        y += 55
        if show_questions:
            for it in sec:
                text, opts = questions[it['q'] - 1] if questions else rnd.choice(QUESTION_BANK)
                opts_line = '      '.join(f'{"ABCDE"[i]}. {o}' for i, o in enumerate(opts))
                if compact:  # câu hỏi và lựa chọn trên cùng một dòng
                    d.text((140, y), f'{it["q"]}. {text}', font=font(TIMES, 27), fill=(0, 0, 0))
                    d.text((860, y), opts_line, font=font(TIMES, 27), fill=(0, 0, 0))
                    y += 44
                    continue
                d.text((140, y), f'{it["q"]}. {text}', font=qf, fill=(0, 0, 0))
                y += 40
                d.text((190, y), opts_line, font=qf, fill=(0, 0, 0))
                y += 48
        y += 15
        d.text((110, y), 'Your answers:', font=af, fill=(0, 0, 0))
        tw = d.textlength('Your answers:', font=af)
        d.line([(110, y + 44), (110 + tw, y + 44)], fill=(0, 0, 0), width=3)
        y += 62
        cw = (W - 220) / cols
        for i, it in enumerate(sec):
            r, c = divmod(i, cols)
            x0 = 110 + c * cw
            y0 = y + r * cell_h
            d.rectangle([x0, y0, x0 + cw, y0 + cell_h], outline=(0, 0, 0), width=2)
            d.text((x0 + 12, y0 + cell_h / 2), f'{it["q"]}.', font=nf, fill=(0, 0, 0), anchor='lm')
            # học sinh viết ngay sau số câu
            bx = x0 + 62 + rnd.uniform(0, 20)
            fill_cell(img, hand, (bx, y0 + 4, bx + 120, y0 + cell_h - 4), it, rnd)
        y += math.ceil(len(sec) / cols) * cell_h + 60
        start += count
    return y


def find_coeffs(src, dst):
    m = []
    for (x, y), (u, v) in zip(dst, src):
        m.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        m.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    a = np.array(m, dtype=float)
    b = np.array(src, dtype=float).reshape(8)
    return np.linalg.solve(a, b).tolist()


def photograph(paper, rnd, style):
    """Hiệu ứng chụp điện thoại (nghiêng, phối cảnh, bóng, nền bàn) hoặc scan phẳng."""
    paper = paper.convert('RGB')
    tint = np.array(paper, dtype=np.float32) * np.array(rnd.choice([(1, 1, 1), (1, 0.98, 0.93), (0.98, 0.98, 0.96)]))
    if style == 'scan':
        arr = tint + np.random.default_rng(rnd.randint(0, 9999)).normal(0, 4, tint.shape)
        img = Image.fromarray(np.clip(arr, 0, 255).astype('uint8')).rotate(rnd.uniform(-1.2, 1.2), fillcolor=(250, 250, 250))
        return img.filter(ImageFilter.GaussianBlur(0.5))
    paper = Image.fromarray(np.clip(tint, 0, 255).astype('uint8'))
    bw, bh = int(W * 1.18), int(H * 1.14)
    bg = Image.new('RGB', (bw, bh), rnd.choice([(120, 90, 60), (90, 95, 100), (160, 140, 110), (60, 60, 65)]))
    bg_arr = np.array(bg, dtype=np.float32) + np.random.default_rng(1).normal(0, 10, (bh, bw, 3))
    bg = Image.fromarray(np.clip(bg_arr, 0, 255).astype('uint8'))
    ox, oy = (bw - W) // 2, (bh - H) // 2
    bg.paste(paper, (ox, oy))
    # phối cảnh: lệch 4 góc
    j = lambda s: rnd.uniform(-s, s)
    src = [(0, 0), (bw, 0), (bw, bh), (0, bh)]
    dst = [(j(60), j(60)), (bw + j(60), j(60)), (bw + j(60), bh + j(60)), (j(60), bh + j(60))]
    img = bg.transform((bw, bh), Image.PERSPECTIVE, find_coeffs(src, dst), Image.BICUBIC, fillcolor=bg.getpixel((5, 5)))
    img = img.rotate(rnd.uniform(-4, 4), resample=Image.BICUBIC, fillcolor=(70, 70, 70))
    # ánh sáng không đều + bóng tay/điện thoại
    arr = np.array(img, dtype=np.float32)
    yy, xx = np.mgrid[0:bh, 0:bw]
    ang = rnd.uniform(0, 2 * math.pi)
    grad = 0.78 + 0.28 * ((np.cos(ang) * xx / bw + np.sin(ang) * yy / bh + 1) / 2)
    if rnd.random() < 0.5:
        cx, cy, rad = rnd.uniform(0.2, 0.8) * bw, rnd.uniform(0.6, 1.0) * bh, rnd.uniform(0.25, 0.4) * bw
        grad *= 1 - 0.28 * np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * rad ** 2)))
    arr = arr * grad[..., None] + np.random.default_rng(rnd.randint(0, 9999)).normal(0, 5, arr.shape)
    img = Image.fromarray(np.clip(arr, 0, 255).astype('uint8'))
    img = img.filter(ImageFilter.GaussianBlur(rnd.uniform(0.6, 1.3)))
    return img.resize((int(bw * 0.85), int(bh * 0.85)), Image.LANCZOS)


def main():
    OUT = sys.argv[2]
    os.makedirs(OUT, exist_ok=True)
    SHEETS = [
        ('01-bang-ngang-10cot', 'table10', 40, 'ABCD', 'photo'),
        ('02-bang-ngang-20cot', 'table20', 40, 'ABCD', 'scan'),
        ('03-doc-2-cot', 'vertical2', 40, 'ABCD', 'photo'),
        ('04-doc-4-cot', 'vertical4', 60, 'ABCD', 'photo'),
        ('05-o-vuong-so-goc', 'squares', 30, 'ABCD', 'photo'),
        ('06-dong-ke', 'lines', 40, 'ABCD', 'photo'),
        ('07-bang-cau-dap-an', 'twocol', 40, 'ABCD', 'scan'),
        ('08-nua-trang-20-cau', 'half', 20, 'ABCD', 'photo'),
        ('09-bang-ngang-ma-de', 'table10', 50, 'ABCDE', 'photo'),
        ('10-doc-2-cot-scan', 'vertical2', 30, 'ABCD', 'scan'),
        ('11-o-vuong-50-cau', 'squares6', 48, 'ABCD', 'photo'),
        ('12-bang-cau-dap-an-toi', 'twocol', 60, 'ABCD', 'photo'),
        ('13-your-answers-10-cau', 'ya10', 10, 'ABCD', 'scan'),
        ('14-your-answers-10-cau-chup', 'ya10', 10, 'ABCD', 'photo'),
        ('15-your-answers-2-phan', 'ya2parts', 18, 'ABCD', 'photo'),
        ('16-your-answers-chi-bang-20', 'yaonly', 20, 'ABCD', 'photo'),
    ]

    manifest = []
    truth_rows = []
    for idx, (name, layout, n, options, style) in enumerate(SHEETS):
        rnd = random.Random(1000 + idx)
        hand = Hand(rnd)
        items = plan_answers(rnd, n, list(options))
        paper = Image.new('RGBA', (W, H), (255, 255, 255, 255))
        d = ImageDraw.Draw(paper)
        version = rnd.choice(['101', '102', '203']) if layout in ('table10', 'twocol') else None
        title = 'PHIẾU TRẢ LỜI TRẮC NGHIỆM' if idx % 2 == 0 else 'ANSWER SHEET'
        if layout.startswith('ya'):
            title = rnd.choice(['ENGLISH TEST – UNIT 3', 'MID-TERM TEST', 'MOVERS PRACTICE TEST'])
        student, y = header(paper, d, rnd, hand, title, version=version, compact=layout == 'half')
        if not layout.startswith('ya'):
            hint = f'Học sinh viết chữ cái ({options[0]}–{options[-1]}) vào ô tương ứng với mỗi câu.'
            d.text((110, y), hint, font=font(TIMES, 28), fill=(40, 40, 40))
            y += 70
        if layout == 'table10':
            layout_table_rows(paper, d, rnd, hand, items, 10, y)
        elif layout == 'table20':
            layout_table_rows(paper, d, rnd, hand, items, 20, y, cell_h=62)
        elif layout == 'vertical2':
            layout_vertical(paper, d, rnd, hand, items, 2, y, row_h=max(48, min(80, int(1700 / math.ceil(n / 2)))))
        elif layout == 'vertical4':
            layout_vertical(paper, d, rnd, hand, items, 4, y, row_h=max(48, min(80, int(1750 / math.ceil(n / 4)))), box_w=95)
        elif layout == 'squares':
            layout_square_grid(paper, d, rnd, hand, items, 5, y, size=170)
        elif layout == 'squares6':
            layout_square_grid(paper, d, rnd, hand, items, 6, y, size=150)
        elif layout == 'lines':
            layout_lines(paper, d, rnd, hand, items, 4, y)
        elif layout == 'twocol':
            layout_two_col_tables(paper, d, rnd, hand, items, 4, y, row_h=max(46, min(70, int(1700 / (math.ceil(n / 4) + 1)))))
        elif layout == 'ya10':
            layout_your_answers(paper, d, rnd, hand, items, y + 10, [10])
        elif layout == 'ya2parts':
            layout_your_answers(paper, d, rnd, hand, items, y + 10, [8, 10], compact=True)
        elif layout == 'yaonly':
            layout_your_answers(paper, d, rnd, hand, items, y + 30, [20], cols=5, show_questions=False, cell_h=70)
        elif layout == 'half':
            layout_table_rows(paper, d, rnd, hand, items, 10, y, cell_h=80)
            paper = paper.crop((0, 0, W, int(H * 0.52)))
        img = photograph(paper if layout != 'half' else paper, rnd, style) if layout != 'half' else photograph(paper.resize((W, H)), rnd, style)
        file = f'synth-{name}.jpg'
        img.save(os.path.join(OUT, file), quality=82)
        for it in items:
            truth_rows.append({'sheet': file, 'q': it['q'], 'choice': it['truth']})
        manifest.append({
            'file': file, 'layout': layout, 'questions': n, 'options': options, 'style': style, 'student': student,
            'versionCode': version, 'handFont': os.path.basename(hand.font_path),
            'kinds': {k: sum(1 for it in items if it['kind'] == k) for k in ['clear', 'blank', 'crossed', 'multiple', 'lower', 'faint', 'offset']},
            'answers': items,
        })
        print(file, layout, n, style, os.path.basename(hand.font_path))

    with open(os.path.join(OUT, 'truth.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=['sheet', 'q', 'choice'])
        w.writeheader()
        w.writerows(truth_rows)
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print('done', len(manifest))


if __name__ == '__main__':
    main()
