import { assessSource } from "@/lib/source-quality";
import type { ResearchInput, Source } from "@/lib/types";

type ResearchTaskArchive = {
  id: number;
  label: string;
  categories: string[];
};

type ArchiveCollection = {
  notes: string[];
  warnings: string[];
  failures: Array<{ url: string; reason: string; channel?: string; timestamp?: string }>;
};

export type FullResearchArchiveInput = {
  generatedAt: string;
  input: ResearchInput;
  researchPlan: ResearchTaskArchive[];
  collection: ArchiveCollection;
  sources: Source[];
  selectedSourceIds: Set<string>;
  modelEvidence?: unknown;
  report: unknown;
};

function codeBlock(value: unknown, language = ""): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const matches = text.match(/`+/g) ?? [];
  const longest = matches.reduce((length, match) => Math.max(length, match.length), 0);
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${text}\n${fence}`;
}

function markdownList(values: string[]): string {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : "- 无";
}

/** Formats every source actually collected in one run. It intentionally does
 * not summarize or truncate source.content. */
export function formatFullResearchArchive(data: FullResearchArchiveInput): string {
  const assessments = data.sources.map((source) => assessSource(source, data.input.targetUrl));
  const selectedCount = data.sources.filter((source) => data.selectedSourceIds.has(source.id)).length;
  const lines: string[] = [
    `# 无删减研究档案：${data.input.sellerProfile.productName}`,
    "",
    `> 生成时间：${data.generatedAt}`,
    `> 目标官网：${data.input.targetUrl}`,
    `> 行业预设：${data.input.preset}`,
    `> 说明：本档案保留本次运行实际采集到的全部来源正文、筛选信息、研究计划、模型证据包和最终结构化报告。未采集到的网页不会被补写。`,
    "",
    "## 1. 运行输入",
    "",
    codeBlock(data.input, "json"),
    "",
    "## 2. 研究计划",
    "",
    "| 任务 | 研究方向 | 证据类别 |",
    "|---:|---|---|",
    ...data.researchPlan.map((task) => `| ${task.id} | ${task.label} | ${task.categories.join("、")} |`),
    "",
    "## 3. 采集与筛选记录",
    "",
    `- 实际采集来源：${data.sources.length} 条`,
    `- 进入最终销售报告：${selectedCount} 条`,
    `- 未进入最终销售报告：${data.sources.length - selectedCount} 条（仍完整保留在本档案）`,
    "",
    "### 采集备注",
    markdownList(data.collection.notes),
    "",
    "### 采集警告",
    markdownList(data.collection.warnings),
    "",
    "### 失败记录",
    data.collection.failures.length
      ? data.collection.failures.map((failure) => `- ${failure.channel ?? "unknown"}｜${failure.reason}｜${failure.url}${failure.timestamp ? `｜${failure.timestamp}` : ""}`).join("\n")
      : "- 无",
    "",
    "## 4. 全部采集来源与完整正文",
    "",
  ];

  for (let index = 0; index < data.sources.length; index++) {
    const source = data.sources[index]!;
    const assessment = assessments[index]!;
    const selected = data.selectedSourceIds.has(source.id) ? "已进入最终报告" : "未进入最终报告";
    lines.push(
      `### 来源 ${index + 1}：${source.title}`,
      "",
      `- 来源 ID：${source.id}`,
      `- 报告筛选：${selected}`,
      `- 质量评估：${assessment.eligible ? "可用" : "排除"}${assessment.reason ? `（${assessment.reason}）` : ""}`,
      `- 证据类别：${assessment.categories.join("、") || "无"}`,
      `- 质量评分：${assessment.score}`,
      `- 来源类型：${source.sourceType}`,
      `- URL：${source.url}`,
      `- 规范 URL：${source.canonicalUrl}`,
      `- 抓取时间：${source.fetchedAt}`,
      `- 正文长度：${source.content.length} 字符`,
      source.publishedAt ? `- 发布时间：${source.publishedAt}` : "",
      "",
      "#### 完整清洗正文",
      "",
      codeBlock(source.content, "text"),
      "",
    );
  }

  lines.push(
    "## 5. 实际送入模型的证据包",
    "",
    codeBlock(data.modelEvidence ?? [], "json"),
    "",
    "## 6. 最终结构化销售报告（原始 JSON）",
    "",
    codeBlock(data.report, "json"),
    "",
    "## 7. 档案边界说明",
    "",
    "- 本档案保留的是本次运行实际返回并清洗后的来源内容，不等同于互联网网页的原始 HTML、图片、视频或登录后内容。",
    "- 搜索结果若只提供摘要，档案会如实保留该摘要，不会把摘要伪装成完整正文。",
    "- 最终销售报告中的 AI 判断必须与来源直接事实区分阅读；判断不等同于客户已确认的内部信息。",
    "",
  );

  return lines.filter((line) => line !== "").join("\n");
}
