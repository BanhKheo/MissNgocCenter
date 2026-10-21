"""Dòng lệnh của ExamDSL.

    python cli.py check     examples/unit1-3.exam                  báo lỗi và cảnh báo
    python cli.py tokens    examples/unit1-3.exam                  in dãy token (pha từ vựng)
    python cli.py ast       examples/unit1-3.exam                  in AST dạng JSON
    python cli.py emit      examples/unit1-3.exam --out build/     exam.json, keys/*.json, report.json, review.json
    python cli.py simulate  examples/unit5-demo.exam --sheets examples/sheets/unit5-demo.json [--mask] [--json]
    python cli.py push      examples/unit5-demo.exam --api http://localhost:3000/api/v1 --class <id> --date 2026-10-25 [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys

from dsl import interpreter
from dsl.compiler import compile_file
from dsl.push import PushError, push


def report_diagnostics(path: str, result) -> None:
    for d in result.diagnostics:
        print(f"{path}:{d}")


def compile_or_exit(path: str):
    result = compile_file(path)
    report_diagnostics(path, result)
    if not result.ok:
        n = len(result.errors())
        print(f"Có {n} lỗi ở pha {result.stage}: sửa xong mới sinh mã được.")
        sys.exit(1)
    return result


def cmd_check(args):
    result = compile_file(args.file)
    report_diagnostics(args.file, result)
    if result.ok:
        info = result.info
        warnings = len(result.diagnostics)
        print(f"OK: \"{info.title}\" · {info.questions} câu · {len(info.keys)} mã đề · "
              f"{len(result.rules)} luật duyệt" + (f" · {warnings} cảnh báo" if warnings else ""))
    return 0 if result.ok else 1


def cmd_tokens(args):
    result = compile_file(args.file)
    for t in result.tokens:
        print(f"{t.line:>4}:{t.column:<4} {t.type:<16} {t.text}")
    return 0


def cmd_ast(args):
    from dsl.compiler import to_dict
    result = compile_file(args.file)
    if result.ast is None:
        report_diagnostics(args.file, result)
        return 1
    print(json.dumps(to_dict(result.ast), ensure_ascii=False, indent=2))
    return 0


def cmd_emit(args):
    result = compile_or_exit(args.file)
    out = pathlib.Path(args.out)
    (out / "keys").mkdir(parents=True, exist_ok=True)
    outputs = result.outputs()
    write = lambda p, data: p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write(out / "exam.json", outputs["exam"])
    for code, body in outputs["keys"].items():
        write(out / "keys" / f"{code}.json", body)
    write(out / "report.json", outputs["report"])
    write(out / "review.json", outputs["review"])
    print(f"Đã ghi {out}/exam.json, {len(outputs['keys'])} file đáp án, report.json, review.json")
    return 0


def cmd_simulate(args):
    result = compile_or_exit(args.file)
    data = json.loads(pathlib.Path(args.sheets).read_text(encoding="utf-8"))
    sheets = interpreter.load_sheets(data)
    if args.mask:
        sheets = interpreter.mask_names(sheets)
    bands = result.outputs()["report"]["scoreBands"]
    results = interpreter.run(result.info, result.rules, bands, sheets)
    summary = interpreter.summarize(results, result.rules)
    if args.json:
        print(json.dumps({"summary": summary, "results": [r.to_dict() for r in results]}, ensure_ascii=False, indent=2))
        return 0
    print(f"{'Học sinh':<24} {'Mã đề':<6} {'Điểm':>5}  {'Xếp loại':<12} {'Trạng thái':<12} Lý do")
    for r in results:
        reasons = {}
        for f in r.flags:
            reasons.setdefault(f.rule, []).append(f.q)
        why = "; ".join(f"{k}" + (f" (câu {', '.join(str(q) for q in qs if q)})" if any(qs) else "") for k, qs in reasons.items())
        score = "—" if r.score is None else f"{r.score:g}"
        status = "Cần duyệt" if r.flags else "Đã chấm"
        version = "?" if r.version is None else (r.version or "chung")
        print(f"{r.student[:24]:<24} {version:<6} {score:>5}  {(r.band or '—'):<12} {status:<12} {why}")
    print()
    print(f"Cần duyệt: {summary['needsReview']}/{summary['submissions']} bài ({summary['needsReviewPercent']}%)"
          f" · điểm trung bình {summary['averageScore']}")
    for label, s in summary["perRule"].items():
        print(f"  {label}: {s['submissions']} bài, {s['flags']} cờ")
    print(f"Câu AI không chắc mà không bị gắn cờ: {summary['uncertainNotFlagged']}")
    return 0


def cmd_push(args):
    result = compile_or_exit(args.file)
    user = os.environ.get("MISSNGOC_USER", "admin")
    password = os.environ.get("MISSNGOC_PASSWORD")
    if not password and not args.dry_run:
        print("Đặt mật khẩu vào biến môi trường MISSNGOC_PASSWORD (và MISSNGOC_USER nếu không phải admin)")
        return 1
    try:
        exam_id = push(result.outputs(), api=args.api, user=user, password=password or "", class_id=args.class_id,
                       exam_date=args.date, exam_id=args.exam, with_report=args.with_report, dry_run=args.dry_run)
    except PushError as exc:
        print(f"Lỗi: {exc}")
        return 1
    if exam_id and not args.dry_run:
        print(f"Xong. Mở app → Bài kiểm tra → \"{result.info.title}\" (id {exam_id})")
    return 0


def main(argv=None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")   # console Windows mặc định cp1252, không in được tiếng Việt
    ap = argparse.ArgumentParser(prog="examdsl", description="Trình biên dịch ExamDSL cho MissNgoc")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name, fn, helptext in (("check", cmd_check, "báo lỗi"), ("tokens", cmd_tokens, "in token"), ("ast", cmd_ast, "in AST")):
        p = sub.add_parser(name, help=helptext)
        p.add_argument("file")
        p.set_defaults(fn=fn)
    p = sub.add_parser("emit", help="sinh JSON cho API")
    p.add_argument("file")
    p.add_argument("--out", default="build")
    p.set_defaults(fn=cmd_emit)
    p = sub.add_parser("simulate", help="chấm và chạy luật duyệt trên kết quả AI đọc")
    p.add_argument("file")
    p.add_argument("--sheets", required=True, help="JSON bài làm, ví dụ data/manual-extractions/*.json")
    p.add_argument("--mask", action="store_true", help="che họ tên thành HS 01, HS 02…")
    p.add_argument("--json", action="store_true")
    p.set_defaults(fn=cmd_simulate)
    p = sub.add_parser("push", help="đẩy đề và đáp án vào app")
    p.add_argument("file")
    p.add_argument("--api", default="http://localhost:3000/api/v1")
    p.add_argument("--class", dest="class_id")
    p.add_argument("--date")
    p.add_argument("--exam", help="id bài đã có: chỉ cập nhật bài và đáp án")
    p.add_argument("--with-report", action="store_true", help="ghi cả mẫu bảng điểm (dùng chung cả trung tâm)")
    p.add_argument("--dry-run", action="store_true")
    p.set_defaults(fn=cmd_push)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
