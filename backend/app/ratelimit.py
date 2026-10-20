import time
from collections import defaultdict, deque

from fastapi import HTTPException, status


class SlidingWindow:
    """Đếm sự kiện theo khóa trong cửa sổ trượt.

    shortcut: lưu trong RAM, mất khi restart và không chia sẻ giữa nhiều worker; đổi sang Redis nếu chạy nhiều instance.
    """

    SWEEP_EVERY = 1024  # cứ chừng này lượt hit thì quét bỏ mọi khóa đã hết hạn

    def __init__(self, limit: int, window_s: float, message: str):
        self.limit, self.window, self.message = limit, window_s, message
        self._hits: dict[str, deque] = defaultdict(deque)
        self._since_sweep = 0

    def _prune(self, key: str) -> deque:
        now, hits = time.monotonic(), self._hits.get(key, deque())
        while hits and now - hits[0] > self.window:
            hits.popleft()
        if not hits:
            self._hits.pop(key, None)
        return hits

    def _sweep(self) -> None:
        # IP giả / email lạ thường không quay lại nên _prune không gặp lại chúng: phải quét định kỳ, nếu không RAM tăng mãi
        now = time.monotonic()
        for key in [k for k, h in self._hits.items() if not h or now - h[-1] > self.window]:
            del self._hits[key]

    def check(self, key: str) -> None:
        """Ném 429 nếu khóa đã chạm giới hạn; không tự ghi nhận."""
        if len(self._prune(key)) >= self.limit:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, self.message)

    def hit(self, key: str) -> None:
        self.check(key)
        self._hits[key].append(time.monotonic())
        self._since_sweep += 1
        if self._since_sweep >= self.SWEEP_EVERY:
            self._since_sweep = 0
            self._sweep()

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)
