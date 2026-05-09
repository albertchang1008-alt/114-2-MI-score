document.addEventListener("DOMContentLoaded", () => {
  applyChrome();

  const config = getConfig();
  const form = document.getElementById("lookup-form");
  const status = document.getElementById("lookup-status");
  const resultPanel = document.getElementById("result-panel");
  const missingOutput = document.getElementById("missing-output");
  const systemNote = document.getElementById("system-note");
  const adminTrigger = document.getElementById("secret-admin-trigger");
  const adminDialog = document.getElementById("admin-login-dialog");
  const hiddenAdminForm = document.getElementById("hidden-admin-form");
  const hiddenAdminStatus = document.getElementById("hidden-admin-status");
  const teacherDashboard = document.getElementById("teacher-dashboard");
  const teacherStatus = document.getElementById("teacher-status");
  const scoreModal = document.getElementById("score-detail-modal");
  let teacherPayload;
  let selectedClassName;
  let logoClicks = 0;
  let logoTimer;

  if (!config.SCRIPT_URL) {
    systemNote.textContent = "前台畫面已就緒；部署 Apps Script 後，請把 Web App URL 填入 config.js。";
  } else {
    systemNote.textContent = config.REQUIRE_STUDENT_NAME ? "請輸入學號與姓名查詢。" : "請輸入學號查詢。";
  }

  const savedToken = window.sessionStorage.getItem("gradePortalToken");
  if (new URLSearchParams(window.location.search).get("mode") === "admin" && savedToken) {
    loadTeacherDashboard(savedToken).catch(() => {
      window.sessionStorage.removeItem("gradePortalToken");
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    const studentId = document.getElementById("student-id").value.trim();
    const name = document.getElementById("student-name").value.trim();

    status.className = "status";
    status.textContent = "查詢中...";
    resultPanel.classList.add("hidden");
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
      adminDialog.showModal();
      document.getElementById("hidden-admin-user").focus();
    }
  });

  document.getElementById("close-admin-login").addEventListener("click", () => {
    adminDialog.close();
  });

  hiddenAdminForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = document.getElementById("hidden-admin-user").value.trim();
    const password = document.getElementById("hidden-admin-password").value;
    const button = hiddenAdminForm.querySelector("button[type='submit']");
    hiddenAdminStatus.className = "status";
    hiddenAdminStatus.textContent = "登入中...";
    button.disabled = true;

    try {
      const response = await requestApi({ action: "login", username, password });
      window.sessionStorage.setItem("gradePortalToken", response.token);
      setAdminMode(true);
      adminDialog.close();
      teacherDashboard.classList.remove("hidden");
      hiddenAdminStatus.textContent = "";
      loadTeacherDashboard(response.token).catch((error) => {
        teacherStatus.className = "status error";
        teacherStatus.textContent = error.message;
      });
    } catch (error) {
      hiddenAdminStatus.className = "status error";
      hiddenAdminStatus.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("teacher-logout").addEventListener("click", () => {
    window.sessionStorage.removeItem("gradePortalToken");
    teacherDashboard.classList.add("hidden");
    setAdminMode(false);
  });

  document.getElementById("close-score-modal").addEventListener("click", () => {
    scoreModal.close();
  });

  function renderResult(student) {
    setText("student-name-output", student.name || student.maskedName || "-");
    setText("student-id-output", student.studentId);
    setText("student-class-output", [student.courseClass, student.className].filter(Boolean).join(" / "));
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
  }

  function renderTeacherDashboard() {
    if (!teacherPayload) return;
    teacherDashboard.classList.remove("hidden");
    renderClassTabs();
    renderTeacherClass();
  }

  function renderClassTabs() {
    const tabs = document.getElementById("teacher-class-tabs");
    tabs.innerHTML = "";
    teacherPayload.classes.forEach((group) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = group.className === selectedClassName
        ? "min-h-0 rounded-md px-3 py-2 text-sm text-white"
        : "min-h-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700";
      button.style.background = group.className === selectedClassName
        ? teacherPayload.settings.primaryColor
        : "white";
      button.textContent = `修課班級 ${group.className} (${group.count})`;
      button.addEventListener("click", () => {
        selectedClassName = group.className;
        renderTeacherDashboard();
      });
      tabs.appendChild(button);
    });
  }

  function renderTeacherClass() {
    const group = teacherPayload.classes.find((item) => item.className === selectedClassName);
    if (!group) return;
    renderOverviewCards(group);
    renderSummaryCards(group);
    renderTeacherStudents(group);
  }

  async function loadTeacherDashboard(token) {
    teacherStatus.className = "status";
    teacherStatus.textContent = "正在載入後台統計...";
    const summary = await requestApi({ action: "summary", token });
    teacherPayload = summary;
    selectedClassName = selectedClassName || summary.classes?.[0]?.className || "";
    teacherStatus.textContent = "";
    renderTeacherDashboard();
  }

  function renderOverviewCards(group) {
    const cards = document.getElementById("teacher-overview-cards");
    cards.innerHTML = "";
    [
      ["修課人數", `${group.count} 人`],
      ["加權平均", formatScore(group.average)],
      ["及格率", `${Math.round((group.passRate || 0) * 100)}%`],
      ["缺漏人數", `${countMissingStudents(group.students)} 人`]
    ].forEach(([label, value]) => {
      const card = document.createElement("div");
      card.className = "rounded-lg border border-slate-200 bg-white p-4";
      card.innerHTML = `<span class="block text-sm text-slate-500">${label}</span><strong class="mt-1 block text-2xl">${value}</strong>`;
      cards.appendChild(card);
    });
  }

  function renderSummaryCards(group) {
    const cards = document.getElementById("teacher-summary-cards");
    cards.innerHTML = "";
    const summaries = summaryCardsForOverview(group);
    summaries.forEach((summary) => {
      const card = document.createElement("section");
      card.className = "rounded-lg border border-slate-200 bg-white p-4";
      card.innerHTML = `
        <span class="block text-sm text-slate-500">${escapeHtml(summary.label)}</span>
        <strong class="mt-1 block text-2xl">${formatScore(summary.average)}</strong>
        <div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
          <div class="h-full rounded-full" style="width:${summary.percent}%; background:${summary.color}"></div>
        </div>
        <span class="mt-2 block text-sm text-slate-500">${escapeHtml(summary.meta)}</span>`;
      cards.appendChild(card);
    });
  }

  function renderTeacherStudents(group) {
    const list = document.getElementById("teacher-student-list");
    const note = document.getElementById("teacher-list-note");
    list.innerHTML = "";
    if (note) note.textContent = `${group.count} 位學生，點選姓名查看原始分數`;
    group.students.forEach((student) => {
      const total = Number(student.total);
      const maxScore = Number(teacherPayload.settings.maxScore || 90);
      const percent = Number.isNaN(total) ? 0 : Math.max(0, Math.min(100, (total / maxScore) * 100));
      const color = scoreColor(total, teacherPayload.settings);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "min-h-0 rounded-lg border border-slate-200 bg-white p-4 text-left";
      card.innerHTML = `
        <div class="flex flex-col gap-2 md:grid md:grid-cols-[1fr_90px] md:items-center">
          <div>
            <div class="font-bold">${escapeHtml(student.name || student.studentId)}</div>
            <div class="text-sm text-slate-500">修課班級 ${escapeHtml(student.courseClass || "-")}｜班級 ${escapeHtml(student.className || "-")}｜${escapeHtml(student.studentId)}</div>
            <div class="text-sm text-slate-500">加權 ${formatScore(student.total)} / ${escapeHtml(teacherPayload.settings.maxScore || 90)}｜學期總分班排 ${escapeHtml(student.ranks?.total?.classRank || "-")} ${rankTrendText(student.rankTrend)}</div>
            ${student.missing ? `<div class="mt-2 inline-flex rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">缺漏：${escapeHtml(student.missing)}</div>` : ""}
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div class="h-full rounded-full" style="width:${percent}%; background:${color}"></div>
            </div>
          </div>
          <strong class="text-2xl" style="color:${color}">${formatScore(student.total)}</strong>
        </div>`;
      card.addEventListener("click", () => openScoreModal(student));
      list.appendChild(card);
    });
  }

  function openScoreModal(student) {
    document.getElementById("score-modal-title").textContent = `${student.name || student.studentId}｜${student.studentId}`;
    const body = document.getElementById("score-modal-body");
    body.innerHTML = "";
    teacherPayload.settings.scoreItems.forEach((item) => {
      const rankText = student.ranks?.[item]?.classRank ? `｜班排 ${student.ranks[item].classRank}` : "";
      const row = document.createElement("div");
      row.className = "flex items-center justify-between rounded-md border border-slate-200 px-3 py-2";
      row.innerHTML = `<span>${escapeHtml(item)}${escapeHtml(rankText)}</span><strong>${formatScore(student.rawScores?.[item])}</strong>`;
      body.appendChild(row);
    });
    const totalRow = document.createElement("div");
    totalRow.className = "flex items-center justify-between rounded-md border border-slate-200 px-3 py-2";
    totalRow.innerHTML = `<span>學期總分｜班排 ${escapeHtml(student.ranks?.total?.classRank || "-")} ${rankTrendText(student.rankTrend)}</span><strong>${formatScore(student.total)}</strong>`;
    body.appendChild(totalRow);
    scoreModal.showModal();
  }
});

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
    tr.innerHTML = `<td>${escapeHtml(item.name)}</td><td>${escapeHtml(formatScore(item.score))}</td><td>${escapeHtml(item.time || "-")}</td><td>${escapeHtml(item.attempts || "-")}</td>`;
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

function scoreColor(score, settings = {}) {
  const number = Number(score);
  if (Number.isNaN(number)) return "#647085";
  const passingScore = Number(settings.passingScore || 60);
  const maxScore = Number(settings.maxScore || 90);
  if (number < passingScore) return "#dc2626";
  if (number < maxScore * 0.8) return "#d97706";
  return "#16a34a";
}

function summaryCardsForOverview(group) {
  const maxScore = Number(teacherPayload.settings.maxScore || 90);
  const items = (teacherPayload.settings.scoreItems || []).map((item) => {
    const values = group.students
      .map((student) => Number(student.rawScores?.[item]))
      .filter((score) => !Number.isNaN(score));
    const average = values.length ? values.reduce((sum, score) => sum + score, 0) / values.length : "";
    return {
      label: item === "線上小考" ? "線上小考平均" : item === "Zuvio test" ? "Zuvio test平均" : item,
      average,
      percent: average === "" ? 0 : Math.max(0, Math.min(100, average)),
      color: scoreColor(average, { passingScore: 60, maxScore: 100 }),
      meta: `${values.length}/${group.count} 筆有效成績`
    };
  });

  const totalAverage = group.average;
  items.push({
    label: "加權總分",
    average: totalAverage,
    percent: totalAverage === "" ? 0 : Math.max(0, Math.min(100, (Number(totalAverage) / maxScore) * 100)),
    color: scoreColor(totalAverage, teacherPayload.settings),
    meta: `班排依 ${maxScore} 分制排序`
  });
  return items;
}

function countMissingStudents(students) {
  return students.filter((student) => Boolean(student.missing)).length;
}

function rankTrendText(trend) {
  if (!trend || trend.delta === 0) return "→";
  return trend.direction === "up" ? `↑${Math.abs(trend.delta)}` : `↓${Math.abs(trend.delta)}`;
}

function setAdminMode(enabled) {
  const url = new URL(window.location.href);
  if (enabled) {
    url.searchParams.set("mode", "admin");
  } else {
    url.searchParams.delete("mode");
  }
  window.history.pushState({}, "", url.toString());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
