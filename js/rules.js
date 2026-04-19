// Default rules — match Mike Perrotta's article (and common Farkle conventions).
// Every value is editable in the Settings tab and persisted to localStorage.

const DEFAULT_RULES = {
  // Single-die scores. Faces not listed here are not scoring on their own.
  singles: { 1: 100, 5: 50 },

  // Three-of-a-kind by face.
  threeOfAKind: { 1: 1000, 2: 200, 3: 300, 4: 400, 5: 500, 6: 600 },

  // Four / five / six of a kind: multiplier applied to the three-of-a-kind value.
  fourOfAKindMult: 2,
  fiveOfAKindMult: 4,
  sixOfAKindMult: 8,

  // Special multi-dice combos.
  straight: 1500,        // 1-2-3-4-5-6
  threePairs: 1500,      // e.g. 2,2,4,4,6,6
  fourPlusPair: 1500,    // e.g. 4,4,4,4,2,2
  // Two triplets score additively (sum of the two 3-of-a-kinds), no special bonus.

  // End-of-game.
  targetScore: 10000,
  minOpeningScore: 500,  // 0 = no opening requirement

  // Hot dice: when all 6 dice score, you re-roll all 6 (vs. ending the turn).
  hotDice: true,
};

const RULES_STORAGE_KEY = 'farkle.rules.v1';

function loadRules() {
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_RULES);
    const saved = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_RULES), ...saved };
  } catch (e) {
    return structuredClone(DEFAULT_RULES);
  }
}

function saveRules(rules) {
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
}

let CURRENT_RULES = loadRules();

function getRules() { return CURRENT_RULES; }
function setRules(r) { CURRENT_RULES = r; saveRules(r); }
