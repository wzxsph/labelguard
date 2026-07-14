import {
  createMockAssistant,
  validateAssistantResponse,
} from "../src/assistant.mjs";

function parseJsonContent(content) {
  const text = String(content ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  const fence = String.fromCharCode(96).repeat(3);
  if (text.startsWith(fence) && text.endsWith(fence)) {
    const firstBreak = text.indexOf("\n");
    return JSON.parse(text.slice(firstBreak + 1, -fence.length).trim());
  }
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
    reviewQuestion: String(value.reviewQuestion ?? ""),
    nextSteps: Array.isArray(value.nextSteps) ? value.nextSteps.map(String).slice(0, 3) : [],
    evidenceIds: Array.isArray(value.evidenceIds) ? value.evidenceIds.map(String) : [],
    limitation: String(value.limitation ?? "仅整理结构化证据，不裁决标签真值。"),
  };
}

export async function callRemoteAssistant(target, config) {
  const allowedIds = target.evidence.map((item) => item.id);
  const system = [
    "你是自动驾驶标注 QA 证据助手。",
    "你只能整理传入的结构化证据，不得声称看过图片，不得判断标签真值，不得生成新的测量值。",
    "只返回 JSON 对象，字段必须为 summary、reviewQuestion、nextSteps、evidenceIds、limitation。",
    "evidenceIds 只能引用允许集合中的 ID。",
    "summary 不超过 100 个汉字；nextSteps 最多 3 项，每项必须是可验证动作。",
  ].join("\n");
  const user = JSON.stringify({
    target: {
      id: target.id,
      trackId: target.trackId,
      frameId: target.frameId,
      class: target.class,
    },
    allowedEvidenceIds: allowedIds,
    evidence: target.evidence.map((item) => ({
      id: item.id,
      severity: item.severity,
      category: item.category,
      title: item.title,
      observed: item.observed,
      expected: item.expected,
      factType: item.factType,
    })),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let response;
  try {
    response = await fetch(config.baseUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer " + config.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0,
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
  const content = payload?.choices?.[0]?.message?.content;
  const result = normalizeResponse(parseJsonContent(content), config.model);
  const validation = validateAssistantResponse(result, target);
  if (!validation.valid) {
    const error = new Error("Remote model cited evidence outside the allowed set");
    error.code = "EVIDENCE_CITATION_VIOLATION";
    throw error;
  }
  if (!result.summary || !result.reviewQuestion) {
    const error = new Error("Remote model omitted required response fields");
    error.code = "REMOTE_SCHEMA_ERROR";
    throw error;
  }
  return result;
}

export async function runAssistant(target, config) {
  if (config.mode !== "remote") return createMockAssistant(target);
  return callRemoteAssistant(target, config);
}
