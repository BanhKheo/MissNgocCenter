"""Bộ kiểm tra ngữ nghĩa (StaticChecker) của ExamDSL.

Một file đúng cú pháp vẫn có thể vô nghĩa:
    1-4 A C B                  (4 câu mà chỉ có 3 đáp án)
    key 103 { ... }            (mã đề 103 chưa khai báo)
    flag when answer.statu     (answer không có trường statu)

Bộ kiểm tra duyệt AST theo mẫu Visitor và dùng các bảng ký hiệu:

    program scope ── tên phần, mã đề, cột bảng điểm, kiểu ô
      └─ review scope ── answer.*, submission.*, giá trị liệt kê (unclear, choice, Reading…)

Tên được giải quyết qua 2 lượt (khai báo hết, rồi mới kiểm tra chỗ dùng), nên `key`
viết trước `section` vẫn hợp lệ. Kết quả phụ là ExamInfo: bảng ký hiệu đã giải quyết
mà pha sinh mã và bộ thông dịch dùng lại.
"""
from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field
from typing import Optional

from .ast_nodes import (
    Answer, Binary, Count, Exam, Expr, In, Key, Lit, Name, Not, Program, QRange, Ref, Report,
    Review, Rule, Section, Span, Style,
)
from .domain import (
    MARK_STATUSES, MAX_ALTERNATIVES, MAX_BAND_LABEL, MAX_BANDS, MAX_LAYOUT, MAX_QUESTIONS, MAX_SCORE,
    MAX_TEXT_ANSWER, OPTION_SETS, QUESTION_KINDS, REPORT_COLUMNS, STYLE_TARGETS, format_ranges,
)
from .errors import ERROR, WARNING, Diagnostic

COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

# ───────────────────────── hệ thống kiểu của review

ANSWER_FIELDS = {
    "q": "int", "status": "Status", "kind": "Kind", "section": "Section",
    "choice": "string?", "correct": "bool", "points": "number",
}
SUBMISSION_FIELDS = {"nameMismatch": "bool", "versionKnown": "bool", "score": "number"}
OBJECTS = {"answer": ANSWER_FIELDS, "submission": SUBMISSION_FIELDS}
ENUM_TYPES = ("Status", "Kind", "Section")
NUMERIC = ("int", "number")
TEXTUAL = ("string", "string?", "none")

TYPE_NAMES = {
    "int": "số nguyên", "number": "số", "bool": "đúng/sai", "string": "chuỗi",
    "string?": "chuỗi (có thể none)", "none": "none", "Status": "trạng thái (Status)",
    "Kind": "loại câu (Kind)", "Section": "phần (Section)", "name": "một tên chưa rõ nghĩa",
}


def suggest(name: str, candidates) -> str:
    """Gợi ý tên gần đúng: "Có phải ý bạn là `status`?"."""
    pool = list(candidates)
    lowered = {c.lower(): c for c in pool}
    match = difflib.get_close_matches(name.lower(), list(lowered), n=1, cutoff=0.6)
    return f" Có phải ý bạn là `{lowered[match[0]]}`?" if match else ""


@dataclass
class ExamInfo:
    """Bảng ký hiệu của khối exam sau khi đã giải quyết: dùng cho sinh mã và thông dịch."""
    title: str = ""
    questions: Optional[int] = None
    options: Optional[list] = None
    max: float = 10
    versions: list = field(default_factory=list)       # [] nếu bài chỉ có mã đề chung
    layout: Optional[str] = None
    sections: list = field(default_factory=list)
    section_of: dict = field(default_factory=dict)     # câu → Section
    keys: dict = field(default_factory=dict)            # mã đề ("" là mã chung) → {câu: Answer}
    points: dict = field(default_factory=dict)          # câu → Decimal, do optimizer tính

    def kind(self, q: int) -> str:
        sec = self.section_of.get(q)
        return sec.kind if sec else "choice"


class StaticChecker:

    def __init__(self, program: Program):
        self.program = program
        self.diagnostics: list[Diagnostic] = []
        self.info = ExamInfo()

    # ───────── tiện ích

    def error(self, code: str, message: str, span: Optional[Span]):
        self.diagnostics.append(Diagnostic.at(ERROR, "semantic", code, message, span))

    def warn(self, code: str, message: str, span: Optional[Span]):
        self.diagnostics.append(Diagnostic.at(WARNING, "semantic", code, message, span))

    def check(self) -> list[Diagnostic]:
        self.check_exam(self.program.exam)
        if self.program.report is not None:
            self.check_report(self.program.report)
        if self.program.review is not None:
            self.check_review(self.program.review)
        self.diagnostics.sort(key=lambda d: (d.line, d.column))
        return self.diagnostics

    # ───────── exam: khai báo chung

    def check_exam(self, exam: Exam):
        info = self.info
        info.title = exam.title
        seen = {}
        for s in exam.settings:
            if s.name in seen:
                self.error("E102", f"`{s.name}` đã khai báo ở dòng {seen[s.name].span.line}", s.span)
                continue
            seen[s.name] = s

        q = seen.get("questions")
        if q is None:
            self.error("E101", "Thiếu `questions`: bài kiểm tra phải có số câu, ví dụ `questions 40`", exam.span and Span(exam.span.line, exam.span.column, exam.span.line, exam.span.column + 4))
        elif not 1 <= q.value <= MAX_QUESTIONS:
            self.error("E104", f"Số câu phải từ 1 đến {MAX_QUESTIONS}, đang là {q.value}", q.value_spans[0])
        else:
            info.questions = q.value

        o = seen.get("options")
        if o is None:
            self.error("E101", "Thiếu `options`: ghi bộ lựa chọn, ví dụ `options A B C D`", exam.span and Span(exam.span.line, exam.span.column, exam.span.line, exam.span.column + 4))
        elif "".join(o.value) not in OPTION_SETS:
            self.error("E103", f"Bộ lựa chọn phải là `A B C D` hoặc `A B C D E`, đang là `{' '.join(o.value)}`", o.span)
        else:
            info.options = list(o.value)

        m = seen.get("max")
        if m is not None:
            if not 1 <= m.value <= MAX_SCORE:
                self.error("E104", f"Thang điểm phải từ 1 đến {MAX_SCORE}, đang là {m.value}", m.value_spans[0])
            else:
                info.max = m.value

        v = seen.get("versions")
        if v is not None:
            codes = []
            for code, span in zip(v.value, v.value_spans):
                if code in codes:
                    self.error("E102", f"Mã đề `{code}` bị lặp trong `versions`", span)
                else:
                    codes.append(code)
            info.versions = codes

        lay = seen.get("layout")
        if lay is not None:
            if len(lay.value) > MAX_LAYOUT:
                self.error("E104", f"`layout` tối đa {MAX_LAYOUT} ký tự, đang có {len(lay.value)}", lay.value_spans[0])
            else:
                info.layout = lay.value.strip() or None

        self.check_sections(exam)
        self.check_keys(exam, v)

    def check_range(self, r: QRange) -> bool:
        if r.start > r.end:
            self.error("E110", f"Khoảng câu bị ngược: {r.start} lớn hơn {r.end}. Viết {r.end}-{r.start}", r.span)
            return False
        if r.start < 1:
            self.error("E111", "Câu đánh số từ 1, không có câu 0", r.span)
            return False
        n = self.info.questions
        if n is not None and r.end > n:
            extra = f"{max(r.start, n + 1)}" + (f"–{r.end}" if r.end > max(r.start, n + 1) else "")
            self.error("E111", f"Câu {extra} vượt quá số câu ({n})", r.span)
            return False
        return True

    # ───────── exam: các phần

    def check_sections(self, exam: Exam):
        info = self.info
        by_name: dict[str, Section] = {}
        for sec in exam.sections:
            if sec.name in by_name:
                self.error("E114", f"Phần `{sec.name}` đã khai báo ở dòng {by_name[sec.name].span.line}", sec.name_span)
                continue
            by_name[sec.name] = sec
            info.sections.append(sec)
            overlaps: dict[str, list] = {}
            for r in sec.ranges:
                if not self.check_range(r):
                    continue
                for q in r.questions():
                    other = info.section_of.get(q)
                    if other is not None and other is not sec:
                        overlaps.setdefault(other.name, []).append(q)
                    else:
                        info.section_of[q] = sec
            for other_name, qs in overlaps.items():
                other = by_name[other_name]
                label = "Câu" if len(qs) == 1 else "Các câu"
                self.error("E112", f"{label} {format_ranges(qs)} thuộc 2 phần: {other.name} (dòng {other.span.line}) và {sec.name} (dòng {sec.span.line})", sec.span)
            if sec.weight is not None and sec.weight <= 0:
                self.error("E118", f"Hệ số của phần `{sec.name}` phải lớn hơn 0", sec.span)
            if sec.score is not None and sec.score <= 0:
                self.error("E118", f"Điểm của phần `{sec.name}` phải lớn hơn 0", sec.span)

        if not info.sections:
            return
        weighted = [s for s in info.sections if s.weight is not None]
        scored = [s for s in info.sections if s.score is not None]
        if weighted and scored:
            first = min(weighted[0], scored[0], key=lambda s: s.span.line)
            later = scored[0] if first is weighted[0] else weighted[0]
            self.error("E115", f"Không trộn `weight` và `score` trong cùng một bài: phần `{first.name}` dùng "
                               f"`{'weight' if first.weight is not None else 'score'}`, phần `{later.name}` dùng "
                               f"`{'weight' if later.weight is not None else 'score'}`", later.span)
            return
        n = info.questions
        uncovered = [q for q in range(1, n + 1) if q not in info.section_of] if n else []
        if scored:
            for s in info.sections:
                if s.score is None:
                    self.error("E115", f"Phần `{s.name}` chưa có `score`: đã dùng `score` thì mọi phần đều phải có", s.span)
            if uncovered:
                self.error("E116", f"Câu {format_ranges(uncovered)} không thuộc phần nào: khi dùng `score`, mọi câu phải thuộc một phần có điểm", info.sections[-1].span)
            elif all(s.score is not None for s in info.sections):
                total = sum(s.score for s in info.sections)
                if abs(total - info.max) > 1e-9:
                    self.error("E116", f"Tổng điểm các phần ({fmt_num(total)}) khác thang điểm ({fmt_num(info.max)})", info.sections[-1].span)
        elif uncovered:
            self.warn("W113", f"Câu {format_ranges(uncovered)} không thuộc phần nào; tính là trắc nghiệm, hệ số 1", info.sections[-1].span)

    # ───────── exam: đáp án

    def check_keys(self, exam: Exam, versions_setting):
        info = self.info
        versions = info.versions
        seen: dict[str, Key] = {}
        for key in exam.keys:
            if versions:
                if key.version is None:
                    self.error("E120", f"Bài có {len(versions)} mã đề: ghi mã đề sau `key`, ví dụ `key {versions[0]}`", key.version_span)
                    continue
                if key.version not in versions:
                    self.error("E120", f"Mã đề `{key.version}` chưa khai báo trong `versions`.{suggest(key.version, versions)}", key.version_span)
                    continue
                code = key.version
            else:
                if key.version is not None:
                    self.error("E120", f"Mã đề `{key.version}` chưa khai báo: thêm `versions {key.version} …`, hoặc bỏ mã đề sau `key` nếu bài chỉ có một đề", key.version_span)
                    continue
                code = ""
            if code in seen:
                what = f"Mã đề {code} đã có đáp án" if code else "Đã có một khối `key`"
                self.error("E129", f"{what} ở dòng {seen[code].span.line}", key.version_span)
                continue
            seen[code] = key
            info.keys[code] = self.check_key(key, code)

        if versions:
            for code, span in zip(versions_setting.value, versions_setting.value_spans):
                if code in versions and code not in seen:
                    self.error("E121", f"Mã đề {code} chưa có đáp án: thêm khối `key {code} {{ … }}`", span)
        elif not exam.keys:
            self.error("E121", "Chưa có đáp án: thêm khối `key { … }`", exam.span and Span(exam.span.line, exam.span.column, exam.span.line, exam.span.column + 4))

    def check_key(self, key: Key, code: str) -> dict:
        info = self.info
        items: dict[int, Answer] = {}
        lines: dict[int, int] = {}
        broken = False   # dòng đáp án đã có lỗi: không báo thêm "thiếu câu" cho chính các câu đó
        for entry in key.entries:
            r = entry.qrange
            if not self.check_range(r):
                broken = True
                continue
            n = r.end - r.start + 1
            got = len(entry.answers)
            if got != n:
                what = f"khoảng {r} có {n} câu" if n > 1 else f"câu {r} chỉ có 1 câu"
                self.error("E122", f"{what[0].upper()}{what[1:]} nhưng {'chỉ ' if got < n else ''}có {got} đáp án", entry.span)
                broken = True
                continue
            for q, ans in zip(r.questions(), entry.answers):
                if q in items:
                    self.error("E123", f"Câu {q} đã có đáp án ở dòng {lines[q]}", ans.span)
                    continue
                items[q], lines[q] = ans, ans.span.line
                self.check_answer(q, ans)
        n = info.questions
        if n and not broken:
            missing = [q for q in range(1, n + 1) if q not in items]
            if missing:
                who = f"Mã đề {code}" if code else "Đáp án"
                self.error("E124", f"{who} thiếu câu {format_ranges(missing)}", key.version_span)
        return items

    def check_answer(self, q: int, ans: Answer):
        info = self.info
        sec = info.section_of.get(q)
        kind = sec.kind if sec else "choice"
        where = f" (phần {sec.name})" if sec else ""
        if ans.kind == "choice":
            if kind == "text":
                low = ans.values[0].lower()
                self.error("E126", f"Câu {q} là câu điền từ{where}, đáp án phải là chuỗi trong ngoặc kép. "
                                   f"Nếu đáp án đúng là chữ \"{low}\", hãy viết \"{low}\"", ans.span)
            elif info.options:
                bad = [l for l in dict.fromkeys(ans.values) if l not in info.options]
                if bad:
                    self.error("E125", f"`{', '.join(bad)}` không thuộc bộ lựa chọn {' '.join(info.options)}", ans.span)
        else:
            if kind == "choice":
                self.error("E127", f"Câu {q} là câu trắc nghiệm{where}, đáp án phải là chữ cái, không phải chuỗi", ans.span)
            elif len(ans.values) > MAX_ALTERNATIVES:
                self.error("E128", f"Câu {q} có {len(ans.values)} cách viết, tối đa {MAX_ALTERNATIVES}", ans.span)
            elif any(not v.strip() for v in ans.values):
                self.error("E128", f"Câu {q}: đáp án điền từ không được để trống", ans.span)
            elif any(len(v.strip()) > MAX_TEXT_ANSWER for v in ans.values):
                self.error("E128", f"Câu {q}: mỗi đáp án điền từ tối đa {MAX_TEXT_ANSWER} ký tự", ans.span)

    # ───────── report

    def check_report(self, report: Report):
        if report.title is not None and not report.title.strip():
            self.error("E135", "Tiêu đề bảng điểm không được để trống", report.span)
        if report.columns is not None:
            seen = set()
            for col, span in zip(report.columns, report.column_spans):
                if col not in REPORT_COLUMNS:
                    self.error("E134", f"Không có cột `{col}`.{suggest(col, REPORT_COLUMNS)} Các cột: {', '.join(REPORT_COLUMNS)}", span)
                elif col in seen:
                    self.error("E134", f"Cột `{col}` bị lặp", span)
                seen.add(col)
        styles = {}
        for decl in report.styles:
            if decl.target not in STYLE_TARGETS:
                self.error("E136", f"Không có kiểu `{decl.target}`.{suggest(decl.target, STYLE_TARGETS)} Các kiểu: {', '.join(STYLE_TARGETS)}", decl.target_span)
            elif decl.target in styles:
                self.error("E102", f"Kiểu `{decl.target}` đã khai báo ở dòng {styles[decl.target].span.line}", decl.target_span)
            else:
                styles[decl.target] = decl
            self.check_style(decl.style)

        bands = report.bands
        if not bands:
            return
        if len(bands) > MAX_BANDS:
            self.error("E135", f"Tối đa {MAX_BANDS} dải xếp loại, đang có {len(bands)}", bands[MAX_BANDS].span)
        labels = {}
        prev = None
        else_band = None
        for i, b in enumerate(bands):
            self.check_style(b.style)
            if not b.label.strip() or len(b.label) > MAX_BAND_LABEL:
                self.error("E135", f"Nhãn xếp loại phải có từ 1 đến {MAX_BAND_LABEL} ký tự", b.span)
            elif b.label in labels:
                self.error("E135", f"Nhãn \"{b.label}\" đã dùng ở dòng {labels[b.label]}", b.span)
            labels.setdefault(b.label, b.span.line)
            if b.min is None:
                if else_band is not None:
                    self.error("E133", f"Chỉ được có một dải `else` (đã có ở dòng {else_band.span.line})", b.span)
                elif i != len(bands) - 1:
                    self.error("E133", "Dải `else` phải đứng cuối cùng", b.span)
                else_band = else_band or b
                continue
            if not 0 <= b.min <= 10:
                self.error("E131", f"Ngưỡng tính theo thang 10, phải nằm trong 0–10, đang là {fmt_num(b.min)}", b.span)
            if prev is not None:
                if b.min == prev.min:
                    self.error("E130", f"Dải \"{b.label}\" không bao giờ đạt được: cùng ngưỡng {fmt_num(b.min)} với dải \"{prev.label}\" ở dòng {prev.span.line}", b.span)
                elif b.min > prev.min:
                    self.error("E130", f"Ngưỡng phải giảm dần: dải \"{b.label}\" (>= {fmt_num(b.min)}) đứng sau dải \"{prev.label}\" (>= {fmt_num(prev.min)})", b.span)
            prev = b
        if else_band is None:
            self.error("E133", "Thiếu dải `else` cho điểm thấp hơn mọi ngưỡng, ví dụ `band \"Cần cố gắng\" else fill #FFC7CE`", bands[-1].span)
        elif prev is not None and prev.min == 0:
            self.error("E130", f"Dải `else` không bao giờ đạt được: dải \"{prev.label}\" đã có ngưỡng 0", else_band.span)

    def check_style(self, style: Style):
        for color, span in ((style.fill, style.fill_span), (style.font, style.font_span)):
            if color is not None and not COLOR_RE.match(color):
                self.error("E132", f"Màu `{color}` sai dạng: cần # và đúng 6 chữ số hex, ví dụ #C6EFCE", span)

    # ───────── review: kiểm tra kiểu

    def check_review(self, review: Review):
        for rule in review.rules:
            self._uses_answer = False
            t = self.type_of(rule.cond, in_count=False)
            if t not in ("bool", "error"):
                self.error("E145", f"Điều kiện của `flag` phải là đúng/sai, ở đây là {TYPE_NAMES.get(t, t)}", rule.cond.span)
            rule.scope = "answer" if self._uses_answer else "submission"

    def type_of(self, e: Expr, in_count: bool) -> str:
        e.type = self._type_of(e, in_count)
        return e.type

    def _type_of(self, e: Expr, in_count: bool) -> str:
        if isinstance(e, Lit):
            v = e.value
            if v is None:
                return "none"
            if isinstance(v, bool):
                return "bool"
            if isinstance(v, int):
                return "int"
            if isinstance(v, float):
                return "number"
            return "string"
        if isinstance(e, Name):
            return "name"
        if isinstance(e, Ref):
            fields = OBJECTS.get(e.obj)
            if fields is None:
                self.error("E140", f"Không có `{e.obj}`: dùng `answer.<trường>` hoặc `submission.<trường>`.{suggest(e.obj, OBJECTS)}", e.span)
                return "error"
            if e.field not in fields:
                self.error("E140", f"`{e.obj}` không có trường `{e.field}`.{suggest(e.field, fields)} Các trường: {', '.join(fields)}", e.span)
                return "error"
            if e.obj == "answer":
                if in_count:
                    self._answer_in_count = True
                else:
                    self._uses_answer = True
            return fields[e.field]
        if isinstance(e, Count):
            if in_count:
                self.error("E144", "`count` không được lồng trong `count`", e.span)
                return "error"
            self._answer_in_count = False
            t = self.type_of(e.cond, in_count=True)
            if t not in ("bool", "error"):
                self.error("E144", f"Điều kiện trong `count` phải là đúng/sai, ở đây là {TYPE_NAMES.get(t, t)}", e.cond.span)
            elif t == "bool" and not self._answer_in_count:
                self.error("E144", "`count` đếm theo từng câu, nên điều kiện bên trong phải có `answer.*`", e.span)
            return "int"
        if isinstance(e, Not):
            t = self.type_of(e.operand, in_count)
            if t not in ("bool", "error"):
                self.error("E141", f"`not` cần một điều kiện đúng/sai, ở đây là {TYPE_NAMES.get(t, t)}", e.operand.span)
            return "bool"
        if isinstance(e, Binary) and e.op in ("and", "or"):
            for side in (e.left, e.right):
                t = self.type_of(side, in_count)
                if t not in ("bool", "error"):
                    self.error("E141", f"`{e.op}` cần hai vế đúng/sai, một vế đang là {TYPE_NAMES.get(t, t)}", side.span)
            return "bool"
        if isinstance(e, Binary):
            lt, rt = self.type_of(e.left, in_count), self.type_of(e.right, in_count)
            if "error" in (lt, rt):
                return "bool"
            if e.op in ("==", "!="):
                self.unify(e.left, lt, e.right, rt, e)
            elif lt not in NUMERIC or rt not in NUMERIC:
                bad = lt if lt not in NUMERIC else rt
                self.error("E141", f"`{e.op}` chỉ so sánh số, một vế đang là {TYPE_NAMES.get(bad, bad)}", e.span)
            return "bool"
        if isinstance(e, In):
            vt = self.type_of(e.value, in_count)
            for item in e.items:
                it = self.type_of(item, in_count)
                if "error" not in (vt, it):
                    self.unify(e.value, vt, item, it, item)
            return "bool"
        raise TypeError(f"Node lạ: {type(e).__name__}")

    def unify(self, a: Expr, at: str, b: Expr, bt: str, where: Expr):
        """Hai vế của ==, != hoặc in phải cùng kiểu. Tên đứng một mình lấy kiểu của vế bên kia."""
        if at in ENUM_TYPES:
            self.resolve(b, bt, at)
        elif bt in ENUM_TYPES:
            self.resolve(a, at, bt)
        elif "name" in (at, bt):
            name = a if at == "name" else b
            self.error("E141", f"Không rõ `{name.id}` là gì: chỉ so sánh tên như vậy với answer.status, answer.kind hoặc answer.section", name.span)
        elif at in NUMERIC and bt in NUMERIC:
            pass
        elif at in TEXTUAL and bt in TEXTUAL and not (at == "none" and bt == "none"):
            pass
        elif at == bt == "bool":
            pass
        else:
            self.error("E141", f"Không so sánh được {TYPE_NAMES.get(at, at)} với {TYPE_NAMES.get(bt, bt)}", where.span)

    def resolve(self, e: Expr, t: str, enum: str):
        if enum == "Section":
            names = [s.name for s in self.info.sections]
            if isinstance(e, Name) or (isinstance(e, Lit) and t == "string"):
                value = e.id if isinstance(e, Name) else e.value
                if value not in names:
                    hint = suggest(value, names) if names else " Bài chưa khai báo phần nào"
                    self.error("E143", f"Không có phần `{value}`.{hint}", e.span)
                elif isinstance(e, Name):
                    e.resolved, e.type = "Section", "Section"
                return
        elif t == "name":
            values = MARK_STATUSES if enum == "Status" else QUESTION_KINDS
            if e.id not in values:
                label = "trạng thái" if enum == "Status" else "loại câu"
                self.error("E142", f"`{e.id}` không phải {label}.{suggest(e.id, values)} Các giá trị: {', '.join(values)}", e.span)
            else:
                e.resolved, e.type = enum, enum
            return
        if t != enum:
            self.error("E141", f"Không so sánh được {TYPE_NAMES[enum]} với {TYPE_NAMES.get(t, t)}", e.span)


def fmt_num(x) -> str:
    return str(int(x)) if float(x).is_integer() else f"{x:g}"
