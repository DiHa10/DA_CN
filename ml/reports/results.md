# Kết quả trên tập test VLSP 2018 nhà hàng (500 review)

| Chỉ số | Từ điển (bộ cũ) | TF-IDF + Logistic Regression | PhoBERT |
|---|---:|---:|---:|
| **F1-macro trung bình 6 khía cạnh** | **0.4525** | **0.5110** | **0.6263** |
| F1 phát hiện khía cạnh | 0.8252 | 0.8598 | 0.9060 |
| Độ chính xác cảm xúc (khía cạnh phát hiện đúng) | 0.6634 | 0.7807 | 0.8534 |
| F1-macro Món ăn | 0.4340 | 0.4658 | 0.5251 |
| F1-macro Đồ uống | 0.3602 | 0.3860 | 0.4559 |
| F1-macro Phục vụ | 0.5024 | 0.5561 | 0.6650 |
| F1-macro Giá cả | 0.5161 | 0.5750 | 0.7800 |
| F1-macro Không gian | 0.4249 | 0.4971 | 0.6609 |
| F1-macro Vị trí | 0.4774 | 0.5863 | 0.6713 |

F1-macro tính trên 4 lớp: không nhắc / tích cực / trung lập / tiêu cực.
