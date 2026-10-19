import {
  resolveLiveTrainingCapabilities,
} from "../functions/_shared/live-training-policy.ts";

Deno.test("admin can moderate and end a session they did not create", () => {
  const c = resolveLiveTrainingCapabilities("admin-id", "admin", true, "host-id");
  if (!c.isAdmin || c.isHost || !c.canModerate || !c.canStart || !c.canEndForAll) {
    throw new Error("Admin permissions are incorrect.");
  }
});

Deno.test("recorded host can moderate even when the host is a manager", () => {
  const c = resolveLiveTrainingCapabilities("manager-id", "manager", true, "manager-id");
  if (c.isAdmin || !c.isHost || !c.canModerate || !c.canEndForAll) {
    throw new Error("Host permissions are incorrect.");
  }
});

Deno.test("invited manager does not become moderator", () => {
  const c = resolveLiveTrainingCapabilities("manager-id", "manager", true, "other-host");
  if (c.isHost || c.canModerate || c.canStart || c.canEndForAll) {
    throw new Error("Audience membership must not grant moderation.");
  }
});

Deno.test("creator who is not the recorded host does not become moderator", () => {
  const c = resolveLiveTrainingCapabilities("creator-id", "creator", true, "host-id");
  if (c.canModerate || c.canStart || c.canEndForAll) {
    throw new Error("Non-host creator must not have moderation permissions.");
  }
});

Deno.test("inactive admin cannot moderate", () => {
  const c = resolveLiveTrainingCapabilities("admin-id", "admin", false, "host-id");
  if (c.canModerate || c.canStart || c.canEndForAll) {
    throw new Error("Inactive user must not have capabilities.");
  }
});

Deno.test("missing identity cannot moderate", () => {
  const c = resolveLiveTrainingCapabilities(null, "admin", true, "host-id");
  if (c.canModerate || c.canStart || c.canEndForAll) {
    throw new Error("Unauthenticated request must not have capabilities.");
  }
});

Deno.test("host match is exact and does not trust a client-supplied role", () => {
  const c = resolveLiveTrainingCapabilities("host-id", "creator", true, "host-id");
  if (!c.isHost || !c.canModerate) {
    throw new Error("Persisted host identity should grant host capabilities.");
  }
});

Deno.test("manager role alone does not grant moderator permissions", () => {
  const c = resolveLiveTrainingCapabilities("manager-id", "manager", true, null);
  if (c.canModerate) {
    throw new Error("Manager role alone must not grant moderator permissions.");
  }
});
