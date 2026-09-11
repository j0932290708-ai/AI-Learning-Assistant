# 部署真 AI 版本

目前 GitHub Pages 網址是互動示範。真 AI 版本將由 Render 同時提供網頁和 `/api/solve`，沿用現有八科程式，無須額外資料庫。

## 建立服務

1. [登入或註冊 Render](https://dashboard.render.com/)。
2. 點 [部署 AI 學習助手](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fj0932290708-ai%2FAI-Learning-Assistant%2Ftree%2Ffeature%2Fintegration)。此連結使用 `feature/integration` 的 `render.yaml`，不是 `main` 或 `gh-pages`。
3. 檢查服務為 `ai-learning-assistant`、Node、Free、新加坡區域；在 `GEMINI_API_KEY` 欄填入自己的金鑰。金鑰只放在 Render 後端設定，不要貼到聊天、README 或前端。
4. 確認畫面顯示 Free 後建立服務。若要求付費升級或付款資料，先停下確認，不要選付費方案。
5. 部署成功後取得 Render 配發的 HTTPS 網址，回傳該網址以便接續驗收。不要用猜測的服務網址。

若沒有 Gemini 金鑰，請在 [Google AI Studio 金鑰頁](https://aistudio.google.com/api-keys) 自行建立，並確認所選模型的可用額度。Render 免費主機不代表 Gemini API 用量一定免費。

## 如果一鍵部署沒有讀到設定

在 Render 選 New → Web Service，使用這個公開 repository：

`https://github.com/j0932290708-ai/AI-Learning-Assistant`

| 設定 | 值 |
| --- | --- |
| Branch | feature/integration |
| Root Directory | 留空 |
| Language | Node |
| Build Command | npm ci && npm test && npm run check:syntax |
| Start Command | npm start |
| Instance Type | Free |
| Health Check Path | /ready |
| Auto Deploy | Off |
| NODE_ENV | production |
| NODE_VERSION | 24 |
| HOST | 0.0.0.0 |
| GEMINI_MODEL | gemini-3.6-flash |
| GEMINI_API_KEY | 自行填入有效金鑰 |

PORT 由 Render 提供，不必手動填入。`HOST=0.0.0.0` 讓平台能轉送請求到程式。本機 `.env.example` 保持 `127.0.0.1`。

## 部署後驗收

- `/health` 應回傳 `{"ok":true}`。
- `/ready` 應回傳 `{"ready":true}`。這只表示後端已讀取金鑰，不代表金鑰有效、模型有額度或真 AI 已驗收。
- 開啟 Render 網址首頁，確認是 AI 解題模式；分別以八科題目測試答案、方法、步驟和錯誤提示。
- 手機上測試收藏與安裝。收藏保存在各網址的瀏覽器本機空間，原 GitHub Pages 收藏不會自動移到 Render。
- 真 AI 成功後，才在原 GitHub Pages 加入正式版連結。

免費服務閒置 15 分鐘會休眠，重新啟動可能約需一分鐘。展示前先開啟網站。自動部署目前關閉，後續修正需在 Render 手動部署最新提交。

目前未實作圖片辨識，照片仍只作本機預覽；不要把部署成功當成整個專案完成。

## 官方參考

- [Render Node/Express 部署](https://render.com/docs/deploy-node-express-app)
- [Render 一鍵部署與分支設定](https://render.com/docs/deploy-to-render)
- [Render Blueprint 設定](https://render.com/docs/blueprint-spec)
- [Render 免費服務限制](https://render.com/docs/free)
- [Gemini 模型](https://ai.google.dev/gemini-api/docs/models)
