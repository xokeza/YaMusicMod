// Ctrl+R or F5: In-place reload without closing or quitting app
if ((input.control && input.key.toLowerCase() === 'r') || input.key === 'F5') {
    lifecycleLogger.info('Ctrl+R / F5 pressed: in-place reload, checking mod updates without quitting...');
    event.preventDefault();
    webContents.reloadIgnoringCache();
    webContents.once('did-finish-load', () => {
        setTimeout(() => {
            try {
                const modUpdater = (0, modUpdater_js_1.getModUpdater)();
                if (modUpdater) {
                    modUpdater.check(true).catch((err) => {
                        lifecycleLogger.error('Failed to check updates on reload:', err);
                    });
                }
            } catch (err) {
                lifecycleLogger.error('ModUpdater error on reload:', err);
            }
        }, 1200);
    });
}
