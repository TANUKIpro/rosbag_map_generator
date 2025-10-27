# Product Specification

## 概要 / 目的
- **目的**: ローカルに保存したROSの`.bag`（将来的に`.mcap`も）を**ブラウザ上だけで**再生し、**2D占有グリッド地図**（`map.pgm`+`map.yaml`互換）を生成・途中停止・エクスポートできる軽量ツールを提供する。
- **特徴**: 完全スタンドアロン（オフライン・サーバ不要・ドラッグ&ドロップ）、UIは最低限、**“可視化”ではなく“地図生成”に特化**。

## 非目標（スコープ外）
- 3Dマップ（OctoMap/TSDF）やグラフ最適化の高度可視化。
- 多センサSLAM（カメラ・IMU・GNSSフュージョン）※将来拡張とする。
- クラウドアップロード/共有機能（初期MVPでは未実装）。

## 想定ユーザ / ユースケース
- **現場検証**: フィールドで取得したbagから、即席で2D地図を切り出して品質確認。
- **レビュー/共有**: ROS未整備のPCでも地図を開いて議論。
- **部分地図作成**: 長時間bagから任意区間のみを再生して地図をエクスポート。

## 前提・仮定（Assumptions）
- 対応OS: 最新Chrome/Edge/Firefox（WebAssembly SIMD / WebWorker対応環境）
- センサ: 2D LIDAR（/scan: `sensor_msgs/LaserScan`）。
- オドメトリ: 任意（`/odom: nav_msgs/Odometry` があれば利用、無ければスキャンマッチング単独）。
- TF: `/tf`が存在すれば座標系を解決。無い場合は`map←base_link`の初期姿勢を原点固定で推定開始。
- 最大bagサイズ: 〜2GBを目標（ストリーミング/間引き前提）。

## 機能要件（FR）
1. **ファイル入力**: ローカルから`.bag`（ROS1）をドラッグ&ドロップで読み込み。
2. **トピック自動検出**: `/scan`、`/tf`、`/odom`候補を自動列挙。ユーザはドロップダウンで確定可能。
3. **再生制御**: 再生/一時停止/停止、シークバー、再生速度（0.5×/1×/2×/4×）。
4. **地図生成**: 再生に伴ってOccupancyGridを逐次更新（プレビューをCanvasで表示）。
5. **途中エクスポート**: いつでも`map.pgm`+`map.yaml`を生成しダウンロード。
6. **区間指定エクスポート**: 開始/終了マーカーで区間を指定し、その区間のみで地図を生成し直しエクスポート。
7. **設定**: 地図解像度（例: 0.02/0.05/0.1m）、地図サイズ（m/セル数）、スキャン間引き率、ICP/スキャンマッチング重み、occupied/free閾値等。
8. **ログ/プロファイル**: フレーム処理FPS、WASM時間、メモリ使用量の簡易表示。
9. **エラー通知**: 欠落TF、タイムスタンプ不整合、トピック未検出、メモリ不足で警告/回復策を表示。

## 非機能要件（NFR）
- **完全ローカル**: ネットワーク送信なし。PWAとしてオフライン動作。
- **性能目標**: 10Hz・720RPM相当の/scan（~10k beams/s想定）で**>=10FPS**の地図更新を目標。
- **メモリ目標**: 常時メモリ使用 < 1.5GB（1m分解能=0.05m、100×100mマップ=2000×2000セル=4Mセル程度）。
- **起動時間**: 2秒以内にUI可視、10秒以内にbag解析とトピック候補表示。
- **セキュリティ**: ブラウザSandbox内でファイルは保持、保存先はユーザローカルのみ。

## 入出力仕様
### 入力（必須/任意）
- `sensor_msgs/LaserScan`（必須）
- `nav_msgs/Odometry`（任意）
- `tf2_msgs/TFMessage`（任意）

### 出力
- **`map.pgm`**（`P5`グレースケール、0=占有、255=自由、`negate`設定で逆転も可）
- **`map.yaml`**
  ```yaml
  image: map.pgm
  resolution: 0.05
  origin: [x, y, yaw]  # map座標における画像左下の実座標
  negate: 0
  occupied_thresh: 0.65
  free_thresh: 0.196
  ```
- （オプション）**エクスポート設定JSON**（地図範囲/分解能/パラメタ/使用区間など）

## UI仕様（MVP）
- ヘッダ: 「ファイルをドロップ or クリックして選択」
- 左ペイン: トピック選択（自動検出結果+手動入力）
- 下部: 再生コントロール（再生/停止/速度/区間開始・終了ボタン）
- 中央: Canvasで**現在のOccupancyGridプレビュー**。
- 右上: 「今すぐエクスポート」「区間で再生成→エクスポート」
- トースト: エラー/警告/成功通知。

## アーキテクチャ
```
[UI] ── postMessage ─▶ [Player] ─▶ [Decoder] ─▶ [WASM SLAM Worker] ─▶ [Map Builder]
  ▲                             │                         │                └▶ Exporter(PGM/YAML)
  └──────── Canvas Render ◀──────┘                         └── OccupancyGrid(SharedArrayBuffer)
```
- **Player**: bagの時間軸制御、区間再生。
- **Decoder**: `@foxglove/rosbag`等でメッセージデコード→標準化。
- **WASM SLAM Worker**: スキャン→姿勢推定（スキャンマッチング/ICP）→地図更新。
- **Map Builder**: OccupancyGrid（log-odds）更新、ImageData変換、エクスポート生成。

## コアアルゴリズム（MVP）
- **姿勢推定**
  - オドメ有: 事前推定=オドメ積分、補正=2D ICP（点群↔距離変換画像/ESDF上で）
  - オドメ無: スキャンtoマップマッチング（Hector系・Gauss-Newton）
- **地図更新**
  - セルは**log-odds**で更新（ヒット/ミス確率p_hit/p_miss、クリッピング）
  - レイキャスティング: Bresenham/DAAでfreeセル更新、ヒットセルは占有強化
- **最適化**
  - スキャン間引き、角度ダウンサンプル、k最良対応のみ採用、キーフレーム化
  - WebAssembly SIMD + WebWorker、重い更新は一定周期でまとめて適用

## データ構造（TypeScript想定）
```ts
type LaserScan = { ranges: Float32Array; angle_min: number; angle_max: number; angle_increment: number; range_min: number; range_max: number; stamp: number };

type Odom = { pose: { x:number; y:number; yaw:number }; twist?: { vx:number; vy:number; wz:number }; stamp:number };

type Tf = { parent: string; child: string; x:number; y:number; yaw:number; stamp:number };

interface SlamConfig { resolution:number; width:number; height:number; origin:[number,number,number]; pHit:number; pMiss:number; lMin:number; lMax:number; l0:number; downsample:number }

interface Pose2D { x:number; y:number; yaw:number }

interface OccupancyGrid { width:number; height:number; resolution:number; origin:[number,number,number]; logOdds: Float32Array /* length=width*height */ }
```

## 主要API（UI↔Worker間メッセージ）
```ts
// UI→Player
{ type:"OPEN", file:File }
{ type:"SET_TOPICS", scan:"/scan", odom?:"/odom", tf?:"/tf" }
{ type:"PLAY", speed:1|2|4 }
{ type:"PAUSE" } { type:"STOP" } { type:"SEEK", stamp:number }
{ type:"MARK_START" } { type:"MARK_END" }

// Player→Worker
{ type:"SCAN", scan:LaserScan }
{ type:"ODOM", odom:Odom }
{ type:"TF", tf:Tf }
{ type:"END" }

// UI→Worker
{ type:"CONFIG", cfg:SlamConfig }
{ type:"EXPORT" } // 現在のマップをPGM/YAMLで返す

// Worker→UI
{ type:"POSE", pose:Pose2D, stamp:number }
{ type:"GRID_FRAME", imageBitmap:ImageBitmap, stamp:number } // Canvas描画用に変換済み
{ type:"STATS", fps:number, wasmMs:number, memMB:number }
{ type:"EXPORT_DONE", files:{ pgm:Blob, yaml:Blob } }
{ type:"ERROR", code:string, message:string }
```

## 例: PGM/YAML生成ロジック（擬似コード）
```pseudo
function exportMap(grid: OccupancyGrid): {pgm:Blob, yaml:Blob} {
  bytes = new Uint8Array(grid.width*grid.height)
  for i in 0..n-1:
    p = 1 - 1/(1+exp(grid.logOdds[i]))  // 占有確率
    bytes[i] = toByte(p)                 // 0..255（negate=0: 0=占有, 255=自由）
  header = `P5\n${grid.width} ${grid.height}\n255\n`
  pgm = Blob([header, bytes], {type:"image/x-portable-graymap"})
  yaml = Blob([`image: map.pgm\nresolution: ${grid.resolution}\norigin: [${grid.origin.join(", ")}]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n`], {type:"text/yaml"})
  return { pgm, yaml }
}
```

## エラー/例外設計
- **トピック未検出**: 自動検出失敗→手動入力UI表示。
- **TF不整合/欠落**: 補間に失敗→一定ウィンドウ内の外挿/固定フレーム仮定で警告継続。
- **巨大bagでOOM**: ストリーミング読み、インデックスのみ保持、プレビュー解像度自動低減を提案。
- **負のタイムスタンプ/順序乱れ**: タイムソート/重複除去。

## ライセンス/コンプライアンス
- コアSLAMは自前実装で開始し、外部ライブラリは**非GPL**を優先（MIT/BSD/Apache）。
- 依存OSSのライセンス表記をアプリ内Aboutに掲示。

## 品質評価指標
- 地図の**閉じ**（ループ未検出でもドrift < 1%/100mを目標）
- **再現性**（同設定で±1%以内）
- **処理速度**（10Hz入力で10FPS以上）
- **ユーザ操作**（起動〜地図エクスポートまで3クリック以内）

## テスト計画（MVP）
- 単体: 角度→点群変換、レイキャスティング、log-odds更新の数理テスト。
- 結合: /scanのみ、/scan+odom、/scan+tfの各組合せで地図生成。
- 負荷: 1GB/2GBのbagでの処理時間・メモリ計測。
- 回帰: 既知bagに対する地図のハッシュ一致（設定固定）。

## マイルストーン
- **M0 (1〜2週)**: 入力/再生/Canvas描画（地図はダミー）。
- **M1 (2〜4週)**: WASMコア最小版（オドメ無しスキャンマッチング）+ エクスポート。
- **M2 (2〜3週)**: オドメ利用ICP、区間エクスポート、性能最適化。
- **M3 (2〜3週)**: PWA/オフライン、エラーハンドリング、初期UX仕上げ。

## 既知リスク
- WASMでの大量メモリアロケーション/GC起因のジャitter。
- ブラウザ差（SafariのSIMD/SharedArrayBuffer制限など）。
- 多様なbagの形式/エンディアン問題。

## 将来拡張
- ループ閉じ/グラフ最適化の軽量導入、地図トリミング/合成。
- ROS2 `.db3`/`.mcap`対応、3D LIDARからの2D投影。
- 軽量共有（生成地図のPNG+YAML、設定JSON）

## オープン課題
- 代表bagに対する**基準設定**（分解能/閾値）のプリセット定義。
- `negate`の標準運用（表示は自由=白か占有=黒か）。
- 100×100mを超える地図のタイル化/スパース化戦略。
