/* Apply the saved display settings (text size, theme, language) before the first paint,
   so the page never flashes the default look. Loaded synchronously in <head>; kept tiny. */
(function () {
  try {
    var d = document.documentElement, g = function (k) { return localStorage.getItem(k); };
    var t = g('hms_theme'), f = g('hms_fs'), l = g('hms_lang');
    if (t === 'light') {
      d.setAttribute('data-theme', 'light');
      var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = '#ffffff';
    }
    if (f === 'l' || f === 'xl') d.setAttribute('data-fs', f);
    if (l === 'th' || l === 'en') { d.setAttribute('data-lang', l); d.lang = l; }
  } catch (e) { /* storage blocked: keep defaults */ }
  // Sarabun loads without blocking the app: the system Thai font shows until it arrives (display=swap)
  var font = document.createElement('link'); font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap';
  document.head.appendChild(font);
})();
