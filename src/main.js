/**
 * ROS Bag Map Generator - メインエントリーポイント
 *
 * このアプリケーションは、ROSバッグファイルから2D占有グリッド地図を生成します。
 * すべての処理はブラウザ内で完結し、バックエンドサーバーは不要です。
 */

import { initDropzone } from './ui/dropzone.js';
import { initTopicSelectors } from './ui/topicSelectors.js';
import { initPlaybackControls } from './ui/playbackControls.js';
// import { initConfigPanel } from './ui/configPanel.js'; // Removed: using fixed config values
import { initToast } from './ui/toast.js';
import { AppState } from './ui/state.js';
import { createWorkerBridge } from './worker/bridge.js';
import { DebugPanel } from './ui/debugPanel.js';

// ========================================
// アプリケーション状態とコア機能の初期化
// ========================================

/** アプリケーション全体の状態管理 */
const appState = new AppState();

/** トースト通知システム */
const toast = initToast(document.getElementById('toast'));

/** デバッグパネル */
const debugPanel = new DebugPanel();

console.log('[main] Initializing worker bridge...');
debugPanel.logMessage('UI', 'アプリケーション初期化開始');

/** Web Workerブリッジ - バックグラウンド処理との通信 */
const workerBridge = createWorkerBridge({
  onTopicsAvailable: (topics) => {
    console.log('[main] Topics available:', topics);
    debugPanel.recordAvailableTopics(topics);
    appState.setAvailableTopics(topics);
    toast.show(`${topics.length}個のトピックを検出しました`, 'success');
  },
  onPose: (pose, stamp) => {
    debugPanel.recordWorkerMessage('POSE', { pose, stamp });
    appState.updatePose(stamp, pose);
  },
  onGridFrame: (bitmap, stamp) => {
    debugPanel.recordWorkerMessage('GRID_FRAME', { imageBitmap: bitmap, stamp });
    appState.updateGridFrame(stamp, bitmap);
  },
  onStats: stats => {
    debugPanel.recordWorkerMessage('STATS', { stats });
    appState.updateStats(stats);
  },
  onExportDone: files => {
    debugPanel.recordWorkerMessage('EXPORT_DONE', { files });
    appState.handleExport(files, toast);
  },
  onError: (code, message) => {
    debugPanel.recordWorkerMessage('ERROR', { code, message });
    toast.show(`${code}: ${message}`, 'error');
  }
}, debugPanel);

console.log('[main] Worker bridge created');
debugPanel.logMessage('UI', 'Worker bridge初期化完了');

// ========================================
// UIコンポーネントの初期化
// ========================================

// ファイルドロップゾーン - ROSバッグファイルの読み込み
initDropzone({
  element: document.getElementById('dropzone'),
  toast,
  onFile: file => {
    appState.setFile(file);
    debugPanel.updateFile(file.name);
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
    debugPanel.updateTopics(topics);
    workerBridge.setTopics(topics);
    toast.show('トピック設定を送信しました', 'info');
  }
});

// 地図設定パネル - 削除（固定値を使用）
// Config panel removed - using fixed optimal values in worker

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

// ズーム機能の状態管理
let zoomLevel = 1.0;
let currentImageBitmap = null;
let panOffset = { x: 0, y: 0 };
let isDragging = false;
let lastMousePos = { x: 0, y: 0 };

// ズームレベル表示を更新
function updateZoomDisplay() {
  const zoomLevelElement = document.getElementById('zoom-level');
  if (zoomLevelElement) {
    zoomLevelElement.textContent = `${Math.round(zoomLevel * 100)}%`;
  }
}

// キャンバスを再描画
function redrawCanvas() {
  if (!currentImageBitmap) return;

  // キャンバスのクリア
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 変換をリセット
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // 中心を基準にズーム
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  // 変換を適用
  ctx.translate(centerX + panOffset.x, centerY + panOffset.y);
  ctx.scale(zoomLevel, zoomLevel);
  ctx.translate(-centerX, -centerY);

  // 画像を描画
  ctx.drawImage(currentImageBitmap, 0, 0, canvas.width, canvas.height);
}

// 占有グリッドフレームの更新 - Workerから受信したImageBitmapを描画
appState.on('gridFrame', ({ imageBitmap }) => {
  console.log('[main] gridFrame event received, imageBitmap:', imageBitmap);

  // デバッグパネルに記録
  debugPanel.recordGridFrame(imageBitmap);

  if (!imageBitmap) {
    console.warn('[main] No imageBitmap provided');
    debugPanel.logMessage('CANVAS', 'ERROR: imageBitmapがnullです', 'error');
    return;
  }

  // キャンバスサイズを画像に合わせて調整
  console.log('[main] Setting canvas size to:', imageBitmap.width, 'x', imageBitmap.height);
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;

  // 現在のImageBitmapを保存
  currentImageBitmap = imageBitmap;

  // 画像を描画
  console.log('[main] Drawing image to canvas');
  try {
    redrawCanvas();
    console.log('[main] Image drawn successfully');
    debugPanel.logMessage('CANVAS', `描画成功: ${canvas.width}x${canvas.height}`, 'success');
  } catch (error) {
    console.error('[main] Failed to draw image:', error);
    debugPanel.logMessage('CANVAS', `描画失敗: ${error.message}`, 'error');
  }
});

// マウスホイールでズーム
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();

  const zoomSpeed = 0.1;
  const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;

  zoomLevel = Math.max(0.1, Math.min(5.0, zoomLevel + delta));

  updateZoomDisplay();
  redrawCanvas();
});

// マウスドラッグでパン
canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  lastMousePos = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDragging) return;

  const dx = e.clientX - lastMousePos.x;
  const dy = e.clientY - lastMousePos.y;

  panOffset.x += dx;
  panOffset.y += dy;

  lastMousePos = { x: e.clientX, y: e.clientY };

  redrawCanvas();
});

canvas.addEventListener('mouseup', () => {
  isDragging = false;
});

canvas.addEventListener('mouseleave', () => {
  isDragging = false;
});

// パフォーマンス統計の更新 - FPS、WASM実行時間、メモリ使用量
appState.on('stats', stats => {
  document.getElementById('fps').textContent = stats.fps.toFixed(1);
  document.getElementById('wasm-time').textContent = `${stats.wasmMs.toFixed(1)} ms`;
  document.getElementById('memory').textContent = `${stats.memMB.toFixed(0)} MB`;

  // フレーム情報の更新（再生中のみ）
  if (stats.currentFrame !== undefined && stats.totalFrames !== undefined) {
    document.getElementById('frame-info').textContent = `${stats.currentFrame}/${stats.totalFrames}`;
  }
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
