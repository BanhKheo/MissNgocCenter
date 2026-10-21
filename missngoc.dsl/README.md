# ExamDSL

Ngôn ngữ mô tả một bài kiểm tra của MissNgoc trong một file `.exam`: đề, đáp án, điểm từng phần, dải xếp loại và luật duyệt. Trình biên dịch kiểm tra file, sinh JSON đúng định dạng API của app, và chạy thử luật duyệt trên kết quả AI đọc. Thiết kế đầy đủ: [missngoc.docs/examdsl-design.md](../missngoc.docs/examdsl-design.md).

```text
exam "Kiểm tra Unit 5" {
  questions 20
  options   A B C D
  section Grammar   1-8    choice  score 3
  section "Từ vựng" 9-12   text    score 2
  section Reading   13-20  choice  score 5
  key {
    1-8    B A C D A B D C
    9      "eight hours" / "8 hours"
    10-12  "creativity" "water" "healthy"
    13-20  C D A B/D B A C D
  }
}
review {
  flag "AI không chắc" when answer.status in [unclear, multiple]
}
```

## Dùng trong app

`npm run dev` ở thư mục gốc chạy luôn service này (cổng 8010). Trong app: trang bài kiểm tra → **Soạn bằng ExamDSL**, hoặc Tạo bài kiểm tra → **Soạn bằng ExamDSL**. Máy trung tâm chạy service này bằng container `dsl` trong `deploy/docker-compose.yml`; Nginx chuyển `/dsl/` sang đây.

Phần dưới là cách dùng riêng, không cần app: dòng lệnh và trang soạn đề độc lập.

## Cài đặt

Cần Python 3.12 và Java 8+ (chỉ để sinh lại parser).

```bash
pip install -r requirements.txt
python tools/gen_parser.py        # chỉ khi sửa grammar/ExamDSL.g4; thư mục dsl/generated đã có sẵn
```

## Dùng

```bash
python cli.py check    examples/unit1-3.exam                     # báo lỗi, cảnh báo
python cli.py tokens   examples/starters3.exam                   # dãy token (pha từ vựng)
python cli.py ast      examples/starters3.exam                   # AST dạng JSON
python cli.py emit     examples/unit1-3.exam --out build/        # exam.json, keys/*.json, report.json, review.json
python cli.py simulate examples/unit5-demo.exam --sheets examples/sheets/unit5-demo.json
python run.py                                                     # trang soạn đề: http://127.0.0.1:8010
```

Đẩy đề vào app đang chạy (cần quyền `EXAM.AD`; thêm `--with-report` cần `SYS.AD`):

```bash
MISSNGOC_USER=admin MISSNGOC_PASSWORD=... python cli.py push examples/unit5-demo.exam \
  --api http://localhost:3000/api/v1 --class <id lớp> --date 2026-10-25 [--with-report] [--dry-run]
```

`--exam <id>` cập nhật bài đã có thay vì tạo bài mới. Chạy `simulate` trên bài thật (`data/manual-extractions/*.json`) thì thêm `--mask` để che họ tên.

## Kiểm thử

```bash
python -m unittest discover -s tests -v
```

- Mỗi file `examples/errors/<mã>.exam` phải báo đúng một chẩn đoán mang mã đó (41 file: 37 lỗi, 4 cảnh báo)
- Điểm từng câu, định dạng JSON gửi app, luật chết bị loại
- Bộ thông dịch: chuẩn hoá câu điền từ, sai chính tả là sai, chọn mã đề, sai tên, luật mặc định cho kết quả giống công thức của `scoring.service.ts`

## Cấu trúc

```text
grammar/ExamDSL.g4        grammar ANTLR 4.9.2
dsl/generated/            lexer, parser, visitor do ANTLR sinh (không sửa tay)
dsl/ast_nodes.py          AST
dsl/ast_builder.py        parse tree → AST
dsl/semantic.py           kiểm tra ngữ nghĩa, bảng ký hiệu, hệ thống kiểu của review
dsl/optimizer.py          tính sẵn điểm từng câu, gộp hằng, bỏ luật chết
dsl/codegen/              JSON cho API MissNgoc
dsl/interpreter.py        chấm điểm và chạy luật duyệt, làm đúng như app
dsl/domain.py             hằng số và hàm chép từ app (phải sửa cùng lúc nếu app đổi)
dsl/push.py               gọi REST API của app
server/, web/             trang soạn đề: báo lỗi khi gõ, xem đáp án, mô phỏng duyệt
```
