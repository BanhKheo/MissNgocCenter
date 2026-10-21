"""Sinh mã: chuyển AST đã kiểm tra thành JSON đúng định dạng API MissNgoc đang nhận.

    exam.json        POST /api/v1/exams                         (ExamCreateRequestDto, thiếu classId và examDate)
    keys/<mã>.json   PUT  /api/v1/exams/{id}/answer-keys/{mã}   (AnswerKeyPutRequestDto; mã chung là "_")
    report.json      PUT  /api/v1/report-templates/default      (body { config: ReportTemplateConfig })
    review.json      luật duyệt dạng cây JSON, cho bộ thông dịch (và app, ở bản mở rộng)
"""
from __future__ import annotations

import copy
import re
from typing import Optional

from ..ast_nodes import Binary, Count, Expr, In, Lit, Name, Not, Ref, Report, Rule
from ..domain import DEFAULT_REPORT_TEMPLATE, REPORT_COLUMNS
from ..semantic import ExamInfo

COLOR_RE = re.compile(r"^#[0-9A-F]{6}$")


def exam_json(info: ExamInfo) -> dict:
    body = {
        "title": info.title,
        "gradingMode": "AI",
        "questionCount": info.questions,
        "options": "".join(info.options),
        "maxScore": info.max,
    }
    if info.layout:
        body["layoutHint"] = info.layout
    return body


def answer_keys_json(info: ExamInfo) -> dict:
    """{mã đề: {"items": [...]}}. Mã đề chung ("") ghi là "_" như trên URL của app."""
    out = {}
    for code, items in info.keys.items():
        rows = []
        for q in sorted(items):
            ans = items[q]
            if ans.kind == "choice":
                correct = sorted(set(ans.values))
            else:
                correct = list(dict.fromkeys(" ".join(v.split()) for v in ans.values))
            rows.append({"q": q, "kind": info.kind(q), "correct": correct, "points": float(info.points[q])})
        out[code or "_"] = {"items": rows}
    return out


def _style(style, with_font: bool = True) -> dict:
    d = {"fill": style.fill.upper()}
    if with_font and style.font:
        d["font"] = style.font.upper()
    return d


def report_json(report: Optional[Report]) -> dict:
    """ReportTemplateConfig đầy đủ: trường nào file không ghi thì lấy từ mẫu mặc định của app."""
    config = copy.deepcopy(DEFAULT_REPORT_TEMPLATE)
    if report is None:
        return config
    if report.title:
        config["title"] = report.title
    if report.columns:
        config["columns"] = list(report.columns)
    for decl in report.styles:
        if decl.target == "header":
            config["header"] = {**_style(decl.style), "bold": True}
            config["header"].setdefault("font", "#FFFFFF")
        elif decl.target == "needsReviewRow":
            config["needsReviewRow"] = _style(decl.style, with_font=False)
        else:
            config[decl.target] = _style(decl.style)
    if report.bands:
        config["scoreBands"] = [
            {"min": 0 if b.min is None else b.min, "label": b.label, "fill": b.style.fill.upper(),
             "font": (b.style.font or "#000000").upper()}
            for b in report.bands
        ]
    validate_report(config)
    return config


def validate_report(config: dict):
    """Kiểm tra lại đầu ra theo ReportTemplateSchema của app: trình biên dịch không được sinh ra thứ app từ chối."""
    colors = [config["header"]["fill"], config["header"]["font"], config["wrongCell"]["fill"],
              config["blankCell"]["fill"], config["needsReviewRow"]["fill"]]
    colors += [c for k in ("wrongCell", "blankCell") for c in [config[k].get("font")] if c]
    for b in config["scoreBands"]:
        colors += [b["fill"], b["font"]]
        assert 1 <= len(b["label"]) <= 30 and b["min"] >= 0, b
    assert all(COLOR_RE.match(c) for c in colors), colors
    assert config["columns"] and all(c in REPORT_COLUMNS for c in config["columns"])
    assert 1 <= len(config["scoreBands"]) <= 8
    assert 1 <= len(config["title"]) <= 200


def expr_json(e: Expr) -> dict:
    if isinstance(e, Lit):
        return {"lit": e.value}
    if isinstance(e, Name):
        return {"name": e.id, "of": e.resolved}
    if isinstance(e, Ref):
        return {"ref": f"{e.obj}.{e.field}"}
    if isinstance(e, Count):
        return {"count": expr_json(e.cond)}
    if isinstance(e, Not):
        return {"not": expr_json(e.operand)}
    if isinstance(e, In):
        return {"in": [expr_json(e.value), [expr_json(i) for i in e.items]]}
    if isinstance(e, Binary):
        return {"op": e.op, "args": [expr_json(e.left), expr_json(e.right)]}
    raise TypeError(type(e).__name__)


def review_json(rules: list[Rule]) -> list[dict]:
    return [{"message": r.message, "scope": r.scope, "when": expr_json(r.cond)} for r in rules]


def expr_text(e: Expr) -> str:
    """In lại biểu thức sau tối ưu, để người đọc thấy luật thật sự được chạy."""
    if isinstance(e, Lit):
        v = e.value
        if v is None or isinstance(v, bool):
            return {True: "true", False: "false", None: "none"}[v]
        return f'"{v}"' if isinstance(v, str) else str(v)
    if isinstance(e, Name):
        return e.id
    if isinstance(e, Ref):
        return f"{e.obj}.{e.field}"
    if isinstance(e, Count):
        return f"count({expr_text(e.cond)})"
    if isinstance(e, Not):
        return f"not {expr_text(e.operand)}"
    if isinstance(e, In):
        return f"{expr_text(e.value)} in [{', '.join(expr_text(i) for i in e.items)}]"
    if isinstance(e, Binary):
        def side(sub: Expr) -> str:
            # `or` có độ ưu tiên thấp nhất: nằm trong `and` thì phải giữ ngoặc
            text = expr_text(sub)
            return f"({text})" if e.op == "and" and isinstance(sub, Binary) and sub.op == "or" else text
        return f"{side(e.left)} {e.op} {side(e.right)}"
    raise TypeError(type(e).__name__)
