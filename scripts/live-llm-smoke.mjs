import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateBatch } from "../src/domain.mjs";
import { validateAssistantResponse } from "../src/assistant.mjs";
import { callRemoteAssistant } from "../server/ai.mjs";
import { getAiConfig, loadEnvironment } from "../server/env.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
loadEnvironment({ projectRoot });
const config = getAiConfig();

if (!config.remoteReady) {
  process.stderr.write("Live LLM smoke skipped: OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL are not all configured.\n");
  process.exitCode = 2;
} else {
  const dataPath = path.join(projectRoot, "public", "demo", "labelguard-batch-v1.json");
  const payload = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const evaluation = evaluateBatch(payload);
  const target = evaluation.targets.find((item) => item.reviewRequired);
  const result = await callRemoteAssistant(target, {
    ...config,
    mode: "remote",
  });
  const validation = validateAssistantResponse(result, target);
  if (!validation.valid) throw new Error("Live LLM cited evidence outside the target evidence set");
  process.stdout.write([
    "Live LLM smoke: PASS",
    "Model: " + config.model,
    "Target: " + target.id,
    "Allowed evidence: " + target.evidence.length,
    "Cited evidence: " + result.evidenceIds.length,
    "Schema: PASS",
  ].join("\n") + "\n");
}
