const state = {
  projects: [],
  selectedProjectId: null,
  selectedProject: null,
  logs: [],
  lastError: null,
};

const stageOrder = ["script", "storyboard", "voiceover", "subtitles", "cover", "publish_package"];

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || data?.error || "请求失败";
    const error = new Error(message);
    error.code = data?.error?.code;
    error.details = data?.error?.details;
    throw error;
  }
  return data.data;
}

function fmtJson(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

function statusClass(value) {
  return `status-${String(value).replace(/[^a-z0-9_\-]/gi, "_")}`;
}

function setHealth(ok) {
  const badge = document.querySelector("#healthBadge");
  badge.textContent = ok ? "本地服务在线" : "服务不可用";
}

async function loadHealth() {
  try {
    await api("/api/health");
    setHealth(true);
  } catch {
    setHealth(false);
  }
}

async function loadProjects(selectId) {
  try {
    const data = await api("/api/projects");
    const projects = Array.isArray(data?.projects) ? data.projects : [];
    state.projects = projects;
    if (!projects.some((project) => project?.id === state.selectedProjectId)) {
      state.selectedProjectId = null;
      state.selectedProject = null;
      state.logs = [];
    }
    renderProjectList();
    renderProjectView();
    const targetId = selectId || state.selectedProjectId || projects[0]?.id;
    if (targetId) {
      await loadProject(targetId);
    }
  } catch (error) {
    state.projects = [];
    state.selectedProjectId = null;
    state.selectedProject = null;
    state.logs = [];
    state.lastError = `${error.code || "REQUEST_ERROR"}: ${error.message}`;
    renderProjectList();
    renderProjectView();
  }
}

async function loadProject(projectId) {
  try {
    const data = await api(`/api/projects/${projectId}`);
    state.selectedProjectId = projectId;
    state.selectedProject = data?.project || null;
    state.logs = Array.isArray(data?.logs) ? data.logs : [];
  } catch (error) {
    state.selectedProjectId = null;
    state.selectedProject = null;
    state.logs = [];
    state.lastError = `${error.code || "REQUEST_ERROR"}: ${error.message}`;
  }
  renderProjectList();
  renderProjectView();
}

function renderProjectList() {
  const container = document.querySelector("#projectList");
  container.innerHTML = "";
  if (!state.projects.length) {
    container.innerHTML = '<div class="muted">暂无项目</div>';
    return;
  }
  state.projects.forEach((project) => {
    const item = document.createElement("button");
    item.className = `project-item ${project.id === state.selectedProjectId ? "active" : ""}`;
    item.innerHTML = `
      <div><strong>${project.name}</strong></div>
      <div class="muted">${project.brief.topic || "未填写主题"}</div>
      <div class="status-pill ${statusClass(project.status)}">${project.status}</div>
    `;
    item.addEventListener("click", () => loadProject(project.id));
    container.appendChild(item);
  });
}

function renderProjectView() {
  const empty = document.querySelector("#projectEmpty");
  const view = document.querySelector("#projectView");
  if (!state.selectedProject) {
    empty.classList.remove("hidden");
    view.classList.add("hidden");
    return;
  }

  empty.classList.add("hidden");
  view.classList.remove("hidden");

  const project = state.selectedProject;
  document.querySelector("#projectHero").innerHTML = `
    <div>
      <h2>${project.name}</h2>
      <p class="muted">项目 ID：${project.id}</p>
      <p>${project.brief.manualPublishRule}</p>
    </div>
    <div>
      <div class="status-pill ${statusClass(project.status)}">${project.status}</div>
      <div class="muted">最近更新：${project.updatedAt}</div>
    </div>
  `;

  document.querySelector("#briefView").innerHTML = `
    <div class="meta-grid">
      <div><strong>主题</strong><div class="muted">${project.brief.topic || "-"}</div></div>
      <div><strong>受众</strong><div class="muted">${project.brief.audience || "-"}</div></div>
      <div><strong>风格</strong><div class="muted">${project.brief.style || "-"}</div></div>
      <div><strong>时长</strong><div class="muted">${project.brief.durationSeconds || "-"} 秒</div></div>
      <div><strong>目标</strong><div class="muted">${project.brief.goal || "-"}</div></div>
      <div><strong>备注</strong><div class="muted">${project.brief.notes || "-"}</div></div>
    </div>
  `;

  const lastRun = project.workflow.history?.[0];
  const bridgeRun = project.runtimeBridgeRuns?.[0];
  document.querySelector("#workflowView").innerHTML = `
      ${lastRun ? `<div class="record-item">
        <div><strong>最近运行：</strong>${lastRun.id}</div>
        <div class="muted">${lastRun.trigger} / ${lastRun.state}</div>
        <div class="muted">步骤：${lastRun.steps.map((item) => `${item.stageLabel}#V${item.producedVersion}`).join(" → ")}</div>
      </div>` : '<div class="muted">尚未开始生成。</div>'}
      ${bridgeRun ? `<div class="record-item"><div><strong>最近沙箱桥接：</strong>${bridgeRun.id}</div><div class="muted">exit=${bridgeRun.exitCode} / ${bridgeRun.status}</div><div class="code-box">${fmtJson(bridgeRun.result)}</div></div>` : ""}
    `;

  document.querySelector("#exportView").textContent = project.exportPackages?.length
    ? fmtJson(project.exportPackages[0])
    : "暂无发布素材包。所有阶段产物人工确认后，可在此生成。";

  document.querySelector("#mediaOutputView").textContent = project.mediaOutputs?.length
    ? fmtJson(project.mediaOutputs[0])
    : "暂无成片导出记录。可先确认所有阶段产物后生成 stub 成片导出记录。";

  document.querySelector("#demoChecklistView").innerHTML = `
    <h3>演示/验收提示</h3>
    <div class="muted">建议演示顺序：桥接驱动生成 → 确认阶段产物 → 成片导出 → 发布包 → 人工交接页 → 本机安全打开。</div>
    <div class="code-box">${fmtJson({
      bridgeRunId: project.runtimeBridgeRuns?.[0]?.id,
      exportBundle: project.mediaOutputs?.[0]?.bundleIndexPath,
      handoffHtml: project.publishing?.handoffRecords?.[0]?.checklistHtmlPath,
      acceptanceChecklist: project.runtimeBridgeRuns?.length ? `data/projects/${project.id}/runtime-bridge/acceptance-checklist.md` : null,
    })}</div>
  `;

  const handoff = project.publishing?.handoffRecords?.[0];
  const publishPackage = project.exportPackages?.[0] || {};
  document.querySelector("#publishStatusView").innerHTML = `
    ${state.lastError ? `<div class="error-banner">${state.lastError}</div>` : ""}
    <div class="publish-box">
      <div><strong>发布状态：</strong>${project.publishing?.status || "not_ready"}</div>
      <div class="muted">manualPublishOnly: ${String(project.publishing?.manualPublishOnly)}</div>
      <div class="muted">最新发布包版本：${project.publishing?.latestPackageVersion || "-"}</div>
      <div class="muted">最新成片导出版本：${project.publishing?.latestMediaOutputVersion || "-"}</div>
      <div class="muted">最新人工交接版本：${project.publishing?.latestHandoffVersion || "-"}</div>
      <p>系统只会生成交接记录与清单，不会自动直发到抖音。</p>
      <div class="code-box">${fmtJson({ title: publishPackage.title, description: publishPackage.description, hashtags: publishPackage.hashtags })}</div>
      <div class="code-box">${handoff ? fmtJson(handoff) : "暂无人工发布交接记录。"}</div>
    </div>
  `;

  renderArtifacts(project);
  renderAssets(project);
  renderConfirmations(project);
  renderLogs(state.logs);
}

function renderArtifacts(project) {
  const container = document.querySelector("#artifactGrid");
  container.innerHTML = "";
  stageOrder.forEach((stageKey) => {
    const artifact = project.artifacts[stageKey];
    const card = document.createElement("div");
    card.className = "artifact-card";
    card.innerHTML = `
      <div class="section-title">
        <h3>${artifact.label}</h3>
        <span class="status-pill ${statusClass(artifact.status)}">${artifact.status}</span>
      </div>
      <div class="muted">当前版本：V${artifact.currentVersion || 0} / 已确认：${artifact.confirmedVersion ? `V${artifact.confirmedVersion}` : "未确认"}</div>
      <div class="muted">最近 Agent：${artifact.lastAgent || "-"}</div>
      <div class="artifact-meta">
        <span class="status-pill ${artifact.locked ? 'status-confirmed' : 'status-draft'}">${artifact.locked ? '已冻结' : '可编辑'}</span>
        <span class="status-pill ${statusClass(artifact.reviewState || 'idle')}">${artifact.reviewState || 'idle'}</span>
      </div>
      ${artifact.invalidatedBy ? `<div class="artifact-warning">上游变更导致待复核：${artifact.invalidatedBy}</div>` : ''}
      <textarea data-stage-editor="${stageKey}">${fmtJson(artifact.currentContent)}</textarea>
      <div class="artifact-actions">
        <button data-action="edit" data-stage="${stageKey}" class="secondary">保存编辑版本</button>
        <button data-action="confirm" data-stage="${stageKey}">确认当前版本</button>
        <button data-action="regenerate" data-stage="${stageKey}" class="secondary">重生此阶段及下游</button>
        ${artifact.locked ? `<button data-action="unlock-regenerate" data-stage="${stageKey}" class="secondary">解冻并重生</button>` : ''}
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const stage = button.dataset.stage;
      const action = button.dataset.action;
      try {
        state.lastError = null;
        if (action === "edit") {
          const content = document.querySelector(`[data-stage-editor="${stage}"]`).value;
          await api(`/api/projects/${project.id}/artifacts/${stage}/edit`, {
            method: "POST",
            body: JSON.stringify({ content, editor: "LocalCreator", note: "从工作台保存编辑" }),
          });
        }
        if (action === "confirm") {
          await api(`/api/projects/${project.id}/artifacts/${stage}/confirm`, {
            method: "POST",
            body: JSON.stringify({ reviewer: "LocalCreator", note: "已人工确认" }),
          });
        }
        if (action === "regenerate") {
          await api(`/api/projects/${project.id}/artifacts/${stage}/regenerate`, {
            method: "POST",
            body: JSON.stringify({ reason: `工作台触发 ${stage} 重生` }),
          });
        }
        if (action === "unlock-regenerate") {
          await api(`/api/projects/${project.id}/artifacts/${stage}/regenerate`, {
            method: "POST",
            body: JSON.stringify({ reason: `工作台触发 ${stage} 解冻重生`, forceUnlock: true }),
          });
        }
        await loadProjects(project.id);
      } catch (error) {
        state.lastError = `${error.code || "REQUEST_ERROR"}: ${error.message}`;
        renderProjectView();
        alert(error.message);
      }
    });
  });
}

function renderAssets(project) {
  const container = document.querySelector("#assetList");
  if (!project.assets.length) {
    container.innerHTML = '<div class="muted">尚未登记本地素材。</div>';
    return;
  }
  container.innerHTML = project.assets
    .map(
      (asset) => `
      <div class="asset-item">
        <div><strong>${asset.name}</strong> <span class="muted">${asset.kind}</span></div>
        <div class="muted">${asset.path || "未填写路径"}</div>
        <div class="muted">${asset.notes || "无备注"}</div>
      </div>
    `,
    )
    .join("");
}

function renderConfirmations(project) {
  const container = document.querySelector("#confirmationList");
  if (!project.confirmationRecords.length) {
    container.innerHTML = '<div class="muted">暂无确认记录。</div>';
    return;
  }
  container.innerHTML = project.confirmationRecords
    .map(
      (record) => `
      <div class="record-item">
        <div><strong>${record.stageLabel}</strong> / V${record.version}</div>
        <div class="muted">${record.reviewer} · ${record.createdAt}</div>
        <div>${record.note || "-"}</div>
      </div>
    `,
    )
    .join("");
}

function renderLogs(logs) {
  const container = document.querySelector("#logList");
  if (!logs.length) {
    container.innerHTML = '<div class="muted">暂无审计日志。</div>';
    return;
  }
  container.innerHTML = logs
    .map(
      (log) => `
      <div class="log-item">
        <div><strong>${log.type}</strong></div>
        <div class="muted">${log.timestamp}</div>
        <div class="code-box">${fmtJson(log.payload)}</div>
      </div>
    `,
    )
    .join("");
}

document.querySelector("#createProjectForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const payload = Object.fromEntries(form.entries());
  payload.durationSeconds = Number(payload.durationSeconds || 30);
  try {
    const data = await api("/api/projects", { method: "POST", body: JSON.stringify(payload) });
    state.lastError = null;
    formElement?.reset();
    await loadProjects(data.project.id);
  } catch (error) {
    state.lastError = `${error.code || "REQUEST_ERROR"}: ${error.message}`;
    renderProjectView();
    alert(error.message);
  }
});

document.querySelector("#refreshProjectsBtn").addEventListener("click", () => loadProjects());

document.querySelector("#generateAllBtn").addEventListener("click", async () => {
  if (!state.selectedProject) return;
  try {
    state.lastError = null;
    await api(`/api/projects/${state.selectedProject.id}/generate`, {
      method: "POST",
      body: JSON.stringify({ reason: "工作台发起全流程草案生成" }),
    });
    await loadProjects(state.selectedProject.id);
  } catch (error) {
    state.lastError = `${error.code || "REQUEST_ERROR"}: ${error.message}`;
    renderProjectView();
    alert(error.message);
  }
});

document.querySelector("#generateWithBridgeBtn").addEventListener("click", async () => {
  if (!state.selectedProject) return;
  try {
    state.lastError = null;
    await api(`/api/projects/${state.selectedProject.id}/generate-with-bridge`, {
      method: "POST",
      body: JSON.stringify({ prompt: "Generate main-flow planning for this project and return guidance for artifact creation." }),
    });
    await loadProjects(state.selectedProject.id);
  } catch (error) {
    state.lastError = `${error.code || "REQUEST_ERROR"}: ${error.message}`;
    renderProjectView();
    alert(error.message);
  }
});

document.querySelector("#createMediaExportBtn").addEventListener("click", async () => {
  if (!state.selectedProject) return;
  try {
    state.lastError = null;
    await api(`/api/projects/${state.selectedProject.id}/media-export`, {
      method: "POST",
      body: JSON.stringify({ notes: "工作台触发 stub 成片导出" }),
    });
    await loadProjects(state.selectedProject.id);
  } catch (error) {
    state.lastError = `${error.code || "REQUEST_ERROR"}: ${error.message}`;
    renderProjectView();
    alert(error.message);
  }
});

document.querySelector("#runSandboxBridgeBtn").addEventListener("click", async () => {
  if (!state.selectedProject) return;
  try {
    state.lastError = null;
    await api(`/api/projects/${state.selectedProject.id}/runtime-bridge-run`, {
      method: "POST",
      body: JSON.stringify({ prompt: "Validate isolated multi-agent sandbox bridge for this project snapshot." }),
    });
    await loadProjects(state.selectedProject.id);
  } catch (error) {
    state.lastError = `${error.code || "REQUEST_ERROR"}: ${error.message}`;
    renderProjectView();
    alert(error.message);
  }
});

document.querySelector("#prepareExportBtn").addEventListener("click", async () => {
  if (!state.selectedProject) return;
  try {
    state.lastError = null;
    await api(`/api/projects/${state.selectedProject.id}/export-package`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await loadProjects(state.selectedProject.id);
  } catch (error) {
    state.lastError = `${error.code || "REQUEST_ERROR"}: ${error.message}`;
    renderProjectView();
    alert(error.message);
  }
});

document.querySelector("#recordHandoffBtn").addEventListener("click", async () => {
  if (!state.selectedProject) return;
  const form = document.querySelector("#handoffForm");
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    state.lastError = null;
    await api(`/api/projects/${state.selectedProject.id}/manual-publish-handoff`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await loadProjects(state.selectedProject.id);
  } catch (error) {
    state.lastError = `${error.code || "REQUEST_ERROR"}: ${error.message}`;
    renderProjectView();
    alert(error.message);
  }
});

async function recordManualLaunch(action, extra = {}) {
  if (!state.selectedProject) return;
  try {
    state.lastError = null;
    await api(`/api/projects/${state.selectedProject.id}/manual-launch`, {
      method: "POST",
      body: JSON.stringify({ action, ...extra }),
    });
    await loadProjects(state.selectedProject.id);
  } catch (error) {
    state.lastError = `${error.code || "REQUEST_ERROR"}: ${error.message}`;
    renderProjectView();
    alert(error.message);
  }
}

document.querySelector("#openExportDirBtn").addEventListener("click", () => recordManualLaunch("open_export_dir"));
document.querySelector("#openHandoffHtmlBtn").addEventListener("click", () => recordManualLaunch("open_handoff_html"));
document.querySelector("#recordOpenChecklistBtn").addEventListener("click", () => recordManualLaunch("open_path", { note: "Checklist/handoff viewed locally." }));
document.querySelector("#recordCopyPublishTextBtn").addEventListener("click", () => recordManualLaunch("copy_publish_copy", { note: "Publish copy copied manually by creator." }));

document.querySelector("#assetForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.selectedProject) return;
  const formElement = event.currentTarget;
  const payload = Object.fromEntries(new FormData(formElement).entries());
  try {
    state.lastError = null;
    await api(`/api/projects/${state.selectedProject.id}/assets`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    formElement?.reset();
    await loadProjects(state.selectedProject.id);
  } catch (error) {
    state.lastError = `${error.code || "REQUEST_ERROR"}: ${error.message}`;
    renderProjectView();
    alert(error.message);
  }
});

loadHealth();
loadProjects();
