# 成績查詢入口與後台

這個資料夾是一組可部署到 GitHub Pages 的靜態頁面，資料來源由 Google Apps Script 讀取 Google Sheet。

## 檔案

- `index.html`：學生查詢入口
- `admin.html`：教師後台摘要、班級分組、學生明細與圖像化統計
- `config.js`：前台設定
- `gas/Code.gs`：貼到 Google Apps Script 的後端程式

## 部署步驟

1. 打開成績 Google Sheet。
2. 進入「擴充功能」→「Apps Script」。
3. 將 `gas/Code.gs` 內容貼到 Apps Script。
4. 修改 `CONFIG.TOKEN_SECRET`，換成只有你知道的長字串。
5. 按「部署」→「新增部署作業」→ 類型選「網路應用程式」。
6. 執行身分選「我」，存取權可先選「知道連結的任何人」。
7. 複製 Web App URL，貼到 `config.js` 的 `SCRIPT_URL`。
8. 把這個資料夾推到 GitHub Pages。

## 教師入口

學生入口不顯示後台連結。教師端入口藏在左上角 logo：連續點 5 下會開啟登入視窗。管理者帳號密碼只由 Google Sheet 的「管理者帳號」分頁設定，且該分頁應只允許 Google Sheet 所有者編輯。

## 權重設定

新的統計後台由 Google Sheet 控制：

- `Settings`：設定 `ScoreItems`、`PrimaryColor`、`PassingScore`、`MaxScore`
- `Weights`：設定各 `ScoreItem` 的比例，GAS 直接用此比例加權；若權重合計 90%，最高總分就是 90 分
- `分數總表`：以公式自動彙整各原始成績分頁，GAS 後台與學生查詢都以此分頁作為主要分數來源
- 學生查詢流程：先從 `分數總表` 用學號與姓名驗證身分並取得主成績，通過後才讀取該生的分頁明細與排名資料

統計公式：`加權總分 = Σ(原始分數 * 權重%)`。若 `Weights` 合計為 90%，最高分即為 90 分。

## 安全提醒

GitHub Pages 是公開前台，真正的成績資料不要直接寫在前端檔案裡。這版只把資料讀取放在 Apps Script，學生入口需要學號與姓名一起比對；後台帳密由「管理者帳號」分頁管理。
