export function initDropzone({ element, onFile, toast }) {
  element.addEventListener('click', () => triggerFileDialog(onFile));
  element.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      triggerFileDialog(onFile);
    }
  });

  const preventDefaults = event => {
    event.preventDefault();
    event.stopPropagation();
  };

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    element.addEventListener(eventName, preventDefaults, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    element.addEventListener(eventName, () => element.classList.add('dragover'));
  });

  ['dragleave', 'drop'].forEach(eventName => {
    element.addEventListener(eventName, () => element.classList.remove('dragover'));
  });

  element.addEventListener('drop', event => {
    const file = [...event.dataTransfer.files].find(f => f.name.endsWith('.bag') || f.name.endsWith('.mcap'));
    if (file) {
      onFile(file);
      showFileInfo(file);
    } else {
      toast?.show('対応形式のファイルが見つかりません (.bag / .mcap)', 'error');
    }
  });

  function triggerFileDialog(onSelect) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bag,.mcap';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        onSelect(file);
        showFileInfo(file);
      }
    };
    input.click();
  }

  function showFileInfo(file) {
    const info = document.getElementById('file-info');
    info.innerHTML = `<strong>${file.name}</strong><br />${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    info.classList.remove('hidden');
  }
}
