import time
from collections import defaultdict, deque

from fastapi import HTTPException, status


class SlidingWindow:
    """Đếm sự kiện theo khóa trong cửa sổ trượt.

    shortcut: lưu trong RAM, mất khi restart và không chia sẻ giữa nhiều worker; đổi sang Redis nếu chạy nhiều instance.
    """

    def __init__(self, limit: int, window_s: float, message: str):
        self.limit, self.window, self.message = limit, window_s, message
        self._hits: dict[str, deque] = defaultdict(deque)

    def _prune(self, key: str) -> deque:
        now, hits = time.monotonic(), self._hits[key]
        while hits and now - hits[0] > self.window:
            hits.popleft()
        return hits

    def check(self, key: str) -> None:
        """Ném 429 nếu khóa đã chạm giới hạn; không tự ghi nhận."""
        if len(self._prune(key)) >= self.limit:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, self.message)

    def hit(self, key: str) -> None:
        self.check(key)
        self._hits[key].append(time.monotonic())

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)
