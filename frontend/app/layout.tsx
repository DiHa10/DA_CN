import type { Metadata } from "next";
import { Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// thay cho VenusCom của hướng Limón: trong các font thay thế, chỉ Plus Jakarta Sans có bộ dấu tiếng Việt
const ui = Plus_Jakarta_Sans({
  variable: "--font-ui",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

// hướng Editorial: chữ có chân cho tiêu đề, số liệu lớn và lời khách (như trích dẫn trên báo); có bộ dấu tiếng Việt và chữ nghiêng
const display = Newsreader({
  variable: "--font-serif",
  subsets: ["latin", "vietnamese"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Quán Nghe — phân tích phản hồi khách hàng",
  description: "Tự động phân tích cảm xúc và khía cạnh trong đánh giá của khách hàng",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={`${ui.variable} ${display.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
