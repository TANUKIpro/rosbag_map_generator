/**
 * 状態管理モジュール
 *
 * アプリケーション全体の状態を管理し、イベントベースで
 * コンポーネント間の通信を行う
 */

/**
 * シンプルなイベントエミッタークラス
 * Pub/Subパターンでコンポーネント間の疎結合を実現
 */
class Emitter {
  constructor() {
    /** @type {Map<string, Function[]>} イベント名とリスナー関数の対応表 */
    this.listeners = new Map();
  }

  /**
   * イベントリスナーを登録
   *
   * @param {string} event - イベント名
   * @param {Function} fn - イベント発火時に呼ばれるコールバック関数
   */
  on(event, fn) {
    const arr = this.listeners.get(event) ?? [];
    arr.push(fn);
    this.listeners.set(event, arr);
  }

  /**
   * イベントを発火し、登録されたリスナーを実行
   *
   * @param {string} event - イベント名
   * @param {*} payload - リスナーに渡されるデータ
   */
  emit(event, payload) {
    const arr = this.listeners.get(event);
    if (!arr) return;

    for (const fn of arr) {
      try {
        fn(payload);
      } catch (error) {
        console.error(`イベントリスナーエラー [${event}]:`, error);
      }
    }
  }
}

/**
 * アプリケーション状態管理クラス
 *
 * 管理する状態:
 * - file: 読み込まれたROSバッグファイル
 * - topics: 選択されたトピック設定
 * - pose: ロボットの現在位置と姿勢
 * - stats: パフォーマンス統計（FPS、メモリなど）
 *
 * イベント:
 * - 'file': ファイルが読み込まれたとき
 * - 'topics': トピック設定が変更されたとき
 * - 'pose': ロボットの位置が更新されたとき
 * - 'gridFrame': 新しい地図フレームが生成されたとき
 * - 'stats': 統計情報が更新されたとき
 */
export class AppState extends Emitter {
  constructor() {
    super();

    /** @type {File|null} 読み込まれたROSバッグファイル */
    this.file = null;

    /** @type {Array} 利用可能なトピック一覧 */
    this.availableTopics = [];

    /** @type {{scan: string|null, odom: string|null, tf: string|null}} トピック設定 */
    this.topics = { scan: null, odom: null, tf: null };

    /** @type {{stamp: number, pose: Object}|null} ロボットの現在位置 */
    this.pose = null;

    /** @type {Object|null} パフォーマンス統計 */
    this.stats = null;
  }

  /**
   * ファイルを設定し、'file'イベントを発火
   *
   * @param {File} file - ROSバッグファイル
   */
  setFile(file) {
    this.file = file;
    this.emit('file', { file });
  }

  /**
   * 利用可能なトピック一覧を設定し、'availableTopics'イベントを発火
   *
   * @param {Array} topics - トピック一覧 [{name, type, messageCount}]
   */
  setAvailableTopics(topics) {
    this.availableTopics = topics;
    this.emit('availableTopics', { topics });
  }

  /**
   * トピック設定を更新し、'topics'イベントを発火
   *
   * @param {{scan: string|null, odom: string|null, tf: string|null}} topics - トピック設定
   */
  setTopics(topics) {
    this.topics = topics;
    this.emit('topics', topics);
  }

  /**
   * ロボットの位置情報を更新し、'pose'イベントを発火
   *
   * @param {number} stamp - タイムスタンプ（マイクロ秒）
   * @param {Object} pose - 位置と姿勢の情報
   */
  updatePose(stamp, pose) {
    this.pose = { stamp, pose };
    this.emit('pose', { stamp, pose });
  }

  /**
   * 地図フレームを更新し、'gridFrame'イベントを発火
   *
   * @param {number} stamp - タイムスタンプ（マイクロ秒）
   * @param {ImageBitmap} imageBitmap - 地図画像
   */
  updateGridFrame(stamp, imageBitmap) {
    console.log('[state] updateGridFrame called, stamp:', stamp, 'imageBitmap:', imageBitmap);
    this.emit('gridFrame', { stamp, imageBitmap });
    console.log('[state] gridFrame event emitted');
  }

  /**
   * パフォーマンス統計を更新し、'stats'イベントを発火
   *
   * @param {Object} stats - 統計情報（fps, wasmMs, memMBなど）
   */
  updateStats(stats) {
    this.stats = stats;
    this.emit('stats', stats);
  }

  /**
   * エクスポートされた地図ファイルをダウンロード
   *
   * @param {{pgm: Blob, yaml: Blob}} files - PGMとYAMLファイル
   * @param {Object} toast - トースト通知オブジェクト
   */
  handleExport(files, toast) {
    const { pgm, yaml } = files;

    try {
      downloadBlob(pgm, 'map.pgm');
      downloadBlob(yaml, 'map.yaml');
      toast.show('map.pgm / map.yaml をダウンロードしました', 'success');
    } catch (error) {
      console.error('ファイルダウンロードエラー:', error);
      toast.show('ファイルのダウンロードに失敗しました', 'error');
    }
  }
}

/**
 * Blobをファイルとしてダウンロード
 *
 * @param {Blob} blob - ダウンロードするデータ
 * @param {string} filename - ファイル名
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;

  // DOMに追加してクリック（ダウンロード開始）
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // メモリリーク防止のため、URLを解放
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
