const present = (value) =>
  value !== null && value !== undefined && String(value).trim() !== '';
const numeric = (value) => present(value) && Number.isFinite(Number(value));
export const scalingNames = {
  none: '変換なし',
  standard: '標準化（Z-score）',
  minmax: 'Min-Max（0〜1）',
};

// Column types are explicit UI choices. Statistics and category dictionaries are fit
// only on the supplied training partition; target labels never enter this pipeline.
export function readInputRows(data, opts, features) {
  const categorical = new Set(opts.categoryColumns ?? []);
  if (features.some((i) => categorical.has(i)) && !opts.oneHot)
    throw Error(
      'カテゴリ列を学習に使うには「One-hot」を有効にしてください。数値として扱いたい列は型を「数値」に変更してください。',
    );
  return data.rows.flatMap((row, id) => {
    const valid = features.every((i) =>
      categorical.has(i) ? present(row[i]) : numeric(row[i]),
    );
    const targetValid =
      opts.task === 'clustering' ||
      (opts.task === 'classification'
        ? present(row[opts.target])
        : numeric(row[opts.target]));
    if (!valid || !targetValid) return [];
    return [
      {
        id,
        x: features.map((i) =>
          categorical.has(i) ? String(row[i]).trim() : Number(row[i]),
        ),
        ...(opts.task === 'clustering'
          ? {}
          : {
              y:
                opts.task === 'classification'
                  ? String(row[opts.target])
                  : Number(row[opts.target]),
            }),
      },
    ];
  });
}

export function fitPreprocessor(training, features, headers, opts) {
  const scaling =
    opts.scaling ?? (opts.standardize === false ? 'none' : 'standard');
  if (!(scaling in scalingNames)) throw Error('スケーリング方式が不正です。');
  const categorical = new Set(opts.categoryColumns ?? []),
    outputNames = [];
  const columns = features.map((source, position) => {
    const name = headers[source],
      values = training.map((r) => r.x[position]);
    if (categorical.has(source)) {
      const categories = [...new Set(values.map(String))].sort();
      if (categories.length > 32)
        throw Error(
          `「${name}」はカテゴリが${categories.length}種類あります。1列32種類以内にまとめてください。IDなどの列は入力から外してください。`,
        );
      // Full one-hot for distance methods. Drop one category only for unregularized
      // linear regression so the intercept and dummy columns are not collinear.
      const baseline = opts.algorithm === 'linear' ? categories[0] : null;
      const outputs = categories.filter((c) => c !== baseline);
      outputNames.push(...outputs.map((c) => `${name}=${c}`));
      return {
        source,
        position,
        name,
        type: 'category',
        categories,
        outputs,
        baseline,
      };
    }
    const mean = values.reduce((s, v) => s + v, 0) / values.length,
      min = Math.min(...values),
      max = Math.max(...values);
    const std = Math.sqrt(
      values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length,
    );
    if (![mean, min, max, std].every(Number.isFinite))
      throw Error(`「${name}」の値が大きすぎます。単位を変更してください。`);
    const offset =
      scaling === 'standard' ? mean : scaling === 'minmax' ? min : 0;
    const scale =
      scaling === 'standard'
        ? std || 1
        : scaling === 'minmax'
          ? max - min || 1
          : 1;
    outputNames.push(name);
    return {
      source,
      position,
      name,
      type: 'numeric',
      mean,
      std,
      min,
      max,
      offset,
      scale,
    };
  });
  if (!outputNames.length)
    throw Error(
      '学習データに変化のある入力がありません。別の列を選んでください。',
    );
  const transform = (raw) =>
    columns.flatMap((c) =>
      c.type === 'category'
        ? c.outputs.map((value) => (String(raw[c.position]) === value ? 1 : 0))
        : [(Number(raw[c.position]) - c.offset) / c.scale],
    );
  const unknown = (raw) =>
    columns
      .filter(
        (c) =>
          c.type === 'category' &&
          !c.categories.includes(String(raw[c.position])),
      )
      .map((c) => c.name);
  return {
    transform,
    unknown,
    schema: {
      scaling,
      oneHot: !!opts.oneHot,
      columns,
      outputNames,
      fittedRows: training.length,
      fittedOn: opts.task === 'clustering' ? 'all' : 'train',
    },
  };
}

export function createPlotSpace(rows, schema) {
  const axes = schema.columns.map((c) => {
    if (c.type === 'category') {
      const categories = [
        ...new Set(rows.map((r) => String(r.x[c.position]))),
      ].sort();
      return {
        type: 'category',
        categories,
        range: [-0.5, categories.length - 0.5],
      };
    }
    const values = rows.map((r) => r.x[c.position]),
      min = Math.min(...values),
      max = Math.max(...values),
      pad = (max - min || 1) * 0.08;
    return { type: 'numeric', range: [min - pad, max + pad] };
  });
  return {
    axes,
    encode: (raw) =>
      axes.map((axis, j) =>
        axis.type === 'category'
          ? axis.categories.indexOf(String(raw[j]))
          : raw[j],
      ),
    decode: (coords) =>
      axes.map((axis, j) =>
        axis.type === 'category'
          ? axis.categories[
              Math.max(
                0,
                Math.min(axis.categories.length - 1, Math.round(coords[j])),
              )
            ]
          : coords[j],
      ),
  };
}

export function preprocessingResult(processor, train, test = []) {
  const rows = [
    ...train.map((r) => ({
      ...r,
      subset: processor.schema.fittedOn === 'all' ? 'all' : 'train',
    })),
    ...test.map((r) => ({ ...r, subset: 'test' })),
  ].sort((a, b) => a.id - b.id);
  const unknownRows = test.filter(
    (r) => processor.unknown(r.x).length > 0,
  ).length;
  return {
    ...processor.schema,
    unknownRows,
    rows: rows.map((r) => ({
      id: r.id,
      raw: r.x,
      values: processor.transform(r.x),
      subset: r.subset,
      target: r.y,
    })),
  };
}
