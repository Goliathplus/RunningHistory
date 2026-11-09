# 世界疆域變遷

[English](README.md) | 繁體中文

互動式 3D 地球儀，呈現西元前 3400 年至西元 2024 年的政權疆域。介面預設為 English，可切換繁體中文。
React + TypeScript + globe.gl（Three.js）。

## 啟動

需要 Node.js 20 以上。

```bash
npm install
npm run dev        # 開發模式，開啟終端機顯示的網址
npm run build && npm run preview   # 正式版本
```

資料已包含在 `public/data/`，不需另外下載。網址參數：`?year=-500&paused&lang=en`。

## 操作

| 動作 | 方式 |
|---|---|
| 播放／暫停 | 播放鈕或空白鍵 |
| 調整速度 | 10–250 年／秒 |
| 移動時間 | 拖曳時間軸；← → 每次 10 年，按住 Shift 每次 100 年 |
| 旋轉、縮放 | 拖曳、滾輪或雙指 |
| 查看政權 | 滑過顯示名稱與年代，點擊看詳情 |
| 切換語言 | 右上角選單（選擇會被記住；預設 English） |

## 資料與不確定性

疆域來自 [Cliopatria v0.2.1](https://github.com/Seshat-Global-History-Databank/cliopatria)（Seshat，CC BY 4.0；[論文](https://doi.org/10.1038/s41597-025-04516-9)）。

- **西元前 3500–前 3401 年是空白**：資料集最早的紀錄是西元前 3400 年，此段不繪製疆域。
- **資料截至 2024 年。**
- 只顯示資料集在該年實際有的紀錄，不內插，也不用最近資料填補。
- 空白的陸地代表資料集沒有多邊形，不代表沒有社會或政治組織。
- 邊界是估計值。資料集沒有逐筆信心值，所以介面不顯示信心分數。
- 灰色陸地是現代海岸線，只作定位，不含現代國界。

`(British Empire)` 這類括號名稱是成員的聯集容器，該年已有成員紀錄時會隱藏容器，避免重複疊色。

## 戰役圖層

開啟右上角的「戰役」，可查看當前年代前 25 年內的戰役（共人工挑選 154 場）。選定後會跳到該年、暫停播放、以虛線連到戰場，高亮該年有疆域紀錄的交戰方，並依時間順序連接同一場戰爭的戰役。日期與座標取自 Wikidata；交戰方、結果與戰爭分組整理於 `scripts/battles-curated.txt`，以 `NODE_USE_ENV_PROXY=1 node scripts/build-battles.mjs` 重建。收錄為編輯選擇，並非重要性排名。

## 譯名

英文使用資料集原名。繁中譯名取自 Wikidata，因部分 ID 指向錯誤實體（時期、戰爭、人物），已逐筆檢視並以 `scripts/zh-overrides.json` 修正 307 筆；54 個政權沒有可靠譯名，顯示原名。

新增語言：加入 `src/i18n/<lang>.json`，在 `src/i18n/index.tsx` 註冊，並於資料管線提供經校對的政權譯名。

## 線上版本

https://goliathplus.github.io/RunningHistory/

以 `npm run build:pages` 建置後，將 `dist/` 發布到 `gh-pages` 分支。

## 測試

```bash
npm test                               # 單元測試
npm run build && npm run test:e2e      # 瀏覽器測試（可用 CHROME_PATH 指定瀏覽器）
```

## 重建資料

```bash
npm run data                           # 下載固定版本並重新產生 public/data/
NODE_USE_ENV_PROXY=1 node scripts/fetch-zh-names.mjs   # 更新 Wikidata 譯名（需在 data 之後）
```

## 授權

資料授權見 [`public/data/NOTICE.md`](public/data/NOTICE.md)。公開部署時請保留頁面上的資料來源標示。
