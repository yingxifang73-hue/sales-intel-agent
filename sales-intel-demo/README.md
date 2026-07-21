# 售前销售情报作战卡 Demo

输入目标公司网址、行业和你的产品信息，生成带公开来源的售前作战卡：60 秒概览、信号、待验证痛点、产品切入、五个发现型问题和开场白。

## 启动

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:3000`。未填写密钥时，系统自动使用清晰标注的演示数据，方便立即给体验用户试用。

## 接入实时情报

复制 `.env.example` 为 `.env.local`，填写 `FIRECRAWL_API_KEY`。生产环境还应填写 `OPENAI_API_KEY` 和 `SESSION_SECRET`；当前 Demo 的销售推理为可追溯的规则生成，后续可把 OpenAI 接入为受引用校验约束的推理层。

## 已实现的安全边界

- 仅允许公开 HTTP(S) 目标，拒绝 localhost、私网和保留地址。
- 规范化链接并按链接、正文哈希去重。
- 每项结论保留来源编号；“痛点”明确标为待验证假设。
- API Key 不会传到浏览器端。

## 验证

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```
