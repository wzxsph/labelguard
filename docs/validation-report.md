# LabelGuard v1.0 验证报告

验证日期：2026-07-15

## 自动化、依赖与构建

执行：

```bash
npm run check
npm audit --audit-level=high
```

结果：

- JavaScript syntax check：PASS；
- Node test：11 / 11 PASS；
- Vite production build：PASS；
- npm audit：0 vulnerabilities；
- 公开 Demo：3 frames、8 targets；
- 确定性规则结果：5 个需复核、3 个自动通过、7 条风险证据；
- 决策闭环覆盖通过、驳回、返修与 READY/BLOCKED 放行状态；
- fixture 的 SHA-256 内容摘要与 MIT / CC0-1.0 许可文件校验：PASS；
- 构建产物中的本机路径、已知项目路径与疑似长格式 API key 扫描：未发现；
- 源码 CSS 最小显式字号：12px。

## 服务端与异常契约

在 production build 上启动：

```bash
npm run serve
```

实际检查：

- `GET /`：HTTP 200；
- `GET /demo/labelguard-batch-v1.json`：HTTP 200；
- `GET /api/status`：返回 `mode=mock`、`requestedMode=mock`、`remoteReady=false`，不返回 URL 或凭据；
- `POST /api/assistant` 缺失 evidence：HTTP 422 / `INVALID_TARGET_EVIDENCE`；
- 请求 remote 但缺少服务端配置：状态端点明确显示 `requestedMode=remote`、`remoteReady=false`，助手端点返回 HTTP 503 / `REMOTE_ASSISTANT_NOT_CONFIGURED`；
- HTML、JSON 与静态资源响应包含 CSP、`nosniff`、`no-referrer`、Permissions Policy 与同源 opener 策略。

## 真实模型专项

使用本地 `.env.local` 时的命令：

```bash
npm run test:llm
```

已有授权环境的专项记录：

- Live LLM smoke：PASS；
- Model：Minimax-M3；
- Target：TG-P07-185；
- Allowed evidence：1；
- Cited evidence：1；
- JSON schema 与 evidence allowlist：PASS；
- 未保存模型原始响应或凭据。

远程模型专项不会随默认构建自动执行；公开默认验收仍以确定性 Mock 为准。

## PC 视口

已在真实浏览器中完成固定 PC 视口验收：

- `1440×900`：无水平溢出，所有可见文本最小字号为 `12px`；
- `1920×1080`：无水平溢出，所有可见文本最小字号为 `12px`；
- 从风险队列进入目标复核，逐一完成 5 / 5 个人工裁决；
- 目标画面、2D 标签、3D 投影、模型候选、track 时间线与 evidence ID 保持同屏关联；
- 放行页生成确定性 `BLOCKED` manifest，包含 2 个通过、3 个返修、0 个未决目标和 hash `lg-024f4e64`；
- 实际产品截图见 [`docs/assets/labelguard-1440x900.png`](assets/labelguard-1440x900.png)。

页面级纵向内容在 1440×900 下使用正常滚动，不通过缩小字体压缩信息。

## 已知限制

- 公开批次与 SVG 帧为 CC0 合成 fixture，不是道路实采 GT；
- 模型候选是预置的第二意见数据，不代表真实模型性能；
- 当前人工决策保存在浏览器本地，没有企业身份、多人仲裁或外部标注系统写回；
- 规则阈值只用于 Demo，企业部署必须按客户 Schema、传感器和 QA 规范校准；
- manifest hash 是演示用稳定散列，生产系统应使用签名 SHA-256 artifact；
- 远程模型失败后，浏览器会明确告警并使用带 `Mock` 标识的确定性结果，该结果不能被计为远程模型成功。
