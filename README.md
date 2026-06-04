# CodeLv

gitのコミットをRPGの経験値に変えて、開発の積み重ねを可視化するデスクトップアプリ。

![Electron](https://img.shields.io/badge/Electron-42.x-47848F?logo=electron)
![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?logo=windows)

## 概要

コミットするたびにXPが貯まり、レベルが上がる。画面の右下に常駐する小さなオーバーレイで、自分の成長をリアルタイムに確認できる。

## 機能

- コミットするたびに **+50 XP** が付与される
- XPが貯まると**レベルアップ**する
- 今日のコミット数・合計XPをオーバーレイに表示
- 複数のgitリポジトリを同時に監視できる
- タスクバーに常駐（トレイアイコン）

## インストール

[Releases](https://github.com/hotate0606/CodeLvl/releases) から最新の `CodeLv-Setup.exe` をダウンロードして実行。

## 開発環境のセットアップ

```bash
git clone https://github.com/hotate0606/CodeLvl.git
cd CodeLvl
npm install
npm start
```

## 使い方

1. タスクバーのトレイアイコンを右クリック
2. **「リポジトリを追加」** から監視したいgitリポジトリのフォルダを選択
3. あとはコミットするだけ。XPが自動で貯まる

## ライセンス

MIT
