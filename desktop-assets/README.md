# 大方無虞 VoiceItTodo - 桌面版與多平台圖示範本指南

本目錄包含專案「大方無虞 VoiceItTodo」定案款 **【提案 B-圓：天青玉階・硃砂玉珠】** 的全解析度桌面端與多平台圖示資源。

---

## 📁 檔案清單與規格

| 檔案名稱 | 尺寸與格式 | 適用平台與場景 |
| :--- | :--- | :--- |
| **`app.ico`** | Windows 多層 ICO (封裝 256, 128, 64, 48, 32, 16) | Windows 桌面捷徑、工作列、視窗標題列、安裝檔 (NSIS/InnoSetup) |
| **`icon-1024.png`** | 1024×1024 Retina PNG | macOS App Store、高解析度安裝包、Tauri / Electron 打包來源 |
| **`icon-512.png`** | 512×512 PNG | Linux Desktop (X11/Wayland)、PWA 桌面大圖示 |
| **`icon-256.png`** | 256×256 PNG | Windows 桌面大圖示、資料夾圖示 |
| **`icon-128.png`** | 128×128 PNG | macOS / Windows 中圖示檢視 |
| **`icon-64.png`** | 64×64 PNG | 系統應用清單、桌面小圖示 |
| **`icon-32.png`** | 32×32 PNG | 系統工作列、常駐選單列 (Tray) |
| **`icon.svg`** | 1024×1024 向量 SVG | 無失真向量主稿 |

---

## 🚀 桌面打包配置範本

### 1. Tauri (推薦：輕量跨平台桌面應用)
若使用 Tauri 打包桌面版，只需在 `src-tauri/tauri.conf.json` 中配置：
```json
{
  "bundle": {
    "icon": [
      "../desktop-assets/icon-32.png",
      "../desktop-assets/icon-128.png",
      "../desktop-assets/icon-512.png",
      "../desktop-assets/icon-1024.png",
      "../desktop-assets/app.ico"
    ]
  }
}
```

### 2. Electron (Electron Forge / Electron Builder)
若使用 Electron Builder：
```json
"build": {
  "appId": "com.voiceit.todo",
  "productName": "大方無虞",
  "mac": {
    "icon": "desktop-assets/icon-1024.png"
  },
  "win": {
    "icon": "desktop-assets/app.ico"
  },
  "linux": {
    "icon": "desktop-assets/icon-512.png"
  }
}
```

### 3. macOS `.icns` 快速產生（若在 macOS 環境）
在 Terminal 中執行：
```bash
mkdir icon.iconset
sips -z 16 16     desktop-assets/icon-1024.png --out icon.iconset/icon_16x16.png
sips -z 32 32     desktop-assets/icon-1024.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     desktop-assets/icon-1024.png --out icon.iconset/icon_32x32.png
sips -z 64 64     desktop-assets/icon-1024.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   desktop-assets/icon-1024.png --out icon.iconset/icon_128x128.png
sips -z 256 256   desktop-assets/icon-1024.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   desktop-assets/icon-1024.png --out icon.iconset/icon_256x256.png
sips -z 512 512   desktop-assets/icon-1024.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   desktop-assets/icon-1024.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 desktop-assets/icon-1024.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o desktop-assets/icon.icns
rm -rf icon.iconset
```

---

## 🔄 日後重新產生
若日後需要調整顏色或尺寸，可直接修改 `public/icons/proposal-b-circle.svg` 後執行：
```bash
node scripts/build-icons.cjs
```
即可自動重新產出所有尺寸。
