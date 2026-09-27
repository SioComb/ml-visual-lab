const colors = ['#167562', '#547ce5'];
const fills = ['#e8f4ee', '#edf0fc'];
const W = 680, H = 420, left = 48, top = 14, width = 610, height = 365;
const axis = (v, bounds, length) => (v - bounds[0]) / (bounds[1] - bounds[0]) * length;

// Both views use an identical scale: point AREA is proportional to sample weight.
// Large points are capped for legibility; the cap is explicitly described in the UI.
export const pointRadius = (weight, count) => Math.min(12, 3 * Math.sqrt(weight * count));

export function scatter(svg, grid, predictions, records, rowPredictions, weights = null, count = records.length) {
  const cw = width / grid.cols, ch = height / grid.rows;
  let background = '', boundary = '';
  for (let y = 0; y < grid.rows; y++) {
    let start = 0;
    for (let x = 0; x < grid.cols; x++) {
      const i = y * grid.cols + x, c = predictions[i];
      if (x === grid.cols - 1 || predictions[i + 1] !== c) {
        background += `<rect x="${left + start * cw}" y="${top + y * ch}" width="${(x - start + 1) * cw + 0.1}" height="${ch + 0.1}" fill="${fills[c]}"/>`;
        start = x + 1;
      }
      if (x < grid.cols - 1 && c !== predictions[i + 1])
        boundary += `M${left + (x + 1) * cw},${top + y * ch}v${ch}`;
      if (y < grid.rows - 1 && c !== predictions[i + grid.cols])
        boundary += `M${left + x * cw},${top + (y + 1) * ch}h${cw}`;
    }
  }
  let ticks = '';
  for (let i = 0; i <= 4; i++) {
    const x = left + i / 4 * width, y = top + (1 - i / 4) * height;
    const xv = grid.bounds[0][0] + i / 4 * (grid.bounds[0][1] - grid.bounds[0][0]);
    const yv = grid.bounds[1][0] + i / 4 * (grid.bounds[1][1] - grid.bounds[1][0]);
    ticks += `<text x="${x}" y="${top + height + 20}" text-anchor="middle">${xv.toFixed(1)}</text>
      <text x="${left - 8}" y="${y + 4}" text-anchor="end">${yv.toFixed(1)}</text>`;
  }
  const points = records.map((row, i) => {
    const x = left + axis(row.x[0], grid.bounds[0], width);
    const y = top + height - axis(row.x[1], grid.bounds[1], height);
    const r = weights ? pointRadius(weights[i], count) : 3;
    const wrong = rowPredictions[i] !== row.target;
    return `<g data-boost-point="${row.id}"><title>行${row.id} / 正解 Class ${row.target} / 予測 Class ${rowPredictions[i]}${weights ? ` / weight ${weights[i].toFixed(6)}（初期の${(weights[i] * count).toFixed(2)}倍）` : ' / テストデータ：重み更新なし'}</title>
      <circle cx="${x}" cy="${y}" r="${r}" fill="${colors[row.target]}" fill-opacity=".65" stroke="white" stroke-width=".6"/>
      ${wrong ? `<path data-boost-wrong="" d="M${x - 3},${y - 3}l6,6m-6,0l6,-6" fill="none" stroke="#9a431c" stroke-width="1.6"/>` : ''}</g>`;
  }).join('');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `${background}<path d="${boundary}" fill="none" stroke="#47645b" stroke-width="1.2"/>${points}
    <path d="M${left},${top}v${height}h${width}" fill="none" stroke="#889990"/>${ticks}
    <text x="${left + width / 2}" y="418" text-anchor="middle">x1</text><text x="${left + 8}" y="${top + 20}">x2</text>`;
}

export function accuracyChart(svg, stages, selected) {
  const w = 610, h = 148, x0 = 48, y0 = 18;
  const x = i => x0 + (stages.length === 1 ? w / 2 : i / (stages.length - 1) * w);
  const y = value => y0 + (1 - value) * h;
  const path = stages.map((s, i) => `${i ? 'L' : 'M'}${x(i)},${y(s.test.accuracy)}`).join(' ');
  const current = stages[selected];
  svg.setAttribute('viewBox', '0 0 680 220');
  svg.innerHTML = [0, 0.5, 1].map(value => `<path d="M${x0},${y(value)}h${w}" stroke="#dee6e1"/><text x="40" y="${y(value) + 4}" text-anchor="end">${value.toFixed(1)}</text>`).join('') +
    `<path d="${path}" fill="none" stroke="#167562" stroke-width="2.5"/>
    <path d="M${x(selected)},${y0}v${h}" stroke="#6b7975" stroke-dasharray="4 4"/>
    <circle cx="${x(selected)}" cy="${y(current.test.accuracy)}" r="5" fill="#167562" stroke="white" stroke-width="2"/>
    <text x="${x(0)}" y="188" text-anchor="middle">1</text>
    ${stages.length > 1 ? `<text x="${x(stages.length - 1)}" y="188" text-anchor="middle">${stages.length}</text>` : ''}
    <text x="350" y="213" text-anchor="middle">Stage / 弱学習器数</text>`;
  svg.setAttribute('aria-label', `テストAccuracy推移。Stage ${selected + 1}：${current.test.accuracy.toFixed(3)}。縦軸は0から1。`);
}
