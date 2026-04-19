// Exact EV solver via value iteration over (turnScore, diceLeft).
//
// V(s, d) = expected end-of-turn banked score from the decision point where you
//           have already locked in s points and would roll d dice next.
//
// V(s, d) = max( s,  E[outcome] over roll of d dice )
// E[outcome] = Σ P(outcome) × ( 0 if Farkle, else max over valid keep subsets of V(s+keep, d') )
// where d' = d - |keep|, or 6 if d' == 0 and hotDice is on.
//
// Turn scores are quantized to multiples of TS_STEP = 50 (the minimum scoring increment
// with default rules). Above TS_MAX banking is trivially optimal.

const TS_STEP = 50;

function _enumerateRollsForD(d, rules) {
  // Returns array of { weight, isFarkle, options: [{ score, diceUsed }] }
  // options = Pareto-optimal keep choices: for each possible #dice kept,
  // the max-scoring subset of that size.
  const grouped = new Map();
  const total = Math.pow(6, d);
  for (let i = 0; i < total; i++) {
    let n = i;
    const dice = new Array(d);
    for (let j = 0; j < d; j++) { dice[j] = 1 + (n % 6); n = Math.floor(n / 6); }
    const key = dice.slice().sort().join(',');
    if (!grouped.has(key)) {
      const options = _enumerateKeepOptions(dice, rules);
      grouped.set(key, { weight: 0, isFarkle: options.length === 0, options });
    }
    grouped.get(key).weight += 1 / total;
  }
  return Array.from(grouped.values());
}

function _enumerateKeepOptions(dice, rules) {
  const c = counts(dice);
  const bestForSize = {};
  const memo = new Map();
  const stack = [0,0,0,0,0,0];
  function recur(idx) {
    if (idx === 6) {
      const used = stack[0]+stack[1]+stack[2]+stack[3]+stack[4]+stack[5];
      if (used === 0) return;
      const cc = [0, stack[0], stack[1], stack[2], stack[3], stack[4], stack[5]];
      const s = _score(cc, rules, false, memo);
      if (s > 0 && (bestForSize[used] === undefined || s > bestForSize[used])) {
        bestForSize[used] = s;
      }
      return;
    }
    for (let k = 0; k <= c[idx + 1]; k++) {
      stack[idx] = k;
      recur(idx + 1);
    }
    stack[idx] = 0;
  }
  recur(0);
  return Object.entries(bestForSize).map(([used, score]) => ({ diceUsed: +used, score }));
}

function computeOptimalPolicy(rules = getRules()) {
  const TS_MAX = rules.targetScore + 2000;
  const NB = Math.floor(TS_MAX / TS_STEP) + 1;

  // V[d][i] for d in 1..6, i = ts/TS_STEP
  const V = [null];
  for (let d = 1; d <= 6; d++) {
    const row = new Float64Array(NB);
    for (let i = 0; i < NB; i++) row[i] = i * TS_STEP; // baseline = always bank
    V.push(row);
  }

  // Precompute roll outcomes per d.
  const rollOutcomes = [null];
  for (let d = 1; d <= 6; d++) rollOutcomes.push(_enumerateRollsForD(d, rules));

  function evOfRoll(d, ts) {
    let ev = 0;
    const outcomes = rollOutcomes[d];
    for (const o of outcomes) {
      if (o.isFarkle) continue; // contributes 0
      let bestVal = 0;
      for (const opt of o.options) {
        const newTs = Math.min(TS_MAX, ts + opt.score);
        let newD = d - opt.diceUsed;
        if (newD === 0) newD = rules.hotDice ? 6 : 0;
        let val;
        if (newD === 0) val = newTs; // turn ends, bank
        else val = V[newD][Math.round(newTs / TS_STEP)];
        if (val > bestVal) bestVal = val;
      }
      ev += o.weight * bestVal;
    }
    return ev;
  }

  // Value iteration
  let iter = 0;
  const MAX_ITERS = 200;
  while (iter < MAX_ITERS) {
    let maxDelta = 0;
    for (let d = 6; d >= 1; d--) {
      for (let i = NB - 1; i >= 0; i--) {
        const ts = i * TS_STEP;
        if (ts >= rules.targetScore) { V[d][i] = ts; continue; }
        const ev = evOfRoll(d, ts);
        const newV = Math.max(ts, ev);
        const delta = Math.abs(newV - V[d][i]);
        if (delta > maxDelta) maxDelta = delta;
        V[d][i] = newV;
      }
    }
    iter++;
    if (maxDelta < 0.01) break;
  }

  // Build threshold table: for each d, smallest ts at which "bank" beats "roll".
  const thresholds = {};
  const policy = {};
  for (let d = 1; d <= 6; d++) {
    policy[d] = [];
    let threshold = null;
    for (let i = 0; i < NB; i++) {
      const ts = i * TS_STEP;
      const ev = ts >= rules.targetScore ? ts : evOfRoll(d, ts);
      const action = ev > ts ? 'roll' : 'bank';
      policy[d].push({ ts, ev, action });
      if (threshold === null && action === 'bank' && ts > 0) threshold = ts;
    }
    thresholds[d] = threshold;
  }

  return { V, policy, thresholds, iterations: iter, tsStep: TS_STEP, tsMax: TS_MAX };
}

// Convert a solver result into a strategy that banks at the optimal threshold per dice count.
function strategyFromPolicy(policy) {
  const rules = [];
  for (let d = 1; d <= 6; d++) {
    const t = policy.thresholds[d];
    if (t == null) continue;
    rules.push({ conditions: [
      { var: 'diceLeft', op: '==', value: d },
      { var: 'turnScore', op: '>=', value: t },
    ]});
  }
  return { id: 'optimal-ev', name: 'Optimal (EV solver)', rules };
}
