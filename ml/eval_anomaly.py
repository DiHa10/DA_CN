"""Mô phỏng Monte Carlo cho cảnh báo bất thường: báo nhầm bao nhiêu khi quán ổn định, bắt được bao nhiêu khi tỉ lệ chê tăng thật.

Chạy: ../backend/.venv/Scripts/python -X utf8 eval_anomaly.py   -> reports/anomaly_results.md

Mỗi lần thử: 8 tuần nền với tỉ lệ chê P0, rồi 1 tuần với tỉ lệ P0 + mức tăng; số lượt nhắc mỗi tuần cố định.
Dùng đúng hàm is_anomaly của backend. Giả định các review độc lập (thực tế khách đi theo nhóm thì kém hơn chút).

Phần 2 mô phỏng cả năm như hệ thống chạy thật: dashboard tính lại cửa sổ 7 ngày mỗi ngày, cho 7 dãy (6 khía cạnh + tổng thể).
Đếm "đợt báo nhầm": chuỗi ngày liền nhau cùng một dãy báo, tính là một lần chủ quán thấy cảnh báo.
So luật báo ngay khi vượt ngưỡng (1 ngày) với luật backend đang dùng (PERSIST_DAYS ngày liền).
"""

import sys

import numpy as np

from data import ROOT

sys.path.insert(0, str(ROOT.parent / "backend"))
from app.services.anomaly import BASELINE_WEEKS, MIN_JUMP, MIN_Z, PERSIST_DAYS, WINDOW_DAYS, is_anomaly  # noqa: E402

TRIALS = 10_000
P0 = 0.2
VOLUMES = [5, 10, 20, 50]  # lượt nhắc một khía cạnh mỗi tuần
JUMPS = [0, 0.1, 0.2, 0.3]
CHECKS_PER_YEAR = 52 * 7  # 52 tuần x (6 khía cạnh + tổng thể)
SERIES = 7  # 6 khía cạnh + tổng thể
YEARS = 1000  # số năm-quán mô phỏng cho mỗi mức lượt nhắc
STEP_TRIALS = 5000  # số dãy mô phỏng cho mỗi ô "bắt được trong 7 ngày"
RULES = [1, PERSIST_DAYS]  # báo ngay khi vượt ngưỡng / phải vượt liền PERSIST_DAYS ngày (backend đang dùng)
WARM = WINDOW_DAYS + BASELINE_WEEKS * 7


def daily_hits(rates: np.ndarray, n: int, rng) -> np.ndarray:
    """hits[i]: cửa sổ 7 ngày kết thúc ở ngày WARM+i có vượt ngưỡng không. rates: tỉ lệ chê thật của từng ngày."""
    mentions = rng.poisson(n / 7, len(rates))
    neg = rng.binomial(mentions, rates)
    cm, cn = np.concatenate([[0], np.cumsum(mentions)]), np.concatenate([[0], np.cumsum(neg)])
    hits = []
    for d in range(WARM, len(rates) + 1):  # cửa sổ [d-7, d), nền [d-63, d-7)
        r, b = d - WINDOW_DAYS, d - WARM
        hits.append(is_anomaly(int(cn[d] - cn[r]), int(cm[d] - cm[r]), int(cn[r] - cn[b]), int(cm[r] - cm[b]))[0])
    return np.array(hits)


def persist(hits: np.ndarray, k: int) -> np.ndarray:
    """Báo ở ngày i khi k ngày liền tới i đều vượt ngưỡng (như anomaly.detect)."""
    out = hits.copy()
    for j in range(1, k):
        out[j:] &= hits[:-j]
        out[:j] = False
    return out


def false_episodes(n: int, p0: float, k: int, rng) -> float:
    """Số đợt báo nhầm trung bình mỗi năm cho một quán ổn định (tỉ lệ chê không đổi), kiểm mỗi ngày trên 7 dãy.

    Kỳ vọng của tổng số đợt không phụ thuộc việc các dãy có liên quan nhau hay không (cộng kỳ vọng từng dãy),
    nên coi 7 dãy độc lập không làm sai con số này.
    """
    episodes = 0
    for _ in range(YEARS * SERIES):
        alert = persist(daily_hits(np.full(WARM + 365, p0), n, rng), k)
        episodes += int(alert[0]) + int((alert[1:] & ~alert[:-1]).sum())
    return episodes / YEARS


def caught_within(n: int, p0: float, jump: float, k: int, days: int, rng) -> float:
    """Tỉ lệ chê tăng thêm `jump` từ một ngày và giữ nguyên: tỉ lệ lần thử có cảnh báo trong `days` ngày sau đó."""
    rates = np.r_[np.full(WARM, p0), np.full(days, min(p0 + jump, 1))]
    # hits[0]: cửa sổ còn toàn ngày cũ; hits[i]: cửa sổ kết thúc i ngày sau khi tăng
    return sum(persist(daily_hits(rates, n, rng), k)[1:].any() for _ in range(STEP_TRIALS)) / STEP_TRIALS


def alarm_rate(n: int, p0: float, jump: float, rng) -> float:
    base_neg = rng.binomial(n * BASELINE_WEEKS, p0, TRIALS)
    neg = rng.binomial(n, min(p0 + jump, 1), TRIALS)
    return sum(is_anomaly(int(k), n, int(b), n * BASELINE_WEEKS)[0] for k, b in zip(neg, base_neg)) / TRIALS


def main():
    rng = np.random.default_rng(42)
    table = {(n, j): alarm_rate(n, P0, j, rng) for n in VOLUMES for j in JUMPS}
    yearly = {(k, n): false_episodes(n, P0, k, rng) for k in RULES for n in VOLUMES}
    cases = [(0.2, 7), (0.2, 14), (0.3, 7)]  # (mức tăng, số ngày tính từ lúc tăng)
    caught = {(k, n, c): caught_within(n, P0, c[0], k, c[1], rng) for k in RULES for n in VOLUMES for c in cases}
    rule = lambda k: "báo ngay" if k == 1 else f"{k} ngày liền"
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
        "Một đợt = chuỗi ngày liền nhau cùng một dãy báo (chủ quán thấy một cảnh báo). "
        f"\"Bắt được\": tỉ lệ chê một dãy tăng thật từ một ngày và giữ nguyên, có cảnh báo trong 7 (hoặc 14) ngày sau đó "
        f"({STEP_TRIALS:,} lần thử mỗi ô).",
        "",
        "| Lượt nhắc / tuần mỗi dãy | Luật | Đợt báo nhầm / năm | Tăng 20 điểm, trong 7 ngày | trong 14 ngày | Tăng 30 điểm, trong 7 ngày |",
        "|---:|---|---:|---:|---:|---:|",
        *[f"| {n} | {rule(k)} | {yearly[k, n]:.1f} | " + " | ".join(pct(caught[k, n, c]) for c in cases) + " |"
          for n in VOLUMES for k in RULES],
        "",
        f"Backend dùng luật {rule(PERSIST_DAYS)} (anomaly.PERSIST_DAYS).",
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
