import { describe, expect, it } from "vitest";
import { segmentPreservingText } from "@/lib/presentation-segments";

describe("segmentPreservingText", () => {
  it("长文本按原有标点分段且重新拼接后逐字等于原文", () => {
    const text = "第一项内容很长，包含必要说明。第二项内容继续；第三项给出更多细节，仍然不能修改。第四项结束。";
    const segments = segmentPreservingText(text, 18);

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.join("")).toBe(text);
  });

  it("超长单句只在原有逗号位置分段并保留全部标点", () => {
    const text = "官方分期服务包含多种车型，多种首付方案，多种期限选择，多种年费率方案，详细内容以公开页面为准";
    const segments = segmentPreservingText(text, 20);

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.join("")).toBe(text);
    expect(segments.join("").match(/，/g)).toHaveLength(4);
  });

  it("短文本保持单段且不增加字符", () => {
    expect(segmentPreservingText("短文本", 12)).toEqual(["短文本"]);
  });

  it("不会把小数、版本号和产品型号中的句点误判为句子边界", () => {
    const text = "公司营业收入为1038.62亿元，产品版本为V2.5，并提供X9.1系列解决方案。后续内容继续完整展示。";
    const segments = segmentPreservingText(text, 20);

    expect(segments.join("")).toBe(text);
    expect(segments).not.toContain("公司营业收入为1038.");
    expect(segments.some((segment) => segment.startsWith("62亿元"))).toBe(false);
    expect(segments.some((segment) => segment.endsWith("V2."))).toBe(false);
  });
});
