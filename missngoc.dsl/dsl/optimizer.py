"""Pha tối ưu: chạy sau khi kiểm tra ngữ nghĩa không còn lỗi.

  1. Tính sẵn điểm từng câu lúc biên dịch (gộp hằng): app chỉ nhận con số cuối cùng.
  2. Gộp hằng trong biểu thức review: `1 > 2` → false, `x and false` → false, `x and true` → x.
  3. Loại luật chết: luật luôn sai bị bỏ khỏi đầu ra (W146). Luật luôn đúng được giữ nhưng cảnh báo (W147).
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from .ast_nodes import Binary, Count, Expr, In, Lit, Not, Rule
from .domain import format_ranges
from .errors import WARNING, Diagnostic
from .semantic import ExamInfo, fmt_num

THOUSANDTH = Decimal("0.001")


def round3(x: Decimal) -> Decimal:
    """Cột points là Decimal(6,3): làm tròn 3 chữ số, nửa lên như Postgres."""
    return x.quantize(THOUSANDTH, rounding=ROUND_HALF_UP)


def compute_points(info: ExamInfo, span=None) -> tuple[dict, list[Diagnostic]]:
    """Điểm từng câu.

    weight (mặc định 1):  điểm câu q = max × w(q) / Σ w
    score:                điểm câu q = score(phần) / số câu của phần
    """
    n = info.questions
    mx = Decimal(str(info.max))
    points: dict[int, Decimal] = {}
    if any(s.score is not None for s in info.sections):
        size = {}
        for q in range(1, n + 1):
            sec = info.section_of[q]
            size[sec.name] = size.get(sec.name, 0) + 1
        for q in range(1, n + 1):
            sec = info.section_of[q]
            points[q] = round3(Decimal(str(sec.score)) / size[sec.name])
    else:
        weights = {q: Decimal(str(info.section_of[q].weight)) if q in info.section_of and info.section_of[q].weight is not None
                   else Decimal(1) for q in range(1, n + 1)}
        total_w = sum(weights.values())
        for q in range(1, n + 1):
            points[q] = round3(mx * weights[q] / total_w)

    warnings = []
    total = sum(points.values())
    if abs(total - mx) >= Decimal("0.005"):
        warnings.append(Diagnostic.at(WARNING, "optimize", "W117",
                                      f"Tổng điểm các câu sau làm tròn là {fmt_num(float(total))}, lệch {fmt_num(float(abs(total - mx)))} so với max {fmt_num(info.max)}",
                                      span))
    return points, warnings


def fold(e: Expr) -> Expr:
    """Gộp hằng từ dưới lên. Trả về node mới hoặc chính node cũ."""
    if isinstance(e, Binary):
        left, right = fold(e.left), fold(e.right)
        if e.op in ("and", "or"):
            for a, b in ((left, right), (right, left)):
                if isinstance(a, Lit):
                    if e.op == "and":
                        return Lit(value=False, type="bool", span=e.span) if a.value is False else b
                    return Lit(value=True, type="bool", span=e.span) if a.value is True else b
        elif isinstance(left, Lit) and isinstance(right, Lit):
            l, r = left.value, right.value
            if e.op in ("==", "!="):
                value = (l == r) if e.op == "==" else (l != r)
            elif l is None or r is None:
                value = False
            else:
                value = {"<": l < r, "<=": l <= r, ">": l > r, ">=": l >= r}[e.op]
            return Lit(value=value, type="bool", span=e.span)
        return Binary(op=e.op, left=left, right=right, type=e.type, span=e.span)
    if isinstance(e, Not):
        operand = fold(e.operand)
        if isinstance(operand, Lit):
            return Lit(value=not operand.value, type="bool", span=e.span)
        return Not(operand=operand, type=e.type, span=e.span)
    if isinstance(e, In):
        value, items = fold(e.value), [fold(i) for i in e.items]
        if isinstance(value, Lit) and all(isinstance(i, Lit) for i in items):
            return Lit(value=value.value in [i.value for i in items], type="bool", span=e.span)
        return In(value=value, items=items, type=e.type, span=e.span)
    if isinstance(e, Count):
        cond = fold(e.cond)
        return Count(cond=cond, type=e.type, span=e.span)
    return e


def optimize_rules(rules: list[Rule]) -> tuple[list[Rule], list[Diagnostic]]:
    out, warnings = [], []
    for rule in rules:
        cond = fold(rule.cond)
        label = f"\"{rule.message}\"" if rule.message else "này"
        if isinstance(cond, Lit) and cond.value is False:
            warnings.append(Diagnostic.at(WARNING, "optimize", "W146", f"Luật {label} luôn sai, không bao giờ gắn cờ: đã bỏ khỏi đầu ra", rule.span))
            continue
        if isinstance(cond, Lit) and cond.value is True:
            who = "mọi câu" if rule.scope == "answer" else "mọi bài"
            warnings.append(Diagnostic.at(WARNING, "optimize", "W147", f"Luật {label} luôn đúng: {who} đều bị gắn cờ", rule.span))
        out.append(Rule(message=rule.message, cond=cond, scope=rule.scope, span=rule.span))
    return out, warnings


def layout_ranges(questions) -> str:
    """Gộp các câu liền nhau để in gọn: [1,2,3,4,9,10] → "1-4, 9-10"."""
    return format_ranges(questions)
