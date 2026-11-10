# Mô phỏng cảnh báo bất thường

Ngưỡng: tăng >= 15% điểm và z >= 2.5, nền 8 tuần. Tỉ lệ chê bình thường 20%, 10,000 lần thử mỗi ô.

| Lượt nhắc / tuần | Báo nhầm (không tăng) | Bắt được khi tăng 10 điểm | tăng 20 điểm | tăng 30 điểm |
|---:|---:|---:|---:|---:|
| 5 | 1.8% | 4.9% | 11.3% | 21.8% |
| 10 | 1.2% | 6.7% | 18.6% | 39.6% |
| 20 | 1.2% | 9.7% | 34.6% | 67.1% |
| 50 | 0.8% | 20.7% | 72.2% | 97.1% |

Tăng 10 điểm thấp hơn ngưỡng 15 điểm nên cột đó là "báo khi chưa cần", càng thấp càng tốt.

## Cả năm, kiểm mỗi ngày như hệ thống chạy thật

Một quán ổn định (tỉ lệ chê luôn 20%), dashboard tính lại cửa sổ 7 ngày mỗi ngày cho 7 dãy (6 khía cạnh + tổng thể). Lượt nhắc mỗi ngày theo Poisson. 1000 năm-quán mỗi ô. Một đợt = chuỗi ngày liền nhau cùng một dãy báo (chủ quán thấy một cảnh báo).

| Lượt nhắc / tuần mỗi dãy | Đợt báo nhầm / năm (z >= 2.5) | Đợt báo nhầm / năm (z >= 3.0) | Bắt được khi tăng 20 điểm (z >= 2.5) | Bắt được khi tăng 20 điểm (z >= 3.0) |
|---:|---:|---:|---:|---:|
| 5 | 9.6 | 3.4 | 11.5% | 5.3% |
| 10 | 15.1 | 5.3 | 19.1% | 9.4% |
| 20 | 13.6 | 4.6 | 34.5% | 19.5% |
| 50 | 10.7 | 3.7 | 72.8% | 57.0% |

Ước lượng thô cũ (báo nhầm một lần kiểm x 364 lần kiểm mỗi năm, coi các tuần độc lập): 5 lượt/tuần ~ 6.7, 10 lượt/tuần ~ 4.4, 20 lượt/tuần ~ 4.4, 50 lượt/tuần ~ 2.7.
