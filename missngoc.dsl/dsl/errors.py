"""Lỗi và cảnh báo của mọi pha biên dịch. Danh sách mã lỗi: missngoc.docs/examdsl-design.md mục 7."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Optional

from antlr4.error.ErrorListener import ErrorListener

from .ast_nodes import Span

ERROR, WARNING = "error", "warning"


@dataclass
class Diagnostic:
    severity: str        # error | warning
    phase: str           # lexical | syntax | semantic | optimize
    code: str            # E001, E122, W146 ...
    message: str
    line: int = 1
    column: int = 1
    end_line: int = 1
    end_column: int = 2

    @classmethod
    def at(cls, severity: str, phase: str, code: str, message: str, span: Optional[Span]) -> "Diagnostic":
        if span is None:
            return cls(severity, phase, code, message)
        return cls(severity, phase, code, message, span.line, span.column, span.end_line, span.end_column)

    def to_dict(self) -> dict:
        return asdict(self)

    def __str__(self) -> str:
        kind = "lỗi" if self.severity == ERROR else "cảnh báo"
        return f"{self.line}:{self.column} {kind} {self.code}: {self.message}"


# Tên dễ đọc của các loại token, dùng trong thông báo lỗi cú pháp
TOKEN_DISPLAY = {
    "STRING": "một chuỗi trong ngoặc kép",
    "INT": "một số",
    "FLOAT": "một số",
    "LETTER": "một chữ cái A–E",
    "ID": "một tên",
    "COLOR": "một màu #RRGGBB",
    "EOF": "cuối file",
}

# Parser đang đọc gì, theo luật của grammar. Cho thông báo "cần một đáp án" thay vì liệt kê token.
RULE_EXPECTATIONS = {
    "KeyEntryContext": "một đáp án (chữ cái A–E, hoặc chuỗi trong ngoặc kép cho câu điền từ)",
    "QrangeContext": "một số câu hoặc khoảng câu, ví dụ 5 hoặc 5-8",
    "StyleContext": "màu, ví dụ fill #C6EFCE font #006100",
    "KindContext": "loại câu: choice hoặc text",
    "NumberContext": "một số",
}


class SyntaxErrorCollector(ErrorListener):
    """Gom mọi lỗi cú pháp thay vì in ra console.

    ANTLR tự phục hồi sau lỗi và đọc tiếp, nên một lần chạy báo được nhiều lỗi.
    Thông báo được viết lại bằng tiếng Việt, dễ hiểu hơn "mismatched input ... expecting {...}".
    Mỗi dòng chỉ giữ lỗi đầu tiên, vì các lỗi sau thường do lỗi đầu gây ra.
    """

    MAX_ERRORS = 20

    def __init__(self):
        super().__init__()
        self.diagnostics: list[Diagnostic] = []

    def syntaxError(self, recognizer, offendingSymbol, line, column, msg, e):
        if len(self.diagnostics) >= self.MAX_ERRORS or any(d.line == line for d in self.diagnostics):
            return
        found = self._describe(offendingSymbol)
        ctx_name = type(getattr(recognizer, "_ctx", None)).__name__
        expected = RULE_EXPECTATIONS.get(ctx_name) or self._expected(recognizer)
        at_eof = offendingSymbol is None or offendingSymbol.type == -1
        text_of = getattr(offendingSymbol, "text", "") or ""

        if at_eof and "'}'" in self._expected(recognizer, limit=99):
            text = "Hết file mà một khối chưa đóng: thêm dấu '}' còn thiếu"
        elif len(text_of) == 1 and text_of.isalpha() and text_of.isupper() and ctx_name in ("KeyStmtContext", "KeyEntryContext", "ChoiceAnswerContext", "OptionsStmtContext"):
            text = f"'{text_of}' không phải lựa chọn hợp lệ: chỉ dùng các chữ cái A–E"
        elif msg.startswith("missing"):
            text = f"Thiếu {expected or msg[8:].split(' at ')[0]} trước {found}"
        else:
            text = f"Không mong đợi {found}"
            if expected:
                text += f", cần {expected}"
        width = max(1, len(text_of)) if not at_eof else 1
        self.diagnostics.append(Diagnostic("error", "syntax", "E100", text, line, column + 1, line, column + 1 + width))

    @staticmethod
    def _describe(token) -> str:
        if token is None or token.type == -1:
            return "cuối file"
        return f"'{token.text}'"

    @staticmethod
    def _expected(recognizer, limit: int = 6) -> str:
        try:
            expected = recognizer.getExpectedTokens()
        except Exception:
            return ""
        names = []
        for interval in expected.intervals or []:
            for t in interval:
                names.append(token_name(recognizer, t))
        names = list(dict.fromkeys(names))
        if not names or len(names) > limit:
            return ""
        if len(names) == 1:
            return names[0]
        return ", ".join(names[:-1]) + " hoặc " + names[-1]


def token_name(recognizer, token_type: int) -> str:
    if token_type == -1:
        return "cuối file"
    literal = recognizer.literalNames[token_type] if token_type < len(recognizer.literalNames) else "<INVALID>"
    if literal != "<INVALID>":
        return literal
    symbolic = recognizer.symbolicNames[token_type]
    return TOKEN_DISPLAY.get(symbolic, symbolic)
