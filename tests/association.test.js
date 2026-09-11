import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { mine, normalizeTransactions, associationRules } from '../dist/association/mining.js';
import { sampleBaskets, parseBaskets, toCSV } from '../dist/association/data.js';

const algorithms = ['apriori', 'eclat', 'fpgrowth'];
const canonical = patterns => patterns.map(({ items, count }) => [items, count]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
function exhaustive(rows, support, maxLength) {
  const baskets = rows.map(row => new Set(row));
  const items = [...new Set(rows.flat())].sort(), results = [];
  for (let mask = 1; mask < 2 ** items.length; mask++) {
    const pattern = items.filter((_, index) => mask & (1 << index));
    if (pattern.length > maxLength) continue;
    const count = baskets.filter(basket => pattern.every(item => basket.has(item))).length;
    if (count >= Math.ceil(rows.length * support - 1e-10)) results.push({ items: pattern, count });
  }
  return canonical(results);
}
for (const algorithm of algorithms) {
  test(`${algorithm}: exact itemsets against exhaustive counting, multiple thresholds and sizes`, () => {
    for (const rows of [sampleBaskets(), [['a', 'b', 'c'], ['a', 'b'], ['a', 'c'], ['b', 'c'], ['d']], [['a', 'a', 'b'], ['b', 'a']], [['a']], [['a'], ['b']]]) {
      for (const support of [0.01, 0.3, 0.5, 1]) for (const maxLength of [1, 2, 3, 5]) {
        const actual = mine(rows, { algorithm, support, maxLength });
        assert.deepEqual(canonical(actual.patterns), exhaustive(rows, support, maxLength));
        assert.ok(actual.patterns.every(pattern => pattern.support === pattern.count / rows.length));
        assert.equal(new Set(actual.patterns.map(pattern => JSON.stringify(pattern.items))).size, actual.patterns.length);
      }
    }
  });
  test(`${algorithm}: randomized baskets agree with independent oracle`, () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rows = sampleBaskets('dense', 40, seed).map(row => row.filter(item => ['パン', '牛乳', '卵', 'バター', 'コーヒー', 'ヨーグルト', 'バナナ'].includes(item))).filter(row => row.length);
      assert.deepEqual(canonical(mine(rows, { algorithm, support: 0.17, maxLength: 4 }).patterns), exhaustive(rows, 0.17, 4));
    }
  });
}
test('Support boundaries are inclusive and safe from floating-point multiplication drift', () => {
  const rows = Array.from({ length: 100 }, (_, index) => [index < 7 ? 'a' : 'b']);
  for (const algorithm of algorithms) assert.equal(mine(rows, { algorithm, support: 0.07 }).patterns.find(p => p.items[0] === 'a').count, 7);
});
test('Rules calculate confidence and lift with the correct denominator', () => {
  const patterns = mine([['a', 'b'], ['a', 'b'], ['a'], ['c']], { support: 0.25 }).patterns;
  const rules = associationRules(patterns, 0);
  const ab = rules.find(rule => rule.antecedent[0] === 'a');
  assert.equal(ab.support, 0.5); assert.equal(ab.confidence, 2 / 3); assert.equal(ab.lift, 4 / 3);
  assert.equal(associationRules(patterns, 0.8).length, 1);
  assert.equal(associationRules(patterns, 1)[0].consequent, 'a');
});
test('CSV handles BOM, quoted commas and quotes, blanks, duplicates, and round trips', () => {
  assert.deepEqual(parseBaskets('\uFEFFパン,牛乳,パン\r\n\r\n"ジャム,大","卵""L",\n'), [['パン', '牛乳'].sort(), ['ジャム,大', '卵"L'].sort()]);
  const rows = [['パン', '牛乳'], ['a,b', 'a"b']];
  assert.deepEqual(parseBaskets(toCSV(rows)), normalizeTransactions(rows));
  assert.match(toCSV([['=1+1']]), /'=1\+1/);
  for (const csv of ['', ' , \n', '"open', '"a"b,c', '"a\nb"']) assert.throws(() => parseBaskets(csv));
});
test('Input validation and unambiguous itemset keys', () => {
  assert.throws(() => normalizeTransactions(Array.from({ length: 5001 }, () => ['a'])));
  assert.throws(() => normalizeTransactions([Array.from({ length: 33 }, (_, i) => String(i))]));
  assert.throws(() => normalizeTransactions([['a'.repeat(81)]]));
  for (const support of [0, -1, 1.1, NaN]) assert.throws(() => mine([['a']], { support }));
  for (const maxLength of [0, 6, 2.5]) assert.throws(() => mine([['a']], { maxLength }));
  const rows = [['a,b', 'c'], ['a', 'b,c'], ['__proto__', '<script>']];
  for (const algorithm of algorithms) assert.deepEqual(canonical(mine(rows, { algorithm, support: 0.1 }).patterns), exhaustive(rows, 0.1, 3));
});
test('Generated data is reproducible and all three methods agree on larger baskets', () => {
  const rows = sampleBaskets('standard', 1000, 42);
  assert.deepEqual(rows, sampleBaskets('standard', 1000, 42));
  assert.notDeepEqual(rows, sampleBaskets('standard', 1000, 43));
  const results = algorithms.map(algorithm => mine(rows, { algorithm, support: 0.05, maxLength: 4 }));
  results.slice(1).forEach(result => assert.deepEqual(canonical(result.patterns), canonical(results[0].patterns)));
  assert.ok(results[0].stats.candidates > 0); assert.ok(results[1].stats.intersections > 0); assert.ok(results[2].stats.trees > 1);
});
test('Excessive search stops with an actionable error instead of returning incomplete itemsets', () => {
  const rows = [Array.from({ length: 32 }, (_, index) => `item${index}`)];
  for (const algorithm of algorithms) assert.throws(() => mine(rows, { algorithm, support: 1, maxLength: 5 }), /上限|20,000/);
});
test('Association Worker returns progress, three exact results, completion, and validation errors', { timeout: 10000 }, async () => {
  const url = new URL('../dist/association/worker.js', import.meta.url).href;
  const worker = new Worker(`const {parentPort}=require('node:worker_threads');global.self={postMessage:data=>parentPort.postMessage(data)};import(${JSON.stringify(url)}).then(()=>{parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage({type:'ready'})});`, { eval: true });
  const queue = [], waiters = [];
  worker.on('message', data => waiters.length ? waiters.shift()(data) : queue.push(data));
  const next = () => queue.length ? Promise.resolve(queue.shift()) : new Promise(resolve => waiters.push(resolve));
  try {
    assert.equal((await next()).type, 'ready');
    worker.postMessage({ transactions: sampleBaskets(), options: { support: 0.3, maxLength: 3 } });
    for (const algorithm of algorithms) {
      assert.deepEqual(await next(), { type: 'progress', algorithm });
      const result = await next(); assert.equal(result.type, 'result'); assert.equal(result.result.algorithm, algorithm);
      assert.deepEqual(canonical(result.result.patterns), exhaustive(sampleBaskets(), 0.3, 3));
    }
    assert.equal((await next()).type, 'done');
    worker.postMessage({ transactions: [], options: {} }); await next();
    assert.equal((await next()).type, 'error');
  } finally { await worker.terminate(); }
});
