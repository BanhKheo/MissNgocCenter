"""API cho trang soạn đề ExamDSL.

    POST /api/compile          mã nguồn → token, AST, lỗi, JSON sinh ra, bản xem trước
    POST /api/simulate         mã nguồn + bộ bài làm mẫu → điểm, xếp loại, cờ duyệt, tổng hợp
    GET  /api/examples         các file .exam mẫu (kể cả examples/errors)
    GET  /api/examples/{name}
    GET  /api/sheets           các bộ bài làm mẫu (examples/sheets/*.json)
    GET  /api/grammar          grammar ANTLR

Chạy: python run.py   (hoặc: uvicorn server.app:app --reload)
"""
from __future__ import annotations

import json
import pathlib
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from dsl import interpreter
from dsl.compiler import compile_source

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
EXAMPLES = ROOT / "examples"
SHEETS = EXAMPLES / "sheets"
GRAMMAR = ROOT / "grammar" / "ExamDSL.g4"

app = FastAPI(title="ExamDSL", version="1.0")


class CompileRequest(BaseModel):
    source: str


class SimulateRequest(BaseModel):
    source: str
    sheets: Optional[str] = None            # tên bộ bài mẫu
    data: Optional[Any] = None              # hoặc JSON bài làm gửi kèm
    mask: bool = True


@app.post("/api/compile")
def api_compile(req: CompileRequest):
    return compile_source(req.source).to_dict()


@app.post("/api/simulate")
def api_simulate(req: SimulateRequest):
    result = compile_source(req.source)
    if not result.ok:
        raise HTTPException(422, {"message": "Sửa hết lỗi trước khi mô phỏng",
                                  "diagnostics": [d.to_dict() for d in result.errors()]})
    if req.data is not None:
        data = req.data
    else:
        path = sheet_files().get(req.sheets or "")
        if path is None:
            raise HTTPException(404, f"Không có bộ bài mẫu '{req.sheets}'")
        data = json.loads(path.read_text(encoding="utf-8"))
    sheets = interpreter.load_sheets(data)
    if req.mask:
        sheets = interpreter.mask_names(sheets) if req.data is not None else sheets
    results = interpreter.run(result.info, result.rules, result.outputs()["report"]["scoreBands"], sheets)
    return {
        "summary": interpreter.summarize(results, result.rules),
        "results": [r.to_dict(with_answers=True) for r in results],
    }


def example_files() -> dict[str, pathlib.Path]:
    files = {p.stem: p for p in sorted(EXAMPLES.glob("*.exam"))}
    files.update({f"errors/{p.stem}": p for p in sorted((EXAMPLES / "errors").glob("*.exam"))})
    return files


def sheet_files() -> dict[str, pathlib.Path]:
    return {p.stem: p for p in sorted(SHEETS.glob("*.json"))}


@app.get("/api/examples")
def api_examples():
    items = []
    for name, path in example_files().items():
        first = path.read_text(encoding="utf-8").splitlines()[:1]
        title = first[0].lstrip("/ ").strip() if first and first[0].startswith("//") else name
        items.append({"name": name, "title": title})
    return items


@app.get("/api/examples/{name:path}")
def api_example(name: str):
    path = example_files().get(name)
    if path is None:
        raise HTTPException(404, f"Không có file mẫu '{name}'")
    return {"name": name, "source": path.read_text(encoding="utf-8")}


@app.get("/api/sheets")
def api_sheets():
    return [{"name": n} for n in sheet_files()]


@app.get("/api/grammar")
def api_grammar():
    return {"grammar": GRAMMAR.read_text(encoding="utf-8")}


@app.get("/")
def index():
    return FileResponse(WEB / "index.html")


app.mount("/", StaticFiles(directory=WEB), name="web")
