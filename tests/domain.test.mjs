import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createDataSupplyTask,
  computeDatasetCandidateDigest,
  createLabelQualityManifest,
  createQualificationSignOff,
  createRecheckRecord,
  createRemediationTask,
  createReviewDecision,
  createSceneQLReceipt,
  evaluateWorkOrder,
  preflightDataSupplyTask,
  preflightWorkOrder,
  stableHash,
} from "../src/domain.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
const fixturePath = path.join(projectRoot, "public", "demo", "labelguard-batch-v1.json");
const payload = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

function resolveAllBlockingClusters(evaluation) {
  const decisions = {};
  const remediations = {};
  const rechecks = {};
  for (const cluster of evaluation.issueClusters.filter((item) => item.blocking)) {
    const decision = createReviewDecision(
      cluster,
      "confirmed_issue",
      "同簇目标重复违反当前质量规范，需要合并返修并复检",
      evaluation,
    );
    const remediation = createRemediationTask(cluster, decision, evaluation);
    const recheck = createRecheckRecord(
      remediation,
      payload.demoRecheck.snapshotDigest,
      "passed",
      { demoSyntheticRecheck: true },
    );
    decisions[cluster.id] = decision;
    remediations[cluster.id] = remediation;
    rechecks[cluster.id] = recheck;
  }
  return { decisions, remediations, rechecks };
}

test("work order preflight and systematic issue clustering are deterministic", () => {
  const first = evaluateWorkOrder(payload);
  const second = evaluateWorkOrder(payload);

  assert.equal(first.preflight.status, "READY");
  assert.deepEqual(first, second);
  assert.deepEqual(first.summary, {
    frameCount: 3,
    targetCount: 9,
    reviewCount: 5,
    autoPassCount: 4,
    evidenceCount: 5,
    clusterCount: 3,
    blockingClusterCount: 2,
    systematicClusterCount: 2,
  });
  assert.equal(first.issueClusters.filter((item) => item.systemic).every((item) => item.targetIds.length === 2), true);
  assert.equal(first.issueClusters.find((item) => item.rule === "MODEL_CLASS_AGREEMENT").blocking, false);
});

test("missing work-order fields need clarification and snapshot changes invalidate reuse", () => {
  const missing = structuredClone(payload.labelQAWorkOrder);
  delete missing.intendedUse;
  assert.equal(preflightWorkOrder(missing, payload).status, "NEEDS_CLARIFICATION");
  assert.deepEqual(preflightWorkOrder(missing, payload).missingFields, ["intendedUse"]);

  const stale = structuredClone(payload.labelQAWorkOrder);
  stale.snapshotDigest = "sha256:" + "0".repeat(64);
  const staleResult = preflightWorkOrder(stale, payload);
  assert.equal(staleResult.status, "SNAPSHOT_CHANGED");
  assert.equal(staleResult.reusableDecisions, false);

  const tamperedPayload = structuredClone(payload);
  tamperedPayload.frames[0].targets[0].candidate2d.x += 1;
  const tamperedResult = preflightWorkOrder(tamperedPayload.labelQAWorkOrder, tamperedPayload);
  assert.equal(tamperedResult.status, "SNAPSHOT_CHANGED");
  assert.deepEqual(tamperedResult.issues, ["DATASET_CONTENT_DIGEST_INVALID"]);

  const unsupported = structuredClone(payload.labelQAWorkOrder);
  unsupported.intendedUse = "training";
  assert.equal(preflightWorkOrder(unsupported, payload).issues[0], "QUALITY_PROFILE_DOES_NOT_SUPPORT_INTENDED_USE");
});

test("candidate fields do not require demo GT and missing model candidates do not block", () => {
  const productionLike = structuredClone(payload);
  for (const frame of productionLike.frames) {
    for (const target of frame.targets) delete target.demoReferenceAnnotation;
  }
  productionLike.frames[0].targets[0].modelCandidate = null;
  const digest = computeDatasetCandidateDigest(productionLike);
  productionLike.batch.contentDigest = digest;
  const workOrder = { ...productionLike.labelQAWorkOrder, snapshotDigest: digest };
  const evaluation = evaluateWorkOrder(productionLike, workOrder);

  assert.equal(evaluation.preflight.status, "READY");
  assert.equal(evaluation.evidence.some((item) => item.rule === "MODEL_CANDIDATE_MISSING"), false);
  assert.equal(evaluation.targets.every((target) => "priorityScore" in target && !("riskScore" in target)), true);
});

test("qualification requires cluster decisions plus remediation recheck on a new digest", () => {
  const evaluation = evaluateWorkOrder(payload);
  const blocked = createLabelQualityManifest(evaluation);
  assert.equal(blocked.status, "BLOCKED");
  assert.equal(blocked.qualifiedForUses.length, 0);
  assert.equal(blocked.issueSummary.unresolvedClusters.length, 2);

  const resolved = resolveAllBlockingClusters(evaluation);
  const awaiting = createLabelQualityManifest(
    evaluation,
    resolved.decisions,
    resolved.remediations,
    resolved.rechecks,
  );
  assert.equal(awaiting.status, "AWAITING_SIGNOFF");
  assert.deepEqual(awaiting.qualifiedForUses, []);
  const signOff = createQualificationSignOff(
    evaluation,
    awaiting.reviewedSnapshotDigest,
    awaiting.reviewBundleHash,
  );
  const manifest = createLabelQualityManifest(
    evaluation,
    resolved.decisions,
    resolved.remediations,
    resolved.rechecks,
    signOff,
  );
  assert.equal(manifest.status, "QUALIFIED");
  assert.deepEqual(manifest.qualifiedForUses, ["simulation_seed"]);
  assert.equal(manifest.assessmentScope.assessedTargetCount, 9);
  assert.equal(manifest.qualifiedSnapshotDigest, payload.demoRecheck.snapshotDigest);
  assert.equal(manifest.signOffStatus, "VALID");
  assert.match(manifest.manifestHash, /^sha256:[a-f0-9]{64}$/);

  const receipt = createSceneQLReceipt(manifest);
  assert.equal(receipt.schemaVersion, "data-supply-result/1.0");
  assert.equal(receipt.taskId, "TASK-LG-WZ-001");
  assert.equal(receipt.provider, "LabelGuard");
  assert.equal(receipt.status, "ACCEPTED");
  assert.equal(receipt.humanDecision.decision, "ACCEPT");
  assert.equal(receipt.providerResult.schemaVersion, "label-quality-manifest/1.0");
  assert.equal(receipt.providerResult.qualificationStatus, "QUALIFIED");

  const changedDecisions = structuredClone(resolved.decisions);
  const firstClusterId = Object.keys(changedDecisions)[0];
  changedDecisions[firstClusterId].reason += "（补充说明）";
  const staleSignOffManifest = createLabelQualityManifest(
    evaluation,
    changedDecisions,
    resolved.remediations,
    resolved.rechecks,
    signOff,
  );
  assert.equal(staleSignOffManifest.status, "BLOCKED");
  assert.equal(staleSignOffManifest.signOffStatus, "STALE_OR_INVALID");
});

test("recheck rejects unchanged or non-SHA snapshots", () => {
  const evaluation = evaluateWorkOrder(payload);
  const cluster = evaluation.issueClusters.find((item) => item.blocking);
  const decision = createReviewDecision(cluster, "confirmed_issue", "确认同一规则在多目标重复出现", evaluation);
  const remediation = createRemediationTask(cluster, decision, evaluation);
  assert.throws(() => createRecheckRecord(remediation, remediation.sourceSnapshotDigest), /快照未变化/);
  assert.throws(() => createRecheckRecord(remediation, "lg-deadbeef"), /SHA-256/);
});

test("cross-repo task contract and SHA-256 implementation are stable", () => {
  const task = createDataSupplyTask(payload);
  assert.equal(task.schemaVersion, "data-supply-task/1.0");
  assert.equal(task.taskId, "TASK-LG-WZ-001");
  assert.deepEqual(task.demandRef, { id: "DEM-WZ-001", version: "1.0" });
  assert.equal(task.routeDecision.id, "ROUTE-DATA-QA");
  assert.equal(task.routeDecision.type, "DATA_QA");
  assert.equal(task.providerSpec.schemaVersion, "label-qa-work-order/1.0");
  assert.equal(task.providerSpec.provider, "LabelGuard");
  assert.equal(task.seedRefs.length, 1);
  assert.equal(task.seedRefs[0].sampleTokens.length, 3);
  assert.deepEqual(task, payload.dataSupplyTask);
  assert.equal(preflightDataSupplyTask(structuredClone(task), payload).status, "READY");

  const mismatched = structuredClone(task);
  mismatched.inputAssetRefs[0].snapshotDigest = "sha256:" + "f".repeat(64);
  assert.deepEqual(preflightDataSupplyTask(mismatched, payload).issues, ["INPUT_SNAPSHOT_DIGEST_MISMATCH"]);

  const value = { b: 2, a: 1 };
  const expected = "sha256:" + crypto.createHash("sha256").update(JSON.stringify({ a: 1, b: 2 })).digest("hex");
  assert.equal(stableHash(value), expected);
});
