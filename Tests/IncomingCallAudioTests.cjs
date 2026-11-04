'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'Ma nguon', 'incoming-call-audio.js'), 'utf8');
new vm.Script(source, { filename: 'incoming-call-audio.js' });

function harness(pathname, mediaSession = null) {
  const messages = [];
  let originalPlays = 0;
  const audios = [];
  class AudioMedia {
    constructor(tagName, src) {
      this.tagName = tagName;
      this.src = src;
      this.currentSrc = '';
      this.currentTime = 7;
      this.paused = false;
      audios.push(this);
    }
    pause() { this.paused = true; }
    play() { originalPlays++; return Promise.resolve('original'); }
  }
  const document = { querySelectorAll() { return audios; } };
  const window = {
    webkit: { messageHandlers: { vmThongBao: {
      postMessage(data) { messages.push(data); }
    } } },
  };
  vm.runInNewContext(source, {
    window, document, location: { pathname },
    HTMLMediaElement: AudioMedia, Promise, navigator: { mediaSession },
  }, { filename: 'incoming-call-audio.js' });
  return { AudioMedia, window, messages, get originalPlays() { return originalPlays; } };
}

(async () => {
  const main = harness('/');
  const ringtone = new main.AudioMedia('AUDIO', 'https://static.xx.fbcdn.net/taJw7SpZVz2.mp3');
  await ringtone.play();
  assert.equal(main.originalPlays, 0, 'Web incoming ringtone must not reach WKWebView playback');
  assert.equal(main.messages.length, 1);
  assert.equal(main.messages[0].amChuongGoiDen, true);

  const mainStatus = main.window.__mnCallAudioStatus();
  assert.equal(mainStatus.mediaSessionAvailable, false);
  assert.equal(mainStatus.suppressedWebRingtones, 1);
  const voice = new main.AudioMedia('AUDIO', 'https://example.com/voice-message.ogg');
  const video = new main.AudioMedia('VIDEO', 'https://example.com/video.mp4');
  await voice.play();
  await video.play();
  assert.equal(main.originalPlays, 2, 'Voice/video playback must remain untouched');

  const manual = main.window.__mnStopIncomingRingtone();
  assert.equal(manual, 1, 'Emergency stop must target ringtone only');
  assert.equal(ringtone.paused, true);
  assert.equal(voice.paused, false);
  assert.equal(video.paused, false);

  const media = harness('/', { metadata: { title: 'Someone is calling' }, playbackState: 'playing' });
  const mediaStatus = media.window.__mnCallAudioStatus();
  assert.equal(mediaStatus.mediaSessionCallTitle, true);
  assert.equal(mediaStatus.mediaSessionPlaybackState, 'playing');
  assert.equal(mediaStatus.mediaSessionAvailable, true);
  const call = harness('/groupcall/123');
  await new call.AudioMedia('AUDIO', 'https://static.xx.fbcdn.net/taJw7SpZVz2.mp3').play();
  assert.equal(call.originalPlays, 1, 'Call-window media must not be intercepted');

  console.log('Incoming call audio tests passed: WebKit suppression, native bridge, targeted stop and unaffected media.');
})().catch(error => { console.error(error); process.exitCode = 1; });
