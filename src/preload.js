/**
 * YaMusicMod — Preload Bridge
 * Открывает безопасный канал между renderer и main process.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yaModIPC', {
  send: (channel, data) => {
    const allowed = [
      'ya-mod:track-changed',
      'ya-mod:rpc-toggle',
      'ya-mod:download-track',
      'ya-mod:download-playlist',
    ];
    if (allowed.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },

  invoke: (channel, data) => {
    const allowed = ['ya-mod:save-settings', 'ya-mod:load-settings'];
    if (allowed.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
    return Promise.reject(new Error('Канал не разрешён: ' + channel));
  },

  on: (channel, callback) => {
    const allowed = ['ya-mod:download-progress'];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_event, data) => callback(data));
    }
  },
});

