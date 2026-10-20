# Hướng dẫn gán nhãn tập review ngắn

Mục đích: đo model trên câu ngắn giống góp ý khách gửi qua mã QR. Tập test VLSP chỉ có review dài.

## Cách làm
1. Một người tạo file cho cả nhóm (trong thư mục `ml`):
   `../backend/.venv/Scripts/python -X utf8 short_test.py init <tên1> <tên2> <tên3>`
2. Mỗi người mở **file của mình** `short_test/labels_<tên>.csv` bằng Excel hoặc Google Sheets.
3. Gán nhãn **độc lập**: không xem file của người khác, không bàn từng câu, không chạy model để xem nó đoán gì.
4. Lưu lại đúng định dạng CSV (Excel: *Save As → CSV UTF-8*), giữ nguyên tên cột và tên file.
5. Chấm điểm: `../backend/.venv/Scripts/python -X utf8 short_test.py eval` → `reports/short_results.md`.

## Mã nhãn (mỗi cột là một khía cạnh)
| Mã | Nghĩa |
|---|---|
| `k` | khen (tích cực) |
| `c` | chê (tiêu cực) |
| `t` | có nhắc tới nhưng không khen không chê (trung lập) |
| để trống | câu không nhắc tới khía cạnh này |

## Khía cạnh
| Cột | Gồm |
|---|---|
| `mon_an` | món ăn: vị, độ tươi, nhiệt độ, trình bày, khẩu phần, độ đa dạng của menu |
| `do_uong` | đồ uống: cà phê, trà, bia, nước ép, đá |
| `phuc_vu` | nhân viên, chủ quán, thái độ, tốc độ lên món, order sai, tính tiền, giao hàng |
| `gia_ca` | giá, phụ thu, khuyến mãi, "đáng tiền" / "không đáng tiền" |
| `khong_gian` | chỗ ngồi, trang trí, nhạc, ánh sáng, độ ồn, nhiệt độ phòng, vệ sinh, nhà vệ sinh |
| `vi_tri` | dễ hay khó tìm, đường vào, kẹt xe, chỗ để xe, gần đâu |

## Quy tắc
- Chỉ gán khía cạnh **được nói tới trong câu**. "Tệ", "Cho 5 sao", "Thất vọng" không nói khía cạnh nào → để trống cả hàng.
- "Ngon", "dở" không nói rõ món hay nước → coi là `mon_an`.
- Mỉa mai thì gán theo **ý thật**: "Ngon cái gì mà ngon" → `mon_an` = `c`.
- Khen chê lẫn lộn trong **cùng một khía cạnh** ("gà giòn nhưng hơi khô") → chọn ý người viết nhấn mạnh hơn; phân vân thì `t`.
- Chỉ nói giá cao hoặc thấp: "món nào cũng trên 100k" → `gia_ca` = `t`; "giá trên trời" → `c`.
- Câu kể, không đánh giá ("Hôm nay quán đông khách quá") → `t` cho khía cạnh được nhắc, hoặc để trống nếu không nhắc khía cạnh nào.

## Ví dụ
| Câu | mon_an | do_uong | phuc_vu | gia_ca | khong_gian | vi_tri |
|---|---|---|---|---|---|---|
| Phở ngon nhưng phục vụ chậm | k | | c | | | |
| Trà sữa nhạt, giá hơi cao | | c | | c | | |
| Quán khó tìm nhưng không gian đẹp | | | | | k | c |
