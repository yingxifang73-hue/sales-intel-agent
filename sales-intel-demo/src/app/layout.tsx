import type { Metadata } from "next";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "销售调研 Agent", description: "基于公开信息生成结构化销售调研报告" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            localStorage.removeItem("sales-intel-active-research-v1");
            localStorage.removeItem("sales-intel-active-research-v2");
          } catch(e) {}
        `}} />
      </head>
      <body>{children}</body>
    </html>
  );
}
