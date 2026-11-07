import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

// IBM Plex Sans: chữ giao diện rõ, số đẹp trong bảng; có bộ dấu tiếng Việt; chữ nghiêng cho lời khách
const ui = IBM_Plex_Sans({
  variable: "--font-ui",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600"],
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
      <body className={`${ui.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
