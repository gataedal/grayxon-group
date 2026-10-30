(function () {
  'use strict';
  if (window.__gxLiveKitLocalShareOverlayInstalled) return;
  window.__gxLiveKitLocalShareOverlayInstalled = true;

  function syncLocalShareOverlay() {
    var stage = document.getElementById('grayxonLiveKitStage');
    if (!stage) return;
    var localTile = stage.querySelector('[data-gx-livekit-tile="gx-livekit-local"]');
    var shareTiles = Array.from(stage.querySelectorAll('[data-gx-livekit-tile][data-gx-livekit-screen-share="true"]'));
    var localIdentity = String(localTile && localTile.dataset.gxLivekitIdentity || '');
    var localCameraVisible = !!(
      localTile &&
      localTile.dataset.gxLivekitCameraEnabled === 'true' &&
      localTile.querySelector('video')
    );
    var ownShareActive = !!(
      localIdentity &&
      localCameraVisible &&
      shareTiles.some(function (tile) {
        return String(tile.dataset.gxLivekitIdentity || '') === localIdentity;
      })
    );
    if (ownShareActive) stage.setAttribute('data-gx-local-share-active', 'true');
    else stage.removeAttribute('data-gx-local-share-active');
  }

  var observer = null;
  function start() {
    var stage = document.getElementById('grayxonLiveKitStage');
    if (!stage || observer) return;
    observer = new MutationObserver(function () {
      syncLocalShareOverlay();
    });
    observer.observe(stage, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'data-gx-livekit-identity',
        'data-gx-livekit-screen-share',
        'data-gx-livekit-camera-enabled',
        'data-gx-livekit-tile'
      ]
    });
    syncLocalShareOverlay();
  }

  function locateStage() {
    start();
    if (!observer && document.body) {
      var bodyObserver = new MutationObserver(start);
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', locateStage, { once: true });
  } else {
    locateStage();
  }
})();
