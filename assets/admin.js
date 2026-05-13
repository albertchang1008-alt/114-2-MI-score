document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("admin-form");
  const userInput = document.getElementById("admin-user");
  const passwordInput = document.getElementById("admin-password");
  const status = document.getElementById("admin-status");
  const gate = document.getElementById("admin-gate");
  const dashboard = document.getElementById("dashboard");
  const teacherStatus = document.getElementById("teacher-status");

  applyTeacherTitle();
  loadTeacherSettings();

  const state = {
    authToken: "",
    payload: null,
    selectedClassName: "",
    selectedCategoryKey: "",
    selectedDetailKey: "average",
    selectedStudentId: "",
    selectedCompletionClassName: "",
    completionFilter: "all",
    sortKey: "",
    sortDirection: "desc",
    showAlertsOnly: false,
    alertDeviation: 15,
    fixedThreshold: 60
  };

  const token = window.sessionStorage.getItem("gradePortalToken");
  if (token) {
    showDashboardShell();
    loadDashboard(token).catch(() => {
      window.sessionStorage.removeItem("gradePortalToken");
      showLogin();
    });
  }

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
      showDashboardShell();
      await loadDashboard(response.token);
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

  async function loadTeacherSettings() {
    try {
      const settings = await requestApi({ action: "settings" });
      applyTeacherTitle(settings.courseTitle);
    } catch (error) {
      // 保留 config.js 的備援後台名稱。
    }
  }

  function applyTeacherTitle(courseTitle) {
    const config = getConfig();
    const baseTitle = courseTitle || config.COURSE_TITLE || "載入中…";
    const title = `${baseTitle}-教師後台`;
    document.title = title;
    document.querySelectorAll(".teacher-brand strong").forEach((node) => {
      node.textContent = title;
    });
    document.querySelectorAll(".teacher-brand[aria-label]").forEach((node) => {
      node.setAttribute("aria-label", title);
    });
  }

  function showDashboardShell() {
    gate.classList.add("hidden");
    dashboard.classList.remove("hidden");
  }

  function showLogin() {
    dashboard.classList.add("hidden");
    gate.classList.remove("hidden");
  }

  async function loadDashboard(authToken) {
    state.authToken = authToken;
    teacherStatus.className = "status";
    teacherStatus.textContent = "正在載入後台統計...";
    const response = await requestApi({ action: "summary", token: authToken });
    state.payload = response;
    state.alertDeviation = 15;
    state.fixedThreshold = 60;
    state.selectedClassName = "";
    state.selectedCategoryKey = "";
    state.selectedDetailKey = "average";
    state.selectedStudentId = "";
    state.selectedCompletionClassName = "";
    state.completionFilter = "all";
    state.sortKey = "";
    state.sortDirection = "desc";
    teacherStatus.textContent = "";
    renderDashboard();
  }

  function renderDashboard() {
    const selectionGroup = currentGroup() || allSchoolGroup();
    renderExamSelect(selectionGroup);
    renderClassTabs();
    renderCompletionModule();
    const group = currentGroup();
    if (!state.selectedCategoryKey || !group) {
      renderEmptyDashboard(!state.selectedCategoryKey ? "請先選擇考試項目或學期總分。" : "請選擇全校或班級。");
      return;
    }
    setDashboardContentVisible(true);
    renderMetricCards(group);
    renderHistogram(group);
    renderAlertSettings();
    renderAlertBanner(group);
    renderTable(group);
  }

  function currentGroup() {
    if (!state.payload || !state.selectedClassName) return null;
    if (state.selectedClassName === "全校") return allSchoolGroup();
    return state.payload.classes?.find((group) => group.className === state.selectedClassName);
  }

  function renderClassTabs() {
    const classStep = document.getElementById("teacher-class-step");
    const tabs = document.getElementById("teacher-class-tabs");
    classStep.classList.toggle("hidden", !state.selectedCategoryKey);
    tabs.innerHTML = "";
    if (!state.selectedCategoryKey) return;
    classGroups().forEach((group) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = group.className === state.selectedClassName ? "active" : "";
      button.textContent = group.className;
      button.addEventListener("click", () => {
        state.selectedClassName = group.className;
        state.selectedStudentId = "";
        resetSort();
        const details = detailOptions(group, state.selectedCategoryKey);
        if (!details.some((option) => option.key === state.selectedDetailKey)) {
          state.selectedDetailKey = preferredDetailKey(group, state.selectedCategoryKey);
        }
        renderDashboard();
      });
      tabs.appendChild(button);
    });
  }

  function renderEmptyDashboard(message) {
    setDashboardContentVisible(false);
    document.getElementById("teacher-alert-count").textContent = "0 名示警";
    document.getElementById("teacher-empty-state").textContent = message;
    teacherStatus.textContent = "";
  }

  function setDashboardContentVisible(visible) {
    document.getElementById("teacher-selection-bar").classList.remove("hidden");
    document.getElementById("teacher-empty-state").classList.toggle("hidden", visible);
    document.getElementById("teacher-metric-cards").classList.toggle("hidden", !visible);
    document.querySelector(".teacher-analysis-grid").classList.toggle("hidden", !visible);
    document.getElementById("teacher-alert-banner").classList.toggle("hidden", true);
    document.querySelector(".teacher-table-card").classList.toggle("hidden", !visible);
  }

  function renderCompletionModule() {
    const module = document.getElementById("teacher-completion-module");
    const completion = state.payload?.completion;
    if (!module || !completion) return;
    module.classList.remove("hidden");
    renderCompletionSettings(completion);
    renderCompletionClassRanking(completion);
    renderCompletionStudents(completion);
  }

  function renderCompletionSettings(completion) {
    const box = document.getElementById("completion-settings-box");
    const note = document.getElementById("completion-role-note");
    const user = state.payload?.currentUser || {};
    const isSuperAdmin = user.role === "super_admin";
    const enabledQuizzes = new Set(completion.settings?.enabledQuizIds || []);
    const enabledClasses = new Set(completion.settings?.enabledClassNames || []);
    const quizOptions = completion.quizOptions || [];
    const classOptions = completion.classOptions || [];
    note.textContent = isSuperAdmin ? "最高權限管理者，可調整完成度設定。" : "此設定僅限最高權限管理者調整。";

    const quizCheckboxes = quizOptions.length
      ? quizOptions.map((quiz) => `
        <label class="completion-checkbox">
          <input class="completion-quiz-checkbox" type="checkbox" value="${escapeHtml(quiz.id)}" ${enabledQuizzes.has(quiz.id) ? "checked" : ""} ${isSuperAdmin ? "" : "disabled"}>
          <span>${escapeHtml(quiz.label)}</span>
        </label>
      `).join("")
      : `<p class="teacher-muted-note">目前沒有可選擇的線上小考。</p>`;
    const classCheckboxes = classOptions.length
      ? classOptions.map((item) => `
        <label class="completion-checkbox">
          <input class="completion-class-checkbox" type="checkbox" value="${escapeHtml(item.id)}" ${enabledClasses.has(item.id) ? "checked" : ""} ${isSuperAdmin ? "" : "disabled"}>
          <span>${escapeHtml(item.label)}</span>
        </label>
      `).join("")
      : `<p class="teacher-muted-note">目前沒有可選擇的班級。</p>`;

    box.innerHTML = `
      <label class="completion-score-field">
        <span>達標分數</span>
        <input id="completion-passing-score" type="number" min="0" max="100" step="1" value="${escapeHtml(completion.settings?.passingScore ?? 60)}" ${isSuperAdmin ? "" : "disabled"}>
      </label>
      <div class="completion-setting-group">
        <div class="completion-setting-title">計算測驗</div>
        <div class="completion-quiz-list">${quizCheckboxes}</div>
      </div>
      <div class="completion-setting-group">
        <div class="completion-setting-title">計算班級</div>
        <div class="completion-quiz-list">${classCheckboxes}</div>
      </div>
      ${isSuperAdmin ? `<button id="completion-save-button" type="button">儲存完成度設定</button>` : ""}
      <div id="completion-save-status" class="status"></div>`;

    const saveButton = document.getElementById("completion-save-button");
    if (saveButton) {
      saveButton.onclick = async () => {
        const statusNode = document.getElementById("completion-save-status");
        const passingInput = document.getElementById("completion-passing-score");
        const checkedIds = Array.from(box.querySelectorAll(".completion-quiz-checkbox:checked")).map((input) => input.value);
        const checkedClasses = Array.from(box.querySelectorAll(".completion-class-checkbox:checked")).map((input) => input.value);
        saveButton.disabled = true;
        statusNode.className = "status";
        statusNode.textContent = "正在儲存...";
        try {
          const response = await requestApi({
            action: "saveCompletionSettings",
            token: state.authToken,
            passingScore: passingInput.value,
            enabledQuizIds: checkedIds.join(","),
            enabledClassNames: checkedClasses.join(",")
          });
          state.payload.completion = response.completion;
          state.selectedCompletionClassName = "";
          renderCompletionModule();
          const freshStatus = document.getElementById("completion-save-status");
          if (freshStatus) freshStatus.textContent = response.message || "已儲存。";
        } catch (error) {
          statusNode.className = "status error";
          statusNode.textContent = error.message;
        } finally {
          saveButton.disabled = false;
        }
      };
    }
  }

  function renderCompletionClassRanking(completion) {
    const statusNode = document.getElementById("completion-ranking-status");
    const rows = document.getElementById("completion-class-rows");
    const rankings = completion.classRankings || [];
    if (!rankings.length) {
      statusNode.textContent = completion.message || "目前尚無完成度排行資料。";
      rows.innerHTML = "";
      return;
    }

    statusNode.textContent = "";
    rows.innerHTML = rankings.map((group) => `
      <tr class="${group.className === state.selectedCompletionClassName ? "is-open" : ""}">
        <td><strong>${escapeHtml(String(group.rank))}</strong></td>
        <td>${escapeHtml(group.className)}</td>
        <td><strong>${formatPercent(group.completionRate)}</strong></td>
        <td>${escapeHtml(group.completedCount)} / ${escapeHtml(group.expectedCount)}</td>
        <td>${formatScore(group.averageScore)}</td>
        <td><button class="secondary-action completion-view-button" type="button" data-class-name="${escapeHtml(group.className)}">查看明細</button></td>
      </tr>
    `).join("");

    rows.querySelectorAll(".completion-view-button").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedCompletionClassName = button.dataset.className;
        state.completionFilter = "all";
        renderCompletionModule();
        document.getElementById("completion-student-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function renderCompletionStudents(completion) {
    const section = document.getElementById("completion-student-section");
    const title = document.getElementById("completion-student-title");
    const rows = document.getElementById("completion-student-rows");
    const group = (completion.classRankings || []).find((item) => item.className === state.selectedCompletionClassName);
    section.classList.toggle("hidden", !group);
    if (!group) {
      rows.innerHTML = "";
      return;
    }

    title.textContent = `${group.className} — 學生完成度明細`;
    bindCompletionFilterButton("completion-filter-all", "all");
    bindCompletionFilterButton("completion-filter-done", "done");
    bindCompletionFilterButton("completion-filter-not-done", "notDone");

    const students = (group.students || []).filter((student) => {
      if (state.completionFilter === "done") return student.status === "已全部完成";
      if (state.completionFilter === "notDone") return student.status !== "已全部完成";
      return true;
    });

    rows.innerHTML = students.map((student) => `
      <tr>
        <td>${escapeHtml(student.className)}</td>
        <td>${escapeHtml(student.studentId)}</td>
        <td><strong>${escapeHtml(student.name)}</strong></td>
        <td>${formatPercent(student.completionRate)}</td>
        <td>${escapeHtml((student.completedQuizIds || []).join("、") || "-")}</td>
        <td>${escapeHtml((student.incompleteQuizIds || []).join("、") || "-")}</td>
        <td>${completionStatusBadge(student.status)}</td>
      </tr>
    `).join("");
  }

  function bindCompletionFilterButton(id, value) {
    const button = document.getElementById(id);
    button.classList.toggle("active", state.completionFilter === value);
    button.onclick = () => {
      state.completionFilter = value;
      renderCompletionStudents(state.payload.completion);
    };
  }

  function classGroups() {
    return state.payload ? [allSchoolGroup()].concat(state.payload.classes || []) : [];
  }

  function allSchoolGroup() {
    const students = (state.payload?.students || []).slice().sort((a, b) => (
      String(a.courseClass || "").localeCompare(String(b.courseClass || ""), "zh-Hant")
      || Number(a.seatNo || 0) - Number(b.seatNo || 0)
      || String(a.studentId || "").localeCompare(String(b.studentId || ""))
    ));
    return {
      className: "全校",
      courseClass: "全校",
      count: students.length,
      students
    };
  }

  function renderExamSelect(group) {
    const categorySelect = document.getElementById("teacher-exam-category-select");
    const detailLabel = document.getElementById("teacher-exam-detail-label");
    const detailSelect = document.getElementById("teacher-exam-detail-select");
    categorySelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "請選擇";
    categorySelect.appendChild(placeholder);
    categoryOptions(group).forEach((option) => {
      const node = document.createElement("option");
      node.value = option.key;
      node.textContent = option.label;
      categorySelect.appendChild(node);
    });
    categorySelect.value = state.selectedCategoryKey;
    categorySelect.onchange = () => {
      state.selectedCategoryKey = categorySelect.value;
      state.selectedDetailKey = preferredDetailKey(group, state.selectedCategoryKey);
      state.selectedClassName = "";
      state.selectedStudentId = "";
      resetSort();
      renderDashboard();
    };

    const details = detailOptions(group, state.selectedCategoryKey);
    const selectedExists = details.some((option) => option.key === state.selectedDetailKey);
    if (!selectedExists) state.selectedDetailKey = preferredDetailKey(group, state.selectedCategoryKey);

    detailSelect.innerHTML = "";
    details.forEach((option) => {
      const node = document.createElement("option");
      node.value = option.key;
      node.textContent = option.label;
      detailSelect.appendChild(node);
    });
    detailSelect.value = state.selectedDetailKey;
    detailLabel.classList.toggle("hidden", !categoryHasDetails(state.selectedCategoryKey));
    detailSelect.onchange = () => {
      state.selectedDetailKey = detailSelect.value;
      state.selectedStudentId = "";
      resetSort();
      renderDashboard();
    };
  }

  function renderMetricCards(group) {
    const cards = document.getElementById("teacher-metric-cards");
    const scores = selectedScores(group);
    const avg = averageOf(scores);
    const values = [
      ["人數", String(group.count)],
      [group.className === "全校" ? "全校平均" : "班級平均", formatScore(avg)],
      ["最高", formatScore(scores.length ? Math.max(...scores) : "")],
      ["最低", formatScore(scores.length ? Math.min(...scores) : "")]
    ];
    cards.innerHTML = values.map(([label, value]) => (
      `<div class="teacher-metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
    )).join("");
  }

  function renderHistogram(group) {
    const title = document.getElementById("teacher-chart-title");
    const histogram = document.getElementById("teacher-histogram");
    const scores = selectedScores(group);
    const avg = averageOf(scores);
    const maxCount = Math.max(...histogramBins(scores).map((bin) => bin.count), 1);
    title.textContent = `${state.selectedClassName} — ${selectedScoreLabel()} 分布`;
    histogram.innerHTML = histogramBins(scores).map((bin) => (
      `<div class="teacher-bin">
        <div class="teacher-bin-count">${bin.count || ""}</div>
        <div class="teacher-bin-bar ${bin.max <= state.fixedThreshold ? "danger" : bin.min < avg * (1 - state.alertDeviation / 100) ? "warn" : ""}" style="height:${bin.count ? Math.max(8, Math.round((bin.count / maxCount) * 128)) : 0}px"></div>
        <div class="teacher-bin-label">${escapeHtml(bin.label)}</div>
      </div>`
    )).join("");
  }

  function renderAlertSettings() {
    const box = document.getElementById("teacher-alert-settings");
    box.innerHTML = `
      <div class="alert-control">
        <span class="control-label">均值偏差</span>
        <label class="alert-input-row">
          <span>低於均值</span>
          <input id="alert-deviation-input" type="number" min="0" max="100" step="1" value="${state.alertDeviation}">
          <strong>%</strong>
        </label>
        </div>
      </div>
      <div class="alert-divider"></div>
      <div class="alert-control">
        <span class="control-label">不及格</span>
        <label class="alert-input-row">
          <span>低於</span>
          <input id="alert-fixed-input" type="number" min="0" max="100" step="1" value="${state.fixedThreshold}">
          <strong>分</strong>
        </label>
      </div>`;

    document.getElementById("alert-deviation-input").oninput = (event) => {
      state.alertDeviation = clampNumber(event.target.value, 0, 100, 15);
      renderDashboard();
    };
    document.getElementById("alert-fixed-input").oninput = (event) => {
      state.fixedThreshold = clampNumber(event.target.value, 0, 100, 60);
      renderDashboard();
    };
  }

  function renderAlertBanner(group) {
    const banner = document.getElementById("teacher-alert-banner");
    const alerts = alertStudents(group);
    document.getElementById("teacher-alert-count").textContent = `${alerts.length} 名示警`;
    if (!alerts.length) {
      banner.classList.add("hidden");
      banner.textContent = "";
      return;
    }
    banner.classList.remove("hidden");
    banner.innerHTML = `<strong>!</strong><span>低於不及格門檻（${state.fixedThreshold}分）或均值偏差：${alerts.map((student) => escapeHtml(student.name || student.studentId)).join("、")}</span>`;
  }

  function renderTable(group) {
    const rows = document.getElementById("teacher-student-rows");
    const title = document.getElementById("teacher-table-title");
    const allButton = document.getElementById("teacher-show-all");
    const alertButton = document.getElementById("teacher-show-alerts");
    const exportButton = document.getElementById("teacher-export-class");
    const alerts = new Set(alertStudents(group).map((student) => student.studentId));
    const baseStudents = state.showAlertsOnly
      ? group.students.filter((student) => alerts.has(student.studentId))
      : group.students;
    const students = sortedStudents(baseStudents, group);

    title.textContent = `${state.selectedClassName} — ${selectedScoreLabel()} 明細`;
    allButton.classList.toggle("active", !state.showAlertsOnly);
    alertButton.classList.toggle("active", state.showAlertsOnly);
    allButton.onclick = () => {
      state.showAlertsOnly = false;
      state.selectedStudentId = "";
      renderTable(group);
    };
    alertButton.onclick = () => {
      state.showAlertsOnly = true;
      state.selectedStudentId = "";
      renderTable(group);
    };
    exportButton.classList.toggle("hidden", group.className === "全校");
    exportButton.onclick = () => exportClassScores(group);
    renderSortButtons(group);
    document.querySelectorAll(".term-total-column").forEach((node) => {
      node.classList.toggle("hidden", !isTermTotalView());
    });

    rows.innerHTML = students.map((student, index) => {
      const score = scoreForStudent(student, state.selectedCategoryKey, state.selectedDetailKey);
      const isAlert = alerts.has(student.studentId);
      const isOpen = state.selectedStudentId === student.studentId;
      const classRank = classRankForStudent(student);
      const schoolRank = schoolRankForStudent(student);
      const mainRow = `<tr data-student-id="${escapeHtml(student.studentId)}" class="${isOpen ? "is-open" : ""}">
        <td><span class="student-avatar color-${index % 8}">${escapeHtml(initialOf(student.name || student.maskedName || student.studentId))}</span></td>
        <td><strong>${escapeHtml(student.name || student.maskedName || student.studentId)}</strong><small>${escapeHtml(student.studentId)}</small></td>
        <td><strong>${formatScore(score)}</strong></td>
        <td>${formatRank(classRank)}</td>
        <td>${formatRank(schoolRank)}</td>
        ${isTermTotalView() ? `<td class="term-total-column">${formatScore(student.total)}</td>` : ""}
        <td>${statusBadge(isAlert)}</td>
        <td class="row-arrow">${isOpen ? "⌃" : "›"}</td>
      </tr>`;
      return isOpen ? mainRow + renderInlineDetailRow(group, student) : mainRow;
    }).join("");

    rows.querySelectorAll("tr[data-student-id]").forEach((row) => {
      row.addEventListener("click", () => {
        const student = group.students.find((item) => item.studentId === row.dataset.studentId);
        if (!student) return;
        state.selectedStudentId = state.selectedStudentId === student.studentId ? "" : student.studentId;
        renderTable(group);
      });
    });
  }

  function renderInlineDetailRow(group, student) {
    const selectedScore = scoreForStudent(student, state.selectedCategoryKey, state.selectedDetailKey);
    const classRank = classRankForStudent(student);
    const schoolRank = schoolRankForStudent(student);
    const quizDetails = detailCards("線上小考每次成績", student.quizDetails || [], (item) => (
      `<span>${escapeHtml(item.name)}</span><strong>${formatScore(item.score)}</strong><small>${escapeHtml([item.time, item.attempts ? `${item.attempts} 次` : ""].filter(Boolean).join(" · ") || "-")}</small>`
    ));
    const zuvioDetails = detailCards("Zuvio test 每次成績", student.zuvioDetails || [], (item) => (
      `<span>${escapeHtml(item.name)}</span><strong>${formatScore(item.score)}</strong>`
    ));
    const scoreItems = state.payload.settings.scoreItems.map((item) => (
      `<div class="inline-score-item">
        <span>${escapeHtml(scoreItemLabel(item))}</span>
        <strong>${formatScore(student.rawScores?.[item])}</strong>
      </div>`
    )).join("");
    const termTotalCard = `<div class="inline-score-item inline-total">
      <span>目前得到的學期總成績 <small>依 Weights 分頁權重計算，尚有考試未考</small></span>
      <strong>${formatScore(student.total)}</strong>
    </div>`;
    return `<tr class="student-inline-detail-row">
      <td colspan="${isTermTotalView() ? 8 : 7}">
        <div class="student-inline-detail">
          <div class="inline-detail-head">
            <div>
              <span class="inline-detail-eyebrow">學生明細</span>
              <strong>${escapeHtml(student.name || student.maskedName || student.studentId)}｜${escapeHtml(student.studentId)}</strong>
            </div>
            <div class="inline-selected-score">
              <span>${escapeHtml(selectedScoreLabel())}</span>
              <strong>${formatScore(selectedScore)}</strong>
              <small>班級排名 ${formatRank(classRank)}｜全校排名 ${formatRank(schoolRank)}</small>
            </div>
          </div>
          <div class="inline-score-grid">
            ${scoreItems}
            ${termTotalCard}
          </div>
          <div class="inline-detail-columns">
            ${quizDetails}
            ${zuvioDetails}
          </div>
        </div>
      </td>
    </tr>`;
  }

  function detailCards(title, items, renderer) {
    const cards = items.length
      ? items.map((item) => `<div class="inline-detail-card">${renderer(item)}</div>`).join("")
      : `<div class="inline-detail-empty">無資料</div>`;
    return `<section class="inline-detail-section"><h4>${escapeHtml(title)}</h4><div class="inline-detail-card-grid">${cards}</div></section>`;
  }

  function exportClassScores(group) {
    const rows = exportRowsForGroup(group);
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${safeFileName(group.className)}_全部成績.csv`;
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
  }

  function exportRowsForGroup(group) {
    const quizNames = uniqueDetailNames(group.students, "線上小考");
    const zuvioNames = uniqueDetailNames(group.students, "Zuvio test");
    const headers = [
      "修課班級",
      "班級",
      "座號",
      "學號",
      "姓名"
    ].concat(
      state.payload.settings.scoreItems.map(scoreItemLabel),
      ["目前得到的學期總成績"],
      quizNames.map((name) => `線上小考-${name}`),
      zuvioNames.map((name) => `Zuvio test-${name}`)
    );
    const body = group.students.map((student) => {
      const quizMap = detailScoreMap(student.quizDetails || []);
      const zuvioMap = detailScoreMap(student.zuvioDetails || []);
      return [
        student.courseClass || "",
        student.className || "",
        student.seatNo || "",
        student.studentId || "",
        student.name || student.maskedName || ""
      ].concat(
        state.payload.settings.scoreItems.map((item) => formatScore(student.rawScores?.[item])),
        [formatScore(student.total)],
        quizNames.map((name) => formatScore(quizMap[name])),
        zuvioNames.map((name) => formatScore(zuvioMap[name]))
      );
    });
    return [headers].concat(body);
  }

  function uniqueDetailNames(students, categoryKey) {
    const names = [];
    students.forEach((student) => {
      detailListForStudent(student, categoryKey).forEach((detail) => {
        if (detail.name && !names.includes(detail.name)) names.push(detail.name);
      });
    });
    return names;
  }

  function detailScoreMap(details) {
    return details.reduce((map, detail) => {
      map[detail.name] = detail.score;
      return map;
    }, {});
  }

  function renderSortButtons(group) {
    document.querySelectorAll(".sort-button").forEach((button) => {
      const isActive = state.sortKey === "score";
      button.classList.toggle("active", isActive);
      button.textContent = "本次" + (isActive ? (state.sortDirection === "desc" ? " ↓" : " ↑") : "");
      button.onclick = () => {
        if (state.sortKey === "score") {
          state.sortDirection = state.sortDirection === "desc" ? "asc" : "desc";
        } else {
          state.sortKey = "score";
          state.sortDirection = "desc";
        }
        state.selectedStudentId = "";
        renderTable(group);
      };
    });
  }

  function sortedStudents(students, group) {
    if (!state.sortKey) return students;
    const direction = state.sortDirection === "asc" ? 1 : -1;
    return students.slice().sort((a, b) => {
      const aValue = sortValue(a, group);
      const bValue = sortValue(b, group);
      const aMissing = aValue === "";
      const bMissing = bValue === "";
      if (aMissing && bMissing) return compareBySeat(a, b);
      if (aMissing) return 1;
      if (bMissing) return -1;
      return (Number(aValue) - Number(bValue)) * direction || compareBySeat(a, b);
    });
  }

  function sortValue(student, group) {
    if (state.sortKey === "score") return parseNumeric(scoreForStudent(student, state.selectedCategoryKey, state.selectedDetailKey));
    return "";
  }

  function resetSort() {
    state.sortKey = "";
    state.sortDirection = "desc";
  }

  function categoryOptions(group) {
    const items = state.payload.settings.scoreItems || [];
    return items.concat(["total"]).map((key) => ({
      key,
      label: categoryLabel(key),
      hasScores: group ? group.students.some((student) => !Number.isNaN(Number(scoreForStudent(student, key, "average")))) : false
    }));
  }

  function preferredCategoryKey(group) {
    if (!group) return "total";
    const preferred = ["期末考", "期中考", "total"];
    const options = categoryOptions(group);
    return preferred.find((key) => options.some((option) => option.key === key && option.hasScores))
      || options.find((option) => option.hasScores)?.key
      || "total";
  }

  function preferredDetailKey(group, categoryKey) {
    const options = detailOptions(group, categoryKey);
    return options[0]?.key || "average";
  }

  function detailOptions(group, categoryKey) {
    if (!categoryHasDetails(categoryKey)) return [{ key: "average", label: categoryLabel(categoryKey) }];
    const names = [];
    group.students.forEach((student) => {
      detailListForStudent(student, categoryKey).forEach((detail) => {
        if (detail.name && !names.includes(detail.name)) names.push(detail.name);
      });
    });
    return [{ key: "average", label: "平均" }].concat(names.map((name) => ({ key: name, label: name })));
  }

  function categoryHasDetails(key) {
    return key === "線上小考" || key === "Zuvio test";
  }

  function categoryLabel(key) {
    if (key === "線上小考") return "線上小考";
    if (key === "Zuvio test") return "Zuvio test";
    if (key === "total") return "學期總分";
    return key || "-";
  }

  function isTermTotalView() {
    return state.selectedCategoryKey === "total";
  }

  function selectedScoreLabel() {
    const category = categoryLabel(state.selectedCategoryKey);
    if (!categoryHasDetails(state.selectedCategoryKey)) return category;
    if (state.selectedDetailKey === "average") return `${category}平均`;
    return `${category} · ${state.selectedDetailKey}`;
  }

  function scoreForStudent(student, categoryKey, detailKey) {
    if (categoryKey === "total") return student.total;
    if (categoryHasDetails(categoryKey) && detailKey && detailKey !== "average") {
      const detail = detailListForStudent(student, categoryKey).find((item) => item.name === detailKey);
      return detail ? detail.score : "";
    }
    return student.rawScores?.[categoryKey];
  }

  function detailListForStudent(student, categoryKey) {
    if (categoryKey === "線上小考") return student.quizDetails || [];
    if (categoryKey === "Zuvio test") return student.zuvioDetails || [];
    return [];
  }

  function selectedScores(group) {
    return group.students
      .map((student) => Number(scoreForStudent(student, state.selectedCategoryKey, state.selectedDetailKey)))
      .filter((score) => !Number.isNaN(score));
  }

  function classRankForStudent(target) {
    return rankWithinStudents(allStudents().filter((student) => student.courseClass === target.courseClass), target);
  }

  function schoolRankForStudent(target) {
    return rankWithinStudents(allStudents(), target);
  }

  function rankWithinStudents(students, target) {
    const targetScore = Number(scoreForStudent(target, state.selectedCategoryKey, state.selectedDetailKey));
    if (Number.isNaN(targetScore)) return "";
    return 1 + students.filter((student) => {
      const score = Number(scoreForStudent(student, state.selectedCategoryKey, state.selectedDetailKey));
      return !Number.isNaN(score) && score > targetScore;
    }).length;
  }

  function allStudents() {
    return state.payload?.students || [];
  }

  function compareBySeat(a, b) {
    return String(a.courseClass || "").localeCompare(String(b.courseClass || ""), "zh-Hant")
      || Number(a.seatNo || 0) - Number(b.seatNo || 0)
      || String(a.studentId || "").localeCompare(String(b.studentId || ""));
  }

  function scoreItemLabel(item) {
    if (item === "線上小考") return "線上小考平均";
    if (item === "Zuvio test") return "Zuvio test 平均";
    return item;
  }

  function averageOf(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : "";
  }

  function histogramBins(scores) {
    const bins = [
      { label: "0-39", min: 0, max: 40, count: 0 },
      { label: "40-49", min: 40, max: 50, count: 0 },
      { label: "50-59", min: 50, max: 60, count: 0 },
      { label: "60-69", min: 60, max: 70, count: 0 },
      { label: "70-79", min: 70, max: 80, count: 0 },
      { label: "80-89", min: 80, max: 90, count: 0 },
      { label: "90-100", min: 90, max: 101, count: 0 }
    ];
    scores.forEach((score) => {
      const bin = bins.find((item, index) => score >= item.min && (index === bins.length - 1 ? score <= item.max : score < item.max));
      if (bin) bin.count += 1;
    });
    return bins;
  }

  function alertStudents(group) {
    const scores = selectedScores(group);
    const avg = averageOf(scores);
    const deviationLine = avg === "" ? -Infinity : Number(avg) * (1 - state.alertDeviation / 100);
    return group.students.filter((student) => {
      const score = Number(scoreForStudent(student, state.selectedCategoryKey, state.selectedDetailKey));
      return !Number.isNaN(score) && (score < state.fixedThreshold || score < deviationLine);
    });
  }
});

function initialOf(value) {
  return String(value || "-").trim().slice(0, 1) || "-";
}

function statusBadge(isAlert) {
  return isAlert
    ? `<span class="status-badge danger">⊙ 低於門檻</span>`
    : `<span class="status-badge ok">✓ 正常</span>`;
}

function completionStatusBadge(status) {
  if (status === "已全部完成") return `<span class="status-badge ok">✓ 已全部完成</span>`;
  if (status === "部分完成") return `<span class="status-badge warn">部分完成</span>`;
  return `<span class="status-badge danger">尚未完成</span>`;
}

function formatScore(value) {
  if (value === "" || value === null || value === undefined) return "-";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return number.toFixed(2);
}

function formatPercent(value) {
  if (value === "" || value === null || value === undefined) return "-";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return `${number.toFixed(1)}%`;
}

function formatRank(value) {
  return value ? `第 ${value} 名` : "-";
}

function parseNumeric(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  return Number.isNaN(number) ? "" : number;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (Number.isNaN(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function safeFileName(value) {
  return String(value || "成績")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
