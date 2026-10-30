(function () {
  'use strict';
  if (window.__gxLiveKitLocalShareOverlayInstalled) return;
  window.__gxLiveKitLocalShareOverlayInstalled = true;

  var observedStage = null;
  var stageObserver = null;
  var bodyObserver = null;
  var pendingFrame = 0;

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
    if (localIdentity && localCameraVisible) {
      for (var i = 0; i < shareTiles.length; i++) {
        if (String(shareTiles[i].dataset.gxLivekitIdentity || '') === localIdentity) {
          ownShareActive = true;
          break;
        }
      }
    }
    if (ownShareActive) stage.setAttribute('data-gx-local-share-active', 'true');
    else stage.removeAttribute('data-gx-local-share-active');
  }

  function scheduleSync() {
    if (pendingFrame) return;
    pendingFrame = window.requestAnimationFrame(function () {
      pendingFrame = 0;
      syncLocalShareOverlay();
    });
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
    // The stage's children are enough: track attach/detach and tile creation/removal
    // are child-list changes. Avoid observing attributes or the rest of the portal.
    stageObserver.observe(stage, { childList: true, subtree: true });
    scheduleSync();
  }

  function init() {
    if (!document.body || bodyObserver) return;
    bodyObserver = new MutationObserver(attachToCurrentStage);
    // Observe only direct body children so opening/closing the call modal is detected
    // without watching every mutation in the entire portal.
    bodyObserver.observe(document.body, { childList: true });
    attachToCurrentStage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
