const fs = require('fs');
const path = require('path');

function sanitizeId(name) {
    return String(name || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\-_]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function normalizeAddonId(id) {
    return String(id || '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
}

const SYSTEM_IDS = new Set([
    'wolfylibrary',
    'fckcensor',
    'hide-titlebar-buttons',
    'hidetitlebarbuttons',
    'copytrackname',
    'betterqueue',
    'custombackground',
    'customfonts',
    'deltracks',
    'chromasync',
    'chromasynclite',
]);

const ADDONS_DIR = path.resolve(__dirname, './addons');
const WOLFY_PATH = path.resolve(__dirname, './scripts/WolfyLibrary.js');

const BUILTIN_ADDON_SPECS = [
    { dir: 'FckCensor', order: -100, id: 'fckcensor', defaultName: 'FckCensor' },
    { dir: 'Hide-TitleBar-Buttons', order: 10, id: 'hide-titlebar-buttons', defaultName: 'Hide TitleBar Buttons' },
    { dir: 'CopyTrackName', order: 20, id: 'copytrackname', defaultName: 'CopyTrackName' },
    { dir: 'BetterQueue', order: 30, id: 'betterqueue', defaultName: 'BetterQueue' },
    { dir: 'CustomBackground', order: 40, id: 'custombackground', defaultName: 'Custom Background' },
    { dir: 'CustomFonts', order: 50, id: 'customfonts', defaultName: 'Custom Fonts' },
    { dir: 'DelTracks', order: 60, id: 'deltracks', defaultName: 'DelTracks' },
];

function extractDefaultSettings(dirPath) {
    const result = {};
    const handleEventsPath = path.join(dirPath, 'handleEvents.json');
    const settingsPath = path.join(dirPath, 'pulsesync.settings.json');

    if (fs.existsSync(settingsPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            for (const [k, v] of Object.entries(data)) {
                if (v && typeof v === 'object') {
                    const val = v.default ?? v.defaultValue ?? v.value;
                    result[k] = { value: val, default: val };
                } else {
                    result[k] = { value: v, default: v };
                }
            }
        } catch {}
    }

    if (fs.existsSync(handleEventsPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(handleEventsPath, 'utf8'));
            if (Array.isArray(data.sections)) {
                for (const sec of data.sections) {
                    if (Array.isArray(sec.items)) {
                        for (const item of sec.items) {
                            if (item.id) {
                                const val = item.defaultValue ?? item.defaultParameter ?? (item.bool !== undefined ? item.bool : item.value);
                                if (result[item.id] === undefined) {
                                    result[item.id] = { value: val, default: val };
                                }
                            }
                        }
                    }
                }
            }
        } catch {}
    }
    return result;
}

function getSystemDefaultSettings() {
    const allSettings = {};
    for (const spec of BUILTIN_ADDON_SPECS) {
        const dirPath = path.join(ADDONS_DIR, spec.dir);
        if (!fs.existsSync(dirPath)) continue;
        const s = extractDefaultSettings(dirPath);

        // Aliases for Hide-TitleBar-Buttons
        if (spec.dir === 'Hide-TitleBar-Buttons') {
            s.hideTitleBar = s.hideTitleBar || { value: s.enabled?.value ?? true, default: true };
            s.titleBarOpacity = s.titleBarOpacity || { value: s.opacityLevel?.value ?? 0, default: 0 };
            s.hideFullscreenClose = s.hideFullscreenClose || { value: s.closeButtonEnabled?.value ?? true, default: true };
            s.fullscreenOpacity = s.fullscreenOpacity || { value: s.closeButtonOpacity?.value ?? 0, default: 0 };
        }

        const keys = [sanitizeId(spec.id), normalizeAddonId(spec.id), normalizeAddonId(spec.defaultName), spec.defaultName, spec.id];
        for (const k of keys) {
            allSettings[k] = s;
        }
    }
    try {
        const { getModSettings } = require('../../store.js');
        const userPluginSettings = getModSettings()?.pluginSettings;
        if (userPluginSettings && typeof userPluginSettings === 'object') {
            for (const [addonId, customSettings] of Object.entries(userPluginSettings)) {
                if (!customSettings || typeof customSettings !== 'object') continue;
                const keys = [sanitizeId(addonId), normalizeAddonId(addonId), addonId];
                for (const k of keys) {
                    if (allSettings[k]) {
                        allSettings[k] = { ...allSettings[k], ...customSettings };
                    } else {
                        allSettings[k] = { ...customSettings };
                    }
                }
            }
        }
    } catch {}
    return allSettings;
}

function getSystemAddons() {
    const addons = [];

    // 1. WolfyLibrary (order: -1000)
    try {
        if (fs.existsSync(WOLFY_PATH)) {
            addons.push({
                name: 'WolfyLibrary',
                addon: 'WolfyLibrary',
                system: true,
                protected: true,
                order: -1000,
                css: '',
                script: fs.readFileSync(WOLFY_PATH, 'utf8'),
            });
        }
    } catch (err) {
        console.error('[SystemAddons] Failed to load WolfyLibrary:', err);
    }

    // Check store settings if user explicitly disabled any builtin addon
    let modSettings = null;
    try {
        const { getModSettings } = require('../../store.js');
        modSettings = getModSettings();
    } catch {}

    // 2. Built-in Addons
    for (const spec of BUILTIN_ADDON_SPECS) {
        try {
            const dirPath = path.join(ADDONS_DIR, spec.dir);
            if (!fs.existsSync(dirPath)) continue;

            const enabledInStore = modSettings?.builtinAddons?.[spec.id] ?? modSettings?.builtinAddons?.[spec.dir];
            if (enabledInStore === false) {
                continue;
            }

            const metaPath = path.join(dirPath, 'metadata.json');
            let meta = {};
            if (fs.existsSync(metaPath)) {
                try {
                    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                } catch {}
            }

            const scriptPath = path.join(dirPath, 'script.js');
            let script = '';
            if (fs.existsSync(scriptPath)) {
                script = fs.readFileSync(scriptPath, 'utf8');
            }

            // Prepend offline dependencies (e.g., Vibrant for ChromaSync)
            const vibrantPath = path.join(dirPath, 'vibrant.min.js');
            if (fs.existsSync(vibrantPath)) {
                try {
                    const vibrantCode = fs.readFileSync(vibrantPath, 'utf8');
                    script = vibrantCode + '\n;' + script;
                } catch {}
            }

            const cssPath = path.join(dirPath, 'style.css');
            let css = '';
            if (fs.existsSync(cssPath)) {
                css = fs.readFileSync(cssPath, 'utf8');
            }

            const name = meta.name || spec.defaultName || spec.dir;
            const addonId = spec.id;

            addons.push({
                name,
                addon: addonId,
                id: addonId,
                system: true,
                protected: false,
                order: spec.order,
                css,
                script,
                metadata: meta,
            });
        } catch (err) {
            console.error(`[SystemAddons] Failed to load addon ${spec.dir}:`, err);
        }
    }

    return addons;
}

function isSystemId(idOrName) {
    const id = sanitizeId(idOrName || '');
    const norm = normalizeAddonId(idOrName || '');
    return SYSTEM_IDS.has(id) || SYSTEM_IDS.has(norm);
}

function mergeWithSystem(incoming = []) {
    const sys = getSystemAddons();

    const seen = new Set();
    const systemList = [];
    for (const a of sys) {
        const id = sanitizeId(a.addon || a.name);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        seen.add(normalizeAddonId(id));
        systemList.push(a);
    }

    const nonSystem = [];
    for (const ext of incoming) {
        if (!ext) continue;
        const id = sanitizeId(ext.addon || ext.name);
        const norm = normalizeAddonId(ext.addon || ext.name);
        if (!id || seen.has(id) || seen.has(norm)) continue;
        if (isSystemId(id) || ext.system === true || ext.protected === true) continue;
        seen.add(id);
        seen.add(norm);
        nonSystem.push(ext);
    }

    systemList.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    nonSystem.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return [...systemList, ...nonSystem];
}

module.exports = {
    getSystemAddons,
    getSystemDefaultSettings,
    mergeWithSystem,
    isSystemId,
    sanitizeId,
};
