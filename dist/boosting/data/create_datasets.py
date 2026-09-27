import csv
from pathlib import Path
from sklearn.datasets import (
    make_moons,
    make_circles,
    make_classification,
)

# 出力先のファイルパスを作成
def create_output_file(file_name):
    output_dir = Path(__file__).resolve().parent
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir / file_name


# データセットを作成
def moons_dataset():
    """半月状に分かれた2クラスのデータセットを作成する。

    make_moons の引数:
        n_samples: データ件数。
        shuffle: データ順を混ぜるか。
        noise: データに加えるノイズの大きさ。
        random_state: 乱数を固定するための値。
    """
    X, y = make_moons(
        n_samples=1000,
        shuffle=True,
        noise=0.25,
        random_state=42,
    )
    
    data = tuple(
        (x1, x2, target)
        for (x1, x2), target in zip(X, y)
    )
    
    return data
    
    
def circles_dataset():
    """同心円状に分かれた2クラスのデータセットを作成する。

    make_circles の主な引数:
        n_samples: データ件数。
        shuffle: データ順を混ぜるか。
        noise: データに加えるノイズの大きさ。
        random_state: 乱数を固定するための値。
        factor: 内側の円と外側の円の大きさの比率。
    """
    X, y = make_circles(
        n_samples=1000,
        shuffle=True,
        noise=0.1,
        random_state=42,
        factor=0.5,
    )

    return tuple(
        (x1, x2, target)
        for (x1, x2), target in zip(X, y)
    )

def classification_dataset():
    """分類用のデータセットを作成する。

    make_classification の主な引数:
        n_samples: データ件数。
        n_features: 特徴量の総数。
        n_informative: 分類に本当に役立つ特徴量の数。
        n_redundant: 他の特徴量から作られた冗長な特徴量の数。
        n_repeated: 重複した特徴量の数。
        n_classes: クラス数。
        n_clusters_per_class: 1クラスをいくつの塊にするか。
        weights: 各クラスの割合。
        flip_y: ラベルを意図的に間違える割合。
        class_sep: クラス同士の離れ具合。
        shuffle: データ順を混ぜるか。
        random_state: 乱数を固定するための値。
    """
    X, y = make_classification(
        n_samples=1000,
        n_features=2,
        n_informative=2,
        n_redundant=0,
        n_repeated=0,
        n_classes=2,
        n_clusters_per_class=1,
        weights=None,
        flip_y=0.01,
        class_sep=1.0,
        shuffle=True,
        random_state=42,
    )

    return tuple(
        (x1, x2, target)
        for (x1, x2), target in zip(X, y)
    )

# csvファイルに出力
def output_csv(file_name, data):
    output_file = create_output_file(file_name)

    with output_file.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(("x1", "x2", "target"))
        writer.writerows(data)

    return output_file

def main():
    datasets = (
        ("moons.csv", moons_dataset()),
        ("circles.csv", circles_dataset()),
        ("classification.csv", classification_dataset()),
    )

    for file_name, data in datasets:
        output_file = output_csv(file_name, data)
        print(f"出力しました: {output_file}")


if __name__ == "__main__":
    main()
