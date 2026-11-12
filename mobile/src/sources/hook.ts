/** Script do navegador invisível, sem React Native (roda nos testes). */

/**
 * Script que entra antes da página: copia as respostas de fetch e XHR cujo endereço bate com o
 * padrão e, se pedido, o HTML no fim do carregamento (Instagram põe dados dentro da página).
 */
export function hookScript(pattern: string, html: boolean, tap?: string): string {
  return `(function(){
  if (window.__puxaHook) return; window.__puxaHook = true;
  var RE = new RegExp(${JSON.stringify(pattern)});
  function send(u, b, h) { try { window.ReactNativeWebView.postMessage(JSON.stringify({ url: String(u || ''), body: String(b || ''), html: !!h })); } catch (e) {} }
  try {
    var of = window.fetch;
    if (of) window.fetch = function(input) {
      var u = typeof input === 'string' ? input : (input && input.url) || String(input || '');
      var p = of.apply(this, arguments);
      try { p.then(function(res) { try { if (RE.test(u)) res.clone().text().then(function(t) { send(u, t); }).catch(function(){}); } catch (e) {} }).catch(function(){}); } catch (e) {}
      return p;
    };
  } catch (e) {}
  try {
    var oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(m, u) { this.__puxaUrl = u; return oo.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function() {
      var x = this;
      try {
        x.addEventListener('load', function() {
          try {
            if (!RE.test(String(x.__puxaUrl))) return;
            var t = x.responseType === '' || x.responseType === 'text' ? x.responseText : x.responseType === 'json' ? JSON.stringify(x.response) : null;
            if (t) send(x.__puxaUrl, t);
          } catch (e) {}
        });
      } catch (e) {}
      return os.apply(this, arguments);
    };
  } catch (e) {}
  ${html ? "window.addEventListener('load', function() { setTimeout(function() { try { send(location.href, document.documentElement.outerHTML, true); } catch (e) {} }, 1200); });" : ''}
  ${
    tap
      ? `window.addEventListener('load', function() {
    var TAP = new RegExp(${JSON.stringify(tap)}, 'i'), tries = 0;
    var iv = setInterval(function() {
      tries++;
      try {
        var els = document.querySelectorAll('button, [role="button"]');
        for (var i = 0; i < els.length; i++) {
          var t = (els[i].innerText || '').trim();
          if (t && t.length < 40 && TAP.test(t)) { els[i].click(); clearInterval(iv); return; }
        }
      } catch (e) {}
      if (tries > 14) clearInterval(iv);
    }, 500);
  });`
      : ''
  }
})(); true;`;
}
