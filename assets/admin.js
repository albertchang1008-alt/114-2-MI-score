document.addEventListener("DOMContentLoaded", () => {
  applyChrome();

  const form = document.getElementById("admin-form");
  const userInput = document.getElementById("admin-user");
  const passwordInput = document.getElementById("admin-password");
  const status = document.getElementById("admin-status");
  const dashboard = document.getElementById("dashboard");
  const gate = document.getElementById("admin-gate");
  const token = window.sessionStorage.getItem("gradePortalToken");

  if (token) loadDashboard(token).catch(() => window.sessionStorage.removeItem("gradePortalToken"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    status.className = "status";
    status.textContent = "登入中...";
    button.disabled = true;

    try {
      const response = await requestApi({
        action: "login",
        username: userInput.value.trim(),
        password: passwordInput.value
      });
      window.sessionStorage.setItem("gradePortalToken", response.token);
      await loadDashboard(response.token);
      status.textContent = "";
    } catch (error) {
      status.className = "status error";
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("logout-button").addEventListener("click", () => {
    window.sessionStorage.removeItem("gradePortalToken");
    window.location.href = "index.html";
  });

  async function loadDashboard(authToken) {
    const response = await requestApi({ action: "summary", token: authToken });
    renderDashboard(response);
    gate.classList.add("hidden");
    dashboard.classList.remove("hidden");
  }
});

function renderDashboard(payload) {
  setText("metric-count", payload.summary.count);
  setText("metric-average", formatScore(payload.summary.average));
  setText("metric-max", formatScore(payload.summary.max));
  setText("metric-min", formatScore(payload.summary.min));
  renderWeights(payload.weights);
  renderDistribution(payload.summary.distribution || []);
  renderClassGroups(payload.classes || []);
}

function renderWeights(weights) {
  const container = document.getElementById("weights");
  container.innerHTML = "";
  const items = Array.isArray(weights)
    ? weights
    : Object.keys(weights || {}).map((name) => ({ name, weight: weights[name] }));
  items.forEach((item) => {
    const node = document.createElement("div");
    node.innerHTML = `<span>${escapeHtml(item.name)}</span><strong>${Math.round(Number(item.weight) * 100)}%</strong>`;
    container.appendChild(node);
  });
}

function renderDistribution(distribution) {
  const container = document.getElementById("distribution-chart");
  container.innerHTML = "";
  const max = Math.max(1, ...distribution.map((item) => item.count));
  distribution.forEach((item) => {
    const percent = Math.max(4, Math.round((item.count / max) * 100));
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span>${escapeHtml(item.label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${percent}%"></div></div>
      <strong>${escapeHtml(item.count)}</strong>`;
    container.appendChild(row);
  });
}

function renderClassGroups(classes) {
  const container = document.getElementById("class-groups");
  container.innerHTML = "";

  classes.forEach((group, index) => {
    const details = document.createElement("details");
    details.className = "class-card";
    if (index === 0) details.open = true;
    details.innerHTML = `
      <summary>
        <span>修課班級 ${escapeHtml(group.className)}</span>
        <small>${group.count} 人，平均 ${formatScore(group.average)}，最高 ${formatScore(group.max)}，最低 ${formatScore(group.min)}</small>
      </summary>
      <div class="class-body">
        <div class="distribution-chart mini-chart">${distributionHtml(group.distribution || [])}</div>
        <div class="student-stack">${group.students.map(studentHtml).join("")}</div>
      </div>`;
    container.appendChild(details);
  });
}

function studentHtml(student) {
  return `
    <details class="student-card">
      <summary>
        <span>${escapeHtml(student.seatNo)}　${escapeHtml(student.name || student.maskedName)}</span>
        <small>${escapeHtml(student.studentId)}｜總成績 ${formatScore(student.total)}｜學期總分班排 ${escapeHtml(student.ranks?.total?.classRank || "-")}</small>
      </summary>
      <div class="student-detail-grid">
        <section>
          <h4>各項成績</h4>
          <ul class="mini-list">
            <li>修課班級：${escapeHtml(student.courseClass || "-")}</li>
            <li>班級：${escapeHtml(student.className || "-")}</li>
            <li>線上小考：${formatScore(student.quiz)}</li>
            <li>Zuvio test：${formatScore(student.zuvio)}</li>
            <li>期中考：${formatScore(student.midterm)}</li>
            <li>期末考：${formatScore(student.final)}</li>
            <li>缺漏：${escapeHtml(student.missing || "-")}</li>
          </ul>
        </section>
        <section>
          <h4>線上小考明細</h4>
          <ul class="mini-list">${(student.quizDetails || []).map((item) => `<li>${escapeHtml(item.name)}：${formatScore(item.score)}，${escapeHtml(item.time || "-")}，${escapeHtml(item.attempts || "-")} 次</li>`).join("")}</ul>
        </section>
        <section>
          <h4>Zuvio test 明細</h4>
          <ul class="mini-list">${(student.zuvioDetails || []).map((item) => `<li>${escapeHtml(item.name)}：${formatScore(item.score)}</li>`).join("")}</ul>
        </section>
      </div>
    </details>`;
}

function distributionHtml(distribution) {
  const max = Math.max(1, ...distribution.map((item) => item.count));
  return distribution.map((item) => {
    const percent = Math.max(4, Math.round((item.count / max) * 100));
    return `
      <div class="bar-row">
        <span>${escapeHtml(item.label)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${percent}%"></div></div>
        <strong>${escapeHtml(item.count)}</strong>
      </div>`;
  }).join("");
}

function formatScore(value) {
  if (value === "" || value === null || value === undefined) return "-";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return number.toFixed(2);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
