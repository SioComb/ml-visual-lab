import { Bandit, BANDIT_NAMES } from './bandit.js';
import { MAZES, DIRECTIONS, generateMaze } from './maze.js';
import { QLearner } from './qlearning.js';
import { environment, TrainingSession } from './session.js';
import { random } from './random.js';
import { chart } from './charts.js';
import { metric, banditView, mazeView, qDetails, snakeView, learningCharts } from './views.js';
import { createRobotAnimator } from './robot-animator.js';

const $ = id => document.getElementById(id);
const numberField = (id, label, value, min, max, step = 1) => `<label for="rl-${id}">${label}</label><input id="rl-${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" required>`;
const selectField = (id, label, entries) => `<label for="rl-${id}">${label}</label><select id="rl-${id}">${Object.entries(entries).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
const lessons = {
  bandit: ['01', '多腕バンディット', 'どのスロットを選ぶと報酬が増える？', 'εを0から0.3に変え、同じSeedで比較してみましょう。探索すると未知のアームを試せますが、その瞬間の報酬を逃すこともあります。Greedyは推定値のみ、UCBは推定値と不確実性で選びます。'],
  maze: ['02', 'Q-learning迷路', '目先の報酬から、Goalまでの行動を学ぶ。', 'バンディットのε-Greedyを、今度は各マスの行動選択に使います。探索はランダムな方向、活用は最大Q値の方向です。αは更新の大きさ、γは将来の報酬の重み。εを上げると探索が増えます。'],
  snake: ['03', 'Snake', '状態が増えたら、何を覚えればよい？', '迷路は25状態ですが、Snakeは頭・体・Foodの配置で状態が急増します。ここでは4方向の危険、Foodの相対方向、進行方向に圧縮した最大576状態でQ-learningを行います。同じ特徴でも体の配置は異なり、最適行動を区別できない限界があります。'],
};
// Per-algorithm copy for the Bandit lesson. UCB has no ε, so its text and
// formula drop the ε wording entirely and describe the exploration bonus.
const BANDIT_INTRO = {
  greedy: '推定価値Q(a)が最大のアームを毎回選びます（探索なし）。序盤の当たり外れがそのまま方策になり、低く評価されたアームを取りこぼすことがあります。',
  epsilon: 'εの確率でランダムなアームを試し（探索）、それ以外はQ(a)が最大のアームを選びます（活用）。εを0から0.3へ動かし、同じSeedで比較してみましょう。',
  ucb: '推定価値Q(a)に、選択回数が少ないほど大きくなる探索ボーナスを足したUCB Scoreが最大のアームを選びます。最初に全アームを1回ずつ試し、以降はScoreで判断します。ランダムな探索は行いません。',
};
const BANDIT_READING = {
  greedy: '最初の数回の結果が方策を決めます。同じ設定でもSeedを変えると選ぶアームが変わります。ε-GreedyやUCBと累積報酬を比べてみましょう。同値の最大Q値はランダムに選びます。',
  epsilon: 'ε=0では最初の偶然に引っぱられがちです。εを増やすと不利なアームも試せますが、その場の報酬は減ります。同値の最大Q値はランダムに選びます。',
  ucb: '探索ボーナス √(2·ln t ÷ N(a)) は、試行tが増えるほど、また選択回数N(a)が少ないほど大きくなります。あまり引いていないアームのUCB Scoreが持ち上がり、ランダム性なしで自然に探索されます。全アームを1回試すまでは未選択アームを優先します。',
};
const BANDIT_FORMULA = {
  greedy: 'a = argmax Q(a)\nQ(a) ← Q(a) + [Reward − Q(a)] ÷ N(a)',
  epsilon: '確率 ε：ランダムに選択 ／ 確率 1−ε：a = argmax Q(a)\nQ(a) ← Q(a) + [Reward − Q(a)] ÷ N(a)',
  ucb: 'a = argmax [ Q(a) + √(2·ln t ÷ N(a)) ]\nQ(a) ← Q(a) + [Reward − Q(a)] ÷ N(a)\nt：総試行回数 ／ N(a)：アーム a の選択回数 ／ 探索Bonus = √(2·ln t ÷ N(a))',
};

export function initReinforcement() {
  let kind = 'bandit', worker = null, timer = null, running = false, snapshot = null;
  let bandit, config, selected = 0, evaluation = null, pendingPlay = false, active = false;
  let comparisons = [];
  const root = $('reinforcement');
  const robotAnimator = createRobotAnimator();
  root.innerHTML = `<nav class="rl-lessons" aria-label="強化学習の学習順序">${Object.entries(lessons).map(([key, [n, name]]) => `<button class="quiet" data-lesson="${key}" aria-pressed="false"><span>${n}</span> ${name}</button>`).join('<span class="rl-next" aria-hidden="true">→</span>')}</nav><div class="workspace rl-workspace"><aside class="settings"><section class="setting-section"><div class="section-title"><span class="step">01</span><h2>実験を設定する</h2></div><div id="rl-fields"></div><p class="field-help">速度以外の設定変更は学習をリセットします。同じSeed・設定で再現できます。</p></section><div class="train-area"><button id="rl-step" class="quiet">1ステップ</button><button id="rl-run" class="primary">▶ 自動実行</button><button id="rl-pause" class="quiet">一時停止</button><button id="rl-play" class="quiet">▷ Play / Evaluation</button><button id="rl-reset" class="quiet">リセット</button></div></aside><div class="results"><div class="result-heading"><div><div class="eyebrow">REINFORCEMENT LEARNING</div><h2 id="rl-title"></h2><p id="rl-subtitle"></p></div><span id="rl-status" class="status" role="status" aria-live="polite">準備完了</span></div><section class="panel rl-intro"><strong id="rl-algorithm"></strong><p id="rl-explanation"></p></section><div class="metrics rl-metrics" id="rl-metrics"></div><div class="rl-environment-grid"><section class="panel"><div class="rl-panel-heading"><h3>環境と行動</h3><label class="check" id="rl-overlay-label"><input id="rl-overlay" type="checkbox" checked> 方策を重ねる</label><label class="check" id="rl-reveal-label"><input id="rl-reveal" type="checkbox"> 真の確率を表示</label></div><div id="rl-board"></div><p id="rl-action" class="rl-action"></p><p id="rl-legend" class="field-help"></p></section><section class="panel" id="rl-detail"></section></div><section class="panel rl-learning"><h3>学習の結果</h3><p id="rl-progress" class="field-help"></p><div class="rl-charts" id="rl-charts"></div><div id="rl-comparison"></div></section><section class="panel rl-reading"><div class="eyebrow">READ THE LEARNING</div><h3>学習と再生を見比べよう</h3><p id="rl-reading"></p><p id="rl-update" class="rl-formula"></p></section></div></div>`;

  function settings() {
    let html = kind === 'bandit' ? selectField('algorithm', 'アルゴリズム', BANDIT_NAMES) + numberField('arms', 'スロット数', 3, 3, 5) : '';
    if (kind === 'maze') html += selectField('preset', '迷路プリセット', { ...Object.fromEntries(Object.entries(MAZES).map(([k, v]) => [k, v.name])), random: 'ランダム迷路（Seedから生成）' }) + '<button type="button" id="rl-regenerate" class="quiet">↻ 迷路をランダムに再生成</button><p class="field-help">Goalへ進める配置を生成します。再生成はRandom Seedを更新し、学習をリセット。同じSeedなら同じ配置になります。</p>';
    if (kind !== 'bandit') html += numberField('alpha', 'α · 学習率', 0.3, 0, 1, 0.05) + numberField('gamma', 'γ · 割引率', 0.95, 0, 1, 0.05);
    html += numberField('epsilon', 'ε · 探索率', kind === 'bandit' ? 0.1 : 0.2, 0, 1, 0.05);
    html += numberField('limit', kind === 'bandit' ? '試行回数' : 'Episode数', kind === 'bandit' ? 500 : kind === 'maze' ? 500 : 2000, 1, 10000);
    if (kind !== 'bandit') html += numberField('maxSteps', '1 Episodeの最大step数', kind === 'maze' ? 200 : 300, 1, 2000);
    html += selectField('speed', kind === 'bandit' ? '実行速度' : '学習速度（約80msごとのEpisode上限）', kind === 'bandit' ? { 1: 'ゆっくり · 2回/秒', 10: '標準 · 20回/秒', 50: '高速 · 100回/秒' } : { 1: '1 Episode', 10: '10 Episodes', 50: '50 Episodes' });
    html += numberField('seed', 'Random Seed', 42, 0, 4294967295);
    $('rl-fields').innerHTML = html;
    if (kind === 'bandit') $('rl-algorithm').value = 'epsilon';
    $('rl-speed').value = '10';
    if (kind === 'maze') $('rl-regenerate').onclick = () => {
      if (!readConfig()) return;
      let seed = Number($('rl-seed').value);
      // Advance through reproducible layouts; avoid immediately repeating one.
      for (let attempt = 0; attempt < 32; attempt++) {
        seed = (seed + 1) >>> 0;
        if (generateMaze(seed) !== snapshot.env.cells) break;
      }
      $('rl-seed').value = seed;
      $('rl-preset').value = 'random';
      reset();
    };
    // Algorithm select and algorithm description use distinct IDs.
    for (const input of $('rl-fields').querySelectorAll('input, select')) {
      if (input.id === 'rl-speed') input.addEventListener('change', () => {
        config.speed = Number(input.value);
        if (running && kind !== 'bandit' && !evaluation) worker?.postMessage({ type: 'train', episodes: config.limit, speed: config.speed });
      });
      else input.addEventListener('change', reset);
    }
  }
  function readConfig() {
    for (const input of $('rl-fields').querySelectorAll('input')) if (!input.checkValidity()) { input.reportValidity(); return null; }
    const value = id => Number($('rl-' + id)?.value);
    return { seed: value('seed'), epsilon: value('epsilon'), alpha: value('alpha'), gamma: value('gamma'), arms: value('arms'), algorithm: $('rl-algorithm')?.value, preset: $('rl-preset')?.value ?? 'basic', maxSteps: value('maxSteps'), limit: value('limit'), speed: value('speed') };
  }
  function stop() {
    clearTimeout(timer); timer = null; running = false; pendingPlay = false;
    if (worker) worker.postMessage({ type: 'pause' });
  }
  function reset() {
    stop();
    const next = readConfig();
    if (!next) { $('rl-status').textContent = '入力値を確認'; return; }
    config = next;
    worker?.terminate(); worker = null;
    evaluation = null; selected = 0;
    robotAnimator.reset();
    if (kind === 'bandit') bandit = new Bandit(config);
    else {
      snapshot = new TrainingSession(kind, config).snapshot();
      try {
        worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        const currentWorker = worker;
        worker.onmessage = ({ data }) => {
          if (worker !== currentWorker) return;
          if (data.error) { stop(); $('rl-status').textContent = '学習エラー：' + data.error; return; }
          snapshot = data.snapshot;
          if (pendingPlay && !data.running) { pendingPlay = false; startPlay(); return; }
          if (evaluation) return;
          running = data.running;
          $('rl-status').textContent = running ? 'Training · 学習中' : snapshot.history.length >= config.limit ? '学習完了' : '停止中';
          render();
        };
        worker.onerror = () => { stop(); worker?.terminate(); worker = null; render(); $('rl-status').textContent = 'Workerを開始できません。HTTP経由で開き直してください。'; };
        worker.postMessage({ type: 'init', kind, config });
      } catch {
        worker?.terminate(); worker = null; render();
        $('rl-status').textContent = 'Workerに対応したブラウザでHTTP経由で開いてください';
        return;
      }
    }
    $('rl-status').textContent = '準備完了'; render();
  }
  function banditTick() {
    if (!running) return;
    for (let i = 0; i < config.speed && bandit.history.length < config.limit; i++) bandit.step();
    if (bandit.history.length >= config.limit) { running = false; $('rl-status').textContent = '試行完了'; }
    render();
    if (running) timer = setTimeout(banditTick, 500);
  }
  function startPlay() {
    const learner = new QLearner(config.alpha, config.gamma);
    learner.table = snapshot.table;
    evaluation = { env: environment(kind, config, random(config.seed + 1000)), learner, rng: random(config.seed + 2000), steps: 0, reward: 0, last: null, done: false };
    running = true; $('rl-status').textContent = 'Evaluation · ε=0 / 更新なし';
    render(); timer = setTimeout(playTick, 350);
  }
  function playTick() {
    if (!running || !evaluation) return;
    const e = evaluation, selectedAction = e.learner.select(e.env.state(), 0, e.rng);
    const transition = e.env.step(selectedAction.action);
    e.steps++; e.reward += transition.reward; e.last = { ...selectedAction, ...transition };
    e.done = transition.done || e.steps >= config.maxSteps;
    if (e.done) { running = false; $('rl-status').textContent = transition.done ? transition.outcome : '再生終了 · step上限（未到達）'; }
    render();
    if (running) timer = setTimeout(playTick, 350);
  }
  function render() {
    const isBandit = kind === 'bandit';
    const focusedState = $('rl-board').contains(document.activeElement) ? document.activeElement.dataset.state : undefined;
    const tableScroll = $('rl-detail').querySelector('.rl-table-scroll')?.scrollTop ?? 0;
    $('rl-step').disabled = running || (!isBandit && !worker) || (isBandit ? bandit.history.length >= config.limit : snapshot.history.length >= config.limit);
    $('rl-run').disabled = $('rl-step').disabled;
    $('rl-run').textContent = isBandit ? '▶ 自動実行' : '▶ Training / 学習';
    $('rl-pause').disabled = !running;
    $('rl-play').hidden = isBandit;
    $('rl-play').disabled = running || !worker || !snapshot?.history.length;
    $('rl-play').textContent = evaluation && !evaluation.done ? '▷ Evaluation / 再生を再開' : '▷ Play / Evaluation';
    // ε only applies to ε-Greedy: hide the field (and its label) for Greedy/UCB.
    const noEpsilon = isBandit && config.algorithm !== 'epsilon';
    $('rl-epsilon').disabled = noEpsilon;
    $('rl-epsilon').hidden = noEpsilon;
    const epsilonLabel = $('rl-fields').querySelector('label[for="rl-epsilon"]');
    if (epsilonLabel) epsilonLabel.hidden = noEpsilon;
    $('rl-overlay-label').hidden = kind !== 'maze'; $('rl-reveal-label').hidden = !isBandit;
    $('rl-algorithm-name').textContent = isBandit ? `使用中：${BANDIT_NAMES[config.algorithm]}` : `使用中：Q-learning + ε-Greedy${evaluation ? '（再生はε=0）' : ''}`;
    const last = isBandit ? bandit.last : evaluation ? evaluation.last : snapshot.last;
    $('rl-action').textContent = last ? `${isBandit ? 'アーム ' + String.fromCharCode(65 + last.action) : '行動 ' + DIRECTIONS[last.action]} · ${last.reason ?? (last.exploring ? '探索 Exploration' : '活用 Exploitation')} · Reward ${last.reward.toFixed(1)}` : evaluation ? '学習済みのQ値で、最初の行動を選びます。' : '1ステップで、最初の行動を見てみましょう。';
    if (isBandit) {
      $('rl-metrics').innerHTML = metric('試行', bandit.history.length, `/ ${config.limit}`) + metric('累積報酬', bandit.total) + metric('平均報酬', (bandit.total / (bandit.history.length || 1)).toFixed(3));
      $('rl-board').innerHTML = banditView(bandit, $('rl-reveal').checked);
      $('rl-explanation').textContent = BANDIT_INTRO[config.algorithm] || BANDIT_INTRO.epsilon;
      $('rl-reading').textContent = BANDIT_READING[config.algorithm] || BANDIT_READING.epsilon;
      $('rl-detail').hidden = true;
      $('rl-legend').textContent = '当たり +1 / はずれ 0。緑の枠が直近に選ばれたアームです。';
      $('rl-charts').innerHTML = chart(bandit.history, 'reward', '累積報酬', false, '試行') + chart(bandit.history, 'average', '平均報酬', false, '試行');
      $('rl-progress').textContent = '設定を変える前に結果を記録し、同じSeed・スロット数・試行数で比較できます。';
      $('rl-comparison').hidden = false;
      $('rl-comparison').innerHTML = `<button class="quiet" id="rl-save" ${bandit.history.length ? '' : 'disabled'}>現在の比較結果を記録</button>${comparisons.length ? '<div class="rl-table-scroll"><table><thead><tr><th>手法</th><th>ε</th><th>Seed / 台数</th><th>試行</th><th>累積報酬</th><th>平均報酬</th></tr></thead><tbody>' + comparisons.map(c => `<tr><td>${c.name}</td><td>${c.epsilon}</td><td>${c.seed} / ${c.arms}</td><td>${c.trials}</td><td>${c.total}</td><td>${c.average}</td></tr>`).join('') + '</tbody></table></div>' : ''}`;
      $('rl-save').onclick = () => { comparisons.push({ name: BANDIT_NAMES[config.algorithm], epsilon: config.algorithm === 'epsilon' ? config.epsilon : '—', seed: config.seed, arms: config.arms, trials: bandit.history.length, total: bandit.total, average: (bandit.total / bandit.history.length).toFixed(3) }); comparisons = comparisons.slice(-6); render(); };
      $('rl-update').textContent = BANDIT_FORMULA[config.algorithm] || BANDIT_FORMULA.epsilon;
    } else {
      const env = evaluation?.env.snapshot() ?? snapshot.env;
      const steps = evaluation?.steps ?? snapshot.steps, reward = evaluation?.reward ?? snapshot.reward;
      $('rl-metrics').innerHTML = metric('完了Episode', snapshot.history.length, `/ ${config.limit}`) + metric(evaluation ? '再生の累積報酬' : '現在の累積報酬', reward.toFixed(1), `${steps} steps`) + (kind === 'snake' ? metric('Score', env.score, `ε = ${evaluation ? 0 : config.epsilon}`) : metric('探索率 ε', evaluation ? 0 : config.epsilon, evaluation ? 'Q-tableを更新しません' : '学習中は一定'));
      $('rl-detail').hidden = false;
      if (kind === 'maze') {
        $('rl-board').innerHTML = mazeView(env, snapshot.table, selected, $('rl-overlay').checked);
        // Hand the fresh scene to the animation controller. Walk during Play /
        // Evaluation and manual single steps; snap during fast auto-training.
        robotAnimator.sync({
          scene: $('rl-board').querySelector('.rl-diorama-scene'),
          state: env.position, cells: env.cells,
          action: last?.action, token: last,
          animate: Boolean(evaluation) || !running,
        });
        $('rl-detail').innerHTML = qDetails(snapshot.table, selected, env.cells, snapshot.last);
        $('rl-legend').textContent = 'S: Start / ◎: Goal +10 / ■: Wall / ⚠: Trap −10 / 🤖: Agent。通常移動・壁への試行 −0.1。矢印は現在のQ値に基づく方策です。';
      } else {
        $('rl-board').innerHTML = snakeView(env);
        $('rl-detail').innerHTML = `<h3>状態を小さく表現する</h3><div class="rl-flow">4方向の危険 + Foodの方向 + 進行方向<br>↓<br>Q-table（最大576行 × 4行動）<br>↓<br>ε-Greedy → 行動</div><p>学習した状態：<strong>${Object.keys(snapshot.table).length}</strong> / 576</p><h3>DQNでは何が変わる？</h3><p>表に保存するQ値をニューラルネットワークで近似します。この教材は簡略状態のQ-learning版で、DQNは使用していません。</p>`;
        $('rl-legend').textContent = '● Food +10 / 壁・体への衝突 −10 / 通常移動 −0.1。Foodを取ると1マス伸びます。即時の逆向き移動も体への衝突です。';
      }
      $('rl-charts').innerHTML = learningCharts(snapshot.history, kind);
      $('rl-progress').textContent = '完了した学習Episodeを表示。上限で打ち切った回も含みます。Evaluationは学習グラフに含めません。';
      $('rl-comparison').hidden = true;
      const u = snapshot.last;
      $('rl-update').textContent = 'Q(s,a) ← Q(s,a) + α [r + γ max Q(s′,a′) − Q(s,a)]' + (u ? `\n直近：S${u.state} ${DIRECTIONS[u.action]} / ${u.before.toFixed(3)} → ${u.after.toFixed(3)}（更新目標 ${u.target.toFixed(3)}）` : '') + '\nGoal・Trap・衝突では将来価値を0にします。step上限は時間制限なので将来価値を残します。';
    }
    const scroll = $('rl-detail').querySelector('.rl-table-scroll');
    if (scroll) scroll.scrollTop = tableScroll;
    if (focusedState !== undefined) $('rl-board').querySelector(`[data-state="${focusedState}"]`)?.focus({ preventScroll: true });
  }
  function lesson(next) {
    stop(); worker?.terminate(); worker = null; kind = next;
    for (const button of root.querySelectorAll('[data-lesson]')) { button.classList.toggle('active', button.dataset.lesson === kind); button.setAttribute('aria-pressed', button.dataset.lesson === kind); }
    $('rl-title').textContent = lessons[kind][1]; $('rl-subtitle').textContent = lessons[kind][2];
    $('rl-explanation').textContent = lessons[kind][3];
    $('rl-reading').textContent = kind === 'bandit' ? 'ε=0では最初の偶然に引っぱられることがあります。εを増やした結果、UCBの結果も記録し、探索と活用の違いを比較しましょう。同値の最大Q値はランダムに選びます。' : 'Trainingは高速にQ値を更新します。Play / Evaluationは学習済みのQ値を使ってゆっくり行動し、更新はしません。未学習・学習不足の方策はGoalに到達しないこともあります。εは自動減衰させず、設定した探索率の影響を比較できます。';
    settings(); $('rl-reveal').checked = false; reset();
  }
  // Rename the descriptive element before inserting the algorithm select.
  $('rl-algorithm').id = 'rl-algorithm-name';
  root.querySelectorAll('[data-lesson]').forEach(button => button.onclick = () => lesson(button.dataset.lesson));
  $('rl-step').onclick = () => { evaluation = null; if (!readConfig()) return; if (kind === 'bandit') { bandit.step(); render(); } else worker?.postMessage({ type: 'step' }); };
  $('rl-run').onclick = () => {
    if (!readConfig()) return;
    evaluation = null; running = true; $('rl-status').textContent = kind === 'bandit' ? '自動実行中' : 'Training · 学習中';
    if (kind === 'bandit') banditTick(); else { worker?.postMessage({ type: 'train', episodes: config.limit, speed: config.speed }); render(); }
  };
  $('rl-pause').onclick = () => { stop(); $('rl-status').textContent = '一時停止'; render(); };
  $('rl-play').onclick = () => {
    if (evaluation && !evaluation.done) { running = true; $('rl-status').textContent = 'Evaluation · ε=0 / 更新なし'; playTick(); return; }
    stop(); pendingPlay = true; worker?.postMessage({ type: 'pause' });
  };
  $('rl-reset').onclick = reset;
  $('rl-overlay').onchange = $('rl-reveal').onchange = render;
  $('rl-board').onclick = event => { const cell = event.target.closest('[data-state]'); if (cell) { selected = Number(cell.dataset.state); render(); } };
  document.addEventListener('visibilitychange', () => { if (document.hidden && active) { stop(); $('rl-status').textContent = '一時停止'; render(); } });
  lesson(kind);
  return {
    show() { active = true; root.hidden = false; render(); },
    hide() { active = false; stop(); robotAnimator.reset(); $('rl-status').textContent = '一時停止'; render(); root.hidden = true; },
  };
}
