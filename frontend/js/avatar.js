// Avatars come from the main server (/avatars/<name>.svg), so they work offline.
(function () {
  const url = (name, kind) => '/avatars/' + encodeURIComponent(String(name || '?').slice(0, 60)) + '.svg' + (kind === 'group' ? '?kind=group' : '');
  window.avUrl = url;
  window.avImg = (name, size, kind) => `<img class="av" src="${url(name, kind)}" width="${size || 32}" height="${size || 32}" alt="" loading="lazy">`;
  window.emptyState = (text) => `<div class="text-center py-4"><img src="/images/empty.svg" width="120" alt=""><div class="small text-muted mt-2">${text}</div></div>`;
})();
