const zlib = require('node:zlib');
const exec = require('child_process').exec;
const promisify = require('util').promisify;
const fsPromise = require('fs').promises;
const fs = require('original-fs');
const path = require('path');
const semver = require('semver');
const axios = require('axios');
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
    isDownloading = false;
    isInstalling = false;
    checkingPromise = null;

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

            let asarDownloadUrl = releaseData.mod.releases?.asar || releaseData.mod.downloadUrl;
            if (!asarDownloadUrl || asarDownloadUrl.endsWith('.zip')) {
                asarDownloadUrl = `https://github.com/xokeza/YaMusicMod/releases/download/v${remoteVersion}/app.asar`;
            }

            this.latestData = {
                version: remoteVersion,
                downloadUrl: asarDownloadUrl,
                releaseUrl: releaseData.mod.releaseUrl || `https://github.com/xokeza/YaMusicMod/releases/tag/v${remoteVersion}`,
                releases: releaseData.mod.releases || {},
            };

            return this.latestData;
        }

        return null;
    }

    async check(force = false) {
        if (this.checkingPromise) {
            return this.checkingPromise;
        }
        this.checkingPromise = (async () => {
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
                this.checkingPromise = null;
            }
        })();
        return this.checkingPromise;
    }

    onUpdateAvailable(listener) {
        this.onModUpdateListeners.push(listener);
    }

    async onUpdateDownload(callback) {
        if (this.isDownloading) {
            this.logger.warn('Download already in progress');
            return;
        }
        this.isDownloading = true;

        const tempDir = path.join(electron.app.getPath('temp'), 'llmusic_update');
        await fsPromise.mkdir(tempDir, { recursive: true });
        const targetTmpFile = path.join(tempDir, 'app.asar');

        const asarUrl = this.latestData?.downloadUrl || `https://github.com/xokeza/YaMusicMod/releases/download/v${this.latestVersion}/app.asar`;
        this.logger.log('Downloading in-place update from:', asarUrl, 'to:', targetTmpFile);

        try {
            const writer = fs.createWriteStream(targetTmpFile);
            const response = await axios.get(asarUrl, {
                responseType: 'stream',
                timeout: 60000,
            });

            const totalLength = parseInt(response.headers['content-length'] || '0', 10);
            let downloadedLength = 0;

            response.data.on('data', (chunk) => {
                downloadedLength += chunk.length;
                const progress = totalLength > 0 ? downloadedLength / totalLength : 0.5;
                if (typeof callback === 'function') {
                    callback(progress, progress);
                }
                writer.write(chunk);
            });

            await new Promise((resolve, reject) => {
                response.data.on('end', () => {
                    writer.end();
                });
                writer.on('finish', resolve);
                writer.on('error', reject);
                response.data.on('error', reject);
            });

            this.logger.log('Download finished successfully. Ready to install.');
            if (typeof callback === 'function') {
                callback(1.1, -1);
            }
            setTimeout(() => {
                this.onInstallUpdate().catch((e) => {
                    this.logger.error('Auto install after download failed:', e);
                });
            }, 800);
        } catch (err) {
            this.logger.error('Download update failed:', err?.message || err);
            if (typeof callback === 'function') {
                callback(-1, -1);
            }
        } finally {
            this.isDownloading = false;
        }
    }

    async onInstallUpdate() {
        if (this.isInstalling) {
            this.logger.warn('Installation already in progress');
            return;
        }
        this.isInstalling = true;
        this.logger.log('Starting in-app mod installation and relaunch...');
        const tempDir = path.join(electron.app.getPath('temp'), 'llmusic_update');
        const downloadedAsar = path.join(tempDir, 'app.asar');

        if (!fs.existsSync(downloadedAsar)) {
            this.logger.error('Downloaded file not found:', downloadedAsar);
            return;
        }

        // Determine destination app.asar path
        let targetAsar = electron.app.getAppPath();
        if (!targetAsar.endsWith('.asar')) {
            targetAsar = path.join(process.resourcesPath, 'app.asar');
        }

        this.logger.log(`Replacing ${targetAsar} with ${downloadedAsar}`);

        if (process.platform === 'win32') {
            const batPath = path.join(tempDir, 'update.bat');
            const execPath = process.execPath;
            const batContent = "@echo off\r\nchcp 65001 >nul\r\ntimeout /t 1 /nobreak >nul\r\ncopy /y \"" + downloadedAsar + "\" \"" + targetAsar + "\" >nul\r\nstart \"\" \"" + execPath + "\"\r\nexit\r\n";
            await fsPromise.writeFile(batPath, batContent);
            spawn('cmd.exe', ['/c', batPath], { detached: true, stdio: 'ignore' }).unref();
            electron.app.exit(0);
        } else if (process.platform === 'linux') {
            let isWritable = false;
            try {
                await fsPromise.access(targetAsar, fs.constants.W_OK);
                isWritable = true;
            } catch {
                isWritable = false;
            }

            if (isWritable) {
                await fsPromise.copyFile(downloadedAsar, targetAsar);
                electron.app.relaunch();
                electron.app.exit(0);
            } else {
                // Not writable by user -> prompt polkit password dialog via pkexec
                this.logger.log('File is root-owned, launching pkexec...');
                const child = spawn('pkexec', ['/bin/cp', downloadedAsar, targetAsar], {
                    stdio: 'inherit',
                });
                child.on('close', (code) => {
                    if (code === 0) {
                        this.logger.log('pkexec copy successful, restarting...');
                        electron.app.relaunch();
                        electron.app.exit(0);
                    } else {
                        this.logger.error('pkexec copy cancelled or failed with code:', code);
                    }
                });
            }
        } else if (process.platform === 'darwin') {
            let isWritable = false;
            try {
                await fsPromise.access(targetAsar, fs.constants.W_OK);
                isWritable = true;
            } catch {
                isWritable = false;
            }

            if (isWritable) {
                await fsPromise.copyFile(downloadedAsar, targetAsar);
                electron.app.relaunch();
                electron.app.exit(0);
            } else {
                const cmd = `osascript -e 'do shell script "cp \\${downloadedAsar}\\ \\${targetAsar}\" with administrator privileges'`;
                exec(cmd, (err) => {
                    if (!err) {
                        electron.app.relaunch();
                        electron.app.exit(0);
                    } else {
                        this.logger.error('macOS admin copy failed:', err);
                    }
                });
            }
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
