"""Mô phỏng Monte Carlo cho cảnh báo bất thường: báo nhầm bao nhiêu khi quán ổn định, bắt được bao nhiêu khi tỉ lệ chê tăng thật.

Chạy: ../backend/.venv/Scripts/python -X utf8 eval_anomaly.py   -> reports/anomaly_results.md

Mỗi lần thử: 8 tuần nền với tỉ lệ chê P0, rồi 1 tuần với tỉ lệ P0 + mức tăng; số lượt nhắc mỗi tuần cố định.
Dùng đúng hàm is_anomaly của backend. Giả định các review độc lập (thực tế khách đi theo nhóm thì kém hơn chút).

Phần 2 mô phỏng cả năm như hệ thống chạy thật: dashboard tính lại cửa sổ 7 ngày mỗi ngày, cho 7 dãy (6 khía cạnh + tổng thể).
Đếm "đợt báo nhầm": chuỗi ngày liền nhau cùng một dãy báo, tính là một lần chủ quán thấy cảnh báo.
"""

import sys

import numpy as np

from data import ROOT

sys.path.insert(0, str(ROOT.parent / "backend"))
from app.services import anomaly  # noqa: E402
from app.services.anomaly import BASELINE_WEEKS, MIN_JUMP, MIN_Z, WINDOW_DAYS, is_anomaly  # noqa: E402

TRIALS = 10_000
P0 = 0.2
VOLUMES = [5, 10, 20, 50]  # lượt nhắc một khía cạnh mỗi tuần
JUMPS = [0, 0.1, 0.2, 0.3]
CHECKS_PER_YEAR = 52 * 7  # 52 tuần x (6 khía cạnh + tổng thể)
SERIES = 7  # 6 khía cạnh + tổng thể
YEARS = 1000  # số năm-quán mô phỏng cho mỗi mức lượt nhắc
Z_OPTIONS = [MIN_Z, 3.0]  # ngưỡng đang dùng và một ngưỡng chặt hơn để so


def false_episodes(n: int, p0: float, rng) -> float:
    """Số đợt báo nhầm trung bình mỗi năm cho một quán ổn định (tỉ lệ chê không đổi), kiểm mỗi ngày trên 7 dãy.

    Kỳ vọng của tổng số đợt không phụ thuộc việc các dãy có liên quan nhau hay không (cộng kỳ vọng từng dãy),
    nên coi 7 dãy độc lập không làm sai con số này.
    """
    warm = WINDOW_DAYS + BASELINE_WEEKS * 7
    days = warm + 365
    episodes = 0
    for _ in range(YEARS * SERIES):
        mentions = rng.poisson(n / 7, days)
        neg = rng.binomial(mentions, p0)
        cm, cn = np.concatenate([[0], np.cumsum(mentions)]), np.concatenate([[0], np.cumsum(neg)])
        prev = False
        for d in range(warm, days):  # cửa sổ [d-7, d), nền [d-63, d-7)
            r, b = d - WINDOW_DAYS, d - warm
            hit = is_anomaly(int(cn[d] - cn[r]), int(cm[d] - cm[r]), int(cn[r] - cn[b]), int(cm[r] - cm[b]))[0]
            episodes += hit and not prev
            prev = hit
    return episodes / YEARS


def alarm_rate(n: int, p0: float, jump: float, rng) -> float:
    base_neg = rng.binomial(n * BASELINE_WEEKS, p0, TRIALS)
    neg = rng.binomial(n, min(p0 + jump, 1), TRIALS)
    return sum(is_anomaly(int(k), n, int(b), n * BASELINE_WEEKS)[0] for k, b in zip(neg, base_neg)) / TRIALS


def main():
    rng = np.random.default_rng(42)
    table = {(n, j): alarm_rate(n, P0, j, rng) for n in VOLUMES for j in JUMPS}
    yearly, power = {}, {}
    for z in Z_OPTIONS:
        anomaly.MIN_Z = z  # is_anomaly đọc ngưỡng từ module mỗi lần gọi
        yearly |= {(z, n): false_episodes(n, P0, rng) for n in VOLUMES}
        power |= {(z, n): alarm_rate(n, P0, 0.2, rng) for n in VOLUMES}
    anomaly.MIN_Z = MIN_Z
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
        "## Cả năm, kiểm mỗi ngày như hệ thống chạy thật",
        "",
        f"Một quán ổn định (tỉ lệ chê luôn {P0:.0%}), dashboard tính lại cửa sổ {WINDOW_DAYS} ngày mỗi ngày cho {SERIES} dãy "
        f"(6 khía cạnh + tổng thể). Lượt nhắc mỗi ngày theo Poisson. {YEARS} năm-quán mỗi ô. "
        "Một đợt = chuỗi ngày liền nhau cùng một dãy báo (chủ quán thấy một cảnh báo).",
        "",
        "| Lượt nhắc / tuần mỗi dãy | " + " | ".join(f"Đợt báo nhầm / năm (z >= {z})" for z in Z_OPTIONS)
        + " | " + " | ".join(f"Bắt được khi tăng 20 điểm (z >= {z})" for z in Z_OPTIONS) + " |",
        "|---:|" + "---:|" * (2 * len(Z_OPTIONS)),
        *[f"| {n} | " + " | ".join(f"{yearly[z, n]:.1f}" for z in Z_OPTIONS) + " | "
          + " | ".join(pct(power[z, n]) for z in Z_OPTIONS) + " |" for n in VOLUMES],
        "",
        f"Ước lượng thô cũ (báo nhầm một lần kiểm x {CHECKS_PER_YEAR} lần kiểm mỗi năm, coi các tuần độc lập): "
        + ", ".join(f"{n} lượt/tuần ~ {table[n, 0] * CHECKS_PER_YEAR:.1f}" for n in VOLUMES) + ".",
        "",
    ]
    (ROOT / "reports").mkdir(exist_ok=True)
    (ROOT / "reports" / "anomaly_results.md").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
