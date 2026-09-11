# AI 全科智慧學習助手

這是一個用於升大學推甄展示的學習助手專案。重點是讓學生不只看到答案，也能看到解題步驟和使用的方法。

## 支援科目

- 數學
- 基本電學
- 電子學
- 數位邏輯
- 程式設計
- 微處理機
- 國文
- 英文

每個科目都有自己的 `prompt.js`、`solver.js` 和 fake AI 測試。`src/subjects/registry.js` 負責將 API 請求分派到正確的科目，沒有建立複雜的多層框架。

## 執行方式

1. 安裝相依套件：`npm install`
2. 設定 `GEMINI_API_KEY`
3. 執行：`npm start`
4. 開啟 `http://127.0.0.1:3000`

可以用 `GEMINI_MODEL` 更換模型；沒有設定時使用專案的預設模型。程式碼中沒有硬編 API key。

## 部署真 AI 版本

[一鍵部署到 Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fj0932290708-ai%2FAI-Learning-Assistant%2Ftree%2Ffeature%2Fintegration) · [完整部署步驟](DEPLOY.md)

設定檔使用免費 Node Web Service，從 `feature/integration` 部署。網頁與 AI API 共用同一服務，Gemini 金鑰在 Render 後端設定。GitHub Pages 維持示範版，正式 AI 版需使用部署後的網址。

## 安裝成 App

若要建立可分享的真 AI 版本，先依下方「部署真 AI 版本」完成後端部署，再從部署後的網址安裝。

用支援 PWA 的瀏覽器開啟網站後，按頁首的「安裝 App」。安裝完成後，電腦桌面或手機主畫面會出現「AI 學習助手」圖示。若瀏覽器沒有直接跳出視窗，可從瀏覽器選單選擇「安裝應用程式」或「加入主畫面」。

App 的頁面外殼可以離線開啟；AI 解題仍需要網路與後端 API。

## API 格式

`POST /api/solve`

```json
{
  "subject": "english",
  "method": "grammar",
  "question": "She go to school every day."
}
```

基本回應：

```json
{
  "success": true,
  "subject": "english",
  "method": "grammar",
  "steps": ["Identify the error", "Apply the grammar rule"],
  "answer": "She goes to school every day.",
  "explanation": "The verb must agree with the third-person singular subject."
}
```

使用 `auto` 時，AI 會回傳實際選用的 method，前端會顯示這個結果。

## 驗證

- `npm test`：科目測試、API 分派、輸入驗證、錯誤處理與前端結構
- `npm run check:syntax`：主要 JavaScript 檔案語法檢查

自動測試使用 fake AI，不會呼叫真實 Gemini API，所以不會消耗 API 額度。

## 目前邊界

- 圖片區目前只提供預覽，沒有假裝已完成 OCR。
- 本版專注於八科解題架構、結構化輸出、收藏與基本錯誤處理。
- 程式設計科只分析與回答程式問題，不會執行使用者提供的程式碼。
