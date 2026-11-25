(function () {
  var COLORS = {
    grimoire: '#141019',
    parchemin: '#f5ebd9',
    'omni-systeme': '#14111d',
  };
  var theme = 'grimoire';
  try {
    var saved = localStorage.getItem('omni-grimoire:theme');
    if (saved && Object.prototype.hasOwnProperty.call(COLORS, saved)) {
      theme = saved;
    }
  } catch (_) {}
  document.documentElement.dataset.theme = theme;
  var color = COLORS[theme];
  var metas = document.querySelectorAll('meta[name="theme-color"]');
  for (var i = 0; i < metas.length; i++) {
    metas[i].setAttribute('content', color);
  }
})();
