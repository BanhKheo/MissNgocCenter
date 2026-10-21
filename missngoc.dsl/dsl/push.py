"""Đẩy kết quả biên dịch vào app MissNgoc qua REST API (không cần sửa backend).

    1. POST /auth/login                               lấy accessToken
    2. POST /exams            (hoặc PATCH /exams/{id} khi có --exam)
    3. PUT  /exams/{id}/answer-keys/{mã}              mỗi mã đề một lần; mã chung là "_"
    4. PUT  /report-templates/default                 chỉ khi có --with-report (mẫu dùng chung cả trung tâm)

Tài khoản đọc từ biến môi trường MISSNGOC_USER và MISSNGOC_PASSWORD; cần quyền EXAM.AD (và SYS.AD nếu gửi report).
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Callable, Optional


class PushError(Exception):
    pass


class Api:
    def __init__(self, base: str, log: Callable[[str], None]):
        self.base = base.rstrip("/")
        self.token: Optional[str] = None
        self.log = log

    def call(self, method: str, path: str, body=None):
        url = self.base + path
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8")
                payload = json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            try:
                detail = json.loads(detail).get("message", detail)
            except ValueError:
                pass
            raise PushError(f"{method} {path} → {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise PushError(f"Không kết nối được {url}: {exc.reason}") from exc
        # ResponseInterceptor của app bọc JSON thành { status, data, timestamp, path }
        return payload.get("data", payload) if isinstance(payload, dict) else payload


def push(outputs: dict, *, api: str, user: str, password: str, class_id: Optional[str], exam_date: Optional[str],
         exam_id: Optional[str] = None, with_report: bool = False, dry_run: bool = False,
         log: Callable[[str], None] = print) -> Optional[str]:
    """Trả về id bài kiểm tra trên app (None khi dry-run tạo bài mới)."""
    exam_body = dict(outputs["exam"])
    steps = []
    if exam_id:
        patch = {k: v for k, v in exam_body.items() if k in ("title", "questionCount", "options", "maxScore", "layoutHint")}
        steps.append(("PATCH", f"/exams/{exam_id}", patch))
    else:
        if not class_id or not exam_date:
            raise PushError("Tạo bài mới cần --class <id lớp> và --date YYYY-MM-DD")
        steps.append(("POST", "/exams", {**exam_body, "classId": class_id, "examDate": exam_date}))
    for code, body in outputs["keys"].items():
        steps.append(("PUT", f"/exams/{{id}}/answer-keys/{code}", body))
    if with_report:
        steps.append(("PUT", "/report-templates/default", {"config": outputs["report"]}))

    if dry_run:
        for method, path, body in steps:
            log(f"{method} {api.rstrip('/')}{path.replace('{id}', exam_id or '<id bài mới>')}")
            log("  " + json.dumps(body, ensure_ascii=False)[:300] + ("…" if len(json.dumps(body, ensure_ascii=False)) > 300 else ""))
        return exam_id

    client = Api(api, log)
    login = client.call("POST", "/auth/login", {"username": user, "password": password})
    client.token = login["accessToken"]
    if login.get("user", {}).get("mustChangePassword"):
        raise PushError("Tài khoản đang dùng mật khẩu tạm: đăng nhập web và đổi mật khẩu trước")

    for method, path, body in steps:
        real = path.replace("{id}", exam_id or "")
        result = client.call(method, real, body)
        if method == "POST" and path == "/exams":
            exam_id = result["id"]
            log(f"Đã tạo bài kiểm tra \"{exam_body['title']}\" (id {exam_id})")
        elif "answer-keys" in path:
            log(f"Đã ghi đáp án mã {path.rsplit('/', 1)[-1]}: {len(body['items'])} câu")
        elif "report-templates" in path:
            log("Đã cập nhật mẫu bảng điểm dùng chung")
        else:
            log(f"Đã cập nhật bài kiểm tra {exam_id}")
    return exam_id
