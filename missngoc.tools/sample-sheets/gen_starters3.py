"""5 bài kiểm tra lớp Starters 3, kiểu "Your answers:" 10 câu, khớp đáp án B B C D A B C D A B.

Mỗi bài một tình huống: đúng hết, gạch xoá, điền thiếu, lẫn lộn, ca khó.
Xuất kèm: truth.csv (học sinh viết gì, cho npm run poc), dap-an.csv và hoc-sinh.csv (import vào app),
ket-qua-mong-doi.csv (điểm đúng phải ra).
"""
import csv
import os
import random
import sys
import unicodedata

from PIL import Image, ImageDraw

import gen_sheets as g

OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)

KEY = ['B', 'B', 'C', 'D', 'A', 'B', 'C', 'D', 'A', 'B']
# Câu hỏi trình độ Starters, đáp án đúng khớp KEY
QUESTIONS = [
    ('There ____ a cat on the mat.', ['are', 'is', 'am', 'be']),
    ('I have ____ orange in my bag.', ['a', 'an', 'the', 'two']),
    ('Look! The baby ____ .', ['sleep', 'sleeps', 'is sleeping', 'slept']),
    ('Which word is different?', ['red', 'blue', 'green', 'chair']),
    ('The book is ____ the table.', ['on', 'at', 'of', 'to']),
    ('How ____ apples are there?', ['much', 'many', 'any', 'some']),
    ('She ____ to school every day.', ['go', 'going', 'goes', 'gone']),
    ('They are waiting ____ the bus.', ['at', 'on', 'in', 'for']),
    ("It's cold. Put ____ your coat.", ['on', 'off', 'up', 'in']),
    ('My birthday is ____ May.', ['on', 'in', 'at', 'by']),
]


def c(q, letter=None):
    """Câu viết rõ; mặc định viết đúng đáp án"""
    return {'q': q, 'kind': 'clear', 'truth': letter or KEY[q - 1]}


# Tên hư cấu
STUDENTS = [
    {
        'code': 'S3-01', 'name': 'Nguyễn Minh Anh', 'style': 'scan',
        'case': 'Đúng hết, viết rõ',
        'items': [c(q) for q in range(1, 11)],
    },
    {
        'code': 'S3-02', 'name': 'Trần Gia Bảo', 'style': 'scan',
        'case': 'Gạch xoá rồi viết lại: câu 2 (A→B, đúng), câu 5 (A→C, sai), câu 9 (B→A, đúng)',
        'items': [c(1), {'q': 2, 'kind': 'crossed', 'old': 'A', 'truth': 'B'}, c(3), c(4),
                  {'q': 5, 'kind': 'crossed', 'old': 'A', 'truth': 'C'}, c(6), c(7), c(8),
                  {'q': 9, 'kind': 'crossed', 'old': 'B', 'truth': 'A'}, c(10)],
    },
    {
        'code': 'S3-03', 'name': 'Lê Khánh Linh', 'style': 'scan',
        'case': 'Điền thiếu: bỏ trống câu 3, 7, 10; câu 4 chọn sai (A)',
        'items': [c(1), c(2), {'q': 3, 'kind': 'blank', 'truth': ''}, c(4, 'A'), c(5), c(6),
                  {'q': 7, 'kind': 'blank', 'truth': ''}, c(8), c(9), {'q': 10, 'kind': 'blank', 'truth': ''}],
    },
    {
        'code': 'S3-04', 'name': 'Phạm Quốc Huy', 'style': 'photo',
        'case': 'Lẫn lộn: câu 1 chữ thường "b"; câu 3 gạch bỏ rồi để trống; câu 6 sai (C); câu 8 gạch C viết D; câu 10 bỏ trống',
        'items': [{'q': 1, 'kind': 'lower', 'truth': 'B'}, c(2), {'q': 3, 'kind': 'crossed_only', 'old': 'C', 'truth': ''},
                  c(4), c(5), c(6, 'C'), c(7), {'q': 8, 'kind': 'crossed', 'old': 'C', 'truth': 'D'}, c(9),
                  {'q': 10, 'kind': 'blank', 'truth': ''}],
    },
    {
        'code': 'S3-05', 'name': 'Võ Ngọc Hân', 'style': 'photo',
        'case': 'Ca khó: câu 2 ghi 2 chữ "B,C"; câu 4 chữ mờ; câu 6 lệch ô; câu 7 chữ thường "c"; câu 9 gạch A viết B (sai)',
        'items': [c(1), {'q': 2, 'kind': 'multiple', 'text': 'B,C', 'truth': ''}, c(3),
                  {'q': 4, 'kind': 'faint', 'truth': 'D'}, c(5), {'q': 6, 'kind': 'offset', 'truth': 'B'},
                  {'q': 7, 'kind': 'lower', 'truth': 'C'}, c(8), {'q': 9, 'kind': 'crossed', 'old': 'A', 'truth': 'B'}, c(10)],
    },
]

truth_rows, results = [], []
for i, st in enumerate(STUDENTS):
    rnd = random.Random(3000 + i)
    hand = g.Hand(rnd)
    if st['style'] == 'photo':
        hand.ink = (25, 25, 30)
    paper = Image.new('RGBA', (g.W, g.H), (255, 255, 255, 255))
    d = ImageDraw.Draw(paper)
    d.text((g.W / 2, 70), 'STARTERS 3 – UNIT TEST', font=g.font(g.PRINT_BOLD, 46), fill=(0, 0, 0), anchor='mt')
    lf = g.font(g.TIMES, 34)
    y = 160
    d.text((110, y), 'Họ và tên: ........................................................', font=lf, fill=(0, 0, 0))
    name_tile = Image.new('RGBA', (900, 90), (0, 0, 0, 0))
    ImageDraw.Draw(name_tile).text((0, 0), st['name'], font=g.font(g.NAME_FONT, 52), fill=hand.ink + (255,))
    paper.alpha_composite(name_tile.rotate(rnd.uniform(-2, 2)), (300, y - 22))
    d.text((1000, y), 'Lớp: ...........................', font=lf, fill=(0, 0, 0))
    hand.write(paper, (1090, y - 18, 1330, y + 40), 'Starters 3', size_mul=0.75)
    g.layout_your_answers(paper, d, rnd, hand, st['items'], y + 90, [10], questions=QUESTIONS)
    img = g.photograph(paper, rnd, st['style'])
    # Tên file có tên học sinh (không dấu) để dễ chọn đúng ảnh khi tải lên
    ascii_name = unicodedata.normalize('NFD', st['name'].replace('Đ', 'D').replace('đ', 'd')).encode('ascii', 'ignore').decode()
    case_slug = ["dung-het", "gach-xoa", "dien-thieu", "lan-lon", "ca-kho"][i]
    file = f"starters3-{i + 1:02d}-{ascii_name.lower().replace(' ', '-')}-{case_slug}.jpg"
    img.save(os.path.join(OUT, file), quality=85)

    correct = sum(1 for it in st['items'] if it['truth'] == KEY[it['q'] - 1])
    review = [it['q'] for it in st['items'] if it['kind'] in ('crossed', 'crossed_only', 'multiple', 'faint')]
    for it in st['items']:
        truth_rows.append({'sheet': file, 'q': it['q'], 'choice': it['truth']})
    results.append({
        'File ảnh': file, 'Mã HS': st['code'], 'Họ và tên': st['name'], 'Tình huống': st['case'],
        'Học sinh viết': ' '.join(f"{it['q']}:{it['truth'] or '–'}" for it in st['items']),
        'Số câu đúng': correct, 'Điểm (thang 10)': correct,
        'Câu nên vào màn hình duyệt': ', '.join(map(str, review)) or '—',
    })
    print(file, f'{correct}/10', st['case'])

with open(os.path.join(OUT, 'truth.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=['sheet', 'q', 'choice'])
    w.writeheader()
    w.writerows(truth_rows)
# File import vào app: utf-8-sig để Excel mở đúng tiếng Việt
with open(os.path.join(OUT, 'dap-an.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['Câu', 'Đáp án'])
    w.writerows([[q + 1, k] for q, k in enumerate(KEY)])
with open(os.path.join(OUT, 'hoc-sinh.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['Mã HS', 'Họ và tên', 'Ngày sinh', 'SĐT phụ huynh'])
    w.writerows([[st['code'], st['name'], '', ''] for st in STUDENTS])
with open(os.path.join(OUT, 'ket-qua-mong-doi.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=list(results[0].keys()))
    w.writeheader()
    w.writerows(results)
print('done')
