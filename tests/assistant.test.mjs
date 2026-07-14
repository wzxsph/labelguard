import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createMockAssistant, validateAssistantResponse } from "../src/assistant.mjs";
import { evaluateBatch } from "../src/domain.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
const payload = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "public", "demo", "labelguard-batch-v1.json"), "utf8"),
);
const evaluation = evaluateBatch(payload);

test("mock assistant is deterministic and cites only target evidence", () => {
  const target = evaluation.targets.find((item) => item.id === "TG-C03-185");
  const first = createMockAssistant(target);
  const second = createMockAssistant(target);

  assert.deepEqual(first, second);
  assert.equal(first.mode, "mock");
  assert.equal(validateAssistantResponse(first, target).valid, true);
});

test("assistant evidence allowlist rejects invented citations", () => {
  const target = evaluation.targets.find((item) => item.reviewRequired);
  const invalid = {
    ...createMockAssistant(target),
    evidenceIds: ["EV-INVENTED-001"],
  };
  const validation = validateAssistantResponse(invalid, target);

  assert.equal(validation.valid, false);
  assert.deepEqual(validation.invalidEvidenceIds, ["EV-INVENTED-001"]);
});

test("assistant schema rejects incomplete or duplicate structured output", () => {
  const target = evaluation.targets.find((item) => item.reviewRequired);
  const evidenceId = target.evidence[0].id;
  const invalid = {
    ...createMockAssistant(target),
    reviewQuestion: "",
    evidenceIds: [evidenceId, evidenceId],
  };
  const validation = validateAssistantResponse(invalid, target);

  assert.equal(validation.valid, false);
  assert.deepEqual(validation.schemaErrors.sort(), ["evidenceIds", "reviewQuestion"]);
});
