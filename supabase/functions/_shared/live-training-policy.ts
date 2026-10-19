export type GrayxonLiveRole = "admin" | "manager" | "creator" | string;

export type LiveTrainingCapabilities = Readonly<{
  isAdmin: boolean;
  isHost: boolean;
  canModerate: boolean;
  canStart: boolean;
  canEndForAll: boolean;
}>;

/**
 * The only source of moderator authority is the authenticated profile role or
 * the session's persisted created_by field. Audience/team membership grants
 * entry only; it never grants host or moderator capabilities.
 */
export function resolveLiveTrainingCapabilities(
  userId: string | null | undefined,
  profileRole: GrayxonLiveRole | null | undefined,
  profileActive: boolean,
  trainingCreatedBy: string | null | undefined,
): LiveTrainingCapabilities {
  const authenticatedActiveUser = typeof userId === "string" && userId.length > 0 && profileActive;
  const isAdmin = authenticatedActiveUser && profileRole === "admin";
  const isHost = authenticatedActiveUser && typeof trainingCreatedBy === "string" &&
    trainingCreatedBy.length > 0 && userId === trainingCreatedBy;
  const canModerate = Boolean(isAdmin || isHost);
  return Object.freeze({
    isAdmin: Boolean(isAdmin),
    isHost: Boolean(isHost),
    canModerate,
    canStart: canModerate,
    canEndForAll: canModerate,
  });
}
