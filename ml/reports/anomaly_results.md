# Mô phỏng cảnh báo bất thường

Ngưỡng: tăng >= 15% điểm và z >= 2.5, nền 8 tuần. Tỉ lệ chê bình thường 20%, 10,000 lần thử mỗi ô.

| Lượt nhắc / tuần | Báo nhầm (không tăng) | Bắt được khi tăng 10 điểm | tăng 20 điểm | tăng 30 điểm |
|---:|---:|---:|---:|---:|
| 5 | 1.8% | 4.9% | 11.3% | 21.8% |
| 10 | 1.2% | 6.7% | 18.6% | 39.6% |
| 20 | 1.2% | 9.7% | 34.6% | 67.1% |
| 50 | 0.8% | 20.7% | 72.2% | 97.1% |

Tăng 10 điểm thấp hơn ngưỡng 15 điểm nên cột đó là "báo khi chưa cần", càng thấp càng tốt.

Báo nhầm cả năm cho một quán (ước lượng thô, coi 7 lần kiểm tra mỗi tuần là độc lập): 5 lượt/tuần ~ 6.7 lần, 10 lượt/tuần ~ 4.4 lần, 20 lượt/tuần ~ 4.4 lần, 50 lượt/tuần ~ 2.7 lần.
