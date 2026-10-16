# Phân tích fine-tune: đọc bài thi viết tay của MissNgoc

Cập nhật 16/10/2026. Giá lấy từ trang giá chính thức khi viết, tỷ giá xấp xỉ 26.000 đ/USD. Giá AI thay đổi nhanh, kiểm lại trước khi chi tiền.

## Kết luận ngắn

1. **Chưa nên fine-tune ngay.** Gọi API đã rẻ: khoảng 50–500 đ mỗi bài tuỳ model. Fine-tune không giúp tiết kiệm tiền. Lý do duy nhất để fine-tune là **tăng độ chính xác** trên đúng kiểu giấy của trung tâm. Hiện chưa đo được độ chính xác đó, vì PoC mới chạy trên 5 bài của bộ dữ liệu mẫu, không phải đề MS. NGOC.
2. **Việc đầu tiên là có bộ nhãn chuẩn.** Cần khoảng 200 bài thật, mỗi bài có người kiểm đủ 41 ô. Không có bộ này thì không biết fine-tune có giúp gì không, và cũng không có dữ liệu để fine-tune.
3. **Nếu cần fine-tune, chọn Gemini trên Vertex AI.** Không cần mua GPU, chỉ phải sửa ít code:
   - Train một lần: khoảng 0,3–2 triệu đ.
   - Chấm mỗi bài: khoảng 16–470 đ.
   - Thử song song 2 model: Gemini 3.1 Flash-Lite (rẻ) và Gemini 3.5 Flash (mạnh), giữ model rẻ nhất mà đạt ngưỡng.
4. **Tự host model mã nguồn mở (Qwen3-VL-8B) chỉ khi** trung tâm bắt buộc ảnh không rời máy, hoặc thường mất mạng. Xét về tiền thì không bao giờ hoà vốn: card GPU khoảng 15–23 triệu đ, trong khi API chỉ tốn 20–560 nghìn đ mỗi tháng.
5. **Claude hiện không fine-tune được** model đời mới. Vẫn dùng Claude như hiện tại, không fine-tune, và để làm mốc so sánh.

## 1. Bài toán: giấy thi thật trông như thế nào

Xem 14 ảnh trong `missngoc.services/api/data/uploads`. Đề "MS. NGOC ENGLISH CENTER – MID-TERM TEST – GRADE 7" có **ANSWER BOX** ngay đầu trang 1:

- 41 ô xếp 5 cột: câu 1–9, 10–18, 19–27, 28–36, 37–41.
- Học sinh viết tay bằng bút bi lên dòng kẻ: chữ cái A–D ở câu trắc nghiệm, một từ hoặc cụm từ ở câu điền từ (5–8, 18–21).

Những điểm khó thấy ngay trên ảnh thật:

| Hiện tượng | Ví dụ trong ảnh |
| --- | --- |
| Ảnh chụp xoay ngang 90° | Bài Ngô Trí Phát |
| Bóng tay, bóng điện thoại, giấy cong | Hầu hết các ảnh |
| Gạch chữ cũ, viết chữ mới bên cạnh | 9. ~~D~~ C, 27. ~~A~~ B, 29. ~~A~~ D, 21. ~~didnot~~ used |
| Chữ thường lẫn chữ hoa, chữ có dấu | 13. "d", 40. "Á" |
| Chữ viết tràn ra ngoài ô | 21. "used" nằm ngoài dòng kẻ |
| Sai chính tả, cần chép đúng nguyên văn | "Heathad", "creativty", "volunteersed" |
| Ô trống nhưng học sinh khoanh hoặc viết ở phần đề | Câu 6–8 trống trong ô, có chữ ở phần Listening |

Câu điền từ là phần khó nhất: AI phải chép đúng từng chữ cái, không được tự sửa chính tả (xem mục 6 tài liệu BA và kiến trúc).

## 2. Độ chính xác hiện tại

| Lượt thử | Kết quả |
| --- | --- |
| PoC Gemini 3.8 Flash, 5 bài × 20 câu (bộ Mendeley, không phải đề MS. NGOC) | 100 câu, sai 2 câu, cả 2 câu AI vẫn báo chắc chắn (2%) |
| Ngưỡng đặt ra trong tài liệu BA | Sai mà chắc chắn ≤ 0,2% |
| Gói miễn phí Gemini | 20 lượt gọi mỗi ngày, hết lượt thì lỗi 429 |

Mẫu 100 câu quá nhỏ để kết luận. 2% có thể là 0,5% hoặc 5% trên đề thật. Phải đo trên đề MS. NGOC trước khi quyết định fine-tune.

## 3. Các lựa chọn fine-tune

| Lựa chọn | Fine-tune được không | Ghi chú |
| --- | --- | --- |
| **Gemini trên Vertex AI** | Có: Gemini 3.5 Flash, 3.1 Flash-Lite, 2.5 Flash, 2.5 Flash-Lite, 2.5 Pro | Nhận dữ liệu ảnh. Tối đa 300.000 ví dụ đa phương tiện. Train ở `us-central1` hoặc `europe-west4`. Cần Google Cloud project có bật thanh toán, khác với API key AI Studio đang dùng |
| **Claude** | Chỉ Claude 3 Haiku, qua Amazon Bedrock | Model đời cũ (2024), bắt buộc mua Provisioned Throughput. Không có fine-tune cho Claude 5.x qua API của Anthropic |
| **OpenAI** | Không chắc | Một nguồn thứ ba cho biết từ 07/05/2026, tổ chức chưa từng fine-tune không tạo job mới được nữa. Chưa xác minh trên trang OpenAI. Không khuyến nghị |
| **Qwen3-VL-8B** (mã nguồn mở) | Có, LoRA/QLoRA bằng Unsloth | Đứng đầu nhóm model đa năng trong benchmark chữ viết tay OmniHandwritingOCR. QLoRA 4-bit chạy được trên card 16 GB. Chạy trên máy trung tâm, ảnh không rời máy |
| **PaddleOCR-VL-1.6** (0,9B, Apache 2.0) | Có | Đứng đầu benchmark đọc tài liệu in, nhưng chưa có số liệu chữ viết tay. Trả ra văn bản, không trả JSON theo câu, nên phải cắt từng ô trước |

Lưu ý quan trọng với Gemini đã fine-tune, theo tài liệu Vertex:

- **Giá gọi gấp 1,5 lần:** từ đời Gemini 3 trở đi, giá gọi model đã fine-tune bằng 1,5 lần giá gốc. Đời 2.5 giữ nguyên giá gốc.
- **Tắt "suy nghĩ":** đặt thinking level `MINIMAL` (Gemini 3) hoặc thinking budget `0` (Gemini 2.5).
- **Không dùng JSON schema khi gọi:** ép schema làm giảm chất lượng của model đã fine-tune. App vẫn an toàn vì `normalizeSheet` và Zod đã kiểm tra lại kết quả.
- **Model gốc bị khai tử thì phải train lại** trên model mới.

## 4. Chi phí

Giả định mỗi bài: 1 ảnh, khoảng 2.000 token đầu vào và 1.000 token đầu ra (PoC Gemini đo được 1.630 vào, 440–830 ra với đề 20 câu). Mỗi ví dụ train khoảng 2.500 token. Train 1.000 bài × 3 epoch = 7,5 triệu token train.

### Vertex AI (Gemini)

| Model | Giá train (USD / 1 triệu token) | Train 1.000 bài × 3 epoch | Giá gọi gốc vào / ra (USD / 1 triệu token) | Mỗi bài sau fine-tune | 1.200 bài/tháng |
| --- | --- | --- | --- | --- | --- |
| Gemini 3.5 Flash | 10 | khoảng 1,95 triệu đ | 1,50 / 9,00 (×1,5) | khoảng 470 đ | khoảng 560 nghìn đ |
| Gemini 3.1 Flash-Lite | 3 | khoảng 590 nghìn đ | 0,25 / 1,50 (×1,5) | khoảng 78 đ | khoảng 94 nghìn đ |
| Gemini 2.5 Flash | 5 | khoảng 980 nghìn đ | 0,30 / 2,50 | khoảng 81 đ | khoảng 97 nghìn đ |
| Gemini 2.5 Flash-Lite | 1,5 | khoảng 290 nghìn đ | 0,10 / 0,40 | khoảng 16 đ | khoảng 19 nghìn đ |

Mỗi lần train lại (thêm dữ liệu mới, đổi model) tốn lại tiền train. Nếu train lại mỗi tháng thì cộng thêm cột "Train" vào chi phí tháng.

### So với gọi API không fine-tune

| Model | Mỗi bài | 1.200 bài/tháng |
| --- | --- | --- |
| Gemini 3.5 Flash (chưa fine-tune) | khoảng 310 đ | khoảng 375 nghìn đ |
| Claude Haiku 5.5 | khoảng 55 đ | khoảng 65 nghìn đ |
| Claude Sonnet 5.5 | khoảng 1.100 đ | khoảng 1,3 triệu đ |
| Claude Opus 5.5 | khoảng 2.100 đ | khoảng 2,6 triệu đ |

Số liệu Claude lấy từ tài liệu BA và kiến trúc (giá ngày 06/10/2026). Ảnh gửi cho Claude tốn nhiều token hơn ảnh gửi cho Gemini.

### Tự host Qwen3-VL-8B trên máy trung tâm

| Khoản | Chi phí |
| --- | --- |
| Card RTX 5060 Ti 16 GB (giá bán lẻ ở Việt Nam) | khoảng 14–23 triệu đ, một lần |
| Máy bàn có khe PCIe x16 và nguồn đủ công suất, nếu máy hiện tại không lắp được card | ước lượng thêm 10–15 triệu đ |
| Thuê GPU để train (RunPod: RTX 4090 0,34–0,69 USD/giờ, A100 80 GB 1,19–1,39 USD/giờ) | ước lượng 2–4 giờ mỗi lần train, dưới 100 nghìn đ mỗi lần |
| Điện nếu máy bật 24/7 | vài trăm nghìn đ/tháng |
| Mỗi bài | gần như 0 đ |

**Hoà vốn so với Vertex:**
- So với Gemini 3.1 Flash-Lite đã fine-tune (94 nghìn đ/tháng): khoảng 20 triệu ÷ 94 nghìn ≈ 18 năm.
- So với Gemini 3.5 Flash đã fine-tune (560 nghìn đ/tháng): khoảng 3 năm, chưa tính công bảo trì.

Tự host chỉ đáng làm vì lý do quyền riêng tư hoặc chạy offline, không vì tiền.

### Chi phí thật sự lớn nhất: công gán nhãn

Mỗi bài cần một người kiểm đủ 41 ô, khoảng 1–2 phút. 500 bài tốn khoảng 8–16 giờ công. Khoản này lớn hơn tiền train trên Vertex.

## 5. Dùng dữ liệu hằng ngày thế nào cho đúng

Trung tâm có bài mới mỗi ngày. Nhưng **không phải bài nào đã chấm cũng dùng làm dữ liệu train được.**

- **Bẫy nhãn "Duyệt xong":** khi bấm "Duyệt xong", người duyệt chỉ xem các câu AI báo không chắc. Câu AI đọc sai mà báo chắc chắn vẫn nằm nguyên trong `final_choice`. Nếu đem dữ liệu này đi train, model sẽ học lại đúng lỗi của AI cũ. Đây chính là loại lỗi cần sửa nhất.
- **Cần thêm chế độ "Kiểm toàn bài":** người kiểm xem đủ 41 ô so với ảnh, rồi đánh dấu bài đã được kiểm đầy đủ. Chỉ bài có dấu này mới vào tập train và tập test. Ô nào chính người kiểm cũng thấy khó đọc thì đánh dấu, để làm nhãn `unclear`. Thiếu nhãn này, model đã fine-tune sẽ quen báo "chắc chắn" cho mọi câu.
- **Số lượng:**
  - Tập test 200 bài, giữ riêng, không bao giờ đưa vào train.
  - Tập train bắt đầu với 300–500 bài, tăng dần lên 1.000–2.000 bài.
  - Mỗi bài cho 41 nhãn, trong đó 8 nhãn là chữ viết tay.
- **Chia theo học sinh và theo lớp,** không chia ngẫu nhiên. Cùng một nét chữ mà nằm ở cả tập train lẫn tập test thì kết quả test sẽ đẹp hơn thực tế.
- **Đủ kiểu ảnh khó:** ảnh xoay, có bóng, đèn vàng, chữ gạch xoá, ô trống, nhiều đề khác nhau (Grade 6, 7, 8…). Model chỉ học được những gì nó đã thấy.
- **Quyền riêng tư:** ảnh có họ tên và chữ viết của trẻ em.
  - Vertex AI là dịch vụ trả phí. Theo điều khoản Google Cloud, dữ liệu khách hàng không được dùng để huấn luyện model của Google. Gói miễn phí AI Studio thì không có cam kết này.
  - Nên xin trung tâm đồng ý trước khi đưa ảnh lên Google Cloud, hoặc che phần họ tên trong ảnh train.

## 6. Lộ trình đề xuất

Mỗi bước có điều kiện dừng. Đạt ngưỡng ở bước nào thì dừng ở bước đó.

**Bước 0: bộ nhãn chuẩn (1–2 tuần, không tốn tiền API)**
- Thêm chế độ "Kiểm toàn bài" vào màn hình duyệt.
- Kiểm đủ 200 bài đề MS. NGOC, lấy từ nhiều lớp và nhiều ngày.
- Xuất ra `truth.csv` để chạy `npm run poc -- --truth`.

**Bước 1: chưa fine-tune, làm tốt lời nhắc (1–3 ngày)**
- Ghi vào ô "Bố cục" của bài kiểm tra, không cần sửa code: *"Trang 1 có ANSWER BOX 41 ô, 5 cột (1–9, 10–18, 19–27, 28–36, 37–41). Chỉ đọc chữ trong ANSWER BOX, bỏ qua chữ khoanh hoặc viết ở phần đề. Chữ thường d là D."*
- Thử bật "đọc 2 lần" (2 lần gọi hoặc 2 model khác nhau): câu nào 2 lần đọc khác nhau thì đưa vào duyệt. Chi phí gấp đôi nhưng vẫn rẻ.
- So 3–4 model trên 200 bài chuẩn: Gemini 3.5 Flash, Claude Haiku 5.5, Sonnet 5.5, Opus 5.5.
- **Dừng nếu** sai-mà-chắc-chắn ≤ 0,2% và số bài cần duyệt ≤ 15%.

**Bước 2: fine-tune trên Vertex AI (1–2 tuần, khoảng 0,6–2,5 triệu đ cho 2 model)**
- Tạo Google Cloud project và bucket Cloud Storage. Đẩy ảnh tập train lên bucket.
- Script xuất JSONL: mỗi dòng là một bài, gồm ảnh và JSON đáp án chuẩn đúng định dạng app đang dùng (`q`, `choice`, `text`, `status`).
- Fine-tune Gemini 3.1 Flash-Lite và Gemini 3.5 Flash trên cùng dữ liệu, chọn adapter size nhỏ trước.
- Thêm engine `vertex` vào app. SDK `@google/genai` đang dùng hỗ trợ Vertex AI, chỉ đổi cấu hình và trỏ tới endpoint của model đã fine-tune.
- Chạy PoC trên 200 bài chuẩn. **Giữ model rẻ nhất đạt ngưỡng.**

**Bước 3: tự host Qwen3-VL-8B (3–6 tuần, chỉ khi bắt buộc)**
- Train QLoRA bằng Unsloth trên GPU thuê, chạy model bằng vLLM trong container `vlm` cạnh worker.
- Máy chủ Windows cần WSL2 và driver NVIDIA thì Docker mới dùng được GPU. Tính thêm công cài đặt và bảo trì.
- Cái lợi: lấy được xác suất của từng chữ model sinh ra, nên đặt ngưỡng "không chắc" chính xác hơn.

## 7. Việc cần sửa trong app nếu đi tiếp

- [ ] Cột `verified_full` trên bảng `submissions` và nút "Kiểm toàn bài" trên màn hình duyệt
- [ ] Cho người kiểm đánh dấu một ô là "khó đọc" để làm nhãn `unclear`
- [ ] Script xuất bộ chuẩn: `truth.csv` cho PoC, JSONL cho Vertex, chia train/test theo học sinh
- [ ] Engine `vertex` (biến `GRADING_ENGINE=vertex`, project, region, endpoint model đã fine-tune), không gửi JSON schema khi gọi model đã fine-tune
- [ ] Tuỳ chọn "đọc 2 lần" trong worker

## 8. Câu hỏi cần trung tâm trả lời

1. Học sinh làm ở phần đề nhưng để trống ô trong ANSWER BOX thì có tính điểm không?
2. Chữ thường ("d"), chữ có dấu ("Á"), chữ viết tràn ra ngoài ô thì có tính không?
3. Trung tâm có đồng ý đưa ảnh bài có họ tên lên Google Cloud để huấn luyện không, hay phải che tên trước?
4. Mỗi tháng thực tế có bao nhiêu bài? Ai có thời gian kiểm toàn bài 200–500 bài đầu tiên?

## Nguồn

- [Google Cloud: bảng giá Vertex AI, gồm giá fine-tune và hệ số 1,5 lần cho model Gemini 3 đã fine-tune](https://cloud.google.com/vertex-ai/generative-ai/pricing)
- [Google Cloud: supervised fine-tuning cho Gemini, gồm model hỗ trợ, giới hạn và lưu ý thinking/JSON schema](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini-supervised-tuning)
- [AWS: fine-tune Claude 3 Haiku trên Amazon Bedrock (11/2024)](https://aws.amazon.com/blogs/aws/fine-tuning-for-anthropics-claude-3-haiku-model-in-amazon-bedrock-is-now-generally-available/)
- [Spheron: chi phí fine-tune 2026, có thông tin OpenAI ngừng nhận tổ chức mới (chưa xác minh)](https://www.spheron.network/blog/llm-fine-tuning-cost-2026-api-vs-renting-gpus/)
- [OmniHandwritingOCR: benchmark chữ viết tay cho model đa phương tiện](https://arxiv.org/pdf/2608.18586)
- [PaddleOCR-VL-1.6](https://arxiv.org/html/2606.03264v1)
- [Unsloth: chạy và fine-tune Qwen3-VL](https://unsloth.ai/docs/models/tutorials/qwen3-how-to-run-and-fine-tune/qwen3-vl-how-to-run-and-fine-tune)
- [Ví dụ fine-tune Qwen3-VL-8B đọc chữ viết tay: 95% trên mẫu sạch, 50% trên ảnh chụp thật](https://github.com/husseinassi1982-hue/CodeML2026/releases/tag/vlm-ocr-v2)
- [RunPod: giá thuê GPU](https://www.runpod.io/gpu-cloud/pricing)
- [TNC Store: giá RTX 5060 Ti tại Việt Nam](https://www.tncstore.vn/vga-rtx-5060.html)
