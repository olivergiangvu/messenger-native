/*
 * Read-only, on-demand Messenger Web renderer diagnostics.
 * Never records message text, contact names, URLs, cookies, or browser storage.
 * The counters are NOT WebKit physical footprint or proof of a memory leak.
 * No timers, observers, network requests, or persistent DOM references.
 */
(() => {
  if (window.__mnRendererStatus) return;
  window.__mnRendererStatus = function () {
    const count = (tag) => document.getElementsByTagName(tag).length;
    const images = document.getElementsByTagName('img');
    const videos = document.getElementsByTagName('video');
    let loadedImages = 0;
    let imagePixels = 0;
    const maxImages = Math.min(images.length, 1500);
    for (let i = 0; i < maxImages; i++) {
      const image = images[i];
      if (!image || !image.complete || !image.naturalWidth || !image.naturalHeight) continue;
      loadedImages++;
      imagePixels += image.naturalWidth * image.naturalHeight;
    }
    let playingVideos = 0;
    for (let i = 0, max = Math.min(videos.length, 500); i < max; i++) {
      if (videos[i] && !videos[i].paused && !videos[i].ended) playingVideos++;
    }
    const perf = typeof performance !== 'undefined' ? performance : null;
    const heap = perf && perf.memory && Number.isFinite(perf.memory.usedJSHeapSize)
      ? Math.round(perf.memory.usedJSHeapSize / 1048576) : null;
    let resourceCount = null;
    try {
      resourceCount = perf && typeof perf.getEntriesByType === 'function'
        ? perf.getEntriesByType('resource').length : null;
    } catch (_) {}
    return {
      version: '1.0-on-demand',
      elementCount: count('*'),
      images: images.length,
      sampledImages: maxImages,
      loadedImages,
      decodedPixelProxyMB: Math.round(imagePixels * 4 / 1048576),
      videos: videos.length,
      playingVideos,
      iframes: count('iframe'),
      canvas: count('canvas'),
      svg: count('svg'),
      resourceTimingEntries: resourceCount,
      jsHeapMBIfSupported: heap,
      warning: 'Pixel proxy is NOT actual image or WebKit RAM; JS heap may be unavailable in Safari.'
    };
  };
})();