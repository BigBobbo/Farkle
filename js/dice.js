// Dice utilities. Dice are represented as arrays of integers 1..6.

function rollDie() { return 1 + Math.floor(Math.random() * 6); }

function rollDice(n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = rollDie();
  return out;
}

// Counts: returns array length 7, counts[face] = number of that face.
function counts(dice) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d]++;
  return c;
}

function sortedDice(dice) { return [...dice].sort((a, b) => a - b); }
