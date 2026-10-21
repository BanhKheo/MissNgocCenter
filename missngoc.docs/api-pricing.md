# So sánh giá API đọc bài: Gemini, Claude, ChatGPT

Cập nhật: 21/10/2026 · Giá lấy từ trang giá chính thức (mục Nguồn) · Tỷ giá tính 26.000 đ/USD như tài liệu BA

## Kết luận

Với 1.200 bài mỗi tháng, mọi model trong bảng đều tốn **dưới 4 triệu đồng/tháng**, rẻ hơn rất nhiều so với khoảng 50 giờ công tiết kiệm được. Vì vậy **chọn model theo độ chính xác, không theo giá**:

1. Thử ở văn phòng bằng **Gemini 3.8 Flash bản trả phí**. App đã chạy được model này và đã đo token thật. Khoảng 150 đ/bài, 175 nghìn đ/tháng. Giá tăng gấp đôi từ 01/01/2027.
2. Chạy PoC 50 bài thật trên Gemini 3.8 Flash, Claude Haiku 5.5 và Claude Sonnet 5.5, đo tỉ lệ **câu sai mà AI vẫn báo chắc chắn** (ngưỡng 0,2% trong tài liệu BA). Chọn model rẻ nhất mà vẫn đạt ngưỡng.
3. **Không dùng gói miễn phí của Gemini cho bài thật của học sinh.** Google ghi rõ dữ liệu gửi qua gói miễn phí được dùng để cải thiện sản phẩm. Gói trả phí thì không.

ChatGPT (OpenAI) có giá cạnh tranh, nhưng app **chưa có engine OpenAI**. Muốn thử thì phải viết thêm một lớp engine, khoảng 100 dòng, giống `gemini.engine.ts`.

## Một bài tốn bao nhiêu token

| Nguồn số liệu | Token đầu vào | Token đầu ra | Ghi chú |
| --- | ---: | ---: | --- |
| **Gemini 3.8 Flash, đo thật** | 1.701 | 1.147 | Trung bình 47 bài (đề 10, 32 và 41 câu) trong bảng `extractions`; cao nhất 3.901 token ra; khoảng 26 giây/bài |
| Claude và OpenAI, **ước lượng** | 5.600 | 3.000 | Số của tài liệu BA: ảnh độ phân giải cao khoảng 4.800 token, lời nhắc khoảng 800; đầu ra gồm JSON và phần suy luận |

Mỗi hãng đếm token của ảnh theo cách riêng, nên số token Gemini không dùng thay cho Claude hay OpenAI được. Số của Claude và OpenAI cần đo lại trong PoC: bảng `extractions` tự ghi `input_tokens` và `output_tokens` cho mỗi lần đọc.

## Bảng giá và chi phí ước tính

Giá chuẩn (không batch), USD cho 1 triệu token. Chi phí mỗi bài = token vào × giá vào + token ra × giá ra. Một tháng tính 1.200 bài (300 học sinh × 4 bài).

| Hãng | Model | Vào ($/1M) | Ra ($/1M) | Token dùng để tính | Mỗi bài | 1.200 bài/tháng |
| --- | --- | ---: | ---: | --- | ---: | ---: |
| Google | Gemini 3.5 Flash-Lite | 0,30 | 2,50 | đo thật | khoảng 90 đ | khoảng 105 nghìn đ |
| Google | **Gemini 3.8 Flash** (app đang dùng) | 0,75 | 3,75 | đo thật | **khoảng 145 đ** | **khoảng 175 nghìn đ** |
| Google | Gemini 3.8 Flash từ 01/01/2027 | 1,50 | 7,50 | đo thật | khoảng 290 đ | khoảng 350 nghìn đ |
| Google | Gemini 3.1 Pro Preview | 2,00 | 12,00 | đo thật (bản Flash) | khoảng 450 đ | khoảng 535 nghìn đ |
| Anthropic | **Claude Haiku 5.5** | 0,10 | 0,50 | ước lượng | **khoảng 55 đ** | **khoảng 65 nghìn đ** |
| Anthropic | Claude Sonnet 5.5 | 2,00 | 10,00 | ước lượng | khoảng 1.070 đ | khoảng 1,3 triệu đ |
| Anthropic | Claude Opus 5.5 (mặc định trong `.env.example`) | 4,00 | 20,00 | ước lượng | khoảng 2.140 đ | khoảng 2,6 triệu đ |
| OpenAI | GPT-6 Luna | 0,10 | 0,50 | ước lượng | khoảng 55 đ | khoảng 65 nghìn đ |
| OpenAI | GPT-5.4 mini | 0,75 | 4,50 | ước lượng | khoảng 460 đ | khoảng 550 nghìn đ |
| OpenAI | GPT-6.1 Sol | 2,00 | 10,00 | ước lượng | khoảng 1.070 đ | khoảng 1,3 triệu đ |
| OpenAI | GPT-5.5 | 5,00 | 30,00 | ước lượng | khoảng 3.070 đ | khoảng 3,7 triệu đ |

Ví dụ tính Gemini 3.8 Flash: 1.701 × 0,75 / 1.000.000 + 1.147 × 3,75 / 1.000.000 = 0,0056 USD, tức khoảng 145 đ.

Hai điểm cần đọc đúng:

- **Gemini Pro** tính theo token của bản Flash. Model Pro thường suy luận dài hơn nên số thật sẽ cao hơn.
- **Claude Haiku 5.5 và GPT-6 Luna** rẻ nhất trên giấy, nhưng chưa có số đo độ chính xác khi đọc chữ viết tay của trẻ em. Model nhỏ đọc sai nhiều hơn thì số bài phải duyệt tay tăng lên, và phần tiết kiệm có thể mất.

## Giảm chi phí khi đã dùng thật

| Cách | Mức giảm | Áp dụng cho app |
| --- | --- | --- |
| **Batch API** (gửi cả xấp, nhận kết quả sau, không tức thì) | 50% trên cả 3 hãng | Hợp với kiểu "chụp chiều, chấm qua đêm". Engine hiện gọi từng bài, muốn dùng phải viết thêm |
| Thu nhỏ ảnh trước khi gửi | Token ảnh tỉ lệ với số điểm ảnh | App đã nén về cạnh dài khoảng 2.400 px. Hạ thấp hơn thì đọc sai ô nhỏ, chỉ làm sau khi PoC cho thấy vẫn đủ nét |
| Prompt caching (phần lời nhắc giống nhau giữa các bài) | Phần đọc từ cache: Claude Opus/Sonnet 5.5 còn 5% giá vào, OpenAI còn 10% | Lời nhắc chỉ khoảng 800 token, nên tiết kiệm được ít |
| Đặt hạn mức chi tiêu tháng trên trang quản trị của hãng | Chặn hoá đơn bất ngờ | Nên làm trước khi bật engine thật |

## Khác biệt ngoài giá

| | Gemini | Claude | ChatGPT (OpenAI) |
| --- | --- | --- | --- |
| Engine trong app | Có (`gemini`) | Có (`claude`) | Chưa có |
| Gói miễn phí | Có với các bản Flash; **dữ liệu dùng để cải thiện sản phẩm** | Trang giá không nêu | Trang giá không nêu |
| Giá sắp đổi | Gemini 3.8 Flash và 3.6 Flash tăng gấp đôi từ 01/01/2027; Gemini 4 Argon từ 01/12/2026 | Không thấy thông báo | Không thấy thông báo |
| Tự chuyển engine khi lỗi | Ghi `GRADING_ENGINE=gemini,claude` để engine thứ hai đọc thay khi engine đầu lỗi hoặc hết lượt | | |

Trước khi gửi bài thật của học sinh qua bất kỳ hãng nào, đọc điều khoản lưu trữ dữ liệu của gói trả phí đang dùng (mục 5 tài liệu BA, Nghị định 13/2023/NĐ-CP).

## Nguồn

Đã mở và đọc ngày 21/10/2026. Giá có thể đổi, nên xem lại trước khi chốt.

- [Claude API pricing](https://platform.claude.com/docs/en/about-claude/pricing): Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0,10/$0,50 (prompt đến 100.000 token), Batch giảm 50%
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing): giá các bản Flash, Flash-Lite, Pro, Batch giảm 50%, điều khoản dữ liệu của gói miễn phí, lịch tăng giá
- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing): giá GPT-5.x và GPT-6, Batch bằng nửa giá. Trang này không ghi cách tính token cho ảnh đầu vào, nên số token OpenAI trong bảng là ước lượng
- Số token Gemini đo thật: bảng `extractions` trong database dev, ngày 21/10/2026
