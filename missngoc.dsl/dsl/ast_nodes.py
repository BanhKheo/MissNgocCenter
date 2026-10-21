"""Cây cú pháp trừu tượng (AST) của ExamDSL.

Parse tree của ANTLR giữ mọi từ khoá, dấu ngoặc, dấu phẩy. ASTBuilder chuyển nó thành
các node nhỏ dưới đây, chỉ giữ những gì các pha sau (kiểm tra ngữ nghĩa, tối ưu,
sinh mã, thông dịch) cần.

Mọi node hỗ trợ mẫu Visitor: node.accept(visitor, param) gọi visitor.visit<TênLớp>(node, param).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class Span:
    """Vị trí trong mã nguồn. Dòng và cột đếm từ 1, cột cuối không tính."""
    line: int
    column: int
    end_line: int
    end_column: int


@dataclass(kw_only=True)
class Node:
    # Vị trí là siêu dữ liệu: hai cây chỉ khác vị trí vẫn bằng nhau.
    span: Optional[Span] = field(default=None, compare=False, repr=False)

    def accept(self, visitor: "ASTVisitor", param: Any = None) -> Any:
        return getattr(visitor, "visit" + type(self).__name__)(self, param)


# ───────────────────────── exam

@dataclass(kw_only=True)
class QRange(Node):
    """Khoảng câu, gồm cả hai đầu: 5-8 là câu 5, 6, 7, 8."""
    start: int
    end: int

    def questions(self) -> range:
        return range(self.start, self.end + 1)

    def __str__(self) -> str:
        return str(self.start) if self.start == self.end else f"{self.start}-{self.end}"


@dataclass(kw_only=True)
class Setting(Node):
    """questions / options / max / versions / layout. Giữ thứ tự để báo khai báo trùng."""
    name: str
    value: Any
    value_spans: list = field(default_factory=list, compare=False, repr=False)


@dataclass(kw_only=True)
class Section(Node):
    name: str
    ranges: list[QRange]
    kind: str = "choice"            # choice | text
    weight: Optional[float] = None
    score: Optional[float] = None
    name_span: Optional[Span] = field(default=None, compare=False, repr=False)


@dataclass(kw_only=True)
class Answer(Node):
    kind: str                        # choice | text
    values: list[str]


@dataclass(kw_only=True)
class KeyEntry(Node):
    qrange: QRange
    answers: list[Answer]


@dataclass(kw_only=True)
class Key(Node):
    version: Optional[str]           # None: bài chỉ có một mã đề
    entries: list[KeyEntry]
    version_span: Optional[Span] = field(default=None, compare=False, repr=False)


@dataclass(kw_only=True)
class Exam(Node):
    title: str
    settings: list[Setting] = field(default_factory=list)
    sections: list[Section] = field(default_factory=list)
    keys: list[Key] = field(default_factory=list)

    def setting(self, name: str, default: Any = None) -> Any:
        for s in self.settings:
            if s.name == name:
                return s.value
        return default


# ───────────────────────── report

@dataclass(kw_only=True)
class Style(Node):
    fill: str
    font: Optional[str] = None
    fill_span: Optional[Span] = field(default=None, compare=False, repr=False)
    font_span: Optional[Span] = field(default=None, compare=False, repr=False)


@dataclass(kw_only=True)
class StyleDecl(Node):
    target: str
    style: Style
    target_span: Optional[Span] = field(default=None, compare=False, repr=False)


@dataclass(kw_only=True)
class Band(Node):
    label: str
    min: Optional[float]             # None: dải "else"
    style: Style


@dataclass(kw_only=True)
class Report(Node):
    title: Optional[str] = None
    columns: Optional[list[str]] = None
    column_spans: list = field(default_factory=list, compare=False, repr=False)
    styles: list[StyleDecl] = field(default_factory=list)
    bands: list[Band] = field(default_factory=list)


# ───────────────────────── review

@dataclass(kw_only=True)
class Expr(Node):
    # Kiểu do pha ngữ nghĩa gán: int, number, bool, string, string?, Status, Kind, Section, name, none
    type: Optional[str] = field(default=None, compare=False, repr=False)


@dataclass(kw_only=True)
class Binary(Expr):
    op: str                          # < <= > >= == != and or
    left: Expr
    right: Expr


@dataclass(kw_only=True)
class Not(Expr):
    operand: Expr


@dataclass(kw_only=True)
class In(Expr):
    value: Expr
    items: list[Expr]


@dataclass(kw_only=True)
class Count(Expr):
    cond: Expr


@dataclass(kw_only=True)
class Ref(Expr):
    """answer.status, submission.score"""
    obj: str
    field: str


@dataclass(kw_only=True)
class Name(Expr):
    """Tên đứng một mình: unclear, Reading, choice. Ý nghĩa lấy theo vế bên kia của phép so sánh."""
    id: str
    resolved: Optional[str] = field(default=None, compare=False)   # Status | Kind | Section


@dataclass(kw_only=True)
class Lit(Expr):
    value: Any                       # số, chuỗi, True/False, None


@dataclass(kw_only=True)
class Rule(Node):
    message: Optional[str]
    cond: Expr
    scope: str = field(default="submission", compare=False)   # answer | submission, gán ở pha ngữ nghĩa


@dataclass(kw_only=True)
class Review(Node):
    rules: list[Rule] = field(default_factory=list)
    is_default: bool = field(default=False, compare=False)


# ───────────────────────── program

@dataclass(kw_only=True)
class Program(Node):
    exam: Exam
    report: Optional[Report] = None
    review: Optional[Review] = None


class ASTVisitor:
    """Visitor gốc: lớp con ghi đè visit<TênLớp> cho các node cần xử lý."""

    def visit(self, node: Node, param: Any = None) -> Any:
        return node.accept(self, param)

    def __getattr__(self, name: str):
        if name.startswith("visit"):
            raise NotImplementedError(f"{type(self).__name__} chưa có {name}")
        raise AttributeError(name)
