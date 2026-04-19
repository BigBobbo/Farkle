// Game state machine. Pure logic — no DOM. UI calls these and re-renders.

function createGame(playerConfigs, rules = getRules()) {
  // playerConfigs: [{ name, ai? (strategy id or null) }]
  return {
    rules,
    players: playerConfigs.map(p => ({
      name: p.name,
      ai: p.ai || null,
      score: 0,
      onBoard: rules.minOpeningScore === 0,
    })),
    current: 0,
    turn: newTurn(),
    log: [],
    winner: null,
  };
}

function newTurn() {
  return {
    diceRemaining: 6,         // dice eligible to roll
    currentRoll: null,        // last rolled dice (array)
    selected: [],             // indices of currentRoll set aside this roll
    bankedThisTurn: 0,        // points locked in via prior keeps this turn
    rollNumber: 0,
    farkled: false,
    awaitingDecision: false,  // true after a successful roll, false after select+roll/bank
  };
}

// Roll the next set of dice. Locks in any selected dice from previous roll.
function rollTurn(game) {
  const t = game.turn;
  if (t.farkled) return;

  // Lock in selected dice from previous roll if any
  if (t.currentRoll && t.selected.length > 0) {
    const selectedDice = t.selected.map(i => t.currentRoll[i]);
    const s = scoreSelection(selectedDice, game.rules);
    if (s == null) return; // invalid; UI prevents this
    t.bankedThisTurn += s;
    t.diceRemaining -= selectedDice.length;
    if (t.diceRemaining === 0) {
      // Hot dice
      if (game.rules.hotDice) {
        t.diceRemaining = 6;
      } else {
        // No hot-dice rule: must bank
        bankTurn(game);
        return;
      }
    }
  }

  // Roll
  t.currentRoll = rollDice(t.diceRemaining);
  t.selected = [];
  t.rollNumber++;
  t.awaitingDecision = true;

  // Farkle check
  if (isFarkle(t.currentRoll, game.rules)) {
    t.farkled = true;
    t.awaitingDecision = false;
    game.log.push({
      kind: 'farkle',
      player: game.players[game.current].name,
      roll: t.currentRoll.slice(),
      lostPoints: t.bankedThisTurn,
    });
    endTurn(game);
  }
}

// Bank current turn. Locks in selected dice first.
function bankTurn(game) {
  const t = game.turn;
  if (t.farkled) return;
  // Lock in current selection
  if (t.currentRoll && t.selected.length > 0) {
    const selectedDice = t.selected.map(i => t.currentRoll[i]);
    const s = scoreSelection(selectedDice, game.rules);
    if (s == null) return;
    t.bankedThisTurn += s;
  }
  if (t.bankedThisTurn === 0) return;

  const player = game.players[game.current];
  const rules = game.rules;

  // Opening requirement: must score >= minOpeningScore in a single turn to "open"
  if (!player.onBoard && t.bankedThisTurn < rules.minOpeningScore) {
    game.log.push({
      kind: 'no-open',
      player: player.name,
      points: t.bankedThisTurn,
      need: rules.minOpeningScore,
    });
    endTurn(game);
    return;
  }

  player.score += t.bankedThisTurn;
  if (player.score >= rules.minOpeningScore) player.onBoard = true;

  game.log.push({
    kind: 'bank',
    player: player.name,
    points: t.bankedThisTurn,
    total: player.score,
  });

  // Win check
  if (player.score >= rules.targetScore) {
    game.winner = player;
    return;
  }
  endTurn(game);
}

function endTurn(game) {
  game.current = (game.current + 1) % game.players.length;
  game.turn = newTurn();
}

// AI step: ask the strategy for a decision and execute one move.
// Returns true if the AI made a move (caller can re-trigger to continue), false if turn over.
function aiStep(game, strategiesById) {
  const player = game.players[game.current];
  if (!player.ai) return false;
  const strategy = strategiesById[player.ai];
  if (!strategy) return false;
  const t = game.turn;

  // If we have nothing rolled yet (start of turn), roll.
  if (!t.currentRoll || t.farkled) {
    if (t.farkled) return false;
    rollTurn(game);
    return true;
  }

  // We have a roll and (for AI) no selection yet. Decide what to keep.
  if (t.awaitingDecision) {
    // Greedy: keep all scoring dice (the bestKeep subset).
    const keep = bestKeep(t.currentRoll, game.rules);
    if (keep.score === 0) return false; // farkle handled by rollTurn already
    // Translate keep.dice (face values) into indices into currentRoll
    const indices = [];
    const remaining = t.currentRoll.slice();
    for (const face of keep.dice) {
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i] === face && !indices.includes(i)) {
          indices.push(i); break;
        }
      }
    }
    t.selected = indices;
    t.awaitingDecision = false;

    // Compute hypothetical state after this keep
    const newTurnScore = t.bankedThisTurn + keep.score;
    let newDiceRemaining = t.diceRemaining - keep.dice.length;
    if (newDiceRemaining === 0 && game.rules.hotDice) newDiceRemaining = 6;

    // Strategy decides: bank or roll?
    const ctx = {
      turnScore: newTurnScore,
      diceLeft: newDiceRemaining,
      myScore: player.score,
      maxOpponentScore: Math.max(0, ...game.players.filter(p => p !== player).map(p => p.score)),
      target: game.rules.targetScore,
      onBoard: player.onBoard,
      minOpen: game.rules.minOpeningScore,
    };
    const decision = decideStrategy(strategy, ctx);
    if (decision === 'bank' && newTurnScore >= (player.onBoard ? 0 : game.rules.minOpeningScore)) {
      bankTurn(game);
    } else {
      rollTurn(game);
    }
    return true;
  }

  return false;
}
