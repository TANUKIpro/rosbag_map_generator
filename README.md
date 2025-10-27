# ROSBag Map Generator

WebAssembly ベースで ROS の `.bag` (将来的に `.mcap`) をブラウザのみで解析し、2D Occupancy Grid 地図 (`map.pgm` + `map.yaml`) を生成・プレビュー・エクスポートする軽量ツールです。

## 現状 (M0 プロトタイプ)

- Vite + TypeScript によるスタンドアロン Web アプリのスケルトンを追加。
- ドラッグ & ドロップ UI、トピック選択、設定、再生コントロール、統計バーをモックとして配置。
- Canvas 上にダミーの地図プレビューを表示。
- SLAM / 再生ロジックは今後の実装予定。

## 開発環境のセットアップ

```bash
npm install
npm run dev
```

`npm run dev` で Vite の開発サーバ (http://localhost:5173) が起動します。

## ディレクトリ構成

```
src/
  core/          # SLAM 設定などのコアロジック
  styles/        # グローバルスタイル
  ui/            # DOM ベースの UI コンポーネント
  types/         # 型定義
  utils/         # 共通ユーティリティ
```

## 次のステップ

- Web Worker + WASM パイプラインの実装
- ROS bag デコーダとの接続
- Occupancy Grid の生成 / エクスポート処理
- 設定 UI と内部状態の連携
