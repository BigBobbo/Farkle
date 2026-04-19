// UI layer. Renders all four tabs and wires events.

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

let game = null;
let strategies = loadStrategies();
let lastPolicy = null;

// ─── Tabs ────────────────────────────────────────────────────────────────
$$('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tab').forEach(b => b.classList.toggle('active', b === btn));
    const id = btn.dataset.tab;
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + id));
  });
});

// ─── Dice rendering ──────────────────────────────────────────────────────
function renderDie(face, opts = {}) {
  const div = document.createElement('div');
  div.className = 'die';
  div.dataset.face = face;
  if (opts.selected) div.classList.add('selected');
  if (opts.locked) div.classList.add('locked');
  if (opts.farkle) div.classList.add('farkle');
  for (let i = 0; i < face; i++) {
    const pip = document.createElement('div');
    pip.className = 'pip';
    div.appendChild(pip);
  }
  return div;
}

// ─── Play tab ────────────────────────────────────────────────────────────
function renderPlayerSetup() {
  const n = parseInt($('#num-players').value);
  const list = $('#player-list');
  list.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `
      <span>Player ${i + 1}:</span>
      <input type="text" data-pname="${i}" value="${i === 0 ? 'You' : 'CPU ' + i}">
      <select data-pai="${i}">
        <option value="">Human</option>
        ${strategies.map(s => `<option value="${s.id}">AI: ${s.name}</option>`).join('')}
      </select>
    `;
    list.appendChild(row);
  }
}
$('#num-players').addEventListener('input', renderPlayerSetup);

$('#start-game').addEventListener('click', () => {
  const n = parseInt($('#num-players').value);
  const configs = [];
  for (let i = 0; i < n; i++) {
    const name = $(`input[data-pname="${i}"]`).value || `Player ${i+1}`;
    const ai = $(`select[data-pai="${i}"]`).value || null;
    configs.push({ name, ai });
  }
  game = createGame(configs, getRules());
  $('#play-setup').classList.add('hidden');
  $('#play-board').classList.remove('hidden');
  renderGame();
  maybeRunAI();
});

$('#btn-new-game').addEventListener('click', () => {
  game = null;
  $('#play-setup').classList.remove('hidden');
  $('#play-board').classList.add('hidden');
});

function renderGame() {
  // Scoreboard
  const sb = $('#scoreboard');
  sb.innerHTML = '';
  game.players.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'score-card' + (i === game.current ? ' active' : '');
    card.innerHTML = `
      <div class="name">${p.name}${p.onBoard ? '' : ' (not on board)'}</div>
      <div class="score">${p.score}</div>
      ${p.ai ? `<div class="ai-tag">AI: ${strategies.find(s => s.id === p.ai)?.name || '?'}</div>` : ''}
    `;
    sb.appendChild(card);
  });

  if (game.winner) {
    $('#turn-label').textContent = `🏆 ${game.winner.name} wins!`;
    $('#dice-tray').innerHTML = '';
    $('#turn-info').classList.add('hidden');
    $('#btn-roll').disabled = true;
    $('#btn-bank').disabled = true;
    renderLog();
    return;
  }

  $('#turn-info').classList.remove('hidden');
  const player = game.players[game.current];
  $('#turn-label').textContent = `${player.name}'s turn${player.ai ? ' (AI)' : ''}`;

  // Dice tray
  const t = game.turn;
  const tray = $('#dice-tray');
  tray.innerHTML = '';
  if (t.currentRoll) {
    t.currentRoll.forEach((face, idx) => {
      const die = renderDie(face, {
        selected: t.selected.includes(idx),
        farkle: t.farkled,
      });
      if (!t.farkled && !player.ai) {
        die.addEventListener('click', () => toggleSelect(idx));
      }
      tray.appendChild(die);
    });
  } else {
    for (let i = 0; i < t.diceRemaining; i++) {
      const ph = document.createElement('div');
      ph.className = 'die locked';
      ph.style.background = 'var(--panel-2)';
      ph.style.border = '2px dashed var(--border)';
      tray.appendChild(ph);
    }
  }

  // Selected score
  let selScore = 0;
  let selValid = true;
  if (t.selected.length > 0) {
    const sel = t.selected.map(i => t.currentRoll[i]);
    const s = scoreSelection(sel, game.rules);
    if (s == null) { selValid = false; selScore = 0; }
    else selScore = s;
  }
  $('#turn-score').textContent = t.bankedThisTurn;
  $('#selected-score').textContent = selValid ? selScore : 'invalid';
  const diceAfter = t.diceRemaining - t.selected.length;
  const nextDice = diceAfter === 0 && game.rules.hotDice ? 6 : diceAfter;
  $('#dice-to-roll').textContent = nextDice;

  // Buttons
  const isAI = !!player.ai;
  $('#btn-roll').disabled = isAI || (t.currentRoll && (t.selected.length === 0 || !selValid)) || t.farkled;
  $('#btn-bank').disabled = isAI || t.farkled || (t.bankedThisTurn + selScore === 0) || !selValid;

  // Initial state of turn (no roll yet): allow Roll
  if (!t.currentRoll) $('#btn-roll').disabled = isAI;

  // Message
  const msg = $('#turn-message');
  msg.className = '';
  msg.textContent = '';
  if (t.farkled) {
    msg.textContent = `Farkle! Lost ${t.bankedThisTurn} turn-points.`;
    msg.className = 'bad';
  } else if (t.currentRoll && t.selected.length === 0) {
    msg.textContent = 'Click dice to keep, then Roll or Bank.';
    msg.className = 'warn';
  } else if (!selValid) {
    msg.textContent = 'Selected dice include a non-scoring die.';
    msg.className = 'bad';
  }

  renderLog();
}

function renderLog() {
  const log = $('#turn-log');
  log.innerHTML = game.log.slice(-30).map(e => {
    if (e.kind === 'farkle')
      return `<div class="log-entry farkle">${e.player} FARKLED on [${e.roll.join(',')}], lost ${e.lostPoints}</div>`;
    if (e.kind === 'bank')
      return `<div class="log-entry bank">${e.player} banked ${e.points} → total ${e.total}</div>`;
    if (e.kind === 'no-open')
      return `<div class="log-entry farkle">${e.player} scored ${e.points} but needs ${e.need} to open</div>`;
    return '';
  }).reverse().join('');
}

function toggleSelect(idx) {
  const t = game.turn;
  if (t.farkled) return;
  const i = t.selected.indexOf(idx);
  if (i >= 0) t.selected.splice(i, 1);
  else t.selected.push(idx);
  renderGame();
}

$('#btn-roll').addEventListener('click', () => {
  rollTurn(game);
  renderGame();
  maybeRunAI();
});

$('#btn-bank').addEventListener('click', () => {
  bankTurn(game);
  renderGame();
  maybeRunAI();
});

// AI auto-play loop. Pauses ~400ms between actions for visibility.
function maybeRunAI() {
  if (!game || game.winner) return;
  const player = game.players[game.current];
  if (!player.ai) return;
  setTimeout(() => {
    const stratMap = Object.fromEntries(strategies.map(s => [s.id, s]));
    const moved = aiStep(game, stratMap);
    renderGame();
    if (moved) maybeRunAI();
  }, 500);
}

// ─── Settings tab ────────────────────────────────────────────────────────
function renderSettings() {
  const r = getRules();
  const form = $('#settings-form');
  const numField = (label, value, key) =>
    `<label>${label}<input type="number" data-key="${key}" value="${value}"></label>`;
  form.innerHTML = `
    <h3>Single dice</h3>
    <div class="scoring-grid">
      ${numField('Single 1', r.singles[1], 'singles.1')}
      ${numField('Single 5', r.singles[5], 'singles.5')}
    </div>
    <h3>Three of a kind</h3>
    <div class="scoring-grid">
      ${[1,2,3,4,5,6].map(f => numField(`Three ${f}s`, r.threeOfAKind[f], `threeOfAKind.${f}`)).join('')}
    </div>
    <h3>Four / five / six of a kind multiplier (× three-of-a-kind value)</h3>
    <div class="scoring-grid">
      ${numField('Four of a kind ×', r.fourOfAKindMult, 'fourOfAKindMult')}
      ${numField('Five of a kind ×', r.fiveOfAKindMult, 'fiveOfAKindMult')}
      ${numField('Six of a kind ×', r.sixOfAKindMult, 'sixOfAKindMult')}
    </div>
    <h3>Special combinations</h3>
    <div class="scoring-grid">
      ${numField('Straight (1-2-3-4-5-6)', r.straight, 'straight')}
      ${numField('Three pairs', r.threePairs, 'threePairs')}
      ${numField('Four of a kind + pair', r.fourPlusPair, 'fourPlusPair')}
    </div>
    <h3>Game</h3>
    <div class="scoring-grid">
      ${numField('Target score', r.targetScore, 'targetScore')}
      ${numField('Min opening score', r.minOpeningScore, 'minOpeningScore')}
    </div>
    <label style="flex-direction:row; gap:8px; margin-top:8px;">
      <input type="checkbox" id="rule-hotdice" ${r.hotDice ? 'checked' : ''}>
      <span>Hot dice (re-roll all 6 when every die scores)</span>
    </label>
  `;
}

$('#settings-save').addEventListener('click', () => {
  const r = structuredClone(getRules());
  $$('#settings-form input[type=number]').forEach(inp => {
    const v = parseInt(inp.value) || 0;
    const path = inp.dataset.key.split('.');
    let obj = r;
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    obj[path[path.length - 1]] = v;
  });
  r.hotDice = $('#rule-hotdice').checked;
  setRules(r);
  flash('Settings saved.');
});

$('#settings-reset').addEventListener('click', () => {
  if (!confirm('Reset all rules to defaults?')) return;
  setRules(structuredClone(DEFAULT_RULES));
  renderSettings();
});

function flash(msg) {
  const m = document.createElement('div');
  m.textContent = msg;
  m.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--accent-2);color:white;padding:8px 16px;border-radius:6px;z-index:99';
  document.body.appendChild(m);
  setTimeout(() => m.remove(), 1500);
}

// ─── Simulate tab ────────────────────────────────────────────────────────
function renderStrategies() {
  const list = $('#strategy-list');
  list.innerHTML = '';
  strategies.forEach((strat, sIdx) => {
    const div = document.createElement('div');
    div.className = 'strategy';
    div.innerHTML = `
      <div class="strategy-header">
        <input type="text" value="${strat.name}" data-strat-name="${sIdx}">
        <button class="danger" data-strat-del="${sIdx}">Delete</button>
      </div>
      <div class="rule-row rule-header">
        <span>#</span><span>Variable</span><span>Op</span><span>Value</span><span>+ AND</span><span></span>
      </div>
      <div data-strat-rules="${sIdx}"></div>
      <button class="preset-btn" data-strat-addrule="${sIdx}">+ Bank-if rule</button>
      <div class="muted" style="margin-top:6px;font-size:12px;">Reads top to bottom — first matching rule banks. No match → roll.</div>
    `;
    list.appendChild(div);
    renderRules(sIdx);
  });
  // Wire events
  $$('input[data-strat-name]').forEach(inp =>
    inp.addEventListener('change', e => {
      strategies[+e.target.dataset.stratName].name = e.target.value;
      saveStrategies(strategies);
      renderSimStrategySelect();
      renderPlayerSetup();
    }));
  $$('button[data-strat-del]').forEach(btn =>
    btn.addEventListener('click', e => {
      strategies.splice(+e.target.dataset.stratDel, 1);
      saveStrategies(strategies);
      renderStrategies(); renderSimStrategySelect(); renderPlayerSetup();
    }));
  $$('button[data-strat-addrule]').forEach(btn =>
    btn.addEventListener('click', e => {
      const sIdx = +e.target.dataset.stratAddrule;
      strategies[sIdx].rules.push({ conditions: [{ var: 'turnScore', op: '>=', value: 300 }] });
      saveStrategies(strategies);
      renderRules(sIdx);
    }));
}

function renderRules(sIdx) {
  const container = document.querySelector(`[data-strat-rules="${sIdx}"]`);
  container.innerHTML = '';
  strategies[sIdx].rules.forEach((rule, rIdx) => {
    rule.conditions.forEach((cond, cIdx) => {
      const row = document.createElement('div');
      row.className = 'rule-row';
      row.innerHTML = `
        <span>${cIdx === 0 ? `Bank if` : 'AND'}${cIdx === 0 ? ` (rule ${rIdx + 1})` : ''}</span>
        <select data-c="${sIdx}.${rIdx}.${cIdx}.var">${CONDITION_VARS.map(v => `<option ${v===cond.var?'selected':''} value="${v}">${v}</option>`).join('')}</select>
        <select data-c="${sIdx}.${rIdx}.${cIdx}.op">${CONDITION_OPS.map(o => `<option ${o===cond.op?'selected':''} value="${o}">${o}</option>`).join('')}</select>
        <input type="number" data-c="${sIdx}.${rIdx}.${cIdx}.value" value="${cond.value}">
        <button data-addand="${sIdx}.${rIdx}">+AND</button>
        <button data-delcond="${sIdx}.${rIdx}.${cIdx}" class="danger">×</button>
      `;
      container.appendChild(row);
    });
  });
  // Wire
  container.querySelectorAll('[data-c]').forEach(el => {
    el.addEventListener('change', e => {
      const [s, r, c, field] = e.target.dataset.c.split('.');
      const cond = strategies[+s].rules[+r].conditions[+c];
      cond[field] = field === 'value' ? +e.target.value : e.target.value;
      saveStrategies(strategies);
    });
  });
  container.querySelectorAll('[data-addand]').forEach(btn => {
    btn.addEventListener('click', e => {
      const [s, r] = e.target.dataset.addand.split('.');
      strategies[+s].rules[+r].conditions.push({ var: 'diceLeft', op: '<=', value: 2 });
      saveStrategies(strategies);
      renderRules(+s);
    });
  });
  container.querySelectorAll('[data-delcond]').forEach(btn => {
    btn.addEventListener('click', e => {
      const [s, r, c] = e.target.dataset.delcond.split('.');
      const rule = strategies[+s].rules[+r];
      rule.conditions.splice(+c, 1);
      if (rule.conditions.length === 0) strategies[+s].rules.splice(+r, 1);
      saveStrategies(strategies);
      renderRules(+s);
    });
  });
}

$('#strategy-add').addEventListener('click', () => {
  strategies.push(newBlankStrategy());
  saveStrategies(strategies);
  renderStrategies();
  renderSimStrategySelect();
  renderPlayerSetup();
});

function renderSimStrategySelect() {
  const sel = $('#sim-strategies');
  sel.innerHTML = strategies.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

$('#sim-run').addEventListener('click', () => {
  const ids = Array.from($('#sim-strategies').selectedOptions).map(o => o.value);
  if (ids.length === 0) { flash('Select at least one strategy.'); return; }
  const chosen = ids.map(id => strategies.find(s => s.id === id)).filter(Boolean);
  const n = parseInt($('#sim-games').value) || 1000;
  const mode = $('#sim-mode').value;
  const out = $('#sim-results');
  out.innerHTML = '<p class="muted">Running…</p>';
  setTimeout(() => {
    let html;
    if (mode === 'solo') {
      const rows = chosen.map(s => ({ name: s.name, ...simulateSolo(s, getRules(), n) }));
      const maxAvg = Math.max(...rows.map(r => r.avgScore));
      html = `<table class="results-table"><thead><tr>
        <th>Strategy</th><th>Avg/turn</th><th>Farkle %</th><th>Avg rolls/turn</th><th>Hot dice/turn</th><th></th></tr></thead><tbody>`;
      rows.sort((a,b) => b.avgScore - a.avgScore).forEach(r => {
        html += `<tr><td>${r.name}</td>
          <td class="num">${r.avgScore.toFixed(1)}</td>
          <td class="num">${(r.farkleRate*100).toFixed(1)}%</td>
          <td class="num">${r.avgRolls.toFixed(2)}</td>
          <td class="num">${r.hotDicePerTurn.toFixed(3)}</td>
          <td><span class="bar" style="width:${r.avgScore/maxAvg*200}px"></span></td></tr>`;
      });
      html += '</tbody></table>';
      html += `<p class="muted" style="margin-top:8px;">${n.toLocaleString()} simulated turns per strategy. Solo mode ignores game-state context (myScore, opponent).</p>`;
    } else if (mode === 'race') {
      const rows = chosen.map(s => ({ name: s.name, ...simulateRace([s], getRules(), n)[0] }));
      rows.sort((a,b) => a.avgTurns - b.avgTurns);
      html = `<table class="results-table"><thead><tr><th>Strategy</th><th>Avg turns to ${getRules().targetScore}</th></tr></thead><tbody>`;
      rows.forEach(r => { html += `<tr><td>${r.name}</td><td class="num">${r.avgTurns.toFixed(2)}</td></tr>`; });
      html += '</tbody></table>';
    } else if (mode === 'head2head') {
      if (chosen.length < 2) { out.innerHTML = '<p class="bad">Head-to-head needs at least 2 strategies selected.</p>'; return; }
      const rows = simulateRace(chosen, getRules(), n);
      html = `<table class="results-table"><thead><tr><th>Strategy</th><th>Wins</th><th>Win rate</th><th>Avg turns to win</th></tr></thead><tbody>`;
      rows.sort((a,b) => b.winRate - a.winRate).forEach(r => {
        html += `<tr><td>${r.name}</td><td class="num">${r.wins}</td><td class="num">${(r.winRate*100).toFixed(1)}%</td><td class="num">${r.avgTurnsWhenWinning ? r.avgTurnsWhenWinning.toFixed(1) : '—'}</td></tr>`;
      });
      html += '</tbody></table>';
      html += `<p class="muted" style="margin-top:8px;">${n.toLocaleString()} games, ${chosen.length} players each.</p>`;
    }
    out.innerHTML = html;
  }, 50);
});

// ─── Solver tab ──────────────────────────────────────────────────────────
$('#solver-run').addEventListener('click', () => {
  const out = $('#solver-results');
  out.innerHTML = '<p class="muted">Solving…</p>';
  setTimeout(() => {
    const t0 = performance.now();
    lastPolicy = computeOptimalPolicy(getRules());
    const elapsed = performance.now() - t0;
    let html = `<p class="muted">Converged in ${lastPolicy.iterations} iterations (${elapsed.toFixed(0)} ms).</p>`;
    html += `<h3>Bank thresholds (lowest turn score at which banking beats rolling)</h3>`;
    html += `<table class="results-table"><thead><tr><th>Dice to roll</th><th>Threshold</th><th>EV at threshold-${TS_STEP}</th><th>EV at threshold</th></tr></thead><tbody>`;
    for (let d = 1; d <= 6; d++) {
      const t = lastPolicy.thresholds[d];
      const i = t == null ? lastPolicy.policy[d].length - 1 : Math.round(t / TS_STEP);
      const evBefore = i > 0 ? lastPolicy.policy[d][i - 1].ev : 0;
      const evAt = lastPolicy.policy[d][i]?.ev || 0;
      html += `<tr><td>${d}</td><td class="num">${t == null ? '—' : t}</td><td class="num">${evBefore.toFixed(0)}</td><td class="num">${evAt.toFixed(0)}</td></tr>`;
    }
    html += `</tbody></table>`;
    html += `<p class="muted" style="margin-top:12px;">Threshold means: with this many dice still to roll, bank when your turn score reaches this number; otherwise roll.</p>`;
    html += `<button id="add-optimal-strategy" class="primary" style="margin-top:8px;">+ Add as a strategy</button>`;
    html += `<h3 style="margin-top:20px;">EV-of-rolling, by turn score and dice</h3>`;
    html += `<p class="muted">Green = banking is at least as good as rolling. Read across to find your inflection point.</p>`;
    html += '<div class="policy-grid">';
    html += '<div class="header">Turn score \\ Dice</div>';
    for (let d = 1; d <= 6; d++) html += `<div class="header">${d}</div>`;
    const sample = [50, 100, 150, 200, 250, 300, 350, 400, 500, 600, 750, 1000, 1500, 2000];
    for (const ts of sample) {
      html += `<div>${ts}</div>`;
      for (let d = 1; d <= 6; d++) {
        const i = Math.round(ts / TS_STEP);
        const cell = lastPolicy.policy[d][i];
        if (!cell) { html += '<div></div>'; continue; }
        html += `<div class="${cell.action}">${cell.action} (${cell.ev.toFixed(0)})</div>`;
      }
    }
    html += '</div>';
    out.innerHTML = html;
    $('#add-optimal-strategy').addEventListener('click', () => {
      const opt = strategyFromPolicy(lastPolicy);
      // Replace if exists
      strategies = strategies.filter(s => s.id !== opt.id);
      strategies.push(opt);
      saveStrategies(strategies);
      renderStrategies();
      renderSimStrategySelect();
      renderPlayerSetup();
      flash('Added "Optimal (EV solver)" to strategies.');
    });
  }, 50);
});

// ─── Init ────────────────────────────────────────────────────────────────
renderPlayerSetup();
renderSettings();
renderStrategies();
renderSimStrategySelect();
