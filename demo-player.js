(() => {
  'use strict';
  const section = document.querySelector('#real-world');
  const tabs = [...section.querySelectorAll('.demo-tabs [role="tab"]')];
  const players = [...section.querySelectorAll('.demo-media')];
  const downloads = new WeakMap();
  const controllers = new WeakMap();

  function prepare(video) {
    if (downloads.has(video)) return downloads.get(video);
    // These short demos are about 2 MB each. Finish fetching before playback
    // so a slow connection cannot consume the opening behind the poster.
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 90000);
    const download = fetch(video.querySelector('source').src, {signal:abort.signal})
      .then(response => {
        if (!response.ok) throw new Error(`Video download failed: ${response.status}`);
        return response.blob();
      })
      .then(blob => URL.createObjectURL(blob))
      .catch(error => { downloads.delete(video); throw error; })
      .finally(() => clearTimeout(timeout));
    downloads.set(video, download);
    return download;
  }
  function warm(video) { prepare(video).catch(() => {}); }

  players.forEach(media => {
    const video = media.querySelector('video');
    const cover = media.querySelector('.demo-cover');
    const start = media.querySelector('.demo-start');
    const label = start.querySelector('span');
    const buffering = media.querySelector('.demo-buffering');
    const fallback = media.querySelector('.demo-fallback');
    let frameShown = false;
    let firstFrameReady = false;
    let pending;

    function busy(value) {
      media.classList.toggle('is-buffering', value);
      buffering.hidden = !value || !frameShown;
      media.setAttribute('aria-busy', String(value));
      if (!cover.hidden) {
        start.disabled = value;
        label.textContent = value ? 'Loading video…' : 'Play demo';
      }
    }
    function revealFrame() {
      frameShown = true;
      cover.hidden = true;
      busy(false);
      if (document.activeElement === start) video.focus({preventScroll:true});
    }
    function primeFirstFrame(url, signal) {
      return new Promise((resolve, reject) => {
        let callback, raf1, raf2;
        const finish = error => {
          clearTimeout(timeout);
          if (callback !== undefined) video.cancelVideoFrameCallback(callback);
          cancelAnimationFrame(raf1);
          cancelAnimationFrame(raf2);
          video.removeEventListener('loadeddata', seekFirstFrame);
          video.removeEventListener('seeked', fallbackFrame);
          video.removeEventListener('error', failed);
          signal.removeEventListener('abort', aborted);
          error ? reject(error) : resolve();
        };
        const failed = () => finish(new Error('Video frame unavailable'));
        const aborted = () => finish(new DOMException('Cancelled', 'AbortError'));
        const timeout = setTimeout(failed, 20000);
        const seekFirstFrame = () => {
          // A paused seek prompts a decoded frame without advancing playback.
          video.currentTime = video.currentTime === 0.001 ? 0 : 0.001;
        };
        const fallbackFrame = () => {
          if ('requestVideoFrameCallback' in video || video.readyState < 2) return;
          raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => finish()); });
        };
        signal.addEventListener('abort', aborted, {once:true});
        video.addEventListener('error', failed, {once:true});
        video.addEventListener('loadeddata', seekFirstFrame, {once:true});
        video.addEventListener('seeked', fallbackFrame);
        // Register BEFORE load/seek: paused videos may present only one frame.
        if ('requestVideoFrameCallback' in video) callback = video.requestVideoFrameCallback(() => finish());
        if (video.src !== url || video.error) {
          video.src = url;
          video.preload = 'auto';
          video.load();
        } else if (video.readyState >= 2) seekFirstFrame();
      });
    }
    function showError() {
      video.pause();
      frameShown = false;
      firstFrameReady = false;
      cover.hidden = false;
      busy(false);
      label.textContent = 'Retry video';
      fallback.hidden = false;
    }
    function cancel() {
      pending?.abort();
      pending = undefined;
      video.pause();
      busy(false);
    }
    controllers.set(video, {cancel});
    video.addEventListener('demo:cancel', cancel);
    async function begin() {
      if (pending) return;
      const attempt = new AbortController();
      pending = attempt;
      fallback.hidden = true;
      video.pause();
      busy(true);
      try {
        const url = await prepare(video);
        if (attempt.signal.aborted) return;
        if (!firstFrameReady) {
          await primeFirstFrame(url, attempt.signal);
          firstFrameReady = true;
        }
        if (attempt.signal.aborted) return;
        // The first frame has been submitted for display while still PAUSED.
        // Uncover it before starting the clock, never play underneath the cover.
        revealFrame();
        await video.play();
      } catch (error) {
        if (attempt.signal.aborted) return;
        if (error.name === 'NotAllowedError') {
          frameShown = false; cover.hidden = false; busy(false);
        } else showError();
      } finally {
        if (pending === attempt) pending = undefined;
      }
    }
    start.addEventListener('click', begin);
    video.addEventListener('play', () => {
      if (!frameShown) { video.pause(); begin(); }
    });
    video.addEventListener('playing', () => { if (frameShown) busy(false); });
    video.addEventListener('waiting', () => { if (!video.paused) busy(true); });
    video.addEventListener('seeking', () => { if (frameShown) busy(true); });
    video.addEventListener('seeked', () => {
      // A paused seek can display its frame without another presentation callback.
      // The first-play cover still waits for the callback; an existing frame does not.
      if (frameShown && video.paused && video.readyState >= 2) busy(false);
      else if (frameShown && video.readyState >= 2) busy(false);
    });
    video.addEventListener('pause', () => { if (!pending) busy(false); });
    video.addEventListener('ended', () => busy(false));
    video.addEventListener('error', () => { if (!pending) showError(); });
  });

  function select(tab, focus = false) {
    tabs.forEach(item => {
      const selected = item === tab;
      const panel = document.getElementById(item.getAttribute('aria-controls'));
      const video = panel.querySelector('video');
      if (!selected) controllers.get(video).cancel();
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      panel.hidden = !selected;
      if (selected) warm(video);
    });
    if (focus) tab.focus({preventScroll:true});
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      const destination = {ArrowRight:(index + 1) % tabs.length, ArrowLeft:(index + tabs.length - 1) % tabs.length, Home:0, End:tabs.length - 1}[event.key];
      if (destination !== undefined) { event.preventDefault(); select(tabs[destination], true); }
    });
  });

  // Warm only the selected demo as the reader approaches this section.
  // The second video starts fetching when selected, avoiding two competing downloads.
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      const active = section.querySelector('.real-demo:not([hidden]) video');
      warm(active);
      observer.disconnect();
    }, {rootMargin:'800px 0px'});
    observer.observe(section);
  } else warm(players[0].querySelector('video'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) players.forEach(media => controllers.get(media.querySelector('video')).cancel());
  });
})();
