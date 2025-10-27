/**
 * ROS Bag Map Generator - メインエントリーポイント
 *
 * このアプリケーションは、ROSバッグファイルから2D占有グリッド地図を生成します。
 * すべての処理はブラウザ内で完結し、バックエンドサーバーは不要です。
 */

import { initDropzone } from './ui/dropzone.js';
import { initTopicSelectors } from './ui/topicSelectors.js';
import { initPlaybackControls } from './ui/playbackControls.js';
import { initConfigPanel } from './ui/configPanel.js';
import { initToast } from './ui/toast.js';
import { AppState } from './ui/state.js';
import { createWorkerBridge } from './worker/bridge.js';

// ========================================
// アプリケーション状態とコア機能の初期化
// ========================================

/** アプリケーション全体の状態管理 */
const appState = new AppState();

/** トースト通知システム */
const toast = initToast(document.getElementById('toast'));

/** Web Workerブリッジ - バックグラウンド処理との通信 */
const workerBridge = createWorkerBridge({
  onPose: (pose, stamp) => appState.updatePose(stamp, pose),
  onGridFrame: (bitmap, stamp) => appState.updateGridFrame(stamp, bitmap),
  onStats: stats => appState.updateStats(stats),
  onExportDone: files => appState.handleExport(files, toast),
  onError: (code, message) => toast.show(`${code}: ${message}`, 'error')
});

// ========================================
// UIコンポーネントの初期化
// ========================================

// ファイルドロップゾーン - ROSバッグファイルの読み込み
initDropzone({
  element: document.getElementById('dropzone'),
  toast,
  onFile: file => {
    appState.setFile(file);
    workerBridge.openFile(file);
    toast.show(`${file.name} を読み込みました`, 'success');
  }
});

// トピック選択 - /scan, /odom, /tfの設定
initTopicSelectors({
  scan: document.getElementById('scan-topic'),
  odom: document.getElementById('odom-topic'),
  tf: document.getElementById('tf-topic'),
  applyButton: document.getElementById('apply-topics'),
  appState,
  onApply: topics => {
    workerBridge.setTopics(topics);
    toast.show('トピック設定を送信しました', 'info');
  }
});

// 地図設定パネル - 解像度、サイズ、間引き設定
initConfigPanel({
  resolution: document.getElementById('resolution'),
  width: document.getElementById('map-width'),
  height: document.getElementById('map-height'),
  downsample: document.getElementById('downsample'),
  applyButton: document.getElementById('apply-config'),
  appState,
  onSubmit: config => {
    workerBridge.sendConfig(config);
    toast.show('地図設定を更新しました', 'info');
  }
});

// 再生コントロール - 再生/一時停止/停止、エクスポート
initPlaybackControls({
  play: document.getElementById('play'),
  pause: document.getElementById('pause'),
  stop: document.getElementById('stop'),
  speed: document.getElementById('playback-speed'),
  markStart: document.getElementById('mark-start'),
  markEnd: document.getElementById('mark-end'),
  exportNow: document.getElementById('export-now'),
  exportRange: document.getElementById('export-range'),
  appState,
  toast,
  bridge: workerBridge
});

// ========================================
// キャンバス描画とリアルタイム更新
// ========================================

const canvas = document.getElementById('map-canvas');
const ctx = canvas.getContext('2d');

// 占有グリッドフレームの更新 - Workerから受信したImageBitmapを描画
appState.on('gridFrame', ({ imageBitmap }) => {
  console.log('[main] gridFrame event received, imageBitmap:', imageBitmap);

  if (!imageBitmap) {
    console.warn('[main] No imageBitmap provided');
    return;
  }

  // キャンバスサイズを画像に合わせて調整
  console.log('[main] Setting canvas size to:', imageBitmap.width, 'x', imageBitmap.height);
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;

  // 画像を描画
  console.log('[main] Drawing image to canvas');
  ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
  console.log('[main] Image drawn successfully');
});

// パフォーマンス統計の更新 - FPS、WASM実行時間、メモリ使用量
appState.on('stats', stats => {
  document.getElementById('fps').textContent = stats.fps.toFixed(1);
  document.getElementById('wasm-time').textContent = `${stats.wasmMs.toFixed(1)} ms`;
  document.getElementById('memory').textContent = `${stats.memMB.toFixed(0)} MB`;
});

// タイムスタンプの更新 - ロボットの現在位置の時刻
appState.on('pose', ({ stamp }) => {
  // マイクロ秒からミリ秒に変換してDateオブジェクトを作成
  const date = new Date(stamp / 1e6);
  const formatted = date.toISOString().split('T')[1]?.slice(0, -1) ?? '--:--:--';
  document.getElementById('timestamp').textContent = formatted;
});

// ========================================
// 初期表示 - プレースホルダー
// ========================================

// ファイルが読み込まれるまでのプレースホルダーメッセージを表示
ctx.fillStyle = '#111822';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = '#1f9d92';
ctx.font = '20px sans-serif';
ctx.fillText('ここにOccupancyGridが表示されます', 40, 60);
