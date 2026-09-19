/**
 * YaMusicMod — Логика патчинга app.asar
 */

'use strict';

const path = require('path');
const fs = require('fs');
const asar = require('@electron/asar');

const MOD_SRC = path.resolve(__dirname, '..', 'src');

/**
 * Патчит app.asar: бэкапит, распаковывает, внедряет мод, упаковывает обратно.
 */
async function patch({ asarPath, backupPath, modDir }) {
  // Бэкап оригинала
  if (!fs.existsSync(backupPath)) {
    console.log('💾 Создаю резервную копию app.asar...');
    fs.copyFileSync(asarPath, backupPath);
    console.log('   ✓ Копия сохранена в app.asar.bak');
  } else {
    console.log('   ℹ Резервная копия уже существует, пропускаю.');
  }

  // Распаковка
  const extractDir = asarPath + '.extracted';
  if (fs.existsSync(extractDir)) {
    fs.rmSync(extractDir, { recursive: true });
  }

  console.log('📦 Распаковываю app.asar...');
  asar.extractAll(asarPath, extractDir);
  console.log('   ✓ Распакован в', extractDir);

  // Ищем main-process файл
  const mainFile = findMainFile(extractDir);
  if (!mainFile) {
    throw new Error('Не удалось найти main process файл в app.asar');
  }

  console.log(`⚙  Внедряю мод в ${path.relative(extractDir, mainFile)}...`);
  injectMainCode(mainFile);

  // Копируем файлы мода рядом с app.asar
  console.log('📂 Копирую файлы мода...');
  copyModFiles(modDir);

  // Переупаковка
  console.log('📦 Переупаковываю app.asar...');
  await asar.createPackage(extractDir, asarPath);
  console.log('   ✓ Готово!\n');

  // Чистим временную папку
  fs.rmSync(extractDir, { recursive: true });

  console.log('✅ Мод успешно установлен!');
  console.log('   Запусти Яндекс Музыку — над аккаунтом появится «⚙ Настройки мода».');
}

/**
 * Откатывает патч — восстанавливает оригинальный app.asar из бэкапа.
 */
async function unpatch({ asarPath, backupPath, modDir }) {
  if (!fs.existsSync(backupPath)) {
    console.error('❌ Резервная копия не найдена. Мод не был установлен?');
    process.exit(1);
  }

  console.log('♻️  Восстанавливаю оригинальный app.asar...');
  fs.copyFileSync(backupPath, asarPath);
  fs.unlinkSync(backupPath);

  if (fs.existsSync(modDir)) {
    fs.rmSync(modDir, { recursive: true });
    console.log('   ✓ Файлы мода удалены.');
  }

  console.log('✅ Мод удалён. Яндекс Музыка восстановлена до оригинала.');
}

/**
 * Ищет main process файл внутри распакованного asar.
 * Ищем package.json → поле "main".
 */
function findMainFile(extractDir) {
  const pkgPath = path.join(extractDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const mainRelative = pkg.main || 'index.js';
  const mainAbsolute = path.join(extractDir, mainRelative);

  return fs.existsSync(mainAbsolute) ? mainAbsolute : null;
}

/**
 * Добавляет require мода в начало main process файла.
 */
function injectMainCode(mainFile) {
  const content = fs.readFileSync(mainFile, 'utf8');

  const INJECTION_MARKER = '/* ya-mod-injected */';
  if (content.includes(INJECTION_MARKER)) {
    console.log('   ℹ Мод уже внедрён в main process, пропускаю.');
    return;
  }

  // Инжектим в самое начало файла
  const injection = `${INJECTION_MARKER}\ntry { require('./ya-mod/main-injection'); } catch(e) { console.error('[YaMod] Ошибка загрузки:', e); }\n\n`;
  fs.writeFileSync(mainFile, injection + content, 'utf8');
  console.log('   ✓ Код мода внедрён в main process.');
}

/**
 * Копирует файлы мода в папку ya-mod рядом с app.asar.
 */
function copyModFiles(modDir) {
  if (fs.existsSync(modDir)) {
    fs.rmSync(modDir, { recursive: true });
  }
  fs.mkdirSync(modDir, { recursive: true });

  copyDir(MOD_SRC, modDir);
  console.log(`   ✓ Файлы скопированы в ${modDir}`);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

module.exports = { patch, unpatch };
