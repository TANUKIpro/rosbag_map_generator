export function initToast(element) {
  let timeout;
  return {
    show(message, variant = 'info') {
      element.textContent = message;
      element.dataset.variant = variant;
      element.classList.add('show');
      clearTimeout(timeout);
      timeout = setTimeout(() => element.classList.remove('show'), 3000);
    }
  };
}
