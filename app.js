(() => {
  'use strict';
  const config = window.CAUSGROUND_SITE || {};
  document.querySelectorAll('[data-resource]').forEach(link => {
    const value = String(config[link.dataset.resource] || '').trim();
    if (!value) return;
    let url;
    try { url = new URL(value); } catch { return; }
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) return;
    link.href = url.href;
    link.removeAttribute('aria-disabled');
    link.removeAttribute('title');
    if (url.protocol !== 'mailto:') { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  });

  const tabs = [...document.querySelectorAll('.result-tabs [role="tab"]')];
  function activateTab(tab, focus = false) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', event => {
      const destination = {ArrowRight:(index + 1) % tabs.length, ArrowLeft:(index + tabs.length - 1) % tabs.length, Home:0, End:tabs.length - 1}[event.key];
      if (destination !== undefined) { event.preventDefault(); activateTab(tabs[destination], true); }
    });
  });

  const dialog = document.querySelector('#figure-dialog');
  let figureTrigger;
  document.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', () => {
    figureTrigger = button;
    document.querySelector('#figure-title').textContent = button.dataset.title;
    const enlarged = document.querySelector('#enlarged-figure');
    enlarged.src = button.dataset.zoom;
    enlarged.alt = button.querySelector('img').alt;
    dialog.showModal();
  }));
  document.querySelector('#close-figure').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => figureTrigger?.focus());

  const citation = String(config.citation || '').trim();
  if (citation) {
    document.querySelector('#bibtex').textContent = citation;
    document.querySelector('#citation-pending').hidden = true;
    document.querySelector('#copy-citation').hidden = false;
  }
  document.querySelector('#copy-citation').addEventListener('click', async () => {
    const status = document.querySelector('#copy-status');
    try { await navigator.clipboard.writeText(citation); status.textContent = 'Citation copied.'; }
    catch { status.textContent = 'Copy unavailable. Select and copy the citation text above.'; }
  });
  const videos = [...document.querySelectorAll('video')];
  videos.forEach(video => video.addEventListener('play', () => {
    videos.forEach(other => {
      if (other !== video) { other.dispatchEvent(new Event('demo:cancel')); other.pause(); }
    });
  }));
  // Keep expansion in the page: embedded browsers can lose the native
  // fullscreen surface even though the video continues decoding.
  const videoDialog = document.querySelector('#video-dialog');
  const videoStage = document.querySelector('#video-dialog-stage');
  const videoZoomOut = document.querySelector('#video-zoom-out');
  const videoZoomIn = document.querySelector('#video-zoom-in');
  const videoZoomLevel = document.querySelector('#video-zoom-level');
  let videoZoom = 1;
  let expandedVideo, expandedMedia, videoPlaceholder, videoTrigger, videoLabel;
  function sizeExpandedVideo() {
    if (!videoDialog.open || !expandedMedia) return;
    const width = Math.max(1, videoStage.clientWidth - 32);
    const height = Math.max(1, videoStage.clientHeight - 32);
    const fittedWidth = Math.min(width, height * 16 / 9);
    expandedMedia.style.width = `${fittedWidth * videoZoom}px`;
    videoStage.scrollLeft = Math.max(0, (videoStage.scrollWidth - videoStage.clientWidth) / 2);
    videoStage.scrollTop = Math.max(0, (videoStage.scrollHeight - videoStage.clientHeight) / 2);
    videoZoomLevel.textContent = `${Math.round(videoZoom * 100)}%`;
    videoZoomOut.disabled = videoZoom <= 1;
    videoZoomIn.disabled = videoZoom >= 2;
  }
  function setVideoZoom(value) {
    videoZoom = Math.max(1, Math.min(2, value));
    sizeExpandedVideo();
  }
  videoZoomOut.addEventListener('click', () => setVideoZoom(videoZoom - .25));
  videoZoomIn.addEventListener('click', () => setVideoZoom(videoZoom + .25));
  document.querySelector('#video-zoom-fit').addEventListener('click', () => setVideoZoom(1));
  window.addEventListener('resize', sizeExpandedVideo);
  document.querySelectorAll('[data-video-expand]').forEach(button => {
    button.addEventListener('click', () => {
      if (videoDialog.open) return;
      const video = document.getElementById(button.dataset.videoExpand);
      const wasPlaying = !video.paused && !video.ended;
      videoTrigger = button;
      expandedVideo = video;
      expandedMedia = video.closest('.demo-media') || video;
      videoPlaceholder = document.createElement('div');
      videoPlaceholder.className = 'video-placeholder';
      videoPlaceholder.setAttribute('aria-hidden', 'true');
      expandedMedia.before(videoPlaceholder);
      videoLabel = video.getAttribute('aria-labelledby');
      document.querySelector('#video-dialog-title').textContent = document.getElementById(videoLabel).textContent.replace(/^\s*0[12]\s*/, '').trim();
      video.setAttribute('aria-labelledby', 'video-dialog-title');
      document.querySelector('#video-direct-link').href = video.querySelector('source')?.src || video.currentSrc;
      videoStage.append(expandedMedia);
      document.body.classList.add('video-expanded');
      videoDialog.showModal();
      setVideoZoom(1);
      if (wasPlaying) video.play().catch(() => {});
    });
  });
  document.querySelector('#close-video').addEventListener('click', () => videoDialog.close());
  videoDialog.addEventListener('close', () => {
    if (!expandedVideo) return;
    expandedVideo.dispatchEvent(new Event('demo:cancel'));
    expandedVideo.pause();
    expandedVideo.setAttribute('aria-labelledby', videoLabel);
    expandedMedia.style.removeProperty('width');
    videoPlaceholder.replaceWith(expandedMedia);
    expandedVideo = null;
    expandedMedia = null;
    document.body.classList.remove('video-expanded');
    videoTrigger?.focus({preventScroll:true});
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) videos.forEach(video => video.pause());
  });
})();
