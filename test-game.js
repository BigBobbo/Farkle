// End-to-end game flow test using AI players.
global.localStorage = { _data: {}, getItem(k){return this._data[k]||null;}, setItem(k,v){this._data[k]=v;} };
global.structuredClone = obj => JSON.parse(JSON.stringify(obj));
const fs = require('fs'), path = require('path');
function load(f) { eval.call(global, fs.readFileSync(path.join(__dirname, f), 'utf8')); }
['rules','dice','scoring','strategy','game','solver','simulate'].forEach(n => load(`js/${n}.js`));

const presets = loadStrategies();
const stratMap = Object.fromEntries(presets.map(s => [s.id, s]));

const g = createGame([
  { name: 'BankAt300', ai: 'bank-300' },
  { name: 'BankAt500', ai: 'bank-500' },
]);

let safety = 0;
while (!g.winner && safety++ < 5000) {
  const moved = aiStep(g, stratMap);
  if (!moved) break;
}
console.log('Winner:', g.winner ? g.winner.name : '(timeout)');
console.log('Scores:', g.players.map(p => `${p.name}=${p.score}`).join(', '));
console.log('Log entries:', g.log.length);
console.log('Last 5 log entries:', g.log.slice(-5));
