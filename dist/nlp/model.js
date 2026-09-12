// Count-based Bag of Words + multinomial logistic regression. No label fields
// enter the vocabulary; held-out rows never enter fitting or optimization.
let segmenter;
export function tokenize(text) {
  if (typeof Intl.Segmenter !== 'function')
    throw Error('このブラウザは日本語の単語分割に対応していません。最新版のブラウザで開いてください。');
  segmenter ??= new Intl.Segmenter('ja', { granularity: 'word' });
  return [...segmenter.segment(text.normalize('NFKC').toLowerCase())]
    .filter(part => part.isWordLike).map(part => part.segment);
}

export function buildVocabulary(documents) {
  return [...new Set(documents.flatMap(tokenize))].sort();
}

export function vectorize(tokens, vocabulary) {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  const sparse = [];
  vocabulary.forEach((word, index) => {
    if (counts.has(word)) sparse.push([index, counts.get(word)]);
  });
  return sparse;
}

function probabilities(model, vector) {
  const scores = model.weights.map((weights, k) =>
    vector.reduce((score, [index, count]) => score + weights[index] * count, model.bias[k]));
  const max = Math.max(...scores);
  const exp = scores.map(score => Math.exp(score - max));
  const total = exp.reduce((sum, value) => sum + value, 0);
  return exp.map(value => value / total);
}

export function trainModel(rows, classes, onProgress = () => {}, epochs = 180) {
  const vocabulary = buildVocabulary(rows.map(row => row.text));
  if (!vocabulary.length) throw Error('学習用の文章から単語を取り出せませんでした。');
  const model = {
    vocabulary, classes,
    weights: classes.map(() => new Float64Array(vocabulary.length)),
    bias: new Float64Array(classes.length),
  };
  const samples = rows.map(row => ({
    vector: vectorize(tokenize(row.text), vocabulary),
    target: classes.findIndex(c => c.code === row.code),
  }));
  // Full-batch gradient descent on mean cross entropy + L2 regularization.
  // A conservative rate derived from feature norms also handles repeated words.
  const norm = samples.reduce((sum, { vector }) => sum + vector.reduce((n, [, c]) => n + c * c, 1), 0) / rows.length;
  const rate = 1 / norm, regularization = 0.001;
  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradients = classes.map(() => new Float64Array(vocabulary.length));
    const biasGradient = new Float64Array(classes.length);
    let loss = 0;
    for (const { vector, target } of samples) {
      const probs = probabilities(model, vector);
      loss -= Math.log(Math.max(probs[target], 1e-15));
      for (let k = 0; k < classes.length; k++) {
        const error = probs[k] - Number(k === target);
        biasGradient[k] += error;
        for (const [index, count] of vector) gradients[k][index] += error * count;
      }
    }
    for (let k = 0; k < classes.length; k++) {
      model.bias[k] -= rate * biasGradient[k] / rows.length;
      for (let j = 0; j < vocabulary.length; j++)
        model.weights[k][j] -= rate * (gradients[k][j] / rows.length + regularization * model.weights[k][j]);
    }
    if ((epoch + 1) % 15 === 0 || epoch === epochs - 1)
      onProgress({ epoch: epoch + 1, epochs, loss: loss / rows.length });
  }
  return model;
}

export function predict(model, text) {
  const tokens = tokenize(text);
  const vector = vectorize(tokens, model.vocabulary);
  const probs = probabilities(model, vector);
  const winner = probs.indexOf(Math.max(...probs));
  const known = new Set(model.vocabulary);
  return {
    tokens, vector, probabilities: probs, winner,
    unknown: [...new Set(tokens.filter(token => !known.has(token)))],
    contributions: vector.map(([index, count]) => ({
      index, word: model.vocabulary[index], count,
      weight: model.weights[winner][index], contribution: count * model.weights[winner][index],
    })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    bias: model.bias[winner],
  };
}

export function evaluate(model, rows) {
  if (!rows.length) return { count: 0, accuracy: null };
  let correct = 0;
  for (const row of rows) {
    const probs = probabilities(model, vectorize(tokenize(row.text), model.vocabulary));
    if (model.classes[probs.indexOf(Math.max(...probs))].code === row.code) correct++;
  }
  return { count: rows.length, accuracy: correct / rows.length };
}
