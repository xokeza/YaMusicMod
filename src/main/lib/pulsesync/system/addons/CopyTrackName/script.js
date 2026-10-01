// Скрипт для копирования названия трека в формате "Исполнитель - Название"

(function() {
    'use strict';

    const ADDON_NAME = 'CopyTrackName';

    // Глобальные настройки
    let currentSettings = null;

    // ─── Новое API настроек ───────────────────────────────────────────────────

    /**
     * Читает значение настройки из объекта настроек.
     * Поддерживает как плоские значения, так и объекты вида { value, default }.
     */
    function unwrapSetting(entry, fallback) {
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
            if (typeof entry.value !== 'undefined') return entry.value;
            if (typeof entry.default !== 'undefined') return entry.default;
        }
        return typeof entry !== 'undefined' ? entry : fallback;
    }

    /**
     * Возвращает store настроек через window.pulsesyncApi.
     * Если API недоступно — возвращает заглушку.
     */
    function getAddonSettings(addonName) {
        return (
            window.pulsesyncApi?.getSettings(addonName) ?? {
                getCurrent: () => ({}),
                onChange: () => () => {},
            }
        );
    }

    /**
     * Преобразует «плоский» объект настроек из нового API в формат,
     * совместимый с остальным кодом: { key: { value, default } }.
     *
     * Новое API уже возвращает объект вида:
     *   { enableCopyIcon: { value: true, default: true }, ... }
     * поэтому достаточно просто нормализовать вложенные text-поля.
     */
    function normalizeSettings(raw) {
        if (!raw || typeof raw !== 'object') return {};

        const result = {};

        for (const [key, entry] of Object.entries(raw)) {
            if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
                // Проверяем, является ли это вложенным text-контейнером
                // (все значения — тоже объекты с value/default, но без самого value/default на верхнем уровне)
                const hasValueOrDefault =
                    typeof entry.value !== 'undefined' || typeof entry.default !== 'undefined';

                if (hasValueOrDefault) {
                    result[key] = entry;
                } else {
                    // Вложенный контейнер (text с buttons)
                    result[key] = {};
                    for (const [subKey, subEntry] of Object.entries(entry)) {
                        result[key][subKey] = subEntry;
                    }
                }
            } else {
                result[key] = { value: entry, default: entry };
            }
        }

        return result;
    }

    // ─── Вспомогательные геттеры ──────────────────────────────────────────────

    function getBoolSetting(settings, key, fallback) {
        return Boolean(unwrapSetting(settings?.[key], fallback));
    }

    function getNumSetting(settings, key, fallback) {
        return Number(unwrapSetting(settings?.[key], fallback));
    }

    function getStrSetting(settings, key, fallback) {
        return String(unwrapSetting(settings?.[key], fallback));
    }

    // ─── Цвет иконки ─────────────────────────────────────────────────────────

    /**
     * Проверяет, находится ли metaContainer в навбаре или полноэкранном плеере.
     */
    function isInsidePlayerContext(metaContainer) {
        const navbar = document.querySelector('.PlayerBarDesktopWithBackgroundProgressBar_player__ASKKs');
        if (navbar && navbar.contains(metaContainer)) return true;
        const fullscreen = document.querySelector('div[data-test-id="FULLSCREEN_PLAYER_MODAL"]');
        if (fullscreen && fullscreen.contains(metaContainer)) return true;
        return false;
    }

    /**
     * Читает computed color из span названия трека.
     * Возвращает цвет только если контейнер находится в навбаре или полноэкранном плеере,
     * иначе возвращает null (чтобы использовался fallback CSS-переменная).
     */
    function getTitleColor(metaContainer) {
        if (!metaContainer || !isInsidePlayerContext(metaContainer)) return null;
        const titleSpan = metaContainer.querySelector(
            '[data-test-id="TRACK_TITLE"] .Meta_title__GGBnH'
        );
        if (!titleSpan) return null;
        const color = getComputedStyle(titleSpan).color;
        return color && color !== 'rgba(0, 0, 0, 0)' ? color : null;
    }

    function getTextColor(metaContainer) {
        const titleColor = getTitleColor(metaContainer);
        return titleColor || 'var(--ym-controls-color-primary-text-enabled_variant, #ffffff)';
    }

    // ─── Создание иконки ──────────────────────────────────────────────────────

    function createCopyIcon(settings, metaContainer) {
        const iconSize    = getNumSetting(settings, 'iconSize', 16);
        const iconOpacity = getNumSetting(settings, 'iconOpacity', 70) / 100;
        const useStatic   = getBoolSetting(settings, 'iconColor', false);
        const iconColor   = useStatic
            ? getStrSetting(settings, 'customColor', '#ffffff')
            : getTextColor(metaContainer);

        const icon = document.createElement('button');
        icon.innerHTML = `
            <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z" fill="currentColor"/>
            </svg>
        `;
        icon.style.cssText = `
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 4px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            opacity: ${iconOpacity};
            transition: opacity 0.2s, color 0.2s;
            margin-left: 8px;
            vertical-align: middle;
            color: ${iconColor};
        `;
        icon.title = 'Копировать название трека';
        icon.dataset.baseOpacity = iconOpacity;

        icon.addEventListener('mouseenter', () => { icon.style.opacity = '1'; });
        icon.addEventListener('mouseleave', () => { icon.style.opacity = iconOpacity.toString(); });

        return icon;
    }

    // ─── Буфер обмена ─────────────────────────────────────────────────────────

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('Ошибка копирования:', err);
            return false;
        }
    }

    // ─── Уведомление ─────────────────────────────────────────────────────────

    function showNotification(message, success = true, settings) {
        if (settings && !getBoolSetting(settings, 'showNotification', true)) return;

        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${success ? '#4CAF50' : '#f44336'};
            color: white;
            padding: 12px 24px;
            border-radius: 4px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease-out;
        `;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }

    // Анимации уведомления
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to   { transform: translateX(0);     opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0);     opacity: 1; }
            to   { transform: translateX(400px); opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    // ─── Информация о треке ───────────────────────────────────────────────────

    function extractTrackInfo(metaContainer, settings) {
        const titleElement  = metaContainer.querySelector('[data-test-id="TRACK_TITLE"] .Meta_title__GGBnH');
        const artistElement = metaContainer.querySelector('[data-test-id="SEPARATED_ARTIST_TITLE"] .Meta_artistCaption__JESZi');

        if (!titleElement || !artistElement) return null;

        const title  = titleElement.textContent.trim();
        const artist = artistElement.textContent.trim();

        // Пользовательский формат
        if (getBoolSetting(settings, 'enableCustomFormat', false)) {
            const customFormat = unwrapSetting(settings?.customFormat?.customFormatText, '{artist} - {title}');
            return String(customFormat).replace('{artist}', artist).replace('{title}', title);
        }

        // Стандартные форматы
        switch (getNumSetting(settings, 'copyFormat', 1)) {
            case 1: return `${artist} - ${title}`;
            case 2: return `${title} - ${artist}`;
            case 3: return artist;
            case 4: return title;
            default: return `${artist} - ${title}`;
        }
    }

    // ─── Иконка в DOM ─────────────────────────────────────────────────────────

    /**
     * Вычисляет итоговую позицию иконки для данного контейнера.
     * 1 = справа от названия трека (по умолчанию)
     * 2 = слева от названия трека
     * Если выбрана позиция 2 и включена опция «только в полноэкранном» —
     * в навбаре позиция откатывается к 1.
     */
    function resolveIconPosition(settings, metaContainer) {
        const position = getNumSetting(settings, 'iconPosition', 1);
        if (position === 2 && getBoolSetting(settings, 'positionBeforeTitleFullscreenOnly', true)) {
            const fullscreen = document.querySelector('div[data-test-id="FULLSCREEN_PLAYER_MODAL"]');
            if (!fullscreen || !fullscreen.contains(metaContainer)) {
                return 1;
            }
        }
        return position;
    }

    function addCopyIconToMeta(metaContainer, settings, forceUpdate = false) {
        const titleContainer = metaContainer.querySelector('.Meta_titleContainer__gDuXr');
        if (!titleContainer) return;

        const existingIcon = metaContainer.querySelector('.copy-track-icon');

        if (!getBoolSetting(settings, 'enableCopyIcon', true)) {
            existingIcon?.remove();
            return;
        }

        const position = resolveIconPosition(settings, metaContainer);

        // Если иконка уже есть — проверяем что позиция не изменилась
        if (existingIcon && !forceUpdate) {
            const nodes = Array.from(titleContainer.childNodes);
            const idx = nodes.indexOf(existingIcon);
            const titleLink = titleContainer.querySelector('[data-test-id="TRACK_TITLE"]')?.closest('div, span')
                || titleContainer.firstElementChild;
            const titleIdx = titleLink ? nodes.indexOf(titleLink) : -1;

            const positionCorrect = position === 2
                ? idx === 0 || (titleIdx !== -1 && idx < titleIdx)  // слева от названия
                : idx > (titleIdx !== -1 ? titleIdx : -1);          // справа от названия

            if (positionCorrect) return;
            existingIcon.remove();
        } else if (existingIcon && forceUpdate) {
            existingIcon.remove();
        }

        // Обновляем отступ в зависимости от позиции
        const copyIcon = createCopyIcon(settings, metaContainer);
        copyIcon.classList.add('copy-track-icon');

        if (position === 2) {
            // Слева: отступ справа, убираем слева
            copyIcon.style.marginLeft = '0';
            copyIcon.style.marginRight = '8px';
        }

        copyIcon.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const trackInfo = extractTrackInfo(metaContainer, currentSettings);
            if (trackInfo) {
                const success = await copyToClipboard(trackInfo);
                showNotification(
                    success ? 'Скопировано: ' + trackInfo : 'Ошибка копирования',
                    success,
                    currentSettings
                );
            } else {
                showNotification('Не удалось получить информацию о треке', false, currentSettings);
            }
        });

        if (position === 2) {
            // Слева от названия — вставляем первым дочерним элементом
            titleContainer.insertBefore(copyIcon, titleContainer.firstChild);
        } else {
            // Справа от названия — добавляем в конец
            titleContainer.appendChild(copyIcon);
        }
    }

    function processMetaContainers(settings, forceUpdate = false) {
        document.querySelectorAll('.Meta_root__R8n1h').forEach(container => {
            addCopyIconToMeta(container, settings, forceUpdate);
        });
    }

    // ─── Обновление существующих иконок ──────────────────────────────────────

    function updateIconColors(settings) {
        const useStatic = getBoolSetting(settings, 'iconColor', false);
        document.querySelectorAll('.copy-track-icon').forEach(icon => {
            const metaContainer = icon.closest('.Meta_root__R8n1h');
            const color = useStatic
                ? getStrSetting(settings, 'customColor', '#ffffff')
                : getTextColor(metaContainer);
            icon.style.color = color;
        });
    }

    function updateIconSizes(settings) {
        const iconSize = getNumSetting(settings, 'iconSize', 16);
        document.querySelectorAll('.copy-track-icon svg').forEach(svg => {
            svg.setAttribute('width', iconSize);
            svg.setAttribute('height', iconSize);
        });
    }

    function updateIconOpacity(settings) {
        const iconOpacity = getNumSetting(settings, 'iconOpacity', 70) / 100;
        document.querySelectorAll('.copy-track-icon').forEach(icon => {
            icon.style.opacity = iconOpacity.toString();
            icon.dataset.baseOpacity = iconOpacity;
        });
    }

    // ─── Применение изменившихся настроек ────────────────────────────────────

    function applySettings(nextSettings, prevSettings) {
        const colorChanged =
            getBoolSetting(nextSettings, 'iconColor', false) !== getBoolSetting(prevSettings, 'iconColor', false) ||
            getStrSetting(nextSettings, 'customColor', '#ffffff') !== getStrSetting(prevSettings, 'customColor', '#ffffff');

        const sizeChanged    = getNumSetting(nextSettings, 'iconSize', 16)    !== getNumSetting(prevSettings, 'iconSize', 16);
        const opacityChanged = getNumSetting(nextSettings, 'iconOpacity', 70) !== getNumSetting(prevSettings, 'iconOpacity', 70);
        const enableChanged  = getBoolSetting(nextSettings, 'enableCopyIcon', true) !== getBoolSetting(prevSettings, 'enableCopyIcon', true);

        const positionChanged =
            getNumSetting(nextSettings, 'iconPosition', 1) !== getNumSetting(prevSettings, 'iconPosition', 1) ||
            getBoolSetting(nextSettings, 'positionBeforeTitleFullscreenOnly', true) !== getBoolSetting(prevSettings, 'positionBeforeTitleFullscreenOnly', true);

        if (colorChanged)   updateIconColors(nextSettings);
        if (sizeChanged)    updateIconSizes(nextSettings);
        if (opacityChanged) updateIconOpacity(nextSettings);
        // При смене позиции или enable — пересоздаём все иконки
        if (enableChanged || positionChanged) processMetaContainers(nextSettings, true);
    }

    // ─── Наблюдатель за DOM ───────────────────────────────────────────────────

    const observer = new MutationObserver(() => {
        processMetaContainers(currentSettings);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Периодическое обновление динамического цвета (подхватывает смену трека в навбаре/полноэкране)
    setInterval(() => {
        if (currentSettings && !getBoolSetting(currentSettings, 'iconColor', false)) {
            updateIconColors(currentSettings);
        }
    }, 1000);

    // ─── Инициализация через новое API ───────────────────────────────────────

    const settingsStore = getAddonSettings(ADDON_NAME);

    // Первичная загрузка
    currentSettings = normalizeSettings(settingsStore.getCurrent());
    processMetaContainers(currentSettings, false);

    // Реактивное обновление при изменении настроек пользователем
    settingsStore.onChange(rawNext => {
        const nextSettings = normalizeSettings(rawNext);
        if (currentSettings) {
            applySettings(nextSettings, currentSettings);
        }
        currentSettings = nextSettings;
        processMetaContainers(currentSettings, false);
    });

    console.log('CopyTrackName скрипт загружен (новое API)');
})();
