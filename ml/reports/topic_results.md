# Bộ lọc chủ đề cho PhoBERT

Khía cạnh model đoán mà câu không có từ nào thuộc khía cạnh đó thì bỏ (backend/app/services/nlp.py, `CUES`).

## 1. Tập test VLSP 2018 (500 review có nhãn)

| Chỉ số | Không lọc | Có lọc |
|---|---:|---:|
| F1-macro trung bình 6 khía cạnh | 0.6263 | 0.6315 |
| F1 phát hiện khía cạnh | 0.9060 | 0.9122 |
| Độ chính xác cảm xúc | 0.8534 | 0.8529 |

Số khía cạnh bị lọc bỏ: 33 / 1647.

## 2. Câu về quán chưa có nhãn

| Tập | Số câu | Câu bị lọc mất ít nhất 1 khía cạnh | Câu bị coi là không nói về quán |
|---|---:|---:|---:|
| short_test | 150 | 28 | 23 |
| real_test | 52 | 11 | 12 |

Ví dụ câu short_test bị lọc (để bổ sung từ vào `CUES` nếu là lọc nhầm):

- Quán khó tìm nằm sâu trong hẻm → bỏ ambience
- Bàn ghế dính dầu mỡ bẩn → bỏ food
- Giá rẻ mà chất lượng không tệ → bỏ food
- Máy lạnh mát nhạc nhẹ dễ chịu → bỏ food
- Khá ổn → bỏ food
- Tạm được → bỏ food
- Tệ → bỏ food
- Tuyệt vời → bỏ food
- Không có gì để chê → bỏ food
- Quán đẹp mà đồ ăn dở → bỏ service
- gia hoi mac nhung dang tien → bỏ food
- Chất lượng đi xuống so với hồi trước → bỏ food
- Nhà vệ sinh dơ không có giấy → bỏ food
- Đá trong ly nước có mùi lạ → bỏ food
- Nhạc mở to đinh tai nhức óc → bỏ food

## 3. Câu ngoài lề (30 câu viết tay)

| | Không lọc | Có lọc |
|---|---:|---:|
| Câu bị gán ít nhất 1 khía cạnh (sai) | 24 | 0 |

Câu được nhận ra "không nói về quán": 30 / 30.

