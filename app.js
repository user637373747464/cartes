/* app.js — l'interface. La logique (rappels espacés, QCM, formules...) est dans logique.js. */
(function () {
  'use strict';
  var L = window.Logique;
  var VERSION_APP = '1.0';

  /* ================================================================== */
  /* État et outils                                                      */
  /* ================================================================== */
  var E = {
    paquets: [], cartes: [], reglages: { derniereSauvegarde: 0 },
    seance: null, edition: null, edPaquet: null, filtreTag: {}, stockageOk: true
  };
  var MACROS = { '\\R': '\\mathbb{R}', '\\N': '\\mathbb{N}', '\\Z': '\\mathbb{Z}', '\\Q': '\\mathbb{Q}', '\\C': '\\mathbb{C}',
                 '\\eps': '\\varepsilon', '\\abs': '\\left|#1\\right|', '\\norm': '\\left\\|#1\\right\\|' };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var esc = L.echapper;

  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function math(latex, centre) {
    try {
      return window.katex.renderToString(latex, { throwOnError: false, displayMode: !!centre, output: 'html',
        macros: Object.assign({}, MACROS), strict: 'ignore' });
    } catch (e) { return '<code>' + esc(latex) + '</code>'; }
  }
  function riche(texte, toutCode) { return L.faceEnHtml(texte, math, toutCode); }

  /* ================================================================== */
  /* Stockage (IndexedDB)                                                */
  /* ================================================================== */
  var bd = null;
  function ouvrirBD() {
    return new Promise(function (ok, ko) {
      if (!window.indexedDB) return ko(new Error('pas d’IndexedDB'));
      var rq = indexedDB.open('cartes-bd', 1);
      rq.onupgradeneeded = function () {
        var d = rq.result;
        d.createObjectStore('paquets', { keyPath: 'id' });
        d.createObjectStore('cartes', { keyPath: 'id' });
        d.createObjectStore('meta', { keyPath: 'cle' });
      };
      rq.onsuccess = function () { ok(rq.result); };
      rq.onerror = function () { ko(rq.error); };
    });
  }
  function tx(store, mode, fn) {
    return new Promise(function (ok, ko) {
      if (!bd) return ok(null);
      var t = bd.transaction(store, mode), s = t.objectStore(store), r = fn(s);
      t.oncomplete = function () { ok(r && r.result !== undefined ? r.result : null); };
      t.onerror = t.onabort = function () { ko(t.error); };
    });
  }
  function tout(store) { return tx(store, 'readonly', function (s) { return s.getAll(); }); }
  function mettre(store, obj) { return tx(store, 'readwrite', function (s) { return s.put(obj); }); }
  function retirer(store, id) { return tx(store, 'readwrite', function (s) { return s.delete(id); }); }
  function vider(store) { return tx(store, 'readwrite', function (s) { return s.clear(); }); }

  function securise(promesse) {
    return promesse.catch(function () {
      toast('Enregistrement impossible : stockage indisponible'); E.stockageOk = false;
    });
  }
  function sauverCarte(c) { c.modif = Date.now(); return securise(mettre('cartes', c)); }
  function sauverPaquet(p) { p.modif = Date.now(); return securise(mettre('paquets', p)); }
  function sauverReglages() { return securise(mettre('meta', Object.assign({ cle: 'reglages' }, E.reglages))); }

  /* ================================================================== */
  /* Petits calculs d'affichage                                          */
  /* ================================================================== */
  function paquetsDe(m, cat) { return E.paquets.filter(function (p) { return p.matiere === m && (!cat || p.categorie === cat); }); }
  function cartesDe(pid) { return E.cartes.filter(function (c) { return c.paquetId === pid; }); }
  function nbDues(filtre) { return L.cartesDues(E.cartes, E.paquets, filtre, Date.now()).length; }
  function pluriel(n, mot) { return n + ' ' + mot + (n > 1 ? 's' : ''); }
  function paquetDe(carte) { return E.paquets.filter(function (p) { return p.id === carte.paquetId; })[0]; }
  function carteParId(id) { return E.cartes.filter(function (c) { return c.id === id; })[0]; }

  function libelleDelai(due, maintenant) {
    if (L.debutDuJour(due) !== due) {                       // échéance « dans quelques minutes » (carte ratée)
      var min = Math.max(1, Math.round((due - maintenant) / L.MINUTE));
      return min + ' min';
    }
    var j = Math.round((due - L.debutDuJour(maintenant)) / L.JOUR);   // échéance « un jour donné »
    if (j <= 1) return 'demain';
    if (j < 14) return j + ' j';
    if (j < 60) return Math.round(j / 7) + ' sem';
    return Math.round(j / 30) + ' mois';
  }
  function etatCarte(c) {
    var now = Date.now();
    if (!c.vu) return 'nouvelle';
    if ((c.due || 0) <= now) return 'à revoir';
    return 'dans ' + libelleDelai(c.due, now).replace('demain', '1 j');
  }
  function ilYa(ts) {
    if (!ts) return 'jamais';
    var j = Math.floor((Date.now() - ts) / L.JOUR);
    return j <= 0 ? 'aujourd’hui' : j === 1 ? 'hier' : 'il y a ' + j + ' jours';
  }

  /* ================================================================== */
  /* Cartes blanches                                                     */
  /* ================================================================== */
  var ETIQUETTES = {
    exos: ['Énoncé', 'Corrigé'], defs: ['Notion', 'Définition'], demos: ['Démo à retrouver', 'Démonstration'],
    erreurs: ['Trouve l’erreur', 'Correction'], code: ['Énoncé', 'Code']
  };
  function corpsFace(face, cat, verso) {
    var toutCode = !!(cat && cat.code && verso);
    return (face.image ? '<img class="face-img" src="' + face.image + '" alt="">' : '') + (face.texte ? riche(face.texte, toutCode) : '');
  }
  function carteHtml(carte, cat, cote) {
    var verso = cote === 'verso', face = verso ? carte.verso : carte.recto;
    var lib = (ETIQUETTES[cat.id] || ['Recto', 'Verso'])[verso ? 1 : 0];
    var et = cat.etoiles && carte.etoiles > 0 ? new Array(carte.etoiles + 1).join('★') : '';
    return '<div class="carte ' + cote + '"><div class="haut"><span class="etiquette">' + lib + '</span><span class="etoiles">' + et +
           '</span></div><div class="corps">' + corpsFace(face, cat, verso) + '</div></div>';
  }

  /* ================================================================== */
  /* Navigation et vues                                                  */
  /* ================================================================== */
  var GLYPHES = { maths: '∑', physique: 'Φ', info: '{ }', si: '⚙︎', reglages: '⋯' };

  function route() { return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent); }

  function rendreOnglets(actif) {
    var html = '<div class="rang">';
    L.MATIERES.forEach(function (m) {
      var n = nbDues({ matiere: m.id });
      html += '<a href="#/' + m.id + '" class="' + (actif === m.id ? 'actif' : '') + '"><span class="glyphe">' + GLYPHES[m.id] + '</span>' + m.nom +
              (n ? '<span class="point">' + (n > 99 ? '99+' : n) + '</span>' : '') + '</a>';
    });
    html += '<a href="#/reglages" class="' + (actif === 'reglages' ? 'actif' : '') + '"><span class="glyphe">' + GLYPHES.reglages + '</span>Réglages</a></div>';
    $('#onglets').innerHTML = html;
  }

  var dernierHash = null;
  function rendre() {
    var p = route(), html = '';
    if (p[0] === 'reglages') html = vueReglages();
    else {
      var m = L.matiere(p[0]);
      if (!m) { location.replace('#/maths'); return; }
      if (!p[1]) html = vueMatiere(m);
      else {
        var cat = L.categorie(p[1]);
        if (!cat || m.categories.indexOf(cat.id) < 0) { location.replace('#/' + m.id); return; }
        if (!p[2]) html = vueCategorie(m, cat);
        else {
          var pq = E.paquets.filter(function (x) { return x.id === p[2]; })[0];
          if (!pq) { location.replace('#/' + m.id + '/' + cat.id); return; }
          html = vuePaquet(m, cat, pq);
        }
      }
    }
    $('#app').innerHTML = html;
    rendreOnglets(p[0]);
    if (dernierHash !== location.hash) window.scrollTo(0, 0);
    dernierHash = location.hash;
  }

  function bandeauSauvegarde() {
    var n = E.cartes.length;
    if (n >= 5 && Date.now() - (E.reglages.derniereSauvegarde || 0) > 7 * L.JOUR) {
      return '<div class="bandeau"><span>Pense à sauvegarder tes cartes.</span><a class="btn petit primaire" href="#/reglages">Sauvegarder</a></div>';
    }
    return '';
  }

  function vueMatiere(m) {
    var dues = nbDues({ matiere: m.id }), html = bandeauSauvegarde();
    html += '<div class="entete"><h1>' + m.nom + '</h1><p class="sous">' +
      (dues ? pluriel(dues, 'carte') + ' à réviser' : 'Rien à réviser maintenant') + '</p></div>';
    html += '<button class="btn primaire large" data-act="reviser" data-matiere="' + m.id + '"' + (dues ? '' : ' disabled') + '>Réviser' + (dues ? ' · ' + dues : '') + '</button>';
    html += '<h2>Catégories</h2><div class="liste">';
    m.categories.forEach(function (cid) {
      var cat = L.categorie(cid), ps = paquetsDe(m.id, cid), nc = 0;
      ps.forEach(function (p) { nc += cartesDe(p.id).length; });
      var d = nbDues({ matiere: m.id, categorie: cid });
      html += '<a class="ligne" href="#/' + m.id + '/' + cid + '"><div class="corps"><b>' + cat.nom + '</b><span class="gris">' +
        pluriel(ps.length, 'paquet') + ' · ' + pluriel(nc, 'carte') + '</span></div>' +
        (d ? '<span class="badge">' + d + '</span>' : '') + '<span class="chev">›</span></a>';
    });
    return html + '</div>';
  }

  function vueCategorie(m, cat) {
    var ps = paquetsDe(m.id, cat.id), dues = nbDues({ matiere: m.id, categorie: cat.id });
    var html = '<a class="retour" href="#/' + m.id + '">‹ ' + m.nom + '</a>';
    html += '<div class="entete"><h1>' + cat.nom + '</h1><p class="sous">' + pluriel(ps.length, 'paquet') + '</p></div>';
    html += '<div class="rangee"><button class="btn primaire" data-act="reviser" data-matiere="' + m.id + '" data-cat="' + cat.id + '"' + (dues ? '' : ' disabled') +
            '>Réviser' + (dues ? ' · ' + dues : '') + '</button><button class="btn" data-act="nouveau-paquet" data-matiere="' + m.id + '" data-cat="' + cat.id + '">+ Nouveau paquet</button></div>';
    if (!ps.length) return html + '<div class="vide">Aucun paquet ici.<br>Crée-en un (par exemple « Arithmétique ») avec le bouton ci-dessus.</div>';
    html += '<div class="liste">';
    ps.sort(function (a, b) { return a.nom.localeCompare(b.nom, 'fr'); }).forEach(function (p) {
      var n = cartesDe(p.id).length, d = p.muet ? 0 : nbDues({ paquetId: p.id });
      html += '<a class="ligne' + (p.muet ? ' muet' : '') + '" href="#/' + m.id + '/' + cat.id + '/' + p.id + '"><div class="corps"><b>' + esc(p.nom) + '</b><span class="gris">' +
        pluriel(n, 'carte') + (p.important ? '<span class="pastille plein">important</span>' : '') + (p.muet ? '<span class="pastille">en pause</span>' : '') +
        '</span></div>' + (d ? '<span class="badge">' + d + '</span>' : '') + '<span class="chev">›</span></a>';
    });
    return html + '</div>';
  }

  function vuePaquet(m, cat, p) {
    var toutes = cartesDe(p.id), tag = E.filtreTag[p.id] || '';
    var tags = {};
    toutes.forEach(function (c) { (c.tags || []).forEach(function (t) { tags[t.toLowerCase()] = t; }); });
    if (tag && !tags[tag.toLowerCase()]) { tag = ''; E.filtreTag[p.id] = ''; }
    var liste = toutes.filter(function (c) { return !tag || (c.tags || []).some(function (t) { return t.toLowerCase() === tag.toLowerCase(); }); });
    var dues = p.muet ? 0 : nbDues({ paquetId: p.id, tag: tag || undefined });
    var html = '<a class="retour" href="#/' + m.id + '/' + cat.id + '">‹ ' + cat.nom + '</a>';
    html += '<div class="entete"><h1>' + esc(p.nom) + '</h1><p class="sous">' + pluriel(toutes.length, 'carte') +
      (p.important ? ' · important' : '') + (p.muet ? ' · en pause' : '') + '</p></div>';
    if (p.muet) html += '<div class="bandeau"><span>Ce paquet est en pause : il n’apparaît plus dans les révisions.</span></div>';
    html += '<div class="rangee"><button class="btn primaire" data-act="reviser" data-paquet="' + p.id + '"' + (dues ? '' : ' disabled') + '>Réviser' + (dues ? ' · ' + dues : '') + '</button>' +
      '<button class="btn" data-act="reviser" data-paquet="' + p.id + '" data-tout="1"' + (liste.length ? '' : ' disabled') + '>Tout revoir</button></div>';
    if (cat.modes.indexOf('association') >= 0) {
      html += '<div class="rangee"><button class="btn" data-act="association" data-paquet="' + p.id + '"' + (liste.length >= 2 ? '' : ' disabled') + '>Associer</button>' +
        '<button class="btn" data-act="qcm" data-paquet="' + p.id + '"' + (toutes.length >= 2 ? '' : ' disabled') + '>QCM</button></div>';
    }
    html += '<div class="rangee"><button class="btn" data-act="nouvelle-carte" data-paquet="' + p.id + '">+ Nouvelle carte</button>' +
      '<button class="btn" data-act="editer-paquet" data-paquet="' + p.id + '">Réglages du paquet</button></div>';
    var cles = Object.keys(tags).sort();
    if (cles.length) {
      html += '<div class="chips"><button class="chip' + (!tag ? ' actif' : '') + '" data-act="tag" data-paquet="' + p.id + '" data-tag="">Tous</button>';
      cles.forEach(function (k) {
        html += '<button class="chip' + (tag.toLowerCase() === k ? ' actif' : '') + '" data-act="tag" data-paquet="' + p.id + '" data-tag="' + esc(tags[k]) + '">' + esc(tags[k]) + '</button>';
      });
      html += '</div>';
    }
    if (!toutes.length) return html + '<div class="vide">Ce paquet est vide.<br>Ajoute ta première carte.</div>';
    html += '<h2>' + pluriel(liste.length, 'carte') + '</h2><div class="liste">';
    liste.forEach(function (c) {
      var texte = (c.recto.texte || (c.recto.image ? '(image)' : '')).replace(/\s+/g, ' ');
      html += '<div class="ligne" data-act="editer-carte" data-carte="' + c.id + '"><div class="corps"><div class="apercu">' + esc(texte) + '</div><div class="etats">' +
        '<span>' + etatCarte(c) + '</span>' +
        (cat.etoiles && c.etoiles ? '<span class="etoiles-l">' + new Array(c.etoiles + 1).join('★') + '</span>' : '') +
        (c.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div></div><span class="chev">›</span></div>';
    });
    return html + '</div>';
  }

  function vueReglages() {
    var nc = E.cartes.length, np = E.paquets.length, octets = 0;
    E.cartes.forEach(function (c) { octets += (c.recto.image || '').length + (c.verso.image || '').length + 300; });
    var html = '<div class="entete"><h1>Réglages</h1><p class="sous">' + pluriel(np, 'paquet') + ' · ' + pluriel(nc, 'carte') + ' · ' + (octets / 1048576).toFixed(1).replace('.', ',') + ' Mo</p></div>';
    if (!E.stockageOk) html += '<div class="bandeau"><span>Le stockage de ce navigateur est indisponible : rien n’est conservé. Sauvegarde souvent.</span></div>';
    html += '<h2>Sauvegarde</h2><div class="liste"><div class="ligne" style="cursor:default"><div class="corps"><b>Dernière sauvegarde</b><span class="gris">' + ilYa(E.reglages.derniereSauvegarde) + '</span></div></div></div>';
    html += '<div class="rangee"><button class="btn primaire" data-act="exporter">Exporter mes cartes</button></div>' +
      '<div class="rangee"><button class="btn" data-act="importer">Importer (fusionner)</button><button class="btn" data-act="remplacer">Importer (tout remplacer)</button></div>' +
      '<input type="file" id="fichier-import" accept="application/json,.json" hidden>';
    html += '<p class="gris" style="margin:6px 4px">Le fichier contient tout : paquets, cartes, images. Garde-le dans Fichiers ou iCloud.</p>';
    html += '<h2>Données</h2><div class="rangee"><button class="btn" data-act="persister">Protéger les données du navigateur</button></div>' +
      '<p class="gris" style="margin:6px 4px">Sur iPhone : touche Partager puis « Sur l’écran d’accueil ». L’app devient plus sûre et s’ouvre en plein écran.</p>';
    html += '<h2>Zone dangereuse</h2><div class="rangee"><button class="btn danger" data-act="tout-effacer">Tout effacer</button></div>';
    html += '<p class="gris" style="text-align:center;margin-top:30px">Cartes ' + VERSION_APP + '</p>';
    return html;
  }

  /* ================================================================== */
  /* Feuilles : paquet et carte                                          */
  /* ================================================================== */
  function ouvrirFeuille(html) {
    var c = $('#calque'); c.innerHTML = html; c.hidden = false; document.body.style.overflow = 'hidden';
  }
  function fermerFeuille() {
    var c = $('#calque'); c.hidden = true; c.innerHTML = ''; E.edition = null; E.edPaquet = null;
    document.body.style.overflow = $('#plein').hidden ? '' : 'hidden';
  }
  function interrupteur(id, actif) { return '<button class="interrupteur" id="' + id + '" role="switch" aria-checked="' + (actif ? 'true' : 'false') + '" data-act="bascule"></button>'; }

  function feuillePaquet() {
    var p = E.edPaquet, nouveau = !p.id;
    ouvrirFeuille('<div class="feuille"><h3>' + (nouveau ? 'Nouveau paquet' : 'Réglages du paquet') + '</h3>' +
      '<label class="champ" for="champ-nom">Nom</label><input id="champ-nom" type="text" value="' + esc(p.nom) + '" placeholder="ex : Arithmétique" autocomplete="off">' +
      '<div class="bascule"><div class="t"><b>Important</b><span>Revient plus souvent</span></div>' + interrupteur('sw-important', p.important) + '</div>' +
      (nouveau ? '' : '<div class="bascule"><div class="t"><b>En pause</b><span>N’apparaît plus dans les révisions</span></div>' + interrupteur('sw-muet', p.muet) + '</div>') +
      '<div class="rangee" style="margin-top:22px"><button class="btn" data-act="fermer-feuille">Annuler</button><button class="btn primaire" data-act="sauver-paquet">Enregistrer</button></div>' +
      (nouveau ? '' : '<div class="rangee"><button class="btn danger" data-act="supprimer-paquet">Supprimer ce paquet</button></div>') + '</div>');
    if (nouveau) setTimeout(function () { var i = $('#champ-nom'); if (i) i.focus(); }, 60);
  }

  function blocFace(cote, libelle) {
    return '<label class="champ" for="champ-' + cote + '">' + libelle + '</label>' +
      '<textarea id="champ-' + cote + '" data-champ="' + cote + '" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Texte, formules $x^2$, code entre ```"></textarea>' +
      '<div class="apercu-latex" id="apercu-' + cote + '"></div>' +
      '<div class="rangee" style="margin:8px 0 0"><button class="btn petit" data-act="photo" data-cote="' + cote + '">+ Image</button></div>' +
      '<input type="file" id="fichier-' + cote + '" accept="image/*" hidden><div id="miniature-' + cote + '"></div>';
  }

  function feuilleCarte() {
    var ed = E.edition, cat = L.categorie(ed.categorie), lib = ETIQUETTES[cat.id];
    var html = '<div class="feuille"><h3>' + (ed.id ? 'Modifier la carte' : 'Nouvelle carte') + '</h3>' + blocFace('recto', 'Recto · ' + lib[0]) + blocFace('verso', 'Verso · ' + lib[1]);
    if (cat.etoiles) {
      html += '<label class="champ">Difficulté</label><div class="etoiles-choix">';
      for (var n = 0; n <= 3; n++) html += '<button data-act="etoiles" data-n="' + n + '" class="' + (ed.etoiles === n ? 'actif' : '') + '">' + (n ? new Array(n + 1).join('★') : '—') + '</button>';
      html += '</div>';
    }
    html += '<label class="champ" for="champ-tags">Tags</label><input id="champ-tags" type="text" data-champ="tags" autocapitalize="off" autocomplete="off" placeholder="séparés par des virgules (ex : colle X, DS Henri 4)">';
    html += '<div class="rangee" style="margin-top:22px"><button class="btn" data-act="fermer-feuille">Annuler</button><button class="btn primaire" data-act="sauver-carte">Enregistrer</button></div>';
    if (ed.id) html += '<div class="rangee"><button class="btn danger" data-act="supprimer-carte">Supprimer cette carte</button></div>';
    ouvrirFeuille(html + '</div>');
    $('#champ-recto').value = ed.recto.texte; $('#champ-verso').value = ed.verso.texte; $('#champ-tags').value = ed.tags;
    majApercu('recto'); majApercu('verso'); majMiniature('recto'); majMiniature('verso');
  }

  function majApercu(cote) {
    var ed = E.edition, el = $('#apercu-' + cote); if (!el || !ed) return;
    var cat = L.categorie(ed.categorie), texte = ed[cote].texte;
    el.innerHTML = texte.trim() ? '<div class="carte"><div class="corps">' + corpsFace({ texte: texte, image: null }, cat, cote === 'verso') + '</div></div>' : '';
  }
  function majMiniature(cote) {
    var ed = E.edition, el = $('#miniature-' + cote); if (!el || !ed) return;
    el.innerHTML = ed[cote].image ? '<div class="miniature"><img src="' + ed[cote].image + '" alt=""><button data-act="retirer-photo" data-cote="' + cote + '" aria-label="Retirer l’image">✕</button></div>' : '';
  }

  function fichierVersImage(fichier) {
    return new Promise(function (ok, ko) {
      var url = URL.createObjectURL(fichier), img = new Image();
      img.onload = function () {
        var max = 1400, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('image illisible')); };
      img.src = url;
    });
  }

  /* ================================================================== */
  /* Séances de révision                                                 */
  /* ================================================================== */
  function ouvrirPlein() { var el = $('#plein'); el.hidden = false; document.body.style.overflow = 'hidden'; return el; }
  function fermerPlein() {
    var el = $('#plein'); el.hidden = true; el.innerHTML = ''; E.seance = null;
    document.body.style.overflow = $('#calque').hidden ? '' : 'hidden';
    rendre();
  }
  function barre(titre, droite) {
    return '<div class="barre"><button data-act="quitter" aria-label="Fermer">✕</button><div class="titre">' + esc(titre) + '</div><div class="gris" style="min-width:40px;text-align:right">' + (droite || '') + '</div></div>';
  }
  function progres(pct) { return '<div class="progres"><i style="width:' + Math.round(pct) + '%"></i></div>'; }

  function categorieDe(carte) { var p = paquetDe(carte); return L.categorie(p ? p.categorie : 'defs'); }

  function demarrer(filtre, titre, tout) {
    var cartes = tout ? L.selection(E.cartes, E.paquets, filtre) : L.cartesDues(E.cartes, E.paquets, filtre, Date.now());
    if (!cartes.length) { toast('Aucune carte à réviser'); return; }
    var ids = L.construireSeance(cartes);
    E.seance = { type: 'classique', titre: titre, file: ids, total: ids.length, faites: 0, retourne: false, stats: { rate: 0, bien: 0, facile: 0 } };
    rendreSeance();
  }

  function rendreSeance() {
    var s = E.seance, el = ouvrirPlein();
    if (!s) return;
    if (s.type === 'classique') el.innerHTML = htmlClassique(s);
    else if (s.type === 'qcm') el.innerHTML = htmlQCM(s);
    else el.innerHTML = htmlAssociation(s);
  }

  function htmlFin(titre, lignes, boutons) {
    return barre(titre) + '<div class="scene"><div class="fin"><h2>Termin\u00e9</h2>' + lignes.map(function (l) { return '<p>' + l + '</p>'; }).join('') + '</div></div>' +
      '<div class="actions">' + boutons + '</div>';
  }

  function htmlClassique(s) {
    if (!s.file.length) {
      var st = s.stats;
      return htmlFin(s.titre, [pluriel(s.total, 'carte') + ' révisée' + (s.total > 1 ? 's' : ''),
        'Facile : ' + st.facile + ' · Bien : ' + st.bien + ' · Raté : ' + st.rate], '<button class="btn primaire" data-act="quitter">Terminer</button>');
    }
    var carte = carteParId(s.file[0]), cat = categorieDe(carte), p = paquetDe(carte);
    var html = barre(s.titre, 'reste ' + s.file.length) + progres(100 * s.faites / s.total);
    html += '<div class="scene" id="scene">' + carteHtml(carte, cat, 'recto') + (s.retourne ? carteHtml(carte, cat, 'verso') : '') + '</div><div class="actions">';
    if (!s.retourne) html += '<button class="btn primaire" data-act="retourner">Retourner</button>';
    else {
      var now = Date.now();
      ['rate', 'bien', 'facile'].forEach(function (n) {
        var r = L.planifier(carte, n, p.important, now);
        html += '<button class="btn' + (n === 'bien' ? ' primaire' : '') + '" data-act="noter" data-note="' + n + '">' + { rate: 'Raté', bien: 'Bien', facile: 'Facile' }[n] +
          '<small>' + libelleDelai(r.due, now) + '</small></button>';
      });
    }
    return html + '</div>';
  }

  function noter(note) {
    var s = E.seance, carte = carteParId(s.file[0]), p = paquetDe(carte);
    var maj = L.planifier(carte, note, p.important, Date.now());
    Object.keys(maj).forEach(function (k) { carte[k] = maj[k]; });
    sauverCarte(carte);
    s.stats[note]++; if (note !== 'rate') s.faites++;
    s.file = L.fileApresNote(s.file, note); s.retourne = false;
    rendreSeance();
  }

  /* ----- QCM ----- */
  function demarrerQCM(pid) {
    var p = E.paquets.filter(function (x) { return x.id === pid; })[0];
    var cartes = cartesDe(pid).filter(function (c) { return (c.verso.texte || c.verso.image); });
    if (cartes.length < 2) { toast('Il faut au moins 2 cartes'); return; }
    var ids = L.melanger(cartes).slice(0, 10).map(function (c) { return c.id; });
    E.seance = { type: 'qcm', titre: 'QCM · ' + p.nom, paquetId: pid, ids: ids, index: 0, score: 0, rates: [], courant: null };
    questionSuivante();
  }
  function candidatesQCM(carte) {
    var p = paquetDe(carte), memes = cartesDe(p.id).filter(function (c) { return c.id !== carte.id; });
    var autres = E.cartes.filter(function (c) {
      var q = paquetDe(c); return q && q.matiere === p.matiere && q.categorie === p.categorie && q.id !== p.id && !q.muet;
    });
    return memes.concat(L.melanger(autres));
  }
  function questionSuivante() {
    var s = E.seance;
    while (s.index < s.ids.length) {
      var carte = carteParId(s.ids[s.index]), q = L.fabriquerQCM(carte, candidatesQCM(carte));
      if (q) { s.courant = { q: q, choix: null }; rendreSeance(); return; }
      s.index++;
    }
    s.courant = null; rendreSeance();
  }
  function htmlQCM(s) {
    if (!s.courant) {
      return htmlFin(s.titre, [s.ids.length ? 'Score : ' + s.score + ' / ' + s.ids.length : 'Pas assez de cartes différentes pour faire un QCM.'].concat(
        s.rates.length ? ['À revoir : ' + s.rates.map(esc).join(', ')] : []),
        '<button class="btn" data-act="quitter">Fermer</button><button class="btn primaire" data-act="qcm" data-paquet="' + s.paquetId + '">Rejouer</button>');
    }
    var c = s.courant, carte = carteParId(c.q.carteId), cat = categorieDe(carte);
    var html = barre(s.titre, (s.index + 1) + '/' + s.ids.length) + progres(100 * s.index / s.ids.length);
    html += '<div class="scene">' + carteHtml({ recto: c.q.question, verso: { texte: '' }, etoiles: 0 }, cat, 'recto').replace(/<span class="etiquette">[^<]*<\/span>/, '<span class="etiquette">Quelle est la bonne réponse ?</span>');
    html += '<div class="choix">';
    c.q.options.forEach(function (o, i) {
      var cls = 'option';
      if (c.choix !== null) cls += ' fige' + (o.ok ? ' bonne' : (i === c.choix ? ' mauvaise' : ''));
      html += '<button class="' + cls + '" data-act="qcm-choix" data-i="' + i + '">' + corpsFace(o.face, cat, true) + '</button>';
    });
    html += '</div></div><div class="actions">' + (c.choix === null ? '' : '<button class="btn primaire" data-act="qcm-suivant">' + (s.index + 1 >= s.ids.length ? 'Terminer' : 'Suivant') + '</button>') + '</div>';
    return html;
  }
  function qcmChoix(i) {
    var s = E.seance, c = s.courant; if (!c || c.choix !== null) return;
    c.choix = i;
    if (c.q.options[i].ok) s.score++; else { var carte = carteParId(c.q.carteId); s.rates.push((carte.recto.texte || 'image').split('\n')[0].slice(0, 40)); }
    rendreSeance();
  }

  /* ----- Association 3 x 4 ----- */
  function demarrerAssociation(pid) {
    var p = E.paquets.filter(function (x) { return x.id === pid; })[0];
    var tag = E.filtreTag[pid] || '';
    var cartes = L.selection(E.cartes.filter(function (c) { return c.paquetId === pid; }), [Object.assign({}, p, { muet: false })], { tag: tag || undefined });
    var tuiles = L.fabriquerAssociation(cartes, 6);
    if (tuiles.length < 4) { toast('Il faut au moins 2 cartes'); return; }
    E.seance = { type: 'assoc', titre: 'Associer · ' + p.nom, paquetId: pid, tuiles: tuiles, choisie: null, trouvees: {}, fautes: 0, faux: [] };
    rendreSeance();
  }
  function htmlAssociation(s) {
    var nb = s.tuiles.length / 2, trouvees = Object.keys(s.trouvees).length / 2, cat = L.categorie(paquetDe({ paquetId: s.paquetId }).categorie);
    var fini = trouvees === nb;
    var html = barre(s.titre, s.fautes + (s.fautes > 1 ? ' fautes' : ' faute')) + progres(100 * trouvees / nb);
    html += '<div class="scene"><p class="pas-a-pas">Relie chaque notion à sa définition</p>';
    var sel = s.choisie !== null ? s.tuiles[s.choisie] : null;
    html += '<div class="selection-pleine">' + (sel ? corpsFace(sel.face, cat, sel.cote === 'verso') : '') + '</div>';
    html += '<div class="grille">';
    s.tuiles.forEach(function (t, i) {
      var cls = 'tuile' + (t.cote === 'verso' ? ' verso-cote' : '') + (s.choisie === i ? ' choisie' : '') + (s.trouvees[i] ? ' trouvee' : '') + (s.faux.indexOf(i) >= 0 ? ' faux' : '');
      html += '<button class="' + cls + '" data-act="tuile" data-i="' + i + '"><div class="contenu">' + corpsFace(t.face, cat, t.cote === 'verso') + '</div></button>';
    });
    html += '</div>';
    if (fini) html += '<div class="fin" style="padding:24px 0 6px"><h2>Termin\u00e9</h2><p>' + (s.fautes ? pluriel(s.fautes, 'faute') : 'Sans faute !') + '</p></div>';
    html += '</div><div class="actions">' + (fini ? '<button class="btn" data-act="quitter">Fermer</button><button class="btn primaire" data-act="association" data-paquet="' + s.paquetId + '">Rejouer</button>' : '') + '</div>';
    return html;
  }
  function tuile(i) {
    var s = E.seance; if (s.trouvees[i] || s.faux.length) return;
    if (s.choisie === null) { s.choisie = i; return rendreSeance(); }
    if (s.choisie === i) { s.choisie = null; return rendreSeance(); }
    var a = s.tuiles[s.choisie], b = s.tuiles[i];
    if (a.cote === b.cote) { s.choisie = i; return rendreSeance(); }
    if (L.estPaire(a, b)) { s.trouvees[s.choisie] = 1; s.trouvees[i] = 1; s.choisie = null; return rendreSeance(); }
    s.fautes++; s.faux = [s.choisie, i]; s.choisie = null; rendreSeance();
    setTimeout(function () { if (E.seance === s) { s.faux = []; rendreSeance(); } }, 520);
  }

  /* ================================================================== */
  /* Sauvegarde : export / import                                        */
  /* ================================================================== */
  function dateCourte() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function exporter() {
    var json = L.exporterEtat(E.paquets, E.cartes, Date.now()), nom = 'cartes-' + dateCourte() + '.json';
    var fichier = new File([json], nom, { type: 'application/json' });
    function fini() { E.reglages.derniereSauvegarde = Date.now(); sauverReglages(); rendre(); toast('Sauvegarde créée'); }
    function telecharger() {
      var a = document.createElement('a'); a.href = URL.createObjectURL(fichier); a.download = nom; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); fini();
    }
    if (navigator.canShare && navigator.canShare({ files: [fichier] }) && /iPhone|iPad|Android/.test(navigator.userAgent)) {
      navigator.share({ files: [fichier], title: nom }).then(fini).catch(function (e) { if (e && e.name !== 'AbortError') telecharger(); });
    } else telecharger();
  }
  function importer(fichier, remplacer) {
    fichier.text().then(function (texte) {
      var r = L.lireSauvegarde(texte);
      if (!r.ok) return toast(r.erreur);
      var msg = remplacer ? 'Tout remplacer par ' + pluriel(r.paquets.length, 'paquet') + ' et ' + pluriel(r.cartes.length, 'carte') + ' ? Tes cartes actuelles seront effacées.'
                          : 'Ajouter ' + pluriel(r.paquets.length, 'paquet') + ' et ' + pluriel(r.cartes.length, 'carte') + ' ?';
      if (!confirm(msg)) return;
      var paquets = remplacer ? r.paquets : L.fusionner(E.paquets, r.paquets);
      var cartes = remplacer ? r.cartes : L.fusionner(E.cartes, r.cartes);
      var ecrire = remplacer ? Promise.all([vider('paquets'), vider('cartes')]) : Promise.resolve();
      ecrire.then(function () { return Promise.all(paquets.map(function (p) { return mettre('paquets', p); }).concat(cartes.map(function (c) { return mettre('cartes', c); }))); })
        .then(function () { E.paquets = paquets; E.cartes = cartes; rendre(); toast('Import terminé'); })
        .catch(function () { toast('Import impossible'); });
    });
  }

  /* ================================================================== */
  /* Actions (clics)                                                     */
  /* ================================================================== */
  var actions = {
    'reviser': function (el) {
      var d = el.dataset, filtre = {}, titre = 'Révision';
      if (d.paquet) { var p = E.paquets.filter(function (x) { return x.id === d.paquet; })[0]; filtre = { paquetId: d.paquet, tag: E.filtreTag[d.paquet] || undefined }; titre = p.nom; }
      else if (d.cat) { filtre = { matiere: d.matiere, categorie: d.cat }; titre = L.matiere(d.matiere).nom + ' · ' + L.categorie(d.cat).nom; }
      else { filtre = { matiere: d.matiere }; titre = L.matiere(d.matiere).nom; }
      demarrer(filtre, titre, !!d.tout);
    },
    'retourner': function () { E.seance.retourne = true; rendreSeance(); var sc = $('#scene'); if (sc) setTimeout(function () { sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' }); }, 30); },
    'noter': function (el) { noter(el.dataset.note); },
    'quitter': function () { fermerPlein(); },
    'qcm': function (el) { demarrerQCM(el.dataset.paquet); },
    'qcm-choix': function (el) { qcmChoix(+el.dataset.i); },
    'qcm-suivant': function () { E.seance.index++; questionSuivante(); },
    'association': function (el) { demarrerAssociation(el.dataset.paquet); },
    'tuile': function (el) { tuile(+el.dataset.i); },
    'tag': function (el) { E.filtreTag[el.dataset.paquet] = el.dataset.tag; rendre(); },

    'nouveau-paquet': function (el) { E.edPaquet = { id: null, matiere: el.dataset.matiere, categorie: el.dataset.cat, nom: '', important: false, muet: false }; feuillePaquet(); },
    'editer-paquet': function (el) { var p = E.paquets.filter(function (x) { return x.id === el.dataset.paquet; })[0]; E.edPaquet = Object.assign({}, p); feuillePaquet(); },
    'bascule': function (el) { el.setAttribute('aria-checked', el.getAttribute('aria-checked') === 'true' ? 'false' : 'true'); },
    'sauver-paquet': function () {
      var nom = $('#champ-nom').value.trim(); if (!nom) return toast('Donne un nom au paquet');
      var ed = E.edPaquet, p;
      if (ed.id) { p = E.paquets.filter(function (x) { return x.id === ed.id; })[0]; }
      else { p = { id: L.nouvelId('p'), matiere: ed.matiere, categorie: ed.categorie, cree: Date.now() }; E.paquets.push(p); }
      p.nom = nom; p.important = $('#sw-important').getAttribute('aria-checked') === 'true';
      p.muet = $('#sw-muet') ? $('#sw-muet').getAttribute('aria-checked') === 'true' : false;
      sauverPaquet(p); fermerFeuille(); rendre();
    },
    'supprimer-paquet': function () {
      var ed = E.edPaquet, n = cartesDe(ed.id).length;
      if (!confirm('Supprimer ce paquet et ses ' + pluriel(n, 'carte') + ' ?')) return;
      var ids = cartesDe(ed.id).map(function (c) { return c.id; });
      E.cartes = E.cartes.filter(function (c) { return c.paquetId !== ed.id; });
      E.paquets = E.paquets.filter(function (p) { return p.id !== ed.id; });
      securise(Promise.all(ids.map(function (id) { return retirer('cartes', id); }).concat([retirer('paquets', ed.id)])));
      fermerFeuille(); location.hash = '#/' + ed.matiere + '/' + ed.categorie; rendre();
    },

    'nouvelle-carte': function (el) {
      var p = E.paquets.filter(function (x) { return x.id === el.dataset.paquet; })[0];
      E.edition = { id: null, paquetId: p.id, categorie: p.categorie, recto: { texte: '', image: null }, verso: { texte: '', image: null }, etoiles: 0, tags: '' };
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
      feuilleCarte();
    },
    'editer-carte': function (el) {
      var c = carteParId(el.dataset.carte), p = paquetDe(c);
      E.edition = { id: c.id, paquetId: c.paquetId, categorie: p.categorie, recto: Object.assign({}, c.recto), verso: Object.assign({}, c.verso), etoiles: c.etoiles || 0, tags: (c.tags || []).join(', ') };
      feuilleCarte();
    },
    'etoiles': function (el) { E.edition.etoiles = +el.dataset.n; $$('.etoiles-choix button').forEach(function (b) { b.classList.toggle('actif', +b.dataset.n === E.edition.etoiles); }); },
    'photo': function (el) { $('#fichier-' + el.dataset.cote).click(); },
    'retirer-photo': function (el) { E.edition[el.dataset.cote].image = null; majMiniature(el.dataset.cote); },
    'fermer-feuille': function () { fermerFeuille(); },
    'sauver-carte': function () {
      var ed = E.edition, vide = function (f) { return !f.texte.trim() && !f.image; };
      if (vide(ed.recto) || vide(ed.verso)) return toast('Remplis le recto et le verso');
      var c = ed.id ? carteParId(ed.id) : { id: L.nouvelId('c'), paquetId: ed.paquetId, niveau: 0, due: 0, vu: 0, reussites: 0, cree: Date.now() };
      c.recto = { texte: ed.recto.texte.replace(/\s+$/, ''), image: ed.recto.image }; c.verso = { texte: ed.verso.texte.replace(/\s+$/, ''), image: ed.verso.image };
      c.etoiles = L.categorie(ed.categorie).etoiles ? ed.etoiles : 0; c.tags = L.nettoyerTags(ed.tags);
      if (!ed.id) E.cartes.push(c);
      sauverCarte(c); fermerFeuille(); rendre(); toast(ed.id ? 'Carte modifiée' : 'Carte ajoutée');
    },
    'supprimer-carte': function () {
      if (!confirm('Supprimer cette carte ?')) return;
      var id = E.edition.id; E.cartes = E.cartes.filter(function (c) { return c.id !== id; });
      securise(retirer('cartes', id)); fermerFeuille(); rendre();
    },

    'exporter': exporter,
    'importer': function () { var f = $('#fichier-import'); f.dataset.remplacer = ''; f.click(); },
    'remplacer': function () { var f = $('#fichier-import'); f.dataset.remplacer = '1'; f.click(); },
    'persister': function () {
      if (!navigator.storage || !navigator.storage.persist) return toast('Non disponible sur ce navigateur');
      navigator.storage.persist().then(function (ok) { toast(ok ? 'Données protégées' : 'Le navigateur a refusé : installe l’app sur l’écran d’accueil'); });
    },
    'tout-effacer': function () {
      if (!confirm('Effacer TOUS les paquets et cartes ? Cette action est définitive.')) return;
      if (!confirm('Vraiment tout effacer ? As-tu fait une sauvegarde ?')) return;
      Promise.all([vider('paquets'), vider('cartes')]).then(function () { E.paquets = []; E.cartes = []; rendre(); toast('Tout est effacé'); });
    }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (el && actions[el.dataset.act]) { e.preventDefault(); actions[el.dataset.act](el, e); return; }
    if (e.target.id === 'calque') fermerFeuille();
    if (e.target.closest('#scene') && E.seance && E.seance.type === 'classique' && !E.seance.retourne && E.seance.file.length) actions.retourner();
  });

  document.addEventListener('input', function (e) {
    var champ = e.target.dataset && e.target.dataset.champ;
    if (!champ || !E.edition) return;
    if (champ === 'tags') E.edition.tags = e.target.value;
    else { E.edition[champ].texte = e.target.value; majApercu(champ); }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'fichier-import' && t.files[0]) { importer(t.files[0], !!t.dataset.remplacer); t.value = ''; }
    var m = t.id && t.id.match(/^fichier-(recto|verso)$/);
    if (m && t.files[0] && E.edition) {
      fichierVersImage(t.files[0]).then(function (url) { E.edition[m[1]].image = url; majMiniature(m[1]); })
        .catch(function () { toast('Image illisible'); });
      t.value = '';
    }
  });

  window.addEventListener('hashchange', rendre);

  /* ================================================================== */
  /* Démarrage                                                           */
  /* ================================================================== */
  function demarrage() {
    ouvrirBD().then(function (d) { bd = d; return Promise.all([tout('paquets'), tout('cartes'), tout('meta')]); })
      .then(function (r) {
        E.paquets = r[0] || []; E.cartes = r[1] || [];
        (r[2] || []).forEach(function (m) { if (m.cle === 'reglages') E.reglages = Object.assign(E.reglages, m); });
      })
      .catch(function () { E.stockageOk = false; })
      .then(function () {
        if (!location.hash) location.replace('#/maths');
        rendre();
        if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () {});
      });
  }
  window.__cartes = { E: E, rendre: rendre };   // pour les tests
  demarrage();
})();
