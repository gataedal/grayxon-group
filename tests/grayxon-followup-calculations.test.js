const {calculateEvaluation}=require('../grayxon-followup-calculations.js');
const assert=require('node:assert/strict');

const base={periodStart:'2026-11-01',periodEnd:'2026-11-07',coverageStart:'2026-11-01',coverageEnd:'2026-11-07',granularity:'daily',joinDate:'2026-11-01',monthlyLiveHours:90,monthlyValidDays:22,validLiveDays:5,liveSeconds:18*3600};
let r=calculateEvaluation(base);
assert.equal(r.status,'evaluated');
assert.equal(r.evaluableDays,7);
assert.ok(Math.abs(r.targetValidDays-(22*7/30))<0.00005);
assert.ok(Math.abs(r.targetLiveSeconds-(90*3600*7/30))<0.01);
assert.equal(r.classification,'on_track');

r=calculateEvaluation({...base,joinDate:'2026-11-05'});
assert.equal(r.evaluableDays,3);
assert.equal(r.classification,'early_review');

r=calculateEvaluation({...base,granularity:'period_aggregate',coverageStart:'2026-11-01',coverageEnd:'2026-11-23'});
assert.equal(r.status,'needs_daily_data');

r=calculateEvaluation({...base,validLiveDays:0,liveSeconds:0});
assert.equal(r.classification,'high_risk');
assert.equal(r.missingValidDays,22*7/30);

r=calculateEvaluation({...base,validLiveDays:null});
assert.equal(r.status,'not_evaluable');

r=calculateEvaluation({...base,periodStart:'2026-11-28',periodEnd:'2026-12-04',coverageStart:'2026-11-28',coverageEnd:'2026-12-04',joinDate:'2026-11-28'});
assert.equal(r.evaluableDays,7);
assert.ok(Math.abs(r.targetLiveSeconds-(90*3600*(3/30+4/31)))<1e-7);

assert.equal(require('../grayxon-followup-calculations.js').toBogotaISOString('2026-11-26T09:30'), '2026-11-26T14:30:00.000Z');
assert.equal(require('../grayxon-followup-calculations.js').toBogotaISOString('2026-02-30T09:30'), null);
assert.equal(require('../grayxon-followup-calculations.js').toBogotaISOString('2026-11-26T25:30'), null);


r=calculateEvaluation({...base,highRiskThresholdPct:70,observationThresholdPct:90,validLiveDays:5,liveSeconds:18*3600});
assert.equal(r.classification,'observation');
r=calculateEvaluation({...base,highRiskThresholdPct:70,observationThresholdPct:90,validLiveDays:3,liveSeconds:10*3600});
assert.equal(r.classification,'high_risk');

console.log('Seguimiento calculations: 6 assertion groups plus Colombia timezone checks passed.');
