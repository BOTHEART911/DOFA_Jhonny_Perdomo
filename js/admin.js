/* ============================================================================
 * DOFA · Administración (se carga solo al abrir #admin)
 *  · PIN → token de 12 h (se toma al despachar; SESION → vuelve al PIN).
 *  · Lista ligera en UN viaje (fmt=2 + gzip), filtros y búsqueda locales.
 *  · Ficha: cabecera al instante con la fila de la lista; respuestas después.
 *  · Respuestas por pregunta y Excel: páginas completas en cola de fondo
 *    (máx. 2 a la vez); el Excel se arma en el navegador (no viaja archivo).
 * ============================================================================ */
(function () {
  'use strict';
  var D = window.DOFA, NS = D.NS, K_TK = NS + ':admtk';
  var cont = null, st = { lista: null, paginas: 0, preguntas: [], tab: 'resumen', filtro: '', vota: '', mostrar: 60, completas: null, cargaCompletas: null, preg: 0, buscaR: '' };
  var IC = {
    lupa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    excel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 13l4 5M13 13l-4 5"/></svg>',
    sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/></svg>',
    salir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
    candado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    casa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/></svg>',
    atras: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>'
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function tk() { try { var o = JSON.parse(sessionStorage.getItem(K_TK) || 'null'); return o && o.exp > Date.now() ? o.tk : ''; } catch (e) { return ''; } }
  function salir() { try { sessionStorage.removeItem(K_TK); } catch (e) {} st.lista = null; st.completas = null; st.cargaCompletas = null; pin(); }

  /* Respuesta comprimida → objeto */
  function cargarScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('No se pudo cargar ' + src)); }; document.head.appendChild(s); }); }
  function ungz(b64) {
    var bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    if (window.DecompressionStream) {
      return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text().then(JSON.parse);
    }
    return cargarScript('https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js').then(function () { return JSON.parse(pako.ungzip(u, { to: 'string' })); });
  }
  function pedir(accion, params, op) {
    params = Object.assign({ tk: tk() }, params || {});
    if (op && op.cuerpo) op.cuerpo.tk = params.tk;
    return D.api(accion, params, op).catch(function (e) { if (e.code === 'SESION') { salir(); D.toast(e.message, true); } throw e; });
  }

  /* ------------------------------------------------------------ PIN */
  function pin() {
    cont.innerHTML = '<div class="card" style="max-width:420px;margin:24px auto">' +
      '<h2>' + IC.candado + 'Administración</h2>' +
      '<form id="admPin" class="grid"><label class="field"><span>PIN de administrador</span>' +
      '<input class="input" id="admPinIn" type="password" inputmode="numeric" autocomplete="current-password" maxlength="12" placeholder="••••••" /></label>' +
      '<button class="btn btn-pri btn-bloque" id="admPinBtn" type="submit"><span>Entrar</span></button></form></div>';
    var f = document.getElementById('admPin'), b = document.getElementById('admPinBtn'), ocupado = false;
    setTimeout(function () { try { document.getElementById('admPinIn').focus(); } catch (e) {} }, 50);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); if (ocupado) return;
      var v = document.getElementById('admPinIn').value.trim(); if (!v) return;
      ocupado = true; b.setAttribute('aria-busy', 'true');
      var t = performance.now();
      D.api('admin.entrar', {}, { metodo: 'POST', cuerpo: { pin: v, conLista: 1 } }).then(function (j) {
        try { sessionStorage.setItem(K_TK, JSON.stringify({ tk: j.data.tk, exp: j.data.exp })); } catch (e) {}
        /* login y resumen en un solo viaje; si el backend no trae la lista, se pide aparte */
        if (j.data.lista) return aplicarLista(j.data.lista, t).then(panel);
        panel();
      }).catch(function (e) { D.toast(e.message || 'No se pudo entrar.', true); })
        .then(function () { ocupado = false; b.removeAttribute('aria-busy'); });
    });
  }

  /* ------------------------------------------------------------ panel */
  function panel() {
    cont.innerHTML = '<div class="tabs" role="tablist">' +
      [['resumen', 'Resumen'], ['encuestas', 'Encuestas'], ['respuestas', 'Respuestas'], ['herr', 'Excel']].map(function (t) {
        return '<button class="tab" role="tab" data-tab="' + t[0] + '" aria-selected="' + (st.tab === t[0]) + '">' + t[1] + '</button>';
      }).join('') + '</div><div id="admCuerpo"></div>';
    cont.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () {
        st.tab = b.dataset.tab;
        cont.querySelectorAll('.tab').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
        pintar();
      });
    });
    pintar();
    if (!st.lista) cargarLista();
  }
  function aplicarLista(j, t) {
    st.paginas = j.paginas; st.preguntas = j.preguntas || [];
    return ungz(j.gz).then(function (o) {
      st.lista = o.filas.slice().reverse();        // lo más reciente primero
      st.completas = null; st.cargaCompletas = null;
      D.tm.adminLista = performance.now() - t;
    });
  }
  function cargarLista(forzar) {
    var t = performance.now();
    return pedir('admin.lista', forzar ? { _: Date.now() } : {}).then(function (j) {
      return aplicarLista(j, t).then(pintar);
    }).catch(function (e) { if (!e.cortado && e.code !== 'SESION') { cuerpo().innerHTML = '<div class="vacio">' + esc(e.message) + '</div>'; } });
  }
  function cuerpo() { return document.getElementById('admCuerpo'); }
  function pintar() {
    var c = cuerpo(); if (!c) return;
    if (st.tab === 'herr') return pintarHerr(c);       // no necesita la lista
    if (!st.lista) { c.innerHTML = '<div class="kpis"><div class="esq"></div><div class="esq"></div><div class="esq"></div><div class="esq"></div></div><div class="esq"></div><div class="esq"></div>'; return; }
    if (st.tab === 'resumen') return pintarResumen(c);
    if (st.tab === 'encuestas') return pintarEncuestas(c);
    if (st.tab === 'respuestas') return pintarRespuestas(c);
  }

  /* ------------------------------------------------------------ resumen */
  function conteo(clave) {
    var m = {}; st.lista.forEach(function (r) { var k = clave(r) || '—'; m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  }
  function barras(pares, max) {
    if (!pares.length) return '<div class="vacio">Sin datos todavía.</div>';
    var tope = pares[0][1] || 1;
    return '<div class="barras">' + pares.slice(0, max || 12).map(function (p) {
      return '<div class="barra"><span class="nom" title="' + esc(p[0]) + '">' + esc(p[0]) + '</span><span class="pista"><i style="width:' + Math.max(3, Math.round(100 * p[1] / tope)) + '%"></i></span><span class="num">' + p[1] + '</span></div>';
    }).join('') + '</div>';
  }
  function pintarResumen(c) {
    var L = st.lista, tot = L.length, si = 0, hoy = 0, d0 = new Date().toISOString().slice(0, 10);
    var hoyCo = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    L.forEach(function (r) { if (r[1] === 'SI') si++; if (String(r[0]).slice(0, 10) === hoyCo) hoy++; });
    var pct = tot ? Math.round(100 * si / tot) : 0;
    var dias = conteo(function (r) { return String(r[0]).slice(0, 10); }).sort(function (a, b) { return a[0] < b[0] ? 1 : -1; }).slice(0, 14);
    var regs = conteo(function (r) { return r[4]; });
    var zonas = conteo(function (r) { return r[1] === 'SI' ? r[2] : ''; }).filter(function (p) { return p[0] !== '—'; });
    c.innerHTML = '<div class="kpis">' +
      '<div class="kpi"><small>Encuestas</small><b>' + tot + '</b><i>en total</i></div>' +
      '<div class="kpi"><small>Viven en Flandes</small><b>' + si + '</b><i>' + pct + ' %</i></div>' +
      '<div class="kpi"><small>No viven en Flandes</small><b>' + (tot - si) + '</b><i>' + (tot ? 100 - pct : 0) + ' %</i></div>' +
      '<div class="kpi"><small>Hoy</small><b>' + hoy + '</b><i>' + hoyCo + '</i></div></div>' +
      '<div class="adm-cols"><div class="card"><h2>Por barrio, vereda o conjunto</h2>' + barras(zonas, 15) + '</div>' +
      '<div class="card"><h2>Por día (últimos 14)</h2>' + barras(dias, 14) + '</div></div>' +
      (regs.length > 1 ? '<div class="card"><h2>Por enlace de origen</h2>' + barras(regs, 10) + '</div>' : '') +
      '<div class="barra-acc" style="justify-content:center"><button class="btn btn-pri" id="admXlsR">' + IC.excel + '<span>Descargar Excel</span></button>' +
      '<button class="btn btn-sec" id="admRef">' + IC.sync + '<span>Actualizar</span></button></div>';
    void d0;
    document.getElementById('admXlsR').addEventListener('click', function () { descargarExcel(this); });
    document.getElementById('admRef').addEventListener('click', function () { var b = this; b.setAttribute('aria-busy', 'true'); cargarLista(true).then(function () { b.removeAttribute('aria-busy'); }); });
  }

  /* ------------------------------------------------------------ encuestas (lista + ficha) */
  function sinTilde(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function filtradas() {
    var q = sinTilde(st.filtro).trim();
    return st.lista.filter(function (r) {
      if (st.vota && r[1] !== st.vota) return false;
      if (!q) return true;
      return sinTilde(r[2] + ' ' + r[6] + ' ' + r[0]).indexOf(q) >= 0;
    });
  }
  function lugar(r) { return r[1] === 'SI' ? (r[2] || 'Flandes') : 'No vive en Flandes'; }
  function filaHtml(r, i) {
    return '<button class="fila" data-i="' + i + '"><span class="av">' + IC.casa + '</span><span class="tx"><b>' + esc(lugar(r)) + '</b>' +
      '<span>' + esc(String(r[0]).slice(0, 16)) + (r[6] ? ' · ' + esc(r[6]) : '') + '</span></span>' +
      '<span class="chip ' + (r[1] === 'SI' ? 'si' : 'no') + '">' + (r[1] === 'SI' ? 'Vive' : 'No vive') + '</span></button>';
  }
  function pintarEncuestas(c) {
    c.innerHTML = '<div class="barra-acc"><input class="input" id="admBusca" placeholder="Buscar por barrio o por la primera respuesta" value="' + esc(st.filtro) + '" />' +
      '<div class="tabs" style="margin:0">' + [['', 'Todas'], ['SI', 'Viven en Flandes'], ['NO', 'No viven']].map(function (x) {
        return '<button class="tab" data-v="' + x[0] + '" aria-selected="' + (st.vota === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div><div id="admLista"></div>';
    var pinta = function () {
      var F = filtradas(), h = '<p class="ayuda" style="margin-bottom:8px">' + F.length + ' encuesta(s)</p>';
      h += F.slice(0, st.mostrar).map(function (r) { return filaHtml(r, st.lista.indexOf(r)); }).join('') || '<div class="vacio">No hay encuestas con ese filtro.</div>';
      if (F.length > st.mostrar) h += '<button class="btn btn-sec mas" id="admMas">Ver más</button>';
      var L = document.getElementById('admLista'); L.innerHTML = h;
      L.querySelectorAll('.fila').forEach(function (b) { b.addEventListener('click', function () { ficha(st.lista[+b.dataset.i]); }); });
      var m = document.getElementById('admMas'); if (m) m.addEventListener('click', function () { st.mostrar += 60; pinta(); });
    };
    var tB; document.getElementById('admBusca').addEventListener('input', function () { var v = this.value; clearTimeout(tB); tB = setTimeout(function () { st.filtro = v; st.mostrar = 60; pinta(); }, 120); });
    c.querySelectorAll('[data-v]').forEach(function (b) { b.addEventListener('click', function () { st.vota = b.dataset.v; st.mostrar = 60; c.querySelectorAll('[data-v]').forEach(function (x) { x.setAttribute('aria-selected', x === b); }); pinta(); }); });
    pinta();
  }
  function ficha(r) {
    var c = cuerpo(), y = window.scrollY;
    /* cabecera al instante con lo que ya trae la fila; las respuestas después */
    c.innerHTML = '<button class="btn btn-sec" id="admAtras" style="margin-bottom:12px">' + IC.atras + '<span>Volver</span></button>' +
      '<div class="card"><div style="display:flex;gap:12px;align-items:center"><span class="av" style="width:52px;height:52px">' + IC.casa + '</span>' +
      '<div style="flex:1;min-width:0"><h2 style="margin:0">' + esc(lugar(r)) + '</h2><span class="ayuda">' + esc(r[0]) + ' · ' + esc(r[4]) + '</span></div>' +
      '<span class="chip ' + (r[1] === 'SI' ? 'si' : 'no') + '">' + (r[1] === 'SI' ? 'Vive en Flandes' : 'No vive en Flandes') + '</span></div></div>' +
      '<div class="card" id="admResp"><div class="esq"></div><div class="esq"></div><div class="esq"></div></div>';
    window.scrollTo({ top: 0 });
    document.getElementById('admAtras').addEventListener('click', function () { pintar(); window.scrollTo({ top: y }); });
    pedir('admin.ficha', { fila: r[3], rid: r[5] }).then(function (j) { pintaResp(j.data.respuestas); })
      .catch(function (e) { if (!e.cortado) { var a = document.getElementById('admResp'); if (a) a.innerHTML = '<div class="vacio">' + esc(e.message) + '</div>'; } });
    function pintaResp(resp) {
      var a = document.getElementById('admResp'); if (!a) return;
      a.innerHTML = resp.map(function (t, i) { return '<div class="resp"><small>' + (i + 1) + '. ' + esc(st.preguntas[i] || '') + '</small><p>' + (t ? esc(t) : '<i class="ayuda">Sin respuesta</i>') + '</p></div>'; }).join('');
    }
  }

  /* ------------------------------------------------------------ encuestas completas (páginas de fondo) */
  function completas(progreso) {
    if (st.completas) return Promise.resolve(st.completas);
    if (st.cargaCompletas) return st.cargaCompletas;
    var hechas = 0, n = st.paginas, out = new Array(n);
    var ps = []; for (var p = 0; p < n; p++) (function (p) {
      ps.push(pedir('admin.pagina', { p: p }, { fondo: true }).then(function (j) { return ungz(j.gz); }).then(function (filas) { out[p] = filas; hechas++; if (progreso) progreso(hechas, n); }));
    })(p);
    st.cargaCompletas = Promise.all(ps).then(function () {
      st.completas = [].concat.apply([], out); return st.completas;
    }, function (e) { st.cargaCompletas = null; throw e; });
    return st.cargaCompletas;
  }

  /* ------------------------------------------------------------ respuestas por pregunta */
  function pintarRespuestas(c) {
    c.innerHTML = '<div class="card"><label class="field"><span>Pregunta</span><select class="input" id="admPreg">' +
      st.preguntas.map(function (p, i) { return '<option value="' + i + '"' + (i === st.preg ? ' selected' : '') + '>' + (i + 1) + '. ' + esc(p) + '</option>'; }).join('') +
      '</select></label><div class="barra-acc" style="margin-top:10px"><input class="input" id="admBuscaR" placeholder="Buscar dentro de las respuestas" value="' + esc(st.buscaR) + '" /></div><div id="admRespLista"><div class="esq"></div><div class="esq"></div></div></div>';
    var lista = document.getElementById('admRespLista');
    var pinta = function () {
      var q = sinTilde(st.buscaR).trim(), i = st.preg;
      var F = st.completas.filter(function (r) { var t = r[3 + i]; return t && (!q || sinTilde(t).indexOf(q) >= 0); });
      var h = '<p class="ayuda" style="margin:6px 0">' + F.length + ' respuesta(s) de ' + st.completas.length + ' encuestas</p>';
      h += F.slice(0, 300).map(function (r) { return '<div class="resp"><small>' + esc(lugar(r)) + ' · ' + esc(String(r[0]).slice(0, 16)) + '</small><p>' + esc(r[3 + i]) + '</p></div>'; }).join('');
      if (F.length > 300) h += '<p class="ayuda">Se muestran 300. Use la búsqueda o descargue el Excel para verlas todas.</p>';
      lista.innerHTML = h;
    };
    document.getElementById('admPreg').addEventListener('change', function () { st.preg = +this.value; if (st.completas) pinta(); });
    var tB; document.getElementById('admBuscaR').addEventListener('input', function () { var v = this.value; clearTimeout(tB); tB = setTimeout(function () { st.buscaR = v; if (st.completas) pinta(); }, 150); });
    if (st.completas) return pinta();
    completas(function (h, n) { if (st.tab === 'respuestas' && lista.isConnected) lista.innerHTML = '<p class="ayuda"><i class="giro"></i> Cargando respuestas ' + h + ' / ' + n + '…</p>'; })
      .then(function () { if (lista.isConnected) pinta(); })
      .catch(function (e) { if (!e.cortado && lista.isConnected) lista.innerHTML = '<div class="vacio">' + esc(e.message) + '</div>'; });
  }

  /* ------------------------------------------------------------ Excel (se arma en el navegador) */
  function descargarExcel(bx) {
    if (bx.getAttribute('aria-busy')) return;
    bx.setAttribute('aria-busy', 'true'); var sp = bx.querySelector('span'), txt = sp.textContent, t = performance.now();
    var listo = st.lista ? Promise.resolve() : cargarLista();
    listo.then(function () {
      if (!st.lista || !st.lista.length) throw new Error('Todavía no hay encuestas para descargar.');
      return Promise.all([completas(function (h, n) { sp.textContent = 'Preparando ' + h + ' / ' + n + '…'; }),
        window.XLSX ? null : cargarScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js')]);
    }).then(function (r) {
      var filas = r[0], enc = ['FECHA', 'VIVE EN FLANDES', 'BARRIO, VEREDA O CONJUNTO'].concat(st.preguntas.map(function (p, i) { return (i + 1) + '. ' + p; }), ['REGISTRO']);
      var ws = XLSX.utils.aoa_to_sheet([enc].concat(filas));
      ws['!cols'] = enc.map(function (h, i) { return { wch: i < 3 ? [19, 10, 28][i] : (i === enc.length - 1 ? 16 : 45) }; });
      var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Encuestas');
      var hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
      XLSX.writeFile(wb, 'DOFA_Encuestas_Jhonny_Perdomo_' + hoy + '.xlsx');
      D.tm.excel = performance.now() - t;
      D.toast('Excel descargado: ' + filas.length + ' encuestas.');
    }).catch(function (e) { if (!e.cortado) D.toast(e.message || 'No se pudo armar el Excel.', true); })
      .then(function () { bx.removeAttribute('aria-busy'); sp.textContent = txt; });
  }

  /* ------------------------------------------------------------ descargas y herramientas */
  function pintarHerr(c) {
    c.innerHTML = '<div class="card"><h2>' + IC.excel + 'Descargar en Excel</h2><p class="ayuda" style="margin-bottom:12px">Todas las encuestas con las 13 respuestas, en un archivo .xlsx.</p>' +
      '<button class="btn btn-pri" id="admXls">' + IC.excel + '<span>Descargar Excel</span></button></div>' +
      '<div class="card"><h2>' + IC.sync + 'Zonas de residencia</h2><p class="ayuda" style="margin-bottom:12px">Copia la lista actual de zonas de la app JHONNY-PERDOMO a la hoja ZONAS.</p>' +
      '<button class="btn btn-sec" id="admZonas">' + IC.sync + '<span>Sincronizar zonas</span></button></div>' +
      '<button class="btn btn-sec mas" id="admSalir">' + IC.salir + '<span>Cerrar sesión de administrador</span></button>';
    var bx = document.getElementById('admXls'), bz = document.getElementById('admZonas');
    bx.addEventListener('click', function () { descargarExcel(bx); });
    bz.addEventListener('click', function () {
      if (bz.getAttribute('aria-busy')) return;
      bz.setAttribute('aria-busy', 'true');
      pedir('admin.zonas', {}, { metodo: 'POST', cuerpo: {} }).then(function (j) {
        var d = j.data, txt = d.total + ' zonas.';
        if (d.agregadas.length) txt += ' Nuevas: ' + d.agregadas.join(', ') + '.';
        if (d.quitadas.length) txt += ' Retiradas: ' + d.quitadas.join(', ') + '.';
        if (!d.agregadas.length && !d.quitadas.length) txt += ' Ya estaban al día.';
        D.toast(txt); try { D.ls.del(NS + ':zonas'); } catch (e) {}
      }).catch(function (e) { if (!e.cortado) D.toast(e.message, true); }).then(function () { bz.removeAttribute('aria-busy'); });
    });
    document.getElementById('admSalir').addEventListener('click', salir);
  }

  window.DOFA_ADMIN = {
    abrir: function (el) { cont = el; if (tk()) panel(); else pin(); }
  };
})();
