# LabelGuard

[**▶ 在线体验**](https://autoinsight-labelguard.pages.dev/) · [English](README.md)

面向特定用途的自动驾驶候选数据集标签质量资格门禁。

LabelGuard 是 SceneQL 数据供给工作流中的 `DATA_QA` 执行路由。它不宣称数据集在所有情况下都“正确”，而是回答一个范围更窄、可审计的问题：**这个不可变候选快照是否满足已声明的下游用途？**

## 工作流

1. 接收 SceneQL 下发的版本化 `data-supply-task/1.0`；
2. 预检 `label-qa-work-order/1.0`、预期用途、质量配置和快照摘要；
3. 对候选标签执行确定性检查，并把重复发现聚合为 `IssueCluster`；
4. 依据闭集规范条款 ID，复核真实目标、轨迹与证据；
5. 将确认问题路由至标注返修、专家仲裁、数据就绪修复或补充证据；
6. 返修后对新的不可变快照重新检查；
7. 签署限定用途的 `label-quality-manifest/1.0`，并向 SceneQL 返回 `data-supply-result/1.0`。

工单缺少必填字段时返回 `NEEDS_CLARIFICATION`。数据集摘要发生变化时返回 `SNAPSHOT_CHANGED`，旧的人工决定不能继续复用。

## 公开 Demo

公开样例使用 nuScenes v1.0-mini `scene-0061` 的三个相邻 `CAM_FRONT` 关键帧及九个目标观测，并严格区分四个数据层：

| 数据层 | 含义 |
| --- | --- |
| 真实媒体 | 下采样后的 nuScenes 相机画面 |
| 候选标注 | 接近生产结构的 `candidate2d`、`candidate3d` 和 `candidateProjection2d` 字段 |
| Demo 参考 | 可选的 nuScenes 官方标注，标记为 `demoOnly`，生产 schema 不依赖它 |
| 第二意见 | 确定性 Mock 预测；缺失或与候选不一致不会阻断当前质量配置 |

五个确定性 QA 扰动均显式标记为 `synthetic`。两个重复投影问题和两个重复尺寸问题分别形成系统性 IssueCluster；一个 Mock 类别分歧仅供参考。

Demo 的质量配置只对 `simulation_seed` 用途有效。一键复检回执同样显式标记为合成数据；生产部署必须校验真实的返修后快照。

## 本地运行

要求 Node.js 20.19+ 或 22.12+，以及用于校验样例生成脚本语法的 Python 3。

```bash
npm ci
npm run dev
```

打开 `http://127.0.0.1:4175`。

使用接近生产的服务端启动：

```bash
npm run build
npm run serve
```

打开 `http://127.0.0.1:4176`。

## 部署静态公开 Demo

线上体验有意采用纯前端、确定性的 Mock。不要提供环境文件，也不要开启远程 AI 模式：

```bash
npm ci
npm run check
```

将 `dist/` 作为 Cloudflare Pages 的输出目录发布。构建过程会自动复制仓库中的 `public/_headers` 和 `public/_redirects`。在静态托管环境里，无法访问的 `/api/*` 请求会以安全方式失败，界面明确显示 `Mock · deterministic`；公开包不需要也不会携带 API Key、MiniMax-M3 地址或服务端运行时。

## 验证

```bash
npm run check
```

测试覆盖工单预检、过期快照拒绝、系统性问题聚类、生产 schema 不依赖 Demo GT、模型输出缺失时不阻断、返修与复检状态、真实 SHA-256 清单、SceneQL 任务/回执契约、公开数据来源及生产构建。

## MiniMax-M3 模式

公开模式使用确定性 Mock。可选的远程模式只在服务端运行，并锁定 `MiniMax-M3`：

```bash
LABELGUARD_ENV_FILE=/path/to/authorized.env \
LABELGUARD_AI_MODE=remote \
npm run serve
```

授权环境需要定义 `OPENAI_API_KEY` 和 `OPENAI_BASE_URL`。凭据不会进入浏览器构建包或状态响应。

MiniMax-M3 只草拟 IssueCluster 摘要、返修范围与复检计划。响应必须引用输入中提供的 evidence ID 与规范条款 ID；JSON 无效、引用缺失或虚构 ID 时系统会拒绝结果。测量、阈值、路由、快照校验和资格决定始终由确定性代码负责。

安全的真实模型专项测试：

```bash
LABELGUARD_ENV_FILE=/path/to/authorized.env \
LABELGUARD_AI_MODE=remote \
npm run test:llm
```

测试只输出模型名称、IssueCluster ID、引用数量和 schema 结果。

## 跨产品契约

- 输入：`data-supply-task/1.0` / `TASK-LG-WZ-001`；
- 执行方规范：`label-qa-work-order/1.0`；
- 质量清单：`label-quality-manifest/1.0`；
- 回执：`data-supply-result/1.0`，其中 `provider=LabelGuard`。

标准构造器和校验器由 [`src/domain.mjs`](src/domain.mjs) 导出。统一 Demo 使用 `DEM-WZ-001@1.0`，并与 SceneQL 引用相同的三个 nuScenes `scene-0061` sample token。

## 数据与许可

nuScenes 派生资产仍受 CC BY-NC-SA 4.0 及 nuScenes Dataset Terms 的附加约束，详见 [`public/demo/LICENSE`](public/demo/LICENSE)。本仓库不授予商业数据集使用权。

合法取得 nuScenes v1.0-mini 后，可以重新生成派生样例：

```bash
python3 scripts/generate-nuscenes-demo.py \
  --dataset-root /path/to/nuscenes/dataset
```

## 项目结构

- `src/domain.mjs` — 工单预检、确定性 QA、问题聚类和资格契约
- `src/assistant.mjs` — 确定性聚类 Mock 与闭集引用校验
- `src/app.mjs` — 工单、问题复核和资格签署界面
- `server/` — 静态服务与可选 MiniMax-M3 接口
- `public/demo/` — nuScenes 派生公开样例、任务和许可说明
- `tests/` — 领域逻辑、AI 边界、数据来源和跨仓库契约测试

源代码采用 [MIT License](LICENSE)。
