# Safari Facebook + Messenger Native: ringtone after answering in Native

## Evidence collected 2026-11-04

- **Trigger is acceptance in Native while Safari Facebook remains open**, not merely having two clients running.
- If the call rings but the user does not answer in Native, the user reports **no ghost ringtone and no doubled desktop call rows**.
- If the user accepts in Native while Safari Facebook is open, Safari may keep ringing until its tab is reloaded; desktop chat may show paired missed-call rows.
- **Messenger on the phone shows one call-history row** for the same events.
- Native Call Diagnostics after acceptance: `Active=false`, `Started=2`, `Stopped=2`, `suppressedWebRingtones=2`, `Duplicate call popups blocked=0`, `incomingDialogActive=false`.
- Native only: no new Now Playing call entry. Safari Facebook alone: can create Now Playing.
- Safari Web Inspector's Media Session states were observed as `none`, `playing`, then `paused`, with one collapsed `audio` item. **These states do not identify the active ringing element**.

### Current conclusion

The accepted-call event is the strong trigger, and Safari's page or media playback may fail to clear its ringing state when the call is answered by a separate desktop client. This is not proof of a Meta server bug or a second actual call; the single mobile history entry weighs against global duplication.

The native floating accept handler invokes `window.__vmBamGoiDen('Chấp nhận')`, which locates the page's accept button and triggers `element.click()` **once**. The current diagnostic shows no duplicate call popups. Do not change the native ringtone/accepted-call path or suppress server-side history based solely on this correlation.

## Read-only Safari Web Inspector diagnosis

Run this in the JavaScript Console **of the Facebook tab in Safari** after accepting in Messenger Native and while the Safari ghost ringtone is audible:

```javascript
(() => {
  const docs = [{ name: 'top', doc: document }];
  let inaccessibleFrames = 0;
  for (const [i, f] of [...document.querySelectorAll('iframe')].entries()) {
    try {
      if (f.contentDocument) docs.push({ name: 'frame-' + i, doc: f.contentDocument });
      else inaccessibleFrames++;
    } catch { inaccessibleFrames++; }
  }
  const tracks = docs.flatMap(({ name, doc }) =>
    [...doc.querySelectorAll('audio,video')].map((a, i) => ({
      frame: name,
      index: i,
      type: a.tagName.toLowerCase(),
      paused: a.paused,
      ended: a.ended,
      loop: a.loop,
      muted: a.muted,
      time: Math.round(a.currentTime || 0),
      file: (() => {
        try { return new URL(a.currentSrc || a.src).pathname.split('/').pop(); }
        catch { return '(stream/unknown)'; }
      })()
    }))
  );
  const result = {
    mediaSession: {
      available: !!navigator.mediaSession,
      playbackState: navigator.mediaSession?.playbackState || 'unknown',
      hasMetadata: !!navigator.mediaSession?.metadata
    },
    inaccessibleFrames,
    tracks
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
})()
```

This only reads the page state; it does not record, transmit, or pause media. Avoid sharing raw private URLs, tokens, or caller names from other browser logs.

### Controlled, manual stop test (only after call has ended)

The following manually pauses HTML audio still playing in **Safari's top Facebook document only**, without refreshing the page. It is not a permanent app fix, and it does not reach WebAudio or cross-origin frames:

```javascript
(() => {
  const active = [...document.querySelectorAll('audio')].filter(a => !a.paused && !a.ended);
  active.forEach(a => { a.pause(); try { a.currentTime = 0; } catch {} });
  return 'Paused ' + active.length + ' top-document audio elements';
})()
```

If ghost ringing stops, one of those HTML audio elements was responsible. If it continues, check cross-origin iframe audio, WebAudio, and Safari's tab speaker activity instead of changing Messenger Native. Only run after ending a call, because this manual action can pause any other music playing in the same Facebook tab.

## Workaround

For reliable calls, quit Safari or close the logged-in Facebook tab while receiving calls on Messenger Native. Safari tab mute silences browser output but does not resolve a possibly stuck incoming call session or paired desktop history rows. Do not implement cross-process JavaScript control, AppleScript injection, account logout, or broad audio suppression in Messenger Native without explicit user approval.
