import { bestActions } from './random.js';
import { DIRECTIONS } from './maze.js';
import { chart } from './charts.js';

export const metric = (label, value, note = '') => `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></div>`;
export function banditView(bandit, reveal) {
  const ucb = bandit.algorithm === 'ucb', trials = bandit.history.length;
  const fmt = v => v === Infinity ? '∞' : Number.isFinite(v) ? v.toFixed(3) : '—';
  // Highlight the arm UCB would score highest right now: the first untried arm,
  // otherwise the largest Q(a) + exploration bonus.
  let topArm = -1;
  if (ucb && trials > 0) {
    const untried = bandit.counts.indexOf(0);
    topArm = untried >= 0 ? untried
      : bandit.q.map((q, i) => q + bandit.explorationBonus(i)).reduce((best, s, i, all) => s > all[best] ? i : best, 0);
  }
  return `<div class="rl-slots">${bandit.q.map((q, i) => {
    const bonus = bandit.explorationBonus(i), score = q + bonus;
    const ucbRows = ucb
      ? `<span class="rl-ucb-bonus">探索Bonus ${fmt(bonus)}</span><strong class="rl-ucb-score">UCB Score ${fmt(score)}</strong>`
      : '';
    return `<article class="rl-slot ${bandit.last?.action === i ? 'selected' : ''}">${i === topArm ? '<span class="rl-ucb-tag">UCB最大</span>' : ''}<h4>🎰 ${String.fromCharCode(65 + i)}</h4><span>選択 ${bandit.counts[i]} 回</span><strong>Q(a) ${q.toFixed(3)}</strong>${ucbRows}<meter min="0" max="1" value="${q}" aria-label="アーム${i + 1}の推定価値"></meter><span>累積報酬 ${bandit.totals[i]}</span><small>${reveal ? `真の確率 ${(bandit.probabilities[i] * 100).toFixed(0)}%` : '真の確率はまだ秘密'}</small></article>`;
  }).join('')}</div>`;
}
export { mazeDiorama as mazeView } from './maze-view.js';
export { snakeDiorama as snakeView } from './snake-view.js';
export function qDetails(table, selected, cells, last) {
  const values = table[selected] ?? [0, 0, 0, 0], best = bestActions(values);
  const terminal = ['#', 'G', 'T'].includes(cells[selected]);
  return `<h3>選択中：S${selected}</h3><p class="field-help">${terminal ? '終端または壁のため、行動価値を学習しません。' : '緑は最大Q値。同値の場合は複数の方向が候補になります。'}</p><div class="rl-q-values">${values.map((v, a) => `<div class="${!terminal && best.includes(a) ? 'best' : ''}">${DIRECTIONS[a]}<strong>${v.toFixed(3)}</strong></div>`).join('')}</div><h3>Q-table <small>25 states × 4 actions</small></h3><div class="rl-table-scroll"><table><thead><tr><th>State</th>${DIRECTIONS.map(d => `<th>${d}</th>`).join('')}</tr></thead><tbody>${[...cells].map((cell, i) => `<tr class="${i === selected ? 'selected' : ''}"><th>S${i}${cell !== '.' ? ' ' + cell : ''}</th>${(table[i] ?? [0, 0, 0, 0]).map((v, a) => `<td class="${last?.state === i && last?.action === a ? 'rl-updated' : ''}">${v.toFixed(2)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="field-help">黄色：直近に更新した値</p>`;
}
export function learningCharts(history, kind) {
  return chart(history, 'reward', 'Episodeごとの累積報酬', true) + chart(history, 'steps', kind === 'maze' ? 'Episodeごとのstep数' : '生存step数', true) + (kind === 'snake' ? chart(history, 'score', 'Scoreと平均Score', true) : '');
}
