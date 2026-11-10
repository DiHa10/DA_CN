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

Một quán ổn định (tỉ lệ chê luôn 20%), dashboard tính lại cửa sổ 7 ngày mỗi ngày cho 7 dãy (6 khía cạnh + tổng thể). Lượt nhắc mỗi ngày theo Poisson. 1000 năm-quán mỗi ô. Một đợt = chuỗi ngày liền nhau cùng một dãy báo (chủ quán thấy một cảnh báo). "Bắt được": tỉ lệ chê một dãy tăng thật từ một ngày và giữ nguyên, có cảnh báo trong 7 (hoặc 14) ngày sau đó (5,000 lần thử mỗi ô).

| Lượt nhắc / tuần mỗi dãy | Luật | Đợt báo nhầm / năm | Tăng 20 điểm, trong 7 ngày | trong 14 ngày | Tăng 30 điểm, trong 7 ngày |
|---:|---|---:|---:|---:|---:|
| 5 | báo ngay | 9.6 | 11.3% | 22.5% | 19.3% |
| 5 | 2 ngày liền | 4.5 | 5.8% | 14.7% | 11.3% |
| 10 | báo ngay | 15.2 | 24.6% | 46.6% | 44.1% |
| 10 | 2 ngày liền | 6.9 | 14.4% | 31.5% | 29.4% |
| 20 | báo ngay | 13.6 | 40.5% | 68.5% | 70.5% |
| 20 | 2 ngày liền | 6.2 | 26.8% | 53.3% | 52.0% |
| 50 | báo ngay | 10.7 | 75.7% | 95.2% | 97.2% |
| 50 | 2 ngày liền | 4.5 | 57.1% | 88.6% | 90.9% |

Backend dùng luật 2 ngày liền (anomaly.PERSIST_DAYS).

Ước lượng thô cũ (báo nhầm một lần kiểm x 364 lần kiểm mỗi năm, coi các tuần độc lập): 5 lượt/tuần ~ 6.7, 10 lượt/tuần ~ 4.4, 20 lượt/tuần ~ 4.4, 50 lượt/tuần ~ 2.7.
