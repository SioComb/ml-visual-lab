export function chart(rows, key, title, average = false, xLabel = 'Episode') {
  const w = 480, h = 180, left = 49, right = 15, top = 16, bottom = 35;
  if (!rows.length) return `<div class="rl-empty">${title} · 実行すると推移を表示します</div>`;
  const values = rows.map(r => r[key]);
  const lo = Math.min(0, ...values), hi = Math.max(1, ...values);
  const x = i => left + i / Math.max(1, rows.length - 1) * (w - left - right);
  const y = v => h - bottom - (v - lo) / (hi - lo) * (h - top - bottom);
  const stride = Math.max(1, Math.ceil(rows.length / 400));
  const points = values.map((_, i) => i).filter(i => i % stride === 0 || i === rows.length - 1);
  const path = series => points.map((i, j) => `${j ? 'L' : 'M'}${x(i).toFixed(1)},${y(series[i]).toFixed(1)}`).join(' ');
  let sum = 0;
  const moving = values.map((v, i) => { sum += v; if (i >= 20) sum -= values[i - 20]; return sum / Math.min(i + 1, 20); });
  const ticks = [lo, (lo + hi) / 2, hi].map(v => `<line x1="${left}" x2="${w - right}" y1="${y(v)}" y2="${y(v)}" stroke="#e3e9e4"/><text x="${left - 7}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(1)}</text>`).join('');
  return `<figure class="rl-chart"><figcaption>${title}${average ? '<small>薄緑：各回 ／ 濃緑：直近20回の移動平均</small>' : ''}</figcaption><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}。最新値 ${values.at(-1).toFixed(2)}">${ticks}<path d="${path(values)}" fill="none" stroke="${average ? '#9abeb0' : '#248574'}" stroke-width="1.7"/>${average ? `<path d="${path(moving)}" fill="none" stroke="#176c50" stroke-width="2.3"/>` : ''}<circle cx="${x(values.length - 1)}" cy="${y(values.at(-1))}" r="3" fill="#248574"/><text x="${left}" y="${h - 12}">1</text><text x="${w - right}" y="${h - 12}" text-anchor="end">${rows.length}</text><text x="${w / 2}" y="${h - 5}" text-anchor="middle">${xLabel}</text></svg></figure>`;
}
