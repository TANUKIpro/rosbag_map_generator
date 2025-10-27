/**
 * デバッグパネル - データフローの可視化
 *
 * Workerとの通信、トピック設定、GRID_FRAMEの受信状況を
 * リアルタイムで表示するデバッグツール
 */

const MAX_MESSAGES = 50; // 保持するメッセージの最大数

export class DebugPanel {
  constructor() {
    // DOM要素の取得
    this.panel = document.getElementById('debug-panel');
    this.toggleBtn = document.getElementById('debug-toggle');
    this.clearBtn = document.getElementById('debug-clear');
    this.messagesContainer = document.getElementById('debug-messages');

    // 状態表示要素
    this.fileEl = document.getElementById('debug-file');
    this.topicScanEl = document.getElementById('debug-topic-scan');
    this.topicOdomEl = document.getElementById('debug-topic-odom');
    this.topicTfEl = document.getElementById('debug-topic-tf');
    this.frameCountEl = document.getElementById('debug-frame-count');
    this.imageBitmapEl = document.getElementById('debug-imagebitmap');

    // 状態
    this.messages = [];
    this.frameCount = 0;
    this.isMinimized = false;

    // イベントリスナー設定
    this.toggleBtn.addEventListener('click', () => this.toggle());
    this.clearBtn.addEventListener('click', () => this.clear());
  }

  /**
   * パネルの表示/非表示を切り替え
   */
  toggle() {
    this.isMinimized = !this.isMinimized;
    this.panel.classList.toggle('minimized', this.isMinimized);
    this.toggleBtn.textContent = this.isMinimized ? '最大化' : '最小化';
  }

  /**
   * メッセージ履歴をクリア
   */
  clear() {
    this.messages = [];
    this.messagesContainer.innerHTML = '<div style="color: #888; text-align: center; padding: 1rem;">メッセージ履歴がクリアされました</div>';
  }

  /**
   * ファイル名を更新
   */
  updateFile(filename) {
    this.fileEl.textContent = filename || 'なし';
    this.logMessage('UI', `ファイル読み込み: ${filename}`);
  }

  /**
   * トピック設定を更新
   */
  updateTopics(topics) {
    this.topicScanEl.textContent = topics.scan || '未設定';
    this.topicOdomEl.textContent = topics.odom || '未設定';
    this.topicTfEl.textContent = topics.tf || '未設定';
    this.logMessage('UI', `トピック設定: scan=${topics.scan}, odom=${topics.odom}, tf=${topics.tf}`);
  }

  /**
   * GRID_FRAMEの受信を記録
   */
  recordGridFrame(imageBitmap) {
    this.frameCount++;
    this.frameCountEl.textContent = this.frameCount.toString();

    if (imageBitmap) {
      this.imageBitmapEl.textContent = `${imageBitmap.width}x${imageBitmap.height}`;
      this.logMessage('CANVAS', `GRID_FRAME描画: ${imageBitmap.width}x${imageBitmap.height}px`);
    } else {
      this.imageBitmapEl.textContent = 'null/undefined';
      this.logMessage('CANVAS', 'GRID_FRAME受信: imageBitmapがnull', 'error');
    }
  }

  /**
   * Workerからのメッセージを記録
   */
  recordWorkerMessage(type, data) {
    let message = `Worker → UI: ${type}`;

    switch (type) {
      case 'POSE':
        message += ` (x=${data.pose?.x?.toFixed(2)}, y=${data.pose?.y?.toFixed(2)})`;
        break;
      case 'GRID_FRAME':
        message += ` (${data.imageBitmap ? 'imageBitmap OK' : 'imageBitmap MISSING'})`;
        break;
      case 'STATS':
        message += ` (fps=${data.stats?.fps?.toFixed(1)})`;
        break;
      case 'ERROR':
        message += ` (${data.code}: ${data.message})`;
        break;
    }

    this.logMessage('WORKER', message);
  }

  /**
   * UIからWorkerへのメッセージを記録
   */
  recordBridgeMessage(type, data) {
    let message = `UI → Worker: ${type}`;

    switch (type) {
      case 'OPEN':
        message += ` (${data?.name})`;
        break;
      case 'SET_TOPICS':
        message += ` (scan=${data?.scan})`;
        break;
      case 'CONFIG':
        message += ` (resolution=${data?.resolution})`;
        break;
      case 'PLAY':
        message += ` (speed=${data?.speed || 1})`;
        break;
    }

    this.logMessage('BRIDGE', message);
  }

  /**
   * メッセージをログに追加
   */
  logMessage(source, text, level = 'info') {
    const timestamp = new Date().toLocaleTimeString('ja-JP', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });

    const message = {
      timestamp,
      source,
      text,
      level
    };

    this.messages.unshift(message);

    // 最大件数を超えたら古いメッセージを削除
    if (this.messages.length > MAX_MESSAGES) {
      this.messages = this.messages.slice(0, MAX_MESSAGES);
    }

    this.renderMessages();
  }

  /**
   * メッセージ履歴を再描画
   */
  renderMessages() {
    if (this.messages.length === 0) {
      this.messagesContainer.innerHTML = '<div style="color: #888; text-align: center; padding: 1rem;">メッセージがまだありません</div>';
      return;
    }

    // 最新10件のみ表示
    const recentMessages = this.messages.slice(0, 10);

    this.messagesContainer.innerHTML = recentMessages.map(msg => {
      const sourceClass = msg.source.toLowerCase();
      return `
        <div class="debug-message type-${sourceClass}">
          <span class="timestamp">${msg.timestamp}</span>
          <span class="type">[${msg.source}]</span>
          <span class="text">${msg.text}</span>
        </div>
      `;
    }).join('');

    // 自動スクロール
    this.messagesContainer.scrollTop = 0;
  }
}
