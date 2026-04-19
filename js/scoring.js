// Scoring engine. All functions take a dice array (values 1-6) and the active rules.
//
// scoreSelection(dice)  → max score using ALL dice, or null if any die cannot be scored.
// maxScoreFromRoll(roll) → max score using any subset of the roll (≥ 0).
// isFarkle(roll)         → true iff no subset of the roll can score.
// bestKeep(roll)         → { dice, score, allUsed } picking the highest-EV scoring keep
//                          (defaults to "keep everything that scores").

function _countsKey(c) { return c[1]+','+c[2]+','+c[3]+','+c[4]+','+c[5]+','+c[6]; }

function _specialWholeSetScore(c, rules) {
  const total = c[1]+c[2]+c[3]+c[4]+c[5]+c[6];
  if (total !== 6) return -1;
  let best = -1;

  // Straight 1-2-3-4-5-6
  if (c[1]===1 && c[2]===1 && c[3]===1 && c[4]===1 && c[5]===1 && c[6]===1) {
    best = Math.max(best, rules.straight);
  }
  // Three pairs
  let pairs = 0, valid = true;
  for (let f = 1; f <= 6; f++) {
    if (c[f] === 2) pairs++;
    else if (c[f] !== 0) { valid = false; break; }
  }
  if (valid && pairs === 3) best = Math.max(best, rules.threePairs);
  // Four-of-a-kind + pair
  let four = 0, pair = 0; valid = true;
  for (let f = 1; f <= 6; f++) {
    if (c[f] === 4) four++;
    else if (c[f] === 2) pair++;
    else if (c[f] !== 0) { valid = false; break; }
  }
  if (valid && four === 1 && pair === 1) best = Math.max(best, rules.fourPlusPair);
  return best;
}

function _nOfAKindScore(face, n, rules) {
  const base = rules.threeOfAKind[face] || 0;
  if (n === 3) return base;
  if (n === 4) return base * (rules.fourOfAKindMult ?? 2);
  if (n === 5) return base * (rules.fiveOfAKindMult ?? 4);
  if (n === 6) return base * (rules.sixOfAKindMult ?? 8);
  return 0;
}

// Recursive scorer. allowLeftover=false → must use every die (return -1 if impossible).
// allowLeftover=true → may stop early (return ≥ 0).
function _score(c, rules, allowLeftover, memo) {
  const key = _countsKey(c) + (allowLeftover ? 'L' : 'A');
  if (memo.has(key)) return memo.get(key);

  const total = c[1]+c[2]+c[3]+c[4]+c[5]+c[6];
  if (total === 0) { memo.set(key, 0); return 0; }

  let best = allowLeftover ? 0 : -1;

  // Special whole-set patterns (six dice only)
  const special = _specialWholeSetScore(c, rules);
  if (special >= 0) best = Math.max(best, special);

  // Peel off n-of-a-kind for each face (largest first lets memoization help, but order doesn't change correctness)
  for (let f = 1; f <= 6; f++) {
    for (let n = Math.min(6, c[f]); n >= 3; n--) {
      const v = _nOfAKindScore(f, n, rules);
      if (v <= 0) continue;
      const next = c.slice(); next[f] -= n;
      const sub = _score(next, rules, allowLeftover, memo);
      if (sub >= 0) best = Math.max(best, v + sub);
    }
  }
  // Singles (1 and 5 by default)
  for (const f of [1, 5]) {
    const v = rules.singles[f] || 0;
    if (v > 0 && c[f] > 0) {
      const next = c.slice(); next[f] -= 1;
      const sub = _score(next, rules, allowLeftover, memo);
      if (sub >= 0) best = Math.max(best, v + sub);
    }
  }

  memo.set(key, best);
  return best;
}

function scoreSelection(dice, rules = getRules()) {
  if (!dice || dice.length === 0) return null;
  const c = counts(dice);
  const s = _score(c, rules, false, new Map());
  return s < 0 ? null : s;
}

function maxScoreFromRoll(roll, rules = getRules()) {
  if (!roll || roll.length === 0) return 0;
  const c = counts(roll);
  return _score(c, rules, true, new Map());
}

function isFarkle(roll, rules = getRules()) {
  return maxScoreFromRoll(roll, rules) === 0;
}

// Find the maximum-scoring "use everything" subset of a roll.
// Returns { dice, score } where dice is the chosen subset.
// Used by greedy strategies — keep all the points you can.
function bestKeep(roll, rules = getRules()) {
  // Enumerate all subsets via counts. For 6 dice, max 7^6 ≈ 117k but counts dedup → <<.
  const c = counts(roll);
  let best = { dice: [], score: 0 };
  // Generate all sub-counts
  const dims = [c[1], c[2], c[3], c[4], c[5], c[6]];
  const memo = new Map();
  function recur(idx, current) {
    if (idx === 6) {
      const total = current.reduce((a, b) => a + b, 0);
      if (total === 0) return;
      const cc = [0, ...current];
      const s = _score(cc, rules, false, memo);
      if (s > best.score) {
        const dice = [];
        for (let f = 1; f <= 6; f++) for (let i = 0; i < current[f-1]; i++) dice.push(f);
        best = { dice, score: s };
      }
      return;
    }
    for (let k = 0; k <= dims[idx]; k++) {
      current[idx] = k;
      recur(idx + 1, current);
    }
    current[idx] = 0;
  }
  recur(0, [0,0,0,0,0,0]);
  return best;
}
