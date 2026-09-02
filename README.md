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
