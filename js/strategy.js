// Strategy = ordered list of "bank if …" rules. Each rule is a list of conditions
// (AND-ed). The first rule whose conditions all match → bank. Otherwise → roll.
//
// Rule context (passed in by game/sim):
//   turnScore       — points already locked in this turn
//   diceLeft        — dice that would be rolled next
//   myScore         — banked score across the whole game
//   maxOpponentScore
//   target
//   onBoard         — true if player has met opening requirement
//   minOpen
//
// Each condition: { var: <name>, op: '>='|'<='|'=='|'>'|'<', value: number }

const STRATEGY_STORAGE_KEY = 'farkle.strategies.v1';

const CONDITION_VARS = ['turnScore', 'diceLeft', 'myScore', 'maxOpponentScore'];
const CONDITION_OPS = ['>=', '<=', '==', '>', '<'];

const PRESET_STRATEGIES = [
  {
    id: 'bank-300',
    name: 'Bank at 300',
    rules: [{ conditions: [{ var: 'turnScore', op: '>=', value: 300 }] }],
  },
  {
    id: 'bank-500',
    name: 'Bank at 500',
    rules: [{ conditions: [{ var: 'turnScore', op: '>=', value: 500 }] }],
  },
  {
    id: 'bank-1000',
    name: 'Bank at 1000',
    rules: [{ conditions: [{ var: 'turnScore', op: '>=', value: 1000 }] }],
  },
  {
    id: 'cautious-fewdice',
    name: 'Cautious (300, or 200 with ≤2 dice)',
    rules: [
      { conditions: [{ var: 'turnScore', op: '>=', value: 300 }] },
      { conditions: [
        { var: 'turnScore', op: '>=', value: 200 },
        { var: 'diceLeft', op: '<=', value: 2 },
      ]},
    ],
  },
  {
    id: 'press-when-behind',
    name: 'Press when behind (500 normally, 1000 if behind by 1500+)',
    rules: [
      { conditions: [
        { var: 'turnScore', op: '>=', value: 500 },
        { var: 'maxOpponentScore', op: '<', value: 99999 }, // always true, fall through
      ]},
      // Override: if behind by a lot, hold for 1000
      // (Use a single "bank if turnScore >= 1000" as the catchall.)
      { conditions: [{ var: 'turnScore', op: '>=', value: 1000 }] },
    ],
  },
];

function loadStrategies() {
  try {
    const raw = localStorage.getItem(STRATEGY_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return structuredClone(PRESET_STRATEGIES);
}

function saveStrategies(list) {
  localStorage.setItem(STRATEGY_STORAGE_KEY, JSON.stringify(list));
}

function evalCondition(cond, ctx) {
  const lhs = ctx[cond.var];
  if (lhs == null) return false;
  const rhs = Number(cond.value);
  switch (cond.op) {
    case '>=': return lhs >= rhs;
    case '<=': return lhs <= rhs;
    case '==': return lhs === rhs;
    case '>':  return lhs > rhs;
    case '<':  return lhs < rhs;
  }
  return false;
}

function decideStrategy(strategy, ctx) {
  // Special case: must keep rolling if turn score is below opening requirement
  // and we're not on the board (banking wouldn't open us anyway).
  // Strategies don't need to know about this — we just won't let them bank below open.
  for (const rule of strategy.rules) {
    if (rule.conditions.length > 0 && rule.conditions.every(c => evalCondition(c, ctx))) {
      return 'bank';
    }
  }
  return 'roll';
}

function newBlankStrategy() {
  return {
    id: 'strat-' + Math.random().toString(36).slice(2, 8),
    name: 'Custom strategy',
    rules: [{ conditions: [{ var: 'turnScore', op: '>=', value: 300 }] }],
  };
}
