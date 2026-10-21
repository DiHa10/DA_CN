# Kết quả bộ phát hiện spam

Luật trùng lặp: câu từ 8 từ trở lên, giống nhau >= 90% (SequenceMatcher sau khi chuẩn hóa và bỏ dấu câu). Luật rác: gần như không có chữ cái.

## 1. Nhận nhầm review thật

Kho review thật: 1940 review (1790 VLSP + 150 câu ngắn), so từng cặp (1,880,830 cặp).

| Luật | Review thật bị gắn nhầm |
|---|---:|
| Nội dung vô nghĩa | 0/1940 (0.0%) |
| Trùng lặp | 1/1880830 (0.0%) cặp |

- Cặp bị gắn trùng (kiểm tra tay xem có phải trùng thật): «Bán các loại xiên nướng như ở trên Sapa luônCó gà, dê, chả c…» ~ «Bán các loại xiên nướng như ở trên Sapa luônCó gà, dê, chả c…»

## 2. Tập viết tay (spam và ca khó)

| Luật | Precision | Recall | F1 |
|---|---:|---:|---:|
| Trùng lặp (20 cặp spam, 6 cặp khó) | 0.93 | 0.70 | 0.80 |
| Nội dung vô nghĩa (24 rác, 14 câu ngắn thật) | 0.89 | 0.71 | 0.79 |

### Trùng lặp: spam đăng lại có biến đổi

| Cách biến đổi | Mẫu gốc | Kết quả |
|---|---|---|
| Chép y hệt | chê | bắt được |
| Đổi hoa thường, dấu câu | chê | bắt được |
| Thêm một từ | chê | bắt được |
| Kéo dài chữ | chê | bắt được |
| Viết tắt teencode | chê | bắt được |
| Thay một từ | chê | bắt được |
| Thêm emoji | chê | bắt được |
| Đảo vế câu | chê | bỏ sót |
| Bỏ dấu tiếng Việt | chê | bỏ sót |
| Viết lại ý (paraphrase) | chê | bỏ sót |
| Chép y hệt | quảng cáo | bắt được |
| Đổi hoa thường, dấu câu | quảng cáo | bắt được |
| Thêm một từ | quảng cáo | bắt được |
| Kéo dài chữ | quảng cáo | bắt được |
| Viết tắt teencode | quảng cáo | bắt được |
| Thay một từ | quảng cáo | bắt được |
| Thêm emoji | quảng cáo | bắt được |
| Đảo vế câu | quảng cáo | bỏ sót |
| Bỏ dấu tiếng Việt | quảng cáo | bỏ sót |
| Viết lại ý (paraphrase) | quảng cáo | bỏ sót |

### Trùng lặp: hai khách khác nhau, cùng khuôn câu, khác ý

| Câu 1 | Câu 2 | Kết quả |
|---|---|---|
| Phở ngon, nước dùng đậm đà, nhân viên thân thiện, sẽ quay lại | Phở ngon, nước dùng hơi nhạt, nhân viên thân thiện, sẽ quay lại | đúng (không gắn) |
| Cà phê ngon, không gian yên tĩnh, rất thích hợp để làm việc | Cà phê dở, không gian ồn ào, không thích hợp để làm việc | đúng (không gắn) |
| Giá hơi cao so với chất lượng nhưng phục vụ nhanh và nhiệt tình | Giá hợp lý so với chất lượng, phục vụ nhanh và nhiệt tình | đúng (không gắn) |
| Món ăn ngon, giá cả hợp lý, nhân viên thân thiện, sẽ quay lại | Món ăn ngon, giá cả hợp lý, không gian thoáng mát, sẽ quay lại ủng hộ | đúng (không gắn) |
| Đồ ăn ngon nhưng phục vụ hơi chậm, phải đợi gần 30 phút | Đồ ăn ngon nhưng phục vụ hơi chậm, phải đợi gần 45 phút | nhận nhầm |
| Nhân viên rất nhiệt tình, quán sạch sẽ, đồ uống ngon, giá ổn | Nhân viên không nhiệt tình, quán không sạch sẽ, đồ uống không ngon, giá không ổn | đúng (không gắn) |

### Nội dung vô nghĩa

Bỏ sót: `asdfghjkl`, `qwerty`, `test`, `abc xyz`, `jdjdjdjd`, `hdhdhdhd`, `lorem ipsum`

Câu thật bị nhận nhầm: `10/10`, `10đ`
