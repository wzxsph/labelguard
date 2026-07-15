import {
  createMockClusterAssistant,
  validateClusterAssistantResponse,
} from "../src/assistant.mjs";

function parseJsonContent(content) {
  const text = String(content ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const firstObject = text.indexOf("{");
  const lastObject = text.lastIndexOf("}");
  if (firstObject < 0 || lastObject <= firstObject) {
    const error = new Error("Remote model did not return a JSON object");
    error.code = "REMOTE_JSON_ERROR";
    throw error;
  }
  return JSON.parse(text.slice(firstObject, lastObject + 1));
}

function normalizeResponse(value, model) {
  if (!value || typeof value !== "object") throw new Error("Remote model returned no JSON object");
  return {
    mode: "remote",
    transport: "openai-compatible-chat-completions",
    model,
    summary: String(value.summary ?? ""),
    remediationDraft: String(value.remediationDraft ?? ""),
    recheckPlan: String(value.recheckPlan ?? ""),
    evidenceIds: Array.isArray(value.evidenceIds) ? value.evidenceIds.map(String) : [],
    specClauseIds: Array.isArray(value.specClauseIds) ? value.specClauseIds.map(String) : [],
    limitation: String(value.limitation ?? "仅整理结构化问题簇，不裁决标签真值。"),
  };
}

export async function callRemoteClusterAssistant(context, config) {
  const system = [
    "你是自动驾驶 Dataset Candidate 的标签质量问题簇助手。",
    "你只能根据传入的结构化 IssueCluster、evidence 与 spec clause 草拟摘要、返修范围和复检计划。",
    "不得声称看过图片，不得裁定标签真值，不得修改测量值、人工决定、快照或用途资格。",
    "只返回 JSON：summary、remediationDraft、recheckPlan、evidenceIds、specClauseIds、limitation。",
    "evidenceIds 与 specClauseIds 必须来自各自允许集合，且至少各引用一项。",
    "summary 不超过 100 个汉字；返修与复检必须是可验证动作。",
  ].join("\n");
  const user = JSON.stringify({
    cluster: context.cluster,
    allowedEvidenceIds: context.evidence.map((item) => item.id),
    allowedSpecClauseIds: context.specClauses.map((item) => item.id),
    evidence: context.evidence.map((item) => ({
      id: item.id,
      targetId: item.targetId,
      trackId: item.trackId,
      rule: item.rule,
      observed: item.observed,
      expected: item.expected,
      blocking: item.blocking,
    })),
    specClauses: context.specClauses,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let response;
  try {
    response = await fetch(config.baseUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer " + config.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.1,
        max_tokens: 2048,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const error = new Error("Remote model request failed with HTTP " + response.status);
    error.code = "REMOTE_HTTP_ERROR";
    throw error;
  }
  const payload = await response.json();
  const result = normalizeResponse(parseJsonContent(payload?.choices?.[0]?.message?.content), config.model);
  const validation = validateClusterAssistantResponse(result, context);
  if (!validation.valid) {
    const error = new Error("Remote model violated citation allowlists or response schema");
    error.code = "CLOSED_CITATION_VIOLATION";
    throw error;
  }
  return result;
}

export async function runClusterAssistant(context, config) {
  if (config.mode !== "remote") return createMockClusterAssistant(context);
  return callRemoteClusterAssistant(context, config);
}
