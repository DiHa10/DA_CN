import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

// giao diện sáng, thân thiện: một font không chân bo tròn, vẽ riêng cho tiếng Việt; chữ nghiêng cho lời khách
const ui = Be_Vietnam_Pro({
  variable: "--font-ui",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
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
