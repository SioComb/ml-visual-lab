function random(seed=81){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const titles={
  regression:{linear:'勉強時間 → テスト得点',curve:'気温 → アイスの販売数',category:'契約プラン → 月額料金'},
  classification:{moons:'買い物傾向 → 会員タイプ',clusters:'購入履歴 → 顧客タイプ',category:'プラン・利用回数 → 継続／解約',units:'距離・利用額 → 配送タイプ'},
  clustering:{moons:'買い物傾向が似た人を探す',clusters:'顧客の購入パターンを探す',category:'プランと利用回数で顧客をまとめる',units:'距離と利用額で配送をまとめる'}
};
export function sampleOptions(task){return Object.entries(titles[task])}
export function sample(kind='linear',noise=18,task){
  task??=['linear','curve'].includes(kind)?'regression':'classification';
  const rand=random(),normal=()=>Math.sqrt(-2*Math.log(Math.max(1e-9,rand())))*Math.cos(2*Math.PI*rand());
  let rows=[],headers=[],description='',experiment='';
  for(let i=0;i<180;i++){
    if(kind==='linear'){
      const hours=+(rand()*10).toFixed(2);rows.push([hours,Math.round(Math.max(0,Math.min(100,18+6*hours+normal()*noise*.35)))]);
    }else if(kind==='curve'){
      const temperature=+(15+rand()*20).toFixed(1);rows.push([temperature,Math.max(0,Math.round(12+.4*(temperature-15)**2+normal()*noise*.4))]);
    }else if(kind==='moons'){
      const c=i%2,a=rand()*Math.PI,x=Math.cos(a)*3+c*3+normal()*noise*.022,y=Math.sin(a)*3*(c?-1:1)+c*1.3+normal()*noise*.022;
      rows.push([+Math.max(.1,4+x*.75).toFixed(1),Math.max(100,Math.round((5+y)*800)),c?'プレミアム会員':'通常会員']);
    }else if(kind==='clusters'){
      const c=i%3;rows.push([Math.max(1,Math.round([2,10,5][c]+normal()*(.3+noise*.035))),Math.max(100,Math.round([1200,1500,6500][c]+normal()*(100+noise*25))),['少額・低頻度','少額・高頻度','高額購入'][c]]);
    }else if(kind==='units'){
      const c=i%3;rows.push([+Math.max(.1,[2,8,5][c]+normal()*(.3+noise*.035)).toFixed(2),Math.max(100,Math.round([1500,1800,7500][c]+normal()*(100+noise*25))),['近距離・少額','遠距離・少額','高額利用'][c]]);
    }else if(kind==='category'){
      const c=i%3,plan=['ライト','スタンダード','プレミアム'][c],uses=(i*17%53)+1;
      rows.push(task==='regression'?[plan,[980,1980,3980][c]+(i%5)*100]:[plan,uses,c===2||c===1&&uses>25?'継続':'解約']);
    }
  }
  if(kind==='linear'){
    headers=['勉強時間（時間）','テスト得点（点）'];description='あるテストの勉強時間と得点。勉強時間を入力して、得点を予測する練習です。';experiment='まずは線形回帰。ばらつきを増やすと、点と予測線のずれはどう変わる？';
  }else if(kind==='curve'){
    headers=['気温（℃）','アイス販売数（個／日）'];description='気温が高い日ほど販売数の伸びが大きくなる、架空のお店のデータです。';experiment='線形回帰と多項式回帰（2次）を比較。曲線にすると売上の伸び方をとらえられる？';
  }else if(kind==='moons'){
    headers=['月平均の来店回数','1回の購入額（円）','会員タイプ'];description=task==='clustering'?'来店回数と購入額が似た買い物客を探します。直線だけでは分けにくい配置にした練習用データです。':'来店回数と購入額から、架空の会員タイプを予測します。2タイプを曲がった配置にして、モデルの違いを試せます。';experiment=task==='clustering'?'k=2でk-meansと階層的クラスタリングを比較。曲がったまとまりを分けられる？':'ロジスティック回帰とRBFカーネルのSVMを比較。曲がった境界を表現できるのは？';
  }else if(kind==='clusters'){
    headers=['来店回数（月）','1回の購入額（円）','顧客タイプ'];description=task==='clustering'?'来店回数と購入額から、似た買い方の顧客をまとめます。正解のタイプ名は渡しません。':'「少額・低頻度」「少額・高頻度」「高額購入」の3タイプを、来店回数と購入額から予測します。';experiment=task==='clustering'?'kを2・3・4に変えて学習。どの分け方で顧客の違いが見えやすい？':'3クラスに対応したランダムフォレストやk近傍法で試してください。';
  }else if(kind==='units'){
    headers=['配送距離（km）','注文金額（円）','配送タイプ'];description='数kmの距離と数千円の金額。桁が大きく違う2列で、スケーリングの効果を試します。';experiment=task==='clustering'?'k-meansで「なし」と「標準化」を比較。金額ばかりに引っ張られなくなる？':'k近傍法で「なし」と「標準化」を比較。単位をそろえると予測は変わる？';
  }else if(kind==='category'){
    headers=task==='regression'?['契約プラン','月額料金（円）']:['契約プラン','利用回数（月）','契約結果'];description=task==='regression'?'プラン名から、追加料金を含む月額料金を予測します。文字の入力をOne-hotで数値に変換します。':task==='clustering'?'契約プランと利用回数が似た顧客をまとめます。プラン名はOne-hotの0/1列として学習します。':'契約プランと利用回数から、架空の継続・解約を予測します。プラン名をOne-hotで変換して試せます。';experiment='学習後、「前処理の結果」でプラン名が0/1の列に変わったところを見てみよう。';
  }else throw Error('不明なサンプルです。');
  if(task==='clustering'){headers=headers.slice(0,2);rows=rows.map(row=>row.slice(0,2));}
  return {name:titles[task][kind],sampleKind:kind,headers,rows,description,experiment,synthetic:true};
}
