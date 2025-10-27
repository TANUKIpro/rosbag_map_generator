/**
 * トピック選択コンポーネント
 *
 * ROSバッグファイルから読み取るトピックを選択するUI
 * - /scan トピック（必須）: LiDARスキャンデータ
 * - /odom トピック（オプション）: オドメトリデータ
 * - /tf トピック（オプション）: 座標変換データ
 */

/** プレースホルダーのトピックオプション */
const PLACEHOLDER_OPTIONS = {
  scan: ['/scan', '/lidar/scan'],
  odom: ['/odom', '/base_pose_ground_truth'],
  tf: ['/tf', '/tf_static']
};

/** オプションのトピックで未使用を示す値 */
const UNUSED_OPTION = '未使用';

/**
 * トピック選択UIを初期化
 *
 * @param {Object} params - 初期化パラメータ
 * @param {HTMLSelectElement} params.scan - スキャントピック選択要素
 * @param {HTMLSelectElement} params.odom - オドメトリトピック選択要素
 * @param {HTMLSelectElement} params.tf - TFトピック選択要素
 * @param {HTMLButtonElement} params.applyButton - 適用ボタン
 * @param {AppState} params.appState - アプリケーション状態
 * @param {Function} params.onApply - トピック適用時のコールバック
 */
export function initTopicSelectors({ scan, odom, tf, applyButton, appState, onApply }) {
  // セレクトボックスにオプションを追加
  populate(scan, PLACEHOLDER_OPTIONS.scan);
  populate(odom, [UNUSED_OPTION, ...PLACEHOLDER_OPTIONS.odom]);
  populate(tf, [UNUSED_OPTION, ...PLACEHOLDER_OPTIONS.tf]);

  /**
   * 適用ボタンの有効/無効状態を更新
   * スキャントピックが選択されている場合のみボタンを有効化
   */
  const updateButtonState = () => {
    const hasValidScanTopic = scan.value && scan.value !== UNUSED_OPTION;
    applyButton.disabled = !hasValidScanTopic;
  };

  // トピック変更時にボタン状態を更新
  [scan, odom, tf].forEach(select => {
    select.addEventListener('change', updateButtonState);
  });

  // トピック適用ボタンのクリックイベント
  applyButton.addEventListener('click', () => {
    const topics = {
      scan: scan.value,
      odom: odom.value === UNUSED_OPTION ? null : odom.value,
      tf: tf.value === UNUSED_OPTION ? null : tf.value
    };

    appState.setTopics(topics);
    onApply(topics);
  });

  // トピック一覧が利用可能になったときの処理
  appState.on('availableTopics', ({ topics }) => {
    console.log('[topicSelectors] Available topics:', topics);

    // トピックをタイプ別に分類
    const scanTopics = [];
    const odomTopics = [];
    const tfTopics = [];

    topics.forEach(topic => {
      const type = topic.type.toLowerCase();

      // LaserScan トピック
      if (type.includes('laserscan')) {
        scanTopics.push(topic.name);
      }
      // Odometry トピック
      else if (type.includes('odometry')) {
        odomTopics.push(topic.name);
      }
      // TF トピック
      else if (type.includes('tf')) {
        tfTopics.push(topic.name);
      }
    });

    console.log('[topicSelectors] Scan topics:', scanTopics);
    console.log('[topicSelectors] Odom topics:', odomTopics);
    console.log('[topicSelectors] TF topics:', tfTopics);

    // セレクトボックスを更新
    if (scanTopics.length > 0) {
      populate(scan, scanTopics);
      scan.value = scanTopics[0]; // 最初のトピックを自動選択
    }

    if (odomTopics.length > 0) {
      populate(odom, [UNUSED_OPTION, ...odomTopics]);
      odom.value = odomTopics[0]; // 最初のトピックを自動選択
    }

    if (tfTopics.length > 0) {
      populate(tf, [UNUSED_OPTION, ...tfTopics]);
      tf.value = tfTopics[0]; // 最初のトピックを自動選択
    }

    // ボタン状態を更新
    updateButtonState();
  });

  // 初期状態のボタン状態を設定
  updateButtonState();
}

/**
 * セレクトボックスにオプションを追加
 *
 * @param {HTMLSelectElement} select - セレクトボックス要素
 * @param {string[]} values - オプションの値配列
 */
function populate(select, values) {
  select.innerHTML = '';

  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
}
