/**
 * YaMusicMod — Build Script
 * Собирает renderer/index.js в единый бандл путём замены плейсхолдеров.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'build');

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'renderer'), { recursive: true });

// Читаем исходники модулей
const fontsCode = fs.readFileSync(path.join(SRC, 'renderer', 'fonts.js'), 'utf8');
const observerCode = fs.readFileSync(path.join(SRC, 'renderer', 'track-observer.js'), 'utf8');
const settingsCode = fs.readFileSync(path.join(SRC, 'renderer', 'settings-ui.js'), 'utf8');

// Собираем bundle renderer'а
let rendererBundle = fs.readFileSync(path.join(SRC, 'renderer', 'index.js'), 'utf8');

const escape = (s) => JSON.stringify(s);

rendererBundle = rendererBundle
  .replace('__YAM_FONTS__', escape(fontsCode))
  .replace('__YAM_TRACK_OBSERVER__', escape(observerCode))
  .replace('__YAM_SETTINGS_UI__', escape(settingsCode));

// Записываем собранный renderer
fs.writeFileSync(path.join(OUT, 'renderer', 'index.js'), rendererBundle, 'utf8');

// Копируем остальные файлы src без изменений
const filesToCopy = [
  ['preload.js', 'preload.js'],
  ['main-injection.js', 'main-injection.js'],
];

for (const [src, dest] of filesToCopy) {
  fs.copyFileSync(path.join(SRC, src), path.join(OUT, dest));
}

// Обновляем ссылку в main-injection на собранный renderer
let mainCode = fs.readFileSync(path.join(OUT, 'main-injection.js'), 'utf8');
mainCode = mainCode.replace(
  "path.join(__dirname, 'renderer', 'index.js')",
  "path.join(__dirname, 'renderer', 'index.js')"
);
fs.writeFileSync(path.join(OUT, 'main-injection.js'), mainCode, 'utf8');

console.log('✅ Сборка завершена → build/');
console.log('   renderer/index.js — бандл renderer');
console.log('   main-injection.js — main process');
console.log('   preload.js        — preload bridge');
