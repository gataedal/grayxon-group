(function () {
  'use strict';
  if (window.__gxLiveKitLocalShareOverlayInstalled) return;
  window.__gxLiveKitLocalShareOverlayInstalled = true;

  var observedStage = null;
  var stageObserver = null;
  var bodyObserver = null;
  var pendingFrame = 0;
  var observedVideos = new WeakSet();
  var observedTracks = new WeakSet();

  function scheduleSync() {
    if (pendingFrame) return;
    pendingFrame = window.requestAnimationFrame(function () {
      pendingFrame = 0;
      syncLocalShareOverlay();
    });
  }

  function hasLiveShareVideo(tile) {
    var video = tile && tile.querySelector('video');
    if (!video) return false;
    if (!observedVideos.has(video)) {
      observedVideos.add(video);
      ['loadedmetadata', 'playing', 'emptied', 'ended', 'pause'].forEach(function (name) {
        video.addEventListener(name, scheduleSync);
      });
    }
    var stream = video.srcObject;
    var tracks = stream && typeof stream.getVideoTracks === 'function' ? stream.getVideoTracks() : [];
    var liveTracks = tracks.filter(function (track) {
      if (!observedTracks.has(track)) {
        observedTracks.add(track);
        track.addEventListener('ended', scheduleSync, { once: true });
      }
      return track.readyState === 'live';
    });
    return liveTracks.length > 0;
  }

  function syncLocalShareOverlay() {
    var stage = observedStage;
    if (!stage || !stage.isConnected) return;
    var localTile = stage.querySelector('[data-gx-livekit-tile="gx-livekit-local"]');
    var shareTiles = stage.querySelectorAll('[data-gx-livekit-tile][data-gx-livekit-screen-share="true"]');
    var localIdentity = String(localTile && localTile.dataset.gxLivekitIdentity || '');
    var localCameraVisible = !!(
      localTile &&
      localTile.dataset.gxLivekitCameraEnabled === 'true' &&
      localTile.querySelector('video')
    );
    var ownShareActive = false;
    for (var i = 0; i < shareTiles.length; i++) {
      var tile = shareTiles[i];
      var live = hasLiveShareVideo(tile);
      if (live) tile.removeAttribute('data-gx-livekit-share-ended');
      else tile.setAttribute('data-gx-livekit-share-ended', 'true');
      if (
        live &&
        localIdentity &&
        String(tile.dataset.gxLivekitIdentity || '') === localIdentity
      ) ownShareActive = true;
    }
    if (ownShareActive && localCameraVisible) stage.setAttribute('data-gx-local-share-active', 'true');
    else stage.removeAttribute('data-gx-local-share-active');
  }

  function attachToCurrentStage() {
    var stage = document.getElementById('grayxonLiveKitStage');
    if (stage === observedStage) return;
    if (stageObserver) stageObserver.disconnect();
    stageObserver = null;
    if (observedStage) observedStage.removeAttribute('data-gx-local-share-active');
    observedStage = stage;
    if (!stage) return;
    stageObserver = new MutationObserver(scheduleSync);
    stageObserver.observe(stage, { childList: true, subtree: true });
    scheduleSync();
  }

  function init() {
    if (!document.body || bodyObserver) return;
    bodyObserver = new MutationObserver(attachToCurrentStage);
    bodyObserver.observe(document.body, { childList: true });
    attachToCurrentStage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
