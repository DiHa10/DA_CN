import type { Metadata } from "next";
import { Be_Vietnam_Pro, Patrick_Hand } from "next/font/google";
import "./globals.css";

const ui = Be_Vietnam_Pro({
  variable: "--font-ui",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

// chỉ cho lời khách
const hand = Patrick_Hand({
  variable: "--font-hand-face",
  subsets: ["latin", "vietnamese"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Lời Khách — phân tích phản hồi khách hàng",
  description: "Tự động phân tích cảm xúc và khía cạnh trong đánh giá của khách hàng",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={`${ui.variable} ${hand.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
