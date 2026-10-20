/* logique.js — toute la « réflexion » de l'app, sans rien d'affiché.
 * Ces fonctions sont testées sous Node (tests/test_logique.js).
 * Chargé dans le navigateur, tout est dans l'objet global  Logique. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Logique = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 1. Matières, catégories : c'est ici qu'on change l'organisation.    */
  /* ------------------------------------------------------------------ */
  var CATEGORIES = {
    exos:    { id: 'exos',    nom: 'Exos',        etoiles: true,  modes: ['classique'] },
    defs:    { id: 'defs',    nom: 'Définitions', etoiles: false, modes: ['classique', 'association', 'qcm'] },
    demos:   { id: 'demos',   nom: 'Démos',       etoiles: false, modes: ['classique'] },
    erreurs: { id: 'erreurs', nom: 'Erreurs',     etoiles: false, modes: ['classique'] },
    code:    { id: 'code',    nom: 'Code',        etoiles: true,  modes: ['classique'], code: true }
  };
  var MATIERES = [
    { id: 'maths',    nom: 'Maths',    categories: ['exos', 'defs', 'demos', 'erreurs'] },
    { id: 'physique', nom: 'Physique', categories: ['exos', 'defs', 'demos', 'erreurs'] },
    { id: 'info',     nom: 'Info',     categories: ['code', 'defs'] },
    { id: 'si',       nom: 'SI',       categories: ['exos', 'defs', 'demos'] }
  ];

  function matiere(id) { return MATIERES.filter(function (m) { return m.id === id; })[0] || null; }
  function categorie(id) { return CATEGORIES[id] || null; }

  /* ------------------------------------------------------------------ */
  /* 2. Outils                                                           */
  /* ------------------------------------------------------------------ */
  var MINUTE = 60 * 1000, JOUR = 24 * 60 * MINUTE;

  function debutDuJour(t) { var d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function jourSuivant(t, n) { var d = new Date(debutDuJour(t)); d.setDate(d.getDate() + n); return d.getTime(); }

  function melanger(tableau, hasard) {
    var r = hasard || Math.random, a = tableau.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x;
    }
    return a;
  }

  function nouvelId(prefixe) {
    return (prefixe || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function nettoyerTags(texte) {
    var vus = {}, sortie = [];
    String(texte || '').split(/[,;\n]+/).forEach(function (t) {
      t = t.trim().replace(/^#/, '').replace(/\s+/g, ' ');
      if (t && !vus[t.toLowerCase()]) { vus[t.toLowerCase()] = 1; sortie.push(t); }
    });
    return sortie;
  }

  /* ------------------------------------------------------------------ */
  /* 3. Planification des révisions                                      */
  /* ------------------------------------------------------------------ */
  // Jours d'attente après chaque réussite : niveau 0 -> aujourd'hui, 1 -> 1 jour, 2 -> 3 jours...
  var ECHELLE_JOURS = [0, 1, 3, 7, 14, 30, 60, 120];
  var FACTEUR_IMPORTANT = 0.6;     // un paquet « important » revient plus souvent

  function intervalleJours(niveau, important) {
    var j = ECHELLE_JOURS[Math.min(niveau, ECHELLE_JOURS.length - 1)];
    if (j === 0) return 0;
    if (important) j = Math.max(1, Math.round(j * FACTEUR_IMPORTANT));
    return j;
  }

  // note : 'rate' | 'bien' | 'facile'. Renvoie les champs à mettre à jour sur la carte.
  function planifier(carte, note, paquetImportant, maintenant) {
    var niveau = carte.niveau || 0, due;
    if (note === 'rate') {
      niveau = 0;
      due = maintenant + 10 * MINUTE;
    } else {
      niveau = Math.min(niveau + (note === 'facile' ? 2 : 1), ECHELLE_JOURS.length - 1);
      due = jourSuivant(maintenant, intervalleJours(niveau, paquetImportant));
    }
    return { niveau: niveau, due: due, vu: (carte.vu || 0) + 1, derniere: maintenant,
             reussites: (carte.reussites || 0) + (note === 'rate' ? 0 : 1) };
  }

  function estDue(carte, maintenant) { return (carte.due || 0) <= maintenant; }

  // Cartes à réviser : paquet non muet, carte due. `filtre` : {matiere, categorie, paquetId, tag}
  function cartesDues(cartes, paquets, filtre, maintenant) {
    return selection(cartes, paquets, filtre).filter(function (c) { return estDue(c, maintenant); });
  }

  function selection(cartes, paquets, filtre) {
    filtre = filtre || {};
    var parId = {};
    paquets.forEach(function (p) { parId[p.id] = p; });
    return cartes.filter(function (c) {
      var p = parId[c.paquetId];
      if (!p || p.muet) return false;
      if (filtre.matiere && p.matiere !== filtre.matiere) return false;
      if (filtre.categorie && p.categorie !== filtre.categorie) return false;
      if (filtre.paquetId && p.id !== filtre.paquetId) return false;
      if (filtre.tag && (c.tags || []).map(function (t) { return t.toLowerCase(); })
            .indexOf(filtre.tag.toLowerCase()) < 0) return false;
      return true;
    });
  }

  // File d'attente d'une séance : les plus en retard d'abord (mélangées par paquet de même retard)
  function construireSeance(cartes, hasard) {
    return melanger(cartes, hasard).map(function (c) { return c.id; });
  }

  // Après une note : la carte quitte la tête de file ; si « raté », elle revient quelques cartes plus loin.
  function fileApresNote(file, note) {
    var f = file.slice(), id = f.shift();
    if (note === 'rate') f.splice(Math.min(3, f.length), 0, id);
    return f;
  }

  /* ------------------------------------------------------------------ */
  /* 4. QCM et association (pour les définitions)                        */
  /* ------------------------------------------------------------------ */
  function cle(face) { return ((face && face.texte) || '').trim().toLowerCase() + '|' + (face && face.image ? 'img' + face.image.length : ''); }

  // Une question de QCM : la face recto de la carte, 4 réponses (la bonne + jusqu'à 3 fausses).
  // `candidates` : les autres cartes dont on peut piquer le verso (mêmes paquets d'abord).
  function fabriquerQCM(carte, candidates, hasard) {
    var bonne = cle(carte.verso), deja = {}; deja[bonne] = 1;
    var autres = melanger(candidates.filter(function (c) { return c.id !== carte.id; }), hasard)
      .filter(function (c) {
        var k = cle(c.verso);
        if (deja[k] || (!c.verso.texte && !c.verso.image)) return false;
        deja[k] = 1; return true;
      }).slice(0, 3);
    if (autres.length < 1) return null;
    var options = [{ face: carte.verso, ok: true }].concat(autres.map(function (c) { return { face: c.verso, ok: false }; }));
    return { carteId: carte.id, question: carte.recto, options: melanger(options, hasard) };
  }

  // Association : 6 paires -> 12 tuiles (3 colonnes x 4 lignes). Chaque tuile a un `paire` et un `cote` (recto/verso).
  function fabriquerAssociation(cartes, nbPaires, hasard) {
    nbPaires = nbPaires || 6;
    var choisies = melanger(cartes.filter(function (c) {
      return (c.recto.texte || c.recto.image) && (c.verso.texte || c.verso.image);
    }), hasard).slice(0, nbPaires);
    var tuiles = [];
    choisies.forEach(function (c) {
      tuiles.push({ paire: c.id, cote: 'recto', face: c.recto });
      tuiles.push({ paire: c.id, cote: 'verso', face: c.verso });
    });
    return melanger(tuiles, hasard).map(function (t, i) { t.index = i; return t; });
  }

  // Deux tuiles forment-elles une paire ? (même carte, côtés différents)
  function estPaire(a, b) { return !!a && !!b && a.paire === b.paire && a.cote !== b.cote; }

  /* ------------------------------------------------------------------ */
  /* 5. Texte enrichi : $...$ (formule en ligne) et $$...$$ (formule centrée) */
  /* ------------------------------------------------------------------ */
  function echapper(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // rendreMath(latex, centree) -> html. En son absence, la formule s'affiche telle quelle.
  function texteEnHtml(source, rendreMath) {
    source = String(source || '');
    var rendu = rendreMath || function (l) { return '<code>' + echapper(l) + '</code>'; };
    var html = '', i = 0, n = source.length, texte = '';
    function vider() { if (texte) { html += echapper(texte).replace(/\n/g, '<br>'); texte = ''; } }
    while (i < n) {
      var c = source[i];
      if (c === '\\' && source[i + 1] === '$') { texte += '$'; i += 2; continue; }
      if (c === '`') {                                     // code en ligne : `x = 1`
        var fermeture = source.indexOf('`', i + 1), retour = source.indexOf('\n', i + 1);
        if (fermeture > i + 1 && (retour < 0 || fermeture < retour)) {
          vider(); html += '<code>' + echapper(source.slice(i + 1, fermeture)) + '</code>';
          i = fermeture + 1; continue;
        }
      }
      if (c === '$') {
        var centree = source[i + 1] === '$';
        var ouv = centree ? 2 : 1, fin = -1;
        for (var j = i + ouv; j < n; j++) {
          if (source[j] === '\\') { j++; continue; }
          if (source[j] === '$' && (!centree || source[j + 1] === '$')) { fin = j; break; }
        }
        if (fin > i + ouv) {
          vider();
          html += rendu(source.slice(i + ouv, fin), centree);
          i = fin + ouv; continue;
        }
      }
      texte += c; i++;
    }
    vider();
    return html;
  }

  /* ------------------------------------------------------------------ */
  /* 6. Code (info) coloré                                               */
  /* ------------------------------------------------------------------ */
  var MOTS_CLES = ('False None True and as assert break class continue def del elif else except finally for from ' +
    'global if import in is lambda nonlocal not or pass raise return try while with yield ' +
    'SELECT FROM WHERE JOIN ON GROUP BY ORDER HAVING INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE AS AND OR NOT ' +
    'DISTINCT LIMIT UNION COUNT SUM AVG MIN MAX LIKE IN IS NULL ASC DESC').split(' ');
  var FONCTIONS = ('print len range int float str list dict set tuple sum min max abs sorted reversed enumerate zip map ' +
    'filter open input isinstance type append pop sort extend insert remove append').split(' ');
  var SET_MC = {}, SET_FN = {};
  MOTS_CLES.forEach(function (m) { SET_MC[m] = 1; });
  FONCTIONS.forEach(function (m) { SET_FN[m] = 1; });

  function colorerCode(code) {
    var re = /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(#[^\n]*|--[^\n]*)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z_0-9]*)/g;
    var sortie = '', dernier = 0, m;
    code = String(code || '');
    while ((m = re.exec(code)) !== null) {
      sortie += echapper(code.slice(dernier, m.index));
      var t = echapper(m[0]);
      if (m[1]) sortie += '<span class="c-str">' + t + '</span>';
      else if (m[2]) sortie += '<span class="c-com">' + t + '</span>';
      else if (m[3]) sortie += '<span class="c-num">' + t + '</span>';
      else if (SET_MC[m[4]]) sortie += '<span class="c-kw">' + t + '</span>';
      else if (SET_FN[m[4]]) sortie += '<span class="c-fn">' + t + '</span>';
      else sortie += t;
      dernier = m.index + m[0].length;
    }
    return sortie + echapper(code.slice(dernier));
  }

  // Une face de carte : texte + formules + blocs de code entre ``` ... ```.
  // toutCode : (catégorie « Code », verso) tout le texte est du code, sauf s'il contient déjà des ```.
  function faceEnHtml(source, rendreMath, toutCode) {
    source = String(source || '');
    if (toutCode && source.indexOf('```') < 0) return '<pre class="code">' + colorerCode(source) + '</pre>';
    var parties = source.split(/```[A-Za-z]*[ \t]*\n?/), html = '';
    parties.forEach(function (p, i) {
      if (i % 2 === 1) html += '<pre class="code">' + colorerCode(p.replace(/\n$/, '')) + '</pre>';
      else if (p) html += texteEnHtml(p, rendreMath);
    });
    return html;
  }

  /* ------------------------------------------------------------------ */
  /* 7. Sauvegarde : export / import                                     */
  /* ------------------------------------------------------------------ */
  var VERSION_FICHIER = 1;

  function exporterEtat(paquets, cartes, maintenant) {
    return JSON.stringify({ app: 'cartes', version: VERSION_FICHIER, exporte: maintenant || Date.now(),
                            paquets: paquets, cartes: cartes });
  }

  // Lit un texte JSON ; renvoie {ok, erreur, paquets, cartes}
  function lireSauvegarde(texte) {
    var o;
    try { o = JSON.parse(texte); } catch (e) { return { ok: false, erreur: 'Ce fichier n’est pas une sauvegarde valide.' }; }
    if (!o || o.app !== 'cartes' || !Array.isArray(o.paquets) || !Array.isArray(o.cartes))
      return { ok: false, erreur: 'Ce fichier ne vient pas de cette app.' };
    var ids = {};
    o.paquets.forEach(function (p) { ids[p.id] = 1; });
    var cartes = o.cartes.filter(function (c) { return c && c.id && ids[c.paquetId]; });
    return { ok: true, paquets: o.paquets, cartes: cartes, ignorees: o.cartes.length - cartes.length };
  }

  // Fusion : même id -> on garde l'enregistrement modifié le plus récemment.
  function fusionner(existants, importes) {
    var parId = {}, ordre = [];
    existants.forEach(function (x) { parId[x.id] = x; ordre.push(x.id); });
    importes.forEach(function (x) {
      if (!parId[x.id]) ordre.push(x.id);
      if (!parId[x.id] || (x.modif || 0) >= (parId[x.id].modif || 0)) parId[x.id] = x;
    });
    return ordre.map(function (id) { return parId[id]; });
  }

  return {
    CATEGORIES: CATEGORIES, MATIERES: MATIERES, matiere: matiere, categorie: categorie,
    MINUTE: MINUTE, JOUR: JOUR, ECHELLE_JOURS: ECHELLE_JOURS,
    debutDuJour: debutDuJour, jourSuivant: jourSuivant, melanger: melanger, nouvelId: nouvelId,
    nettoyerTags: nettoyerTags, intervalleJours: intervalleJours, planifier: planifier, estDue: estDue,
    selection: selection, cartesDues: cartesDues, construireSeance: construireSeance, fileApresNote: fileApresNote,
    fabriquerQCM: fabriquerQCM, fabriquerAssociation: fabriquerAssociation, estPaire: estPaire,
    echapper: echapper, texteEnHtml: texteEnHtml, colorerCode: colorerCode, faceEnHtml: faceEnHtml,
    exporterEtat: exporterEtat, lireSauvegarde: lireSauvegarde, fusionner: fusionner
  };
});
