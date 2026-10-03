'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.getLLMusicStatsTracker = getLLMusicStatsTracker;
exports.LLMusicStatsTracker = void 0;

const electron = require('electron');
const { Logger } = require('../packages/logger/Logger.js');
const store_js_1 = require('./store.js');
const { PASSPORT_LOGIN, PASSPORT_LOGIN_DOMAIN, YANDEX_ID } = require('../constants/cookies.js');

const API_ENDPOINT = 'https://xokeza.su/llmusic/api/auth.php';
const SYNC_INTERVAL_MS = 5000;
const AUTH_CHECK_INTERVAL_MS = 30000;
const LLMUSIC_STATS_KEY = Symbol.for('llmusic.stats.instance');

class LLMusicStatsTracker {
    constructor(window) {
        this.window = window;
        this.logger = new Logger('LLMusicStatsTracker');

        this.token = store_js_1.get('llmusicToken') || '';
        this.user = store_js_1.get('llmusicUser') || null;
        this.yandexLogin = '';
        this.yandexUid = '';
        this.isAuthenticated = false;

        this.isPlaying = false;
        this.currentTrack = null;
        this.lastTrackId = null;
        this.lastPlayTime = 0;
        this.accumulatedPlaySeconds = 0;

        this.lastLiked = false;
        this.lastDisliked = false;
        this.pendingReaction = null;
        this.pendingTrackStart = false;

        this.stats = {
            hoursListened: 0,
            tracksLiked: 0,
            tracksDisliked: 0,
            tracksPlayed: 0,
            topArtists: []
        };

        this.syncTimer = null;
        this.authTimer = null;
        this.isSyncing = false;
    }

    init() {
        this.logger.info('Initializing LLMusicStatsTracker...');
        void this.checkAuth();

        if (this.authTimer) clearInterval(this.authTimer);
        this.authTimer = setInterval(() => {
            void this.checkAuth();
        }, AUTH_CHECK_INTERVAL_MS);

        if (this.syncTimer) clearInterval(this.syncTimer);
        this.syncTimer = setInterval(() => {
            void this.tick();
        }, SYNC_INTERVAL_MS);
    }

    async getPassportCookies() {
        try {
            const loginCookies = await electron.session.defaultSession.cookies.get({
                name: PASSPORT_LOGIN,
                domain: PASSPORT_LOGIN_DOMAIN,
            });
            const uidCookies = await electron.session.defaultSession.cookies.get({
                name: YANDEX_ID,
                domain: PASSPORT_LOGIN_DOMAIN,
            });
            this.yandexLogin = loginCookies?.[0]?.value || '';
            this.yandexUid = uidCookies?.[0]?.value || '';
        } catch (e) {
            this.logger.warn(`Failed to retrieve passport cookies: ${e.message}`);
        }
    }

    async checkAuth() {
        await this.getPassportCookies();
        const savedToken = store_js_1.get('llmusicToken') || this.token;

        try {
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'check_client_auth',
                    token: savedToken,
                    yandex_login: this.yandexLogin,
                    yandex_uid: this.yandexUid
                })
            });

            if (!response.ok) {
                this.logger.warn(`Auth check HTTP ${response.status}`);
                return;
            }

            const data = await response.json();
            if (data?.authenticated && data?.user) {
                this.isAuthenticated = true;
                this.user = data.user;
                this.token = data.token || savedToken;
                store_js_1.set('llmusicToken', this.token);
                store_js_1.set('llmusicUser', this.user);

                this.stats.hoursListened = data.user.hours_listened || 0;
                this.stats.tracksLiked = data.user.tracks_liked || 0;
                this.stats.tracksDisliked = data.user.tracks_disliked || 0;
                this.stats.tracksPlayed = data.user.tracks_played || 0;

                this.logger.info(`Authenticated with LLMusic site as: ${data.user.username} (hours: ${this.stats.hoursListened})`);
            } else {
                this.isAuthenticated = false;
                this.logger.debug('Not authenticated on LLMusic site');
            }
        } catch (e) {
            this.logger.warn(`Auth check error: ${e.message}`);
        }
    }

    handlePlayerState(data) {
        if (!data) return;

        const isPlayingNow = Boolean(data.isPlaying && ['playing'].includes(data.status));
        const track = data.track;
        const actionsStore = data.actionsStore || {};
        const now = Date.now();

        // 1. Check for track change
        if (track && track.id !== this.lastTrackId) {
            this.lastTrackId = track.id;
            this.currentTrack = track;
            this.lastLiked = Boolean(actionsStore.isLiked);
            this.lastDisliked = Boolean(actionsStore.isDisliked);
            this.pendingTrackStart = true;
            this.lastPlayTime = now;
        }

        // 2. Check for like/dislike reaction toggling
        const currentLiked = Boolean(actionsStore.isLiked);
        const currentDisliked = Boolean(actionsStore.isDisliked);

        if (currentLiked !== this.lastLiked) {
            this.lastLiked = currentLiked;
            if (currentLiked) {
                this.pendingReaction = 'like';
                this.lastDisliked = false;
            } else {
                this.pendingReaction = 'none';
            }
            void this.tick(true);
        } else if (currentDisliked !== this.lastDisliked) {
            this.lastDisliked = currentDisliked;
            if (currentDisliked) {
                this.pendingReaction = 'dislike';
                this.lastLiked = false;
            } else {
                this.pendingReaction = 'none';
            }
            void this.tick(true);
        }

        // 3. Playback time tracking
        if (isPlayingNow) {
            if (!this.isPlaying) {
                this.isPlaying = true;
                this.lastPlayTime = now;
            } else {
                const elapsedSeconds = (now - this.lastPlayTime) / 1000;
                if (elapsedSeconds > 0 && elapsedSeconds < 30) {
                    this.accumulatedPlaySeconds += elapsedSeconds;
                }
                this.lastPlayTime = now;
            }
        } else {
            if (this.isPlaying) {
                const elapsedSeconds = (now - this.lastPlayTime) / 1000;
                if (elapsedSeconds > 0 && elapsedSeconds < 30) {
                    this.accumulatedPlaySeconds += elapsedSeconds;
                }
                this.isPlaying = false;
                this.lastPlayTime = now;
                void this.tick(true);
            }
        }

        this.currentTrack = track || this.currentTrack;
    }

    async tick(force = false) {
        if (this.isSyncing) return;
        if (!this.isAuthenticated) {
            if (this.isPlaying) {
                await this.checkAuth();
            }
            if (!this.isAuthenticated) return;
        }

        const now = Date.now();
        if (this.isPlaying && this.lastPlayTime > 0) {
            const elapsed = (now - this.lastPlayTime) / 1000;
            if (elapsed > 0 && elapsed < 30) {
                this.accumulatedPlaySeconds += elapsed;
            }
            this.lastPlayTime = now;
        }

        const durationSeconds = Math.round(this.accumulatedPlaySeconds * 10) / 10;
        const reactionToSend = this.pendingReaction;
        const trackStartedToSend = this.pendingTrackStart;

        if (!force && durationSeconds < 1 && !reactionToSend && !trackStartedToSend) {
            return;
        }

        this.isSyncing = true;
        this.accumulatedPlaySeconds = 0;
        this.pendingReaction = null;
        if (trackStartedToSend) this.pendingTrackStart = false;

        try {
            const payload = {
                action: 'sync_stats',
                token: this.token,
                yandex_login: this.yandexLogin,
                yandex_uid: this.yandexUid,
                duration_seconds: durationSeconds,
                is_playing: this.isPlaying,
                track: this.currentTrack ? {
                    id: this.currentTrack.id,
                    title: this.currentTrack.title,
                    artists: this.currentTrack.artists,
                    durationMs: this.currentTrack.durationMs
                } : null,
                reaction: reactionToSend,
                track_started: trackStartedToSend
            };

            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                this.logger.warn(`Sync stats HTTP ${response.status}`);
                this.accumulatedPlaySeconds += durationSeconds;
                return;
            }

            const data = await response.json();
            if (data?.success) {
                this.stats.hoursListened = data.hours_listened;
                this.stats.tracksLiked = data.tracks_liked;
                this.stats.tracksDisliked = data.tracks_disliked;
                this.stats.tracksPlayed = data.tracks_played;
                this.stats.topArtists = data.top_artists || [];
                this.logger.info(`Synced stats: +${durationSeconds}s. Total: ${this.stats.hoursListened.toFixed(4)}h, likes: ${this.stats.tracksLiked}, dislikes: ${this.stats.tracksDisliked}`);
            }
        } catch (e) {
            this.logger.warn(`Failed to sync stats: ${e.message}`);
            this.accumulatedPlaySeconds += durationSeconds;
        } finally {
            this.isSyncing = false;
        }
    }

    getStatus() {
        return {
            authenticated: this.isAuthenticated,
            user: this.user,
            stats: this.stats,
            isPlaying: this.isPlaying,
            currentTrack: this.currentTrack
        };
    }
}

let instance = null;

function getLLMusicStatsTracker(window) {
    const root = globalThis;
    if (!instance && root[LLMUSIC_STATS_KEY]) {
        instance = root[LLMUSIC_STATS_KEY];
    }
    if (!instance) {
        instance = new LLMusicStatsTracker(window);
        root[LLMUSIC_STATS_KEY] = instance;
    }
    return instance;
}

exports.LLMusicStatsTracker = LLMusicStatsTracker;
