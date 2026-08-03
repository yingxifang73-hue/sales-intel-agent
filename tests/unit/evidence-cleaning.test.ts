import { describe, expect, it } from "vitest";
import { cleanSourceText, isUserFacingChineseText, sanitizeChineseOutput, selectEvidenceExcerpts } from "@/lib/evidence";
import type { Source } from "@/lib/types";

describe("evidence cleaning", () => {
  it("removes image captions and media boilerplate while preserving factual prose", () => {
    const cleaned = cleanSourceText([
      "首页 产品 服务 新闻动态",
      "（图1 公司总部）",
      "登录以发表评论",
      "公司成立于2015年，主营企业软件服务。特别声明：以上内容仅代表作者观点。",
      "相关搜索 热门推荐 查看更多",
    ].join("\n"));

    expect(cleaned).toContain("公司成立于2015年，主营企业软件服务。");
    expect(cleaned).not.toContain("图1");
    expect(cleaned).not.toContain("登录以发表评论");
    expect(cleaned).not.toContain("特别声明");
    expect(cleaned).not.toContain("相关搜索");
  });

  it("rejects crawler English sentences and normalizes malformed punctuation", () => {
    expect(isUserFacingChineseText("Click to expand the latest news menu")).toBe(false);
    expect(isUserFacingChineseText("公司介绍：主营企业软件服务。")).toBe(true);
    expect(sanitizeChineseOutput("公司介绍”。。")).toBe("公司介绍。");
  });
  it("separates homepage navigation from factual body content", () => {
    const raw = [
      "# Home",
      "Products Services News About Contact Login Register Search",
      "",
      "Example Motors develops electric vehicles, batteries and energy storage systems.",
      "",
      "In 2026 the company opened a new vehicle production line.",
    ].join("\n");
    const cleaned = cleanSourceText(raw);
    expect(cleaned).not.toContain("Login Register");
    expect(cleaned).toContain("Example Motors develops electric vehicles");

    const source: Source = {
      id: "source-test-1",
      url: "https://example.com",
      canonicalUrl: "https://example.com",
      title: "Example Motors",
      content: cleaned,
      sourceType: "official",
      fetchedAt: new Date().toISOString(),
      contentHash: "a".repeat(64),
    };
    const excerpt = selectEvidenceExcerpts(source, ["electric vehicles", "production"]);
    expect(excerpt).toContain("Example Motors develops electric vehicles");
    expect(excerpt).not.toContain("Login Register Search");
  });

  it("removes a long Chinese navigation prefix while preserving the factual company paragraph", () => {
    const navigation = [
      "温氏食品集团股份有限公司",
      "温氏京东旗舰店",
      "温氏天猫旗舰店",
      "温氏商城",
      "首页",
      "关于温氏",
      "了解温氏",
      "集团简介",
      "董事长简介",
      "集团大事记",
      "企业荣誉",
      "温氏党建",
      "集团新闻",
      "媒体报道",
      "品牌与产品",
      "投资者关系",
      "人才招聘",
      "联系我们",
    ].join(" ");
    const fact = "温氏食品集团股份有限公司（简称“温氏股份”），创立于1983年，现已发展成一家以畜禽养殖为主业、配套相关业务的跨地区现代农牧企业集团。";

    const cleaned = cleanSourceText(`${navigation} ${fact}`);

    expect(cleaned).toBe(fact);
    expect(cleaned).not.toContain("温氏京东旗舰店");
    expect(cleaned).not.toContain("董事长简介");
  });

  it("removes navigation inserted between two factual clauses without rewriting either clause", () => {
    const firstFact = "温氏食品集团股份有限公司创立于1983年，是一家现代农牧企业集团。";
    const navigation = "首页 关于温氏 集团简介 董事长简介 企业荣誉 集团新闻 媒体报道 品牌专区 产品中心 投资者关系 人才招聘 联系我们";
    const secondFact = "围绕“中国肉蛋奶食材领航者”定位，全力打造“温氏食材”品牌，涵盖鲜鸡、猪肉、蛋鸡、熟食和原奶等业务。";

    const cleaned = cleanSourceText(`${firstFact}；${navigation} ${secondFact}`);

    expect(cleaned).toContain(firstFact);
    expect(cleaned).toContain(secondFact);
    expect(cleaned).not.toContain("董事长简介");
    expect(cleaned).not.toContain("人才招聘");
  });

  it("removes repeated Chinese navigation labels split across separate lines", () => {
    const raw = [
      "产品信息**产品信息**",
      "了解我们**了解我们**",
      "加入我们**加入我们**",
      "新闻动态**新闻动态**",
      "",
      "米哈游成立于2011年，致力于为用户提供高品质游戏产品与内容。",
      "公司陆续推出《原神》《崩坏：星穹铁道》和《绝区零》等游戏。",
    ].join("\n\n");

    const cleaned = cleanSourceText(raw);

    expect(cleaned).not.toContain("产品信息");
    expect(cleaned).not.toContain("加入我们");
    expect(cleaned).not.toContain("新闻动态");
    expect(cleaned).toContain("米哈游成立于2011年");
    expect(cleaned).toContain("《原神》");
  });
});
