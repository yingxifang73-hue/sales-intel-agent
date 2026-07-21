export type ReportModule = "overview" | "company" | "analysis" | "strategy" | "sources";

export const reportModules: ReadonlyArray<{
  id: ReportModule;
  title: string;
  description: string;
}> = [
  { id: "overview", title: "调研总览", description: "先看客户、证据和下一步" },
  { id: "company", title: "公司画像", description: "公司、产品与公开动态" },
  { id: "analysis", title: "业务判断", description: "模式、定位与待验证痛点" },
  { id: "strategy", title: "销售准备", description: "切入、开场和发现问题" },
  { id: "sources", title: "来源证据", description: "本次调研使用的公开页面" },
];
