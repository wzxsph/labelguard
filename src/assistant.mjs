export function createMockAssistant(target) {
  const evidence = [...target.evidence].sort((a, b) => a.id.localeCompare(b.id));
  const ids = evidence.map((item) => item.id);
  const primary = evidence[0];

  if (!primary) {
    return {
      mode: "mock",
      transport: "deterministic",
      summary: "确定性规则未发现需要人工处理的风险。",
      reviewQuestion: "是否确认该目标可按当前标签版本自动放行？",
      nextSteps: ["保留固定比例随机抽检", "记录当前规则版本与批次版本"],
      evidenceIds: [],
      limitation: "Mock 不查看图像，也不代表专家结论。",
    };
  }

  const nextSteps = [];
  if (evidence.some((item) => item.category === "temporal")) {
    nextSteps.push("对照同一 track 的相邻帧速度与时间戳");
  }
  if (evidence.some((item) => item.category === "projection")) {
    nextSteps.push("核对 2D 框、3D 投影框与当前标定版本");
  }
  if (evidence.some((item) => item.category === "model_disagreement")) {
    nextSteps.push("将模型输出仅作为第二意见，不据此改写标签");
  }
  if (evidence.some((item) => item.category === "sensor_support")) {
    nextSteps.push("检查点云支持与遮挡/截断属性是否一致");
  }
  if (evidence.some((item) => item.category === "geometry")) {
    nextSteps.push("确认截断规范；若不允许越界则路由返修");
  }

  return {
    mode: "mock",
    transport: "deterministic",
    summary: "该目标命中 " + evidence.length + " 条风险证据，优先复核“" + primary.title + "”。",
    reviewQuestion: "结合多传感器关联，当前标签应通过、驳回还是返修？",
    nextSteps: nextSteps.slice(0, 3),
    evidenceIds: ids,
    limitation: "仅整理结构化证据；不看图、不裁决标签真值。",
  };
}

export function validateAssistantResponse(response, target) {
  const allowed = new Set(target.evidence.map((item) => item.id));
  const cited = Array.isArray(response?.evidenceIds) ? response.evidenceIds : [];
  const invalid = cited.filter((id) => !allowed.has(id));
  const schemaErrors = [];
  if (!["mock", "remote"].includes(response?.mode)) schemaErrors.push("mode");
  if (typeof response?.transport !== "string" || !response.transport.trim()) schemaErrors.push("transport");
  if (typeof response?.summary !== "string" || !response.summary.trim()) schemaErrors.push("summary");
  if (typeof response?.reviewQuestion !== "string" || !response.reviewQuestion.trim()) {
    schemaErrors.push("reviewQuestion");
  }
  if (
    !Array.isArray(response?.nextSteps) ||
    response.nextSteps.length > 3 ||
    response.nextSteps.some((item) => typeof item !== "string" || !item.trim())
  ) {
    schemaErrors.push("nextSteps");
  }
  if (
    !Array.isArray(response?.evidenceIds) ||
    new Set(cited).size !== cited.length ||
    (target.evidence.length > 0 && cited.length === 0)
  ) {
    schemaErrors.push("evidenceIds");
  }
  if (typeof response?.limitation !== "string" || !response.limitation.trim()) {
    schemaErrors.push("limitation");
  }
  return {
    valid: invalid.length === 0 && schemaErrors.length === 0,
    invalidEvidenceIds: invalid,
    schemaErrors,
  };
}
