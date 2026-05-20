# 成績查詢系統

這是一套部署在 GitHub Pages 的成績查詢前台，搭配 Google Apps Script 讀取 Google Sheet 成績資料。  
系統分成兩個入口：

- `index.html`：學生查詢個人成績
- `admin.html`：教師成績後台

成績資料不寫在前端檔案中，前端只透過 Apps Script Web App 讀取 Google Sheet。

## 目前功能

### 學生入口

- 學生輸入學號與姓名查詢個人成績。
- 查詢結果包含：
  - 學號
  - 授課班級
  - 班級
  - 線上小考平均
  - Zuvio test 平均
  - 期中考
  - 期末考
  - 目前得到的總成績
- 線上小考明細包含：
  - 小考名稱
  - 最高成績
  - 時間總和
  - 作答次數
- Zuvio test 明細會列出每次測驗成績。
- 學生頁初始畫面置中，查詢後改為查詢區與結果區的響應式版面。
- 首頁會顯示 `線上小考班級完成度排行`，只呈現班級彙總，不回傳學生姓名、學號或個別作答紀錄。

### 教師後台

- 從學生入口左上角 Logo 連點 5 下進入 `admin.html`。
- 後台登入帳號密碼由 Google Sheet 的 `管理者帳號` 分頁管理。
- 管理人員每次登入會寫入 `管理者登入紀錄`，包含登入結果、IP、裝置、平台、語系、時區、螢幕與 UserAgent。
- 登入後先選考試項目，再選全校或班級。
- 考試項目支援：
  - 線上小考平均
  - 線上小考每一次
  - Zuvio test 平均
  - Zuvio test 每一次
  - 期中考
  - 期末考
  - 學期總分
- 後台統計包含：
  - 人數
  - 平均
  - 最高
  - 最低
  - 分數區間長條圖
  - 示警名單
  - 學生明細列表
- 學生列表包含：
  - 本次分數
  - 班級排名
  - 全校排名
  - 狀態
- 點學生列會在該列下方展開學生完整明細；點另一位學生時，上一位會自動收起。
- 班級頁提供 `匯出全部成績`，可下載該班完整 CSV。
- 後台包含 `線上小考完成度` 模組：
  - 班級完成度排行
  - 班級學生完成度明細
  - 完成度達標分數、計算測驗與計算班級設定
  - `super_admin` 可修改完成度設定，`teacher` 僅能讀取

## 檔案結構

```text
.
├── index.html          # 學生查詢入口
├── admin.html          # 教師後台
├── config.js           # 前端設定
├── assets/
│   ├── app.js          # 學生頁邏輯
│   ├── admin.js        # 教師後台邏輯
│   ├── shared.js       # 共用設定與 API 請求
│   └── styles.css      # 共用樣式與響應式設計
└── gas/
    └── Code.gs         # Google Apps Script 後端
```

## Google Sheet 必要分頁

### `分數總表`

系統主要成績來源。學生查詢與後台統計都會先讀取這個分頁。

必要欄位：

- `校區`
- `修課班級`
- `座號`
- `班級`
- `學號`
- `姓名`
- `匿名姓名`
- `線上小考平均`
- `Zuvio test平均`
- `期中考`
- `期末考`
- `加權總分`
- `缺漏項目`

實際成績項目會依 `Settings` 的 `ScoreItems` 設定讀取。  
若日後新增成績項目，請同步更新 `Settings`、`Weights` 與 `分數總表` 欄位。

### `Settings`

用來控制系統設定。

建議欄位格式：

| Key | Value |
| --- | --- |
| 課程名稱 | 114-2 微生物與免疫學及實驗成績 |
| ScoreItems | 線上小考,Zuvio test,期中考,期末考 |
| PrimaryColor | #1f5f8b |
| PassingScore | 60 |
| MaxScore | 100 |

目前後台示警輸入框預設為：

- 均值偏差：`15%`
- 不及格門檻：`60`

### `Weights`

用來設定各項成績權重。

建議欄位格式：

| ScoreItem | Weight | Note |
| --- | --- | --- |
| 線上小考 | 15% |  |
| Zuvio test | 15% |  |
| 期中考 | 30% |  |
| 期末考 | 30% |  |

計算公式：

```text
目前得到的學期總成績 = Σ(各項原始分數 × 該項權重)
```

如果權重合計為 90%，最高分就是 90 分。  
程式不再額外硬乘 `0.9`，所有權重都以 `Weights` 分頁為準。

### `線上小考成績`

用來讀取線上小考每次明細。

目前系統假設每次小考由三欄組成：

- 成績
- 時間總和
- 作答次數

學生頁與後台都會顯示每次小考成績；學生頁另外顯示時間總和與作答次數。

### `students`

完成度模組使用的學生名冊長表，已由 `修課名單` 建立公式同步。

必要欄位：

| className | studentId | name |
| --- | --- | --- |
| N511 | 114510501 | 王又玄 |

### `quizAttempts`

完成度模組使用的線上小考作答長表，已由 `線上小考成績` 建立公式同步。

必要欄位：

| className | studentId | name | quizId | score | time | attempts |
| --- | --- | --- | --- | --- | --- | --- |
| N511 | 114510501 | 王O玄 | Ch1-2 | 82 | 1 小時 31 分鐘 53 秒 | 4 |

GAS 仍會直接讀取 `線上小考成績` 作為主要來源，`quizAttempts` 保留為後續檢視與整合使用。

### `completionSettings`

完成度計算設定。

| Key | Value | 說明 |
| --- | --- | --- |
| passingScore | 60 | 線上小考達標分數 |
| enabledQuizIds | Ch1-2,Ch3-4 | 參與完成度計算的測驗，以逗號分隔 |
| enabledClassNames | N511,N512 | 參與完成度計算的班級，以逗號分隔 |

若 `enabledQuizIds` 為空，前台排行會顯示 `目前尚未設定計算項目`，不會報錯。
若 `enabledClassNames` 為空，前台排行會顯示 `目前尚未設定計算班級`，不會報錯。

### `Zuvio test`

用來讀取 Zuvio test 每次成績。

後台可選擇：

- Zuvio test 平均
- Zuvio test 每一次

學生頁會列出每次 Zuvio test 成績。

### `管理者帳號`

用來設定教師後台登入帳號。

建議欄位：

| 帳號 | 密碼 | 使用者 | 更新時間 | 角色 |
| --- | --- | --- | --- | --- |
| teacher_account | teacher_password | 教師名稱 |  | super_admin |

這個分頁應只允許 Google Sheet 所有者或授權管理者編輯。

角色說明：

- `super_admin`：最高權限管理者，可修改完成度設定。
- `teacher`：一般教師，只能讀取統計資料與明細，不可修改設定。

後端儲存完成度設定時會再次檢查角色，不只依賴前端畫面 disabled。

### `管理者登入紀錄`

管理人員登入時自動建立並追加紀錄。

欄位包含：

- `時間戳記`
- `帳號`
- `顯示名稱`
- `角色`
- `結果`
- `失敗原因`
- `IP位置`
- `裝置`
- `平台`
- `瀏覽器語系`
- `其他語系`
- `時區`
- `螢幕尺寸`
- `視窗尺寸`
- `UserAgent`

IP 由前端瀏覽器 best effort 取得；若網路或瀏覽器阻擋外部 IP 查詢，會記錄為 `無法取得`。

## 線上小考完成度規則

### 單一測驗完成

```text
學生在該測驗的最高分 >= completionSettings.passingScore
```

### 班級完成率

```text
班級完成率 = 全班實際完成項目數 / (班級人數 × 勾選測驗數) × 100%
```

完成度排行只計算 `completionSettings.enabledClassNames` 中勾選的班級。

### 班級排行排序

依下列優先順序排序：

1. 完成率：高到低
2. 班級平均：高到低
3. 未完成項目數：少到多

## 排名規則

後台會同時顯示兩種排名：

- `班級排名`：依學生的 `修課班級` 計算
- `全校排名`：依全部學生計算

排名會依目前選取的項目變動，例如：

- 線上小考某一次
- Zuvio test 某一次
- 期中考
- 期末考
- 學期總分

同分排名採競賽排名邏輯：只計算有多少人分數高於該生，再加 1。

## 後台示警規則

教師後台有兩個可直接輸入的示警條件：

- `均值偏差`：預設 `15%`
- `不及格`：預設低於 `60` 分

學生只要符合其中一個條件，就會被列入示警：

```text
低於班級/範圍平均 × (1 - 均值偏差%)
或
低於不及格門檻
```

例如平均 80 分、均值偏差 15%、不及格門檻 60：

- 低於 68 分會示警
- 低於 60 分也會示警

## 班級匯出

教師後台選擇單一班級後，會出現 `匯出全部成績` 按鈕。

匯出的 CSV 包含：

- 修課班級
- 班級
- 座號
- 學號
- 姓名
- 各項成績平均/主成績
- 目前得到的學期總成績
- 線上小考每次成績
- Zuvio test 每次成績

選擇 `全校` 時不顯示班級匯出按鈕。

## 部署流程

### 1. 設定 Google Apps Script

1. 打開成績 Google Sheet。
2. 進入 `擴充功能` → `Apps Script`。
3. 將 `gas/Code.gs` 內容貼到 Apps Script。
4. 修改 `CONFIG.SPREADSHEET_ID` 為正式 Google Sheet ID。
5. 修改 `CONFIG.TOKEN_SECRET`，換成只有管理者知道的長隨機字串。
6. 按 `部署` → `新增部署作業`。
7. 類型選 `網路應用程式`。
8. 執行身分選 `我`。
9. 存取權依需求設定，常見設定是 `知道連結的任何人`。
10. 複製 Web App URL。

### 2. 設定前端

修改 `config.js`：

```js
window.GRADE_PORTAL_CONFIG = {
  SCRIPT_URL: "你的 Apps Script Web App URL",
  COURSE_TITLE: "載入中…",
  SHEET_URL: "Google Sheet 連結",
  REQUIRE_STUDENT_NAME: true
};
```

`COURSE_TITLE` 是載入期間的備援文字；學生入口實際顯示會優先讀取 Google Sheet 中 `課程名稱` 的設定值。教師後台會顯示為 `課程名稱-教師後台`。

### 3. 部署 GitHub Pages

1. 將整個資料夾推到 GitHub repository。
2. 到 GitHub repository 的 `Settings` → `Pages`。
3. 選擇要部署的 branch 與 root folder。
4. 等 GitHub Pages 完成部署。

## 使用方式

### 學生

1. 進入 GitHub Pages 的 `index.html`。
2. 輸入學號與姓名。
3. 查看個人成績、排名、線上小考明細與 Zuvio test 明細。

### 教師

1. 進入學生查詢頁。
2. 左上角 Logo 連續點 5 下。
3. 進入 `admin.html` 後登入後台。
4. 先選考試項目或學期總分。
5. 再選全校或班級。
6. 查看統計、分布圖、示警與學生明細。
7. 如需班級資料，選擇單一班級後按 `匯出全部成績`。

## 響應式設計

目前 `index.html` 和 `admin.html` 都支援桌機與手機：

- 手機會改為單欄布局。
- 表格欄位較多時可橫向捲動。
- 後台統計卡片、選單與按鈕會自動換行。
- 分布圖會在小螢幕縮小間距與文字。

## 維護注意事項

- 不要把成績資料直接寫進前端檔案。
- `config.js` 可以公開，但 `TOKEN_SECRET` 只能放在 `gas/Code.gs`，不可放到前端。
- 若重新部署 Apps Script，Web App URL 可能改變，記得同步更新 `config.js`。
- 修改 Google Sheet 欄位名稱時，請確認 `分數總表`、`Settings`、`Weights` 與 GAS 讀取邏輯仍一致。
- 管理者帳號只應在 Google Sheet 的 `管理者帳號` 分頁維護。

## 快速檢查

修改程式後可在本機執行語法檢查：

```bash
node --check assets/app.js
node --check assets/admin.js
node --check assets/shared.js
node -e "new Function(require('fs').readFileSync('gas/Code.gs','utf8')); console.log('Code.gs ok')"
```
