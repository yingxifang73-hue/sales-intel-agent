import { describe, expect, it } from "vitest";
import { extractDeterministicSourceFacts, mergeSourceFactBundles } from "@/lib/source-facts";
import type { Source } from "@/lib/types";

function source(id: string, content: string, overrides: Partial<Source> = {}): Source {
  return {
    id,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title: "示例公司｜关于我们",
    content,
    sourceType: "official",
    fetchedAt: "2026-07-28T00:00:00.000Z",
    contentHash: id.padEnd(64, "a").slice(0, 64),
    ...overrides,
  };
}

describe("source fact extraction", () => {
  it("keeps company and product facts tied to the page that supplied them", () => {
    const item = source(
      "source-01",
      "示例公司是一家为电商品牌提供仓储与订单履约服务的企业，业务覆盖华东与华南市场。\n\n公司提供仓储管理、订单协同和跨境配送服务，帮助品牌提高履约效率。\n\n公司在上海设有产品研发与运营中心。",
    );
    const bundle = extractDeterministicSourceFacts(item);

    expect(bundle.companyOverview?.value).toContain("示例公司");
    expect(bundle.companyOverview?.sourceIds).toEqual([item.id]);
    expect(bundle.productsAndServices[0]?.value).toContain("服务");
    expect(bundle.productsAndServices[0]?.sourceIds).toEqual([item.id]);
  });

  it("ignores navigation and short marketing slogans when正文 facts exist", () => {
    const item = source(
      "source-02",
      [
        "Home Products Services News About Contact Login Register Search",
        "Accelerated Growth.",
        "All-in-one subscription, built for growth",
        "SHOPLINE 是面向全球商家的统一商业平台，为品牌提供独立站、支付、营销自动化、客户管理和线下零售工具。",
        "平台服务需要同时经营线上商店、社交渠道与实体门店的品牌和零售商。",
      ].join("\n\n"),
      {
        title: "SHOPLINE 商业平台",
        url: "https://example.com/",
        canonicalUrl: "https://example.com/",
      },
    );

    const bundle = extractDeterministicSourceFacts(item);

    expect(bundle.companyOverview?.value).toContain("统一商业平台");
    expect(bundle.companyOverview?.value).not.toContain("Login Register");
    expect(bundle.recentUpdates.map((item) => item.value).join(" ")).not.toContain("Accelerated Growth");
  });

  it("prefers substantive official facts over recruitment and search-summary bundles", () => {
    const job = source(
      "job-source",
      "BOSS直聘提供SHOPLINE招聘、公司简介、公司地址、产品介绍和职位信息。",
      {
        title: "SHOPLINE招聘",
        url: "https://www.zhipin.com/gongsi/shopline.html",
        canonicalUrl: "https://www.zhipin.com/gongsi/shopline.html",
        sourceType: "other",
      },
    );
    const official = source(
      "official-source",
      "SHOPLINE 是面向全球商家的统一商业平台，提供独立站、支付、营销自动化、客户管理与线下零售解决方案。",
      {
        title: "About SHOPLINE",
        url: "https://www.shopline.com/about",
        canonicalUrl: "https://www.shopline.com/about",
      },
    );

    const merged = mergeSourceFactBundles(
      [extractDeterministicSourceFacts(job), extractDeterministicSourceFacts(official)],
      [job, official],
    );

    expect(merged.customerIntelligence.companyOverview.value).toContain("统一商业平台");
    expect(merged.customerIntelligence.companyOverview.value).not.toContain("BOSS直聘");
  });

  it("merges successful bundles without dropping distinct products and signals", () => {
    const firstSource = source("source-03", "示例公司为电商商家提供仓储管理服务。\n\n公司推出订单协同平台，帮助客户提升履约效率。");
    const secondSource = source("source-04", "2026年7月，示例公司宣布扩建华东仓储网络并提升跨境配送服务能力。", {
      title: "华东仓储网络扩建公告",
      url: "https://example.com/news/warehouse-expansion",
      canonicalUrl: "https://example.com/news/warehouse-expansion",
      sourceType: "news",
      publishedAt: "2026-07-01T00:00:00.000Z",
    });
    const merged = mergeSourceFactBundles(
      [extractDeterministicSourceFacts(firstSource), extractDeterministicSourceFacts(secondSource)],
      [firstSource, secondSource],
    );

    expect(merged.customerIntelligence.companyOverview.status).toBe("verified");
    expect(merged.customerIntelligence.productsAndServices.length).toBeGreaterThanOrEqual(2);
    expect(merged.signals.some((item) => item.value.includes("扩建"))).toBe(true);
  });

  it("does not expose untranslated English article text as Chinese report facts", () => {
    const englishArticle = source(
      "english-source",
      "Asia Global Variety Plus Icon Click to expand the Mega Plus Icon. Character AI introduces a suite of microseries focused on anime, horror and action adventure. The company said its user-generated characters are fictional and intended for entertainment purposes.",
      {
        title: "Character AI latest news",
        url: "https://example.com/news/character-ai",
        canonicalUrl: "https://example.com/news/character-ai",
        sourceType: "news",
      },
    );

    const merged = mergeSourceFactBundles(
      [extractDeterministicSourceFacts(englishArticle)],
      [englishArticle],
    );

    expect(merged.customerIntelligence.productsAndServices).toEqual([]);
    expect(merged.customerIntelligence.recentUpdates).toEqual([]);
    expect(merged.customerIntelligence.companyOverview.status).toBe("insufficient");
  });

  it("does not use an unrelated official product page as the company overview", () => {
    const ocr = source(
      "ocr-source",
      "通用文字识别 OCR 系统支持图片文字识别、证件识别和表格识别，可通过接口与 SDK 接入。",
      {
        title: "通用文字识别 OCR 服务",
        url: "https://www.xfyun.cn/services/ocr",
        canonicalUrl: "https://www.xfyun.cn/services/ocr",
      },
    );
    const about = source(
      "about-source",
      "讯飞开放平台是科大讯飞面向开发者和企业提供人工智能开放能力、开发工具与技术服务的平台。",
      {
        title: "关于讯飞开放平台",
        url: "https://www.xfyun.cn/about",
        canonicalUrl: "https://www.xfyun.cn/about",
      },
    );

    const merged = mergeSourceFactBundles(
      [extractDeterministicSourceFacts(ocr), extractDeterministicSourceFacts(about)],
      [ocr, about],
    );

    expect(merged.customerIntelligence.companyOverview.value).toContain("人工智能开放能力");
    expect(merged.customerIntelligence.companyOverview.value).not.toContain("通用文字识别 OCR");
  });

  it("only treats dated news or announcement evidence as a recent update", () => {
    const staticPage = source(
      "static-source",
      "平台成立于2010年，目前提供五百余项人工智能能力，并持续服务开发者与企业客户。",
      {
        title: "平台介绍",
        url: "https://www.xfyun.cn",
        canonicalUrl: "https://www.xfyun.cn",
      },
    );
    const newsPage = source(
      "news-source",
      "2026年7月20日，讯飞开放平台发布会议转写接口升级公告，新增批量任务状态查询能力。",
      {
        title: "会议转写接口升级公告",
        url: "https://www.xfyun.cn/news/meeting-transcription-update",
        canonicalUrl: "https://www.xfyun.cn/news/meeting-transcription-update",
        sourceType: "news",
        publishedAt: "2026-07-20T00:00:00.000Z",
      },
    );

    const merged = mergeSourceFactBundles(
      [extractDeterministicSourceFacts(staticPage), extractDeterministicSourceFacts(newsPage)],
      [staticPage, newsPage],
    );

    expect(merged.customerIntelligence.recentUpdates).toHaveLength(1);
    expect(merged.customerIntelligence.recentUpdates[0]?.value).toContain("2026年7月20日");
  });

  it("does not let third-party tutorials populate target-company profile fields", () => {
    const tutorial = source(
      "tutorial-source",
      "本教程面向企业客户介绍订阅收费、市场定位、团队规模和产品能力，并演示如何调用豆包相关接口完成内容生成。",
      {
        title: "如何调用豆包接口的第三方教程",
        url: "https://example.com/tutorial/doubao-api",
        canonicalUrl: "https://example.com/tutorial/doubao-api",
        sourceType: "other",
      },
    );
    const bundle = extractDeterministicSourceFacts(tutorial);
    const merged = mergeSourceFactBundles([bundle], [tutorial]);

    expect(merged.customerIntelligence.targetCustomersAndMarket.status).toBe("insufficient");
    expect(merged.customerIntelligence.businessModel.status).toBe("insufficient");
    expect(merged.customerIntelligence.productPositioning.status).toBe("insufficient");
    expect(merged.customerIntelligence.scaleAndCapability.status).toBe("insufficient");
  });

  it("never treats contact, compliance or reporting pages as company products", () => {
    const contact = source(
      "contact-source",
      [
        "联系我们",
        "互联网违法不良信息举报邮箱：tousu@example.com，举报电话：021-60371750。",
        "未成年成长关爱热线：021-60371740，服务时间为8:00-23:00。",
        "增值电信业务经营许可证：沪B2-20190555。",
      ].join("\n\n"),
      {
        title: "示例公司｜联系我们",
        url: "https://example.com/company/contact",
        canonicalUrl: "https://example.com/company/contact",
      },
    );
    const report = source(
      "report-source",
      "公司要求员工合法合规开展业务，举报入口仅受理内部员工违纪举报。",
      {
        title: "示例公司｜廉正举报",
        url: "https://example.com/company/jubao",
        canonicalUrl: "https://example.com/company/jubao",
      },
    );
    const pollutedModelBundle = {
      sourceId: contact.id,
      companyOverview: {
        value: "互联网违法不良信息举报邮箱和举报电话。",
        status: "verified" as const,
        sourceIds: [contact.id],
      },
      productsAndServices: [{
        value: "未成年成长关爱热线与增值电信业务经营许可证。",
        status: "verified" as const,
        sourceIds: [contact.id],
      }],
      targetCustomersAndMarket: undefined,
      businessModel: undefined,
      productPositioning: undefined,
      scaleAndCapability: undefined,
      recentUpdates: [],
      signals: [],
    };

    const merged = mergeSourceFactBundles(
      [pollutedModelBundle, extractDeterministicSourceFacts(report)],
      [contact, report],
    );

    expect(merged.customerIntelligence.productsAndServices).toEqual([]);
    expect(merged.customerIntelligence.companyOverview.status).toBe("insufficient");
  });

  it("uses relevant third-party news for customer-profile facts while still rejecting tutorials", () => {
    const article = source(
      "news-profile-source",
      "2026年7月，示例游戏公司披露其产品采用游戏内付费与内容销售模式，并在全球多个市场运营。公司研发团队持续投入多语种内容与海外发行能力。",
      {
        title: "示例游戏公司全球发行与商业模式",
        url: "https://news.example.com/2026/example-game-company",
        canonicalUrl: "https://news.example.com/2026/example-game-company",
        sourceType: "news",
        publishedAt: "2026-07-20T00:00:00.000Z",
      },
    );

    const merged = mergeSourceFactBundles(
      [extractDeterministicSourceFacts(article)],
      [article],
    );

    expect(merged.customerIntelligence.businessModel.value).toContain("付费");
    expect(merged.customerIntelligence.scaleAndCapability.value).toContain("全球");
  });

  it("does not mistake fictional game-world cities for company scale", () => {
    const homepage = source(
      "game-home-source",
      "示例游戏公司成立于2011年，持续推出原创游戏产品。\n\n在这个灾害频仍的世界里，崛起了一座名为新艾利都的城市。",
      {
        title: "示例游戏公司官网",
        url: "https://example.com/",
        canonicalUrl: "https://example.com/",
      },
    );

    const merged = mergeSourceFactBundles(
      [extractDeterministicSourceFacts(homepage)],
      [homepage],
    );

    expect(merged.customerIntelligence.scaleAndCapability.status).toBe("insufficient");
  });
});
