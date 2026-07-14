# LabelGuard 产品方案

## 定位

LabelGuard 是自动标注、人工标注平台与标签版本发布之间的质量控制层。它不再造标注编辑器，也不承诺用通用视觉大模型替代多传感器专家，而是回答三个可审计问题：

1. 哪些 target/track 最可能存在质量风险；
2. 谁需要复核什么具体证据；
3. 当前标签候选版本是否满足放行条件。

## 用户与价值

| 角色 | 当前任务 | 产品价值 |
| --- | --- | --- |
| 标注 QA | 浏览大量目标并寻找错误 | 风险排序到 target/track，直接进入关联证据 |
| 感知算法工程师 | 区分标签问题与模型问题 | 同屏比较标签、3D 投影、模型候选与时序 |
| 数据生产经理 | 控制质量、成本和交付 | 放行门禁、返修路由与版本化决策清单 |

北极星指标是每千个最终合格 target 的生产与质检成本，同时监控错误逃逸率和标签返工率。

## 闭环

    Batch registration
      → deterministic QA checks
      → target/track risk evidence
      → human association review
      → pass / reject / repair
      → release candidate / expert review / annotation rework
      → version release manifest

每条风险证据绑定 batch、label version、frame、target、track、rule version 与 evidence ID。人工决策必须引用当前目标证据并保留理由。

## AI 设计

AI 只处理结构化证据：

- 把多条证据整理成一个明确复核问题；
- 给出受约束的检查顺序；
- 解释为什么目标被路由到某个队列；
- 只引用当前 target 的 evidence ID。

确定性程序负责坐标范围、尺寸、投影 IoU、点支持、跨帧速度连续性、路由和版本放行。模型 prediction 仅表示分歧，不能证明标签正确或错误。

公开体验默认使用确定性 Mock。可选远程模型只在服务端运行；若远程模式缺少配置或调用失败，服务端接口明确返回失败。浏览器会提示失败并切换为带有 `Mock` 标识的本地确定性结果，该结果不计为远程模型验收通过。

## Demo 边界

公开批次为 CC0-1.0 合成 fixture，用于证明产品契约和交互闭环，不用于评价真实自动驾驶模型、标注供应商或道路安全。接入企业数据时需要替换：

- 客户 OpenLABEL/内部标签 Schema；
- 标定、投影和传感器解析器；
- 标注平台连接器；
- 人员技能、抽检与质量阈值；
- 企业身份、审批和不可变 artifact 存储。

## 商业切入

首个试点建议部署在“自动标注完成 → 人工 QA”之间，以一个类别、一个传感器 Profile 和一个标注供应商为范围。用四周数据比较：

- 每千 target 的人工质检时间；
- 高级 QA 被低风险任务占用比例；
- 抽检错误率及置信上界；
- 返工率和版本发布周期；
- 系统性错误在发布前被拦截的数量。
