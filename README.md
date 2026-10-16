# MissNgoc Grader

Web app chấm bài trắc nghiệm và điền từ cho trung tâm tiếng Anh. Nhân viên chụp bài làm của từng học sinh bằng điện thoại. Admin tải đáp án lên. Bấm **Generate** là có ngay bảng điểm cả lớp, xem được trên web và xuất ra Excel theo mẫu màu của trung tâm.

**Trạng thái:** đã có code MVP giai đoạn 1 (16/10/2026), chạy được toàn luồng với engine giả (`mock`). Bước tiếp theo: thử AI đọc 1–2 bài thật bằng Gemini (miễn phí), rồi chạy PoC 50 bài để chọn model.

## Tài liệu

| Tài liệu | Nội dung |
| --- | --- |
| [missngoc.docs/ba-architecture.md](missngoc.docs/ba-architecture.md) | BA (use case, yêu cầu chức năng, mức độ hữu ích, rủi ro) và kiến trúc (stack, data model, REST API, triển khai LAN, Docker, lộ trình) |
| [missngoc.docs/finetune-analysis.md](missngoc.docs/finetune-analysis.md) | Có nên fine-tune không, chọn model nào (Vertex AI Gemini, Qwen3-VL tự host), chi phí, cách dùng dữ liệu hằng ngày, lộ trình |
| [Bản online trên Claude Docs](https://claude.ai/code/artifact/097eaa2d-8d33-4a9a-a497-222c0896e2f8) | Cùng nội dung, góp ý bằng bình luận |

## Quyết định chính

- **Nền tảng:** web mobile-first, không làm app trên App Store
- **Nơi chạy:** máy tính của trung tâm, trong mạng LAN. Không cần mở port trên router, chỉ cần 1 rule Windows Firewall cho cổng 80
- **Tài khoản:** trung tâm cấp, không có đăng ký. RBAC động theo IUROADMAP, vai trò mặc định Admin, Giáo vụ (`STAFF`), Giáo viên (`TEACHER`)
- **Cách chấm:** AI chỉ đọc học sinh chọn gì, hoặc chép lại chữ học sinh viết ở câu điền từ. Code so với đáp án và tính điểm. Câu điền từ không phân biệt chữ hoa/thường và dấu chấm cuối, nhưng sai chính tả là sai. Viết lại câu và bài viết không chấm trên app. Câu AI không chắc được đưa vào màn hình duyệt. Engine đổi bằng biến `GRADING_ENGINE`: `claude` (chạy thật), `gemini` (thử miễn phí), `mock` (không gọi AI). Ghi nhiều engine như `gemini,claude` thì bài nào engine đầu lỗi hoặc hết lượt sẽ chuyển sang engine sau
- **Stack:** React 18 + Vite + Ant Design, NestJS + Prisma + PostgreSQL, REST API. Cấu trúc theo repo [IUROADMAP](https://github.com/TanjiKhanh/IUROADMAP)
- **Đóng gói:** Docker Compose gồm web (Nginx), api, worker, db, backup
- **Giai đoạn 2:** phiếu trả lời chuẩn + OMR (OpenCV), chạy offline và gần như không tốn chi phí

![Kiến trúc triển khai](missngoc.docs/images/kien-truc-trien-khai.png)

## Cấu trúc thư mục

```text
missngoc-grader/
├─ missngoc.services/api/     NestJS: api (HTTP) + worker (chấm bài), Prisma, script PoC
├─ missngoc.webapp/apps/web/  React 18 + Vite + Ant Design + Redux Toolkit + TanStack Query
├─ missngoc.webapp/packages/core/  quyền (PMS), trạng thái, đường dẫn dùng chung
├─ missngoc.docs/             tài liệu BA và kiến trúc
└─ deploy/                    docker-compose.yml (máy chủ), docker-compose.dev.yml (Postgres cho dev), nginx.conf
```

## Chạy trên máy dev

Cần Node.js 22+ và Docker Desktop.

```bash
npm install
npm run db:up                                   # Postgres trong Docker, chỉ mở cho máy này
cp missngoc.services/api/.env.example missngoc.services/api/.env   # điền JWT_SECRET
npm run db:setup                                # migrate, seed quyền, tạo tài khoản admin
npm run dev                                     # Postgres + API (kèm worker) + web: http://localhost:5173
```

Đăng nhập `admin` với `ADMIN_PASSWORD` trong `.env`, đổi mật khẩu, rồi cấp tài khoản cho giáo vụ. Điện thoại cùng Wi-Fi mở `http://<IP máy dev>:5173`.

Kiểm tra: `npm run test` (unit test chấm điểm), `npm run typecheck`.

## Thử AI đọc 1–2 bài bằng Gemini (miễn phí)

1. Tạo API key ở [Google AI Studio](https://aistudio.google.com), điền `GEMINI_API_KEY` vào `missngoc.services/api/.env`.
2. Chụp 1–2 bài, đặt vào `poc-samples/` (thư mục này không đưa lên git). Bài nhiều trang thì để các trang trong một thư mục con.
3. Chạy từ thư mục gốc:

```bash
npm run poc -- --engine gemini --questions 40 poc-samples/bai1.jpg poc-samples/bai2
```

Kết quả in từng câu: `A` là đọc rõ, `A?` là không chắc, `·` là bỏ trống. Thêm `--truth poc-samples/truth.csv` (cột `sheet,q,choice`) để so với đáp án chấm tay và tính tỉ lệ sai mà AI vẫn báo chắc chắn.

Đề có câu điền từ thì thêm `--text`, ví dụ đề Unit 1–3 có 41 câu, câu 5–8 và 18–21 là điền từ:

```bash
npm run poc -- --engine gemini --questions 41 --text 5-8,18-21 poc-samples/de-unit1-3
```

Trong `truth.csv`, câu điền từ ghi đúng chữ học sinh viết, kể cả sai chính tả (không ghi đáp án đúng). Kết quả có dòng riêng cho câu điền từ: câu sai mà AI chép thành đúng chính tả là lỗi AI tự sửa chữ, lỗi cần đo kỹ nhất.

Ảnh mẫu (16 phiếu tổng hợp nhiều kiểu + bài viết tay thật từ Mendeley, có đáp án chuẩn) nằm ở `poc-samples/datasets/`, xem `poc-samples/datasets/README.md`.

**Lưu ý:** gói miễn phí của Gemini chỉ cho 20 lượt gọi mỗi ngày (mỗi bài là 1 lượt), hết lượt thì báo lỗi 429. Dữ liệu gửi qua Gemini bản miễn phí có thể được Google dùng để cải thiện sản phẩm. Che họ tên trên ảnh, hoặc dùng phiếu mẫu do nhân viên tô. Muốn thử cả luồng trên web thì đặt `GRADING_ENGINE=gemini` và `GRADING_CONCURRENCY=2` trong `.env`.

## Cài lên máy trung tâm

```bash
cd deploy
cp .env.example .env            # điền DB_PASSWORD, JWT_SECRET, API key, ADMIN_PASSWORD
docker compose up -d --build    # cài lần đầu và mỗi lần cập nhật
docker compose run --rm api node dist/scripts/bootstrap-admin.js   # tạo admin đầu tiên
```

Sau đó mở cổng 80 trên Windows Firewall (mục 10 tài liệu) và in mã QR chứa `http://<IP máy chủ>`. Nếu cổng 80 đã bị chiếm (lệnh `netstat -ano | findstr :80` có kết quả), đặt `WEB_PORT=8080` trong `.env`, mở cổng 8080 và dùng `http://<IP máy chủ>:8080`.

## Lộ trình

![Lộ trình](missngoc.docs/images/lo-trinh.png)

1. **PoC (1 tuần):** cho AI đọc 50 bài thật đã chấm tay, so sánh 3 model. Chỉ làm tiếp khi tỉ lệ câu sai mà AI vẫn báo chắc chắn không quá 0,2%
2. **MVP (5–6 tuần):** lớp, học sinh, đáp án, chụp ảnh, chấm và duyệt, bảng điểm, xuất Excel, cài lên máy trung tâm
3. **Giai đoạn 2:** phiếu chuẩn + OMR, mã QR để tải bài hàng loạt, mini PC chạy Ubuntu
4. **Giai đoạn 3 (ngoài phạm vi hiện tại):** chấm tự luận, phân tích lỗi sai về ngữ pháp và từ vựng

## Việc cần làm tiếp

- [ ] Thử Gemini với 1–2 bài thật (đã che tên) bằng `npm run poc`
- [ ] Thử 1–2 bài đề Unit 1–3 có câu điền từ (`--text 5-8,18-21`), xem AI có tự sửa chính tả không
- [ ] Xác định học sinh làm bài trên phiếu tô ô riêng hay khoanh ngay trên đề
- [ ] Ghi lại số câu mỗi bài, số mã đề, thang điểm, số bài mỗi tháng
- [ ] Tạo API key và đặt hạn mức chi tiêu tháng trên Claude Console
- [ ] Thu 50 bài mẫu đã chấm tay cho PoC
