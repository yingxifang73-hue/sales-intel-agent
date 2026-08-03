import { describe, expect, it } from "vitest";
import { extractVerifiedContactsFromSources, normalizeContactIntelligence } from "@/lib/contact-intelligence";
import type { Source } from "@/lib/types";

const source: Source = {
  id: "source-contact-001",
  url: "https://example.com/contact",
  canonicalUrl: "https://example.com/contact",
  title: "联系我们",
  content: "商务合作邮箱 sales@example.com，联系电话 021-12345678。注册地址：上海市浦东新区示例路1号。市场总监李明负责品牌合作。",
  sourceType: "official",
  fetchedAt: "2026-07-28T00:00:00.000Z",
  contentHash: "a".repeat(64),
};

describe("normalizeContactIntelligence", () => {
  it("does not accept a prose sentence as a company address", () => {
    const result = normalizeContactIntelligence({
      channels: [{
        kind: "address",
        label: "公司地址",
        value: "ing and resolving any issues you may encounter",
        status: "verified",
        sourceIds: ["S1"],
      }],
    }, [{ ...source, id: "S1", content: "公司地址：上海市浦东新区世纪大道100号" }], "https://example.com");

    expect(result.channels.some((channel) => channel.kind === "address")).toBe(false);
  });
  it("只保留在引用来源中真实出现的联系方式", () => {
    const result = normalizeContactIntelligence({
      channels: [
        { kind: "email", label: "商务邮箱", value: "sales@example.com", status: "verified", sourceIds: ["S1"] },
        { kind: "phone", label: "联系电话", value: "021-12345678", status: "verified", sourceIds: ["S1"] },
        { kind: "email", label: "虚构邮箱", value: "fake@example.com", status: "verified", sourceIds: ["S1"] },
        { kind: "address", label: "注册地址", value: "上海市浦东新区示例路1号", status: "verified", sourceIds: ["S1"] },
      ],
      publicContacts: [
        { name: "李明", role: "市场总监", status: "verified", sourceIds: ["S1"] },
        { name: "张伟", role: "采购总监", status: "verified", sourceIds: ["S1"] },
      ],
    }, [source], "https://example.com");

    expect(result.channels.map((item) => item.value)).toContain("sales@example.com");
    expect(result.channels.map((item) => item.value)).toContain("021-12345678");
    expect(result.channels.map((item) => item.value)).not.toContain("fake@example.com");
    expect(result.publicContacts.map((item) => item.name)).toEqual(["李明"]);
  });

  it("从真实官方来源补充官网和联系页面，但不猜测其他渠道", () => {
    const result = normalizeContactIntelligence({}, [source], "https://example.com");
    expect(result.channels.map((item) => item.kind)).toEqual(["website", "contact_page"]);
    expect(result.channels.some((item) => item.kind === "online_channel")).toBe(false);
  });

  it("无需模型猜测，也能从公开正文提取经来源验证的电话、邮箱和地址", () => {
    const result = extractVerifiedContactsFromSources([source], "https://example.com");

    expect(result.channels).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "email", value: "sales@example.com", sourceIds: [source.id] }),
      expect.objectContaining({ kind: "phone", value: "021-12345678", sourceIds: [source.id] }),
      expect.objectContaining({ kind: "address", value: "上海市浦东新区示例路1号", sourceIds: [source.id] }),
    ]));
  });
});

describe("labelled addresses", () => {
  it("extracts a labelled English office address from an official page", () => {
    const englishSource: Source = { ...source, content: "Contact: +1 212 555 0100\nAddress: 100 Main Street, New York, NY 10001" };
    const result = extractVerifiedContactsFromSources([englishSource], "https://example.com");
    expect(result.channels).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "address", value: "100 Main Street, New York, NY 10001" }),
    ]));
  });

  it("rejects numeric identifiers, truncated emails and address text contaminated by fax or urls", () => {
    const noisySource: Source = {
      ...source,
      content: [
        "备案编号 019202000117，业务流水号 017650975465350217。",
        "被截断邮箱 _business@iflytek.com、_Market@iflytek.com。",
        "商务合作邮箱 msp_business@iflytek.com，市场邮箱 Cloud_Market@iflytek.com。",
        "联系电话：0551-65331801。",
        "公司地址：安徽省合肥市高新区望江西路666号 传真：0551-65331802 官网：https://www.xfyun.cn",
      ].join("\n"),
    };

    const result = extractVerifiedContactsFromSources([noisySource], "https://example.com");
    const values = result.channels.map((item) => item.value);

    expect(values).not.toContain("019202000117");
    expect(values).not.toContain("017650975465350217");
    expect(values).not.toContain("_business@iflytek.com");
    expect(values).not.toContain("_Market@iflytek.com");
    expect(values).toContain("msp_business@iflytek.com");
    expect(values).toContain("Cloud_Market@iflytek.com");
    expect(values).toContain("0551-65331801");
    expect(values).toContain("安徽省合肥市高新区望江西路666号");
    expect(result.channels
      .filter((item) => item.kind === "address")
      .some((item) => item.value.includes("传真") || item.value.includes("https://"))).toBe(false);
  });
});
