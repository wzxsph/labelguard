import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createMockClusterAssistant,
  validateClusterAssistantResponse,
} from "../src/assistant.mjs";
import { evaluateWorkOrder } from "../src/domain.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
const payload = JSON.parse(fs.readFileSync(path.join(projectRoot, "public", "demo", "labelguard-batch-v1.json"), "utf8"));
const evaluation = evaluateWorkOrder(payload);
const cluster = evaluation.issueClusters.find((item) => item.systemic && item.blocking);
const evidenceSet = new Set(cluster.evidenceIds);
const clauseSet = new Set(cluster.specClauseIds);
const context = {
  cluster,
  evidence: evaluation.evidence.filter((item) => evidenceSet.has(item.id)),
  specClauses: evaluation.specClauses.filter((item) => clauseSet.has(item.id)),
};

test("cluster Mock is deterministic and cites closed evidence plus spec clauses", () => {
  const first = createMockClusterAssistant(context);
  const second = createMockClusterAssistant(context);
  assert.deepEqual(first, second);
  assert.equal(first.mode, "mock");
  assert.equal(validateClusterAssistantResponse(first, context).valid, true);
});

test("assistant rejects invented evidence and spec-clause citations", () => {
  const invalid = {
    ...createMockClusterAssistant(context),
    evidenceIds: ["EV-INVENTED-001"],
    specClauseIds: ["SPEC-INVENTED-001"],
  };
  const validation = validateClusterAssistantResponse(invalid, context);
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.invalidEvidenceIds, ["EV-INVENTED-001"]);
  assert.deepEqual(validation.invalidSpecClauseIds, ["SPEC-INVENTED-001"]);
});

test("assistant schema rejects missing fields and duplicate citations", () => {
  const evidenceId = context.evidence[0].id;
  const invalid = {
    ...createMockClusterAssistant(context),
    remediationDraft: "",
    evidenceIds: [evidenceId, evidenceId],
  };
  const validation = validateClusterAssistantResponse(invalid, context);
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.schemaErrors.sort(), ["evidenceIds", "remediationDraft"]);
});
