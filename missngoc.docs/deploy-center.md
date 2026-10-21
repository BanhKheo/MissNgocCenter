# Cài MissNgoc lên máy trung tâm để thử ở văn phòng

Cập nhật: 21/10/2026 · Đã chạy thử cả 2 cách cài bên dưới bằng Docker Compose trên Windows 11 + Docker Desktop

App chạy trên **một máy tính của trung tâm**. Nhân viên mở bằng trình duyệt trên máy văn phòng và điện thoại trong cùng Wi-Fi. Chỉ mở **một cổng** (80) trên Windows Firewall, không mở port trên router. Cài lần đầu mất khoảng 45 phút.

```text
Điện thoại / máy văn phòng ──Wi-Fi──► Máy trung tâm :80
                                        └─ web (Nginx) ──► api ──► db (PostgreSQL)
                                                     └──► dsl (trình biên dịch ExamDSL)
                                           worker (chấm bài) ──► AI API (Gemini / Claude), kết nối đi ra
                                           backup (pg_dump mỗi ngày)
```

| Container | Việc | Mở ra LAN |
| --- | --- | --- |
| `web` | Giao diện và Nginx; chuyển `/api/` sang api, `/dsl/` sang dsl | Có, cổng `WEB_PORT` |
| `api` | REST API | Không |
| `worker` | Hàng đợi chấm bài, gọi AI | Không |
| `migrate` | Cập nhật cấu trúc database rồi tự tắt | Không |
| `db` | PostgreSQL 17 | Không |
| `dsl` | Trình biên dịch ExamDSL cho trang Soạn đề | Không |
| `backup` | `pg_dump` mỗi 24 giờ, giữ 30 ngày | Không |

## 1. Máy cần gì

| Mục | Tối thiểu | Ghi chú |
| --- | --- | --- |
| Hệ điều hành | Windows 10/11 64-bit (Pro hoặc Home) | Mini PC chạy Ubuntu ổn định hơn nếu dùng lâu dài (mục 10 tài liệu BA) |
| CPU, RAM | 4 nhân, 8 GB RAM | Nên 16 GB vì Docker Desktop chạy trên WSL 2 |
| Ổ cứng | SSD, còn trống 30 GB | Ảnh bài làm khoảng 0,6 GB mỗi tháng |
| Mạng | Cắm dây LAN vào router | Wi-Fi dễ đổi IP, rớt mạng |
| Internet | Có, để worker gọi AI | Chụp và tải ảnh trong LAN vẫn chạy khi mất mạng; bài chờ, có mạng lại thì chấm tiếp |

## 2. Chuẩn bị máy (làm một lần)

1. Cài **Docker Desktop**, chọn backend WSL 2. Trong Settings → General, bật **Start Docker Desktop when you sign in**.
2. Đặt Windows tự đăng nhập, hoặc nhắc nhân viên không đăng xuất. Docker Desktop chỉ chạy khi có người đăng nhập. Các container có `restart: unless-stopped` nên tự lên lại khi Docker chạy.
3. Settings → System → Power: **Sleep = Never** khi cắm điện. Windows Update → Active hours: đặt theo giờ làm việc để máy không tự khởi động lại giữa giờ.
4. Trên router: đặt **DHCP reservation** cho máy này, ví dụ `192.168.1.10`. Địa chỉ này in trên mã QR, đổi IP là điện thoại không vào được.
5. Kiểm tra cổng 80 còn trống. Lệnh dưới đây có kết quả nghĩa là cổng 80 đã bị chiếm, khi đó dùng `WEB_PORT=8080`:

```powershell
netstat -ano | findstr ":80 "
```

## 3. Đưa bản cài lên máy

Chọn một trong hai cách.

### Cách A: chép mã nguồn, build ngay trên máy trung tâm

Dùng khi máy trung tâm có internet ổn định. Build lần đầu mất khoảng 10 phút.

```powershell
# Trên máy trung tâm: chép cả thư mục MissNgocCenter (git clone hoặc giải nén file zip) vào C:\MissNgocCenter
cd C:\MissNgocCenter\deploy
copy .env.example .env          # rồi điền .env theo mục 4
docker compose up -d --build
```

### Cách B: build ở máy dev, chép sang bằng USB

Dùng khi máy trung tâm mạng yếu, hoặc không muốn để mã nguồn trên máy đó. Máy trung tâm chỉ cần **3 file**.

Trên máy dev, ở thư mục gốc repo:

```powershell
$v = "1.0.0"   # phải trùng APP_VERSION trong .env của máy trung tâm
docker build -f missngoc.services/api/Dockerfile -t missngoc/grader-api:$v .
docker build -f missngoc.webapp/apps/web/Dockerfile -t missngoc/grader-web:$v .
docker build -t missngoc/grader-dsl:$v missngoc.dsl
docker pull postgres:17
docker save -o missngoc-grader-$v.tar missngoc/grader-api:$v missngoc/grader-web:$v missngoc/grader-dsl:$v postgres:17
```

Chép sang USB 3 file: `missngoc-grader-1.0.0.tar` (khoảng 1 GB), `deploy\docker-compose.yml`, `deploy\.env.example`.

Trên máy trung tâm:

```powershell
mkdir C:\MissNgocGrader; cd C:\MissNgocGrader     # chép 3 file vào đây
docker load -i missngoc-grader-1.0.0.tar
copy .env.example .env                           # rồi điền .env theo mục 4
docker compose up -d                             # không có --build: dùng image vừa nạp
```

## 4. Điền file `.env`

| Biến | Điền gì |
| --- | --- |
| `APP_VERSION` | `1.0.0`. Phải trùng tag image (cách B) |
| `WEB_PORT` | `80`, hoặc `8080` nếu cổng 80 bị chiếm |
| `PUBLIC_URL` | `http://192.168.1.10` (IP đã đặt cố định ở mục 2). Dùng cho mã QR trên giao diện |
| `DB_PASSWORD`, `JWT_SECRET` | Chuỗi ngẫu nhiên dài, tạo bằng lệnh bên dưới. Không dùng lại mật khẩu khác |
| `GRADING_ENGINE` | Xem bảng dưới |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | Key của engine đã chọn. Đặt hạn mức chi tiêu tháng trên trang quản trị của hãng |
| `GRADING_MODEL`, `GEMINI_MODEL` | Model, xem [api-pricing.md](api-pricing.md) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Mật khẩu tạm cho admin đầu tiên; **xoá sau khi đăng nhập lần đầu** |

Tạo chuỗi ngẫu nhiên (PowerShell, chạy 2 lần cho 2 biến):

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
```

Chọn engine cho giai đoạn thử:

| Giai đoạn | `GRADING_ENGINE` | Vì sao |
| --- | --- | --- |
| Ngày đầu: hướng dẫn nhân viên | `mock` | Không gọi AI, không tốn tiền; tập đủ luồng chụp, chấm, duyệt, xuất Excel. Kết quả là giả |
| Thử với bài thật | `gemini` (gói **trả phí**) hoặc `claude` | Gemini 3.8 Flash khoảng 145 đ/bài, đã đo thật trên app. Không dùng gói miễn phí của Gemini cho bài thật (Google dùng dữ liệu để cải thiện sản phẩm) |
| Có dự phòng | `gemini,claude` | Bài nào Gemini lỗi hoặc hết lượt thì Claude đọc thay |

Đổi `.env` xong thì chạy `docker compose up -d` để các container nhận giá trị mới.

## 5. Khởi động và tạo tài khoản

```powershell
docker compose up -d                                               # cách A thêm --build ở lần đầu
docker compose run --rm api node dist/scripts/bootstrap-admin.js   # tạo admin từ ADMIN_USERNAME / ADMIN_PASSWORD
```

1. Mở `http://localhost` (hoặc `http://localhost:8080`), đăng nhập `admin` bằng mật khẩu tạm. App bắt đổi mật khẩu ngay.
2. Xoá giá trị `ADMIN_PASSWORD` trong `.env`.
3. Vào **Tài khoản**, tạo tài khoản cho giáo vụ (vai trò STAFF) và giáo viên (TEACHER). Mỗi người đăng nhập lần đầu sẽ tự đặt mật khẩu mới.

Lỗi `502 Bad Gateway` trong khoảng 10 giây đầu sau khi bật là bình thường: API đang khởi động.

## 6. Mở cho mạng LAN

PowerShell chạy bằng quyền Administrator (đổi tên card mạng và cổng nếu khác):

```powershell
Set-NetConnectionProfile -InterfaceAlias "Ethernet" -NetworkCategory Private
New-NetFirewallRule -DisplayName "MissNgoc Grader HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Private
```

Mở `http://192.168.1.10` từ một điện thoại trong Wi-Fi của trung tâm. Vào được thì in mã QR (nút QR góc phải màn hình app) dán ở bàn giáo vụ. Điện thoại phải dùng Wi-Fi nội bộ, không dùng Wi-Fi khách (thường bị chặn kết nối giữa các thiết bị).

## 7. Kiểm tra sau khi cài

| # | Kiểm tra | Kết quả đúng |
| --- | --- | --- |
| 1 | `docker compose ps` | 6 container `Up`: web, api, worker, db (healthy), dsl, backup. `migrate` đã chạy xong rồi tắt |
| 2 | Mở `http://<IP>/api/v1/health` | `"ok":true` và đúng engine đã chọn |
| 3 | Đăng nhập trên máy văn phòng và trên điện thoại | Vào được; điện thoại mở thẳng màn hình Chụp bài |
| 4 | Bài kiểm tra → Tạo bài kiểm tra → **Soạn bằng ExamDSL** | Trang soạn đề báo lỗi ngay khi gõ. Nếu hiện "Chưa gọi được trình biên dịch ExamDSL", kiểm tra container `dsl` |
| 5 | Chụp 2–3 bài bằng điện thoại, bấm **Chấm** | Bài chuyển qua Trong hàng đợi → Đang đọc ảnh → Đã chấm / Cần duyệt |
| 6 | Bảng điểm → **Xuất Excel** | Tải được file `.xlsx` có màu |
| 7 | Hôm sau, xem thư mục `data\backups` | Có file `grader-YYYY-MM-DD.dump` |

## 8. Kịch bản thử ở văn phòng (1–2 tuần)

1. **Ngày 1 (engine `mock`):** hướng dẫn giáo vụ trong khoảng 15 phút theo deck [MissNgoc-Demo-Flow.pptx](MissNgoc-Demo-Flow.pptx). Mỗi người tự làm một lượt: nhập lớp từ Excel, tạo bài bằng ExamDSL, chụp, chấm, duyệt, xuất Excel.
2. **Chuyển sang engine thật**, chọn 1–2 lớp. Mỗi bài vẫn chấm tay song song như cũ.
3. Mỗi lần chấm, ghi lại 4 số:
   - thời gian từ lúc có bài đến lúc có bảng điểm;
   - số bài phải duyệt;
   - số câu điểm app khác chấm tay;
   - trong số câu khác đó, bao nhiêu câu AI báo "chắc chắn".
4. Cuối đợt, so với mục tiêu trong tài liệu BA: dưới 20 phút cho lớp 30 học sinh, dưới 15% bài phải duyệt, sau khi duyệt đúng 100%. Tab **Mô phỏng duyệt** trong trang Soạn đề giúp thử luật duyệt khác trên chính các bài đã chụp.

## 9. Cập nhật phiên bản

Luôn sao lưu trước:

```powershell
docker compose exec backup sh -c "pg_dump -h db -U grader -d grader -Fc -f /backups/truoc-cap-nhat.dump"
```

- **Cách A:** lấy mã nguồn mới (`git pull`), rồi `docker compose up -d --build`.
- **Cách B:** build và `docker save` bản mới ở máy dev với tag mới (ví dụ `1.0.1`). Trên máy trung tâm: `docker load -i ...`, sửa `APP_VERSION=1.0.1` trong `.env`, rồi `docker compose up -d`.

Container `migrate` tự cập nhật cấu trúc database mỗi lần khởi động. Bản mới lỗi thì đặt lại `APP_VERSION` cũ và chạy `docker compose up -d`; nếu bản mới đã đổi database, khôi phục file `truoc-cap-nhat.dump` theo mục 10.

## 10. Sao lưu và khôi phục

| Dữ liệu | Nằm ở đâu (trong thư mục có `docker-compose.yml`) | Ai sao lưu |
| --- | --- | --- |
| Database | `data\backups\grader-YYYY-MM-DD.dump` | Container `backup`, mỗi 24 giờ, giữ 30 ngày |
| Ảnh bài làm | `data\uploads\` | Chưa tự động: chép cùng thư mục `data\backups` ra ổ ngoài hoặc Google Drive mỗi tuần (rclone + Task Scheduler, mục 11 tài liệu BA) |

Khôi phục database từ một file dump:

```powershell
docker compose exec backup pg_restore -h db -U grader -d grader --clean --if-exists /backups/grader-2026-10-21.dump
```

Nên khôi phục thử trên một máy khác mỗi quý. Bản sao lưu chưa từng khôi phục thử thì chưa chắc dùng được.

## 11. Sự cố thường gặp

| Hiện tượng | Nguyên nhân hay gặp | Cách xử lý |
| --- | --- | --- |
| `bind: address already in use` khi `up` | Cổng 80 đã có chương trình khác dùng | `WEB_PORT=8080`, mở firewall cổng 8080, dùng `http://<IP>:8080` |
| `502 Bad Gateway` | API đang khởi động, hoặc đã dừng | Đợi 10–20 giây; vẫn lỗi thì `docker compose logs api --tail 50` |
| Điện thoại không vào được | Khác mạng Wi-Fi, mạng khách, firewall, IP máy đổi | Cùng Wi-Fi nội bộ; mạng đặt Private; kiểm tra DHCP reservation |
| Trang Soạn đề báo "Chưa gọi được trình biên dịch ExamDSL" | Container `dsl` không chạy | `docker compose ps`; `docker compose up -d dsl` |
| Bài nằm mãi ở "Lỗi" hoặc "Trong hàng đợi" | Hết lượt hoặc sai API key, mất internet | `docker compose logs worker --tail 50`; kiểm tra key và hạn mức trên trang của hãng |
| Sau khi khởi động lại máy, app không lên | Docker Desktop chưa chạy (chưa có ai đăng nhập Windows) | Đăng nhập Windows; bật Start Docker Desktop when you sign in |
| Quên mật khẩu admin | | Điền lại `ADMIN_PASSWORD` trong `.env`, chạy lệnh `bootstrap-admin` ở mục 5 |

## 12. Gỡ hoặc cài lại từ đầu

```powershell
docker compose down        # dừng app, GIỮ database và ảnh
docker compose down -v     # dừng và XOÁ database (không xoá thư mục data\uploads, data\backups)
```

`down -v` xoá toàn bộ điểm và tài khoản, chỉ dùng khi chắc chắn muốn làm lại từ đầu và đã có bản sao lưu.
