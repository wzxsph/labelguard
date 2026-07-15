# LabelGuard 产品方案

## 产品定位

LabelGuard 是自动驾驶数据供给链中的“用途资格门禁”，承接 SceneQL 已批准的 `DATA_QA` 路由。它服务的不是泛化的“看标签对不对”，而是一个可审计业务决策：某个不可变 Dataset Candidate 是否足以支持指定的训练、评测、回归或仿真种子用途。

它不替代标注平台，也不把视觉大模型当真值。标注系统负责生产和编辑；LabelGuard 负责把质量 Profile、证据、人工决定、返修复检和下游用途绑定起来。

## 业务背景与用户

数据部门面对的不是单一“找数据”任务。感知、OCC、PNC 和仿真团队会提出不同用途、不同信号要求和不同容错边界的供给需求。同一批标签可能足以做场景检索，却不足以做精确仿真重建；“质量合格”必须带用途和版本语境。

| 用户 | 核心任务 | 产品价值 |
| --- | --- | --- |
| QA Owner | 控制系统性质量风险与签署资格 | 从逐目标浏览升级为问题簇处置，保留责任链 |
| 数据生产经理 | 控制返修范围、SLA 和供应商成本 | 同一根因合并派单，避免重复返工 |
| 标注供应商 / 数据工程师 | 接收明确返修范围 | evidence、spec clause、target/track 与路由一一对应 |
| PNC / 感知数据消费者 | 判断资产能否用于当前任务 | 得到用途限定、快照限定的机器可读回执 |

## 主流程

```text
SceneQL approved DATA_QA task
  → Work-order preflight
  → Deterministic candidate-label checks
  → Systematic IssueCluster aggregation
  → Target / track evidence review
  → Human decision and remediation routing
  → New-snapshot recheck
  → Use-specific LabelQualityManifest
  → SceneQL DataSupplyResult callback
```

### 1. Work-order preflight

输入必须声明：Demand、task ID、Dataset Candidate、snapshot digest、candidate label version、annotation/sensor schema、Quality Profile、target scope、用途、角色、SLA 和许可。

- 字段不全或 Profile 不支持该用途：`NEEDS_CLARIFICATION`；
- 工单 digest 与实际候选快照不同：`SNAPSHOT_CHANGED`；
- 只有 preflight `READY` 才运行 QA；
- 任何人工决定都绑定 source snapshot digest，禁止跨快照复用。

### 2. Deterministic checks

生产对象使用 `candidate2d`、`candidate3d`、`candidateProjection2d` 和 `candidateVelocityMps`。系统可检查几何边界、类别尺寸、候选 3D 投影与候选 2D 关联、传感器支持和 track 连续性。

阈值属于版本化 Quality Profile，不宣称行业通用。模型 prediction 缺失默认不构成质量问题；模型分歧仅在 Profile 明确要求时才可能阻断。

### 3. IssueCluster

LabelGuard 不把每条规则告警直接变成一张工单，而是按规则签名、track、数据层和规范条款聚类。例如：

- 同一 track 多帧出现投影偏差 → `DATA_READINESS_REPAIR`；
- 同一施工车辆多帧出现相同尺寸异常 → `ANNOTATION_REWORK`；
- 单点 Mock 类别分歧 → `NEEDS_MORE_EVIDENCE`，默认不阻断。

问题簇减少重复审阅和重复派单，也更接近生产中的系统性根因治理。

### 4. 人工决定、返修与复检

QA Owner 对阻断问题簇选择：确认问题、不构成问题、证据不足。确认问题后按类型路由：

- `ANNOTATION_REWORK`；
- `EXPERT_ARBITRATION`；
- `DATA_READINESS_REPAIR`；
- `NEEDS_MORE_EVIDENCE`。

返修完成必须产生新的 SHA-256 snapshot digest，并在新快照上重跑原规则。未变化的快照不能记录为有效复检。

### 5. 用途资格与回执

`LabelQualityManifest` 包含原始与复检快照、候选版本、用途、Quality Profile、问题簇、人工决定、返修复检、限制、签署角色和 SHA-256。

所有强制问题簇完成有效处置后先进入 `AWAITING_SIGNOFF`；只有 QA Owner 对复检快照、intended use 和完整 review bundle SHA-256 做显式签署，才返回 `QUALIFIED`。决定或返修记录发生变化会使旧签署失效。`qualifiedForUses` 只包含工单声明的用途。SceneQL 收到 `data-supply-result/1.0` 后再决定是否把该资产交给 ScenarioForge 或其他下游，不把 DatasetAsset 与 SimulationScenarioAsset 混为一谈。

## AI 的作用与边界

MiniMax-M3 在问题簇层完成三件事：

1. 将同簇结构化 evidence 压缩成短摘要；
2. 把 evidence 映射到允许的 spec clause；
3. 草拟一次返修范围和复检计划。

每次输出必须引用闭集 evidence ID 与 spec-clause ID。模型不能生成测量值、改阈值、判断标签真值、批准人工决定、修改快照或签署用途资格。服务端固定 `MiniMax-M3`、`temperature=0.1`、`max_tokens=2048`；输出 JSON 不合法或引用越界即失败。

AI 的必要性来自跨目标、跨规则、跨规范的文本归纳与派单草拟，而不是替代确定性几何计算。公开演示默认使用确定性 Mock，保证复现。

## Demo 数据边界

公开 Demo 选用 nuScenes v1.0-mini `scene-0061` 三个相邻 `CAM_FRONT` keyframe、三个真实 instance 和九个 target observation。

- 真实媒体：nuScenes 派生 JPEG；
- 候选标签：生产式候选字段；
- Demo reference：官方 annotation，标记 `demoOnly`，生产 schema 不依赖；
- Synthetic QA perturbation：五个显式受控扰动；
- Mock second opinion：确定性合成，不代表模型性能；
- Demo recheck：显式合成回执，不代表真实 nuScenes 已返修。

这套数据只证明流程、证据关联和契约，不证明生产阈值、抽样策略或模型鲁棒性。

## 指标与落地

北极星指标：每个最终可用 Dataset Asset 的质量资格成本。

配套指标：

- 同根因告警聚类压缩率；
- 每千 target 的人工复核时长；
- 系统性问题在交付前拦截数；
- 返修一次通过率与复检周期；
- stale decision 拦截率；
- 用途资格错误放行率；
- MiniMax-M3 schema/citation 通过率与人工采纳率。

企业落地还需连接标注平台、对象存储、身份审批、不可变审计日志和客户 Quality Profile。公开 nuScenes 资产不可直接用于商业试点，需替换为客户已授权数据。
