import { describe, expect, it } from "vitest";
import { assessEvidenceReadiness, assessSource, selectReportSources } from "@/lib/source-quality";
import type { ResearchInput, Source } from "@/lib/types";

function source(overrides: Partial<Source>): Source {
  return {
    id: "source-1",
    url: "https://example.com/article",
    canonicalUrl: "https://example.com/article",
    title: "目标公司公开报道",
    content: "目标公司的公开业务信息，内容足够作为调研来源。".repeat(8),
    sourceType: "news",
    fetchedAt: "2026-07-27T00:00:00.000Z",
    contentHash: "a".repeat(64),
    ...overrides,
  };
}

describe("source quality tiers", () => {
  it("requires usable company identity and product evidence before model analysis", () => {
    const official = source({
      id: "official-home",
      url: "https://www.doubao.com/",
      canonicalUrl: "https://www.doubao.com/",
      title: "豆包－字节跳动旗下 AI 智能助手",
      content: "豆包是字节跳动旗下的 AI 智能助手，可提供智能对话、问答、写作、翻译和编程辅助，并支持个人与企业用户完成多种工作任务。",
      sourceType: "official",
    });
    const tutorial = source({
      id: "tutorial",
      url: "https://example.com/doubao-tutorial",
      canonicalUrl: "https://example.com/doubao-tutorial",
      title: "第三方教程",
      content: "这是一篇没有目标公司身份信息的第三方教程。".repeat(20),
      sourceType: "other",
    });

    expect(assessEvidenceReadiness([official], "https://www.doubao.com").ready).toBe(true);
    expect(assessEvidenceReadiness([tutorial], "https://www.doubao.com").ready).toBe(false);
  });

  it("rejects commerce and coupon pages even when they mention the target company", () => {
    const assessment = assessSource(source({
      title: "领139-58优惠券，认养一头牛纯牛奶礼盒装",
      content: "认养一头牛纯牛奶拍3件折后更优惠 http://t.cn/example",
    }), "https://www.ryytn.com");

    expect(assessment.eligible).toBe(false);
    expect(assessment.reason).toBe("commercial_promotion");
  });

  it("rejects an unrelated third-party page even when it is long enough", () => {
    const assessment = assessSource(source({
      url: "https://example.com/deals",
      canonicalUrl: "https://example.com/deals",
      title: "与目标企业无关的行业分析",
      content: "这是一个与目标企业无关的泛行业分析页面，内容没有目标公司的业务事实。".repeat(30),
      sourceType: "other",
    }), "https://www.anker.com", {
      customIndustry: "出海电商",
      preset: "ecommerce",
      sellerProfile: {
        productName: "跨境电商管理软件",
        valueProposition: "",
        targetCustomer: "",
        customerProblems: [],
        proofPoints: [],
        callToAction: "安排沟通",
      },
    });

    expect(assessment.eligible).toBe(false);
    expect(assessment.reason).toBe("low_relevance");
  });

  it("ranks an exchange disclosure above a general news repost", () => {
    const disclosure = assessSource(source({
      url: "https://static.sse.com.cn/stock/disclosure/example.pdf",
      canonicalUrl: "https://static.sse.com.cn/stock/disclosure/example.pdf",
      sourceType: "other",
    }), "https://www.ryytn.com");
    const repost = assessSource(source({
      url: "https://www.163.com/news/example.html",
      canonicalUrl: "https://www.163.com/news/example.html",
    }), "https://www.ryytn.com");

    expect(disclosure.eligible).toBe(true);
    expect(disclosure.score).toBeGreaterThan(repost.score);
  });

  it("rejects short search-result snippets as report evidence", () => {
    const assessment = assessSource(source({
      title: "SHOPLINE招聘",
      url: "https://www.zhipin.com/gongsi/shopline.html",
      canonicalUrl: "https://www.zhipin.com/gongsi/shopline.html",
      content: "BOSS直聘提供SHOPLINE招聘、公司简介、公司地址和产品介绍等信息。",
      sourceType: "other",
    }), "https://www.shopline.com");

    expect(assessment.eligible).toBe(false);
    expect(assessment.reason).toBe("content_too_small");
  });

  it("places first-party core pages before jobs and help-center pages", () => {
    const target = "https://www.shopline.com";
    const sources = [
      source({
        id: "job-source",
        title: "SHOPLINE Careers - Join us today!",
        url: "https://www.shopline.com/careers",
        canonicalUrl: "https://www.shopline.com/careers",
        content: "Join SHOPLINE. We are hiring across engineering, sales and customer success teams around the world. ".repeat(8),
        sourceType: "official",
      }),
      source({
        id: "help-source",
        title: "创建联系我们页面",
        url: "https://help.shopline.com/hc/zh-cn/articles/contact-page",
        canonicalUrl: "https://help.shopline.com/hc/zh-cn/articles/contact-page",
        content: "本文介绍商家如何创建联系我们页面、配置字段和接收顾客留言。".repeat(20),
        sourceType: "other",
      }),
      source({
        id: "about-source",
        title: "About SHOPLINE",
        url: "https://www.shopline.com/about",
        canonicalUrl: "https://www.shopline.com/about",
        content: "SHOPLINE is a global commerce platform serving merchants with online stores, payments, marketing, logistics and point-of-sale capabilities. ".repeat(8),
        sourceType: "official",
      }),
      source({
        id: "product-source",
        title: "SHOPLINE Commerce Solutions",
        url: "https://www.shopline.com/products",
        canonicalUrl: "https://www.shopline.com/products",
        content: "SHOPLINE provides online store, social commerce, point-of-sale, payments, marketing automation and merchant management products. ".repeat(8),
        sourceType: "official",
      }),
    ];

    const selected = selectReportSources(sources, target);

    expect(selected.slice(0, 2).map((item) => item.id)).toEqual(["about-source", "product-source"]);
    expect(selected.findIndex((item) => item.id === "job-source")).toBeGreaterThan(1);
    expect(selected.findIndex((item) => item.id === "help-source")).toBeGreaterThan(1);
  });

  it("uses the seller product to rank directly relevant technical sources ahead of unrelated official products", () => {
    const target = "https://www.xfyun.cn";
    const input: ResearchInput = {
      targetUrl: target,
      preset: "ai",
      customIndustry: "人工智能开放平台",
      sellerProfile: {
        productName: "会议录音批量转写 Token 计费统计 SDK",
        valueProposition: "",
        targetCustomer: "",
        customerProblems: [],
        proofPoints: [],
        callToAction: "安排一次初步沟通，验证客户需求与产品匹配度。",
      },
    };
    const sources = [
      source({
        id: "ocr-source",
        url: "https://www.xfyun.cn/services/ocr",
        canonicalUrl: "https://www.xfyun.cn/services/ocr",
        title: "通用文字识别 OCR 服务",
        content: "科大讯飞开放平台提供通用文字识别 OCR 接口、图片文字识别和证件识别 SDK。".repeat(12),
        sourceType: "official",
      }),
      source({
        id: "speech-source",
        url: "https://www.xfyun.cn/services/lfasr",
        canonicalUrl: "https://www.xfyun.cn/services/lfasr",
        title: "录音文件转写 API 与用量计费",
        content: "录音文件转写服务支持会议录音批量转写、SDK 接入、调用量统计、Token 计费和账单查询。".repeat(12),
        sourceType: "official",
      }),
      source({
        id: "about-source",
        url: "https://www.xfyun.cn/about",
        canonicalUrl: "https://www.xfyun.cn/about",
        title: "关于讯飞开放平台",
        content: "讯飞开放平台面向开发者和企业提供人工智能能力、开放接口与技术服务。".repeat(12),
        sourceType: "official",
      }),
    ];

    const selected = selectReportSources(sources, target, 20, input);

    expect(selected[0]?.id).toBe("about-source");
    expect(selected.findIndex((item) => item.id === "speech-source"))
      .toBeLessThan(selected.findIndex((item) => item.id === "ocr-source"));
  });
});
