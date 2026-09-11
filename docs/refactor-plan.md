# 整備 設計修正案

対象: `dist/` 一式（機能追加で崩れたフォーマット・重複・統合パターンの不統一を解消する）。
方針: **Stage 1〜3（挙動を変えない整備）＋ Stage 4（購買パターンをSPAタブへ統合）** まで実施する。

## 0. 前提・非目的

- 挙動の変更は Stage 4（購買パターンのタブ統合）のみ。Stage 1〜3 はロジック・見た目を変えない整形／重複排除。
- モデルの計算ロジック（`ml.js` / `advanced.js` / `association/mining.js` など）には手を入れない。
- 依存パッケージなしで動く現状の設計思想（README記載）は維持する。Stage 1 でフォーマッタを使うかどうかはこの制約と絡むため、下記で選択肢を提示する。

## 1. 現状の課題（根拠）

1. **全ファイルが密な1行コード**: `app.js`（30KB/117行）、`ml.js`、`visuals.js`、`rl/*`、`association/*` はほぼ改行・コメントなし。
2. **統合パターンが3種類混在**:
   - 教師あり学習: `index.html` + `app.js` 中心のSPA
   - 強化学習: 同じSPA内 `<section id="reinforcement" hidden>` に `initReinforcement()` が `innerHTML` でUIを丸ごと注入する「レイジー・タブ」方式
   - 購買パターン: 完全に別ページ `association.html`。`association/ui.js` はモジュール読み込み時にトップレベルで `document.getElementById` して即イベント登録する「ページ専用スクリプト」方式
3. **`$`（`getElementById`）の重複定義が5箇所**: `app.js` / `preprocessing-ui.js` / `association/ui.js` / `rl/ui.js` / `visuals.js`。
4. **HTMLエスケープ関数の重複が4箇所**（`esc` / `escape` と命名も不統一）: `app.js` / `preprocessing-ui.js` / `association/ui.js` / `visuals.js`。
5. **CSSが3分割**（`style.css` / `rl/style.css` / `association/style.css`）で、ページごとに2つ読み込む構成。共通コンポーネントの重複が疑われる。
6. **命名規則の不統一**: 既存部分はcamelCase ID・1行HTML、`association/*` はkebab-case ID・複数行インデント付きHTML。
7. ルート直下の `ml-visual-lab-source.zip` は古いスナップショットの置き土産。

## 2. 実施順序

```
Stage 1: フォーマット統一        （リスク: 低）
Stage 2: 共通ユーティリティ一本化 （リスク: 低）
Stage 3: CSS再構成               （リスク: 中）
Stage 4: 購買パターンをタブ統合   （リスク: 高・唯一の挙動変更）
```

Stage 4 が最もリスクの高い構造変更（DOM生成方法の変更）なので、先に1〜3で周辺を安定させ、Stage 4 の差分をロジック変更だけに絞る。**Astra に一括で修正させる場合も、「Stage 1〜3」と「Stage 4」は別コミットに分けるよう指示すること。**

---

## Stage 1: フォーマット統一

- 対象: `dist/**/*.js`, `dist/**/*.html`, `dist/**/*.css`
- ロジックは一切変更せず、改行・インデントのみ導入。
- **決定事項**: フォーマッタ（Prettier等）を `devDependencies` に追加するか、`npx` でその場実行に留め `package.json` を無依存のまま保つか。README は「依存パッケージのインストールは不要」と明記しているのはサイトの実行に対してであり、開発時の devDependency 追加とは矛盾しないが、`package.json` が現状ゼロ依存である点は変わる。→ **推奨: `npx prettier` を都度実行し、`package.json` には追加しない**（ゼロ依存の思想を保つ）。継続的に使うなら別途相談。

## Stage 2: 共通ユーティリティの一本化

新規ファイル `dist/shared/dom.js` を作成し、以下をexport:

```js
export const $ = id => document.getElementById(id);
export const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
```

置き換え対象（ローカル定義を削除し、上記をimport）:

| ファイル | 現在の定義 |
| --- | --- |
| `dist/app.js` | `$`, インラインの `esc` |
| `dist/preprocessing-ui.js` | `$`, `esc` |
| `dist/visuals.js` | `$`, `esc` |
| `dist/rl/ui.js` | `$` |
| `dist/association/ui.js` | `$`, `escape`（→呼び出し側も `esc` に統一） |

CSVダウンロード処理（`app.js` と `association/ui.js` にそれぞれ1箇所ずつある `new Blob(...) + createObjectURL` パターン）も `dist/shared/download.js` の `downloadCSV(filename, csvString)` へ統一する。

## Stage 3: CSS再構成

- 現状: `style.css`（共通側のつもりだが実際は教師あり学習UIに強く依存した命名も混在）+ `rl/style.css` + `association/style.css`。
- 再構成案: `style.css` を「共通トークン・共通コンポーネント（ボタン、パネル、フォーム部品、レイアウト）」に絞り込み、教師あり学習固有のスタイルは残しつつ、`rl/style.css` と `association/style.css` は本当に機能固有な差分のみに削る。
- 実施前に両ファイルをdiffし、重複セレクタ（ボタン・パネル系）を洗い出してから着手する。

---

## Stage 4: 購買パターンをSPAタブへ統合

### 現状の2つの契約を比較

**RL（`dist/rl/ui.js`）の契約 — これに合わせる**
```js
export function initReinforcement() {
  const root = $('reinforcement'); // index.htmlに元からある空の<section hidden>
  root.innerHTML = `...丸ごとのUIテンプレート...`;
  // イベントリスナーをここで一度だけ登録
  return {
    show() { root.hidden = false; /* 描画更新 */ },
    hide() { /* worker停止・状態リセット */ root.hidden = true; },
  };
}
```
`app.js` 側:
```js
let reinforcement = null;
$('rlTask').onclick = () => {
  reinforcement ??= initReinforcement(); // 初回クリックで遅延初期化
  $('supervisedWorkspace').hidden = true;
  reinforcement.show();
  // 5ボタンのactive/aria-pressed切り替え
};
```

**association（`dist/association/ui.js`）の現状 — これを変える**
- `association.html` にUI一式が直書き。
- `ui.js` はモジュール読み込み時にトップレベルで `$('run-mining').addEventListener(...)` 等を即実行。
- 状態（`transactions`, `results`, `rules`, `worker` など）もモジュールトップレベルの `let`。

### 変更内容

1. **`dist/association/ui.js`**
   - 全体を `export function initAssociation() { ... }` で包む。
   - `association.html` の `.workspace` 部分（設定パネル〜結果パネル一式）をテンプレート文字列として関数内に移し、`const root = $('association'); root.innerHTML = \`...\`;` で生成（RLと同じ手法）。
   - 末尾で `return { show, hide }` を追加。
     - `show()`: `root.hidden = false`。初回のみサンプルデータの初期描画を実行。
     - `hide()`: 実行中の探索を確実に止める（`stop()` を呼ぶ。現状 `pagehide` でのみ呼ばれているが、タブ離脱時にも呼ぶよう変更）。`root.hidden = true`。
   - `window.addEventListener('pagehide', stop)` は残す（ページごと閉じる場合の保険）。

2. **`dist/index.html`**
   - タスクスイッチの `<a class="application-link" href="./association.html">` を、他の4ボタンと同じ `<button id="assocTask">` に変更。
   - `<section id="reinforcement">` と同じ並びに `<section id="association" hidden></section>` を追加。
   - `<head>` に `<link rel="stylesheet" href="./association/style.css">` を追加。

3. **`dist/app.js`**
   - `import {initAssociation} from './association/ui.js';` を追加。
   - `rlTask` と同型のブロックを `assocTask` 用に追加。5ボタンの active/aria-pressed 切り替えループを4→5対応に拡張。

4. **`dist/association.html`（後方互換シム）**
   - 中身を `<script>location.replace('./#association')</script>` ＋ `<noscript>` 案内程度の薄いリダイレクトに置き換える。外部ブックマーク・共有リンクを壊さないため。
   - `app.js` 初期化処理に `location.hash === '#association'` なら起動時に `assocTask` を選択する分岐を追加（シムからの遷移後に自動でタブが開くようにするため実質必須）。
   - README内の「`association.html` を開く」という案内文言も更新する。

5. **要判断: 見出し・参考文献フッターの扱い**
   - `association.html` は専用の見出し（「一緒に買われる、を見つけよう。」）と専用の参考文献フッター（Apriori/Eclat/FP-Growthのリンク）を持つが、RL統合時はこれを行わず共通見出しのまま。
   - **既定案（RLに合わせる）**: 専用見出し・専用フッターは削除し、共通のものだけにする。
   - 代替案: タスクごとに `{title, subtitle, sources}` を出し分ける小さな仕組みを追加する（実装コスト増。RL側にも将来同様の対応が要る）。
   - → **実装前にどちらにするか一言指定してください**（未指定なら既定案で進める）。

### テストへの影響

- `tests/association-browser.mjs` 25行目 `page.locator('.application-link').click()`: ボタン化により `.application-link` クラスはなくなるため、`#assocTask` へのセレクタ変更が必要（待機条件 `#mining-status` の完了待ちはページ内DOM差し替えでも動作するはず）。
- `tests/association.test.js`: `association/mining.js` / `data.js` の純粋ロジックを直接importしているだけなので**影響なし**。
- `association.html` を直接開くQAがあれば、リダイレクト確認に置き換える。

### 検証手順

各Stage共通:
1. `npm run check`（構文チェック）
2. `npm test`（`node --test tests/*.test.js`）
3. 可能なら `node tests/browser-smoke.mjs` / `node tests/association-browser.mjs`（Playwrightキャッシュがある場合）

Stage 4 完了後は手動でも確認:
- 購買パターンタブへの切替がページ遷移なしで行われる
- タブを離れると探索中のworkerが停止する（ブラウザのタスクマネージャ等で確認、または連続切替で二重起動しないこと）
- `association.html` への直リンクが新タブへリダイレクトされる
- ブラウザの戻る/進むボタンの挙動が破綻しない

### リスク・ロールバック

- Stage 1〜3: ロジック無変更のため `git diff` の目視確認で十分。問題があれば該当コミットのみrevert。
- Stage 4: DOM生成方法が「静的HTML」から「innerHTML注入」に変わるため、`association/style.css` のセレクタが `body`/`.workspace` 直下を前提にしていないか移行後に見直す。アクセシビリティ属性（`aria-pressed`など）も5ボタン対応漏れがないか確認する。

---

## Astraへの依頼メモ

- 本ファイル（`docs/refactor-plan.md`）を仕様書として渡す。
- コミットは最低2つに分割: 「Stage 1-3（整形・共通化・CSS再編、挙動不変）」「Stage 4（購買パターンのタブ統合、挙動変更あり）」。
- 各コミット後に `npm run check` と `npm test` を通すことを条件にする。
- Stage 4 の見出し・フッター扱いは上記「要判断」の指定を伝えてから着手させる。
