import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// thay cho VenusCom của hướng Limón: trong các font thay thế, chỉ Plus Jakarta Sans có bộ dấu tiếng Việt
const ui = Plus_Jakarta_Sans({
  variable: "--font-ui",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
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
      <body className={`${ui.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
