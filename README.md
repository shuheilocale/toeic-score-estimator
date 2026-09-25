# TOEICスコア推定テスト

約10分のミニテストで、TOEIC® L&R の予想スコアを**確率分布**として推定する静的サイト。
GitHub Pages でそのまま公開できます(ビルド不要)。

## 特徴

- **適応型テスト(CAT)**: 項目反応理論(3PLモデル)で回答のたびに能力値θを
  ベイズ推定し、Fisher情報量が最大の問題を次に出題。少ない問題数でも推定精度を稼ぐ。
- **結果は確率分布**: θの事後分布をスコアに変換し、合計スコアの密度曲線と
  80%信用区間を表示。回答数が少ないほど幅が広がる(不確実性が正直に出る)。
- **リスニング対応**: Web Speech API(speechSynthesis)でブラウザ内音声合成。
  非対応環境ではスクリプト表示に自動フォールバック。
- **構成**: リスニング8問(約4分)+ リーディング12問(約6分)。
  アイテムバンクはリスニング20問・リーディング34問。

## 開発

```sh
npm test          # 数理コア(IRT・スコアリング・出題選択)のユニットテスト
python3 -m http.server 8000   # ローカル確認(ESモジュールのためfile://不可)
```

## 公開手順(GitHub Pages)

1. GitHubに `toeic-score-estimator` リポジトリを作成して push
2. Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`
3. `https://<ユーザー名>.github.io/toeic-score-estimator/` で公開される

## スコア推定の仕組み

- 各問題は3PLモデル `P(θ) = c + (1-c) / (1 + e^(-a(θ-b)))`(c=0.25)
- θの事後分布をグリッド上でベイズ更新し、
  `Listening = 300 + 90θ` / `Reading = 270 + 90θ`(5〜495にクランプ、5点刻み)で変換
- 合計分布はL/R事後分布の畳み込み(独立仮定)

難易度パラメータは実受験データによる校正値ではなく、TOEICレベル帯を想定した
仮設定です。結果はあくまで目安です。

## 免責

このサイトはETSおよびIIBCとは無関係の非公式ツールです。
TOEIC is a registered trademark of ETS. This site is not endorsed or approved by ETS.
