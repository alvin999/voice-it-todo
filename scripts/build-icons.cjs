const fs = require('fs');
const path = require('path');

// 引用 worker 中的 sharp 模組
const sharp = require('../worker/node_modules/sharp');

const SVG_SOURCE = path.resolve(__dirname, '../public/app-icon.svg');
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const DESKTOP_DIR = path.resolve(__dirname, '../desktop-assets');

if (!fs.existsSync(DESKTOP_DIR)) {
  fs.mkdirSync(DESKTOP_DIR, { recursive: true });
}

// 產生標準 Windows ICO 檔案二進位結構
function createIco(pngBuffers, sizes) {
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const directorySize = dirEntrySize * numImages;

  let currentOffset = headerSize + directorySize;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(numImages, 4); // Count

  const dirEntries = [];
  for (let i = 0; i < numImages; i++) {
    const size = sizes[i];
    const buf = pngBuffers[i];
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // Width (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // Height (0 means 256)
    entry.writeUInt8(0, 2); // Colors
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Planes
    entry.writeUInt16LE(32, 6); // Bit count
    entry.writeUInt32LE(buf.length, 8); // Size
    entry.writeUInt32LE(currentOffset, 12); // Offset

    currentOffset += buf.length;
    dirEntries.push(entry);
  }

  return Buffer.concat([header, ...dirEntries, ...pngBuffers]);
}

async function buildAllIcons() {
  console.log('✨ 開始生產「大方無虞 VoiceItTodo」全平台與桌面版圖示範本...');

  // 1. 同步複製定案的 SVG
  const svgContent = fs.readFileSync(SVG_SOURCE, 'utf-8');
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.svg'), svgContent);
  fs.writeFileSync(path.join(DESKTOP_DIR, 'icon.svg'), svgContent);
  console.log('✅ 同步標準向量原稿：favicon.svg, desktop-assets/icon.svg');

  // 2. 產出多解析度 PNG
  const sizes = [1024, 512, 256, 192, 180, 128, 64, 48, 32, 16];
  const pngBuffers = {};

  for (const size of sizes) {
    const buf = await sharp(Buffer.from(svgContent))
      .resize(size, size, { fit: 'contain' })
      .png({ compressionLevel: 9 })
      .toBuffer();
    pngBuffers[size] = buf;
  }

  // 寫入 Web / PWA 常用尺寸
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-1024.png'), pngBuffers[1024]);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-512.png'), pngBuffers[512]);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-192.png'), pngBuffers[192]);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon.png'), pngBuffers[180]);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-32.png'), pngBuffers[32]);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-16.png'), pngBuffers[16]);
  console.log('✅ 產出 Web / PWA 圖示：icon-1024.png, icon-512.png, icon-192.png, apple-touch-icon.png');

  // 寫入桌面版專用目錄 (適用於 Electron / Tauri / Flutter / Native)
  fs.writeFileSync(path.join(DESKTOP_DIR, 'icon-1024.png'), pngBuffers[1024]);
  fs.writeFileSync(path.join(DESKTOP_DIR, 'icon-512.png'), pngBuffers[512]);
  fs.writeFileSync(path.join(DESKTOP_DIR, 'icon-256.png'), pngBuffers[256]);
  fs.writeFileSync(path.join(DESKTOP_DIR, 'icon-128.png'), pngBuffers[128]);
  fs.writeFileSync(path.join(DESKTOP_DIR, 'icon-64.png'), pngBuffers[64]);
  fs.writeFileSync(path.join(DESKTOP_DIR, 'icon-32.png'), pngBuffers[32]);

  // 3. 封裝 Windows 桌面多層 ICO (包含 256, 128, 64, 48, 32, 16)
  const icoSizes = [256, 128, 64, 48, 32, 16];
  const icoBuffers = icoSizes.map(s => pngBuffers[s]);
  const icoData = createIco(icoBuffers, icoSizes);

  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), icoData);
  fs.writeFileSync(path.join(DESKTOP_DIR, 'app.ico'), icoData);
  console.log('✅ 產出 Windows 桌面 ICO 格式：public/favicon.ico, desktop-assets/app.ico');

  // 4. 產出桌面端與 PWA 規格配置說明
  const manifest = {
    name: "大方無虞 VoiceItTodo",
    short_name: "大方無虞",
    description: "現代化、語音優先（Voice-First）極簡待辦便利貼應用",
    start_url: "/",
    display: "standalone",
    background_color: "#182c2e",
    theme_color: "#2a474a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      { src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }
    ]
  };
  fs.writeFileSync(path.join(PUBLIC_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('✅ 產出 PWA 規格：public/manifest.json');

  console.log('🎉 全套 ICON 與桌面版範本生產完畢！');
}

buildAllIcons().catch(err => {
  console.error('❌ 生產失敗:', err);
  process.exit(1);
});
