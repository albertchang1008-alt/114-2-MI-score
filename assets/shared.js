function getConfig() {
  return window.GRADE_PORTAL_CONFIG || {};
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value ?? "-";
}

function applyChrome() {
  const config = getConfig();
  setText("course-title", config.COURSE_TITLE || "成績查詢");
  const sheetLink = document.getElementById("sheet-link");
  if (sheetLink && config.SHEET_URL) sheetLink.href = config.SHEET_URL;
}

function requestApi(params) {
  const config = getConfig();
  if (!config.SCRIPT_URL) {
    return Promise.reject(new Error("尚未設定 Apps Script Web App URL。"));
  }

  return new Promise((resolve, reject) => {
    const callbackName = `gradePortalCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const url = new URL(config.SCRIPT_URL);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.searchParams.set(key, value);
    });
    url.searchParams.set("callback", callbackName);

    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("連線逾時，請稍後再試。"));
    }, 30000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (payload) => {
      cleanup();
      if (payload && payload.ok) {
        resolve(payload);
      } else {
        reject(new Error(payload?.message || "讀取資料失敗。"));
      }
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("無法連到資料服務。"));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}
