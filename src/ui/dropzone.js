/**
 * Dropzoneコンポーネント - ファイルのドラッグ＆ドロップとクリック選択を処理
 *
 * @param {Object} params - 初期化パラメータ
 * @param {HTMLElement} params.element - Dropzone要素
 * @param {Function} params.onFile - ファイル選択時のコールバック
 * @param {Object} params.toast - トースト通知オブジェクト
 */
export function initDropzone({ element, onFile, toast }) {
  // サポートされるファイル形式
  const SUPPORTED_EXTENSIONS = ['.bag', '.mcap'];
  const ACCEPT_STRING = SUPPORTED_EXTENSIONS.join(',');

  // クリックでファイル選択ダイアログを開く
  element.addEventListener('click', () => triggerFileDialog(onFile));

  // キーボードアクセシビリティ対応（Enter/Spaceキー）
  element.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      triggerFileDialog(onFile);
    }
  });

  // ドラッグ＆ドロップのデフォルト動作を防止
  const preventDefaults = event => {
    event.preventDefault();
    event.stopPropagation();
  };

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    element.addEventListener(eventName, preventDefaults, false);
  });

  // ドラッグオーバー時の視覚的フィードバック
  ['dragenter', 'dragover'].forEach(eventName => {
    element.addEventListener(eventName, () => element.classList.add('dragover'));
  });

  ['dragleave', 'drop'].forEach(eventName => {
    element.addEventListener(eventName, () => element.classList.remove('dragover'));
  });

  // ファイルドロップ時の処理
  element.addEventListener('drop', event => {
    const files = Array.from(event.dataTransfer.files);
    const validFile = files.find(file => isValidFile(file));

    if (validFile) {
      handleFileSelection(validFile);
    } else if (files.length > 0) {
      toast?.show(`対応形式のファイルが見つかりません (${SUPPORTED_EXTENSIONS.join(' / ')})`, 'error');
    } else {
      toast?.show('ファイルが選択されませんでした', 'error');
    }
  });

  /**
   * ファイル選択ダイアログを開く
   * @param {Function} onSelect - ファイル選択時のコールバック
   */
  function triggerFileDialog(onSelect) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT_STRING;

    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        if (isValidFile(file)) {
          handleFileSelection(file);
        } else {
          toast?.show(`対応形式のファイルを選択してください (${SUPPORTED_EXTENSIONS.join(' / ')})`, 'error');
        }
      }
    };

    // ダイアログを開く
    input.click();
  }

  /**
   * ファイルが対応形式かチェック
   * @param {File} file - チェックするファイル
   * @returns {boolean} 対応形式ならtrue
   */
  function isValidFile(file) {
    return SUPPORTED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));
  }

  /**
   * ファイル選択を処理
   * @param {File} file - 選択されたファイル
   */
  function handleFileSelection(file) {
    try {
      onFile(file);
      showFileInfo(file);
    } catch (error) {
      console.error('ファイル処理エラー:', error);
      toast?.show('ファイルの読み込みに失敗しました', 'error');
    }
  }

  /**
   * ファイル情報を表示
   * @param {File} file - 表示するファイル
   */
  function showFileInfo(file) {
    const info = document.getElementById('file-info');
    if (!info) {
      console.warn('file-info要素が見つかりません');
      return;
    }

    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    info.innerHTML = `<strong>${escapeHtml(file.name)}</strong><br />${sizeInMB} MB`;
    info.classList.remove('hidden');
  }

  /**
   * HTMLエスケープ（XSS対策）
   * @param {string} text - エスケープするテキスト
   * @returns {string} エスケープされたテキスト
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
