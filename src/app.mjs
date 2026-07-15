import "./styles.css";
import {
  createLabelQualityManifest,
  createQualificationSignOff,
  createRecheckRecord,
  createRemediationTask,
  createReviewDecision,
  createSceneQLReceipt,
  evaluateWorkOrder,
} from "./domain.mjs";
import {
  createMockClusterAssistant,
  validateClusterAssistantResponse,
} from "./assistant.mjs";

const root = document.querySelector("#app");
const STORAGE_KEY = "labelguard-work-order-v3";

const state = {
  payload: null,
  evaluation: null,
  view: "order",
  selectedClusterId: null,
  selectedTargetId: null,
  decisions: new Map(),
  remediations: new Map(),
  rechecks: new Map(),
  signOff: null,
  assistant: new Map(),
  assistantLoading: new Set(),
  aiStatus: { mode: "mock", transport: "client-deterministic", requestedMode: "mock", remoteReady: false },
};

const CLASS_LABELS = {
  car: "乘用车",
  construction_vehicle: "施工车辆",
  construction_worker: "施工人员",
};

const ROUTE_LABELS = {
  ANNOTATION_REWORK: "标注返修",
  EXPERT_ARBITRATION: "专家仲裁",
  DATA_READINESS_REPAIR: "数据准备修复",
  NEEDS_MORE_EVIDENCE: "补充证据",
  NO_REMEDIATION: "无需返修",
};

const DECISION_LABELS = {
  confirmed_issue: "确认问题",
  not_an_issue: "不构成问题",
  needs_more_evidence: "证据不足",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortDigest(value) {
  return value ? `${value.slice(0, 15)}…${value.slice(-8)}` : "—";
}

function shieldIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#061710" d="M12 2.4 20 5.5v5.7c0 5-3.2 8.3-8 10-4.8-1.7-8-5-8-10V5.5z"/><path fill="#35ddb2" d="m8.1 11.8 2.3 2.3 5.6-6 1.4 1.4-7 7.4-3.7-3.7z"/></svg>';
}

function activeCluster() {
  return state.evaluation.issueClusters.find((item) => item.id === state.selectedClusterId) ?? state.evaluation.issueClusters[0];
}

function clusterContext(cluster) {
  const evidenceIds = new Set(cluster.evidenceIds);
  const clauseIds = new Set(cluster.specClauseIds);
  return {
    cluster,
    evidence: state.evaluation.evidence.filter((item) => evidenceIds.has(item.id)),
    specClauses: state.evaluation.specClauses.filter((item) => clauseIds.has(item.id)),
  };
}

function currentManifest() {
  return createLabelQualityManifest(
    state.evaluation,
    state.decisions,
    state.remediations,
    state.rechecks,
    state.signOff,
  );
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    snapshotDigest: state.evaluation.workOrder.snapshotDigest,
    decisions: [...state.decisions.entries()],
    remediations: [...state.remediations.entries()],
    rechecks: [...state.rechecks.entries()],
    signOff: state.signOff,
  }));
}

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!saved || saved.snapshotDigest !== state.evaluation.workOrder.snapshotDigest) return;
    state.decisions = new Map(saved.decisions ?? []);
    state.remediations = new Map(saved.remediations ?? []);
    state.rechecks = new Map(saved.rechecks ?? []);
    state.signOff = saved.signOff ?? null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function pageShell(content) {
  const evaluation = state.evaluation;
  const manifest = currentManifest();
  const decided = [...state.decisions.values()].filter((item) =>
    evaluation.issueClusters.some((cluster) => cluster.blocking && cluster.id === item.clusterId),
  ).length;
  const modelLabel = state.aiStatus.mode === "remote" ? "MiniMax-M3 · server" : "Mock · deterministic";
  const nav = [
    { id: "order", index: "01", title: "QA 工单", meta: evaluation.preflight.status },
    { id: "review", index: "02", title: "问题簇复核", meta: `${decided}/${evaluation.summary.blockingClusterCount}` },
    { id: "qualification", index: "03", title: "用途资格", meta: manifest.status },
  ];
  return [
    '<div class="app-shell"><header class="topbar">',
    '<div class="brand"><div class="brand-mark">' + shieldIcon() + '</div><div><div class="brand-name">LabelGuard</div><div class="brand-caption">Dataset qualification gate</div></div></div>',
    '<div class="topbar-right"><div class="batch-chip"><span>Supply Request</span><strong>' + escapeHtml(evaluation.workOrder.supplyRequestId) + '</strong></div>',
    '<div class="mode-chip" title="' + escapeHtml(state.aiStatus.transport) + '"><span class="live-dot"></span><strong>' + escapeHtml(modelLabel) + '</strong></div></div></header>',
    '<nav class="sidebar" aria-label="Label QA workflow"><div class="nav-label">QA Workflow</div>',
    nav.map((item) => '<button class="nav-button ' + (state.view === item.id ? "active" : "") + '" data-nav="' + item.id + '"><span class="nav-index">' + item.index + '</span><span class="nav-title">' + item.title + '</span><span class="nav-meta">' + escapeHtml(item.meta) + '</span></button>').join(""),
    '<div class="sidebar-contract"><span>Intended use</span><strong>' + escapeHtml(evaluation.workOrder.intendedUse) + '</strong><span>Snapshot</span><code>' + escapeHtml(shortDigest(evaluation.workOrder.snapshotDigest)) + '</code></div></nav>',
    '<main class="workspace">' + content + '</main></div>',
  ].join("");
}

function metric(label, value, foot, accent = false) {
  return '<article class="metric-card ' + (accent ? "accent" : "") + '"><div class="metric-label">' + escapeHtml(label) + '</div><div class="metric-value">' + escapeHtml(value) + '</div><div class="metric-foot">' + escapeHtml(foot) + '</div></article>';
}

function renderOrder() {
  const { workOrder, preflight, summary, qualityProfile } = state.evaluation;
  const fields = [
    ["Demand", `${workOrder.demandRef.id} · v${workOrder.demandRef.version}`],
    ["Dataset candidate", workOrder.datasetCandidateId],
    ["Candidate label", workOrder.candidateLabelVersion],
    ["Sensor profile", workOrder.sensorProfile],
    ["Quality profile", `${qualityProfile.id} · v${qualityProfile.version}`],
    ["SLA", workOrder.slaDueAt],
  ];
  const content = [
    '<div class="page-head"><div><div class="eyebrow">Label QA work order</div><h1>' + escapeHtml(workOrder.workOrderId) + '</h1><p class="page-description">' + escapeHtml(workOrder.supplyRequestId) + '</p></div><button class="button primary" data-nav="review" ' + (preflight.status !== "READY" ? "disabled" : "") + '>进入问题簇复核</button></div>',
    '<section class="metrics">',
    metric("Preflight", preflight.status, preflight.status === "READY" ? "字段、用途与快照一致" : "需补齐后再运行", true),
    metric("Scope", summary.targetCount, `${summary.frameCount} frames · exhaustive`),
    metric("Issue clusters", summary.clusterCount, `${summary.systematicClusterCount} systematic`),
    metric("Blocking", summary.blockingClusterCount, "Mock disagreement excluded"),
    '</section>',
    '<section class="order-grid"><div class="panel"><div class="panel-head"><span class="panel-title">SceneQL 下发契约</span><span class="status-pill ' + (preflight.status === "READY" ? "ready" : "blocked") + '">' + escapeHtml(preflight.status) + '</span></div><div class="contract-grid">',
    fields.map(([label, value]) => '<div class="contract-field"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>').join(""),
    '<div class="contract-field wide"><span>Immutable snapshot digest</span><code>' + escapeHtml(workOrder.snapshotDigest) + '</code></div></div></div>',
    '<aside class="panel"><div class="panel-head"><span class="panel-title">Preflight gate</span><span class="panel-meta">deterministic</span></div><div class="panel-body"><div class="gate-check pass"><strong>字段完整</strong><span>required contract fields</span></div><div class="gate-check pass"><strong>用途受支持</strong><span>' + escapeHtml(workOrder.intendedUse) + '</span></div><div class="gate-check pass"><strong>快照一致</strong><span>stale decisions cannot be reused</span></div><div class="gate-check pass"><strong>许可已声明</strong><span>' + escapeHtml(workOrder.licenseRef) + '</span></div></div></aside></section>',
  ].join("");
  return pageShell(content);
}

function overlay(box, className, label) {
  if (!box) return "";
  const frame = state.evaluation.batch.frameSize;
  const style = `left:${(box.x / frame.width * 100).toFixed(3)}%;top:${(box.y / frame.height * 100).toFixed(3)}%;width:${(box.width / frame.width * 100).toFixed(3)}%;height:${(box.height / frame.height * 100).toFixed(3)}%`;
  return '<div class="box-overlay ' + className + '" style="' + style + '" aria-hidden="true"><span class="box-label">' + escapeHtml(label) + '</span></div>';
}

function projectionWireframe(corners) {
  if (!Array.isArray(corners) || corners.length !== 8) return "";
  const frame = state.evaluation.batch.frameSize;
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const lines = edges.map(([a, b]) => `<line x1="${corners[a].x}" y1="${corners[a].y}" x2="${corners[b].x}" y2="${corners[b].y}"></line>`).join("");
  return `<svg class="projection-wireframe" viewBox="0 0 ${frame.width} ${frame.height}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>`;
}

function renderAssistant(context) {
  const response = state.assistant.get(context.cluster.id) ?? createMockClusterAssistant(context);
  const loading = state.assistantLoading.has(context.cluster.id);
  return [
    '<section class="assistant-card"><div class="assistant-title"><span>AI · IssueCluster 草拟</span><button class="button compact" data-assistant-refresh ' + (loading ? "disabled" : "") + '>' + (loading ? "处理中…" : "重新整理") + '</button></div>',
    '<p>' + escapeHtml(response.summary) + '</p>',
    '<div class="assistant-field"><span>返修草稿</span><strong>' + escapeHtml(response.remediationDraft) + '</strong></div>',
    '<div class="assistant-field"><span>复检计划</span><strong>' + escapeHtml(response.recheckPlan) + '</strong></div>',
    '<div class="citation-list">' + [...response.evidenceIds, ...response.specClauseIds].map((id) => '<code>' + escapeHtml(id) + '</code>').join("") + '</div>',
    '<p class="limitation">' + escapeHtml(response.limitation) + '</p></section>',
  ].join("");
}

function renderReview() {
  const evaluation = state.evaluation;
  const cluster = activeCluster();
  if (!cluster) return pageShell('<div class="empty">当前工单没有 IssueCluster。</div>');
  const context = clusterContext(cluster);
  const targetCandidates = evaluation.targets.filter((target) => cluster.targetIds.includes(target.id));
  if (!targetCandidates.some((target) => target.id === state.selectedTargetId)) state.selectedTargetId = targetCandidates[0].id;
  const target = evaluation.targets.find((item) => item.id === state.selectedTargetId);
  const targetEvidence = context.evidence.filter((item) => item.targetId === target.id);
  const decision = state.decisions.get(cluster.id);
  const remediation = state.remediations.get(cluster.id);
  const recheck = state.rechecks.get(cluster.id);
  const clusterList = evaluation.issueClusters.map((item) => {
    const itemDecision = state.decisions.get(item.id);
    return '<button class="cluster-item ' + (item.id === cluster.id ? "active" : "") + '" data-select-cluster="' + escapeHtml(item.id) + '"><div><strong>' + escapeHtml(item.title) + '</strong><span>' + (item.systemic ? "SYSTEMATIC" : "SINGLE") + ' · ' + item.targetIds.length + ' targets</span></div><span class="priority">' + item.priorityScore + '</span><div class="cluster-foot"><span>' + (item.blocking ? "BLOCKING" : "INFO") + '</span><span>' + escapeHtml(itemDecision ? DECISION_LABELS[itemDecision.decision] : "待处理") + '</span></div></button>';
  }).join("");
  const targetTabs = targetCandidates.map((item) => '<button class="target-tab ' + (item.id === target.id ? "active" : "") + '" data-select-target="' + escapeHtml(item.id) + '">' + escapeHtml(item.id) + '</button>').join("");
  const evidenceCards = targetEvidence.map((item) => '<article class="evidence-card"><div class="evidence-top"><strong>' + escapeHtml(item.title) + '</strong><span class="severity-pill ' + item.severity + '">' + escapeHtml(item.severity.toUpperCase()) + '</span></div><div class="evidence-values"><div><span>Observed</span><code>' + escapeHtml(item.observed) + '</code></div><div><span>Expected</span><code>' + escapeHtml(item.expected) + '</code></div></div><div class="citation-list"><code>' + escapeHtml(item.id) + '</code><code>' + escapeHtml(item.specClauseId) + '</code></div></article>').join("");
  const workflowCard = decision ? [
    '<div class="workflow-status"><strong>' + escapeHtml(DECISION_LABELS[decision.decision]) + '</strong><span>' + escapeHtml(ROUTE_LABELS[decision.route]) + '</span><p>' + escapeHtml(decision.reason) + '</p></div>',
    remediation ? '<div class="remediation-card"><span>Remediation</span><strong>' + escapeHtml(remediation.id) + '</strong><p>' + escapeHtml(remediation.requestedAction) + '</p>' + (recheck ? '<div class="recheck-pass">RECHECK PASSED · SYNTHETIC DEMO</div>' : '<button class="button primary" data-demo-recheck>记录返修完成并复检</button>') + '</div>' : "",
  ].join("") : "";
  const reference = target.demoReferenceAnnotation?.projectedBox2d;
  const content = [
    '<section class="review-layout"><aside class="panel cluster-panel"><div class="panel-head"><span class="panel-title">Issue clusters</span><span class="panel-meta">' + evaluation.summary.clusterCount + '</span></div><div class="cluster-list">' + clusterList + '</div></aside>',
    '<section class="panel viewer-panel"><div class="panel-head"><div><span class="panel-title">' + escapeHtml(cluster.id) + '</span><span class="subline">' + escapeHtml(ROUTE_LABELS[cluster.recommendedRoute]) + '</span></div><span class="status-pill ' + (cluster.blocking ? "blocked" : "ready") + '">' + (cluster.blocking ? "BLOCKING" : "INFO ONLY") + '</span></div>',
    '<div class="target-tabs">' + targetTabs + '</div><div class="viewer-wrap"><div class="viewer"><img src="' + escapeHtml(target.image) + '" alt="nuScenes CAM_FRONT ' + escapeHtml(target.frameId) + '">' + projectionWireframe(target.candidateProjectionCorners2d) + overlay(target.candidate2d, "annotation", target.qaPerturbation ? "CANDIDATE · SYNTH QA" : "CANDIDATE") + overlay(target.candidateProjection2d, "projection", "CANDIDATE 3D PROJECTION") + overlay(reference, "reference", "DEMO GT REFERENCE") + overlay(target.modelCandidate?.box2d, "model", "MOCK SECOND OPINION") + '</div>',
    '<div class="viewer-toolbar"><div class="legend"><span><i class="mint"></i>候选 2D</span><span><i class="amber"></i>候选 3D 投影</span><span><i class="blue"></i>Demo-only 官方参考</span><span><i class="violet"></i>Mock</span></div><span>' + escapeHtml(target.frameId) + '</span></div>',
    '<div class="layer-strip"><span>REAL MEDIA</span><span>CANDIDATE LABEL</span><span class="synthetic">' + (target.qaPerturbation ? "SYNTH QA PERTURBATION" : "NO PERTURBATION") + '</span><span>OPTIONAL DEMO REFERENCE</span></div></div>',
    '<div class="target-facts"><div><span>Class</span><strong>' + escapeHtml(CLASS_LABELS[target.class] ?? target.class) + '</strong></div><div><span>Track</span><strong>' + escapeHtml(target.trackId) + '</strong></div><div><span>Sample</span><strong>' + escapeHtml(target.frameSource.sampleToken.slice(0, 8)) + '</strong></div><div><span>LiDAR</span><strong>' + target.lidarPoints + ' pts</strong></div></div></section>',
    '<aside class="panel review-side"><div class="panel-head"><span class="panel-title">证据与处置</span><span class="panel-meta">' + context.evidence.length + ' evidence</span></div><div class="panel-body"><div class="evidence-stack">' + evidenceCards + '</div>' + renderAssistant(context),
    '<div class="decision-box"><label for="decision-reason">QA 判断依据</label><textarea id="decision-reason" placeholder="引用可观察事实与规范条款…">' + escapeHtml(decision?.reason ?? "") + '</textarea><div class="decision-actions"><button data-decision="confirmed_issue">确认问题</button><button data-decision="not_an_issue">不构成问题</button><button data-decision="needs_more_evidence">证据不足</button></div>' + workflowCard + '</div></div></aside></section>',
  ].join("");
  return pageShell(content);
}

function renderQualification() {
  const manifest = currentManifest();
  const receipt = createSceneQLReceipt(manifest);
  const ready = manifest.status === "QUALIFIED";
  const unresolved = manifest.issueSummary?.unresolvedClusters ?? [];
  const content = [
    '<div class="page-head"><div><div class="eyebrow">Use qualification</div><h1>Label Quality Manifest</h1><p class="page-description">用途与快照双重限定；不是通用“数据已正确”证明。</p></div><div class="button-row">' + (manifest.status === "AWAITING_SIGNOFF" ? '<button class="button primary" data-signoff>QA Owner 签署</button>' : '') + '<button class="button" data-download="manifest">下载 Manifest</button><button class="button" data-download="receipt">导出 SceneQL 回执</button></div></div>',
    '<section class="qualification-grid"><div class="panel"><div class="qualification-hero"><div class="qualification-state ' + (ready ? "ready" : "blocked") + '"><span>' + (ready ? "✓" : "!") + '</span><div><h2>' + escapeHtml(manifest.status) + '</h2><p>' + escapeHtml(manifest.intendedUse) + ' · ' + escapeHtml(shortDigest(manifest.manifestHash)) + '</p></div></div><span class="status-pill ' + (ready ? "ready" : "blocked") + '">' + escapeHtml(receipt.status) + '</span></div>',
    '<div class="qualification-facts"><div><span>Source snapshot</span><code>' + escapeHtml(shortDigest(manifest.sourceSnapshotDigest)) + '</code></div><div><span>Reviewed snapshot</span><code>' + escapeHtml(shortDigest(manifest.reviewedSnapshotDigest)) + '</code></div><div><span>Qualified for</span><strong>' + escapeHtml(manifest.qualifiedForUses.join(", ") || "none") + '</strong></div><div><span>Sign-off</span><strong>' + escapeHtml(manifest.signOffStatus ?? "—") + '</strong></div></div>',
    '<table class="data-table"><thead><tr><th>Issue cluster</th><th>Decision</th><th>Route</th><th>Recheck</th></tr></thead><tbody>' + state.evaluation.issueClusters.filter((item) => item.blocking).map((cluster) => { const decision = state.decisions.get(cluster.id); const recheck = state.rechecks.get(cluster.id); return '<tr><td><strong>' + escapeHtml(cluster.id) + '</strong><span>' + escapeHtml(cluster.title) + '</span></td><td>' + escapeHtml(decision ? DECISION_LABELS[decision.decision] : "待处理") + '</td><td>' + escapeHtml(decision ? ROUTE_LABELS[decision.route] : cluster.recommendedRoute) + '</td><td>' + escapeHtml(recheck?.result?.toUpperCase() ?? "—") + '</td></tr>'; }).join("") + '</tbody></table></div>',
    '<aside><div class="panel blocker-panel"><div class="panel-head"><span class="panel-title">Qualification gate</span><span class="panel-meta">' + unresolved.length + ' unresolved</span></div><div class="panel-body">' + (unresolved.length ? unresolved.map((item) => '<div class="blocker-item"><strong>' + escapeHtml(item.clusterId ?? "snapshot") + '</strong><span>' + escapeHtml(item.reason) + '</span></div>').join("") : manifest.status === "AWAITING_SIGNOFF" ? '<div class="gate-check"><strong>等待 QA Owner 签署</strong><span>决定、返修与复检已完成；尚未授予用途资格</span></div>' : '<div class="gate-check pass"><strong>用途资格已签署</strong><span>仅对当前 intendedUse 与 snapshot 有效</span></div>') + '</div></div><div class="panel receipt-panel"><div class="panel-head"><span class="panel-title">SceneQL receipt</span><span class="panel-meta">data-supply-result/1.0</span></div><pre>' + escapeHtml(JSON.stringify(receipt, null, 2)) + '</pre></div></aside></section>',
  ].join("");
  return pageShell(content);
}

function render() {
  if (!state.evaluation) {
    root.innerHTML = '<div class="loading">正在载入 QA 工单…</div>';
    return;
  }
  root.innerHTML = state.view === "review" ? renderReview() : state.view === "qualification" ? renderQualification() : renderOrder();
  bindEvents();
}

function showToast(message, error = false) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast" + (error ? " error" : "");
  toast.textContent = message;
  toast.setAttribute("role", error ? "alert" : "status");
  document.body.append(toast);
  setTimeout(() => toast.remove(), 3000);
}

async function requestAssistant() {
  const cluster = activeCluster();
  const context = clusterContext(cluster);
  state.assistantLoading.add(cluster.id);
  render();
  try {
    const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ context }) });
    if (!response.ok) throw new Error("assistant unavailable");
    const result = await response.json();
    if (!validateClusterAssistantResponse(result, context).valid) throw new Error("closed citation violation");
    state.assistant.set(cluster.id, result);
    state.aiStatus = { mode: result.mode, transport: result.transport, requestedMode: result.mode, remoteReady: result.mode === "remote" };
  } catch {
    state.assistant.set(cluster.id, createMockClusterAssistant(context));
    state.aiStatus = { ...state.aiStatus, mode: "mock", transport: "client-deterministic", remoteReady: false };
    showToast("M3 调用失败；已明确切换为确定性 Mock，不计为真实模型通过。", true);
  } finally {
    state.assistantLoading.delete(cluster.id);
    render();
  }
}

function downloadJson(kind) {
  const manifest = currentManifest();
  const value = kind === "receipt" ? createSceneQLReceipt(manifest) : manifest;
  const blob = new Blob([JSON.stringify(value, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = kind === "receipt" ? `${manifest.supplyRequestId}-labelguard-result.json` : `${manifest.workOrderId}-quality-manifest.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.nav; render(); }));
  document.querySelectorAll("[data-select-cluster]").forEach((button) => button.addEventListener("click", () => { state.selectedClusterId = button.dataset.selectCluster; state.selectedTargetId = null; render(); }));
  document.querySelectorAll("[data-select-target]").forEach((button) => button.addEventListener("click", () => { state.selectedTargetId = button.dataset.selectTarget; render(); }));
  document.querySelectorAll("[data-decision]").forEach((button) => button.addEventListener("click", () => {
    const cluster = activeCluster();
    try {
      const reason = document.querySelector("#decision-reason")?.value ?? "";
      const decision = createReviewDecision(cluster, button.dataset.decision, reason, state.evaluation);
      state.decisions.set(cluster.id, decision);
      state.remediations.delete(cluster.id);
      state.rechecks.delete(cluster.id);
      state.signOff = null;
      if (decision.decision === "confirmed_issue") state.remediations.set(cluster.id, createRemediationTask(cluster, decision, state.evaluation));
      persistState();
      showToast(`已记录：${DECISION_LABELS[decision.decision]} → ${ROUTE_LABELS[decision.route]}`);
      render();
    } catch (error) { showToast(error.message, true); }
  }));
  document.querySelector("[data-demo-recheck]")?.addEventListener("click", () => {
    const cluster = activeCluster();
    try {
      const record = createRecheckRecord(state.remediations.get(cluster.id), state.payload.demoRecheck.snapshotDigest, "passed", { demoSyntheticRecheck: true });
      state.rechecks.set(cluster.id, record);
      state.signOff = null;
      persistState();
      showToast("已记录合成 Demo 复检回执；生产环境必须验证真实新快照。");
      render();
    } catch (error) { showToast(error.message, true); }
  });
  document.querySelector("[data-assistant-refresh]")?.addEventListener("click", requestAssistant);
  document.querySelector("[data-signoff]")?.addEventListener("click", () => {
    try {
      const manifest = currentManifest();
      state.signOff = createQualificationSignOff(
        state.evaluation,
        manifest.reviewedSnapshotDigest,
        manifest.reviewBundleHash,
      );
      persistState();
      showToast("QA Owner 已签署：仅对当前用途与复检快照有效。");
      render();
    } catch (error) { showToast(error.message, true); }
  });
  document.querySelectorAll("[data-download]").forEach((button) => button.addEventListener("click", () => downloadJson(button.dataset.download)));
}

async function loadAiStatus() {
  try {
    const response = await fetch("/api/status", { headers: { accept: "application/json" } });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return;
    const status = await response.json();
    state.aiStatus = { mode: status.mode ?? "mock", transport: status.transport ?? "server", requestedMode: status.requestedMode ?? "mock", remoteReady: Boolean(status.remoteReady) };
  } catch {
    state.aiStatus = { mode: "mock", transport: "client-deterministic", requestedMode: "mock", remoteReady: false };
  }
}

async function init() {
  try {
    const response = await fetch("/demo/labelguard-batch-v1.json");
    if (!response.ok) throw new Error(`公开工单加载失败（HTTP ${response.status}）`);
    state.payload = await response.json();
    state.evaluation = evaluateWorkOrder(state.payload);
    if (state.evaluation.preflight.status !== "READY") throw new Error(`工单 Preflight：${state.evaluation.preflight.status}`);
    restoreState();
    state.selectedClusterId = state.evaluation.issueClusters[0]?.id;
    state.selectedTargetId = state.evaluation.issueClusters[0]?.targetIds[0];
    await loadAiStatus();
    render();
  } catch (error) {
    root.innerHTML = '<div class="loading" role="alert">' + escapeHtml(error.message) + '</div>';
  }
}

init();
