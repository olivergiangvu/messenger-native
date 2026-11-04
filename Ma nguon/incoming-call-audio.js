/*
 * Messenger Native — incoming call audio bridge.
 * Injected at documentStart AFTER jsThongBao, so this wrapper gets the final
 * chance to suppress exactly the known incoming-call ringtone before WebKit
 * creates an unwanted media session/Now Playing.
 *
 * Do not suppress outgoing-call media, voice notes, user videos or Reels.
 */
(() => {
  if (window.__mnCallAudioInstalled) return;
  window.__mnCallAudioInstalled = true;

  const send = (msg) => {
    const handlers = window.webkit && window.webkit.messageHandlers;
    if (handlers && handlers.vmThongBao) handlers.vmThongBao.postMessage(msg);
  };
  let suppressed = 0;
  const playOriginal = HTMLMediaElement.prototype.play;

  function isIncomingRingtone(element) {
    if (element.tagName !== 'AUDIO' || /\/groupcall(?:\/|$)/i.test(location.pathname)) {
      return false;
    }
    // Observed upstream incoming-call ringtone. Unknown Meta audio files are
    // intentionally left untouched until a reliable ID has been observed.
    const file = String(element.currentSrc || element.src || '')
      .split('?')[0].split('/').pop() || '';
    return /^taJw7SpZVz2\.mp3$/i.test(file);
  }

  HTMLMediaElement.prototype.play = function (...args) {
    if (isIncomingRingtone(this)) {
      suppressed++;
      send({ amChuongGoiDen: true });
      // Returning a fulfilled promise preserves play() contract without ever
      // registering this short chime as an active WebKit media session.
      return Promise.resolve();
    }
    return playOriginal.apply(this, args);
  };

  window.__mnStopIncomingRingtone = () => {
    let stopped = 0;
    document.querySelectorAll('audio').forEach((audio) => {
      if (!isIncomingRingtone(audio)) return;
      audio.pause();
      try { audio.currentTime = 0; } catch (_) {}
      stopped++;
    });
    return stopped;
  };

  window.__mnCallAudioStatus = () => ({
    version: '1.1',
    installed: true,
    suppressedWebRingtones: suppressed
  });
})();