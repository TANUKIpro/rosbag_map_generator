// ========================================
// Imports
// ========================================
import { parseRosbagTopics, extractMessages, decodeLaserScan } from './rosbagParser.js';

// ========================================
// Utility Functions (defined first)
// ========================================
function estimateMemoryMB() {
  try {
    if (self.performance && self.performance.memory) {
      return self.performance.memory.usedJSHeapSize / (1024 * 1024);
    }
  } catch (e) {
    console.warn('[worker] Memory estimation not available:', e);
  }
  return 0;
}

// Send log messages to UI for debugging
function sendLog(level, message, data = null) {
  console.log(`[worker] ${level}: ${message}`, data || '');
  self.postMessage({
    type: 'DEBUG_LOG',
    level: level,
    message: message,
    data: data,
    timestamp: Date.now()
  });
}

// ========================================
// Worker State Management
// ========================================
console.log('[worker] ========================================');
console.log('[worker] Worker script loaded and initialized');
console.log('[worker] ========================================');

// Send initialization log
sendLog('INFO', 'Worker initialized and ready');

let currentFile = null;
let topics = { scan: '/scan', odom: '/odom', tf: '/tf' };
// Fixed config values for optimal map generation
// resolution: 0.05 m/pixel (5cm per pixel)
// Map size: 1000x1000 pixels = 50m x 50m physical size
let config = { resolution: 0.05, width: 1000, height: 1000 };
let isPlaying = false;
let playbackSpeed = 1.0;
let scanMessages = [];
let currentMessageIndex = 0;
let playbackTimer = null;

self.addEventListener('message', async event => {
  const { type } = event.data;
  console.log('[worker] Received message:', type, event.data);

  try {

  switch (type) {
    case 'OPEN':
      await handleOpenFile(event.data.file);
      break;
    case 'SET_TOPICS':
      handleSetTopics(event.data);
      break;
    case 'CONFIG':
      // Config changes disabled - using fixed values
      console.log('[worker] CONFIG message ignored - using fixed config values');
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
  } catch (error) {
    console.error('[worker] Error handling message:', error);
    self.postMessage({
      type: 'ERROR',
      code: 'WORKER_ERROR',
      message: `Worker error: ${error.message}`
    });
  }
});

// ========================================
// File Handling
// ========================================
async function handleOpenFile(file) {
  sendLog('INFO', '========== handleOpenFile START ==========');
  sendLog('INFO', `File received - name: ${file?.name}, size: ${file?.size}, type: ${typeof file}`);

  currentFile = file;

  if (!file) {
    sendLog('ERROR', 'No file provided');
    self.postMessage({ type: 'ERROR', code: 'NO_FILE', message: 'ファイルが提供されませんでした' });
    return;
  }

  try {
    // Send initial stats
    sendLog('INFO', 'Sending initial STATS message');
    self.postMessage({ type: 'STATS', stats: { fps: 0, wasmMs: 0, memMB: estimateMemoryMB() } });

    // Parse rosbag file to extract topics
    sendLog('INFO', 'Parsing rosbag file to extract topics...');
    const availableTopics = await parseRosbagTopics(file);
    sendLog('INFO', `Found ${availableTopics.length} topics in rosbag file`);

    // Send topics to UI
    self.postMessage({
      type: 'TOPICS_AVAILABLE',
      topics: availableTopics
    });
    sendLog('INFO', 'Topics sent to UI');

    // Log each topic
    availableTopics.forEach(topic => {
      sendLog('INFO', `  - ${topic.name} (${topic.type}) - ${topic.messageCount} messages`);
    });

    sendLog('INFO', 'File loaded successfully. Waiting for user to select topics...');
  } catch (error) {
    sendLog('ERROR', `Error in handleOpenFile: ${error.message}`, error.stack);
    self.postMessage({
      type: 'ERROR',
      code: 'FILE_OPEN_ERROR',
      message: `ファイルオープンエラー: ${error.message}`
    });
  }

  sendLog('INFO', '========== handleOpenFile END ==========');
}

// ========================================
// Topic and Config Handling
// ========================================
async function handleSetTopics(data) {
  sendLog('INFO', '========== handleSetTopics START ==========');
  console.log('[worker] Setting topics:', data);

  topics = {
    scan: data.scan || topics.scan,
    odom: data.odom || topics.odom,
    tf: data.tf || topics.tf
  };

  sendLog('INFO', `Topics updated: scan=${topics.scan}, odom=${topics.odom}, tf=${topics.tf}`);
  console.log('[worker] Topics updated:', topics);

  // Generate map from selected scan topic
  if (currentFile && topics.scan) {
    try {
      sendLog('INFO', `Extracting messages from scan topic: ${topics.scan}`);
      const messages = await extractMessages(currentFile, topics.scan);
      sendLog('INFO', `Extracted ${messages.length} messages from ${topics.scan}`);

      if (messages.length > 0) {
        // Store messages for playback
        scanMessages = messages;
        currentMessageIndex = 0;
        sendLog('INFO', `Stored ${scanMessages.length} messages for playback`);

        sendLog('INFO', 'Generating initial map from LaserScan data...');
        await generateMapFromLaserScans(messages);
        sendLog('INFO', 'Map generation completed successfully');
      } else {
        sendLog('WARN', 'No messages found in selected scan topic');
        self.postMessage({
          type: 'ERROR',
          code: 'NO_MESSAGES',
          message: '選択されたスキャントピックにメッセージが見つかりません'
        });
      }
    } catch (error) {
      sendLog('ERROR', `Error generating map: ${error.message}`, error.stack);
      self.postMessage({
        type: 'ERROR',
        code: 'MAP_GENERATION_ERROR',
        message: `マップ生成エラー: ${error.message}`
      });
    }
  } else {
    if (!currentFile) {
      sendLog('WARN', 'No file loaded');
    }
    if (!topics.scan) {
      sendLog('WARN', 'No scan topic selected');
    }
  }

  sendLog('INFO', '========== handleSetTopics END ==========');
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

  if (scanMessages.length === 0) {
    sendLog('WARN', 'No messages available for playback. Please load a file and select topics first.');
    return;
  }

  playbackSpeed = speed || playbackSpeed;
  isPlaying = true;
  sendLog('INFO', `Playback started at ${playbackSpeed}x speed`);
  sendLog('INFO', `Total messages available: ${scanMessages.length}`);

  // DEBUG: Display the last frame immediately for testing
  sendLog('INFO', '[DEBUG] Rendering last frame for testing...');
  renderFrameAtIndex(scanMessages.length - 1);

  // Start playback loop
  // startPlaybackLoop();
}

function handlePause() {
  console.log('[worker] Pause requested');
  sendLog('INFO', 'Playback paused');
  isPlaying = false;

  // Clear timer if running
  if (playbackTimer !== null) {
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }
}

function handleStop() {
  console.log('[worker] Stop requested');
  sendLog('INFO', 'Playback stopped');
  isPlaying = false;
  currentMessageIndex = 0;

  // Clear timer if running
  if (playbackTimer !== null) {
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }

  // Reset to initial state - regenerate full map
  if (scanMessages.length > 0) {
    generateMapFromLaserScans(scanMessages);
  }
}

function handleSetSpeed(speed) {
  console.log('[worker] Speed change:', speed);
  playbackSpeed = speed;
  sendLog('INFO', `Playback speed changed to ${speed}x`);
}

// ========================================
// Playback Loop
// ========================================
async function startPlaybackLoop() {
  sendLog('INFO', `[DEBUG] startPlaybackLoop called - isPlaying: ${isPlaying}, currentMessageIndex: ${currentMessageIndex}, total: ${scanMessages.length}`);

  if (!isPlaying || scanMessages.length === 0) {
    sendLog('WARN', `[DEBUG] Exiting playback loop - isPlaying: ${isPlaying}, messages: ${scanMessages.length}`);
    return;
  }

  try {
    await renderFrameAtIndex(currentMessageIndex);

    // Move to next message
    currentMessageIndex++;

    // Check if we've reached the end
    if (currentMessageIndex >= scanMessages.length) {
      sendLog('INFO', 'Playback completed - reached end of messages');
      handleStop();
      return;
    }

    // Calculate delay until next frame
    if (isPlaying && currentMessageIndex < scanMessages.length) {
      const currentMsg = scanMessages[currentMessageIndex - 1];
      const nextMsg = scanMessages[currentMessageIndex];

      // Calculate time difference in milliseconds
      const timeDiff = (nextMsg.timestamp - currentMsg.timestamp) / 1000000; // nanoseconds to milliseconds

      sendLog('INFO', `[DEBUG] Frame ${currentMessageIndex}/${scanMessages.length} - timeDiff: ${timeDiff.toFixed(2)}ms, delay: ${(timeDiff / playbackSpeed).toFixed(2)}ms`);

      // Adjust for playback speed
      const delay = Math.max(1, timeDiff / playbackSpeed);

      // Schedule next frame
      playbackTimer = setTimeout(() => {
        startPlaybackLoop();
      }, delay);
    }
  } catch (error) {
    sendLog('ERROR', `Error during playback: ${error.message}`, error.stack);
    handleStop();
  }
}

async function renderFrameAtIndex(index) {
  if (index < 0 || index >= scanMessages.length) {
    return;
  }

  const startTime = performance.now();

  // Get messages up to current index for progressive map building
  const messagesToRender = scanMessages.slice(0, index + 1);

  // Map configuration
  const resolution = config.resolution;
  const mapWidth = config.width;
  const mapHeight = config.height;

  // Create occupancy grid
  const grid = new Uint8Array(mapWidth * mapHeight);
  grid.fill(200); // Initialize as unknown (dark gray)

  // Robot starts at center of map
  const robotX = mapWidth / 2;
  const robotY = mapHeight / 2;

  // Process messages to build progressive map
  for (const msg of messagesToRender) {
    try {
      const scan = decodeLaserScan(msg.data);

      // Convert scan points to grid coordinates
      for (let i = 0; i < scan.ranges.length; i++) {
        const range = scan.ranges[i];

        if (range < scan.range_min || range > scan.range_max || isNaN(range) || !isFinite(range)) {
          continue;
        }

        const angle = scan.angle_min + i * scan.angle_increment;
        const x = range * Math.cos(angle);
        const y = range * Math.sin(angle);

        const gridX = Math.floor(robotX + x / resolution);
        const gridY = Math.floor(robotY - y / resolution);

        if (gridX >= 0 && gridX < mapWidth && gridY >= 0 && gridY < mapHeight) {
          const gridIndex = gridY * mapWidth + gridX;
          grid[gridIndex] = 0; // Mark as occupied (will be shown as red)
        }
      }
    } catch (e) {
      console.warn('[worker] Error processing scan in playback:', e);
    }
  }

  // Create canvas and draw map
  const canvas = new OffscreenCanvas(mapWidth, mapHeight);
  const ctx = canvas.getContext('2d');

  // Create ImageData from grid
  const imageData = ctx.createImageData(mapWidth, mapHeight);
  for (let i = 0; i < grid.length; i++) {
    const value = grid[i];
    let r, g, b;
    if (value === 0) {
      // Occupied (obstacle) - RED for visibility
      r = 255;
      g = 0;
      b = 0;
    } else if (value === 128) {
      // Free space - WHITE
      r = 255;
      g = 255;
      b = 255;
    } else {
      // Unknown - DARK GRAY
      r = 50;
      g = 50;
      b = 50;
    }

    const pixelIndex = i * 4;
    imageData.data[pixelIndex] = r;     // R
    imageData.data[pixelIndex + 1] = g; // G
    imageData.data[pixelIndex + 2] = b; // B
    imageData.data[pixelIndex + 3] = 255; // A
  }

  ctx.putImageData(imageData, 0, 0);

  // Draw robot position (YELLOW to distinguish from obstacles)
  ctx.fillStyle = '#FFFF00';
  ctx.beginPath();
  ctx.arc(robotX, robotY, 10, 0, 2 * Math.PI);
  ctx.fill();

  // Convert to ImageBitmap
  const imageBitmap = canvas.transferToImageBitmap();

  const currentMsg = scanMessages[index];
  const stamp = currentMsg.timestamp;

  // Send frame to UI
  self.postMessage({
    type: 'GRID_FRAME',
    imageBitmap: imageBitmap,
    stamp: stamp
  }, [imageBitmap]);

  // Send pose update
  self.postMessage({
    type: 'POSE',
    pose: { x: robotX, y: robotY, theta: 0 },
    stamp: stamp
  });

  // Calculate and send stats
  const endTime = performance.now();
  const renderTime = endTime - startTime;
  const fps = 1000 / renderTime;

  self.postMessage({
    type: 'STATS',
    stats: {
      fps: Math.round(fps),
      wasmMs: renderTime,  // Send as number, not string
      memMB: estimateMemoryMB(),
      currentFrame: index + 1,
      totalFrames: scanMessages.length
    }
  });
}

// ========================================
// Map Generation from LaserScan Data
// ========================================
async function generateMapFromLaserScans(messages) {
  sendLog('INFO', '========== generateMapFromLaserScans START ==========');

  try {
    // Map configuration
    const resolution = config.resolution; // meters per pixel
    const mapWidth = config.width;
    const mapHeight = config.height;

    sendLog('INFO', `Map config: ${mapWidth}x${mapHeight}, resolution: ${resolution}m/pixel`);

    // Create occupancy grid (0=occupied/obstacle, 128=free, 200=unknown)
    const grid = new Uint8Array(mapWidth * mapHeight);
    grid.fill(200); // Initialize as unknown (dark gray)

    // Robot starts at center of map
    const robotX = mapWidth / 2;
    const robotY = mapHeight / 2;

    sendLog('INFO', `Processing ${messages.length} LaserScan messages...`);

    // Process each LaserScan message
    let processedCount = 0;
    for (const msg of messages) {
      try {
        // Decode LaserScan message
        const scan = decodeLaserScan(msg.data);

        // Convert scan points to grid coordinates
        for (let i = 0; i < scan.ranges.length; i++) {
          const range = scan.ranges[i];

          // Skip invalid ranges
          if (range < scan.range_min || range > scan.range_max || isNaN(range) || !isFinite(range)) {
            continue;
          }

          // Calculate angle for this range reading
          const angle = scan.angle_min + i * scan.angle_increment;

          // Convert polar to Cartesian coordinates (in meters)
          const x = range * Math.cos(angle);
          const y = range * Math.sin(angle);

          // Convert to grid coordinates
          const gridX = Math.floor(robotX + x / resolution);
          const gridY = Math.floor(robotY - y / resolution); // Invert Y for image coordinates

          // Mark as occupied if within bounds
          if (gridX >= 0 && gridX < mapWidth && gridY >= 0 && gridY < mapHeight) {
            const index = gridY * mapWidth + gridX;
            grid[index] = 0; // Mark as occupied (will be shown as red)
          }
        }

        processedCount++;

        // Log progress every 50 messages
        if (processedCount % 50 === 0) {
          sendLog('INFO', `Processed ${processedCount}/${messages.length} scans`);
        }
      } catch (e) {
        console.warn('[worker] Error processing LaserScan message:', e);
      }
    }

    sendLog('INFO', `Finished processing ${processedCount} LaserScan messages`);

    // Create canvas and draw map
    sendLog('INFO', 'Creating canvas and drawing map...');
    const canvas = new OffscreenCanvas(mapWidth, mapHeight);
    const ctx = canvas.getContext('2d');

    // Create ImageData from grid
    const imageData = ctx.createImageData(mapWidth, mapHeight);
    for (let i = 0; i < grid.length; i++) {
      const value = grid[i];
      // Convert occupancy values to RGB
      let r, g, b;
      if (value === 0) {
        // Occupied (obstacle) - RED for visibility
        r = 255;
        g = 0;
        b = 0;
      } else if (value === 128) {
        // Free space - WHITE
        r = 255;
        g = 255;
        b = 255;
      } else {
        // Unknown - DARK GRAY
        r = 50;
        g = 50;
        b = 50;
      }

      const pixelIndex = i * 4;
      imageData.data[pixelIndex] = r;     // R
      imageData.data[pixelIndex + 1] = g; // G
      imageData.data[pixelIndex + 2] = b; // B
      imageData.data[pixelIndex + 3] = 255; // A
    }

    ctx.putImageData(imageData, 0, 0);

    // Draw robot position (YELLOW to distinguish from obstacles)
    ctx.fillStyle = '#FFFF00';
    ctx.beginPath();
    ctx.arc(robotX, robotY, 10, 0, 2 * Math.PI);
    ctx.fill();

    sendLog('INFO', 'Converting canvas to ImageBitmap...');
    const imageBitmap = canvas.transferToImageBitmap();

    const stamp = Date.now() * 1000;

    sendLog('INFO', 'Sending GRID_FRAME message...');
    self.postMessage({
      type: 'GRID_FRAME',
      imageBitmap: imageBitmap,
      stamp: stamp
    }, [imageBitmap]);

    sendLog('INFO', 'Sending POSE message...');
    self.postMessage({
      type: 'POSE',
      pose: { x: robotX, y: robotY, theta: 0 },
      stamp: stamp
    });

    sendLog('INFO', 'Sending STATS update...');
    self.postMessage({
      type: 'STATS',
      stats: { fps: 0, wasmMs: 0, memMB: estimateMemoryMB() }
    });

    sendLog('INFO', '========== generateMapFromLaserScans END (SUCCESS) ==========');
  } catch (error) {
    sendLog('ERROR', `generateMapFromLaserScans ERROR: ${error.message}`, error.stack);
    self.postMessage({
      type: 'ERROR',
      code: 'MAP_GENERATION_ERROR',
      message: `マップ生成エラー: ${error.message}`
    });
  }
}

function fakeExport() {
  const pgmHeader = 'P5\n2 2\n255\n';
  const pgmBody = new Uint8Array([0, 127, 200, 255]);
  const pgmBlob = new Blob([pgmHeader, pgmBody], { type: 'image/x-portable-graymap' });
  const yamlContent = `image: map.pgm\nresolution: 0.05\norigin: [0, 0, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n`;
  const yamlBlob = new Blob([yamlContent], { type: 'text/yaml' });
  self.postMessage({ type: 'EXPORT_DONE', files: { pgm: pgmBlob, yaml: yamlBlob } });
}

// ========================================
// Worker Ready Signal
// ========================================
console.log('[worker] Sending ready signal...');
try {
  self.postMessage({
    type: 'STATS',
    stats: { fps: 0, wasmMs: 0, memMB: estimateMemoryMB() }
  });
  console.log('[worker] Ready signal sent successfully');
} catch (error) {
  console.error('[worker] Failed to send ready signal:', error);
}
