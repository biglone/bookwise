import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bookwise",
  description:
    "A study platform for uploaded books with chapter-by-chapter AI learning guides.",
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
