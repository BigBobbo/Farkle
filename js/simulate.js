// Monte Carlo simulator. Three modes:
//   solo     — one strategy, many turns; stats on points-per-turn (Farkle frequency, etc.)
//   race     — one strategy plays alone until reaching target; stats on turns-to-win
//   head2head — strategy A vs strategy B (and others); win rate
//
// Game logic mirrors aiStep in game.js but is inlined for speed (no DOM updates, no logging).

function simulateTurn(strategy, rules) {
  // Returns { score, farkled, rolls, hotDiceCount }
  let turnScore = 0;
  let diceLeft = 6;
  let rolls = 0;
  let hotDiceCount = 0;

  while (true) {
    // Roll
    const roll = rollDice(diceLeft);
    rolls++;
    if (isFarkle(roll, rules)) {
      return { score: 0, farkled: true, rolls, hotDiceCount };
    }
    // Greedy keep
    const keep = bestKeep(roll, rules);
    if (keep.score === 0) {
      return { score: 0, farkled: true, rolls, hotDiceCount };
    }
    turnScore += keep.score;
    diceLeft -= keep.dice.length;
    if (diceLeft === 0) {
      if (rules.hotDice) { diceLeft = 6; hotDiceCount++; }
      else return { score: turnScore, farkled: false, rolls, hotDiceCount };
    }

    // Decision
    const decision = decideStrategy(strategy, {
      turnScore, diceLeft,
      myScore: 0, maxOpponentScore: 0,
      target: rules.targetScore, onBoard: true, minOpen: 0,
    });
    if (decision === 'bank') {
      return { score: turnScore, farkled: false, rolls, hotDiceCount };
    }
  }
}

function simulateSolo(strategy, rules, nTurns) {
  let totalScore = 0;
  let totalFarkles = 0;
  let totalRolls = 0;
  let totalHot = 0;
  const scoreBuckets = new Array(20).fill(0); // 0, 1-100, 101-200, ...
  for (let i = 0; i < nTurns; i++) {
    const r = simulateTurn(strategy, rules);
    totalScore += r.score;
    if (r.farkled) totalFarkles++;
    totalRolls += r.rolls;
    totalHot += r.hotDiceCount;
    const bucket = Math.min(scoreBuckets.length - 1, Math.floor(r.score / 250));
    scoreBuckets[bucket]++;
  }
  return {
    avgScore: totalScore / nTurns,
    farkleRate: totalFarkles / nTurns,
    avgRolls: totalRolls / nTurns,
    hotDicePerTurn: totalHot / nTurns,
    scoreBuckets,
  };
}

function simulateRaceSolo(strategy, rules) {
  // Single player races to target; returns # turns.
  let score = 0;
  let onBoard = rules.minOpeningScore === 0;
  let turns = 0;
  while (score < rules.targetScore) {
    turns++;
    const t = simulateTurnContext(strategy, rules, score, 0);
    if (!onBoard && t.score < rules.minOpeningScore) continue; // didn't open
    score += t.score;
    if (score >= rules.minOpeningScore) onBoard = true;
    if (turns > 1000) break; // safety
  }
  return turns;
}

// Like simulateTurn but with full context for the strategy.
function simulateTurnContext(strategy, rules, myScore, maxOpponentScore) {
  let turnScore = 0;
  let diceLeft = 6;
  let rolls = 0;
  while (true) {
    const roll = rollDice(diceLeft);
    rolls++;
    if (isFarkle(roll, rules)) return { score: 0, farkled: true, rolls };
    const keep = bestKeep(roll, rules);
    turnScore += keep.score;
    diceLeft -= keep.dice.length;
    if (diceLeft === 0) { if (rules.hotDice) diceLeft = 6; else return { score: turnScore, farkled: false, rolls }; }
    const decision = decideStrategy(strategy, {
      turnScore, diceLeft, myScore, maxOpponentScore,
      target: rules.targetScore, onBoard: myScore >= rules.minOpeningScore, minOpen: rules.minOpeningScore,
    });
    if (decision === 'bank') return { score: turnScore, farkled: false, rolls };
  }
}

function simulateRace(strategies, rules, nGames) {
  // Each strategy plays nGames against the others (round-robin within one game).
  // For 1 strategy: solo, returns avg turns to win.
  // For 2+: each game, players take turns; first to target wins.
  if (strategies.length === 1) {
    let totalTurns = 0;
    for (let g = 0; g < nGames; g++) totalTurns += simulateRaceSolo(strategies[0], rules);
    return [{ name: strategies[0].name, avgTurns: totalTurns / nGames }];
  }
  // Head-to-head
  const wins = strategies.map(() => 0);
  const turnsToWin = strategies.map(() => 0);
  for (let g = 0; g < nGames; g++) {
    const scores = strategies.map(() => 0);
    const onBoard = strategies.map(() => rules.minOpeningScore === 0);
    let winner = -1;
    let totalTurns = 0;
    outer: while (winner === -1) {
      for (let p = 0; p < strategies.length; p++) {
        const maxOpp = Math.max(0, ...scores.filter((_, i) => i !== p));
        const t = simulateTurnContext(strategies[p], rules, scores[p], maxOpp);
        if (!onBoard[p] && t.score < rules.minOpeningScore) {
          // didn't open
        } else {
          scores[p] += t.score;
          if (scores[p] >= rules.minOpeningScore) onBoard[p] = true;
          if (scores[p] >= rules.targetScore) { winner = p; totalTurns++; break outer; }
        }
        totalTurns++;
        if (totalTurns > 10000) { winner = -2; break outer; }
      }
    }
    if (winner >= 0) {
      wins[winner]++;
      turnsToWin[winner] += Math.ceil(totalTurns / strategies.length);
    }
  }
  return strategies.map((s, i) => ({
    name: s.name,
    wins: wins[i],
    winRate: wins[i] / nGames,
    avgTurnsWhenWinning: wins[i] > 0 ? turnsToWin[i] / wins[i] : null,
  }));
}
