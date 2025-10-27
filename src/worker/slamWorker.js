// ========================================
// Worker State Management
// ========================================
let currentFile = null;
let topics = { scan: '/scan', odom: '/odom', tf: '/tf' };
let config = { resolution: 0.05, width: 2000, height: 2000, downsample: 1 };
let isPlaying = false;
let playbackSpeed = 1.0;

self.addEventListener('message', async event => {
  const { type } = event.data;
  console.log('[worker] Received message:', type, event.data);

  switch (type) {
    case 'OPEN':
      await handleOpenFile(event.data.file);
      break;
    case 'SET_TOPICS':
      handleSetTopics(event.data);
      break;
    case 'CONFIG':
      handleConfig(event.data.config);
      break;
    case 'PLAY':
      handlePlay(event.data.speed);
      break;
    case 'PAUSE':
      handlePause();
      break;
    case 'STOP':
      handleStop();
      break;
    case 'SET_SPEED':
      handleSetSpeed(event.data.speed);
      break;
    case 'MARK_START':
    case 'MARK_END':
      console.debug('[worker]', type, event.data);
      break;
    case 'EXPORT_NOW':
    case 'EXPORT_RANGE':
      fakeExport();
      break;
    default:
      console.warn('[worker] Unknown message', event.data);
  }
});

// ========================================
// File Handling
// ========================================
async function handleOpenFile(file) {
  console.log('[worker] Opening file:', file?.name, 'size:', file?.size);
  currentFile = file;

  if (!file) {
    console.error('[worker] No file provided');
    self.postMessage({ type: 'ERROR', code: 'NO_FILE', message: 'ファイルが提供されませんでした' });
    return;
  }

  // Send initial stats
  self.postMessage({ type: 'STATS', stats: { fps: 0, wasmMs: 0, memMB: estimateMemoryMB() } });

  // Generate a test map to verify the pipeline
  console.log('[worker] Generating test map...');
  await generateTestMap();
}

// ========================================
// Topic and Config Handling
// ========================================
function handleSetTopics(data) {
  console.log('[worker] Setting topics:', data);
  topics = {
    scan: data.scan || topics.scan,
    odom: data.odom || topics.odom,
    tf: data.tf || topics.tf
  };
  console.log('[worker] Topics updated:', topics);
}

function handleConfig(newConfig) {
  console.log('[worker] Updating config:', newConfig);
  config = { ...config, ...newConfig };
  console.log('[worker] Config updated:', config);
}

// ========================================
// Playback Control
// ========================================
function handlePlay(speed) {
  console.log('[worker] Play requested, speed:', speed);
  isPlaying = true;
  playbackSpeed = speed || playbackSpeed;

  // Start generating test frames
  startTestAnimation();
}

function handlePause() {
  console.log('[worker] Pause requested');
  isPlaying = false;
}

function handleStop() {
  console.log('[worker] Stop requested');
  isPlaying = false;
}

function handleSetSpeed(speed) {
  console.log('[worker] Speed change:', speed);
  playbackSpeed = speed;
}

// ========================================
// Test Map Generation
// ========================================
async function generateTestMap() {
  console.log('[worker] Creating test map canvas...');

  const width = 400;
  const height = 400;

  // Create an OffscreenCanvas for generating the test map
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Draw a test pattern
  // Background (unknown space - gray)
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, width, height);

  // Free space (white)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(50, 50, 300, 300);

  // Obstacles (black)
  ctx.fillStyle = '#000000';
  // Border walls
  ctx.fillRect(50, 50, 300, 10); // top wall
  ctx.fillRect(50, 340, 300, 10); // bottom wall
  ctx.fillRect(50, 50, 10, 300); // left wall
  ctx.fillRect(340, 50, 10, 300); // right wall

  // Some obstacles in the middle
  ctx.fillRect(150, 150, 50, 50);
  ctx.fillRect(250, 200, 40, 80);

  // Add text to indicate it's a test map
  ctx.fillStyle = '#FF0000';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('TEST MAP', 150, 30);

  console.log('[worker] Converting canvas to ImageBitmap...');
  const imageBitmap = await canvas.transferToImageBitmap();

  console.log('[worker] Sending GRID_FRAME message...');
  const stamp = Date.now() * 1000; // Convert to microseconds
  self.postMessage({
    type: 'GRID_FRAME',
    imageBitmap: imageBitmap,
    stamp: stamp
  }, [imageBitmap]);

  console.log('[worker] Test map sent successfully');

  // Send test pose
  self.postMessage({
    type: 'POSE',
    pose: { x: 200, y: 200, theta: 0 },
    stamp: stamp
  });

  // Update stats
  self.postMessage({
    type: 'STATS',
    stats: { fps: 30, wasmMs: 5.2, memMB: estimateMemoryMB() }
  });
}

// ========================================
// Test Animation (for play mode)
// ========================================
let animationFrameCount = 0;
async function startTestAnimation() {
  if (!isPlaying) return;

  animationFrameCount++;
  console.log('[worker] Animation frame:', animationFrameCount);

  const width = 400;
  const height = 400;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, width, height);

  // Free space
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(50, 50, 300, 300);

  // Animated obstacle
  const offsetX = (animationFrameCount * 5) % 200;
  ctx.fillStyle = '#000000';
  ctx.fillRect(100 + offsetX, 150, 50, 50);

  // Frame counter
  ctx.fillStyle = '#FF0000';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(`Frame ${animationFrameCount}`, 140, 30);

  const imageBitmap = await canvas.transferToImageBitmap();
  const stamp = Date.now() * 1000;

  self.postMessage({
    type: 'GRID_FRAME',
    imageBitmap: imageBitmap,
    stamp: stamp
  }, [imageBitmap]);

  self.postMessage({
    type: 'POSE',
    pose: { x: 100 + offsetX, y: 150, theta: 0 },
    stamp: stamp
  });

  self.postMessage({
    type: 'STATS',
    stats: {
      fps: 30,
      wasmMs: 5.2 + Math.random() * 2,
      memMB: estimateMemoryMB()
    }
  });

  // Continue animation
  setTimeout(() => startTestAnimation(), 100 / playbackSpeed);
}

function fakeExport() {
  const pgmHeader = 'P5\n2 2\n255\n';
  const pgmBody = new Uint8Array([0, 127, 200, 255]);
  const pgmBlob = new Blob([pgmHeader, pgmBody], { type: 'image/x-portable-graymap' });
  const yamlContent = `image: map.pgm\nresolution: 0.05\norigin: [0, 0, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n`;
  const yamlBlob = new Blob([yamlContent], { type: 'text/yaml' });
  self.postMessage({ type: 'EXPORT_DONE', files: { pgm: pgmBlob, yaml: yamlBlob } });
}

function estimateMemoryMB() {
  if (self.performance && self.performance.memory) {
    return self.performance.memory.usedJSHeapSize / (1024 * 1024);
  }
  return 0;
}
