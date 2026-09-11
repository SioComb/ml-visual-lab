// Educational implementations: breadth-first candidate pruning, vertical TID
// intersections, and conditional FP-trees. No external runtime dependencies.
export const LIMITS = { transactions: 5000, items: 32, length: 5, patterns: 20000 };
const key = items => JSON.stringify(items);
const ordered = items => [...items].sort();

export function normalizeTransactions(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > LIMITS.transactions)
    throw new Error('購買データは1〜5,000件で指定してください。');
  const items = new Set();
  const transactions = rows.map(row => {
    if (!Array.isArray(row) || row.some(item => typeof item !== 'string')) throw new Error('商品名は文字列で指定してください。');
    const basket = ordered(new Set(row.map(item => item.trim()).filter(Boolean)));
    if (!basket.length) throw new Error('商品がない購買行があります。');
    for (const item of basket) {
      if (item.length > 80) throw new Error('商品名は80文字以内で指定してください。');
      items.add(item);
    }
    return basket;
  });
  if (items.size > LIMITS.items) throw new Error('商品は32種類以内で指定してください。');
  return transactions;
}

export function mine(rows, { algorithm = 'apriori', support = 0.2, maxLength = 3 } = {}) {
  if (!['apriori', 'eclat', 'fpgrowth'].includes(algorithm)) throw new Error('未知のアルゴリズムです。');
  if (!Number.isFinite(support) || support <= 0 || support > 1) throw new Error('支持度は0より大きく100%以下で指定してください。');
  if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > LIMITS.length) throw new Error('最大サイズは1〜5で指定してください。');
  const transactions = normalizeTransactions(rows);
  const minimum = Math.ceil(support * transactions.length - 1e-10);
  const patterns = [], trace = [];
  const stats = { scans: 0, candidates: 0, intersections: 0, nodes: 0, trees: 0 };
  const start = performance.now();
  let operations = 0;
  function guard() {
    if (++operations > 15000000 || (operations % 1024 === 0 && performance.now() - start > 8000))
      throw new Error('探索量が上限に達しました。支持度を上げるか、最大サイズ・データ件数を減らしてください。');
  }
  function add(items, count) {
    if (patterns.length >= LIMITS.patterns) throw new Error('頻出組合せが20,000件を超えました。支持度を上げるか最大サイズを減らしてください。');
    patterns.push({ items: ordered(items), count, support: count / transactions.length });
  }
  const counts = new Map();
  for (const basket of transactions) for (const item of basket) counts.set(item, (counts.get(item) || 0) + 1);
  stats.scans++;
  const frequent = ordered([...counts.keys()].filter(item => counts.get(item) >= minimum));

  if (algorithm === 'apriori') {
    let level = frequent.map(item => [item]);
    stats.candidates = counts.size;
    level.forEach(items => add(items, counts.get(items[0])));
    trace.push({ size: 1, candidates: counts.size, frequent: level.length, pruned: 0 });
    const baskets = transactions.map(basket => new Set(basket));
    for (let size = 2; size <= maxLength && level.length; size++) {
      const previous = new Set(level.map(key)), candidates = [];
      let pruned = 0;
      for (let i = 0; i < level.length; i++) for (let j = i + 1; j < level.length; j++) {
        guard();
        if (!level[i].slice(0, -1).every((item, k) => item === level[j][k])) continue;
        const candidate = [...level[i], level[j].at(-1)];
        if (candidate.every((_, k) => previous.has(key(candidate.filter((_, index) => k !== index))))) candidates.push(candidate);
        else pruned++;
      }
      const next = [];
      if (candidates.length) stats.scans++;
      stats.candidates += candidates.length;
      const candidateCounts = new Array(candidates.length).fill(0);
      for (const basket of baskets) for (let index = 0; index < candidates.length; index++) {
        guard();
        if (candidates[index].every(item => basket.has(item))) candidateCounts[index]++;
      }
      for (let index = 0; index < candidates.length; index++) {
        const candidate = candidates[index], count = candidateCounts[index];
        if (count >= minimum) { next.push(candidate); add(candidate, count); }
      }
      trace.push({ size, candidates: candidates.length, frequent: next.length, pruned });
      level = next;
    }
  } else if (algorithm === 'eclat') {
    const vertical = new Map(frequent.map(item => [item, new Set()]));
    transactions.forEach((basket, tid) => basket.forEach(item => vertical.get(item)?.add(tid)));
    stats.scans++;
    for (const [item, tids] of vertical) trace.push({ item, count: tids.size, tids: [...tids].slice(0, 16) });
    function visit(prefix, extensions) {
      for (let i = 0; i < extensions.length; i++) {
        guard();
        const [item, tids] = extensions[i], pattern = [...prefix, item];
        add(pattern, tids.size);
        if (pattern.length >= maxLength) continue;
        const next = [];
        for (let j = i + 1; j < extensions.length; j++) {
          const [other, ids] = extensions[j], intersection = new Set();
          stats.intersections++;
          const [small, big] = tids.size < ids.size ? [tids, ids] : [ids, tids];
          for (const id of small) { guard(); if (big.has(id)) intersection.add(id); }
          if (intersection.size >= minimum) next.push([other, intersection]);
        }
        visit(pattern, next);
      }
    }
    visit([], [...vertical]);
  } else {
    function buildTree(paths, knownCounts) {
      stats.trees++;
      const frequencies = knownCounts || new Map();
      if (!knownCounts) for (const { items, weight } of paths) for (const item of items) {
        guard(); frequencies.set(item, (frequencies.get(item) || 0) + weight);
      }
      const header = new Map([...frequencies].filter(([, count]) => count >= minimum).map(([item, count]) => [item, { count, nodes: [] }]));
      const root = { item: null, children: new Map(), parent: null, count: 0 };
      for (const { items, weight } of paths) {
        const sorted = items.filter(item => header.has(item)).sort((a, b) => frequencies.get(b) - frequencies.get(a) || (a < b ? -1 : a > b ? 1 : 0));
        let node = root;
        for (const item of sorted) {
          guard();
          if (!node.children.has(item)) {
            const child = { item, count: 0, parent: node, children: new Map() };
            node.children.set(item, child); header.get(item).nodes.push(child); stats.nodes++;
          }
          node = node.children.get(item); node.count += weight;
        }
      }
      return { root, header };
    }
    const tree = buildTree(transactions.map(items => ({ items, weight: 1 })), counts);
    stats.scans++;
    function preview(node, depth) {
      for (const child of node.children.values()) {
        if (trace.length >= 60) return;
        trace.push({ item: child.item, count: child.count, depth }); preview(child, depth + 1);
      }
    }
    preview(tree.root, 0);
    function grow({ header }, suffix) {
      for (const [item, entry] of [...header].sort((a, b) => a[1].count - b[1].count)) {
        guard();
        const pattern = [item, ...suffix]; add(pattern, entry.count);
        if (pattern.length >= maxLength) continue;
        const paths = [];
        for (const node of entry.nodes) {
          const items = [];
          for (let parent = node.parent; parent.item !== null; parent = parent.parent) { guard(); items.push(parent.item); }
          if (items.length) paths.push({ items, weight: node.count });
        }
        if (paths.length) grow(buildTree(paths), pattern);
      }
    }
    grow(tree, []);
  }
  const elapsed = performance.now() - start;
  patterns.sort((a, b) => b.count - a.count || a.items.length - b.items.length || key(a.items).localeCompare(key(b.items)));
  return { algorithm, minimum, patterns, stats, trace, elapsed, transactionCount: transactions.length };
}

export function associationRules(patterns, minConfidence = 0.6) {
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) throw new Error('確信度が無効です。');
  const lookup = new Map(patterns.map(pattern => [key(pattern.items), pattern]));
  const rules = [];
  // Single-item consequents keep rules readable; all antecedents are included.
  for (const pattern of patterns) {
    if (pattern.items.length < 2) continue;
    for (const consequent of pattern.items) {
      const antecedent = pattern.items.filter(item => item !== consequent);
      const left = lookup.get(key(antecedent)), right = lookup.get(key([consequent]));
      if (!left || !right) continue;
      const confidence = pattern.count / left.count;
      if (confidence + 1e-12 >= minConfidence) rules.push({ antecedent, consequent, count: pattern.count, support: pattern.support, confidence, lift: confidence / right.support });
    }
  }
  return rules.sort((a, b) => b.lift - a.lift || b.confidence - a.confidence || b.count - a.count);
}
