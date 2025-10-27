import { initDropzone } from './ui/dropzone.js';
import { initTopicSelectors } from './ui/topicSelectors.js';
import { initPlaybackControls } from './ui/playbackControls.js';
import { initConfigPanel } from './ui/configPanel.js';
import { initToast } from './ui/toast.js';
import { AppState } from './ui/state.js';
import { createWorkerBridge } from './worker/bridge.js';

const appState = new AppState();
const toast = initToast(document.getElementById('toast'));

const workerBridge = createWorkerBridge({
  onPose: (pose, stamp) => appState.updatePose(stamp, pose),
  onGridFrame: (bitmap, stamp) => appState.updateGridFrame(stamp, bitmap),
  onStats: stats => appState.updateStats(stats),
  onExportDone: files => appState.handleExport(files, toast),
  onError: (code, message) => toast.show(`${code}: ${message}`, 'error')
});

initDropzone({
  element: document.getElementById('dropzone'),
  toast,
  onFile: file => {
    appState.setFile(file);
    workerBridge.openFile(file);
    toast.show(`${file.name} を読み込みました`, 'success');
  }
});

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

const canvas = document.getElementById('map-canvas');
const ctx = canvas.getContext('2d');

appState.on('gridFrame', ({ imageBitmap }) => {
  if (!imageBitmap) return;
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;
  ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
});

appState.on('stats', stats => {
  document.getElementById('fps').textContent = stats.fps.toFixed(1);
  document.getElementById('wasm-time').textContent = `${stats.wasmMs.toFixed(1)} ms`;
  document.getElementById('memory').textContent = `${stats.memMB.toFixed(0)} MB`;
});

appState.on('pose', ({ stamp }) => {
  const date = new Date(stamp / 1e6);
  const formatted = date.toISOString().split('T')[1]?.slice(0, -1) ?? '--:--:--';
  document.getElementById('timestamp').textContent = formatted;
});

// Kick off with placeholder grid for visual feedback.
ctx.fillStyle = '#111822';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = '#1f9d92';
ctx.font = '20px sans-serif';
ctx.fillText('ここにOccupancyGridが表示されます', 40, 60);
