# AI 全科智慧學習助手

提供八科文字解題、圖片題目辨識、步驟解說、收藏與可安裝的網頁 App，採用 Express 與 Gemini API。

- [開啟正式 AI 版](https://ai-learning-assistant-pnma.onrender.com/)
- [互動展示版](https://j0932290708-ai.github.io/AI-Learning-Assistant/)：使用固定示範答案，首頁提供正式版入口。
- [部署說明](DEPLOY.md)

## 使用方式

1. 選擇數學、國文、英文、基本電學、電子學、數位邏輯、程式設計或微處理機。
2. 輸入題目，或在圖片區選擇圖片／用手機拍照。
3. 圖片題目請按「辨識圖片」，核對並修改辨識結果，再按「使用這段文字作為題目」。這一步會取代題目欄的文字。
4. 選擇解題方法，不確定時使用「AI 自動選擇」，再按「開始 AI 解題」。
5. 閱讀步驟、答案和表格，按「收藏」保存題目與最終答案。

圖片支援 PNG、JPEG、WebP，最大 5 MB、前端預覽最多 2000 萬像素。只在按下辨識後送至後端及 Google Gemini，本站不把圖片寫入檔案或題庫。請拍清楚完整題目，不清楚的文字會提示重新核對。HEIC 等格式請先轉成 JPEG 或 PNG。

## 安裝到手機

- Android：用 Chrome 開啟正式網址，選單 ⋮ →「加到主畫面」→「安裝」，也可按網站的「安裝 App」。
- iPhone：用 Safari 開啟正式網址，分享 →「加入主畫面」，若有「以網頁 App 開啟」請保持開啟，再按「加入」。
- 不安裝也能直接使用。文字解題與圖片辨識需要網路；已快取的頁面和本機題庫可離線開啟。
- 收藏保存在目前裝置、目前網址的瀏覽器中，不會自動同步到其他手機，也不會從展示版自動搬到正式版。
- 免費主機閒置後首次開啟可能需約一分鐘；AI 暫時忙碌時可稍後重試。

官方安裝說明：[Apple](https://support.apple.com/guide/iphone/iph42ab2f3a7/ios)、[Google Chrome](https://support.google.com/chrome/answer/9658361?hl=zh-Hant&co=GENIE.Platform%3DAndroid)。

## 本機執行

1. 使用 Node.js 20 以上版本，執行 `npm ci`。
2. 依 `.env.example` 設定 `GEMINI_API_KEY`，不要把金鑰放入前端或提交到版本庫。
3. 執行 `npm start`，開啟 `http://127.0.0.1:3000`。

`GEMINI_MODEL` 可指定模型。八科各自有 `prompt.js`、`solver.js` 與 fake AI 測試，統一由 `src/subjects/registry.js` 分派。

主要模型回報暫時無法服務（503）時，會用 `gemini-3.7-flash` 備援一次，以 low thinking 減少回應等待；兩次模型呼叫共用 60 秒上限與取消訊號。可設定 `GEMINI_FALLBACK_MODEL` 更換備援模型，或設為 `none` 停用。額度、認證等其他錯誤不會觸發備援。

## API

`POST /api/solve` 接受 `{ "subject": "english", "method": "grammar", "question": "She go to school every day." }`，回傳 `success`、`subject`、實際 `method`、`steps`、`answer`，以及科目需要的 `explanation`、`table` 或 `code`。

`POST /api/recognize` 接受 `{ "mimeType": "image/png", "data": "純 base64 圖片資料" }`，回傳 `{ "success": true, "text": "辨識文字", "warnings": [] }`。辨識不到題目時 `text` 可以為空字串，由前端請使用者重拍。資料格式、檔案標頭及解碼後大小均需通過驗證；辨識與解題共用限流、同時請求數及逾時保護。

回應包含 `requestId`。前端不會執行 AI 回傳的 HTML 或程式碼。

## 驗證與限制

- `npm test`：八科、HTTP API、圖片驗證、取消與逾時、前端互動及離線快取測試。
- `npm run check:syntax`：主要程式語法檢查。
- 自動化測試使用 fake AI，不代表真實模型準確率；實際圖片辨識另以正式網站驗收。
- AI 的解題、辨識及引用均可能出錯，請核對原題與可靠資料。圖解按鈕為已標示的規則式功能，僅支援可確認的格式。
- 收藏目前保留最終答案，未保存完整步驟與表格。
- 手機尺寸的瀏覽器驗證不等於實體裝置安裝驗收；實體手機是否安裝成功需由裝置確認。

