import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createDecision,
  createReleaseManifest,
  evaluateBatch,
  stableHash,
} from "../src/domain.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
const fixturePath = path.join(projectRoot, "public", "demo", "labelguard-batch-v1.json");
const payload = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

test("public demo batch produces deterministic target-level evidence", () => {
  const first = evaluateBatch(payload);
  const second = evaluateBatch(payload);

  assert.equal(first.summary.frameCount, 3);
  assert.equal(first.summary.targetCount, 8);
  assert.equal(first.summary.reviewCount, 5);
  assert.equal(first.summary.autoPassCount, 3);
  assert.equal(first.summary.evidenceCount, 7);
  assert.deepEqual(first, second);
});

test("temporal, projection, model disagreement and geometry risks remain distinct", () => {
  const evaluation = evaluateBatch(payload);
  const byId = Object.fromEntries(evaluation.targets.map((target) => [target.id, target]));

  assert.ok(byId["TG-P07-185"].evidence.some((item) => item.rule === "TRACK_ACCELERATION_CONTINUITY"));
  assert.ok(byId["TG-V12-185"].evidence.some((item) => item.rule === "PROJECTION_ALIGNMENT"));
  assert.ok(byId["TG-C03-185"].evidence.some((item) => item.factType === "model_disagreement"));
  assert.ok(byId["TG-C03-186"].evidence.some((item) => item.rule === "BOX_IN_FRAME"));
  assert.equal(byId["TG-V12-184"].reviewRequired, false);
});

test("release remains blocked until every required target has a human decision", () => {
  const evaluation = evaluateBatch(payload);
  const empty = createReleaseManifest(evaluation, {});

  assert.equal(empty.status, "BLOCKED");
  assert.equal(empty.unresolved.length, 5);
  assert.equal(empty.blockers.length, 0);
});

test("all pass decisions produce a ready and reproducible release manifest", () => {
  const evaluation = evaluateBatch(payload);
  const decisions = {};
  for (const target of evaluation.targets.filter((item) => item.reviewRequired)) {
    decisions[target.id] = createDecision(target, "pass", "多传感器关联与规范均已人工确认");
  }

  const first = createReleaseManifest(evaluation, decisions);
  const second = createReleaseManifest(evaluation, decisions);
  assert.equal(first.status, "READY");
  assert.equal(first.counts.humanPassed, 5);
  assert.equal(first.source.dataNature, "synthetic");
  assert.equal(first.source.license, "CC0-1.0");
  assert.equal(first.manifestHash, second.manifestHash);
});

test("repair and rejection decisions block release and preserve routing", () => {
  const evaluation = evaluateBatch(payload);
  const required = evaluation.targets.filter((item) => item.reviewRequired);
  const decisions = {};
  for (const target of required) {
    decisions[target.id] = createDecision(target, "pass", "人工复核通过当前目标关联");
  }
  decisions[required[0].id] = createDecision(required[0], "repair", "速度属性需要标注返修");

  const manifest = createReleaseManifest(evaluation, decisions);
  assert.equal(manifest.status, "BLOCKED");
  assert.equal(manifest.blockers.length, 1);
  assert.equal(manifest.blockers[0].route, "ANNOTATION_REWORK");
});

test("decision reason and hash behavior are validated", () => {
  const evaluation = evaluateBatch(payload);
  const target = evaluation.targets.find((item) => item.reviewRequired);
  assert.throws(() => createDecision(target, "pass", "短"), /至少需要 4 个字符/);
  assert.equal(stableHash({ b: 2, a: 1 }), stableHash({ a: 1, b: 2 }));
});
