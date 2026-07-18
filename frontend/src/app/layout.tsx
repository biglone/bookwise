import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bookwise",
  description:
    "上传图书后按章节生成中文学习导学的阅读工作台。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
