document.addEventListener("DOMContentLoaded", () => {
  applyChrome();

  const config = getConfig();
  const form = document.getElementById("lookup-form");
  const status = document.getElementById("lookup-status");
  const workspace = document.getElementById("student-workspace");
  const resultPanel = document.getElementById("result-panel");
  const missingOutput = document.getElementById("missing-output");
  const systemNote = document.getElementById("system-note");
  const adminTrigger = document.getElementById("secret-admin-trigger");
  let logoClicks = 0;
  let logoTimer;

  if (new URLSearchParams(window.location.search).get("mode") === "admin") {
    window.location.replace("admin.html");
    return;
  }

  if (!config.SCRIPT_URL) {
    systemNote.textContent = "前台畫面已就緒；部署 Apps Script 後，請把 Web App URL 填入 config.js。";
  } else {
    systemNote.textContent = config.REQUIRE_STUDENT_NAME ? "請輸入學號與姓名查詢。" : "請輸入學號查詢。";
    loadPortalSettings();
    loadCompletionRankings();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    const studentId = document.getElementById("student-id").value.trim();
    const name = document.getElementById("student-name").value.trim();

    status.className = "status";
    status.textContent = "查詢中...";
    resultPanel.classList.add("hidden");
    workspace.classList.remove("has-result");
    button.disabled = true;

    try {
      const response = await requestApi({ action: "lookup", studentId, name });
      renderResult(response.student);
      status.textContent = "查詢完成。";
    } catch (error) {
      status.className = "status error";
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  adminTrigger.addEventListener("click", () => {
    window.clearTimeout(logoTimer);
    logoClicks += 1;
    logoTimer = window.setTimeout(() => {
      logoClicks = 0;
    }, 1800);
    if (logoClicks >= 5) {
      logoClicks = 0;
      window.location.href = "admin.html";
    }
  });

  async function loadPortalSettings() {
    try {
      const settings = await requestApi({ action: "settings" });
      if (settings.courseTitle) applyCourseTitle(settings.courseTitle);
    } catch (error) {
      // 保留 config.js 的備援課程名稱。
    }
  }

  async function loadCompletionRankings() {
    const statusNode = document.getElementById("completion-rank-status");
    const wrap = document.getElementById("completion-rank-wrap");
    const rows = document.getElementById("completion-rank-rows");
    if (!statusNode || !wrap || !rows) return;

    try {
      const response = await requestApi({ action: "completionRankings" });
      const rankings = response.rankings || [];
      if (!rankings.length) {
        statusNode.className = "status";
        statusNode.textContent = response.message || "目前尚無完成度資料。";
        wrap.classList.add("hidden");
        rows.innerHTML = "";
        return;
      }

      rows.innerHTML = rankings.map((item, index) => `
        <tr>
          <td><span class="rank-medal">${escapeHtml(rankLabel(index + 1))}</span></td>
          <td><strong>${escapeHtml(item.className)}</strong></td>
          <td>
            <strong>${formatPercent(item.completionRate)}</strong>
            <div class="completion-progress"><span style="width:${completionWidth(item.completionRate)}%"></span></div>
          </td>
          <td>${escapeHtml(item.completedCount)} / ${escapeHtml(item.expectedCount)}</td>
          <td>${formatScore(item.averageScore)}</td>
        </tr>
      `).join("");
      statusNode.textContent = "";
      wrap.classList.remove("hidden");
    } catch (error) {
      statusNode.className = "status error";
      statusNode.textContent = "完成度排行暫時無法讀取。";
      wrap.classList.add("hidden");
    }
  }

  function renderResult(student) {
    setText("student-name-output", student.name || student.maskedName || "-");
    setText("student-id-output", student.studentId);
    setText("student-course-class-output", student.courseClass || "-");
    setText("student-class-output", student.className || "-");
    setText("quiz-score", formatScore(student.quiz));
    setText("zuvio-score", formatScore(student.zuvio));
    setText("midterm-score", formatScore(student.midterm));
    setText("final-score", formatScore(student.final));
    setText("total-score", formatScore(student.total));
    renderRanks(student);
    renderQuizDetails(student.quizDetails || []);
    renderZuvioDetails(student.zuvioDetails || []);

    if (student.missing) {
      missingOutput.textContent = `缺漏項目：${student.missing}`;
      missingOutput.classList.remove("hidden");
    } else {
      missingOutput.classList.add("hidden");
    }

    resultPanel.classList.remove("hidden");
    workspace.classList.add("has-result");
  }

});

function rankLabel(rank) {
  if (rank === 1) return "🥇 第 1 名";
  if (rank === 2) return "🥈 第 2 名";
  if (rank === 3) return "🥉 第 3 名";
  return `第 ${rank} 名`;
}

function completionWidth(value) {
  const number = Number(value);
  if (Number.isNaN(number)) return 0;
  return Math.min(100, Math.max(0, number));
}

function formatPercent(value) {
  const number = Number(value);
  if (Number.isNaN(number)) return "-";
  return `${number.toFixed(1)}%`;
}

function renderRanks(student) {
  const rows = document.getElementById("rank-rows");
  rows.innerHTML = "";
  const rankKeys = Object.keys(student.ranks || {}).filter((key) => key !== "total");
  const items = rankKeys.concat(["總成績"]);
  items.forEach((label) => {
    const key = label === "總成績" ? "total" : label;
    const rank = student.ranks?.[key];
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(label)}</td><td>${formatRank(rank?.classRank)}</td>`;
    rows.appendChild(tr);
  });
}

function renderQuizDetails(details) {
  const rows = document.getElementById("quiz-detail-rows");
  rows.innerHTML = "";
  details.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(item.name)}</td><td>${escapeHtml(formatScore(item.score))}</td><td>${escapeHtml(item.time || "-")}</td><td>${escapeHtml(formatAttempts(item.attempts))}</td>`;
    rows.appendChild(tr);
  });
}

function renderZuvioDetails(details) {
  const rows = document.getElementById("zuvio-detail-rows");
  rows.innerHTML = "";
  details.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(item.name)}</td><td>${escapeHtml(formatScore(item.score))}</td>`;
    rows.appendChild(tr);
  });
}

function formatScore(value) {
  if (value === "" || value === null || value === undefined) return "-";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return number.toFixed(2);
}

function formatRank(value) {
  return value ? `第 ${value} 名` : "-";
}

function formatAttempts(value) {
  if (value === "" || value === null || value === undefined) return "-";
  const text = String(value).trim();
  if (!text) return "-";
  return /次$/.test(text) ? text : `${text} 次`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
