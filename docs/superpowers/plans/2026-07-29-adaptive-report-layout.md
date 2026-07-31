# 报告卡片自适应与长文本无损分段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让联系方式卡片按真实内容收缩，并让超长产品文本在不改变任何原文字符的前提下按标点分段展示。

**Architecture:** 卡片高度问题只在现有 CSS 网格层修复。文本分段作为纯函数放入独立文件，由轻量展示组件调用；函数返回的片段直接拼接后必须严格等于输入，报告数据和 Schema 不发生变化。

**Tech Stack:** Next.js 16、React 19、TypeScript、CSS、Vitest、Testing Library。

## Global Constraints

- 只修改展示层，不改变采集、分析、报告 Schema 或已生成报告内容。
- 标点和原文字符不得删除、替换、重排或重新生成。
- 视觉项目符号由 CSS 生成，不写入报告原文。
- 保持当前 Notion 风格与移动端单列布局。
- 当前工作树包含既有未提交修改；只编辑本计划明确列出的文件，不提交无关内容。

---

### Task 1: 无损长文本分段

**Files:**
- Create: `sales-intel-demo/src/lib/presentation-segments.ts`
- Create: `sales-intel-demo/src/components/PreservedStructuredText.tsx`
- Create: `sales-intel-demo/tests/unit/presentation-segments.test.ts`
- Modify: `sales-intel-demo/src/components/TabBusinessProducts.tsx`
- Modify: `sales-intel-demo/src/app/globals.css`
- Test: `sales-intel-demo/tests/unit/presentation-segments.test.ts`
- Test: `sales-intel-demo/tests/unit/ui-redesign.test.tsx`

**Interfaces:**
- Produces: `segmentPreservingText(text: string, threshold?: number): string[]`
- Produces: `PreservedStructuredText({ text, threshold, className })`
- Guarantees: `segmentPreservingText(text).join("") === text`

- [ ] **Step 1: 写纯函数失败测试**

测试覆盖：

```ts
const longText = "第一项内容很长，包含说明。第二项内容继续；第三项结束。";
const segments = segmentPreservingText(longText, 12);
expect(segments.length).toBeGreaterThan(1);
expect(segments.join("")).toBe(longText);
expect(segmentPreservingText("短文本", 12)).toEqual(["短文本"]);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/unit/presentation-segments.test.ts --reporter=dot`

Expected: FAIL，因为 `presentation-segments` 尚不存在。

- [ ] **Step 3: 实现最小无损分段函数**

实现规则：

```ts
export function segmentPreservingText(text: string, threshold = 96): string[] {
  if (text.length <= threshold) return [text];
  // 先在 。；！？.!? 后切分并保留标点；
  // 超长单句再在 ，、, 后切分并保留标点；
  // 没有标点时只在原有空白边界切分并保留空白；
  // 所有片段按原顺序返回，禁止 trim、replace 或重写字符。
}
```

- [ ] **Step 4: 运行纯函数测试确认通过**

Run: `pnpm vitest run tests/unit/presentation-segments.test.ts --reporter=dot`

Expected: PASS，且拼接等于原文。

- [ ] **Step 5: 写 UI 失败测试**

在报告夹具中放入超过阈值的产品文本，验证：

```ts
expect(screen.getAllByTestId("preserved-text-segment").length).toBeGreaterThan(1);
expect(screen.getByTestId("preserved-structured-text").textContent).toBe(longText);
```

- [ ] **Step 6: 实现展示组件并接入产品与服务**

组件保持每个片段的真实文本，用 CSS `::before` 绘制项目点；短文本仍单行展示。`TabBusinessProducts` 不修改数据，只把 `item.value` 传给组件。

- [ ] **Step 7: 添加分段样式并运行 UI 测试**

Run: `pnpm vitest run tests/unit/presentation-segments.test.ts tests/unit/ui-redesign.test.tsx --reporter=dot`

Expected: PASS。

### Task 2: 联系卡片高度自适应

**Files:**
- Modify: `sales-intel-demo/src/app/globals.css`
- Test: `sales-intel-demo/tests/unit/ui-redesign.test.tsx`

**Interfaces:**
- Consumes: 现有 `.si-contact-reference-content.si-contact-reference-simple`
- Produces: 同行卡片顶部对齐、卡片按内容高度自然增长

- [ ] **Step 1: 写 CSS 结构回归测试**

读取 `globals.css` 并验证联系卡片网格包含 `align-items: start`，联系卡片规则不再包含 `min-height: 180px`。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/unit/ui-redesign.test.tsx --reporter=dot`

Expected: FAIL，因为当前网格会拉伸且卡片存在固定最小高度。

- [ ] **Step 3: 最小 CSS 修复**

```css
.si-contact-reference-content.si-contact-reference-simple {
  align-items: start;
}

.si-contact-reference-simple .si-contact-reference-card {
  min-height: 0;
}
```

- [ ] **Step 4: 运行 UI 回归测试**

Run: `pnpm vitest run tests/unit/ui-redesign.test.tsx --reporter=dot`

Expected: PASS。

### Task 3: 完整验证与部署

**Files:**
- Verify only: `sales-intel-demo`

**Interfaces:**
- Produces: 可部署的生产构建和更新后的正式网址

- [ ] **Step 1: 运行完整验证**

Run:

```powershell
pnpm typecheck
pnpm test -- --reporter=dot
pnpm build
```

Expected: 三条命令退出码均为 0。

- [ ] **Step 2: 部署生产环境**

Run: `npx --yes vercel@latest --prod --yes`

Expected: 部署状态为 `READY`，正式别名仍为 `https://sales-intel-agent-red.vercel.app`。

- [ ] **Step 3: 只读检查线上资源**

读取正式站点静态脚本，确认包含无损分段组件和自适应样式；不创建真实调研任务、不消耗兑换码。
