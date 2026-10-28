/* ============================================================================
 * DOFA · Encuesta Jhonny Perdomo — formulario público
 * ----------------------------------------------------------------------------
 *  · El formulario es HTML estático: se pinta sin esperar al servidor. Las
 *    zonas vienen sembradas en el HTML y se actualizan de fondo (ruta zonas).
 *  · Encuesta anónima (27/10/2026): "¿Vive en Flandes?" abre el barrio,
 *    vereda o conjunto (solo con SÍ) y luego las 13 preguntas.
 *  · Guardar: botón ocupado + escudo desde el primer toque, rid fijo hasta
 *    que la encuesta quede (reintentos solo con ese rid, en red.js).
 *  · Borrador en este dispositivo: si se recarga o se cierra, no se pierde.
 *  · Versión: compara js/version.js sin caché y recarga UNA vez por versión.
 * ============================================================================ */
(function () {
  'use strict';
  var NS = (window.MARCA && MARCA.STORAGE_NS) || 'jpdofa';
  var API = (window.MARCA && MARCA.API_URL) || '';
  var K = { tema: NS + ':tema', borrador: NS + ':borrador', zonas: NS + ':zonas', rid: NS + ':rid', ver: NS + ':verRecarga' };
  var N_PREG = 13;
    var tm = {};                                // tiempos de pantalla (van con el guardado)
  var $ = function (id) { return document.getElementById(id); };
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  window.DOFA = { ls: ls, NS: NS, API: API, toast: toast, tm: tm };

  /* ------------------------------------------------------------ tema */
  var LUNA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  var SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>';
  function pintaTema() {
    var d = document.documentElement.classList.contains('oscuro'), b = $('btnTema');
    b.innerHTML = d ? SOL : LUNA; b.title = d ? 'Modo claro' : 'Modo oscuro'; b.setAttribute('aria-label', b.title);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', d ? '#0B2D57' : '#007BFF');
  }
  $('btnTema').addEventListener('click', function () {
    var d = !document.documentElement.classList.contains('oscuro');
    document.documentElement.classList.toggle('oscuro', d); ls.set(K.tema, d ? 'oscuro' : 'claro'); pintaTema();
  });
  pintaTema();
  $('pieVer').textContent = 'Versión ' + (window.APP_VERSION || '');

  /* ------------------------------------------------------------ aviso */
  var tToast;
  function toast(msg, mal) {
    var t = $('toast'); t.textContent = msg; t.className = 'toast si' + (mal ? ' mal' : '');
    clearTimeout(tToast); tToast = setTimeout(function () { t.className = 'toast' + (mal ? ' mal' : ''); }, mal ? 5200 : 3400);
  }

  /* ------------------------------------------------------------ red */
  function api(accion, params, op) {
    if (!API) return Promise.reject(Object.assign(new Error('El sitio aún no está conectado al servidor.'), { sinApi: true }));
    return RED.pedir(API, accion, params, op).then(function (j) {
      if (!j.ok) throw Object.assign(new Error(j.error || 'Error'), { code: j.code });
      return j;
    });
  }
  window.DOFA.api = api;

  /* ------------------------------------------------------------ versión del sitio */
  (function revisarVersion() {
    fetch('js/version.js?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (txt) {
      var m = /APP_VERSION\s*=\s*"([^"]+)"/.exec(txt), nueva = m && m[1];
      if (!nueva || nueva === window.APP_VERSION) return;
      var ya = ''; try { ya = sessionStorage.getItem(K.ver) || ''; } catch (e) {}
      if (ya === nueva) return;                         // freno: una recarga por versión
      try { sessionStorage.setItem(K.ver, nueva); } catch (e) {}
      guardarBorrador();
      var propios = ['./', 'index.html', 'css/estilo.css', 'js/app.js', 'js/red.js', 'js/marca.js', 'js/admin.js', 'js/version.js'];
      Promise.all(propios.map(function (u) { return fetch(u, { cache: 'reload' }).catch(function () {}); }))
        .then(function () { location.reload(); });
    }).catch(function () {});
  })();

  /* ------------------------------------------------------------ estado del formulario
     27/10/2026 · v3: encuesta anónima. Paso 1 "¿Vive en Flandes?": con SÍ se
     pide el barrio, vereda o conjunto; con NO pasa directo a las preguntas. */
  var form = $('form'), vive = '', ridActual = ls.get(K.rid) || '';
  var preguntas = []; for (var i = 0; i < N_PREG; i++) preguntas.push($('p' + i));
  var REF = (new URLSearchParams(location.search).get('ref') || '').slice(0, 40);

  function datos() {
    return {
      vive: vive, zona: vive === 'SI' ? $('zona').value : '',
      r: preguntas.map(function (t) { return t.value.trim(); }),
      hp: $('hp').value, ref: REF
    };
  }
  function sucio() { var d = datos(); return !!(d.vive || d.zona || d.r.join('')); }
  window.RED_NO_RECARGAR = function () { return false; };   // el borrador se guarda: recargar no pierde nada

  /* ------------------------------------------------------------ borrador local */
  var tBorr;
  function guardarBorrador() {
    var d = datos(); delete d.hp; delete d.ref;
    if (sucio()) ls.set(K.borrador, JSON.stringify(d)); else ls.del(K.borrador);
  }
  function programaBorrador() { clearTimeout(tBorr); tBorr = setTimeout(guardarBorrador, 400); }
  function restaurar() {
    var b = ls.get(K.borrador); if (!b) return false;
    try { b = JSON.parse(b); } catch (e) { return false; }
    if (!b || (!b.vive && !(b.r || []).join(''))) return false;   // borrador de la versión anterior
    if (b.zona) $('zona').value = b.zona;
    if (b.vive) ponVive(b.vive, true);
    (b.r || []).forEach(function (v, i) { if (preguntas[i]) preguntas[i].value = v || ''; });
    return true;
  }

  /* ------------------------------------------------------------ ayudas y avance */
  function marca(fid, aid, msg, tipo) {
    var f = $(fid), a = $(aid);
    if (f) f.classList.toggle('mal', tipo === 'mal' || (!!msg && !tipo));
    if (a) { a.className = 'ayuda' + (msg && tipo !== 'neutro' ? ' ' + (tipo || 'mal') : ''); a.innerHTML = msg; }
  }
  function avance() {
    var d = datos(), n = 0, tot = (vive === 'SI' ? 2 : 1) + N_PREG;
    if (d.vive) n++; if (vive === 'SI' && d.zona) n++;
    d.r.forEach(function (t, i) { var ok = t.length > 0; if (ok) n++; $('pp' + i).classList.toggle('lista', ok); });
    document.querySelector('#avance i').style.width = Math.round(100 * n / tot) + '%';
  }

  /* ------------------------------------------------------------ PASO 1: ¿vive en Flandes? */
  function ponVive(v, silencio) {
    vive = v;
    document.querySelectorAll('[data-vive]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.vive === v ? 'true' : 'false'); });
    marca('fVive', 'aVive', '');
    $('bloqueZona').hidden = v !== 'SI';
    $('resto').hidden = !v;
    avance();
    if (silencio) return;
    setTimeout(function () {
      try {
        if (v === 'SI' && !$('zona').value) { $('zona').focus({ preventScroll: true }); $('bloqueZona').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        else { $('resto').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      } catch (e) {}
    }, 60);
  }
  document.querySelectorAll('[data-vive]').forEach(function (b) {
    b.addEventListener('click', function () { ponVive(b.dataset.vive); programaBorrador(); });
  });
  $('zona').addEventListener('change', function () {
    programaBorrador(); avance(); marca('fZona', 'aZona', '');
    if ($('zona').value) setTimeout(function () { try { $('resto').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }, 60);
  });
  preguntas.forEach(function (t, i) {
    function crecer() { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 420) + 'px'; }
    t.addEventListener('input', function () { crecer(); $('c' + i).textContent = t.value.length > 1500 ? t.value.length + ' / 2000' : ''; programaBorrador(); avance(); });
  });

  /* ------------------------------------------------------------ zonas: de fondo */
  function pintaZonas(lista) {
    lista = lista.filter(function (z) { return z && z !== 'N/A'; });
    var sel = $('zona'), actual = sel.value, ya = [];
    for (var i = 1; i < sel.options.length; i++) ya.push(sel.options[i].text);
    if (ya.join('|') === lista.join('|')) return;
    var html = '<option value="">Seleccione dónde vive…</option>';
    lista.forEach(function (z) { var e = z.replace(/&/g, '&amp;').replace(/</g, '&lt;'); html += '<option>' + e + '</option>'; });
    sel.innerHTML = html;
    if (actual && lista.indexOf(actual) >= 0) sel.value = actual;
  }
  function cargarZonas() {
    var guardadas = ls.get(K.zonas);
    if (guardadas) { try { pintaZonas(JSON.parse(guardadas)); } catch (e) {} }
    if (!API) return;
    var t = performance.now();
    api('zonas', {}, { fondo: true, persistente: true }).then(function (j) {
      tm.zonas = performance.now() - t;
      if (j.data && j.data.length) { ls.set(K.zonas, JSON.stringify(j.data)); pintaZonas(j.data); }
    }).catch(function () {});
  }

  /* ------------------------------------------------------------ validar y guardar */
  function validar(d) {
    var primero = null, msg = 'Revise los campos marcados en rojo.';
    function mal(fid, aid, txt, foco) { marca(fid, aid, txt); if (!primero) primero = foco; }
    if (!d.vive) mal('fVive', 'aVive', 'Indique si vive en Flandes.', document.querySelector('[data-vive]'));
    else if (d.vive === 'SI' && !d.zona) mal('fZona', 'aZona', 'Seleccione el barrio, vereda o conjunto.', $('zona'));
    else if (!d.r.join('')) { primero = preguntas[0]; msg = 'Responda al menos una pregunta.'; }
    if (primero) {
      toast(msg, true);
      primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () { try { primero.focus({ preventScroll: true }); } catch (e) {} }, 300);
    }
    return !primero;
  }

  var enviando = false;
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (enviando) return;                          // escudo: nada de doble envío
    var d = datos();
    if (!validar(d)) return;
    if (!API) { toast('El sitio aún no está conectado al servidor.', true); return; }
    enviando = true;
    var btn = $('btnEnviar'), escudo = document.createElement('div');
    btn.setAttribute('aria-busy', 'true'); btn.querySelector('span').textContent = 'Guardando…';
    escudo.className = 'escudo'; document.body.appendChild(escudo);
    if (!ridActual) { ridActual = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); ls.set(K.rid, ridActual); }
    var t = performance.now();
    d.tm = { pintura: tm.pintura, zonas: tm.zonas, guardado: tm.ultimoGuardado };
    api('registrar', {}, { metodo: 'POST', cuerpo: { datos: d }, rid: ridActual }).then(function (j) {
      tm.ultimoGuardado = performance.now() - t;
      ridActual = ''; ls.del(K.rid); ls.del(K.borrador);
      $('listoTxt').textContent = 'Quedó guardada el ' + String(j.data.fecha || '').replace(' ', ' a las ') + '. Gracias por su tiempo.';
      $('vForm').hidden = true; $('vListo').hidden = false;
      document.querySelector('#avance i').style.width = '100%';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function (e) {
      if (e.red || e.tiempo || e.eco) {
        toast('Sin conexión estable. La encuesta sigue aquí: toque Registrar de nuevo.', true);
      } else {
        if (e.code && e.code !== 'OCUPADO') { ridActual = ''; ls.del(K.rid); }
        if (e.code === 'ZONA') marca('fZona', 'aZona', e.message);
        if (e.code === 'VIVE') marca('fVive', 'aVive', e.message);
        toast(e.message || 'No se pudo guardar.', true);
      }
    }).then(function () {
      enviando = false; escudo.remove();
      btn.removeAttribute('aria-busy'); btn.querySelector('span').textContent = 'Registrar encuesta';
    });
  });

  $('btnOtra').addEventListener('click', function () {
    form.reset(); vive = '';
    document.querySelectorAll('[data-vive]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
    $('bloqueZona').hidden = true; $('resto').hidden = true;
    preguntas.forEach(function (t, i) { t.style.height = ''; $('c' + i).textContent = ''; });
    ['Vive', 'Zona'].forEach(function (k) { marca('f' + k, 'a' + k, ''); });
    $('vListo').hidden = true; $('vForm').hidden = false; avance();
    window.scrollTo({ top: 0 });
  });

  /* ------------------------------------------------------------ vistas: formulario / administración */
  function vista() {
    var admin = location.hash === '#admin';
    if (window.RED) RED.nuevaVista();
    $('vAdmin').hidden = !admin;
    $('vForm').hidden = admin || !$('vListo').hidden;
    if (admin) $('vListo').hidden = true;
    $('avance').hidden = admin;
    $('lnkAdmin').textContent = admin ? 'Ir a la encuesta' : 'Administración';
    $('lnkAdmin').setAttribute('href', admin ? '#' : '#admin');
    if (admin) cargarAdmin();
  }
  var adminCargado = null;
  function cargarAdmin() {
    if (window.DOFA_ADMIN) return DOFA_ADMIN.abrir($('vAdmin'));
    $('vAdmin').innerHTML = '<div class="esq"></div><div class="esq"></div>';
    if (adminCargado) return;
    adminCargado = document.createElement('script');
    adminCargado.src = 'js/admin.js?v=' + encodeURIComponent(window.APP_VERSION || '');
    adminCargado.onload = function () { if (location.hash === '#admin') DOFA_ADMIN.abrir($('vAdmin')); };
    document.body.appendChild(adminCargado);
  }
  window.addEventListener('hashchange', vista);

  /* ------------------------------------------------------------ arranque */
  if (restaurar()) toast('Recuperamos la encuesta que estaba llenando.');
  preguntas.forEach(function (t) { if (t.value) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 420) + 'px'; } });
  avance();
  vista();
  requestAnimationFrame(function () { tm.pintura = performance.now(); });   // ms desde que se pidió la página
  cargarZonas();
})();
