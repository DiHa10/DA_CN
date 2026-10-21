"""Mô phỏng Monte Carlo cho cảnh báo bất thường: báo nhầm bao nhiêu khi quán ổn định, bắt được bao nhiêu khi tỉ lệ chê tăng thật.

Chạy: ../backend/.venv/Scripts/python -X utf8 eval_anomaly.py   -> reports/anomaly_results.md

Mỗi lần thử: 8 tuần nền với tỉ lệ chê P0, rồi 1 tuần với tỉ lệ P0 + mức tăng; số lượt nhắc mỗi tuần cố định.
Dùng đúng hàm is_anomaly của backend. Giả định các review độc lập (thực tế khách đi theo nhóm thì kém hơn chút).
"""

import sys

import numpy as np

from data import ROOT

sys.path.insert(0, str(ROOT.parent / "backend"))
from app.services.anomaly import BASELINE_WEEKS, MIN_JUMP, MIN_Z, is_anomaly  # noqa: E402

TRIALS = 10_000
P0 = 0.2
VOLUMES = [5, 10, 20, 50]  # lượt nhắc một khía cạnh mỗi tuần
JUMPS = [0, 0.1, 0.2, 0.3]
CHECKS_PER_YEAR = 52 * 7  # 52 tuần x (6 khía cạnh + tổng thể)


def alarm_rate(n: int, p0: float, jump: float, rng) -> float:
    base_neg = rng.binomial(n * BASELINE_WEEKS, p0, TRIALS)
    neg = rng.binomial(n, min(p0 + jump, 1), TRIALS)
    return sum(is_anomaly(int(k), n, int(b), n * BASELINE_WEEKS)[0] for k, b in zip(neg, base_neg)) / TRIALS


def main():
    rng = np.random.default_rng(42)
    table = {(n, j): alarm_rate(n, P0, j, rng) for n in VOLUMES for j in JUMPS}
    pct = lambda x: f"{x * 100:.1f}%"
    lines = [
        "# Mô phỏng cảnh báo bất thường",
        "",
        f"Ngưỡng: tăng >= {MIN_JUMP:.0%} điểm và z >= {MIN_Z}, nền {BASELINE_WEEKS} tuần. "
        f"Tỉ lệ chê bình thường {P0:.0%}, {TRIALS:,} lần thử mỗi ô.",
        "",
        "| Lượt nhắc / tuần | Báo nhầm (không tăng) | Bắt được khi tăng 10 điểm | tăng 20 điểm | tăng 30 điểm |",
        "|---:|---:|---:|---:|---:|",
        *[f"| {n} | {pct(table[n, 0])} | {pct(table[n, 0.1])} | {pct(table[n, 0.2])} | {pct(table[n, 0.3])} |"
          for n in VOLUMES],
        "",
        "Tăng 10 điểm thấp hơn ngưỡng 15 điểm nên cột đó là \"báo khi chưa cần\", càng thấp càng tốt.",
        "",
        "Báo nhầm cả năm cho một quán (ước lượng thô, coi 7 lần kiểm tra mỗi tuần là độc lập): "
        + ", ".join(f"{n} lượt/tuần ~ {table[n, 0] * CHECKS_PER_YEAR:.1f} lần" for n in VOLUMES) + ".",
        "",
    ]
    (ROOT / "reports").mkdir(exist_ok=True)
    (ROOT / "reports" / "anomaly_results.md").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
