"""Sinh lại lexer/parser/visitor ANTLR từ grammar/ExamDSL.g4.

Chạy:  python tools/gen_parser.py
Cần:   Java 8+ trên PATH. Bản runtime (antlr4-python3-runtime) phải trùng bản jar (4.9.2),
       nếu không sẽ gặp lỗi "Could not deserialize ATN".
"""
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
JAR = ROOT / "tools" / "antlr-4.9.2-complete.jar"
GRAMMAR = ROOT / "grammar" / "ExamDSL.g4"
OUT = ROOT / "dsl" / "generated"


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # console Windows mặc định cp1252, không in được tiếng Việt
    OUT.mkdir(parents=True, exist_ok=True)
    cmd = [
        "java", "-jar", str(JAR),
        "-Dlanguage=Python3",
        "-visitor", "-no-listener",
        "-encoding", "UTF-8",
        "-Xexact-output-dir",
        "-o", str(OUT),
        str(GRAMMAR),
    ]
    print(" ".join(cmd))
    result = subprocess.run(cmd)
    if result.returncode == 0:
        (OUT / "__init__.py").touch()
        print(f"Đã sinh parser vào {OUT}")
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
