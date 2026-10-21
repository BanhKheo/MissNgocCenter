# ExamDSL: áp dụng DSL vào MissNgoc

Cập nhật: 21/10/2026 · Đồ án môn Nguyên lý ngôn ngữ lập trình · Phát triển từ mục "Ý tưởng đồ án DSL" trong [README](../README.md)

**Trạng thái:** đã cài đặt trong [missngoc.dsl/](../missngoc.dsl/README.md) (21/10/2026): đủ các pha từ lexer đến sinh mã, bộ thông dịch, lệnh `push` vào app và trang soạn đề trên web. 16 test qua, mỗi mã lỗi ở mục 7.1 có một file mẫu báo đúng mã đó. Đối chiếu với app trên 11 bài của lớp demo: điểm và trạng thái khớp cả 11 bài.

## Mục lục

- [1. Tóm tắt](#1-tóm-tắt)
- [2. Vấn đề cần giải](#2-vấn-đề-cần-giải)
- [3. Giải pháp tổng quan](#3-giải-pháp-tổng-quan)
- [4. Đặc tả ngôn ngữ](#4-đặc-tả-ngôn-ngữ)
- [5. Grammar ANTLR](#5-grammar-antlr)
- [6. AST](#6-ast)
- [7. Phân tích ngữ nghĩa](#7-phân-tích-ngữ-nghĩa)
- [8. Thông dịch: chấm điểm và luật duyệt](#8-thông-dịch-chấm-điểm-và-luật-duyệt)
- [9. Sinh mã và nối vào app](#9-sinh-mã-và-nối-vào-app)
- [10. Tối ưu](#10-tối-ưu)
- [11. Cấu trúc thư mục và lệnh](#11-cấu-trúc-thư-mục-và-lệnh)
- [12. Kế hoạch 6 tuần](#12-kế-hoạch-6-tuần)
- [13. Kiểm thử và kịch bản demo](#13-kiểm-thử-và-kịch-bản-demo)
- [14. Điều chỉnh so với ý tưởng ban đầu](#14-điều-chỉnh-so-với-ý-tưởng-ban-đầu)
- [15. Câu hỏi còn mở](#15-câu-hỏi-còn-mở)

## 1. Tóm tắt

ExamDSL là ngôn ngữ để admin mô tả **một bài kiểm tra** trong một file văn bản `.exam`. File gồm 3 khối:

- `exam`: số câu, các phần, đáp án từng mã đề
- `report`: dải điểm và màu của bảng điểm
- `review`: luật quyết định bài nào phải đưa người duyệt

Trình biên dịch viết bằng Python + ANTLR 4.9.2, theo đúng cấu trúc của DiagramDSL. Nó có 2 việc:

1. **Kiểm tra** file trước khi dùng: thiếu câu, sai số đáp án, chữ ngoài bộ lựa chọn, dải điểm không bao giờ đạt, tên trường viết sai…
2. **Xuất JSON** đúng định dạng API MissNgoc đang nhận, và **chạy** luật duyệt trên kết quả AI đọc thật để đo trước bao nhiêu bài sẽ phải duyệt.

Không phải sửa database hay backend để dùng được phần 1 và phần 2. Phần nối luật duyệt vào app là mở rộng, làm sau (mục 9.4).

## 2. Vấn đề cần giải

Các quy tắc của một bài kiểm tra hiện nằm rải rác ở 4 nơi. Lỗi trong đó chỉ lộ ra khi đã chấm xong.

| # | Vấn đề | Hiện nay nằm ở đâu | Hậu quả |
| --- | --- | --- | --- |
| P1 | Điểm từng câu chia đều thang điểm. Không khai báo được "phần Reading tính hệ số 2" | `defaultPoints` trong [scoring.ts:55](../missngoc.services/api/src/modules/grading/scoring.ts#L55). Tài liệu BA có bảng `exam_sections`, nhưng [schema.prisma](../missngoc.services/api/prisma/schema.prisma) chưa có bảng này | Muốn chia điểm theo phần thì phải tự tính điểm từng câu rồi điền tay vào cột Điểm của file Excel |
| P2 | Đề thi được mô tả ở 3 chỗ: form tạo bài (số câu, bộ lựa chọn, thang điểm), file Excel đáp án, và cột "loại câu" | `ExamCreateRequestDto`, `AnswerKeyPutRequestDto` trong [exam.dto.ts](../missngoc.services/api/src/modules/exams/dto/exam.dto.ts); `parseKeyAnswer` trong [answer-key.ts](../missngoc.webapp/packages/core/src/answer-key.ts) | Ba chỗ có thể lệch nhau, ví dụ form ghi 40 câu mà Excel có 41 dòng. Các kiểm tra (`missingQuestions`, `kindConflicts`) chỉ chạy lúc import, mỗi lần một mã đề |
| P3 | Luật "bài nào cần duyệt" viết cứng trong code | [scoring.service.ts:63-68](../missngoc.services/api/src/modules/grading/services/scoring.service.ts#L63-L68): `unresolved \|\| sub.nameMismatch \|\| !key` | Trên dữ liệu thật [grade10-CN.json](../missngoc.services/api/data/manual-extractions/grade10-CN.json), **27/30 bài (90%) bị đưa vào duyệt**: 73 câu `unclear`, 2 câu `multiple`. Mục tiêu trong BA là dưới 15%. Muốn thử luật khác thì phải sửa TypeScript, build lại image rồi cài lại |
| P4 | Dải điểm và màu là một khối JSON, chỉ có 1 mẫu `default` cho cả trung tâm | `ReportTemplateSchema` trong [report-template.ts](../missngoc.services/api/src/modules/reports/report-template.ts) | Khó đọc, khó dò lỗi. Ví dụ hai dải cùng ngưỡng thì dải sau không bao giờ được dùng, nhưng không có gì báo |

**Vì sao chọn DSL, không làm thêm form?** Một form chỉ kiểm tra được từng ô riêng lẻ. Các lỗi ở trên là lỗi **giữa các phần với nhau**: số đáp án so với độ dài khoảng câu, phần này đè lên phần kia, mã đề trong `key` so với `versions`, tên phần dùng trong `review`. Kiểm tra quan hệ giữa các khai báo chính là việc của bộ phân tích ngữ nghĩa (bài 8, 10). Ngoài ra, một file văn bản lưu được vào git, so sánh được giữa hai lần sửa và dùng lại được cho đề năm sau.

## 3. Giải pháp tổng quan

```text
            unit1-3.exam  (admin viết)
                  │
   ┌──────────────▼──────────────┐
   │ 1. Lexer        (ANTLR)     │  → token
   │ 2. Parser       (ANTLR)     │  → parse tree
   │ 3. ASTBuilder   (Visitor)   │  → AST (dataclass)
   │ 4. StaticChecker(Visitor)   │  → lỗi E1xx, cảnh báo W1xx, kèm dòng:cột
   │ 5. Optimizer                │  → AST đã gộp khoảng câu, tính sẵn điểm
   └──────┬───────────────┬──────┘
          │               │
   ┌──────▼──────┐  ┌─────▼──────────────────────────┐
   │ 6a. Codegen │  │ 6b. Interpreter                 │
   │ exam.json   │  │ đầu vào: JSON AI đọc            │
   │ keys/*.json │  │ (manual-extractions/*.json)     │
   │ report.json │  │ đầu ra: điểm, xếp loại, cờ duyệt│
   └──────┬──────┘  └─────────────────────────────────┘
          │ cli.py push (REST)
   ┌──────▼──────────────────────────────────┐
   │ MissNgoc API: POST /exams,              │
   │ PUT /exams/{id}/answer-keys/{mã đề},    │
   │ PUT /report-templates/default           │
   └─────────────────────────────────────────┘
```

Mỗi pha chỉ chạy khi pha trước không có lỗi, giống [compiler.py](../../DiagramDSL/dsl/compiler.py) của DiagramDSL. Nhánh 6a là phần "khai báo rồi sinh mã" (giống DiagramDSL). Nhánh 6b là phần "chạy luật" (giống WasteSortingDSL). ExamDSL làm cả hai, và có thêm hệ thống kiểu cho biểu thức trong `review`.

## 4. Đặc tả ngôn ngữ

### 4.1 Ví dụ đầy đủ

Đề Unit 1–3: 41 câu, câu 5–8 và 18–21 là điền từ, có 2 mã đề. Đáp án dưới đây chỉ để minh hoạ.

```text
// unit1-3.exam
exam "Kiểm tra Unit 1-3" {
  questions 41
  options   A B C D
  max       10
  versions  101 102
  layout    "2 trang, câu 1-21 trang 1, câu 22-41 trang 2"

  section Grammar   1-4, 9-17    choice
  section "Từ vựng" 5-8, 18-21   text
  section Reading   22-41        choice  weight 2

  key 101 {
    1-4    A C B D
    5      "eight hours" / "8 hours"
    6      "beautiful"
    7      "went"
    8      "library"
    9-17   B A D C C A B D A
    18     "has lived"
    19     "interesting"
    20     "were playing"
    21     "carefully"
    22-31  C A B D A C B B D A
    32-41  A D C B/C A B D C A B     // câu 35 đề lỗi: B hoặc C đều đúng
  }

  key 102 {
    // ... đủ 41 câu, cùng loại câu với mã 101
  }
}

report {
  title   "BẢNG ĐIỂM {className} – {examTitle}"
  columns stt studentCode fullName versionCode correctCount score rank note

  style header      fill #1F4E78 font #FFFFFF
  style wrongCell   fill #FFC7CE font #9C0006

  band "Giỏi"        >= 8    fill #C6EFCE font #006100
  band "Khá"         >= 6.5  fill #DDEBF7 font #1F4E78
  band "Trung bình"  >= 5    fill #FFEB9C font #9C5700
  band "Cần cố gắng" else    fill #FFC7CE font #9C0006
}

review {
  flag "AI không chắc"   when answer.status in [unclear, multiple]
  flag "Tên không khớp"  when submission.nameMismatch
  flag "Không rõ mã đề"  when not submission.versionKnown
  flag "Bỏ trống nhiều"  when count(answer.status == blank) > 10
}
```

### 4.2 Ý nghĩa từng câu lệnh

| Câu lệnh | Bắt buộc | Ý nghĩa | Ứng với trong app |
| --- | --- | --- | --- |
| `exam "<tên>" { … }` | Có | Một bài kiểm tra | `Exam.title` |
| `questions N` | Có | Câu đánh số 1..N, với 1 ≤ N ≤ 200 | `Exam.questionCount` |
| `options A B C D` | Có | Chỉ nhận `A B C D` hoặc `A B C D E` | `Exam.options` (`ABCD` / `ABCDE`) |
| `max X` | Không, mặc định 10 | Thang điểm, từ 1 đến 1000 | `Exam.maxScore` |
| `versions c1 c2 …` | Không | Các mã đề. Không ghi thì bài có 1 mã đề chung | `AnswerKey.versionCode` (mã chung là `""`, trên URL viết `_`) |
| `layout "<chuỗi>"` | Không | Gợi ý bố cục cho AI, tối đa 300 ký tự | `Exam.layoutHint` |
| `section <tên> <các khoảng> <loại>? (weight X \| score X)?` | Không | Một phần của đề. Loại là `choice` (mặc định) hoặc `text`. `weight` là hệ số mỗi câu, `score` là tổng điểm của phần | Không có bảng riêng: compiler quy đổi thành `kind` và `points` của từng câu |
| `key <mã đề>? { <khoảng> <đáp án>+ … }` | Có | Đáp án của một mã đề. Bài 1 mã đề thì bỏ mã | `AnswerKeyItem` |
| Đáp án trắc nghiệm `B` hoặc `B/C` | | `/` nghĩa là "hoặc": nhiều đáp án cùng đúng | `kind: choice`, `correct: ["B","C"]` |
| Đáp án điền từ `"8 hours" / "eight hours"` | | Các cách viết được chấp nhận | `kind: text`, `correct: [...]` |
| `report { … }` | Không | Mẫu bảng điểm | `ReportTemplateConfig` |
| `band "<nhãn>" (>= X \| else) fill #RRGGBB font #RRGGBB?` | | Dải xếp loại theo **thang 10**. Bài thang khác được quy đổi tỉ lệ, giống `bandFor` | `scoreBands[]` |
| `review { flag "<lý do>"? when <biểu thức> … }` | Không | Bài có ít nhất 1 cờ thì vào trạng thái Cần duyệt | Thay cho dòng `needsReview = …` ở P3 |

Một khoảng câu viết là `5-8`, nhiều khoảng ngăn bằng dấu phẩy: `1-4, 9-17`. Tên phần là một từ ASCII (`Grammar`) hoặc một chuỗi có dấu (`"Từ vựng"`). Chú thích bắt đầu bằng `//`.

### 4.3 Quy tắc tính điểm từng câu

Compiler tính sẵn điểm từng câu. App chỉ nhận con số cuối cùng, nên không phải sửa backend.

- **Dùng `weight`** (hoặc không ghi gì, khi đó hệ số là 1): `điểm câu q = max × w(q) / Σ w`, với `w(q)` là hệ số của phần chứa câu q.
  Với ví dụ trên: Σ w = 13×1 + 8×1 + 20×2 = 61. Câu hệ số 1 được 10/61 ≈ 0,164 điểm; câu Reading được 0,328 điểm.
- **Dùng `score`**: `điểm câu q = score(phần) / số câu của phần`. Ví dụ `section Reading 22-41 score 5` cho mỗi câu 0,25 điểm. Đã dùng `score` thì mọi phần đều phải dùng, và tổng các `score` phải bằng `max` (lỗi E116).
- Điểm làm tròn 3 chữ số, vì cột `points` là `Decimal(6,3)`. Nếu tổng điểm sau làm tròn lệch `max` từ 0,005 trở lên thì báo cảnh báo W117. Ví dụ trên tổng 10,004 nên không báo, và bài làm đúng hết vẫn ra 10 sau `roundScore`.

### 4.4 Biểu thức trong `review`

Mỗi luật là `flag "<lý do>" when <biểu thức kiểu bool>`. Luật nào nhắc tới `answer.*` (ngoài `count(...)`) là **luật theo câu**: nó chạy trên từng câu và gắn cờ cho câu đó. Các luật còn lại là **luật theo bài**: chạy một lần mỗi bài.

| Tên | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `answer.q` | int | Số câu |
| `answer.status` | Status | `clear`, `blank`, `multiple`, `unclear`, như [domain.ts](../missngoc.webapp/packages/core/src/domain.ts) |
| `answer.kind` | Kind | `choice` hoặc `text` |
| `answer.section` | Section | Một tên phần đã khai báo trong `exam` |
| `answer.choice` | string? | Chữ cái hoặc chữ AI đọc được, `none` nếu trống |
| `answer.correct` | bool | Câu đúng hay sai sau khi so với đáp án |
| `answer.points` | number | Điểm của câu |
| `submission.nameMismatch` | bool | Tên đọc trên bài khác tên học sinh |
| `submission.versionKnown` | bool | Đã xác định được mã đề của bài |
| `submission.score` | number | Điểm của bài, theo thang `max` |
| `count(<bool theo câu>)` | int | Số câu thoả điều kiện |

Toán tử, xếp từ ưu tiên cao xuống thấp: `( )`, so sánh `< <= > >= == !=`, `in [ … ]`, `not`, `and`, `or`. Hằng: số, chuỗi, `true`, `false`, `none`.

**Không có khối `review` thì compiler dùng luật mặc định.** Luật mặc định làm đúng như app hiện nay, nên chỉ thêm DSL vào thì app không đổi hành vi:

```text
review {
  flag "AI không chắc"  when answer.status in [unclear, multiple]
  flag "Tên không khớp" when submission.nameMismatch
  flag "Không rõ mã đề" when not submission.versionKnown
}
```

## 5. Grammar ANTLR

Bản nháp, dùng ANTLR 4.9.2 (cùng bản với `DiagramDSL/tools/antlr-4.9.2-complete.jar`), target Python 3.

```antlr
grammar ExamDSL;

program     : exam report? review? EOF ;

// ───────── exam ─────────
exam        : EXAM STRING LBRACE examStmt* RBRACE ;
examStmt    : QUESTIONS INT                                   # questionsStmt
            | OPTIONS LETTER+                                 # optionsStmt
            | MAX number                                      # maxStmt
            | VERSIONS code+                                  # versionsStmt
            | LAYOUT STRING                                   # layoutStmt
            | SECTION name ranges kind? sectionMod?           # sectionStmt
            | KEY code? LBRACE keyEntry* RBRACE               # keyStmt
            ;
kind        : CHOICE | TEXT ;
sectionMod  : WEIGHT number | SCORE number ;
ranges      : qrange (COMMA qrange)* ;
qrange      : INT (DASH INT)? ;          // không đặt tên "range": trùng hàm của Python
keyEntry    : qrange answer+ ;
answer      : LETTER (SLASH LETTER)*                          # choiceAnswer
            | STRING (SLASH STRING)*                          # textAnswer
            ;
code        : INT | ID | LETTER ;
name        : ID | STRING ;

// ───────── report ─────────
report      : REPORT LBRACE reportStmt* RBRACE ;
reportStmt  : TITLE STRING                                    # titleStmt
            | COLUMNS field+                                  # columnsStmt   // field: cột "score" trùng từ khoá
            | STYLE ID style                                  # styleStmt
            | BAND STRING (GE number | ELSE) style            # bandStmt
            ;
style       : FILL COLOR (FONT COLOR)? ;

// ───────── review ─────────
review      : REVIEW LBRACE flagRule* RBRACE ;
flagRule    : FLAG STRING? WHEN expr ;   // không đặt tên "rule": trùng thuộc tính của runtime ANTLR
expr        : LPAREN expr RPAREN                              # parenExpr
            | COUNT LPAREN expr RPAREN                        # countExpr
            | expr op=(LT | LE | GT | GE | EQ | NE) expr      # cmpExpr
            | expr IN LBRACK expr (COMMA expr)* RBRACK        # inExpr
            | NOT expr                                        # notExpr
            | expr AND expr                                   # andExpr
            | expr OR expr                                    # orExpr
            | ref                                             # refExpr
            | (CHOICE | TEXT)                                 # kindExpr      // answer.kind == text
            | number                                          # numExpr
            | STRING                                          # strExpr
            | (TRUE | FALSE | NONE)                           # litExpr
            ;
ref         : ID (DOT field)? ;
field       : ID | CHOICE | TEXT | SCORE | SECTION ;   // từ khoá vẫn được dùng làm tên trường
number      : INT | FLOAT ;

// ───────── lexer: từ khoá phải đứng trước ID ─────────
EXAM: 'exam'; QUESTIONS: 'questions'; OPTIONS: 'options'; MAX: 'max';
VERSIONS: 'versions'; LAYOUT: 'layout'; SECTION: 'section'; KEY: 'key';
CHOICE: 'choice'; TEXT: 'text'; WEIGHT: 'weight'; SCORE: 'score';
REPORT: 'report'; TITLE: 'title'; COLUMNS: 'columns'; STYLE: 'style';
BAND: 'band'; ELSE: 'else'; FILL: 'fill'; FONT: 'font';
REVIEW: 'review'; FLAG: 'flag'; WHEN: 'when'; COUNT: 'count';
AND: 'and'; OR: 'or'; NOT: 'not'; IN: 'in';
TRUE: 'true'; FALSE: 'false'; NONE: 'none';

LE: '<='; GE: '>='; EQ: '=='; NE: '!='; LT: '<'; GT: '>';
LBRACE: '{'; RBRACE: '}'; LPAREN: '('; RPAREN: ')'; LBRACK: '['; RBRACK: ']';
COMMA: ','; DASH: '-'; SLASH: '/'; DOT: '.';

STRING  : '"' (~["\\\r\n] | '\\' .)* '"' ;
UNCLOSED_STRING : '"' (~["\\\r\n] | '\\' .)* ;   // thiếu dấu " đóng → lỗi từ vựng có vị trí
COLOR   : '#' [0-9a-fA-F]+ ;          // độ dài kiểm tra ở pha ngữ nghĩa, để báo lỗi dễ hiểu
FLOAT   : [0-9]+ '.' [0-9]+ ;
INT     : [0-9]+ ;
LETTER  : [A-E] ;                      // đứng trước ID: "A" là chữ cái lựa chọn, không phải tên
ID      : [a-zA-Z_] [a-zA-Z0-9_]* ;
COMMENT : '//' ~[\r\n]* -> skip ;
WS      : [ \t\r\n]+ -> skip ;
ERROR_CHAR : . ;                       // ký tự lạ → lỗi từ vựng có vị trí, không làm sập lexer
```

Mấy điểm trong grammar đáng đưa vào báo cáo:

- **Xung đột `LETTER` / `ID`:** chuỗi `A` khớp cả hai luật với cùng độ dài. ANTLR chọn luật khai báo trước, nên `LETTER` phải đứng trước `ID`. Hệ quả là không đặt được tên phần là `A`…`E`. Chuỗi `F` thành `ID`, nên `1-4 A C F D` là **lỗi cú pháp** chứ không phải lỗi ngữ nghĩa. Còn `E` khi `options A B C D` là lỗi ngữ nghĩa E125. Đây là ví dụ hay cho câu hỏi "lỗi này do pha nào bắt".
- **Từ khoá theo ngữ cảnh:** `score`, `choice`, `text`, `section` là từ khoá nhưng cũng là tên trường (`submission.score`). Luật `field` cho phép chúng đứng sau dấu chấm.
- **Độ ưu tiên toán tử:** ANTLR 4 xếp các nhánh đệ quy trái theo thứ tự khai báo, nhánh viết trước ưu tiên cao hơn. Thứ tự `cmp` → `in` → `not` → `and` → `or` cho kết quả `not a == b` là `not (a == b)`, giống Python.
- **Tên luật không được trùng tên trong target:** ANTLR 4.9.2 với target Python từ chối luật tên `range` hoặc `rule` (error 134), nên grammar dùng `qrange` và `flagRule`.
- Đọc file bằng `FileStream(path, encoding="utf-8")` để chuỗi tiếng Việt không bị lỗi. Tên (`ID`) chỉ nhận ASCII; tên có dấu thì viết trong ngoặc kép.

## 6. AST

Các dataclass, mỗi node có `span` (dòng, cột) để báo lỗi, giống [ast_nodes.py](../../DiagramDSL/dsl/ast_nodes.py):

```text
Program(exam: Exam, report: Report | None, review: Review | None)
Exam(title, questions: int | None, options: list[str] | None, max: float,
     versions: list[str], layout: str | None, sections: list[Section], keys: list[Key])
Section(name, ranges: list[Range], kind: 'choice' | 'text', weight: float | None, score: float | None)
Range(start: int, end: int)
Key(version: str | None, entries: list[KeyEntry])
KeyEntry(range: Range, answers: list[Answer])
Answer(kind: 'choice' | 'text', values: list[str])
Report(title, columns: list[str] | None, styles: dict[str, Style], bands: list[Band])
Band(label, min: float | None /* None = else */, style: Style)
Style(fill: str, font: str | None)
Review(rules: list[Rule])
Rule(message: str | None, cond: Expr, scope: 'answer' | 'submission' /* gán ở pha ngữ nghĩa */)
Expr = Binary(op, l, r) | Not(e) | In(e, items) | Count(e) | Ref(obj, field) | Name(id) | Lit(value)
```

`ASTBuilder` kế thừa `ExamDSLVisitor` do ANTLR sinh. Nó trả về các node trên, không giữ lại parse tree.

## 7. Phân tích ngữ nghĩa

`StaticChecker` duyệt AST theo mẫu Visitor (bài 11) và dùng các bảng ký hiệu lồng nhau:

```text
program scope
 ├─ sections   : Grammar, "Từ vựng", Reading       ← khai báo trong exam
 ├─ versions   : 101, 102
 ├─ columns    : stt, studentCode, …               ← cố định, lấy từ REPORT_COLUMNS
 ├─ styles     : header, wrongCell, blankCell, needsReviewRow
 └─ review scope
      ├─ answer.*      : q, status, kind, section, choice, correct, points
      ├─ submission.*  : nameMismatch, versionKnown, score
      └─ enum values   : clear, blank, multiple, unclear, choice, text
```

Bộ kiểm tra chạy **2 lượt** như DiagramDSL. Lượt 1 khai báo mọi tên phần và mã đề. Lượt 2 kiểm tra từng chỗ dùng tên. Nhờ vậy `key` viết trước `section` vẫn hợp lệ. Tên sai được gợi ý bằng `difflib.get_close_matches`, ví dụ "Có phải ý bạn là `status`?".

### 7.1 Danh sách lỗi

Mã E là lỗi (không sinh mã), mã W là cảnh báo. Mỗi mã có một file mẫu trong `examples/errors/` để làm test (mục 13).

| Mã | Ví dụ sai | Thông báo |
| --- | --- | --- |
| **Từ vựng và cú pháp** | | |
| E001 | `@` ở cuối file | Ký tự không hợp lệ '@' |
| E002 | `exam "Kiểm tra {` | Chuỗi chưa đóng: thêm dấu " ở cuối |
| E100 | `1-4 A C F D` | 'F' không phải lựa chọn hợp lệ: chỉ dùng các chữ cái A–E |
| **Khai báo đề** | | |
| E101 | Không có `questions` | Thiếu `questions`: bài kiểm tra phải có số câu |
| E102 | `questions 41` viết 2 lần | `questions` đã khai báo ở dòng 2 |
| E103 | `options A B C` | Bộ lựa chọn phải là `A B C D` hoặc `A B C D E` |
| E104 | `questions 250`, `max 0`, `layout` dài 400 ký tự | Số câu từ 1 đến 200 / thang điểm từ 1 đến 1000 / layout tối đa 300 ký tự |
| **Phần và khoảng câu** | | |
| E110 | `9-5` | Khoảng câu bị ngược: 9 lớn hơn 5 |
| E111 | `section Reading 22-45` khi có 41 câu | Câu 42–45 vượt quá số câu (41) |
| E112 | Câu 8 có ở cả `Grammar` và `"Từ vựng"` | Câu 8 thuộc 2 phần: Grammar (dòng 8) và Từ vựng (dòng 9) |
| W113 | Câu 23 không thuộc phần nào | Câu 23 không thuộc phần nào; tính là trắc nghiệm, hệ số 1 |
| E114 | Hai phần cùng tên `Grammar` | Phần `Grammar` đã khai báo ở dòng 8 |
| E115 | Phần này dùng `weight`, phần khác dùng `score` | Không trộn `weight` và `score` trong cùng một bài |
| E116 | Tổng các `score` là 9,5 trong khi `max 10` | Tổng điểm các phần (9,5) khác thang điểm (10) |
| W117 | Tổng điểm sau làm tròn là 9,99 | Tổng điểm các câu sau làm tròn là 9,99, lệch 0,01 so với `max` |
| E118 | `section Grammar 1-4 weight 0` | Hệ số của phần `Grammar` phải lớn hơn 0 |
| **Đáp án** | | |
| E120 | `key 103` khi `versions 101 102` | Mã đề `103` chưa khai báo trong `versions`. Có phải ý bạn là `102`? |
| E121 | Có `versions 101 102` nhưng thiếu `key 102` | Mã đề 102 chưa có đáp án |
| E122 | `1-4 A C B` | Khoảng 1-4 có 4 câu nhưng chỉ có 3 đáp án |
| E123 | Câu 12 ghi 2 lần trong `key 101` | Câu 12 đã có đáp án ở dòng 15 |
| E124 | `key 102` không có câu 30–31 | Mã đề 102 thiếu câu 30-31 (thay cho `missingQuestions`) |
| E125 | `E` khi `options A B C D` | `E` không thuộc bộ lựa chọn A B C D |
| E126 | Câu 6 thuộc phần `text` mà đáp án là `B` | Câu 6 là câu điền từ, đáp án phải là chuỗi. Nếu đáp án đúng là chữ "b", hãy viết `"b"` |
| E127 | Câu 22 thuộc phần `choice` mà đáp án là `"went"` | Câu 22 là câu trắc nghiệm, đáp án phải là chữ cái |
| E128 | Đáp án điền từ dài hơn 100 ký tự, hoặc có hơn 10 cách viết | Theo giới hạn của `AnswerKeyItemDto` |
| E129 | Hai khối `key` cho cùng một mã đề | Mã đề 101 đã có đáp án ở dòng 12 |
| **Bảng điểm** | | |
| E130 | `band "Khá" >= 8` ngay sau `band "Giỏi" >= 8` | Dải "Khá" không bao giờ đạt được: ngưỡng phải giảm dần |
| E131 | `band "Giỏi" >= 80` | Ngưỡng tính theo thang 10, phải nằm trong 0–10 |
| E132 | `fill #C6EFC` | Màu phải có dạng #RRGGBB (6 chữ số hex) |
| E133 | Không có dải `else`, hoặc `else` không đứng cuối | Phải có đúng 1 dải `else`, đặt cuối cùng |
| E134 | `columns stt fulname` | Không có cột `fulname`. Có phải ý bạn là `fullName`? |
| E135 | 9 dải, hoặc nhãn dài hơn 30 ký tự | Tối đa 8 dải, nhãn tối đa 30 ký tự (theo `ReportTemplateSchema`) |
| E136 | `style headr fill …` | Không có kiểu `headr`. Có phải ý bạn là `header`? |
| **Luật duyệt** | | |
| E140 | `answer.statu` | `answer` không có trường `statu`. Có phải ý bạn là `status`? |
| E141 | `answer.status == 3`, `submission.score and true` | Không so sánh được Status với số / `and` cần hai vế kiểu bool |
| E142 | `answer.status in [unclear, multiplee]` | `multiplee` không phải trạng thái. Có phải ý bạn là `multiple`? |
| E143 | `answer.section == Readng` | Không có phần `Readng`. Có phải ý bạn là `Reading`? |
| E144 | `count(submission.nameMismatch)` | `count` đếm theo từng câu, nên điều kiện bên trong phải có `answer.*` |
| E145 | `flag when answer.choice` | Điều kiện của `flag` phải có kiểu bool, ở đây là string? |
| W146 | `flag when 1 > 2` | Luật luôn sai, không bao giờ gắn cờ (phát hiện nhờ gộp hằng, mục 10) |
| W147 | `flag when true` | Luật luôn đúng: mọi bài đều bị gắn cờ |

**Một lỗi được loại bỏ ngay từ thiết kế:** app đang có `kindConflicts` để bắt trường hợp "câu 6 là điền từ ở mã 101 nhưng là trắc nghiệm ở mã 102". Trong ExamDSL, loại câu khai báo ở `section`, dùng chung cho mọi mã đề, nên lỗi này không viết ra được. Kiểm tra E126/E127 thay thế nó.

### 7.2 Hệ thống kiểu cho `review`

Kiểu gồm `int`, `number`, `bool`, `string`, `string?` (có thể là `none`), và 3 kiểu liệt kê: `Status`, `Kind`, `Section`. Luật suy kiểu chính:

- `int` dùng được ở chỗ cần `number`. So sánh `< <= > >=` chỉ cho số.
- `==` / `!=` cần hai vế cùng kiểu. `none` so được với `string?`.
- Một tên đứng một mình (`unclear`, `Reading`) không có kiểu cố định. Kiểu của nó **lấy theo vế bên kia**: so với `answer.status` thì tra trong Status; so với `answer.section` thì tra trong bảng tên phần. Đây là ví dụ cụ thể cho ràng buộc tên phụ thuộc ngữ cảnh (bài 10).
- `count(e)` cần `e` kiểu bool và có `answer.*`, kết quả kiểu `int`.
- Phạm vi của luật (`answer` hay `submission`) được gán ở pha này rồi ghi vào `Rule.scope` cho bộ thông dịch.

## 8. Thông dịch: chấm điểm và luật duyệt

Bộ thông dịch chạy trên **JSON AI đọc được**, đúng định dạng các file trong [data/manual-extractions/](../missngoc.services/api/data/manual-extractions/). Với mỗi bài:

1. **Chuẩn hoá** câu trả lời như `normalizeSheet`: `"-"` và `""` thành `none`, câu `multiple` thì không tính lựa chọn.
2. **Chọn mã đề** như `grading.processor.ts`: chỉ có 1 bộ đáp án thì dùng bộ đó; có nhiều bộ thì dùng `versionCodeRead` nếu khớp một mã đã khai báo, không khớp thì `versionKnown = false`.
3. **Chấm điểm** giống `scoreSubmission` và `isAnswerCorrect`. Câu điền từ so sau khi chuẩn hoá giống `normalizeTextAnswer` trong [answer-key.ts](../missngoc.webapp/packages/core/src/answer-key.ts): NFC, đổi dấu nháy cong thành nháy thẳng, bỏ ngoặc kép, chữ thường, gom khoảng trắng, bỏ dấu câu ở cuối. Bản Python phải giống từng bước, nếu không điểm sẽ lệch với app.
4. **Chạy luật duyệt.** Luật theo câu chạy trên từng câu, luật theo bài chạy một lần. `count(...)` được tính một lần mỗi bài rồi dùng lại.
5. **Xếp loại** bằng `band`, quy đổi về thang 10 như `bandFor`.

Kết quả của mỗi bài:

```json
{
  "student": "HS 05",
  "version": "220",
  "score": 6.75,
  "band": "Khá",
  "status": "NEEDS_REVIEW",
  "flags": [
    { "rule": "AI không chắc", "q": 14 },
    { "rule": "AI không chắc", "q": 27 }
  ]
}
```

Lệnh `simulate` in thêm bảng tổng hợp: số bài cần duyệt, số câu bị gắn cờ theo từng luật. Đây là chỗ giải P3. Admin sửa luật trong file, chạy lại trên 30 bài thật, và thấy ngay tỉ lệ phải duyệt thay đổi thế nào, không phải sửa code app.

Lưu ý khi chỉnh luật: BA yêu cầu điểm sau duyệt đúng 100%. Bỏ cờ `unclear` thì ít bài phải duyệt hơn, nhưng câu AI đọc sai có thể lọt thẳng vào bảng điểm. Vì vậy `simulate` nên in cả 2 con số: số bài phải duyệt, và **số câu `unclear` không còn bị gắn cờ**. Người chỉnh luật thấy mình đang đánh đổi cái gì.

## 9. Sinh mã và nối vào app

Codegen tạo các file JSON khớp từng trường với DTO hiện có. Không cần endpoint mới.

### 9.1 `exam.json` → `POST /api/v1/exams`

```json
{
  "title": "Kiểm tra Unit 1-3",
  "questionCount": 41,
  "options": "ABCD",
  "maxScore": 10,
  "layoutHint": "2 trang, câu 1-21 trang 1, câu 22-41 trang 2"
}
```

`classId` và `examDate` không nằm trong file `.exam`: đề dùng lại cho nhiều lớp nên hai trường này truyền qua tham số của lệnh `push`.

### 9.2 `keys/101.json` → `PUT /api/v1/exams/{id}/answer-keys/101`

Mỗi mã đề một file. Mã đề chung thì URL dùng `_`. Body đúng dạng `AnswerKeyPutRequestDto`:

```json
{
  "items": [
    { "q": 1,  "kind": "choice", "correct": ["A"],                     "points": 0.164 },
    { "q": 5,  "kind": "text",   "correct": ["eight hours", "8 hours"], "points": 0.164 },
    { "q": 22, "kind": "choice", "correct": ["C"],                     "points": 0.328 },
    { "q": 35, "kind": "choice", "correct": ["B", "C"],                "points": 0.328 }
  ]
}
```

Endpoint PUT là idempotent: push lại sau khi sửa đáp án chỉ ghi đè, và app tự chấm lại (UC-13) mà không gọi lại AI.

### 9.3 `report.json` → `PUT /api/v1/report-templates/default`

Đầu ra là một `ReportTemplateConfig` đầy đủ. Trường nào file không ghi thì lấy từ `DEFAULT_REPORT_TEMPLATE`. `band … else` thành `min: 0`. Nếu có `font` thì dùng, không có thì mặc định `#000000`. Trước khi ghi file, codegen kiểm tra lại đầu ra bằng chính `ReportTemplateSchema` (gọi qua một script Node nhỏ, hoặc chép schema sang `pydantic`). Như vậy compiler không bao giờ sinh ra thứ app từ chối.

Hạn chế: app chỉ có **1 mẫu bảng điểm dùng chung cho cả trung tâm**. Push khối `report` của một đề sẽ đổi màu bảng điểm của mọi đề. Lệnh `push` chỉ gửi `report` khi có cờ `--with-report`.

### 9.4 Prompt AI và luật duyệt

- **Prompt:** `buildPrompt` trong [prompt.ts](../missngoc.services/api/src/modules/grading/engines/prompt.ts) đã tự lấy danh sách câu điền từ và các mã đề từ đáp án. Vì vậy DSL chỉ cần sinh `layoutHint` (9.1). Các phần còn lại của prompt đổi theo, vì `kind` của từng câu đến từ `section`.
- **Luật duyệt:** codegen xuất thêm `review.json`, là AST của các luật dưới dạng JSON. Bản đầu, chỉ bộ thông dịch Python dùng file này. **Mở rộng (không bắt buộc cho đồ án):** viết một hàm TypeScript khoảng 60 dòng đánh giá `review.json`, thay cho dòng `needsReview = unresolved || sub.nameMismatch || !key` trong `scoring.service.ts`. Cần thêm một cột `reviewRules Json?` trên bảng `exams`. Khi đó app duyệt bài theo đúng luật admin viết.

### 9.5 Lệnh `push`

```text
python cli.py push examples/unit1-3.exam --api http://localhost/api/v1 \
       --class <classId> --date 2026-10-25 [--with-report] [--dry-run]
```

1. Biên dịch file. Có lỗi thì in lỗi và dừng.
2. Đăng nhập bằng `POST /auth/login` (username và mật khẩu đọc từ biến môi trường), lấy `accessToken`.
3. Gọi `POST /exams`, lấy `id` của bài vừa tạo. Nếu truyền `--exam <id>` thì bỏ bước này và chỉ cập nhật đáp án.
4. Gọi `PUT /exams/{id}/answer-keys/{mã}` cho từng mã đề.
5. Có `--with-report` thì gọi `PUT /report-templates/default`.

`--dry-run` chỉ in các request sẽ gửi. Tài khoản dùng để push phải có quyền `EXAM.AD`, và `SYS.AD` nếu gửi cả `report`.

### 9.6 Trang Soạn đề trong app (đã làm)

Trình biên dịch Python chạy thành service `dsl` (cổng 8010). Vite (máy dev) và Nginx (máy trung tâm) chuyển `/dsl/` sang service đó, nên app chỉ có một địa chỉ và một lần đăng nhập.

| Lối vào | Làm gì |
| --- | --- |
| Trang bài kiểm tra → **Soạn bằng ExamDSL** (`/exams/:id/dsl`) | Mở mã nguồn đã lưu. Bài chưa từng soạn bằng ExamDSL thì dựng file từ đáp án đang có, gom câu cùng loại, cùng điểm thành phần (`score`), nên lưu lại không làm đổi điểm |
| Tạo bài kiểm tra → **Soạn bằng ExamDSL** (`/exams/new/dsl`) | Lớp, ngày, loại bài chọn ở đầu trang (không nằm trong file `.exam`); nút **Tạo bài kiểm tra** tạo bài, ghi đáp án, lưu mã nguồn |

Nút **Lưu vào bài kiểm tra** gọi API của app bằng phiên đăng nhập đang có, không cần lệnh `push`: `PATCH /exams/{id}`, `PUT /exams/{id}/answer-keys/{mã}` cho từng mã đề, xoá đáp án các mã đề không còn trong file, `PUT /report-templates/default` khi tick "Cập nhật cả mẫu bảng điểm", rồi `PUT /exams/{id}/dsl` lưu mã nguồn (cột `exams.dsl_source`). Bài đã có điểm thì hỏi lại trước khi lưu, vì điểm sẽ tính lại theo đáp án mới. Tab **Mô phỏng duyệt** lấy kết quả AI đọc của chính bài đó (`GET /exams/{id}/dsl/sheets`) để chạy luật trong file.

## 10. Tối ưu

Các phép tối ưu ở đây nhỏ, nhưng có tác dụng thật và minh hoạ được bài 13:

| Phép tối ưu | Áp dụng ở đâu |
| --- | --- |
| Gộp hằng (constant folding) | Điểm từng câu được tính một lần lúc biên dịch (4.3), không tính lại mỗi lần chấm. Trong `review`, `1 > 2` gộp thành `false`, từ đó phát hiện W146 |
| Loại mã chết | Luật luôn sai bị bỏ khỏi `review.json`. Trong `a and false`, cả biểu thức gộp thành `false` |
| Rút gọn biểu diễn | Các khoảng liền nhau `1-4, 5-8` gộp thành `1-8`. Khoảng câu in lại trong thông báo lỗi và `layoutHint` theo cách `formatQuestionRanges` đang làm |
| Dùng lại biểu thức con | Mỗi `count(...)` tính một lần cho mỗi bài, kể cả khi nhiều luật dùng chung |
| Đánh giá ngắn mạch | `and` / `or` dừng ngay khi biết kết quả. Luật theo bài chạy trước, để bài đã có cờ thì không phải duyệt từng câu (khi chỉ cần biết bài có cần duyệt hay không) |

## 11. Cấu trúc thư mục và lệnh

```text
missngoc.dsl/
├─ grammar/ExamDSL.g4
├─ tools/antlr-4.9.2-complete.jar, gen_parser.py     chép từ DiagramDSL
├─ dsl/
│  ├─ generated/                                     do ANTLR sinh, không sửa tay
│  ├─ ast_nodes.py, ast_builder.py
│  ├─ errors.py                                      Diagnostic, SyntaxErrorCollector (theo DiagramDSL)
│  ├─ semantic.py                                    StaticChecker + bảng ký hiệu + kiểu
│  ├─ optimizer.py
│  ├─ interpreter.py                                 chấm điểm + luật duyệt
│  ├─ codegen/ exam_json.py, answer_keys.py, report.py, review_json.py
│  └─ compiler.py                                    nối các pha, trả CompileResult
├─ server/app.py                                     FastAPI: /api/compile, /api/simulate
├─ web/                                              trình soạn thảo báo lỗi khi gõ, sửa từ DiagramDSL/web
├─ examples/
│  ├─ unit1-3.exam, grade10-cn.exam
│  └─ errors/E101.exam … W146.exam                   mỗi mã lỗi một file
├─ tests/                                            pytest
├─ cli.py
└─ run.py                                            mở trang web soạn thảo
```

```text
python cli.py check     examples/unit1-3.exam                 # chỉ báo lỗi
python cli.py tokens    examples/unit1-3.exam                 # in token, minh hoạ pha lexer
python cli.py ast       examples/unit1-3.exam                 # in AST dạng JSON
python cli.py emit      examples/unit1-3.exam --out build/    # exam.json, keys/*.json, report.json, review.json
python cli.py simulate  examples/grade10-cn.exam \
                        --sheets ../missngoc.services/api/data/manual-extractions/grade10-CN.json
python cli.py push      examples/unit1-3.exam --class <id> --date 2026-10-25 --dry-run
python run.py                                                 # trình soạn thảo trên web
```

## 12. Kế hoạch 6 tuần

| Tuần | Làm | Xong khi |
| --- | --- | --- |
| 1 | Grammar, sinh parser, `cli.py tokens`, `SyntaxErrorCollector` báo lỗi bằng tiếng Việt kèm dòng:cột | `unit1-3.exam` parse được; 5 file sai cú pháp báo đúng vị trí |
| 2 | AST + `ASTBuilder`, `cli.py ast` | AST của 2 file mẫu khớp file JSON chuẩn (golden test) |
| 3 | Kiểm tra ngữ nghĩa của `exam` và `key` (E101–E128), tính điểm 4.3 | Mỗi mã lỗi có file mẫu và test; `grade10-cn.exam` viết lại từ đáp án thật không có lỗi |
| 4 | Kiểm tra `report` và `review` (E130–W146), hệ thống kiểu, gợi ý tên gần đúng | Toàn bộ test lỗi qua |
| 5 | Codegen + `push`, bộ thông dịch + `simulate`, so điểm với app (mục 13) | Push vào app chạy local; điểm từ `simulate` khớp app trên 30 bài |
| 6 | Trang web soạn thảo, tối ưu, báo cáo, slide demo | Chạy được kịch bản demo ở mục 13 |

Nên làm theo chiều dọc. Hết tuần 3 đã có một đường chạy từ đầu đến cuối cho `exam` và `key`: parse, kiểm tra, sinh `keys/*.json`. Sau đó mới mở rộng sang `report` và `review`. Nếu bị trễ thì cắt `report` trước, vì đó là phần ít ngữ nghĩa nhất.

## 13. Kiểm thử và kịch bản demo

### Kiểm thử

- **Theo pha:** mỗi pha có test riêng. Lexer kiểm tra dãy token. Parser kiểm tra các file sai cú pháp. Semantic kiểm tra mỗi file `examples/errors/<mã>.exam` cho **đúng một** lỗi mang mã đó, ở đúng dòng.
- **Golden test:** đầu ra của `emit` cho file mẫu được so với JSON đã duyệt tay, lưu trong `tests/golden/`.
- **Kiểm thử đối chiếu (quan trọng nhất):** cùng một đáp án và cùng 30 bài trong `grade10-CN.json`, điểm do `simulate` tính phải bằng đúng điểm app tính (lấy từ `GET /api/v1/exams/{id}/report`). Khi dùng luật duyệt mặc định, danh sách bài Cần duyệt cũng phải trùng với app. Test này chứng minh bộ thông dịch hiểu đúng ngữ nghĩa của app.
- **Kiểm tra đầu ra bằng schema của app:** `report.json` phải qua `ReportTemplateSchema`; `keys/*.json` gửi `--dry-run` lên API không bị trả 400.

### Kịch bản demo (khoảng 7 phút)

1. Mở trình soạn thảo, gõ `1-4 A C B`: dòng bị gạch đỏ ngay, kèm thông báo E122. Sửa lại thì hết lỗi.
2. Gõ `answer.statu`: báo E140, gợi ý `status`.
3. Đổi `band "Khá" >= 8`: báo E130, dải không bao giờ đạt.
4. `emit` rồi `push` vào app. Mở màn hình đáp án của app: đủ 41 câu, câu 5 có hai cách viết, câu Reading 0,328 điểm.
5. `simulate` với luật mặc định trên 30 bài thật: 27/30 bài cần duyệt, giống app.
6. Sửa một luật, chạy lại `simulate`, so tỉ lệ bài phải duyệt và số câu `unclear` không còn bị gắn cờ.

**Dữ liệu cá nhân:** `grade10-CN.json` có họ tên thật của học sinh. Trước khi đưa vào báo cáo, slide hay repo nộp bài, chạy một bước che tên (đổi thành "HS 01", "HS 02"…). Ảnh bài làm trong `data/uploads/` không đưa vào đồ án.

## 14. Điều chỉnh so với ý tưởng ban đầu

Mục DSL trong README là bản phác thảo. Tài liệu này sửa lại vài chỗ cho khớp với code thật:

| README | Tài liệu này | Lý do |
| --- | --- | --- |
| `section Vocab … text match ignore-case` | Bỏ `match` | App chỉ có một cách so câu điền từ (`normalizeTextAnswer`). Sinh ra `match` mà app không làm theo thì ngôn ngữ hứa một điều mà kết quả không giữ |
| Sinh phần "Sheet layout" của prompt | Chỉ sinh `layoutHint` | `buildPrompt` đã tự lấy câu điền từ và mã đề từ đáp án (9.4) |
| Dải điểm `band "Khá" >= 6.5 #DDEBF7` | `fill #… font #…` | `scoreBands` của app cần cả màu nền lẫn màu chữ |
| `if … then flag` | `flag "<lý do>" when …` | Lý do hiện được cho người duyệt; tách rõ luật theo câu và luật theo bài |
| Chưa có | `/` cho trắc nghiệm nhiều đáp án đúng; `score` cho tổng điểm phần | App đã hỗ trợ `correct` có nhiều chữ cái; giáo viên hay nghĩ theo "phần Reading 5 điểm" |
| Phần (`section`) như một bảng của app | Phần chỉ tồn tại trong DSL, quy đổi thành `kind` và `points` từng câu | `exam_sections` có trong BA nhưng chưa có trong schema. Cách này không phải sửa database |

## 15. Câu hỏi còn mở

- [ ] Giảng viên có chấp nhận phần thông dịch chạy trên JSON đã lưu, không chạy trong app, không? Nếu bắt buộc chạy trong app thì làm thêm mở rộng 9.4.
- [ ] Mã đề trên giấy có chứa chữ không (ví dụ `101A`)? Lexer hiện tách `101A` thành `101` và `A`. Nếu có, phải sửa luật `code` hoặc bắt viết trong ngoặc kép.
- [ ] Dải xếp loại có luôn theo thang 10 không? Nếu trung tâm có bài thang 100 xếp loại riêng, cần thêm `band … scale 100`.
- [ ] Có cần nhiều mẫu bảng điểm (theo lớp hoặc theo loại bài) không? Nếu cần thì phải sửa app trước. Xem hạn chế ở 9.3.
- [ ] Đáp án thật của đề Grade 10 CN (mã 220) để viết `grade10-cn.exam` cho kiểm thử đối chiếu.
