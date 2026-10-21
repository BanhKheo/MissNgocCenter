"""Đường đi của trình biên dịch: văn bản → token → parse tree → AST → AST đã kiểm tra → JSON.

    phân tích từ vựng    ExamDSLLexer (ANTLR)      → dãy token
    phân tích cú pháp    ExamDSLParser (ANTLR)     → parse tree
    sinh AST             ASTBuilder (Visitor)      → AST
    phân tích ngữ nghĩa  StaticChecker             → lỗi / cảnh báo, ExamInfo
    tối ưu               optimizer                 → điểm từng câu, luật đã gộp hằng
    sinh mã              codegen                   → exam.json, keys/*.json, report.json, review.json

Mỗi pha chỉ chạy khi pha trước không có lỗi, như phần đầu của một trình biên dịch cổ điển.
"""
from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from typing import Optional

from antlr4 import CommonTokenStream, InputStream

from . import codegen
from .ast_builder import ASTBuilder
from .ast_nodes import Node, Program, Review, Span
from .domain import DEFAULT_REVIEW_SOURCE
from .errors import ERROR, Diagnostic, SyntaxErrorCollector
from .generated.ExamDSLLexer import ExamDSLLexer
from .generated.ExamDSLParser import ExamDSLParser
from .optimizer import compute_points, optimize_rules
from .semantic import ExamInfo, StaticChecker

LEXICAL_HINTS = {
    "#": "màu viết dạng #RRGGBB, ví dụ #C6EFCE",
    "'": "chuỗi dùng ngoặc kép \"...\"",
    ";": "không cần dấu ';' cuối câu lệnh",
    ":": "đáp án viết `1 A`, không cần dấu ':'",
    "=": "so sánh bằng viết `==`, lớn hơn hoặc bằng viết `>=`",
}


@dataclass
class TokenInfo:
    type: str
    text: str
    line: int
    column: int

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


@dataclass
class CompileResult:
    stage: str                                   # lexical | syntax | semantic | ok
    tokens: list[TokenInfo] = field(default_factory=list)
    diagnostics: list[Diagnostic] = field(default_factory=list)
    ast: Optional[Program] = None
    info: Optional[ExamInfo] = None
    rules: list = field(default_factory=list)    # luật duyệt sau tối ưu

    @property
    def ok(self) -> bool:
        return not any(d.severity == ERROR for d in self.diagnostics)

    def errors(self) -> list[Diagnostic]:
        return [d for d in self.diagnostics if d.severity == ERROR]

    def outputs(self) -> dict:
        """Các file JSON sinh ra. Chỉ gọi khi ok."""
        assert self.ok and self.info is not None
        return {
            "exam": codegen.exam_json(self.info),
            "keys": codegen.answer_keys_json(self.info),
            "report": codegen.report_json(self.ast.report),
            "review": codegen.review_json(self.rules),
        }

    def to_dict(self) -> dict:
        d = {
            "ok": self.ok,
            "stage": self.stage,
            "diagnostics": [x.to_dict() for x in self.diagnostics],
            "tokens": [t.to_dict() for t in self.tokens],
            "ast": to_dict(self.ast) if self.ast is not None else None,
        }
        if self.ok and self.info is not None:
            d["outputs"] = self.outputs()
            d["preview"] = preview(self)
        return d


def tokenize(source: str) -> tuple[CommonTokenStream, list[TokenInfo], list[Diagnostic]]:
    lexer = ExamDSLLexer(InputStream(source))
    lexer.removeErrorListeners()
    stream = CommonTokenStream(lexer)
    stream.fill()
    tokens, errors = [], []
    for tok in stream.tokens:
        if tok.type == -1:
            break
        name = ExamDSLLexer.symbolicNames[tok.type]
        tokens.append(TokenInfo(name, tok.text, tok.line, tok.column + 1))
        if name == "ERROR_CHAR":
            last = errors[-1] if errors else None
            if last and last.code == "E001" and last.line == tok.line and last.end_column == tok.column + 1:
                last.end_column += 1      # gộp các ký tự lạ liền nhau thành một lỗi
                continue
            hint = LEXICAL_HINTS.get(tok.text)
            errors.append(Diagnostic("error", "lexical", "E001", f"Ký tự không hợp lệ '{tok.text}'" + (f": {hint}" if hint else ""),
                                     tok.line, tok.column + 1, tok.line, tok.column + 2))
        elif name == "UNCLOSED_STRING":
            errors.append(Diagnostic("error", "lexical", "E002", "Chuỗi chưa đóng: thêm dấu \" ở cuối",
                                     tok.line, tok.column + 1, tok.line, tok.column + 1 + len(tok.text)))
    return stream, tokens, errors


def parse(stream: CommonTokenStream, rule: str = "program"):
    parser = ExamDSLParser(stream)
    collector = SyntaxErrorCollector()
    parser.removeErrorListeners()
    parser.addErrorListener(collector)
    tree = getattr(parser, rule)()
    return tree, collector.diagnostics


def default_review() -> Review:
    """Luật duyệt mặc định được dịch bằng chính front end của ExamDSL."""
    stream, _, lex_errors = tokenize(DEFAULT_REVIEW_SOURCE)
    tree, syn_errors = parse(stream, "review")
    assert not lex_errors and not syn_errors, "DEFAULT_REVIEW_SOURCE phải hợp lệ"
    review = ASTBuilder().visit(tree)
    review.is_default = True
    return review


def compile_source(source: str) -> CompileResult:
    stream, tokens, lexical_errors = tokenize(source)
    if lexical_errors:
        return CompileResult("lexical", tokens, lexical_errors)

    tree, syntax_errors = parse(stream)
    if syntax_errors:
        return CompileResult("syntax", tokens, syntax_errors)

    program: Program = ASTBuilder().visit(tree)
    if program.review is None:
        program.review = default_review()
    checker = StaticChecker(program)
    diagnostics = checker.check()
    result = CompileResult("semantic", tokens, diagnostics, program, checker.info)
    if not result.ok:
        return result

    exam_span = program.exam.span
    points, point_warnings = compute_points(checker.info, exam_span and Span(exam_span.line, exam_span.column, exam_span.line, exam_span.column + 4))
    checker.info.points = points
    rules, rule_warnings = optimize_rules(program.review.rules)
    result.rules = rules
    result.diagnostics = sorted(diagnostics + point_warnings + rule_warnings, key=lambda d: (d.line, d.column))
    result.stage = "ok"
    return result


def compile_file(path) -> CompileResult:
    with open(path, encoding="utf-8") as f:
        return compile_source(f.read())


# ───────────────────────── AST → JSON (cho lệnh `ast` và trang web)

def to_dict(value):
    if isinstance(value, Node):
        d = {"node": type(value).__name__}
        for f in dataclasses.fields(value):
            if f.name == "span" or f.name.endswith("_span") or f.name.endswith("_spans") or f.name == "column_spans":
                continue
            d[f.name] = to_dict(getattr(value, f.name))
        if value.span is not None:
            d["line"] = value.span.line
        return d
    if isinstance(value, Span):
        return None
    if isinstance(value, list):
        return [to_dict(v) for v in value]
    return value


def preview(result: CompileResult) -> dict:
    """Tóm tắt cho trang web: bảng đáp án từng mã đề, điểm từng phần, dải xếp loại, luật đã tối ưu."""
    info = result.info
    sections = []
    for s in info.sections:
        qs = sorted(q for q, sec in info.section_of.items() if sec is s)
        sections.append({"name": s.name, "kind": s.kind, "questions": len(qs),
                         "points": float(sum(info.points[q] for q in qs)), "perQuestion": float(info.points[qs[0]]) if qs else 0})
    return {
        "title": info.title,
        "questions": info.questions,
        "options": "".join(info.options),
        "max": info.max,
        "versions": list(info.keys),
        "totalPoints": float(sum(info.points.values())),
        "sections": sections,
        "bands": result.outputs()["report"]["scoreBands"],
        "rules": [{"message": r.message, "scope": r.scope, "when": codegen.expr_text(r.cond)} for r in result.rules],
        "defaultReview": result.ast.review.is_default,
    }
