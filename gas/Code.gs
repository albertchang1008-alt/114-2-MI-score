const CONFIG = {
  SPREADSHEET_ID: "1O0iHU2Vl0YmAsV01-0udGSL5hzPmCRM_ZLGQ1iclQZE",
  GRADE_SHEET: "分數總表",
  SETTINGS_SHEET: "Settings",
  WEIGHTS_SHEET: "Weights",
  ADMIN_SHEET: "管理者帳號",
  ROSTER_SHEET: "修課名單",
  QUIZ_SHEET: "線上小考成績",
  ZUVIO_SHEET: "Zuvio test",
  MIDTERM_SHEET: "期中考成績",
  FINAL_SHEET: "期末考成績",
  TOKEN_SECRET: "CHANGE_ME_TO_A_LONG_RANDOM_SECRET",
  REQUIRE_NAME_MATCH: true
};

function doGet(event) {
  try {
    const params = event.parameter || {};
    const action = params.action || "health";
    let payload;

    if (action === "health") {
      payload = { ok: true, message: "ready" };
    } else if (action === "login") {
      payload = login(params);
    } else if (action === "lookup") {
      payload = lookupStudent(params);
    } else if (action === "summary") {
      payload = requireAdmin(params, getSummary);
    } else {
      payload = { ok: false, message: "未知的操作。" };
    }

    return output(params.callback, payload);
  } catch (error) {
    return output(event.parameter && event.parameter.callback, {
      ok: false,
      message: error.message || "系統發生錯誤。"
    });
  }
}

function login(params) {
  const username = String(params.username || "").trim();
  const password = String(params.password || "");
  if (!username || !password) return { ok: false, message: "請輸入帳號與密碼。" };

  const users = readAdminUsers();
  const user = users.find((item) => item.username === username && item.password === password);
  if (!user) {
    return { ok: false, message: "帳號或密碼不正確。" };
  }

  return { ok: true, token: createToken(username), username: username, displayName: user.displayName };
}

function lookupStudent(params) {
  const studentId = String(params.studentId || "").trim();
  const name = String(params.name || "").trim();
  if (!studentId) return { ok: false, message: "請輸入學號。" };
  if (CONFIG.REQUIRE_NAME_MATCH && !name) return { ok: false, message: "請輸入姓名。" };

  const settings = readSettings();
  const weights = readWeights();
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const summaryRow = readGradeSummaryRowByStudentId(spreadsheet, settings.scoreItems, studentId);
  if (!summaryRow) return { ok: false, message: "查無此學號。" };

  if (CONFIG.REQUIRE_NAME_MATCH) {
    const normalizedInput = normalizeName(name);
    const isMatched = normalizeName(summaryRow.name) === normalizedInput || normalizeName(summaryRow.maskedName) === normalizedInput;
    if (!isMatched) return { ok: false, message: "學號與姓名不相符。" };
  }

  const summaryRows = readGradeSummaryRows(spreadsheet, settings.scoreItems);
  const students = summaryRows.map((row) => buildStudentFromSummaryRow(row, settings, weights, {}, {}));
  attachRanks(students, settings.scoreItems);
  attachRankTrends(students);

  const student = students.find((row) => row.studentId === studentId);
  student.quizDetails = readQuizDetailsForStudent(spreadsheet, studentId);
  student.zuvioDetails = readZuvioDetailsForStudent(spreadsheet, studentId);

  return { ok: true, student: student };
}

function getSummary() {
  const settings = readSettings();
  const weights = readWeights();
  const data = buildGradeDataset(settings, weights, { includeDetails: true });
  const totals = numericScores(data.students.map((student) => student.total));
  const sum = totals.reduce((acc, score) => acc + score, 0);

  return {
    ok: true,
    summary: {
      count: data.students.length,
      average: totals.length ? sum / totals.length : "",
      max: totals.length ? Math.max.apply(null, totals) : "",
      min: totals.length ? Math.min.apply(null, totals) : "",
      passCount: countPassing(data.students, settings.passingScore),
      passRate: data.students.length ? countPassing(data.students, settings.passingScore) / data.students.length : 0,
      distribution: buildDistribution(data.students, settings.maxScore)
    },
    settings: settings,
    weights: weightsToList(weights),
    classes: buildClassGroups(data.students, settings),
    students: data.students
  };
}

function buildGradeDataset(settings, weights, options) {
  options = options || {};
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const rosterRows = readGradeSummaryRows(spreadsheet, settings.scoreItems);
  const quizDetails = options.includeDetails ? readQuizDetails(spreadsheet) : {};
  const zuvioDetails = options.includeDetails ? readZuvioDetails(spreadsheet) : {};

  const students = rosterRows.map((row) => buildStudentFromSummaryRow(row, settings, weights, quizDetails, zuvioDetails));

  attachRanks(students, settings.scoreItems);
  attachRankTrends(students);
  return { students: students };
}

function buildStudentFromSummaryRow(row, settings, weights, quizDetails, zuvioDetails) {
  const rawScores = {};
  settings.scoreItems.forEach((item) => {
    rawScores[item] = row.rawScores[item] || "";
  });
  const total = row.total !== "" ? row.total : calculateWeightedTotal(rawScores, settings.scoreItems, weights);
  return {
    campus: row.campus,
    courseClass: row.courseClass,
    seatNo: row.seatNo,
    className: row.className,
    studentId: row.studentId,
    name: row.name,
    maskedName: row.maskedName,
    rawScores: rawScores,
    quiz: rawScores["線上小考"] || "",
    zuvio: rawScores["Zuvio test"] || "",
    midterm: rawScores["期中考"] || "",
    final: rawScores["期末考"] || "",
    scoreItems: settings.scoreItems,
    total: total,
    pass: total !== "" ? Number(total) >= settings.passingScore : false,
    missing: row.missing || settings.scoreItems.filter((item) => rawScores[item] === "").join("、"),
    quizDetails: quizDetails[row.studentId] || [],
    zuvioDetails: zuvioDetails[row.studentId] || []
  };
}

function readGradeSummaryRows(spreadsheet, scoreItems) {
  const context = getGradeSummaryContext(spreadsheet);
  if (context.lastRow < 2) return [];
  const values = context.sheet.getRange(2, 1, context.lastRow - 1, context.lastColumn).getDisplayValues();
  return values.filter((row) => row[context.headerMap["學號"]]).map((row) => rowToGradeSummaryRow(row, context.headerMap, scoreItems));
}

function readGradeSummaryRowByStudentId(spreadsheet, scoreItems, studentId) {
  const context = getGradeSummaryContext(spreadsheet);
  const studentIdColumn = context.headerMap["學號"];
  if (studentIdColumn === undefined || context.lastRow < 2) return null;

  const idRange = context.sheet.getRange(2, studentIdColumn + 1, context.lastRow - 1, 1);
  const match = idRange.createTextFinder(studentId).matchEntireCell(true).findNext();
  if (!match) return null;

  const row = context.sheet.getRange(match.getRow(), 1, 1, context.lastColumn).getDisplayValues()[0];
  return rowToGradeSummaryRow(row, context.headerMap, scoreItems);
}

function getGradeSummaryContext(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(CONFIG.GRADE_SHEET);
  if (!sheet) throw new Error(`找不到 ${CONFIG.GRADE_SHEET} 分頁。`);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  const headers = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0] : [];
  const headerMap = makeHeaderMap(headers);
  return {
    sheet: sheet,
    lastRow: lastRow,
    lastColumn: lastColumn,
    headerMap: headerMap
  };
}

function rowToGradeSummaryRow(row, headerMap, scoreItems) {
  const rawScores = {};
  scoreItems.forEach((item) => {
    rawScores[item] = parseScore(row[resolveScoreColumn(headerMap, item)]);
  });
  return {
    campus: row[headerMap["校區"]],
    courseClass: row[headerMap["修課班級"]],
    seatNo: row[headerMap["座號"]],
    className: row[headerMap["班級"]],
    studentId: String(row[headerMap["學號"]]).trim(),
    name: row[headerMap["姓名"]],
    maskedName: row[headerMap["匿名姓名"]],
    rawScores: rawScores,
    total: parseScore(row[headerMap["加權總分"]]),
    missing: row[headerMap["缺漏項目"]] || ""
  };
}

function resolveScoreColumn(headerMap, scoreItem) {
  const aliases = {
    "線上小考": ["線上小考", "線上小考平均"],
    "Zuvio test": ["Zuvio test", "Zuvio test平均", "ZUVIO test 平均"],
    "期中考": ["期中考", "期中考成績"],
    "期末考": ["期末考", "期末考成績"]
  };
  const candidates = aliases[scoreItem] || [scoreItem, `${scoreItem}平均`, `${scoreItem}成績`];
  for (let i = 0; i < candidates.length; i += 1) {
    if (headerMap[candidates[i]] !== undefined) return headerMap[candidates[i]];
  }
  return undefined;
}

function findHeaderColumn(sheet, headerText, headerRowIndex, fallbackIndex) {
  const values = sheet.getDataRange().getDisplayValues();
  const row = values[headerRowIndex] || [];
  const index = row.findIndex((value) => String(value).trim() === headerText);
  return index >= 0 ? index : fallbackIndex;
}

function readQuizDetails(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(CONFIG.QUIZ_SHEET);
  const values = sheet.getDataRange().getDisplayValues();
  const titles = values[0] || [];
  const rows = values.slice(2);
  const details = {};

  rows.forEach((row) => {
    const studentId = String(row[4] || "").trim();
    if (!studentId) return;
    details[studentId] = [];
    for (let column = 6; column < titles.length; column += 3) {
      const title = titles[column];
      if (!title || title === "線上小考平均") continue;
      details[studentId].push({
        name: title,
        score: parseScore(row[column]),
        time: row[column + 1] || "",
        attempts: row[column + 2] || ""
      });
    }
  });

  return details;
}

function readQuizDetailsForStudent(spreadsheet, targetStudentId) {
  const sheet = spreadsheet.getSheetByName(CONFIG.QUIZ_SHEET);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 3 || lastColumn < 7) return [];

  const titles = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0] || [];
  const idRange = sheet.getRange(3, 5, lastRow - 2, 1);
  const match = idRange.createTextFinder(targetStudentId).matchEntireCell(true).findNext();
  if (!match) return [];

  const row = sheet.getRange(match.getRow(), 1, 1, lastColumn).getDisplayValues()[0];

  const details = [];
  for (let column = 6; column < titles.length; column += 3) {
    const title = titles[column];
    if (!title || title === "線上小考平均") continue;
    details.push({
      name: title,
      score: parseScore(row[column]),
      time: row[column + 1] || "",
      attempts: row[column + 2] || ""
    });
  }
  return details;
}

function readZuvioDetails(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(CONFIG.ZUVIO_SHEET);
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0] || [];
  const rows = values.slice(1);
  const details = {};

  rows.forEach((row) => {
    const studentId = String(row[4] || "").trim();
    if (!studentId) return;
    details[studentId] = [];
    for (let column = 7; column < headers.length; column += 1) {
      if (!headers[column]) continue;
      details[studentId].push({
        name: headers[column],
        score: parseScore(row[column])
      });
    }
  });

  return details;
}

function readZuvioDetailsForStudent(spreadsheet, targetStudentId) {
  const sheet = spreadsheet.getSheetByName(CONFIG.ZUVIO_SHEET);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 8) return [];

  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0] || [];
  const idRange = sheet.getRange(2, 5, lastRow - 1, 1);
  const match = idRange.createTextFinder(targetStudentId).matchEntireCell(true).findNext();
  if (!match) return [];

  const row = sheet.getRange(match.getRow(), 1, 1, lastColumn).getDisplayValues()[0];

  const details = [];
  for (let column = 7; column < headers.length; column += 1) {
    if (!headers[column]) continue;
    details.push({
      name: headers[column],
      score: parseScore(row[column])
    });
  }
  return details;
}

function calculateWeightedTotal(rawScores, scoreItems, weights) {
  let hasAnyScore = false;
  const weighted = scoreItems.reduce((sum, item) => {
    if (rawScores[item] === "") return sum;
    const score = Number(rawScores[item]);
    if (Number.isNaN(score)) return sum;
    hasAnyScore = true;
    return sum + score * (weights[item] || 0);
  }, 0);

  return hasAnyScore ? round2(weighted) : "";
}

function attachRanks(students, scoreItems) {
  const excludedRankItems = { "線上小考": true, "Zuvio test": true };
  const metrics = scoreItems.filter((item) => !excludedRankItems[item]).concat(["total"]);
  students.forEach((student) => {
    student.ranks = {};
    metrics.forEach((metric) => {
      const valueGetter = metric === "total"
        ? (row) => row.total
        : (row) => row.rawScores[metric];
      student.ranks[metric] = {
        classRank: rankInGroup(students, valueGetter, "courseClass", student)
      };
    });
  });
}

function attachRankTrends(students) {
  students.forEach((student) => {
    const totalRank = Number(student.ranks.total && student.ranks.total.classRank);
    const midtermRank = Number(student.ranks["期中考"] && student.ranks["期中考"].classRank);
    if (Number.isNaN(totalRank) || Number.isNaN(midtermRank)) {
      student.rankTrend = "";
      return;
    }
    const delta = midtermRank - totalRank;
    student.rankTrend = {
      delta: delta,
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "same"
    };
  });
}

function buildClassGroups(students, settings) {
  const groups = {};
  students.forEach((student) => {
    const key = student.courseClass || "未分班";
    if (!groups[key]) groups[key] = [];
    groups[key].push(student);
  });

  return Object.keys(groups).sort().map((courseClass) => {
    const list = groups[courseClass].sort((a, b) => Number(a.seatNo || 0) - Number(b.seatNo || 0));
    const totals = numericScores(list.map((student) => student.total));
    const sum = totals.reduce((acc, score) => acc + score, 0);
    const passCount = countPassing(list, settings.passingScore);
    return {
      className: courseClass,
      courseClass: courseClass,
      count: list.length,
      average: totals.length ? sum / totals.length : "",
      max: totals.length ? Math.max.apply(null, totals) : "",
      min: totals.length ? Math.min.apply(null, totals) : "",
      passCount: passCount,
      passRate: list.length ? passCount / list.length : 0,
      distribution: buildDistribution(list, settings.maxScore),
      itemSummaries: buildItemSummaries(list, settings),
      students: list
    };
  });
}

function buildItemSummaries(students, settings) {
  const rankableItems = settings.scoreItems.filter((item) => item !== "線上小考" && item !== "Zuvio test");
  return rankableItems.concat(["total"]).map((item) => {
    const label = item === "total" ? "總分統計" : item;
    const getter = item === "total" ? (student) => student.total : (student) => student.rawScores[item];
    const scored = students.map((student) => ({
      studentId: student.studentId,
      name: student.name,
      className: student.className,
      courseClass: student.courseClass,
      score: parseScore(getter(student)),
      rank: student.ranks[item] ? student.ranks[item].classRank : ""
    })).filter((student) => student.score !== "");
    const scores = numericScores(scored.map((student) => student.score));
    const sum = scores.reduce((acc, score) => acc + score, 0);
    const passCount = scores.filter((score) => score >= settings.passingScore).length;
    const sorted = scored.slice().sort((a, b) => Number(b.score) - Number(a.score));
    const topCount = Math.max(1, Math.ceil(sorted.length * 0.1));

    return {
      key: item,
      label: label,
      average: scores.length ? sum / scores.length : "",
      passCount: passCount,
      passRate: scores.length ? passCount / scores.length : 0,
      distribution: buildDistributionFromScores(scores, item === "total" ? settings.maxScore : 100),
      topStudents: sorted.slice(0, topCount),
      lowStudents: sorted.slice(-topCount).reverse()
    };
  });
}

function buildDistribution(students, maxScore) {
  return buildDistributionFromScores(numericScores(students.map((student) => student.total)), maxScore);
}

function buildDistributionFromScores(scores, maxScore) {
  const binSize = 10;
  const bins = [];
  for (let start = 0; start < maxScore; start += binSize) {
    const end = Math.min(maxScore, start + binSize);
    bins.push({ label: `${start}-${end}`, min: start, max: end, count: 0 });
  }

  scores.forEach((score) => {
    if (Number.isNaN(score)) return;
    const bin = bins.find((item, index) => {
      const isLast = index === bins.length - 1;
      return score >= item.min && (isLast ? score <= item.max : score < item.max);
    });
    if (bin) bin.count += 1;
  });

  return bins.map((bin) => ({ label: bin.label, count: bin.count }));
}

function rankInGroup(students, valueGetter, groupKey, target) {
  const score = parseRankScore(valueGetter(target));
  if (Number.isNaN(score)) return "";
  return 1 + students.filter((student) => {
    const otherScore = parseRankScore(valueGetter(student));
    return student[groupKey] === target[groupKey] && !Number.isNaN(otherScore) && otherScore > score;
  }).length;
}

function readSettings() {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SETTINGS_SHEET);
  const values = sheet.getDataRange().getDisplayValues();
  const map = {};
  values.slice(1).forEach((row) => {
    if (row[0]) map[String(row[0]).trim()] = row[1];
  });

  const scoreItems = String(map.ScoreItems || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!scoreItems.length) throw new Error("Settings 分頁缺少 ScoreItems 設定。");

  return {
    scoreItems: scoreItems,
    primaryColor: map.PrimaryColor || "#1f5f8b",
    passingScore: Number(map.PassingScore || 54),
    maxScore: Number(map.MaxScore || 90)
  };
}

function readWeights() {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SETTINGS_SHEET);
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const weightsSheet = spreadsheet.getSheetByName(CONFIG.WEIGHTS_SHEET) || sheet;
  const values = weightsSheet.getDataRange().getDisplayValues();
  const weights = {};
  values.slice(1).forEach((row) => {
    if (!row[0]) return;
    weights[String(row[0]).trim()] = parseWeight(row[1]);
  });
  return weights;
}

function weightsToList(weights) {
  return Object.keys(weights).map((name) => ({
    name: name,
    weight: weights[name]
  }));
}

function requireAdmin(params, handler) {
  const token = String(params.token || "");
  const username = verifyToken(token);
  if (!username) return { ok: false, message: "請重新登入後台。" };
  return handler(params, username);
}

function readAdminUsers() {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.ADMIN_SHEET);
  const values = sheet.getDataRange().getDisplayValues();
  return values.slice(1).filter((row) => row[0] && row[1]).map((row) => ({
    username: String(row[0]).trim(),
    password: String(row[1]),
    displayName: row[2] || row[0]
  }));
}

function makeHeaderMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    if (header) map[String(header).trim()] = index;
  });
  return map;
}

function countPassing(students, passingScore) {
  return students.filter((student) => {
    const score = parseRankScore(student.total);
    return !Number.isNaN(score) && score >= passingScore;
  }).length;
}

function createToken(username) {
  const issuedAt = Date.now();
  const body = `${username}:${issuedAt}`;
  const signature = sign(body);
  return Utilities.base64EncodeWebSafe(`${body}:${signature}`);
}

function verifyToken(token) {
  try {
    const raw = Utilities.newBlob(Utilities.base64DecodeWebSafe(token)).getDataAsString();
    const parts = raw.split(":");
    if (parts.length !== 3) return "";
    const username = parts[0];
    const issuedAt = Number(parts[1]);
    const signature = parts[2];
    if (!username || !issuedAt || Date.now() - issuedAt > 8 * 60 * 60 * 1000) return "";
    return sign(`${username}:${issuedAt}`) === signature ? username : "";
  } catch (error) {
    return "";
  }
}

function sign(value) {
  const bytes = Utilities.computeHmacSha256Signature(value, CONFIG.TOKEN_SECRET);
  return bytesToHex(bytes);
}

function bytesToHex(bytes) {
  return bytes.map((byte) => {
    const value = (byte + 256) % 256;
    return value.toString(16).padStart(2, "0");
  }).join("");
}

function parseScore(value) {
  if (value === "" || value === null || value === undefined || value === "缺考" || value === "未作答") return "";
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isNaN(number) ? value : number;
}

function parseRankScore(value) {
  if (value === "" || value === null || value === undefined) return NaN;
  const number = Number(value);
  return Number.isNaN(number) ? NaN : number;
}

function numericScores(values) {
  return values.map(parseRankScore).filter((score) => !Number.isNaN(score));
}

function parseWeight(value) {
  if (typeof value === "number") return value;
  const text = String(value || "").trim();
  if (!text) return 0;
  if (text.endsWith("%")) return Number(text.replace("%", "")) / 100;
  const number = Number(text);
  return Number.isNaN(number) ? 0 : number;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function output(callback, payload) {
  if (callback) {
    if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) callback = "callback";
    return ContentService
      .createTextOutput(`${callback}(${JSON.stringify(payload)});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
