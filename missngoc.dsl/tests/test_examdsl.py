"""Kiểm thử ExamDSL theo từng pha. Chạy: python -m unittest discover -s tests -v"""
import json
import pathlib
import unittest

from dsl import interpreter
from dsl.compiler import compile_file, compile_source
from dsl.domain import names_likely_match, normalize_text_answer

ROOT = pathlib.Path(__file__).resolve().parent.parent
EXAMPLES = ROOT / "examples"


def compile_ok(source: str):
    result = compile_source(source)
    assert result.ok, [str(d) for d in result.diagnostics]
    return result


class LexerParserTest(unittest.TestCase):
    def test_letter_before_id(self):
        result = compile_source('exam "x" { questions 1 options A B C D key { 1 A } }')
        types = [t.type for t in result.tokens]
        self.assertIn("LETTER", types)
        self.assertEqual([t.text for t in result.tokens if t.type == "LETTER"], ["A", "B", "C", "D", "A"])

    def test_operator_precedence(self):
        src = 'exam "x" { questions 1 options A B C D key { 1 A } }\nreview { flag when not answer.status == blank and answer.kind == text or submission.score < 5 }'
        rule = compile_ok(src).ast.review.rules[0].cond
        self.assertEqual(rule.op, "or")              # or thấp nhất
        self.assertEqual(rule.left.op, "and")
        self.assertEqual(type(rule.left.left).__name__, "Not")   # not (a == b)

    def test_vietnamese_strings(self):
        result = compile_ok('exam "Kiểm tra" { questions 1 options A B C D section "Từ vựng" 1 text key { 1 "đúng rồi" } }')
        self.assertEqual(result.info.keys[""][1].values, ["đúng rồi"])


class ErrorExamplesTest(unittest.TestCase):
    """Mỗi file examples/errors/<mã>.exam phải báo đúng một chẩn đoán mang mã đó."""

    def test_each_error_file(self):
        files = sorted((EXAMPLES / "errors").glob("*.exam"))
        self.assertGreaterEqual(len(files), 40)
        for path in files:
            with self.subTest(path.name):
                result = compile_file(path)
                self.assertEqual([d.code for d in result.diagnostics], [path.stem], [str(d) for d in result.diagnostics])

    def test_examples_compile_clean(self):
        for name in ("unit1-3", "unit5-demo", "starters3"):
            with self.subTest(name):
                result = compile_file(EXAMPLES / f"{name}.exam")
                self.assertTrue(result.ok)
                self.assertEqual(result.diagnostics, [])


class PointsAndCodegenTest(unittest.TestCase):
    def test_weight_points(self):
        out = compile_file(EXAMPLES / "unit1-3.exam").outputs()
        items = {i["q"]: i for i in out["keys"]["101"]["items"]}
        self.assertEqual(items[1]["points"], 0.164)     # 10 × 1 / 61
        self.assertEqual(items[22]["points"], 0.328)    # 10 × 2 / 61
        self.assertEqual(items[35]["correct"], ["B", "C"])
        self.assertEqual(items[5], {"q": 5, "kind": "text", "correct": ["eight hours", "8 hours"], "points": 0.164})
        self.assertEqual(sorted(out["keys"]), ["101", "102"])

    def test_score_points(self):
        out = compile_file(EXAMPLES / "unit5-demo.exam").outputs()
        items = out["keys"]["_"]["items"]
        self.assertEqual({i["points"] for i in items}, {0.375, 0.5, 0.625})
        self.assertAlmostEqual(sum(i["points"] for i in items), 10)

    def test_exam_json_matches_dto(self):
        out = compile_file(EXAMPLES / "unit5-demo.exam").outputs()
        self.assertEqual(set(out["exam"]), {"title", "gradingMode", "questionCount", "options", "maxScore", "layoutHint"})
        self.assertEqual(out["exam"]["options"], "ABCD")

    def test_report_defaults(self):
        out = compile_file(EXAMPLES / "starters3.exam").outputs()
        self.assertEqual(out["report"]["scoreBands"][0]["label"], "Giỏi")    # không có khối report → mẫu mặc định
        self.assertEqual(len(out["review"]), 3)                               # luật duyệt mặc định

    def test_dead_rule_removed(self):
        result = compile_ok('exam "x" { questions 1 options A B C D key { 1 A } }\nreview { flag "a" when 1 > 2  flag "b" when answer.status == blank }')
        self.assertEqual([r.message for r in result.rules], ["b"])
        self.assertEqual([d.code for d in result.diagnostics], ["W146"])


class DomainTest(unittest.TestCase):
    def test_normalize_text_answer(self):
        self.assertEqual(normalize_text_answer("  Eight   Hours. "), "eight hours")
        self.assertEqual(normalize_text_answer("“well - known”!"), "well-known")
        self.assertNotEqual(normalize_text_answer("creativty"), normalize_text_answer("creativity"))

    def test_names_likely_match(self):
        self.assertTrue(names_likely_match("Nguyen Minh Anh", "Nguyễn Minh Anh"))
        self.assertFalse(names_likely_match("Hoàng Đức Mạnh", "Hoàng Đức Minh"))
        self.assertTrue(names_likely_match(None, "Ai đó"))


class InterpreterTest(unittest.TestCase):
    SRC = '''exam "x" {
      questions 4  options A B C D  versions 1 2
      section G 1-2 choice  section V 3-4 text
      key 1 { 1-2 A B  3 "eight hours" / "8 hours"  4 "water" }
      key 2 { 1-2 B A  3 "water"  4 "eight hours" }
    }'''

    def sheet(self, answers, name="Trần Gia Bảo", read="Trần Gia Bảo", version="1"):
        return {"student": name, "studentNameRead": read, "versionCodeRead": version,
                "answers": [{"q": q, "choice": c, "text": t, "status": s} for q, c, t, s in answers]}

    def run_one(self, sheet):
        result = compile_ok(self.SRC)
        return interpreter.run(result.info, result.rules, None, [sheet])[0]

    def test_full_marks_and_text_normalization(self):
        r = self.run_one(self.sheet([(1, "A", None, "clear"), (2, "B", None, "clear"),
                                     (3, None, "Eight Hours.", "clear"), (4, None, "water", "clear")]))
        self.assertEqual((r.score, r.correct_count, r.band, r.status), (10.0, 4, "Giỏi", "GRADED"))

    def test_spelling_is_wrong_and_multiple_flags(self):
        r = self.run_one(self.sheet([(1, "A", None, "clear"), (2, None, None, "multiple"),
                                     (3, None, "eigth hours", "clear"), (4, None, "water", "clear")]))
        self.assertEqual(r.correct_count, 2)
        self.assertEqual([(f.rule, f.q) for f in r.flags], [("AI không chắc", 2)])

    def test_version_and_name(self):
        r = self.run_one(self.sheet([(1, "B", None, "clear")], read="Trần Gia Bảy", version="2"))
        self.assertEqual(r.version, "2")
        self.assertTrue(r.name_mismatch)
        r = self.run_one(self.sheet([(1, "B", None, "clear")], version="9"))
        self.assertFalse(r.version_known)
        self.assertIsNone(r.score)
        self.assertIn("Không rõ mã đề", [f.rule for f in r.flags])

    def test_default_rules_match_app_formula(self):
        """Luật mặc định phải cho cùng kết quả với scoring.service.ts: uncertain || nameMismatch || !key."""
        result = compile_file(EXAMPLES / "starters3.exam")
        data = json.loads((EXAMPLES / "sheets" / "unit5-demo.json").read_text(encoding="utf-8"))
        sheets = interpreter.load_sheets(data)
        for s in sheets:   # bộ bài 20 câu, đề 10 câu: chỉ lấy 10 câu đầu
            s["answers"] = [a for a in s["answers"] if a["q"] <= 10 and a["text"] is None]
        for r in interpreter.run(result.info, result.rules, None, sheets):
            app = any(a["status"] in ("multiple", "unclear") for a in r.answers) or r.name_mismatch or not r.version_known
            self.assertEqual(r.status == "NEEDS_REVIEW", app, r.student)


if __name__ == "__main__":
    unittest.main()
