import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "会前销售作战卡",
  description: "公开证据驱动的 B2B 会前研究 Demo"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
