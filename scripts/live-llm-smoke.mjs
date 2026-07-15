import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateWorkOrder } from "../src/domain.mjs";
import { validateClusterAssistantResponse } from "../src/assistant.mjs";
import { callRemoteClusterAssistant } from "../server/ai.mjs";
import { getAiConfig, loadEnvironment } from "../server/env.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
loadEnvironment({ projectRoot });
const config = getAiConfig();

if (!config.remoteReady) {
  process.stderr.write("Live LLM smoke skipped: OPENAI_API_KEY / OPENAI_BASE_URL are not both configured.\n");
  process.exitCode = 2;
} else {
  const dataPath = path.join(projectRoot, "public", "demo", "labelguard-batch-v1.json");
  const payload = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const evaluation = evaluateWorkOrder(payload);
  const cluster = evaluation.issueClusters.find((item) => item.systemic && item.blocking);
  const evidenceSet = new Set(cluster.evidenceIds);
  const clauseSet = new Set(cluster.specClauseIds);
  const context = {
    cluster,
    evidence: evaluation.evidence.filter((item) => evidenceSet.has(item.id)),
    specClauses: evaluation.specClauses.filter((item) => clauseSet.has(item.id)),
  };
  const result = await callRemoteClusterAssistant(context, { ...config, mode: "remote" });
  const validation = validateClusterAssistantResponse(result, context);
  if (!validation.valid) throw new Error("Live LLM violated the closed citation contract");
  process.stdout.write([
    "Live LLM smoke: PASS",
    "Model: " + config.model,
    "Issue cluster: " + cluster.id,
    "Allowed evidence: " + context.evidence.length,
    "Cited evidence: " + result.evidenceIds.length,
    "Allowed spec clauses: " + context.specClauses.length,
    "Cited spec clauses: " + result.specClauseIds.length,
    "Schema: PASS",
  ].join("\n") + "\n");
}
