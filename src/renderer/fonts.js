/**
 * YaMusicMod — Font Manager
 * Применяет выбранный шрифт из Google Fonts.
 */

(function () {
  'use strict';

  const FONTS = {
    'Inter': 'Inter:wght@300;400;500;600;700',
    'Nunito': 'Nunito:wght@300;400;500;600;700',
    'Rubik': 'Rubik:wght@300;400;500;600;700',
    'Manrope': 'Manrope:wght@300;400;500;600;700',
    'Space Grotesk': 'Space+Grotesk:wght@300;400;500;600;700',
    'Системный': null,
  };

  let currentLinkEl = null;

  function applyFont(fontName) {
    // Удаляем предыдущий <link>
    if (currentLinkEl) {
      currentLinkEl.remove();
      currentLinkEl = null;
    }

    if (!fontName || fontName === 'Системный' || !FONTS[fontName]) {
      document.body.style.fontFamily = '';
      return;
    }

    const query = FONTS[fontName];
    const href = `https://fonts.googleapis.com/css2?family=${query}&display=swap`;

    currentLinkEl = document.createElement('link');
    currentLinkEl.rel = 'stylesheet';
    currentLinkEl.href = href;
    currentLinkEl.id = 'ya-mod-font';
    document.head.appendChild(currentLinkEl);

    document.body.style.fontFamily = `'${fontName}', sans-serif`;
    console.log(`[YaMod] Шрифт применён: ${fontName}`);
  }

  window.__yamFonts = {
    list: Object.keys(FONTS),
    apply: applyFont,
  };
})();

