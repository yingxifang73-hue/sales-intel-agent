import type { Preset } from "@/lib/types";

export type PresetDefinition = {
  label: string;
  researchFocus: string[];
  suggestedQuestions: string[];
};

export const PRESETS: Record<Preset, PresetDefinition> = {
  general: {
    label: "通用企业",
    researchFocus: ["公司定位", "近期动态", "业务挑战", "决策线索"],
    suggestedQuestions: ["今年最优先的增长目标是什么？", "这个目标当前最大的阻碍是什么？"],
  },
  ecommerce: {
    label: "电商",
    researchFocus: ["渠道布局", "商品与促销", "履约体验", "增长投放"],
    suggestedQuestions: ["哪个渠道的增长和利润最需要兼顾？", "促销或履约环节目前最影响复购的是什么？"],
  },
  foreign_trade: {
    label: "外贸",
    researchFocus: ["出口市场", "获客渠道", "认证与合规", "供应链交付"],
    suggestedQuestions: ["当前最希望打开的海外市场是哪一个？", "从询盘到成交最容易流失在哪一步？"],
  },
  ai: {
    label: "AI",
    researchFocus: ["产品场景", "技术路线", "商业化", "数据与交付"],
    suggestedQuestions: ["目前最需要验证的商业化场景是什么？", "客户从试用到付费的关键门槛是什么？"],
  },
  manufacturing: {
    label: "制造业",
    researchFocus: ["产品与产能", "质量与认证", "客户行业", "数字化升级"],
    suggestedQuestions: ["当前最影响交付效率或良率的环节是什么？", "哪些客户需求变化正在倒逼流程调整？"],
  },
};

export function getPreset(preset: Preset): PresetDefinition {
  return PRESETS[preset];
}
