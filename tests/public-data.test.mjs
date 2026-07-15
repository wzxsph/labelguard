import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
const dataPath = path.join(projectRoot, "public", "demo", "labelguard-batch-v1.json");

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

test("fixture separates production candidate fields from optional demo references", () => {
  const payload = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  assert.equal(payload.schemaVersion, "labelguard.demo.v3");
  assert.equal(payload.batch.layers.demoReferenceAnnotation, "optional_demo_only_official_nuscenes_annotation");
  assert.equal(payload.labelQAWorkOrder.intendedUse, "simulation_seed");
  assert.equal(payload.qualityProfile.rules.MODEL_CLASS_AGREEMENT.blocking, false);
  assert.deepEqual(payload.qualityProfile.rules.CLASS_DIMENSIONS.byClass.construction_vehicle.length, [2, 12]);
  assert.equal(payload.qualityProfile.rules.LIDAR_POINT_SUPPORT.minimumByClass.construction_worker, 4);

  for (const frame of payload.frames) {
    const imagePath = path.join(projectRoot, "public", frame.image);
    assert.equal(fs.existsSync(imagePath), true, frame.image + " should exist");
    const imageDigest = "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(imagePath)).digest("hex");
    assert.equal(imageDigest, frame.source.derivedMediaSha256);
    for (const target of frame.targets) {
      assert.ok(target.candidate2d);
      assert.ok(target.candidate3d);
      assert.ok(target.candidateProjection2d);
      assert.ok(Number.isFinite(target.candidateVelocityMps));
      assert.equal("box2d" in target, false);
      assert.equal("humanGtBaseline" in target, false);
      assert.equal(target.demoReferenceAnnotation.demoOnly, true);
      assert.equal(target.demoReferenceAnnotation.provenance, "official_nuscenes_human_3d_annotation");
      if (target.modelCandidate) assert.equal(target.modelCandidate.provenance, "deterministic_mock_not_model_inference");
      if (target.qaPerturbation) assert.equal(target.qaPerturbation.synthetic, true);
    }
  }
  const targets = payload.frames.flatMap((frame) => frame.targets);
  assert.equal(targets.length, 9);
  assert.equal(targets.filter((target) => target.qaPerturbation).length, 5);
  assert.equal(new Set(targets.map((target) => target.trackId)).size, 3);
});

test("dataset candidate digest excludes work-order metadata and remains verifiable", () => {
  const payload = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const batch = structuredClone(payload.batch);
  const expected = batch.contentDigest;
  delete batch.contentDigest;
  const candidate = { schemaVersion: payload.schemaVersion, batch, frames: payload.frames };
  const actual = "sha256:" + crypto.createHash("sha256").update(JSON.stringify(canonicalize(candidate))).digest("hex");

  assert.equal(payload.batch.digestMethod, "sha256-canonical-dataset-candidate-without-batch.contentDigest-and-work-order");
  assert.equal(actual, expected);
  assert.equal(payload.labelQAWorkOrder.snapshotDigest, expected);
  assert.equal(payload.dataSupplyTask.inputAssetRefs[0].snapshotDigest, expected);
  assert.match(fs.readFileSync(path.join(projectRoot, "LICENSE"), "utf8"), /^MIT License/);
  const dataLicense = fs.readFileSync(path.join(projectRoot, "public", "demo", "LICENSE"), "utf8");
  assert.match(dataLicense, /CC BY-NC-SA 4.0/);
  assert.match(dataLicense, /nuscenes\.org\/terms-of-use/);
});
