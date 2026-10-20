from datetime import date, datetime, time, timezone, timedelta

# Giờ Việt Nam, không đổi theo mùa nên dùng offset cố định (không cần tzdata trên Windows).
# Mọi mốc "ngày", "tuần" mà chủ quán nhìn thấy đều tính theo múi giờ này.
VN = timezone(timedelta(hours=7))


def as_utc(dt: datetime) -> datetime:
    """SQLite trả datetime không kèm múi giờ (giá trị đã là UTC); Postgres trả có múi giờ."""
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def vn_date(dt: datetime) -> date:
    return as_utc(dt).astimezone(VN).date()


def vn_day_start(d: date) -> datetime:
    """00:00 giờ VN của ngày d, đổi sang UTC: SQLite bỏ múi giờ khi so sánh nên tham số phải cùng gốc UTC với dữ liệu."""
    return datetime.combine(d, time.min, VN).astimezone(timezone.utc)
