/* ============================================================================
 * DOFA · Encuesta Jhonny Perdomo — formulario público
 * ----------------------------------------------------------------------------
 *  · El formulario es HTML estático: se pinta sin esperar al servidor. Las
 *    zonas vienen sembradas en el HTML y se actualizan de fondo (ruta zonas).
 *  · Documento: aviso temprano de duplicado (ruta existe, de fondo, con
 *    corte si el número cambia). La verdad la pone el backend bajo candado.
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

  /* ------------------------------------------------------------ estado del formulario */
  var form = $('form'), vota = '', ridActual = ls.get(K.rid) || '';
  var docEstado = { doc: '', existe: null };
  var preguntas = []; for (var i = 0; i < N_PREG; i++) preguntas.push($('p' + i));
  var REF = (new URLSearchParams(location.search).get('ref') || '').slice(0, 40);

  function normDoc(s) { return String(s || '').replace(/\D/g, '').replace(/^0+/, ''); }
  function datos() {
    return {
      doc: normDoc($('doc').value), nombre: $('nombre').value.trim(), tel: $('tel').value.replace(/\D/g, ''),
      zona: $('zona').value, vota: vota, r: preguntas.map(function (t) { return t.value.trim(); }),
      hp: $('hp').value, ref: REF
    };
  }
  function sucio() { var d = datos(); return !!(d.doc || d.nombre || d.tel || d.zona || d.vota || d.r.join('')); }
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
    $('doc').value = b.doc || ''; $('nombre').value = b.nombre || ''; $('tel').value = b.tel || '';
    if (b.zona) $('zona').value = b.zona;
    if (b.vota) ponVota(b.vota);
    (b.r || []).forEach(function (v, i) { if (preguntas[i]) preguntas[i].value = v || ''; });
    return true;
  }

  /* ------------------------------------------------------------ vota (pastillas) */
  function ponVota(v) {
    vota = v;
    document.querySelectorAll('.pastilla').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.vota === v ? 'true' : 'false'); });
    marca('fVota', 'aVota', '');
  }
  document.querySelectorAll('.pastilla').forEach(function (b) {
    b.addEventListener('click', function () { ponVota(b.dataset.vota); programaBorrador(); avance(); });
  });

  /* ------------------------------------------------------------ ayudas y avance */
  function marca(fid, aid, msg, tipo) {
    var f = $(fid), a = $(aid);
    if (f) f.classList.toggle('mal', tipo === 'mal' || (!!msg && !tipo));
    if (a) { a.className = 'ayuda' + (msg && tipo !== 'neutro' ? ' ' + (tipo || 'mal') : ''); a.innerHTML = msg; }
  }
  function avance() {
    var d = datos(), n = 0, tot = 5 + N_PREG;
    if (d.doc.length >= 5) n++; if (d.nombre.length >= 3) n++; if (d.tel.length >= 7) n++; if (d.zona) n++; if (d.vota) n++;
    d.r.forEach(function (t, i) { var ok = t.length > 0; if (ok) n++; $('pp' + i).classList.toggle('lista', ok); });
    document.querySelector('#avance i').style.width = Math.round(100 * n / tot) + '%';
  }
  preguntas.forEach(function (t, i) {
    function crecer() { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 420) + 'px'; }
    t.addEventListener('input', function () { crecer(); $('c' + i).textContent = t.value.length > 1500 ? t.value.length + ' / 2000' : ''; programaBorrador(); avance(); });
  });
  ['nombre', 'tel', 'zona'].forEach(function (id) {
    $(id).addEventListener('input', function () { programaBorrador(); avance(); marca('f' + id.charAt(0).toUpperCase() + id.slice(1), 'a' + id.charAt(0).toUpperCase() + id.slice(1), ''); });
  });
  $('zona').addEventListener('change', function () { programaBorrador(); avance(); marca('fZona', 'aZona', ''); });

  /* ------------------------------------------------------------ PASO 1: el documento es la puerta
     Nada más se muestra hasta que el servidor confirme que el documento no
     tiene encuesta. Si ya la tiene, la persona no llena nada en vano. */
  var docVuelo = 0;
  function abrirResto(abrir) {
    $('resto').hidden = !abrir;
    $('cardDoc').classList.toggle('listo', abrir);
    $('doc').readOnly = abrir;
    $('btnVerif').hidden = abrir; $('btnCambiar').hidden = !abrir;
    avance();
  }
  function verificar() {
    var doc = normDoc($('doc').value), btn = $('btnVerif');
    if (doc.length < 5 || doc.length > 12) { marca('fDoc', 'aDoc', 'El documento debe tener entre 5 y 12 dígitos.'); $('doc').focus(); return; }
    if (!API) { toast('El sitio aún no está conectado al servidor.', true); return; }
    if (docEstado.doc === doc && docEstado.existe === false) return abrirResto(true);
    var mio = ++docVuelo, t = performance.now();
    btn.setAttribute('aria-busy', 'true'); btn.querySelector('span').textContent = 'Verificando…';
    $('cardDoc').classList.remove('ocupado');
    marca('fDoc', 'aDoc', '<i class="giro"></i> Revisando si ya respondió…', 'neutro');
    api('existe', { doc: doc }).then(function (j) {
      if (mio !== docVuelo) return;                 // el número cambió mientras tanto
      tm.existe = performance.now() - t;
      docEstado = { doc: doc, existe: !!j.data.existe };
      pintaDoc();
    }).catch(function (e) {
      if (mio !== docVuelo || e.cortado) return;
      marca('fDoc', 'aDoc', 'No se pudo verificar (' + (e.message || 'sin conexión') + '). Toque Verificar de nuevo.');
    }).then(function () {
      if (mio !== docVuelo) return;
      btn.removeAttribute('aria-busy'); btn.querySelector('span').textContent = 'Verificar';
    });
  }
  function pintaDoc() {
    if (docEstado.existe === true) {
      abrirResto(false);
      $('cardDoc').classList.add('ocupado');
      marca('fDoc', 'aDoc', '<span class="aviso-dup">✕ Este documento ya tiene una encuesta registrada. No es necesario responder de nuevo.</span>', 'mal');
    } else if (docEstado.existe === false) {
      marca('fDoc', 'aDoc', '✓ Documento sin encuesta. Continúe con los datos y las preguntas.', 'bien');
      abrirResto(true);
      setTimeout(function () { try { $('nombre').focus({ preventScroll: true }); $('resto').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }, 60);
    }
  }
  $('doc').addEventListener('input', function () {
    var limpio = $('doc').value.replace(/\D/g, '');
    if (limpio !== $('doc').value) $('doc').value = limpio;
    docVuelo++; $('cardDoc').classList.remove('ocupado');
    $('btnVerif').removeAttribute('aria-busy'); $('btnVerif').querySelector('span').textContent = 'Verificar';
    marca('fDoc', 'aDoc', 'Cédula o documento de identidad.', 'neutro');
    programaBorrador();
  });
  $('doc').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); verificar(); } });
  $('btnVerif').addEventListener('click', verificar);
  $('btnCambiar').addEventListener('click', function () {
    docEstado = { doc: '', existe: null }; abrirResto(false);
    marca('fDoc', 'aDoc', 'Cédula o documento de identidad.', 'neutro');
    $('doc').focus(); $('doc').select();
  });

  /* ------------------------------------------------------------ zonas: de fondo */
  function pintaZonas(lista) {
    var sel = $('zona'), actual = sel.value, ya = [];
    for (var i = 1; i < sel.options.length; i++) ya.push(sel.options[i].text);
    if (ya.join('|') === lista.join('|')) return;
    var html = '<option value="">Seleccione el barrio o zona…</option>';
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
    var primero = null;
    function mal(fid, aid, msg, foco) { marca(fid, aid, msg); if (!primero) primero = foco; }
    if (!(docEstado.doc === d.doc && docEstado.existe === false)) { abrirResto(false); mal('fDoc', 'aDoc', 'Verifique primero el documento.', $('doc')); }
    if (d.nombre.length < 3) mal('fNombre', 'aNombre', 'Escriba el nombre completo.', $('nombre'));
    if (d.tel.length < 7 || d.tel.length > 10) mal('fTel', 'aTel', 'El teléfono debe tener entre 7 y 10 dígitos.', $('tel'));
    if (!d.zona) mal('fZona', 'aZona', 'Seleccione la residencia.', $('zona'));
    if (!d.vota) mal('fVota', 'aVota', 'Indique si vota en Flandes.', document.querySelector('.pastilla'));
    if (primero) { primero.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function () { try { primero.focus({ preventScroll: true }); } catch (e) {} }, 300); }
    return !primero;
  }

  var enviando = false;
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (enviando) return;                          // escudo: nada de doble envío
    var d = datos();
    if (!validar(d)) { toast('Revise los campos marcados en rojo.', true); return; }
    if (!API) { toast('El sitio aún no está conectado al servidor.', true); return; }
    enviando = true;
    var btn = $('btnEnviar'), escudo = document.createElement('div');
    btn.setAttribute('aria-busy', 'true'); btn.querySelector('span').textContent = 'Guardando…';
    escudo.className = 'escudo'; document.body.appendChild(escudo);
    if (!ridActual) { ridActual = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); ls.set(K.rid, ridActual); }
    var t = performance.now();
    d.tm = { pintura: tm.pintura, zonas: tm.zonas, existe: tm.existe, guardado: tm.ultimoGuardado };
    api('registrar', {}, { metodo: 'POST', cuerpo: { datos: d }, rid: ridActual }).then(function (j) {
      tm.ultimoGuardado = performance.now() - t;
      ridActual = ''; ls.del(K.rid); ls.del(K.borrador);
      $('listoTxt').textContent = 'Quedó guardada el ' + String(j.data.fecha || '').replace(' ', ' a las ') + '. Gracias por su tiempo.';
      $('vForm').hidden = true; $('vListo').hidden = false;
      document.querySelector('#avance i').style.width = '100%';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function (e) {
      if (e.code === 'DUPLICADO') {
        ridActual = ''; ls.del(K.rid);
        docEstado = { doc: d.doc, existe: true }; pintaDoc();
        $('doc').scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast('Ese documento ya tiene encuesta. No se creó otra.', true);
      } else if (e.red || e.tiempo || e.eco) {
        toast('Sin conexión estable. La encuesta sigue aquí: toque Registrar de nuevo.', true);
      } else {
        if (e.code && e.code !== 'OCUPADO') { ridActual = ''; ls.del(K.rid); }
        toast(e.message || 'No se pudo guardar.', true);
      }
    }).then(function () {
      enviando = false; escudo.remove();
      btn.removeAttribute('aria-busy'); btn.querySelector('span').textContent = 'Registrar encuesta';
    });
  });

  $('btnOtra').addEventListener('click', function () {
    form.reset(); vota = ''; ponVota(''); docEstado = { doc: '', existe: null };
    preguntas.forEach(function (t, i) { t.style.height = ''; $('c' + i).textContent = ''; });
    ['Doc', 'Nombre', 'Tel', 'Zona', 'Vota'].forEach(function (k) { marca('f' + k, 'a' + k, ''); });
    docVuelo++; abrirResto(false); $('cardDoc').classList.remove('ocupado');
    marca('fDoc', 'aDoc', 'Cédula o documento de identidad.', 'neutro');
    $('vListo').hidden = true; $('vForm').hidden = false; avance();
    window.scrollTo({ top: 0 }); $('doc').focus();
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
  if (normDoc($('doc').value).length >= 5) verificar();   // borrador recuperado: se vuelve a verificar
})();
