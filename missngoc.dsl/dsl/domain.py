"""Hằng số và hàm chép từ app MissNgoc, để trình biên dịch và bộ thông dịch làm đúng như app.

Nguồn (phải sửa cùng lúc nếu app đổi):
  missngoc.webapp/packages/core/src/domain.ts         OPTION_SETS, MARK_STATUSES, MAX_TEXT_ANSWER
  missngoc.webapp/packages/core/src/answer-key.ts     normalizeTextAnswer
  missngoc.services/api/src/common/text.ts            foldVietnamese, namesLikelyMatch
  missngoc.services/api/src/modules/reports/report-template.ts   REPORT_COLUMNS, DEFAULT_REPORT_TEMPLATE
  missngoc.services/api/src/modules/exams/dto/exam.dto.ts        giới hạn số câu, thang điểm, layoutHint
"""
from __future__ import annotations

import re
import unicodedata

OPTION_SETS = ("ABCD", "ABCDE")
QUESTION_KINDS = ("choice", "text")
MARK_STATUSES = ("clear", "blank", "multiple", "unclear")
UNCERTAIN_STATUSES = ("multiple", "unclear")

MAX_QUESTIONS = 200
MAX_SCORE = 1000
MAX_LAYOUT = 300
MAX_TEXT_ANSWER = 100
MAX_ALTERNATIVES = 10          # AnswerKeyItemDto: @ArrayMaxSize(10)
MAX_BANDS = 8
MAX_BAND_LABEL = 30

REPORT_COLUMNS = ("stt", "studentCode", "fullName", "versionCode", "correctCount", "score", "rank", "note")
STYLE_TARGETS = ("header", "wrongCell", "blankCell", "needsReviewRow")

DEFAULT_REPORT_TEMPLATE = {
    "title": "BẢNG ĐIỂM {className} – {examTitle}",
    "header": {"fill": "#1F4E78", "font": "#FFFFFF", "bold": True},
    "columns": ["stt", "studentCode", "fullName", "correctCount", "score", "rank", "note"],
    "showPerQuestion": True,
    "wrongCell": {"fill": "#FFC7CE", "font": "#9C0006"},
    "blankCell": {"fill": "#EDEDED"},
    "needsReviewRow": {"fill": "#FFF2CC"},
    "scoreBands": [
        {"min": 8.0, "label": "Giỏi", "fill": "#C6EFCE", "font": "#006100"},
        {"min": 6.5, "label": "Khá", "fill": "#DDEBF7", "font": "#1F4E78"},
        {"min": 5.0, "label": "Trung bình", "fill": "#FFEB9C", "font": "#9C5700"},
        {"min": 0, "label": "Cần cố gắng", "fill": "#FFC7CE", "font": "#9C0006"},
    ],
    "freezeHeader": True,
}

# Luật duyệt mặc định: làm đúng như scoring.service.ts hiện nay
#   needsReview = (câu multiple/unclear chưa duyệt) || sub.nameMismatch || !key
DEFAULT_REVIEW_SOURCE = """review {
  flag "AI không chắc"  when answer.status in [unclear, multiple]
  flag "Tên không khớp" when submission.nameMismatch
  flag "Không rõ mã đề" when not submission.versionKnown
}"""

_QUOTES_SINGLE = re.compile(r"[‘’`´]")
_QUOTES_DOUBLE = re.compile(r"[“”\"]")
_DASH = re.compile(r"\s*-\s*")
_SPACES = re.compile(r"\s+")
_TRAILING_PUNCT = re.compile(r"[.,!?;:]+$")


def normalize_text_answer(value: str) -> str:
    """Giống normalizeTextAnswer: bỏ khác biệt hoa/thường, khoảng trắng, dấu câu cuối. Không sửa chính tả."""
    v = unicodedata.normalize("NFC", value)
    v = _QUOTES_SINGLE.sub("'", v)
    v = _QUOTES_DOUBLE.sub("", v)
    v = v.lower()
    v = _DASH.sub("-", v)
    v = _SPACES.sub(" ", v).strip()
    v = _TRAILING_PUNCT.sub("", v)
    return v.strip()


def fold_vietnamese(value: str) -> str:
    """Giống foldVietnamese: bỏ dấu, đ → d, chữ thường, gộp khoảng trắng."""
    v = unicodedata.normalize("NFD", value)
    v = "".join(ch for ch in v if not ("̀" <= ch <= "ͯ"))
    v = v.replace("đ", "d").replace("Đ", "D").lower()
    return _SPACES.sub(" ", v).strip()


def names_likely_match(read_name: str | None, student_name: str) -> bool:
    """Giống namesLikelyMatch: tên (chữ cuối) của học sinh phải có trong tên AI đọc được."""
    if not read_name:
        return True
    read_tokens = fold_vietnamese(read_name).split(" ")
    given = fold_vietnamese(student_name).split(" ")[-1]
    return given in read_tokens


def clean_text(value) -> str | None:
    if value is None:
        return None
    t = _SPACES.sub(" ", str(value)).strip()
    return t or None


def format_ranges(questions) -> str:
    """[5, 6, 7, 8, 18, 19] → "5-8, 18-19" (giống formatQuestionRanges của app)."""
    qs = sorted(set(questions))
    parts, i = [], 0
    while i < len(qs):
        start = qs[i]
        while i + 1 < len(qs) and qs[i + 1] == qs[i] + 1:
            i += 1
        parts.append(str(start) if start == qs[i] else f"{start}-{qs[i]}")
        i += 1
    return ", ".join(parts)
