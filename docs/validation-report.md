# LabelGuard v2.0 验证报告

验证日期：2026-07-15

## 自动化与构建

执行：

```bash
npm run check
npm audit --audit-level=high
git diff --check
```

结果：

- JavaScript syntax 与 fixture generator Python syntax：PASS；
- Node test：11 / 11 PASS；
- Vite production build：PASS；
- npm audit：0 vulnerabilities；
- git diff whitespace check：PASS；
- 内部文件跟踪检查：`AGENTS.md`、`prd/`、`internal/` 与 `.env*` 未被 Git 跟踪；
- 公开源码、文档与构建产物的本机路径/疑似凭据扫描：未发现；
- CSS 显式 `font-size` 共 66 处，最小 12px，无低于 12px 声明；正文和交互控件默认 14px，元数据 12px。

## 领域与跨仓契约

自动测试实际覆盖：

- `data-supply-task/1.0` / `TASK-LG-WZ-001` 与 SceneQL shared contract；
- `label-qa-work-order/1.0` preflight；
- 缺字段 → `NEEDS_CLARIFICATION`；
- digest 变化 → `SNAPSHOT_CHANGED` 且禁止复用决定；
- 实际候选内容被篡改但声明 digest 未更新 → `DATASET_CONTENT_DIGEST_INVALID`；
- 外层 task 与 providerSpec 的 task、Demand、snapshot 不一致时 fail closed；
- 3 frames / 9 targets / 5 findings / 3 IssueClusters；
- 2 个 systematic blocking clusters 与 1 个 informational Mock cluster；
- 生产候选 schema 不依赖 `demoReferenceAnnotation`；
- 缺少 model candidate 不产生默认风险；
- `priorityScore` 替换未校准的 `riskScore`；
- 确认问题 → remediation → 新 SHA-256 snapshot recheck → `AWAITING_SIGNOFF` → QA Owner 显式签署 → `QUALIFIED`；
- 未变化或非 SHA-256 的复检快照被拒绝；
- `label-quality-manifest/1.0` 只签署 `simulation_seed`；
- QA Owner 签署绑定 review bundle SHA-256；决定内容变化后旧签署变为 `STALE_OR_INVALID`；
- `data-supply-result/1.0` 返回同 task ID、`provider=LabelGuard` 与闭集用途；
- manifest / receipt 均使用 canonical JSON SHA-256。
- 使用本地完整 nuScenes mini 从原始 metadata 与 JPEG 重新运行生成器：3 张派生 JPEG SHA-256 均一致，生成 JSON 与仓库 fixture 逐字节一致。

当前 canonical dataset snapshot：

```text
sha256:06ac8a2853582d2852dec3084eb01ad243af9af54d9dd52dc06dd8cbd006cb53
```

该摘要只覆盖 Dataset Candidate，不包含下游 work-order 元数据；工单和 SceneQL input asset 都引用同一摘要。

## MiniMax-M3 专项

执行：

```bash
LABELGUARD_ENV_FILE=/path/to/authorized.env \
LABELGUARD_AI_MODE=remote \
npm run test:llm
```

实际结果：

- Live LLM smoke：PASS；
- Model：`MiniMax-M3`；
- IssueCluster：`IC-CLASS-DIMENSIONS-NS-CV-e3c5b72c`；
- allowed evidence：2，cited evidence：2；
- allowed spec clauses：1，cited spec clauses：1；
- closed citation / JSON schema：PASS。

另以 remote mode 启动独立 production server，实际 `POST /api/assistant`：HTTP 200，`mode=remote`、`model=MiniMax-M3`、2 条 evidence 引用、1 条 spec-clause 引用、schema valid。该端到端检查未输出或保存模型原始文本与凭据。

服务端固定 `temperature=0.1` 与 `max_tokens=2048`。该结果只证明文本问题簇 transport、schema 与引用约束通过，不证明视觉鲁棒性，也不构成标签真值或用途资格结论。

## 服务端与异常契约

在 production build 上启动 `npm run serve` 后实际检查：

- `GET /`：HTTP 200 / `text/html`；
- `GET /demo/labelguard-batch-v1.json`：HTTP 200 / `application/json`；
- `GET /api/status`：公开 Mock、无 URL 或凭据；
- 缺失 IssueCluster context：HTTP 422 / `INVALID_ISSUE_CLUSTER_CONTEXT`；
- HTML 包含 CSP、`nosniff`、`no-referrer`、Permissions Policy 与同源 opener 策略。

## PC 视口

`1440×900` 与 `1920×1080` 应用内浏览器真实验收：**PASS**。

实际结果：

1. `1440×900`：页面固定为完整 PC 画布，`scrollWidth=1440`，无横向溢出；内容较长时仅 `.workspace` 内部滚动；
2. `1920×1080`：`scrollWidth=1920`，无横向溢出，资格页无需内部纵向滚动；
3. QA 工单 preflight 为 `READY`，scope 为 3 frames / 9 targets；
4. 问题簇页可区分真实媒体、候选 2D、候选 3D 投影、Demo-only reference 与 Mock second opinion；
5. 两个 systematic blocking clusters 均完成“人工确认 → 对应返修路由 → 新快照复检”；
6. 两次复检完成后状态保持 `AWAITING_SIGNOFF`，没有自动授予资格；
7. 点击 `QA Owner 签署` 后才变为 `QUALIFIED`，SceneQL 回执为 `ACCEPTED`，且只包含 `simulation_seed`；
8. 资格回执中的 manifest 与 receipt 均为 SHA-256，Source snapshot 与 Reviewed snapshot 分开显示。

## 已知限制

- nuScenes 派生资产受非商业许可与附加 Dataset Terms 约束；
- 五个 QA perturbation 和一键 recheck 都是显式合成数据，不代表真实 nuScenes 标注错误或返修；
- 当前公开批次只有 9 个 targets，采用 exhaustive review，不能外推生产抽检策略；
- 当前阈值是 Demo Quality Profile，不是行业常数；
- 人工决定保存在浏览器本地，没有企业身份、多人仲裁和不可变审计存储；
- MiniMax-M3 只处理结构化 IssueCluster 文本，不查看图像、不改测量、不做真值裁决；

## Cloudflare Pages 线上验收

生产体验地址：<https://autoinsight-labelguard.pages.dev/>

实际发布命令：

```bash
npm run check
npx wrangler pages deploy dist --project-name=autoinsight-labelguard --branch=main
```

实际结果：

- Cloudflare 上传 11 个静态文件并发布生产别名；
- 入口页与 `/demo/labelguard-batch-v1.json` 均返回 HTTP 200；
- SceneQL 正式站传入的 `TASK-LG-WZ-001` 被正确解析，work-order preflight 为 `READY`；
- 问题簇复核页的 nuScenes 图片加载完成，浏览器报告 `1280×720`、`complete=true`；
- 1440×900 与 1920×1080 均无横向溢出，交互控件最小计算字号为 14px；
- 页面明确显示 `Mock · deterministic`，静态包不包含 MiniMax-M3 凭据或服务端 endpoint。
