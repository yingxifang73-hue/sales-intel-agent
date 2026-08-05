import { describe, expect, it } from "vitest";
import { normalizeWorkflowError, presentResearchFailure } from "@/lib/workflow-error";

describe("workflow error normalization", () => {
  it("keeps a message from a serialized workflow error object", () => {
    expect(normalizeWorkflowError({ name: "FatalError", message: "最终报告缺失，不能结算调研次数。" })).toMatchObject({
      message: "最终报告缺失，不能结算调研次数。",
      code: "report_missing",
    });
  });

  it("finds nested causes instead of replacing them with an unknown error", () => {
    expect(normalizeWorkflowError({ cause: { message: "模型服务请求超时" } })).toMatchObject({
      message: "模型服务请求超时",
      code: "provider_timeout",
    });
  });

  it("turns legacy unknown workflow text into a Chinese retry-safe message that still names the cause", () => {
    expect(presentResearchFailure("Unknown workflow error", "analysis")).toBe(
      "调研在“客户分析”阶段未能完成（原因：Unknown workflow error），系统已自动释放本次调研次数。请稍后重新发起。",
    );
  });

  it("uses the approved report module name when a durable step fails", () => {
    expect(presentResearchFailure("模型服务请求超时", "product_fit")).toContain("产品匹配");
    expect(presentResearchFailure("模型服务请求超时", "opportunities")).toContain("机会与痛点");
    expect(presentResearchFailure("模型服务请求超时", "talk_track")).toContain("沟通方案");
    expect(presentResearchFailure("模型服务请求超时", "next_step")).toContain("下一步");
    expect(presentResearchFailure("模型服务请求超时", "sales_verdict")).toContain("销售结论");
  });

  it("recognizes a serialized Zod stack even when the Error message field was lost", () => {
    const serialized = {
      name: "FatalError",
      errorStack: "ZodError: sources.7.title Too small: expected string to have >=1 characters",
    };

    expect(normalizeWorkflowError(serialized)).toMatchObject({
      code: "structured_output",
      message: expect.stringContaining("sources.7.title"),
    });
  });

  it("does not mistake a research-workflow stack path for a search failure", () => {
    const normalized = normalizeWorkflowError({
      errorStack: "ZodError: qualityAudit.rejectedFields Too big\nat /src/workflows/research-workflow.ts:139",
    });

    expect(normalized.code).toBe("structured_output");
    expect(presentResearchFailure(
      { errorStack: "ZodError: qualityAudit.rejectedFields Too big\nat /src/workflows/research-workflow.ts:139" },
      "repair",
    )).toContain("报告补全");
  });

  it("clearly explains when the target website could not be accessed", () => {
    const message = presentResearchFailure(
      new Error("目标官网当前无法访问或未返回可读取正文，搜索渠道也未找到可用公开页面。"),
      "collect",
    );

    expect(message).toContain("无法访问或读取目标官网");
    expect(message).toContain("网址填写错误");
    expect(message).toContain("尚未进入 AI 报告分析");
    expect(message).toContain("调研次数已自动退回");
  });

  it("classifies the buildUndeliverableReport phrasing as report_quality, not runtime", () => {
    expect(normalizeWorkflowError("本次调研尚未达到完整报告标准：模型阶段未完成：facts。")).toMatchObject({
      code: "report_quality",
    });
    expect(presentResearchFailure(
      "本次调研尚未达到完整报告标准：模型阶段未完成：facts。",
      "sales_verdict",
    )).toContain("未能形成完整报告");
  });

  it("exposes the real missing fields in the report_quality branch instead of hiding them", () => {
    const message = presentResearchFailure(
      "本次调研尚未达到完整报告标准：模型阶段未完成：facts。",
      "sales_verdict",
    );
    expect(message).toContain("销售结论");
    expect(message).toContain("未能形成完整报告");
    expect(message).toContain("模型阶段未完成：facts");
    expect(message).toContain("自动释放本次调研次数");
  });

  it("surfaces the real cause in the runtime fallback instead of a bare 未能完成", () => {
    const message = presentResearchFailure(
      "模型阶段未完成：facts",
      "sales_verdict",
    );
    expect(message).toContain("销售结论");
    expect(message).toContain("未能完成");
    expect(message).toContain("模型阶段未完成：facts");
    expect(message).toContain("自动释放本次调研次数");
  });

  it("does not append a cause fragment when no message could be recovered", () => {
    const message = presentResearchFailure({}, "sales_verdict");
    expect(message).not.toContain("（原因");
    expect(message).toContain("未能完成");
  });
});
