/* ============================================================
   marca.js — DOFA · Encuesta Jhonny Perdomo (sitio web)
   Todo lo que cambia de una campaña a otra vive aquí.
   ============================================================ */
(function (raiz) {
  'use strict';
  raiz.MARCA = {
    STORAGE_NS:   'jpdofa',          /* propio: no pisa las apps Jhonny del mismo origen */
    CANDIDATO:    'Jhonny Perdomo',
    PN_CANDIDATO: 'Jhonny',
    MUNICIPIO:    'Flandes',
    DEPARTAMENTO: 'Tolima',
    LEMA:         'Soy de Flandes',
    COLOR:        '#007BFF',
    COLOR_700:    '#0056B3',

    /* /exec del backend DOFA (proyecto Apps Script ligado a la hoja DOFA). */
    API_URL: 'https://script.google.com/macros/s/AKfycbzEXEobNCza85qtr_Bh5mJVGPtzY5yzESj2GMPnUWN5bCHK9p1Arl4WDTX8NyAg1FYAXg/exec',

    APP_ICON: 'img/logo.png'
  };
})(typeof self !== 'undefined' ? self : this);
