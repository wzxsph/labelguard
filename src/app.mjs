import "./styles.css";
import {
  createDecision,
  createReleaseManifest,
  evaluateBatch,
} from "./domain.mjs";
import {
  createMockAssistant,
  validateAssistantResponse,
} from "./assistant.mjs";

const root = document.querySelector("#app");
const STORAGE_KEY = "labelguard-demo-decisions-v1";

const state = {
  payload: null,
  evaluation: null,
  view: "queue",
  selectedId: null,
  decisions: new Map(),
  assistant: new Map(),
  assistantLoading: new Set(),
  aiStatus: {
    mode: "mock",
    transport: "client-deterministic",
    requestedMode: "mock",
    remoteReady: false,
  },
};

const CLASS_LABELS = {
  pedestrian: "行人",
  cyclist: "骑行者",
  car: "乘用车",
  traffic_cone: "交通锥",
};

const ROUTE_LABELS = {
  AUTO_PASS: "自动放行",
  HUMAN_REVIEW: "人工复核",
  EXPERT_REVIEW: "高级 QA",
  RELEASE_CANDIDATE: "进入候选版本",
  ANNOTATION_REWORK: "标注返修",
};

const DECISION_LABELS = {
  pass: "通过",
  reject: "驳回",
  repair: "返修",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shieldIcon() {
  return [
    '<svg viewBox="0 0 24 24" aria-hidden="true">',
    '<path fill="#061710" d="M12 2.4 20 5.5v5.7c0 5-3.2 8.3-8 10-4.8-1.7-8-5-8-10V5.5z"/>',
    '<path fill="#35ddb2" d="m8.1 11.8 2.3 2.3 5.6-6 1.4 1.4-7 7.4-3.7-3.7z"/>',
    "</svg>",
  ].join("");
}

function severityOf(target) {
  const order = ["critical", "high", "medium", "low"];
  return order.find((severity) => target.evidence.some((item) => item.severity === severity)) ?? "auto";
}

function severityLabel(severity) {
  return {
    critical: "阻断",
    high: "高风险",
    medium: "中风险",
    low: "低风险",
    auto: "规则通过",
  }[severity];
}

function restoreDecisions() {
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    state.decisions = new Map(records.map((item) => [item.targetId, item]));
  } catch {
    state.decisions = new Map();
  }
}

function persistDecisions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.decisions.values()]));
}

function pageShell(content) {
  const evaluation = state.evaluation;
  const manifest = createReleaseManifest(evaluation, state.decisions);
  const reviewTotal = evaluation.summary.reviewCount;
  const completed = [...state.decisions.values()].filter((item) =>
    evaluation.targets.some((target) => target.id === item.targetId && target.reviewRequired),
  ).length;
  const remoteUnavailable = state.aiStatus.requestedMode === "remote" && !state.aiStatus.remoteReady;
  const aiMode = state.aiStatus.mode === "remote"
    ? "Remote · server"
    : remoteUnavailable
      ? "Mock · remote unavailable"
      : "Mock · deterministic";
  const nav = [
    { id: "queue", index: "01", title: "风险队列", meta: reviewTotal + " 待处理" },
    { id: "review", index: "02", title: "目标复核", meta: completed + "/" + reviewTotal },
    { id: "release", index: "03", title: "版本放行", meta: manifest.status },
  ];
  const navHtml = nav
    .map((item) =>
      [
        '<button class="nav-button ' + (state.view === item.id ? "active" : "") + '" data-nav="' + item.id + '"' + (state.view === item.id ? ' aria-current="page"' : "") + '>',
        '<span class="nav-index">' + item.index + "</span>",
        '<span class="nav-title">' + item.title + "</span>",
        '<span class="nav-meta">' + item.meta + "</span>",
        "</button>",
      ].join(""),
    )
    .join("");

  return [
    '<div class="app-shell">',
    '<header class="topbar">',
    '<div class="brand"><div class="brand-mark">' + shieldIcon() + "</div>",
    '<div><div class="brand-name">LabelGuard</div><div class="brand-caption">Annotation quality control</div></div></div>',
    '<div class="topbar-right">',
    '<div class="batch-chip"><span>批次</span><strong>' + escapeHtml(evaluation.batch.id) + "</strong></div>",
    '<div class="mode-chip" title="' + escapeHtml(state.aiStatus.transport) + '"><span class="live-dot"></span><strong>' + escapeHtml(aiMode) + "</strong></div>",
    "</div></header>",
    '<nav class="sidebar" aria-label="QA 工作流"><div class="nav-label">QA Workflow</div>',
    navHtml,
    '<div class="sidebar-note"><strong>证据边界</strong><p>规则负责检测事实；模型输出只做分歧信号；人工决策决定路由与放行。</p></div>',
    "</nav>",
    '<main class="workspace">' + content + "</main>",
    "</div>",
  ].join("");
}

function metricCard(label, value, foot, accent = false) {
  return [
    '<article class="metric-card ' + (accent ? "accent" : "") + '">',
    '<div class="metric-label">' + escapeHtml(label) + "</div>",
    '<div class="metric-value">' + escapeHtml(value) + "</div>",
    '<div class="metric-foot">' + escapeHtml(foot) + "</div>",
    "</article>",
  ].join("");
}

function renderQueue() {
  const evaluation = state.evaluation;
  const targets = [...evaluation.targets].sort((a, b) => b.riskScore - a.riskScore);
  const rows = targets
    .map((target) => {
      const severity = severityOf(target);
      return [
        "<tr>",
        '<td><div class="target-cell"><strong>' + escapeHtml(target.id) + "</strong><span>" + escapeHtml(target.trackId) + "</span></div></td>",
        "<td>" + escapeHtml(CLASS_LABELS[target.class] ?? target.class) + "</td>",
        "<td>" + escapeHtml(target.frameId) + "</td>",
        '<td><span class="severity-pill ' + severity + '">' + severityLabel(severity) + "</span></td>",
        '<td><div class="risk-score"><strong>' + target.riskScore + '</strong><span class="risk-track"><span class="risk-fill" style="width:' + target.riskScore + '%"></span></span></div></td>',
        "<td>" + target.evidence.length + "</td>",
        "<td>" + escapeHtml(ROUTE_LABELS[target.route] ?? target.route) + "</td>",
        '<td><button class="button" data-open-target="' + escapeHtml(target.id) + '">' + (target.reviewRequired ? "复核" : "查看") + "</button></td>",
        "</tr>",
      ].join("");
    })
    .join("");

  const ruleGroups = [
    { key: "geometry", icon: "G", name: "几何边界", desc: "Box / 尺寸 / 图像范围" },
    { key: "projection", icon: "P", name: "投影关联", desc: "3D 投影与 2D 标注" },
    { key: "temporal", icon: "T", name: "时序连续性", desc: "Track / 速度 / 时间戳" },
    { key: "model_disagreement", icon: "M", name: "模型分歧", desc: "第二意见，不作为真值" },
    { key: "sensor_support", icon: "S", name: "传感器支持", desc: "LiDAR 点数与可见性" },
  ];
  const ruleHtml = ruleGroups
    .map((group) => {
      const count = evaluation.evidence.filter((item) => item.category === group.key).length;
      return [
        '<div class="rule-item"><span class="rule-icon">' + group.icon + "</span><div>",
        "<strong>" + group.name + "</strong><span>" + group.desc + "</span></div>",
        '<span class="severity-pill ' + (count > 0 ? "medium" : "auto") + '">' + count + "</span></div>",
      ].join("");
    })
    .join("");

  const content = [
    '<div class="page-head"><div><div class="eyebrow">Batch inspection</div><h1>标注风险队列</h1>',
    '<p class="page-description">确定性规则已绑定批次、标签版本与目标证据。</p></div>',
    '<div class="button-row"><button class="button" data-reset>重置演示</button><button class="button primary" data-nav="review">进入人工复核</button></div></div>',
    '<section class="metrics">',
    metricCard("目标总数", evaluation.summary.targetCount, evaluation.summary.frameCount + " frames"),
    metricCard("需人工复核", evaluation.summary.reviewCount, "按最高风险排序", true),
    metricCard("自动通过", evaluation.summary.autoPassCount, "仍进入统计抽检"),
    metricCard("风险证据", evaluation.summary.evidenceCount, evaluation.ruleVersion),
    "</section>",
    '<section class="content-grid">',
    '<div class="panel"><div class="panel-head"><span class="panel-title">Target / Track 风险</span><span class="panel-meta">' + escapeHtml(evaluation.batch.candidateLabelVersion) + "</span></div>",
    '<table class="data-table" aria-label="目标与轨迹风险队列"><thead><tr><th>Target</th><th>类别</th><th>Frame</th><th>等级</th><th>风险分</th><th>证据</th><th>路由</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>",
    '<aside class="panel"><div class="panel-head"><span class="panel-title">规则运行</span><span class="status-pill ready">可复现</span></div><div class="panel-body"><div class="rule-list">' + ruleHtml + "</div></div></aside>",
    "</section>",
  ].join("");
  return pageShell(content);
}

function overlay(box, className, label) {
  if (!box) return "";
  const frame = state.evaluation.batch.frameSize;
  const style = [
    "left:" + ((box.x / frame.width) * 100).toFixed(3) + "%",
    "top:" + ((box.y / frame.height) * 100).toFixed(3) + "%",
    "width:" + ((box.width / frame.width) * 100).toFixed(3) + "%",
    "height:" + ((box.height / frame.height) * 100).toFixed(3) + "%",
  ].join(";");
  return '<div class="box-overlay ' + className + '" style="' + style + '" aria-hidden="true"><span class="box-label">' + escapeHtml(label) + "</span></div>";
}

function renderAssistant(target) {
  const response = state.assistant.get(target.id) ?? createMockAssistant(target);
  const loading = state.assistantLoading.has(target.id);
  const steps = response.nextSteps.map((item) => "<li>" + escapeHtml(item) + "</li>").join("");
  const citations = response.evidenceIds
    .map((id) => '<span class="citation">' + escapeHtml(id) + "</span>")
    .join("");
  return [
    '<div class="assistant-card"><div class="assistant-title"><span>AI 证据助手</span>',
    '<button class="button" data-assistant-refresh ' + (loading ? "disabled" : "") + ">" + (loading ? "处理中…" : "重新整理") + "</button></div>",
    "<p>" + escapeHtml(response.summary) + "</p>",
    "<p><strong>复核问题：</strong>" + escapeHtml(response.reviewQuestion) + "</p>",
    steps ? "<ul>" + steps + "</ul>" : "",
    '<div class="citation-list">' + citations + "</div>",
    '<p style="margin-top:8px;color:#7189a1">' + escapeHtml(response.limitation) + "</p>",
    "</div>",
  ].join("");
}

function renderReview() {
  const evaluation = state.evaluation;
  const reviewTargets = evaluation.targets
    .filter((target) => target.reviewRequired)
    .sort((a, b) => b.riskScore - a.riskScore);
  if (!state.selectedId || !evaluation.targets.some((item) => item.id === state.selectedId)) {
    state.selectedId = reviewTargets[0]?.id ?? evaluation.targets[0]?.id;
  }
  const target = evaluation.targets.find((item) => item.id === state.selectedId);
  const currentDecision = state.decisions.get(target.id);
  const queueHtml = reviewTargets
    .map((item) => {
      const decision = state.decisions.get(item.id);
      const severity = severityOf(item);
      return [
        '<button class="queue-item ' + (item.id === target.id ? "active" : "") + '" data-select-target="' + escapeHtml(item.id) + '" aria-pressed="' + (item.id === target.id) + '">',
        '<div class="queue-item-top"><strong>' + escapeHtml(item.id) + '</strong><span class="severity-pill ' + severity + '">' + severityLabel(severity) + "</span></div>",
        "<p>" + escapeHtml(CLASS_LABELS[item.class] ?? item.class) + " · " + escapeHtml(item.frameId) + "</p>",
        '<div class="queue-item-foot"><span>' + item.evidence.length + " evidence</span><span>" + (decision ? DECISION_LABELS[decision.decision] : "待复核") + "</span></div>",
        "</button>",
      ].join("");
    })
    .join("");

  const trackTargets = evaluation.targets
    .filter((item) => item.trackId === target.trackId)
    .sort((a, b) => a.timestampMs - b.timestampMs);
  const timeline = trackTargets
    .map((item) =>
      '<button class="timeline-frame ' + (item.id === target.id ? "active" : "") + '" data-select-target="' + escapeHtml(item.id) + '" aria-pressed="' + (item.id === target.id) + '">' +
      escapeHtml(item.frameId.replace("FRAME-", "F-")) + "<br>" + item.timestampMs + " ms</button>",
    )
    .join("");
  const evidenceHtml = target.evidence.length
    ? target.evidence
      .map((item) =>
        [
          '<article class="evidence-card"><div class="evidence-top"><strong>' + escapeHtml(item.title) + '</strong><span class="severity-pill ' + item.severity + '">' + severityLabel(item.severity) + "</span></div>",
          "<p>" + escapeHtml(item.detail) + "</p>",
          '<div class="evidence-values"><div><span>Observed</span><code>' + escapeHtml(item.observed) + '</code></div><div><span>Expected</span><code>' + escapeHtml(item.expected) + "</code></div></div>",
          '<div class="citation-list"><span class="citation">' + escapeHtml(item.id) + '</span><span class="citation">' + escapeHtml(item.source) + "</span></div></article>",
        ].join(""),
      )
      .join("")
    : '<div class="empty">当前目标未命中风险规则。</div>';
  const modelBox = target.modelCandidate?.box2d;
  const decisionNotice = currentDecision
    ? '<div class="decision-current">当前：' + DECISION_LABELS[currentDecision.decision] + " → " + escapeHtml(ROUTE_LABELS[currentDecision.route] ?? currentDecision.route) + "<br>" + escapeHtml(currentDecision.reason) + "</div>"
    : "";

  const content = [
    '<section class="review-layout">',
    '<aside class="panel"><div class="panel-head"><span class="panel-title">人工队列</span><span class="panel-meta">' + state.decisions.size + "/" + reviewTargets.length + "</span></div><div class=\"review-queue\">" + queueHtml + "</div></aside>",
    '<section class="panel viewer-panel"><div class="panel-head"><span class="panel-title">' + escapeHtml(target.id) + " · " + escapeHtml(target.trackId) + '</span><span class="route-pill">' + escapeHtml(ROUTE_LABELS[target.route]) + "</span></div>",
    '<div class="viewer-wrap"><div class="viewer"><img src="' + escapeHtml(target.image) + '" alt="合成演示帧 ' + escapeHtml(target.frameId) + '，当前复核目标 ' + escapeHtml(target.id) + '">',
    overlay(target.box2d, "annotation", "LABEL " + target.id),
    overlay(target.projection2d, "projection", "3D PROJECTION"),
    overlay(modelBox, "model", "MODEL " + (target.modelCandidate?.score?.toFixed(2) ?? "")),
    '</div><div class="viewer-toolbar"><div class="legend">',
    '<span class="legend-item"><span class="legend-swatch" style="background:var(--mint)"></span>人工标签</span>',
    '<span class="legend-item"><span class="legend-swatch" style="background:var(--amber)"></span>3D 投影</span>',
    '<span class="legend-item"><span class="legend-swatch" style="background:var(--violet)"></span>模型候选</span>',
    '</div><span class="frame-meta">' + escapeHtml(target.frameId) + " · " + target.timestampMs + " ms</span></div></div>",
    '<div class="timeline"><div class="timeline-label">Track timeline</div><div class="timeline-track">' + timeline + "</div></div>",
    '<div class="target-facts">',
    '<div class="fact"><span>Class</span><strong>' + escapeHtml(CLASS_LABELS[target.class] ?? target.class) + "</strong></div>",
    '<div class="fact"><span>LiDAR</span><strong>' + target.lidarPoints + " points</strong></div>",
    '<div class="fact"><span>Velocity</span><strong>' + target.velocityMps.toFixed(1) + " m/s</strong></div>",
    '<div class="fact"><span>Model</span><strong>' + escapeHtml(target.modelCandidate ? target.modelCandidate.class + " " + target.modelCandidate.score.toFixed(2) : "No candidate") + "</strong></div>",
    "</div></section>",
    '<aside class="panel review-side"><div class="panel-head"><span class="panel-title">风险证据</span><span class="panel-meta">' + target.evidence.length + " items</span></div><div class=\"panel-body\">",
    '<div class="evidence-stack">' + evidenceHtml + "</div>",
    renderAssistant(target),
    '<div class="decision-box"><label for="decision-reason">人工判断依据（必填）</label>',
    '<textarea id="decision-reason" placeholder="只记录可观察事实与规范依据…">' + escapeHtml(currentDecision?.reason ?? "") + "</textarea>",
    '<div class="decision-actions">',
    '<button class="decision-button pass" data-decision="pass">通过</button>',
    '<button class="decision-button reject" data-decision="reject">驳回</button>',
    '<button class="decision-button repair" data-decision="repair">返修</button>',
    "</div>" + decisionNotice + "</div></div></aside>",
    "</section>",
  ].join("");
  return pageShell(content);
}

function renderRelease() {
  const evaluation = state.evaluation;
  const manifest = createReleaseManifest(evaluation, state.decisions);
  const statusReady = manifest.status === "READY";
  const requiredTargets = evaluation.targets.filter((target) => target.reviewRequired);
  const rows = requiredTargets
    .map((target) => {
      const decision = state.decisions.get(target.id);
      return [
        "<tr>",
        '<td><div class="target-cell"><strong>' + escapeHtml(target.id) + "</strong><span>" + escapeHtml(target.trackId) + "</span></div></td>",
        "<td>" + escapeHtml(target.frameId) + "</td>",
        "<td>" + (decision ? escapeHtml(DECISION_LABELS[decision.decision]) : '<span class="severity-pill medium">待处理</span>') + "</td>",
        "<td>" + escapeHtml(decision ? ROUTE_LABELS[decision.route] : ROUTE_LABELS[target.route]) + "</td>",
        "<td>" + escapeHtml(decision?.reason ?? "—") + "</td>",
        "</tr>",
      ].join("");
    })
    .join("");
  const unresolved = manifest.unresolved.map((id) => {
    const target = evaluation.targets.find((item) => item.id === id);
    return '<div class="blocker-item"><strong>' + escapeHtml(id) + '</strong><p>尚未完成人工复核 · ' + escapeHtml(target?.frameId) + "</p></div>";
  });
  const blockers = manifest.blockers.map((item) =>
    '<div class="blocker-item"><strong>' + escapeHtml(item.targetId) + " · " + escapeHtml(DECISION_LABELS[item.decision]) + '</strong><p>' + escapeHtml(item.reason) + " → " + escapeHtml(ROUTE_LABELS[item.route]) + "</p></div>",
  );
  const blockerHtml = [...unresolved, ...blockers].join("") || '<div class="blocker-item"><strong>全部门禁通过</strong><p>候选版本具备当前 Demo 规则范围内的放行证据。</p></div>';

  const content = [
    '<div class="page-head"><div><div class="eyebrow">Release gate</div><h1>QA 决策与版本放行</h1>',
    '<p class="page-description">放行状态由规则与人工决策计算，AI 无权修改。</p></div>',
    '<div class="button-row"><button class="button" data-nav="review">返回复核</button><button class="button primary" data-download-manifest>下载决策清单</button></div></div>',
    '<section class="release-grid"><div class="panel">',
    '<div class="release-hero"><div class="release-state"><div class="release-icon ' + (statusReady ? "" : "blocked") + '">' + (statusReady ? "✓" : "!") + "</div><div>",
    "<h2>" + (statusReady ? "READY · 可发布候选版本" : "BLOCKED · 暂不可放行") + "</h2>",
    "<p>" + escapeHtml(evaluation.batch.candidateLabelVersion) + " · " + escapeHtml(manifest.manifestHash) + "</p></div></div>",
    '<span class="status-pill ' + (statusReady ? "ready" : "blocked") + '">' + manifest.status + "</span></div>",
    '<table class="data-table" aria-label="标签版本人工复核决策"><thead><tr><th>Target</th><th>Frame</th><th>决策</th><th>路由</th><th>依据</th></tr></thead><tbody>' + rows + "</tbody></table>",
    "</div>",
    '<aside><div class="panel" style="margin-bottom:16px"><div class="panel-head"><span class="panel-title">放行门禁</span><span class="panel-meta">' + manifest.counts.unresolved + " unresolved</span></div><div class=\"panel-body\"><div class=\"blocker-list\">" + blockerHtml + "</div></div></div>",
    '<div class="panel"><div class="panel-head"><span class="panel-title">Release manifest</span><span class="panel-meta">JSON · deterministic</span></div>',
    '<pre class="manifest-code">' + escapeHtml(JSON.stringify(manifest, null, 2)) + "</pre></div></aside></section>",
  ].join("");
  return pageShell(content);
}

function render() {
  if (!state.evaluation) {
    root.innerHTML = '<div class="loading" role="status" aria-live="polite">正在载入公开 Demo 批次…</div>';
    return;
  }
  if (state.view === "review") root.innerHTML = renderReview();
  else if (state.view === "release") root.innerHTML = renderRelease();
  else root.innerHTML = renderQueue();
  bindEvents();
}

function showToast(message, error = false) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast" + (error ? " error" : "");
  toast.setAttribute("role", error ? "alert" : "status");
  toast.setAttribute("aria-live", error ? "assertive" : "polite");
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

async function requestAssistant(target) {
  state.assistantLoading.add(target.id);
  render();
  try {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        batchId: state.evaluation.batch.id,
        target: {
          id: target.id,
          trackId: target.trackId,
          class: target.class,
          frameId: target.frameId,
          evidence: target.evidence,
        },
      }),
    });
    if (!response.ok) throw new Error("assistant endpoint unavailable");
    const result = await response.json();
    const validation = validateAssistantResponse(result, target);
    if (!validation.valid) throw new Error("assistant cited evidence outside the allowed set");
    state.assistant.set(target.id, result);
    state.aiStatus = {
      mode: result.mode ?? "mock",
      transport: result.transport ?? "server",
      requestedMode: result.mode ?? state.aiStatus.requestedMode,
      remoteReady: (result.mode ?? "mock") === "remote",
    };
  } catch {
    state.assistant.set(target.id, createMockAssistant(target));
    state.aiStatus = {
      ...state.aiStatus,
      mode: "mock",
      transport: "client-deterministic",
      remoteReady: false,
    };
    showToast("AI 服务调用失败；当前结果来自确定性 Mock，未计为远程成功。", true);
  } finally {
    state.assistantLoading.delete(target.id);
    render();
  }
}

function downloadManifest() {
  const manifest = createReleaseManifest(state.evaluation, state.decisions);
  const blob = new Blob([JSON.stringify(manifest, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = state.evaluation.batch.candidateLabelVersion + "-qa-manifest.json";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.nav;
      render();
    });
  });
  document.querySelectorAll("[data-open-target]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.openTarget;
      state.view = "review";
      render();
    });
  });
  document.querySelectorAll("[data-select-target]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.selectTarget;
      render();
    });
  });
  document.querySelectorAll("[data-decision]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = state.evaluation.targets.find((item) => item.id === state.selectedId);
      const reason = document.querySelector("#decision-reason")?.value ?? "";
      try {
        const decision = createDecision(target, button.dataset.decision, reason);
        state.decisions.set(target.id, decision);
        persistDecisions();
        showToast("已记录：" + DECISION_LABELS[decision.decision] + " → " + ROUTE_LABELS[decision.route]);
        render();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
  document.querySelector("[data-assistant-refresh]")?.addEventListener("click", () => {
    const target = state.evaluation.targets.find((item) => item.id === state.selectedId);
    requestAssistant(target);
  });
  document.querySelector("[data-download-manifest]")?.addEventListener("click", downloadManifest);
  document.querySelector("[data-reset]")?.addEventListener("click", () => {
    state.decisions.clear();
    state.assistant.clear();
    localStorage.removeItem(STORAGE_KEY);
    state.selectedId = state.evaluation.targets.find((item) => item.reviewRequired)?.id;
    showToast("演示状态已重置。");
    render();
  });
}

async function loadAiStatus() {
  try {
    const response = await fetch("/api/status", { headers: { accept: "application/json" } });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return;
    const status = await response.json();
    state.aiStatus = {
      mode: status.mode ?? "mock",
      transport: status.transport ?? "server",
      requestedMode: status.requestedMode ?? status.mode ?? "mock",
      remoteReady: status.remoteReady ?? status.mode === "remote",
    };
  } catch {
    state.aiStatus = {
      mode: "mock",
      transport: "client-deterministic",
      requestedMode: "mock",
      remoteReady: false,
    };
  }
}

async function init() {
  root.innerHTML = '<div class="loading" role="status" aria-live="polite">正在载入公开 Demo 批次…</div>';
  try {
    const response = await fetch("/demo/labelguard-batch-v1.json");
    if (!response.ok) throw new Error("公开 Demo 批次加载失败（HTTP " + response.status + "）");
    state.payload = await response.json();
    state.evaluation = evaluateBatch(state.payload);
    restoreDecisions();
    state.selectedId = state.evaluation.targets.find((item) => item.reviewRequired)?.id;
    await loadAiStatus();
    render();
  } catch (error) {
    root.innerHTML = '<div class="loading" role="alert">载入失败：' + escapeHtml(error.message) + '<button class="button" type="button" data-retry-load>重新载入</button></div>';
    root.querySelector("[data-retry-load]")?.addEventListener("click", init);
  }
}

init();
