(function () {
  const closeBtn = document.getElementById('closeBtn');
  if (!closeBtn) return;
  closeBtn.addEventListener('click', () => {
    window.close();
  });
})();
