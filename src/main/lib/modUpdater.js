const zlib = require('node:zlib');
const exec = require('child_process').exec;
const promisify = require('util').promisify;
const fsPromise = require('fs').promises;
const fs = require('original-fs');
const path = require('path');
const semver = require('semver');
const Logger_js_1 = require('../packages/logger/Logger.js');
const config_js_1 = require('../config.js');
const electron = require('electron');
const { spawn } = require('child_process');

exports.getModUpdater = exports.ModUpdater = void 0;

const UPDATE_CHECK_URL = 'https://xokeza.su/llmusic/api/v1/mod/latest';
const GITHUB_API_URL = 'https://api.github.com/repos/xokeza/YaMusicMod/releases/latest';

class ModUpdater {
    updaterId = null;
    onModUpdateListeners = [];
    logger;
    currentVersion;
    latestVersion;
    latestData = null;
    isChecking = false;

    constructor() {
        this.logger = new Logger_js_1.Logger('ModUpdaterLogger');
        this.currentVersion = config_js_1.config?.modification?.version || '1.34.0';
        this.latestVersion = this.currentVersion;
        this.logger.log(`Initialized. Current mod version: ${this.currentVersion}`);
    }

    start() {
        this.check().catch((err) => {
            this.logger.error('Initial update check error:', err?.message || err);
        });
        if (this.updaterId) {
            clearInterval(this.updaterId);
        }
        const pollInterval = config_js_1.config?.common?.UPDATE_POLL_INTERVAL_MS || 3600000;
        this.updaterId = setInterval(() => {
            this.check().catch((err) => {
                this.logger.error('Periodic update check error:', err?.message || err);
            });
        }, pollInterval);
        this.logger.log('Update check loop started');
    }

    stop() {
        if (this.updaterId) {
            clearInterval(this.updaterId);
            this.updaterId = null;
            this.logger.log('Update check loop stopped');
        }
    }

    hasUpdateAvailable() {
        return Boolean(this.latestData && semver.gt(this.latestVersion, this.currentVersion));
    }

    async checkForUpdates(force = false) {
        let releaseData = null;

        // 1. Try primary URL (xokeza.su API)
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 7000);
            const response = await fetch(UPDATE_CHECK_URL, {
                signal: controller.signal,
                headers: { Accept: 'application/json' },
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const text = await response.text();
                try {
                    releaseData = JSON.parse(text);
                } catch (e) {
                    this.logger.warn('Failed to parse response from primary API:', e.message);
                }
            } else {
                this.logger.warn(`Primary API returned HTTP ${response.status}`);
            }
        } catch (err) {
            this.logger.warn('Primary update check failed, attempting GitHub fallback:', err.message);
        }

        // 2. Fallback to GitHub Releases API if needed
        if (!releaseData || !releaseData.mod || !releaseData.mod.modVersion) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 7000);
                const ghResponse = await fetch(GITHUB_API_URL, {
                    signal: controller.signal,
                    headers: {
                        Accept: 'application/vnd.github.v3+json',
                        'User-Agent': 'LLMusic-ModUpdater/1.0',
                    },
                });
                clearTimeout(timeoutId);

                if (ghResponse.ok) {
                    const ghData = await ghResponse.json();
                    if (ghData && ghData.tag_name) {
                        const cleanVersion = ghData.tag_name.replace(/^v/i, '');
                        let asarUrl = null;
                        let linuxZip = null;
                        let windowsZip = null;
                        let macosZip = null;

                        if (Array.isArray(ghData.assets)) {
                            for (const asset of ghData.assets) {
                                const name = asset.name || '';
                                const url = asset.browser_download_url;
                                if (name === 'app.asar') asarUrl = url;
                                else if (/linux/i.test(name)) linuxZip = url;
                                else if (/windows/i.test(name)) windowsZip = url;
                                else if (/macos|darwin/i.test(name)) macosZip = url;
                            }
                        }

                        releaseData = {
                            mod: {
                                modVersion: cleanVersion,
                                version: cleanVersion,
                                tag: ghData.tag_name,
                                downloadUrl: asarUrl || ghData.html_url,
                                releaseUrl: ghData.html_url,
                                releases: {
                                    asar: asarUrl,
                                    linux: linuxZip,
                                    windows: windowsZip,
                                    macos: macosZip,
                                },
                            },
                        };
                    }
                }
            } catch (ghErr) {
                this.logger.error('GitHub API fallback also failed:', ghErr.message);
            }
        }

        if (!releaseData || !releaseData.mod || !releaseData.mod.modVersion) {
            this.logger.log('No release data found');
            return null;
        }

        const remoteVersion = releaseData.mod.modVersion;
        const isNewer = semver.valid(remoteVersion) && semver.valid(this.currentVersion) ? semver.gt(remoteVersion, this.currentVersion) : false;

        this.logger.log(`Update check result: remote=${remoteVersion}, current=${this.currentVersion}, isNewer=${isNewer}`);

        if (force || isNewer) {
            this.latestVersion = remoteVersion;

            let platformDownloadUrl = releaseData.mod.downloadUrl;
            const releases = releaseData.mod.releases;
            if (releases) {
                if (process.platform === 'linux' && releases.linux) {
                    platformDownloadUrl = releases.linux;
                } else if (process.platform === 'win32' && releases.windows) {
                    platformDownloadUrl = releases.windows;
                } else if (process.platform === 'darwin' && releases.macos) {
                    platformDownloadUrl = releases.macos;
                }
            }

            this.latestData = {
                version: remoteVersion,
                downloadUrl: platformDownloadUrl || releaseData.mod.downloadUrl,
                releaseUrl: releaseData.mod.releaseUrl || `https://github.com/xokeza/YaMusicMod/releases/tag/v${remoteVersion}`,
                releases: releaseData.mod.releases || {},
            };

            return this.latestData;
        }

        return null;
    }

    async check(force = false) {
        if (this.isChecking) return null;
        this.isChecking = true;
        try {
            const updateInfo = await this.checkForUpdates(force);
            if (updateInfo) {
                this.onModUpdateListeners.forEach((listener) => {
                    try {
                        listener(this.currentVersion, updateInfo.version, updateInfo);
                    } catch (e) {
                        this.logger.error('Error in onModUpdate listener:', e);
                    }
                });
            }
            return updateInfo;
        } finally {
            this.isChecking = false;
        }
    }

    onUpdateAvailable(listener) {
        this.onModUpdateListeners.push(listener);
    }

    async onInstallUpdate() {
        this.logger.log('onInstallUpdate called');
        const url = this.latestData?.downloadUrl || this.latestData?.releaseUrl || 'https://github.com/xokeza/YaMusicMod/releases/latest';
        try {
            await electron.shell.openExternal(url);
        } catch (err) {
            this.logger.error('Failed to open release URL:', err);
        }
    }

    async onUpdateDownload(callback) {
        // Fallback progress reporting if called
        if (typeof callback === 'function') {
            callback(1.1, -1);
        }
    }
}

exports.ModUpdater = ModUpdater;
exports.getModUpdater = (() => {
    let modUpdater;
    return () => {
        if (!modUpdater) {
            modUpdater = new ModUpdater();
        }
        return modUpdater;
    };
})();
