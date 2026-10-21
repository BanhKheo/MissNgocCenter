"""Bộ thông dịch: chấm điểm và chạy luật duyệt trên kết quả AI đọc, không cần app.

Đầu vào là JSON giống các file trong missngoc.services/api/data/manual-extractions/:
    {"submissions": [{"studentName": "...", "raw": {"studentNameRead", "versionCodeRead", "answers": [...]}}]}
hoặc một danh sách các bài dạng {"studentName", "studentNameRead", "versionCodeRead", "answers"}.

Mỗi bước làm đúng như app, để kiểm thử đối chiếu được (cùng đáp án, cùng bài → cùng điểm):
    chuẩn hoá       normalize.ts       normalizeSheet
    chọn mã đề      grading.processor  versionCodeRead khớp mã đã khai báo
    chấm điểm       scoring.ts         scoreSubmission, isAnswerCorrect, roundScore
    xếp loại        report-template.ts bandFor (quy về thang 10)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Optional

from .ast_nodes import Binary, Count, Expr, In, Lit, Name, Not, Ref, Rule
from .domain import (
    DEFAULT_REPORT_TEMPLATE, UNCERTAIN_STATUSES, clean_text, names_likely_match, normalize_text_answer,
)
from .semantic import ExamInfo


@dataclass
class Flag:
    rule: str
    q: Optional[int] = None

    def to_dict(self) -> dict:
        return {"rule": self.rule, "q": self.q} if self.q is not None else {"rule": self.rule}


@dataclass
class SheetResult:
    student: str
    version: Optional[str]
    version_known: bool
    name_mismatch: bool
    score: Optional[float]
    correct_count: Optional[int]
    band: Optional[str]
    flags: list[Flag] = field(default_factory=list)
    answers: list[dict] = field(default_factory=list)

    @property
    def status(self) -> str:
        return "NEEDS_REVIEW" if self.flags else "GRADED"

    def to_dict(self, with_answers: bool = False) -> dict:
        d = {
            "student": self.student, "version": self.version, "versionKnown": self.version_known,
            "nameMismatch": self.name_mismatch, "score": self.score, "correctCount": self.correct_count,
            "band": self.band, "status": self.status, "flags": [f.to_dict() for f in self.flags],
        }
        if with_answers:
            d["answers"] = self.answers
        return d


# ───────────────────────── đọc file bài làm

def load_sheets(data: Any) -> list[dict]:
    items = data.get("submissions", []) if isinstance(data, dict) else data
    sheets = []
    for i, item in enumerate(items, 1):
        raw = item.get("raw", item)
        sheets.append({
            "student": item.get("studentName") or item.get("student") or f"Bài {i}",
            "studentNameRead": raw.get("studentNameRead"),
            "versionCodeRead": raw.get("versionCodeRead"),
            "answers": raw.get("answers", []),
        })
    return sheets


def mask_names(sheets: list[dict]) -> list[dict]:
    """Che họ tên thật trước khi đưa kết quả vào báo cáo: HS 01, HS 02…"""
    out = []
    for i, s in enumerate(sheets, 1):
        alias = f"HS {i:02d}"
        out.append({**s, "student": alias, "studentNameRead": alias if s.get("studentNameRead") else None})
    return out


# ───────────────────────── chuẩn hoá (normalizeSheet)

def _choice_or_none(value) -> Optional[str]:
    """File chấm tay ghi "-" cho ô trống; AI trả null."""
    v = clean_text(value)
    return None if v in (None, "-") else v


def normalize_sheet(sheet: dict, info: ExamInfo) -> dict:
    n, options = info.questions, info.options
    by_q: dict[int, list] = {}
    for a in sheet["answers"]:
        q = a.get("q")
        if isinstance(q, int) and 1 <= q <= n:
            by_q.setdefault(q, []).append(a)
    answers = []
    for q in range(1, n + 1):
        is_text = info.kind(q) == "text"
        empty = {"q": q, "choice": None, "text": None, "status": "unclear"}
        found = by_q.get(q)
        if not found:
            answers.append(empty)
            continue
        if len(found) > 1 and any((f.get("choice"), f.get("text"), f.get("status")) != (found[0].get("choice"), found[0].get("text"), found[0].get("status")) for f in found):
            answers.append(empty)
            continue
        a = found[0]
        status = a.get("status")
        if is_text:
            text = clean_text(a.get("text"))
            if status == "clear":
                answers.append({"q": q, "choice": None, "text": text, "status": "clear" if text else "unclear"})
            elif status == "blank":
                answers.append({"q": q, "choice": None, "text": text, "status": "unclear" if text else "blank"})
            elif status == "multiple":
                answers.append({"q": q, "choice": None, "text": None, "status": "multiple"})
            else:
                answers.append({"q": q, "choice": None, "text": text, "status": "unclear"})
        else:
            raw = _choice_or_none(a.get("choice"))
            choice = raw if raw in options else None
            if raw and not choice:
                answers.append({"q": q, "choice": None, "text": None, "status": "unclear"})
            elif status == "clear":
                answers.append({"q": q, "choice": choice, "text": None, "status": "clear" if choice else "unclear"})
            elif status == "blank":
                answers.append({"q": q, "choice": choice, "text": None, "status": "unclear" if choice else "blank"})
            elif status == "multiple":
                answers.append({"q": q, "choice": None, "text": None, "status": "multiple"})
            else:
                answers.append({"q": q, "choice": choice, "text": None, "status": "unclear"})
    return {
        "studentNameRead": clean_text(sheet.get("studentNameRead")),
        "versionCodeRead": clean_text(sheet.get("versionCodeRead")),
        "answers": answers,
    }


# ───────────────────────── chấm điểm (scoreSubmission)

def is_answer_correct(kind: str, correct: list[str], chosen: Optional[str]) -> bool:
    if chosen is None:
        return False
    if kind == "text":
        got = normalize_text_answer(chosen)
        return got != "" and any(normalize_text_answer(c) == got for c in correct)
    return chosen in correct


def round_score(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def band_for(bands: list[dict], score: float, max_score: float) -> Optional[str]:
    if not bands:
        return None
    scaled = score / max_score * 10 if max_score > 0 else score
    ordered = sorted(bands, key=lambda b: b["min"], reverse=True)
    for b in ordered:
        if scaled >= b["min"] - 1e-9:
            return b["label"]
    return ordered[-1]["label"]


# ───────────────────────── đánh giá biểu thức

class Env:
    def __init__(self, sub: dict, answers: list[dict]):
        self.sub = sub
        self.answers = answers
        self.answer: Optional[dict] = None
        self._count_cache: dict[int, int] = {}   # mỗi count(...) chỉ tính một lần cho mỗi bài


def evaluate(e: Expr, env: Env) -> Any:
    if isinstance(e, Lit):
        return e.value
    if isinstance(e, Name):
        return e.id
    if isinstance(e, Ref):
        return env.answer[e.field] if e.obj == "answer" else env.sub[e.field]
    if isinstance(e, Count):
        key = id(e)
        if key not in env._count_cache:
            saved, total = env.answer, 0
            for a in env.answers:
                env.answer = a
                total += 1 if evaluate(e.cond, env) else 0
            env.answer = saved
            env._count_cache[key] = total
        return env._count_cache[key]
    if isinstance(e, Not):
        return not evaluate(e.operand, env)
    if isinstance(e, In):
        value = evaluate(e.value, env)
        return any(value == evaluate(i, env) for i in e.items)
    if isinstance(e, Binary):
        if e.op == "and":
            return bool(evaluate(e.left, env)) and bool(evaluate(e.right, env))
        if e.op == "or":
            return bool(evaluate(e.left, env)) or bool(evaluate(e.right, env))
        l, r = evaluate(e.left, env), evaluate(e.right, env)
        if e.op == "==":
            return l == r
        if e.op == "!=":
            return l != r
        if l is None or r is None:
            return False
        return {"<": l < r, "<=": l <= r, ">": l > r, ">=": l >= r}[e.op]
    raise TypeError(f"Node lạ: {type(e).__name__}")


# ───────────────────────── chạy cả lớp

def run(info: ExamInfo, rules: list[Rule], bands: Optional[list[dict]], sheets: list[dict]) -> list[SheetResult]:
    bands = bands if bands is not None else DEFAULT_REPORT_TEMPLATE["scoreBands"]
    versions = list(info.keys)
    results = []
    for sheet in sheets:
        norm = normalize_sheet(sheet, info)
        if len(versions) == 1:
            version = versions[0]
        else:
            read = (norm["versionCodeRead"] or "").upper().replace(" ", "")
            version = read if read in info.keys else None
        key = info.keys.get(version) if version is not None else None
        name_mismatch = not names_likely_match(norm["studentNameRead"], sheet["student"])

        answers, score, correct_count = [], None, None
        total = Decimal(0)
        for a in norm["answers"]:
            q = a["q"]
            final = None if a["status"] == "multiple" else (a["text"] if a["text"] is not None else a["choice"])
            ok = False
            if key is not None:
                ans = key[q]
                correct = sorted(set(ans.values)) if ans.kind == "choice" else ans.values
                ok = is_answer_correct(info.kind(q), correct, final)
                if ok:
                    total += info.points[q]
            sec = info.section_of.get(q)
            answers.append({
                "q": q, "status": a["status"], "kind": info.kind(q), "section": sec.name if sec else None,
                "choice": final, "correct": ok, "points": float(info.points[q]),
            })
        if key is not None:
            score = round_score(total)
            correct_count = sum(1 for a in answers if a["correct"])

        sub = {"nameMismatch": name_mismatch, "versionKnown": key is not None, "score": score}
        env = Env(sub, answers)
        flags: list[Flag] = []
        for rule in rules:
            label = rule.message or "Cần duyệt"
            if rule.scope == "submission":
                env.answer = None
                if evaluate(rule.cond, env):
                    flags.append(Flag(label))
            else:
                for a in answers:
                    env.answer = a
                    if evaluate(rule.cond, env):
                        flags.append(Flag(label, a["q"]))
                env.answer = None
        results.append(SheetResult(
            student=sheet["student"], version=version or ("" if key is not None else None),
            version_known=key is not None, name_mismatch=name_mismatch, score=score,
            correct_count=correct_count, band=band_for(bands, score, info.max) if score is not None else None,
            flags=flags, answers=answers,
        ))
    return results


def summarize(results: list[SheetResult], rules: list[Rule]) -> dict:
    """Số bài cần duyệt, số cờ theo từng luật, và số câu không chắc lọt qua mà không bị gắn cờ."""
    need = sum(1 for r in results if r.flags)
    per_rule = {}
    for rule in rules:
        label = rule.message or "Cần duyệt"
        per_rule[label] = {
            "flags": sum(1 for r in results for f in r.flags if f.rule == label),
            "submissions": sum(1 for r in results if any(f.rule == label for f in r.flags)),
        }
    unflagged_uncertain = 0
    for r in results:
        flagged_qs = {f.q for f in r.flags if f.q is not None}
        whole = any(f.q is None for f in r.flags)
        for a in r.answers:
            if a["status"] in UNCERTAIN_STATUSES and not whole and a["q"] not in flagged_qs:
                unflagged_uncertain += 1
    scores = [r.score for r in results if r.score is not None]
    return {
        "submissions": len(results),
        "needsReview": need,
        "needsReviewPercent": round(100 * need / len(results), 1) if results else 0,
        "perRule": per_rule,
        "uncertainNotFlagged": unflagged_uncertain,
        "averageScore": round(sum(scores) / len(scores), 2) if scores else None,
    }
