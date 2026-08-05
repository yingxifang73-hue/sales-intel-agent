"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Preset } from "@/lib/types";

type IndustryOption = { label: string; preset: Preset; customIndustry?: string };

const INDUSTRIES: IndustryOption[] = [
  { label: "电商", preset: "ecommerce" },
  { label: "零售与连锁", preset: "ecommerce", customIndustry: "零售与连锁" },
  { label: "消费品 / 品牌", preset: "ecommerce", customIndustry: "消费品与品牌" },
  { label: "食品饮料", preset: "manufacturing", customIndustry: "食品饮料" },
  { label: "外贸", preset: "foreign_trade" },
  { label: "跨境电商", preset: "foreign_trade", customIndustry: "跨境电商" },
  { label: "物流与供应链", preset: "foreign_trade", customIndustry: "物流与供应链" },
  { label: "AI / 科技", preset: "ai" },
  { label: "软件 / SaaS", preset: "ai", customIndustry: "软件与 SaaS" },
  { label: "教育培训", preset: "general", customIndustry: "教育培训" },
  { label: "医疗健康", preset: "general", customIndustry: "医疗健康" },
  { label: "金融服务", preset: "general", customIndustry: "金融服务" },
  { label: "制造业", preset: "manufacturing" },
  { label: "工业设备", preset: "manufacturing", customIndustry: "工业设备" },
  { label: "汽车与零部件", preset: "manufacturing", customIndustry: "汽车与零部件" },
];

const EMPTY_LABEL = "请选择行业";

/** Find the first option matching both preset AND customIndustry (or lack thereof). */
function findOption(preset: Preset, customIndustry: string): IndustryOption | undefined {
  if (customIndustry) {
    return INDUSTRIES.find((o) => o.customIndustry === customIndustry && o.preset === preset);
  }
  // For shared-preset industries, match the exact option that has NO customIndustry.
  return INDUSTRIES.find((o) => o.preset === preset && !o.customIndustry);
}

export function IndustrySelector({
  preset,
  customIndustry,
  onPresetChange,
  onCustomIndustryChange,
}: {
  preset: Preset;
  customIndustry: string;
  onPresetChange: (preset: Preset) => void;
  onCustomIndustryChange: (industry: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(Boolean(customIndustry));
  const [chosenLabel, setChosenLabel] = useState(() => {
    // Derive initial label from preset + customIndustry on first mount.
    const option = findOption(preset, customIndustry);
    return customIndustry || option?.label || "";
  });
  const rootRef = useRef<HTMLDivElement>(null);

  // Display label: custom > explicitly chosen > derived from option > ""
  const selectedLabel = customIndustry || chosenLabel || "";

  // When the parent resets customIndustry (e.g. via 清空), exit custom mode.
  useEffect(() => {
    if (!customIndustry) {
      setCustomMode(false);
    }
  }, [customIndustry]);

  // When preset or customIndustry changes externally (e.g. history restore),
  // update the chosen label so it stays in sync.
  useEffect(() => {
    if (!customIndustry) {
      const option = findOption(preset, "");
      if (option) setChosenLabel(option.label);
    }
  }, [preset, customIndustry]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const options = useMemo(() => INDUSTRIES, []);
  const choose = (option: IndustryOption) => {
    onPresetChange(option.preset);
    onCustomIndustryChange(option.customIndustry ?? "");
    // Remember the exact label the user picked.
    setChosenLabel(option.customIndustry ? "" : option.label);
    setCustomMode(false);
    setOpen(false);
  };

  return (
    <div className="si-industry-selector" ref={rootRef}>
      <button className="si-industry-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className={selectedLabel ? "" : "si-industry-placeholder"}>{selectedLabel || EMPTY_LABEL}</span><i aria-hidden="true" />
      </button>
      {open && (
        <div className="si-industry-menu" role="listbox" aria-label="选择行业">
          <p>选择最接近的行业</p>
          <div className="si-industry-options">
            {options.map((option) => (
              <button type="button" role="option" aria-selected={selectedLabel === option.label} key={option.label} onClick={() => choose(option)}>{option.label}</button>
            ))}
          </div>
          <div className="si-industry-custom">
            <button type="button" onClick={() => setCustomMode(true)}>自定义行业</button>
            {customMode && (
              <input
                autoFocus
                value={customIndustry}
                onChange={(event) => onCustomIndustryChange(event.target.value)}
                placeholder="例如：宠物食品、半导体"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
