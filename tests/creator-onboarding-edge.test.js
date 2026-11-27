const fs = require("node:fs");
const assert = require("node:assert/strict");

const read = (path) => fs.readFileSync(path, "utf8");
const createCreator = read("supabase/functions/create-creator/index.ts");
const bulkImport = read("supabase/functions/bulk-import-creators/index.ts");
const liveKit = read("supabase/functions/generate-livekit-token/index.ts");
const onboarding = read("creator-onboarding.js");
const portal = read("portal.html");
const app = read("app.js");

assert.match(createCreator, /role:\s*'creator'[\s\S]*?onboarding_required:\s*true/);
assert.match(bulkImport, /onboarding_required:\s*true/);
assert.match(liveKit, /onboarding_required,\s*onboarding_completed_at/);
assert.match(liveKit, /profile\.role\s*===\s*"creator"[\s\S]*?profile\.onboarding_required\s*===\s*true[\s\S]*?onboarding_completed_at/);
assert.match(onboarding, /Ya%20complete%20mis%20primeros%20pasos/);
assert.match(onboarding, /options\?\.fromVideo/);
assert.match(onboarding, /creatorIsAdult\(data\.birth_date\)/);
assert.match(app, /video\.addEventListener\('ended'/);
assert.match(portal, /creator-onboarding\.js\?v=5/);

console.log("Creator onboarding edge and portal integration checks passed.");
