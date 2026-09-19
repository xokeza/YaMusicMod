/**
 * YaMusicMod — Патчер
 * Находит установленный клиент Яндекс Музыки, бэкапит app.asar
 * и внедряет файлы мода.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { patch, unpatch } = require('./patch');

const UNPATCH = process.argv.includes('--unpatch');

// Стандартные пути к Яндекс Музыке
const YM_PATHS = {
  win32: [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'YandexMusic', 'resources'),
    path.join(process.env.LOCALAPPDATA || '', 'Yandex', 'YandexMusic', 'resources'),
  ],
  linux: [
    '/opt/yandex-music/resources',
    '/usr/lib/yandex-music/resources',
    '/usr/share/yandex-music/resources',
  ],
};

function findYMResources() {
  const platform = process.platform;
  const candidates = YM_PATHS[platform] || [];

  for (const dir of candidates) {
    const asarPath = path.join(dir, 'app.asar');
    if (fs.existsSync(asarPath)) {
      return dir;
    }
  }

  return null;
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║         YaMusicMod Patcher           ║');
  console.log('╚══════════════════════════════════════╝\n');

  const resourcesDir = findYMResources();

  if (!resourcesDir) {
    console.error('❌ Яндекс Музыка не найдена.');
    console.error('   Укажи путь вручную: node patcher/index.js --path="/путь/к/resources"');
    process.exit(1);
  }

  const asarPath = path.join(resourcesDir, 'app.asar');
  const backupPath = path.join(resourcesDir, 'app.asar.bak');
  const modDir = path.join(resourcesDir, 'ya-mod');

  console.log(`📁 Найдена ЯМ: ${resourcesDir}`);

  if (UNPATCH) {
    await unpatch({ asarPath, backupPath, modDir });
  } else {
    await patch({ asarPath, backupPath, modDir });
  }
}

main().catch((err) => {
  console.error('❌ Критическая ошибка:', err.message);
  process.exit(1);
});

