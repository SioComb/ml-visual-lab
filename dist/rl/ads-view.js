import { chart } from './charts.js';
import { AD_LABELS, betaCurve } from './thompson.js';

export const AD_COLORS = [
  '#248574',
  '#d27a3d',
  '#5d78c8',
  '#9a62a8',
  '#b08b28',
];

const percent = (value, digits = 1) => `${(value * 100).toFixed(digits)}%`;

export function adCards(experiment, revealTruth) {
  return `<div class="rl-ads">${experiment.counts
    .map((count, index) => {
      const selected = experiment.lastTrial?.selectedIndex === index;
      const observed = count ? percent(experiment.clicks[index] / count) : '—';
      const posterior =
        experiment.alpha[index] /
        (experiment.alpha[index] + experiment.beta[index]);
      const sample = experiment.lastTrial?.samples[index];
      const result = selected
        ? experiment.lastTrial.reward
          ? '<strong class="rl-ad-result clicked">クリック +1</strong>'
          : '<strong class="rl-ad-result missed">クリックなし +0</strong>'
        : '<span class="rl-ad-result">今回は未選択</span>';
      return `<article class="rl-ad-card ${selected ? 'selected' : ''}" style="--ad-color:${AD_COLORS[index]}">
        ${selected ? '<span class="rl-ad-selected">今回表示</span>' : ''}
        <div class="rl-ad-banner" aria-hidden="true"><span>AD</span><strong>${AD_LABELS[index]}</strong><small>SAMPLE CREATIVE</small></div>
        <h4>広告 ${AD_LABELS[index]}</h4>
        <dl>
          <div><dt>表示回数</dt><dd>${count}</dd></div>
          <div><dt>クリック数</dt><dd>${experiment.clicks[index]}</dd></div>
          <div><dt>実測CTR</dt><dd>${observed}</dd></div>
          <div><dt>推定CTR</dt><dd>${percent(posterior)}</dd></div>
          <div><dt>今回の値 θ</dt><dd>${sample === undefined ? '—' : sample.toFixed(3)}</dd></div>
          <div><dt>真のCTR</dt><dd>${revealTruth ? percent(experiment.probabilities[index], 0) : '非表示'}</dd></div>
        </dl>
        ${result}
      </article>`;
    })
    .join('')}</div>`;
}

function distributionSvg(experiment, mode, visible) {
  const trialMode = mode === 'trial' && experiment.lastTrial;
  const alpha = trialMode ? experiment.lastTrial.beforeAlpha : experiment.alpha;
  const beta = trialMode ? experiment.lastTrial.beforeBeta : experiment.beta;
  const curves = alpha.map((value, index) => betaCurve(value, beta[index]));
  const shown = curves.filter((_, index) => visible.has(index));
  const maxDensity = Math.max(
    1,
    ...shown.flatMap((curve) => curve.map((point) => point.y)),
  );
  const width = 640,
    height = 280,
    left = 54,
    right = 18,
    top = 18,
    bottom = 44;
  const x = (value) => left + value * (width - left - right);
  const y = (value) =>
    height - bottom - (value / maxDensity) * (height - top - bottom);
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (value) =>
        `<line x1="${x(value)}" x2="${x(value)}" y1="${top}" y2="${height - bottom}" stroke="#e3e9e4"/><text x="${x(value)}" y="${height - 21}" text-anchor="middle">${value * 100}%</text>`,
    )
    .join('');
  const paths = curves
    .map((curve, index) => {
      if (!visible.has(index)) return '';
      const path = curve
        .map(
          (point, pointIndex) =>
            `${pointIndex ? 'L' : 'M'}${x(point.x).toFixed(2)},${y(point.y).toFixed(2)}`,
        )
        .join(' ');
      const sample = trialMode ? experiment.lastTrial.samples[index] : null;
      return `<path d="${path}" fill="none" stroke="${AD_COLORS[index]}" stroke-width="2.4"/>${sample === null ? '' : `<line x1="${x(sample)}" x2="${x(sample)}" y1="${top}" y2="${height - bottom}" stroke="${AD_COLORS[index]}" stroke-width="1.4" stroke-dasharray="4 4"/><circle cx="${x(sample)}" cy="${top + 5}" r="4" fill="${AD_COLORS[index]}"/>`}`;
    })
    .join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${trialMode ? '今回の抽選前' : '学習後'}のBeta分布">${grid}<line x1="${left}" x2="${width - right}" y1="${height - bottom}" y2="${height - bottom}" stroke="#728078"/><line x1="${left}" x2="${left}" y1="${top}" y2="${height - bottom}" stroke="#728078"/>${paths}<text x="${left - 7}" y="${top + 4}" text-anchor="end">${maxDensity.toFixed(1)}</text><text x="${left - 7}" y="${height - bottom + 4}" text-anchor="end">0</text><text x="${width / 2}" y="${height - 5}" text-anchor="middle">CTRの候補</text><text x="13" y="${height / 2}" text-anchor="middle" transform="rotate(-90 13 ${height / 2})">確率密度</text></svg>`;
}

export function adDistributionView(experiment, mode, visible) {
  const trialAvailable = Boolean(experiment.lastTrial);
  const actualMode = mode === 'trial' && trialAvailable ? 'trial' : 'current';
  const alpha =
    actualMode === 'trial'
      ? experiment.lastTrial.beforeAlpha
      : experiment.alpha;
  const beta =
    actualMode === 'trial' ? experiment.lastTrial.beforeBeta : experiment.beta;
  return `<div class="rl-distribution-heading"><div><h3>広告ごとの事後分布</h3><p class="field-help">高さは確率密度であり、そのCTRの確率そのものではありません。</p></div><div class="rl-distribution-mode" role="group" aria-label="分布の時点"><button id="rl-dist-current" class="quiet ${actualMode === 'current' ? 'active' : ''}" aria-pressed="${actualMode === 'current'}">学習後</button><button id="rl-dist-trial" class="quiet ${actualMode === 'trial' ? 'active' : ''}" aria-pressed="${actualMode === 'trial'}" ${trialAvailable ? '' : 'disabled'}>今回の抽選</button></div></div>
    <div class="rl-beta-chart">${distributionSvg(experiment, actualMode, visible)}</div>
    <div class="rl-ad-legend" aria-label="広告の凡例">${alpha
      .map((value, index) => {
        const mean = value / (value + beta[index]);
        return `<button type="button" class="quiet" data-ad-legend="${index}" aria-pressed="${visible.has(index)}" style="--ad-color:${AD_COLORS[index]}"><span></span><strong>広告 ${AD_LABELS[index]}</strong><small>Beta(${value}, ${beta[index]}) · ${percent(mean)}</small></button>`;
      })
      .join('')}</div>
    ${experiment.trials === 0 ? '<p class="field-help rl-overlap-note">初期はすべてBeta(1,1)のため、分布が重なっています。推定CTR 50%は実績ではなく事前分布の平均です。</p>' : ''}`;
}

export function adDecisionView(experiment, animate = false) {
  const last = experiment.lastTrial;
  if (!last)
    return '<p>全広告のBeta分布から候補値を抽選し、最大の広告を1回表示します。</p>';
  const selected = AD_LABELS[last.selectedIndex];
  return `<ol class="rl-decision ${animate ? 'animate' : ''}">
    <li><span>1</span><div><strong>抽選</strong><small>${last.samples.map((sample, index) => `${AD_LABELS[index]} ${sample.toFixed(3)}`).join(' / ')}</small></div></li>
    <li><span>2</span><div><strong>最大値を選択</strong><small>広告 ${selected} · θ=${last.samples[last.selectedIndex].toFixed(3)}</small></div></li>
    <li><span>3</span><div><strong>クリック観測</strong><small>${last.reward ? 'クリック +1' : 'クリックなし +0'}</small></div></li>
    <li><span>4</span><div><strong>分布を更新</strong><small>広告 ${selected} → Beta(${last.selectedPosteriorAfter.alpha}, ${last.selectedPosteriorAfter.beta})</small></div></li>
  </ol>`;
}

function selectionChart(experiment) {
  const width = 480,
    height = 180,
    left = 48,
    right = 15,
    top = 18,
    bottom = 35;
  if (!experiment.trials)
    return '<div class="rl-empty">広告ごとの選択回数 · 実行すると比較します</div>';
  const max = Math.max(1, ...experiment.counts);
  const plotWidth = width - left - right;
  const gap = 12;
  const barWidth = (plotWidth - gap * (experiment.arms - 1)) / experiment.arms;
  const bars = experiment.counts
    .map((value, index) => {
      const barHeight = (value / max) * (height - top - bottom);
      const x = left + index * (barWidth + gap);
      const y = height - bottom - barHeight;
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="3" fill="${AD_COLORS[index]}"/><text x="${x + barWidth / 2}" y="${Math.max(top + 10, y - 5)}" text-anchor="middle">${value}</text><text x="${x + barWidth / 2}" y="${height - 13}" text-anchor="middle">${AD_LABELS[index]}</text>`;
    })
    .join('');
  return `<figure class="rl-chart"><figcaption>広告ごとの選択回数</figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="広告ごとの選択回数">${bars}<line x1="${left}" x2="${width - right}" y1="${height - bottom}" y2="${height - bottom}" stroke="#728078"/></svg></figure>`;
}

export function adLearningCharts(experiment, revealTruth) {
  return (
    chart(experiment.history, 'clicks', '累積クリック数', false, '試行') +
    (revealTruth
      ? chart(experiment.history, 'regret', '累積期待後悔', false, '試行')
      : '<div class="rl-empty">累積期待後悔 · 真のCTRを表示すると確認できます</div>') +
    selectionChart(experiment)
  );
}
