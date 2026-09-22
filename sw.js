/**
 * sw.js — Service Worker（让 PWA 支持离线运行）
 * 首次访问时缓存所有静态资源，之后优先使用缓存，离线也能判卷。
 */
const VERSION = 'omr-v1';
const ASSETS = [
  './',
  './index.html',
  './template.html',
  './app.js',
  './layout.js',
  './lib/opencv.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './answers.sample.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // 同源资源：缓存优先
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(resp => {
          if (resp.ok && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(VERSION).then(c => c.put(e.request, copy));
          }
          return resp;
        }).catch(() => caches.match('./index.html'));
      })
    );
  }
});