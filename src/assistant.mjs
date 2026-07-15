export function createMockClusterAssistant(context) {
  const cluster = context.cluster;
  const evidence = [...context.evidence].sort((a, b) => a.id.localeCompare(b.id));
  const clauses = [...context.specClauses].sort((a, b) => a.id.localeCompare(b.id));
  const systemic = cluster.systemic ? `同一问题在 ${cluster.targetIds.length} 个 target 上重复出现` : "当前为单点信号";
  const routeText = {
    ANNOTATION_REWORK: "按同一规范条款合并为一个标注返修任务",
    DATA_READINESS_REPAIR: "检查标定、投影与数据转换链路后产出新快照",
    EXPERT_ARBITRATION: "提交高级 QA 进行跨帧关联仲裁",
    NEEDS_MORE_EVIDENCE: "补充传感器或上下文证据，不直接改写标签",
  }[cluster.recommendedRoute] ?? "由 QA Owner 选择后续路由";
  return {
    mode: "mock",
    transport: "deterministic",
    model: null,
    summary: `${cluster.title}；${systemic}。`,
    remediationDraft: routeText,
    recheckPlan: "在新 snapshot digest 上重跑相同规则，并逐项核对原 evidence ID。",
    evidenceIds: evidence.map((item) => item.id),
    specClauseIds: clauses.map((item) => item.id),
    limitation: "Mock 只整理结构化 IssueCluster；不查看图像、不裁定标签真值、不签署用途资格。",
  };
}

export function validateClusterAssistantResponse(response, context) {
  const allowedEvidence = new Set(context.evidence.map((item) => item.id));
  const allowedClauses = new Set(context.specClauses.map((item) => item.id));
  const evidenceIds = Array.isArray(response?.evidenceIds) ? response.evidenceIds : [];
  const specClauseIds = Array.isArray(response?.specClauseIds) ? response.specClauseIds : [];
  const invalidEvidenceIds = evidenceIds.filter((id) => !allowedEvidence.has(id));
  const invalidSpecClauseIds = specClauseIds.filter((id) => !allowedClauses.has(id));
  const schemaErrors = [];
  if (!["mock", "remote"].includes(response?.mode)) schemaErrors.push("mode");
  if (typeof response?.transport !== "string" || !response.transport.trim()) schemaErrors.push("transport");
  for (const field of ["summary", "remediationDraft", "recheckPlan", "limitation"]) {
    if (typeof response?.[field] !== "string" || !response[field].trim()) schemaErrors.push(field);
  }
  if (
    !Array.isArray(response?.evidenceIds) ||
    new Set(evidenceIds).size !== evidenceIds.length ||
    (context.evidence.length > 0 && evidenceIds.length === 0)
  ) schemaErrors.push("evidenceIds");
  if (
    !Array.isArray(response?.specClauseIds) ||
    new Set(specClauseIds).size !== specClauseIds.length ||
    (context.specClauses.length > 0 && specClauseIds.length === 0)
  ) schemaErrors.push("specClauseIds");
  return {
    valid: invalidEvidenceIds.length === 0 && invalidSpecClauseIds.length === 0 && schemaErrors.length === 0,
    invalidEvidenceIds,
    invalidSpecClauseIds,
    schemaErrors,
  };
}
