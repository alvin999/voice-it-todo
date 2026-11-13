# 音賅 VoiceItTodo

> 「是不敢不想不音賅，再謝謝你 AI」

現代化、語音優先（Voice-First）的極簡待辦便利貼應用，採用 **Local-first + BYOK AI + Headless Cloudflare** 架構設計，無需綁定信用卡即可免費部署上線。

![音賅 VoiceItTodo 畫面預覽](./screenshots/screenshot.png)

## 💡 命名緣由

- **音賅**：
  1. **語音與言簡意賅**：「音」代表語音優先（Voice-First），「賅」取自「言簡意賅」，呼應將一段口語自動拆解為精簡標題與脈絡備註的設計理念。
  2. **雙重諧音**：與 To-Do「**應該**」要做的事諧音；同時也呼應台灣常見 ㄣ / ㄥ 不分把「應該」唸寫成「**因該**」的趣味。
- **VoiceItTodo**：從便利貼 *PostIt* 轉化為用說的 *VoiceIt*，開口就能記下待辦。
- **Slogan「是不敢不想不音賅，再謝謝你 AI」**：改編自《謝謝你的愛》歌詞諧音——**不敢**忘記待辦與當初的脈絡、**不想**打開繁瑣軟體打字填欄位，那還**不「音賅」**（開口用說的記下來）？剩下的標題拆解、標籤與脈絡整理通通交給語意解析，最後**再謝謝你 AI**！

## ✨ 核心設計理念

一般待辦工具欄位過於繁瑣，而傳統便條紙若只記一行字，過幾天回來往往忘記「當初為什麼要記這件事」。

**音賅 VoiceItTodo** 的解法：
- **語音快速捕捉**：內建 Web Speech API（`zh-TW`）即時語音輸入，打開即可口述。
- **自動拆解脈絡（一般整理 / 智慧解析）**：支援自備 AI 金鑰（BYOK：Ollama / Groq / Gemini / OpenAI / Claude）進行語意拆解，未設定金鑰時自動降級為本機整理，將口語拆成**精簡標題**、**脈絡備註**、**時間／情境標籤**，並保留**原始逐字稿**（漸進式展開查看，主畫面維持清爽）。
- **Local-first 免登入即用**：預設將資料儲存在瀏覽器本機，零延遲、離線可用。
- **Headless 雲端同步**：透過 `X-Space-Key` 隔離不同使用者空間，可選配連接 **Cloudflare Workers + D1** 實現跨裝置同步或供 iOS 捷徑等外部工具無頭寫入。

## 🛠️ 技術架構

### 前端（專案根目錄 `src/`）
- React 19 + TypeScript + Vite
- `@dnd-kit`（流暢拖曳排序）
- `lucide-react`（現代化圖示）
- Web Speech API（免後端成本的即時語音輸入）
- BYOK AI 解析（支援本機 Ollama 或各大雲端 LLM API）

### Headless 後端 (`worker/`)
- **Cloudflare Workers** + **Hono**（Edge API，零冷啟動）
- **Cloudflare D1**（Serverless SQLite，免費版 500 MB / 單庫、5 GB 總空間，免綁信用卡）
- **Cloudflare Workers AI**（選配，用於語意拆解強化）

## 🚀 本地開發

### 1. 啟動前端（純 Local-first 模式即可運作）
```bash
npm install
npm run dev
```

### 2. 啟動 Headless Worker（選配）
```bash
cd worker
npm install
npm run db:migrate:local
npm run dev
```

## ☁️ 部署到 Cloudflare（完全免費、免綁信用卡）

### 1. 部署 Headless API (Workers + D1)
```bash
cd worker
npx wrangler login
npx wrangler d1 create postittodo-db
# 將終端機顯示的 database_id 填入 worker/wrangler.toml
npm run db:migrate:remote
npm run deploy
```

### 2. 部署前端 (Cloudflare Pages)
1. 前往 Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages**，連接此 GitHub Repo。
2. 建置設定：
   - **Root directory**：留空（專案根目錄）
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **環境變數（選填）**: `VITE_API_URL` = 你的 Worker 網址（例如 `https://voice-it-todo-api.xxx.workers.dev`）
