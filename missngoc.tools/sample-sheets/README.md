# Tạo phiếu trả lời mẫu để thử AI

Tạo phiếu "viết chữ A/B/C/D vào ô" nhiều kiểu bố cục, giả lập ảnh chụp điện thoại hoặc scan, kèm đáp án chuẩn (`truth.csv`) để chạy `npm run poc -- --truth ...`.

Cần Python 3 có Pillow và numpy, chạy trên Windows (dùng font Arial, Times New Roman có sẵn).

```bash
# 1. Tải font viết tay (Google Fonts, giấy phép OFL) vào một thư mục, ví dụ fonts/
B=https://raw.githubusercontent.com/google/fonts/main/ofl
mkdir -p fonts
curl -o fonts/PatrickHand.ttf $B/patrickhand/PatrickHand-Regular.ttf   # bắt buộc: dùng cho họ tên có dấu
curl -o fonts/Caveat.ttf "$B/caveat/Caveat%5Bwght%5D.ttf"
curl -o fonts/IndieFlower.ttf $B/indieflower/IndieFlower-Regular.ttf
curl -o fonts/ShadowsIntoLight.ttf $B/shadowsintolight/ShadowsIntoLight.ttf
curl -o fonts/GochiHand.ttf $B/gochihand/GochiHand-Regular.ttf
curl -o fonts/NanumPen.ttf $B/nanumpenscript/NanumPenScript-Regular.ttf
curl -o fonts/ArchitectsDaughter.ttf $B/architectsdaughter/ArchitectsDaughter-Regular.ttf

# 2. Tạo 16 phiếu + truth.csv + manifest.json
python gen_sheets.py fonts ../../poc-samples/datasets/synthetic

# Bộ 5 bài Starters 3 (đáp án BBCDABCDAB, có file import vào app)
python -X utf8 gen_starters3.py fonts ../../poc-samples/datasets/starters3

# 3. Ghép ảnh xem nhanh (tuỳ chọn)
python contact_sheet.py xem-nhanh.jpg ../../poc-samples/datasets/synthetic/*.jpg
```

Thêm bố cục mới: viết hàm `layout_...` trong `gen_sheets.py` rồi thêm một dòng vào `SHEETS`.
