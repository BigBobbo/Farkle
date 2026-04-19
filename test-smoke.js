// Quick smoke test runnable with: node test-smoke.js
// Loads all browser scripts in dependency order.

global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = v; },
};
global.structuredClone = obj => JSON.parse(JSON.stringify(obj));

const fs = require('fs');
const path = require('path');
function load(f) { eval.call(global, fs.readFileSync(path.join(__dirname, f), 'utf8')); }

load('js/rules.js');
load('js/dice.js');
load('js/scoring.js');
load('js/strategy.js');
load('js/game.js');
load('js/solver.js');
load('js/simulate.js');

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; }
  else { fail++; console.log(`FAIL ${label}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`); }
}

// ─── Scoring ───
eq(scoreSelection([1,1,5]), 250, '1,1,5');
eq(scoreSelection([1]), 100, 'single 1');
eq(scoreSelection([5]), 50, 'single 5');
eq(scoreSelection([2]), null, 'lone 2 not scoring');
eq(scoreSelection([1,1,1]), 1000, 'three 1s');
eq(scoreSelection([2,2,2]), 200, 'three 2s');
eq(scoreSelection([6,6,6]), 600, 'three 6s');
eq(scoreSelection([6,6,6,6]), 1200, 'four 6s = 600*2');
eq(scoreSelection([6,6,6,6,6]), 2400, 'five 6s = 600*4');
eq(scoreSelection([6,6,6,6,6,6]), 4800, 'six 6s = 600*8');
eq(scoreSelection([1,1,1,1]), 2000, 'four 1s = 1000*2');
eq(scoreSelection([1,2,3,4,5,6]), 1500, 'straight');
eq(scoreSelection([2,2,3,3,4,4]), 1500, 'three pairs');
eq(scoreSelection([3,3,3,5,5,5]), 2500, 'two triplets max(2500, 800)');
eq(scoreSelection([4,4,4,4,2,2]), 1500, 'four+pair max(1500, 800)');
eq(scoreSelection([6,6,6,6,1]), 1300, 'four 6s + 1 (Perrotta example)');
eq(scoreSelection([2,3,4]), null, 'invalid selection');

// ─── Farkle detection ───
eq(isFarkle([2,3,4]), true, 'farkle 234');
eq(isFarkle([2,3,4,6]), true, 'farkle 2346');
eq(isFarkle([2,2]), true, 'two 2s alone');
eq(isFarkle([1]), false, 'one is not farkle');
eq(isFarkle([5]), false, 'five is not farkle');
eq(isFarkle([2,2,3,3,4,4]), false, 'three pairs is not farkle');

// ─── bestKeep ───
const bk1 = bestKeep([1,1,5,2,3,4]);
eq(bk1.score, 250, 'bestKeep [1,1,5,2,3,4] = 250');

const bk2 = bestKeep([6,6,6,6,1,2]);
eq(bk2.score, 1300, 'bestKeep four 6s + 1');

// ─── Game state ───
const g = createGame([{ name: 'A' }, { name: 'B' }]);
eq(g.players.length, 2, 'two players');
eq(g.current, 0, 'first player active');

// ─── Solver (small sanity) ───
console.log('Running solver…');
const t0 = Date.now();
const policy = computeOptimalPolicy(getRules());
console.log(`Solver: ${Date.now()-t0}ms, ${policy.iterations} iters`);
console.log('Thresholds:', policy.thresholds);
// Sanity: V[6][0] should be the well-known Farkle EV-of-first-roll, around ~520
console.log('V(turnScore=0, dice=6) =', policy.V[6][0].toFixed(1));
// Should be > 0 (some EV available)
if (policy.V[6][0] > 400 && policy.V[6][0] < 800) pass++;
else { fail++; console.log('FAIL: V(0,6) outside expected ~520 range'); }

// ─── Simulate ───
console.log('Running 5000-turn solo sim…');
const presets = loadStrategies();
const bank300 = presets.find(s => s.id === 'bank-300');
const r = simulateSolo(bank300, getRules(), 5000);
console.log('Bank-at-300:', r.avgScore.toFixed(1), 'farkle %', (r.farkleRate*100).toFixed(1));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
