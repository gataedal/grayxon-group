const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const jwt = fs.readFileSync(path.join(root, 'supabase/functions/generate-jitsi-jwt/index.ts'), 'utf8');
const end = fs.readFileSync(path.join(root, 'supabase/functions/end-live-training/index.ts'), 'utf8');

test('new LIVE trainings explicitly persist the signed-in creator as host', () => {
  assert.match(
    app,
    /from\(['"]live_trainings['"]\)\.insert\(\{title,description,scheduled_at:scheduled,created_by:session\.user\.id\}\)/
  );
});

test('Jitsi JWT grants owner only to the Grayxon admin or recorded training host', () => {
  assert.match(jwt, /const isAdmin = profile\.role === "admin";/);
  assert.match(jwt, /const isHost = training\.created_by === userId;/);
  assert.match(jwt, /const moderator = isAdmin \|\| isHost;/);
  assert.match(jwt, /affiliation: moderator \? "owner" : "member"/);
  assert.match(jwt, /if \(!allowed\) return response\(\{ error: "No tienes permiso para entrar a este entrenamiento\." \}, 403\);/);
});

test('invitation access does not change the JWT moderator decision', () => {
  const audienceCheck = jwt.indexOf('if (!allowed && profile.role === "creator")');
  const managerCheck = jwt.indexOf('if (!allowed && profile.role === "manager")');
  const roleDecision = jwt.indexOf('const moderator = isAdmin || isHost;');
  assert.ok(roleDecision >= 0 && audienceCheck > roleDecision && managerCheck > roleDecision);
});

test('end-for-all checks the server-authorized host/admin before persisting finished status', () => {
  assert.match(end, /const authorized = profile\.role === "admin" \|\| training\.created_by === userId;/);
  assert.match(end, /if \(!authorized\) return response\(/);
  assert.match(end, /if \(action === "authorize"\) return response\(\{ ok: true, authorized: true, action \}\);/);
  assert.match(end, /\.update\(\{ status: "finished", ended_at: endedAt \}\)/);
});

test('host camera pin retries after slow room setup and participant joins', () => {
  assert.match(app, /\[0,250,700,1400,2500,4000\]\.forEach\(delay=>setTimeout\(pinHost,delay\)\)/);
  assert.match(app, /addEventListener\?\.\('participantJoined'/);
  assert.match(app, /\[150,600,1300\]\.forEach\(delay=>setTimeout\(/);
});

test('ending a meeting authorizes on the server and never mass-kicks participants', () => {
  const endStart = app.indexOf('async function endLiveTrainingConference(');
  const endFinish = app.indexOf('\nconst grayxonRaisedHands', endStart);
  assert.ok(endStart >= 0 && endFinish > endStart);
  const endBlock = app.slice(endStart, endFinish);
  assert.ok(endBlock.indexOf("callEndTraining('authorize')") < endBlock.indexOf("api.executeCommand('endConference')"));
  assert.ok(endBlock.indexOf("api.executeCommand('endConference')") < endBlock.indexOf("await conferenceClosed"));
  assert.ok(endBlock.indexOf("await conferenceClosed") < endBlock.indexOf("callEndTraining('finalize')"));
  assert.match(endBlock, /addEventListener\('readyToClose'/);
  assert.match(endBlock, /Jitsi no confirmó el cierre de la sala/);
  assert.doesNotMatch(endBlock, /kickParticipant|executeCommand\(['"]kick/);
  assert.match(endBlock, /callEndTraining\('finalize'\)/);
});
