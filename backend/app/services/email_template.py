"""Khung HTML chung cho email của Quán Nghe (đặt lại mật khẩu, báo cáo tuần), cùng màu với web.

Email client (Gmail, Outlook) chỉ hiểu bảng và style viết thẳng vào thẻ: không CSS ngoài, không font web, không flex.
Mọi chữ do người dùng nhập (tên quán, lời khách) phải escape trước khi đưa vào `body`.
"""

import html
import os

APP_URL = os.getenv("APP_URL", "http://localhost:3000")  # link trong email trỏ về đây

NAVY, BLUE, GOLD, CREAM, INK, MUTED, RULE = "#0f1a2e", "#1c3a6e", "#e3b04b", "#fcf9f0", "#0f1a2e", "#586179", "#d9dee8"
NEGATIVE = "#b3362b"
FONT = "Arial,Helvetica,sans-serif"
e = html.escape


def button(href: str, label: str) -> str:
    # nút bằng ô bảng tô màu: thẻ <a> có padding không hiện đúng trên Outlook
    return (f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr>'
            f'<td style="background:{NAVY};border-radius:4px">'
            f'<a href="{e(href)}" style="display:inline-block;padding:13px 24px;font:bold 14px {FONT};'
            f'letter-spacing:1px;text-transform:uppercase;color:{CREAM};text-decoration:none">{e(label)}</a>'
            f'</td></tr></table>')


def note(text_html: str, color: str = GOLD) -> str:
    """Khối nhấn có vạch màu bên trái (cảnh báo: đỏ, gợi ý AI: vàng đồng)."""
    return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px"><tr>'
            f'<td style="border-left:3px solid {color};background:#ffffff;padding:10px 14px;font:14px/1.5 {FONT};'
            f'color:{INK}">{text_html}</td></tr></table>')


def layout(title: str, body: str, preheader: str = "", footer: str = "") -> str:
    """title, preheader, footer là chữ thường (tự escape); body là HTML đã escape sẵn."""
    return f"""<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title></head>
<body style="margin:0;padding:0;background:#eef0f4">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{e(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="background:{NAVY};border-radius:8px 8px 0 0;padding:18px 28px;font:bold 15px {FONT};letter-spacing:3px;color:{CREAM}">
<span style="color:{GOLD};font-size:22px;letter-spacing:0">&ldquo;</span>&nbsp;QUÁN NGHE</td></tr>
<tr><td style="background:{CREAM};border-radius:0 0 8px 8px;padding:28px;font:15px/1.6 {FONT};color:{INK}">
<h1 style="margin:0 0 16px;font:22px/1.3 {FONT};color:{BLUE}">{e(title)}</h1>
{body}
</td></tr>
<tr><td style="padding:16px 28px;font:12px/1.5 {FONT};color:{MUTED}">{e(footer) or "Email tự động từ Quán Nghe, hệ thống phân tích phản hồi khách hàng."}</td></tr>
</table></td></tr></table>
</body></html>"""
