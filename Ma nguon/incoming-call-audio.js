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

  // Meta may publish caller metadata through Media Session independently of
  // audio.play(). Suppress *incoming-call* metadata only; never hide music,
  // voice notes, Facebook Reels or an already-established WebRTC call.
  let mediaSessionIntercepted = false;
  let mediaSessionRejected = '';
  let suppressedCallMetadata = 0;
  let suppressedCallPlaybackStates = 0;
  let lastCallMetadataAt = 0;
  const CALL_TITLE = /(?:\bis calling\b|\bcalling you\b|\bincoming (?:audio|video )?call\b|đang gọi(?: cho bạn)?|cuộc gọi đến|gọi đến)/i;
  const isCallMetadata = (meta) => {
    if (!meta || typeof meta !== 'object') return false;
    // Check only the title; never capture the caller's name for diagnostics.
    return CALL_TITLE.test(String(meta.title || '').slice(0, 160));
  };

  function installMediaSessionGuard() {
    try {
      const media = navigator.mediaSession;
      if (!media) { mediaSessionRejected = 'navigator.mediaSession unavailable'; return; }
      let parent = media;
      let metadataDescriptor = null;
      let playbackDescriptor = null;
      while (parent && !metadataDescriptor) {
        metadataDescriptor = Object.getOwnPropertyDescriptor(parent, 'metadata');
        parent = Object.getPrototypeOf(parent);
      }
      parent = media;
      while (parent && !playbackDescriptor) {
        playbackDescriptor = Object.getOwnPropertyDescriptor(parent, 'playbackState');
        parent = Object.getPrototypeOf(parent);
      }
      if (!metadataDescriptor || typeof metadataDescriptor.set !== 'function') {
        mediaSessionRejected = 'metadata setter unavailable';
        return;
      }
      const metadataSetter = metadataDescriptor.set;
      const metadataGetter = metadataDescriptor.get;
      Object.defineProperty(media, 'metadata', {
        configurable: true,
        enumerable: true,
        get() { return metadataGetter ? metadataGetter.call(media) : null; },
        set(value) {
          if (!/\/groupcall(?:\/|$)/i.test(location.pathname) && isCallMetadata(value)) {
            suppressedCallMetadata++;
            lastCallMetadataAt = Date.now();
            send({ callMediaSessionSuppressed: true });
            // Clear the previous caller metadata and mark it not playing.
            // This does not stop microphone capture or actual call media.
            try { metadataSetter.call(media, null); } catch (_) {}
            if (playbackDescriptor && playbackDescriptor.set) {
              try { playbackDescriptor.set.call(media, 'none'); } catch (_) {}
            }
            return;
          }
          metadataSetter.call(media, value);
        }
      });
      if (playbackDescriptor && typeof playbackDescriptor.set === 'function') {
        const setter = playbackDescriptor.set;
        const getter = playbackDescriptor.get;
        Object.defineProperty(media, 'playbackState', {
          configurable: true,
          enumerable: true,
          get() { return getter ? getter.call(media) : 'none'; },
          set(value) {
            // If the site marks the incoming call as playing immediately
            // after publishing caller metadata, keep it out of Now Playing.
            // Bound by 10 seconds and cleared once call modal is dismissed.
            if (Date.now() - lastCallMetadataAt < 10000 &&
                !/\/groupcall(?:\/|$)/i.test(location.pathname) &&
                String(value) === 'playing') {
              suppressedCallPlaybackStates++;
              setter.call(media, 'none');
              return;
            }
            setter.call(media, value);
          }
        });
      }
      mediaSessionIntercepted = true;
    } catch (error) {
      mediaSessionRejected = 'hook rejected: ' + (error && error.name || 'unknown');
    }
  }
  installMediaSessionGuard();

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
    version: '1.2-media-session',
    installed: true,
    suppressedWebRingtones: suppressed,
    mediaSessionIntercepted,
    mediaSessionRejected,
    suppressedCallMetadata,
    suppressedCallPlaybackStates
  });
})();