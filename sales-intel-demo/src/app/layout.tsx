import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "作战卡 / 售前销售情报", description: "可追溯的售前销售情报作战卡" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
