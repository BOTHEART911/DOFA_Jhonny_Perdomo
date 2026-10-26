/* ============================================================================
 * red.js — TRANSPORTE (copia de la pieza del ecosistema Jhonny, 25/10/2026 · DOFA)
 * ----------------------------------------------------------------------------
 * Pieza IDÉNTICA en las 7 apps. Se carga antes de app.js. No toca el DOM.
 * Cada app la usa desde su api(); la app decide qué parámetros manda.
 *
 *  · Token de sesión tomado AL DESPACHAR (lo da la app con RED.sesion()).
 *    Si al volver la respuesta la sesión activa ya es otra, la respuesta se
 *    descarta: una sesión vieja nunca pisa la nueva.
 *  · rid en toda escritura. Reintento SOLO con el mismo rid y SOLO ante red
 *    caída, tiempo agotado o el 404/HTML de eco de Google. Nunca un reintento
 *    ciego de una escritura: si el CORE todavía no sabe de rid (versión
 *    vieja desplegada), la escritura NO se reintenta.
 *  · Corte al cambiar de vista: las lecturas de la vista anterior se abortan,
 *    salvo que la vista nueva pida exactamente lo mismo (la hereda). Los
 *    guardados nunca se cortan.
 *  · Lecturas de fondo (silenciosas) en cola: detrás de lo de primer plano,
 *    máximo 2 a la vez, y se descartan al cambiar de vista.
 *  · Versión del backend: cada respuesta trae v; si cambia, la app se
 *    recarga sola (sin guardados en vuelo y una sola vez por versión).
 *  · Medición de pantalla: ms de cada llamada y KB, en memoria (RED.medidas()).
 *  · 12/10/2026 · Fase 3: quien guarda su propia cola (el escáner) puede pasar
 *    {rid} fijo (se conserva en cada reintento), {reintentos} y {tiempo}.
 *  · 12/10/2026 · Fase 4: pub.paquete es lectura; una lectura {persistente}
 *    ya no se corta al cambiar de vista mientras está en vuelo (antes solo
 *    se respetaba en la cola de fondo).
 * ============================================================================ */
(function (raiz) {
  'use strict';
  if (raiz.RED) return;

  var NS = (raiz.STORAGE_NS || (raiz.MARCA && raiz.MARCA.STORAGE_NS) || 'jp');
  var LS_V = NS + ':coreV';

  /* Lecturas puras (misma lista que LECTURAS del backend DOFA). Lo que no esté
     aquí se trata como escritura: lleva rid y nunca se corta. */
  var LECTURAS = {};
  ('ping zonas existe admin.lista admin.ficha admin.pagina')
    .split(/\s+/).forEach(function (a) { if (a) LECTURAS[a] = true; });

  var T_LECTURA = 30000, T_ESCRITURA = 60000;
  var ESPERAS = [700, 1800];          // dos reintentos como máximo
  var FONDO_MAX = 2;

  var gen = 0;                        // generación de vista
  var vuelo = {};                     // clave → {prom, ctrl, gen, lectura}
  var escriturasEnVuelo = 0;
  var coreConRid = true;              // el backend DOFA entiende rid desde su primera versión
  var fondoCola = [], fondoActivas = 0;
  var proveedorSesion = function () { return null; };
  var medidas = [];
  var recargando = false;

  function ahora() { return (raiz.performance && performance.now) ? performance.now() : Date.now(); }
  function nuevoRid() {
    var a = Math.random().toString(36).slice(2, 10), b = Date.now().toString(36);
    return 'r' + b + a;
  }
  function esLectura(accion) { return !!LECTURAS[accion]; }
  function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function vigilarVersion(v) {
    if (!v) return;
    coreConRid = true;
    var previa = '';
    try { previa = sessionStorage.getItem(LS_V) || ''; } catch (e) {}
    if (!previa) { try { sessionStorage.setItem(LS_V, v); } catch (e) {} return; }
    if (previa === v || recargando) return;
    try { sessionStorage.setItem(LS_V, v); } catch (e) {}
    /* Backend nuevo desplegado: la app abierta se recarga sola cuando no hay
       guardados en vuelo (para que lo desplegado se vea sin cerrarla). */
    var intento = function () {
      if (escriturasEnVuelo > 0) return setTimeout(intento, 800);
      /* No se recarga encima de una hoja abierta (se perdería lo escrito) ni
         con el escáner encendido; la app puede sumar su propia condición. */
      var capa = raiz.document && raiz.document.getElementById('layer');
      if (capa && capa.children.length) return setTimeout(intento, 3000);
      if (raiz.RED_NO_RECARGAR && raiz.RED_NO_RECARGAR()) return setTimeout(intento, 3000);
      recargando = true;
      try { location.reload(); } catch (e) {}
    };
    setTimeout(intento, 300);
  }

  /* ¿Falla de red / eco de Google? (las únicas que se reintentan) */
  function esReintentable(err) {
    return err && (err.red || err.eco || err.tiempo);
  }

  async function unIntento(url, init, ms) {
    var ctrl = init.ctrl;
    var tmr = setTimeout(function () { ctrl.__tiempo = true; try { ctrl.abort(); } catch (e) {} }, ms);
    try {
      var r;
      try { r = await fetch(url, Object.assign({}, init.fetchInit, { signal: ctrl.signal })); }
      catch (e) {
        if (ctrl.__tiempo) { var t = new Error('Tiempo de espera agotado'); t.tiempo = true; throw t; }
        if (ctrl.__cortado || (e && e.name === 'AbortError')) { var c = new Error('cortado'); c.cortado = true; throw c; }
        var n = new Error('Sin conexión'); n.red = true; throw n;
      }
      var txt = await r.text();
      if (r.status === 404 || /^\s*</.test(txt)) { var g = new Error('Respuesta de Google no válida'); g.eco = true; throw g; }
      var json;
      try { json = JSON.parse(txt); } catch (e) { var j = new Error('Respuesta no válida del servidor'); j.eco = true; throw j; }
      json.__kb = txt.length / 1024;
      return json;
    } finally { clearTimeout(tmr); }
  }

  async function ejecutar(url, op) {
    var lectura = op.lectura;
    var t0 = ahora(), intento = 0, ultimo;
    while (true) {
      var ctrl = new AbortController();
      if (op.ent) op.ent.ctrl = ctrl;
      try {
        var json = await unIntento(url, { ctrl: ctrl, fetchInit: op.fetchInit }, op.tiempo || (lectura ? T_LECTURA : T_ESCRITURA));
        medidas.push({ a: op.accion, ms: Math.round(ahora() - t0), kb: Math.round((json.__kb || 0) * 10) / 10, n: intento + 1, t: Date.now() });
        if (medidas.length > 300) medidas.shift();
        vigilarVersion(json.v);
        return json;
      } catch (err) {
        ultimo = err;
        if (err.cortado) throw err;
        /* Escritura: reintentar solo si el CORE ya deduplica por rid. */
        var maxR = (op.reintentos != null) ? op.reintentos : ESPERAS.length;
        var puede = esReintentable(err) && intento < maxR && (lectura || ((coreConRid || op.ridDado) && op.rid));
        if (!puede) throw err;
        await dormir(ESPERAS[intento]);
        intento++;
      }
    }
  }

  function bombearFondo() {
    while (fondoActivas < FONDO_MAX && fondoCola.length) {
      var tarea = fondoCola.shift();
      if (tarea.gen !== gen && !tarea.persistente) { tarea.rechazar(cortadoErr()); continue; }
      fondoActivas++;
      tarea.correr().then(tarea.resolver, tarea.rechazar).then(function () { fondoActivas--; bombearFondo(); });
    }
  }
  function cortadoErr() { var c = new Error('cortado'); c.cortado = true; return c; }

  /* ---------------------------------------------------------------------------
     RED.pedir(base, accion, params, {metodo, cuerpo, fondo, persistente})
     Devuelve el JSON {ok, data|error, v}. Rechaza con err.cortado si la vista
     se fue; la app decide qué hacer (normalmente: nada).
     --------------------------------------------------------------------------- */
  function pedir(base, accion, params, op) {
    op = op || {};
    var lectura = esLectura(accion);
    var ses = proveedorSesion() || {};
    var q = Object.assign({ action: accion }, params || {});
    var cuerpo = op.cuerpo ? Object.assign({}, op.cuerpo) : null;
    var metodo = op.metodo || 'GET';
    if (ses.tk) { if (metodo === 'POST' && cuerpo) cuerpo.tk = ses.tk; else q.tk = ses.tk; }
    var rid = '';
    if (!lectura) { rid = op.rid || nuevoRid(); if (metodo === 'POST' && cuerpo) cuerpo.rid = rid; else q.rid = rid; }
    var url = base + '?' + new URLSearchParams(q).toString();
    var fetchInit = { method: metodo };
    if (metodo === 'POST') { fetchInit.headers = { 'Content-Type': 'text/plain;charset=utf-8' }; fetchInit.body = JSON.stringify(cuerpo || {}); }
    var clave = lectura ? (metodo + ' ' + url + ' ' + (fetchInit.body || '')) : '';
    var sesionAlDespachar = ses.id || '';

    /* Herencia: misma lectura en vuelo → se adopta en la vista actual */
    if (lectura && vuelo[clave]) { vuelo[clave].gen = gen; return vuelo[clave].prom.then(revisarSesion); }

    var ent = { gen: gen, ctrl: null, lectura: lectura, persistente: !!op.persistente };
    var opInt = { accion: accion, lectura: lectura, rid: rid, fetchInit: fetchInit, ent: ent, ridDado: !!op.rid, reintentos: op.reintentos, tiempo: op.tiempo };
    var correr = function () { return ejecutar(url, opInt); };

    var prom;
    if (lectura && op.fondo) {
      prom = new Promise(function (res, rej) {
        fondoCola.push({ gen: gen, persistente: !!op.persistente, correr: correr, resolver: res, rechazar: rej });
        bombearFondo();
      });
    } else {
      if (!lectura) escriturasEnVuelo++;
      prom = correr();
      if (!lectura) prom = prom.finally(function () { escriturasEnVuelo--; });
    }
    if (lectura) {
      ent.prom = prom;
      vuelo[clave] = ent;
      prom = prom.finally(function () { if (vuelo[clave] === ent) delete vuelo[clave]; });
      ent.prom = prom;
    }
    return prom.then(revisarSesion);

    function revisarSesion(json) {
      var hoy = (proveedorSesion() || {}).id || '';
      if (sesionAlDespachar && hoy !== sesionAlDespachar) throw Object.assign(new Error('sesión cambiada'), { cortado: true });
      return json;
    }
  }

  /* La app lo llama al cambiar de vista (render). Las lecturas de la vista
     que se va se cortan después de que la nueva tuvo ocasión de heredarlas. */
  function nuevaVista() {
    gen++;
    var g = gen;
    setTimeout(function () {
      Object.keys(vuelo).forEach(function (k) {
        var e = vuelo[k];
        if (e && e.lectura && e.gen < g && e.ctrl && !e.persistente) {
          e.ctrl.__cortado = true;
          try { e.ctrl.abort(); } catch (x) {}
        }
      });
    }, 60);
  }

  raiz.RED = {
    pedir: pedir,
    nuevaVista: nuevaVista,
    esLectura: esLectura,
    sesion: function (fn) { proveedorSesion = fn; },
    medidas: function () { return medidas.slice(); },
    tabla: function () { try { console.table(medidas.slice(-40)); } catch (e) {} },
    get escriturasEnVuelo() { return escriturasEnVuelo; }
  };
})(typeof self !== 'undefined' ? self : this);
