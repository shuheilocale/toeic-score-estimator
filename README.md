# TOEICスコア推定テスト

約10分のミニテストで、TOEIC® L&R の予想スコアを**確率分布**として推定する静的サイト。
GitHub Pages でそのまま公開できます(ビルド不要)。

## 特徴

- **適応型テスト(CAT)**: 項目反応理論(3PLモデル)で回答のたびに能力値θを
  ベイズ推定し、Fisher情報量の上位からランダムに次の問題を出題(randomesque)。
  少ない問題数でも推定精度を稼ぎつつ、再受験時は問題が変わる。
- **結果は確率分布**: θの事後分布をスコアに変換し、合計スコアの密度曲線と
  80%信用区間を表示。回答数が少ないほど幅が広がる(不確実性が正直に出る)。
- **テスト長は2段階**: 標準(約10分: L8+R12)/ 精密(約15分: L12+R18)。
  問題数が多いほど推定区間が狭くなる。
- **リスニング音声**: Gemini TTSで事前生成したニューラル音声(`audio/*.m4a`、
  女声W=Kore / 男声M=Charon)を再生。ファイルが無い環境では Web Speech API、
  それも不可ならスクリプト表示に自動フォールバック。
- **アイテムバンク**: リスニング20問・リーディング37問(穴埋め+読解・広告)。

## 開発

```sh
npm test          # 数理コア(IRT・スコアリング・出題選択)のユニットテスト
python3 -m http.server 8000   # ローカル確認(ESモジュールのためfile://不可)
```

### リスニング音声の再生成

`js/items.js` のリスニング項目を追加・変更したら音声を再生成する
(テストが `audio/<id>.m4a` の存在を検査する)。要 ffmpeg と Gemini APIキー。

```sh
GEMINI_API_KEY=... node tools/generate-audio.mjs        # 全件
GEMINI_API_KEY=... node tools/generate-audio.mjs L21    # 指定IDのみ
```

話者ラベルは性別固定(`W`=女声 / `M`=男声)。問題文が the man / the woman に
言及する場合、対応する話者がスクリプトに必要(テストで検査)。

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
