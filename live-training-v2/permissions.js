/**
 * Grayxon LIVE Training v2 — role contract.
 *
 * This file is intentionally isolated from app.js and production wiring while
 * the rebuilt module is developed. It contains no database/Jitsi side effects.
 *
 * IMPORTANT: this is a UI/domain policy helper, not a security boundary.
 * The same decisions must be enforced by the JWT Edge Function and the
 * server-side operation that ends a training before this module is enabled.
 */
(function attachGrayxonLiveTrainingPolicy(root) {
  'use strict';

  function resolveCapabilities({ userId, globalRole, training }) {
    const authenticated = typeof userId === 'string' && userId.length > 0;
    const creatorId = training && typeof training.created_by === 'string'
      ? training.created_by
      : null;
    const isAdmin = authenticated && globalRole === 'admin';
    const isHost = authenticated && !!creatorId && userId === creatorId;
    const isAllowed = !!(authenticated && training && training.id);

    return Object.freeze({
      canEnter: isAllowed,
      isAdmin,
      isHost,
      // The meeting creator and Grayxon admins may moderate. Everyone else
      // remains a participant unless a future explicit server-verified grant
      // is added to the contract.
      canModerate: isAllowed && (isAdmin || isHost),
      canEndForAll: isAllowed && (isAdmin || isHost),
      canPromoteParticipants: isAllowed && (isAdmin || isHost),
      shouldPinHost: !!creatorId,
      hostUserId: creatorId
    });
  }

  function canPerformAction(capabilities, action) {
    if (!capabilities || !capabilities.canEnter) return false;
    switch (action) {
      case 'leave':
        return true;
      case 'moderate':
      case 'promote':
      case 'end-for-all':
        return !!(
          action === 'end-for-all'
            ? capabilities.canEndForAll
            : action === 'promote'
              ? capabilities.canPromoteParticipants
              : capabilities.canModerate
        );
      default:
        return false;
    }
  }

  const api = Object.freeze({ resolveCapabilities, canPerformAction });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GrayxonLiveTrainingV2Policy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
