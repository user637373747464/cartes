// Tests de logique.js :  node tests/test_logique.js
const L = require('../logique.js');
let ok = 0, ko = 0;
function test(nom, cond) { if (cond) ok++; else { ko++; console.log('ECHEC :', nom); } }
function egal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// générateur pseudo-aléatoire reproductible
function graine(s) { return function () { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

// --- organisation
test('4 matières', L.MATIERES.length === 4);
test('info a code et defs', egal(L.matiere('info').categories, ['code', 'defs']));
test('erreurs seulement maths/physique', L.MATIERES.filter(m => m.categories.includes('erreurs')).map(m => m.id).join() === 'maths,physique');
test('étoiles seulement exos/code', Object.values(L.CATEGORIES).filter(c => c.etoiles).map(c => c.id).join() === 'exos,code');
test('modes defs', egal(L.categorie('defs').modes, ['classique', 'association', 'qcm']));

// --- planification (date fixe : mardi 20 oct 2026 15:00)
const T0 = new Date(2026, 9, 20, 15, 0).getTime();
let c = { niveau: 0, due: 0, vu: 0 };
let r = L.planifier(c, 'bien', false, T0);
test('bien -> niveau 1', r.niveau === 1);
test('bien -> demain 00:00', r.due === new Date(2026, 9, 21).getTime());
r = L.planifier({ niveau: 1 }, 'bien', false, T0);
test('niveau 2 -> +3 jours', r.niveau === 2 && r.due === new Date(2026, 9, 23).getTime());
r = L.planifier({ niveau: 1 }, 'facile', false, T0);
test('facile saute un niveau', r.niveau === 3 && r.due === new Date(2026, 9, 27).getTime());
r = L.planifier({ niveau: 4 }, 'rate', false, T0);
test('raté -> niveau 0, dans 10 min', r.niveau === 0 && r.due === T0 + 10 * L.MINUTE);
test('raté ne compte pas comme réussite', r.reussites === 0);
r = L.planifier({ niveau: 3 }, 'bien', true, T0);   // niveau 4 = 14 j, important -> 8 j
test('paquet important : intervalle plus court', r.niveau === 4 && r.due === new Date(2026, 9, 28).getTime());
test('plafond de niveau', L.planifier({ niveau: 7 }, 'facile', false, T0).niveau === 7);
test('intervalle jamais 0 si important & niveau>0', L.intervalleJours(1, true) === 1);
test('due nouvelle carte', L.estDue({ due: 0 }, T0));
test('pas due demain', !L.estDue({ due: new Date(2026, 9, 21).getTime() }, T0));
test('due après minuit', L.estDue({ due: new Date(2026, 9, 21).getTime() }, new Date(2026, 9, 21, 0, 5).getTime()));

// --- sélection et muet
const paquets = [
  { id: 'p1', matiere: 'maths', categorie: 'defs', nom: 'Groupes', important: true, muet: false },
  { id: 'p2', matiere: 'maths', categorie: 'exos', nom: 'Arith', important: false, muet: true },
  { id: 'p3', matiere: 'info', categorie: 'code', nom: 'Listes', important: false, muet: false }
];
const F = (t, v) => ({ texte: t, image: null });
const cartes = [
  { id: 'a', paquetId: 'p1', recto: F('Groupe'), verso: F('Un groupe est...'), tags: ['colle X'], due: 0 },
  { id: 'b', paquetId: 'p1', recto: F('Anneau'), verso: F('Un anneau est...'), tags: [], due: T0 + L.JOUR },
  { id: 'c', paquetId: 'p2', recto: F('Bezout'), verso: F('...'), tags: [], due: 0 },
  { id: 'd', paquetId: 'p3', recto: F('Impairs'), verso: F('[x for x in l if x%2]'), tags: [], due: 0 }
];
test('muet exclu', L.selection(cartes, paquets, {}).map(x => x.id).join() === 'a,b,d');
test('dues : a et d', L.cartesDues(cartes, paquets, {}, T0).map(x => x.id).join() === 'a,d');
test('filtre matière', L.cartesDues(cartes, paquets, { matiere: 'info' }, T0).map(x => x.id).join() === 'd');
test('filtre tag insensible casse', L.selection(cartes, paquets, { tag: 'COLLE x' }).map(x => x.id).join() === 'a');
test('filtre paquet', L.selection(cartes, paquets, { paquetId: 'p1' }).length === 2);

// --- séance
test('séance contient tous les ids', L.construireSeance(cartes, graine(1)).sort().join() === 'a,b,c,d');
test('raté revient plus loin', egal(L.fileApresNote(['a', 'b', 'c', 'd', 'e'], 'rate'), ['b', 'c', 'd', 'a', 'e']));
test('raté, file courte', egal(L.fileApresNote(['a', 'b'], 'rate'), ['b', 'a']));
test('bien : disparaît', egal(L.fileApresNote(['a', 'b', 'c'], 'bien'), ['b', 'c']));
test('raté, seule carte', egal(L.fileApresNote(['a'], 'rate'), ['a']));

// --- QCM
const defs = ['G', 'A', 'C', 'E', 'I'].map((k, i) => ({ id: 'q' + i, paquetId: 'p1', recto: F(k), verso: F('def ' + k) }));
let q = L.fabriquerQCM(defs[0], defs, graine(3));
test('QCM 4 options', q && q.options.length === 4);
test('QCM une seule bonne', q.options.filter(o => o.ok).length === 1);
test('QCM la bonne est le verso', q.options.filter(o => o.ok)[0].face.texte === 'def G');
test('QCM pas de doublon', new Set(q.options.map(o => o.face.texte)).size === 4);
test('QCM question = recto', q.question.texte === 'G');
q = L.fabriquerQCM(defs[0], defs.slice(0, 2), graine(3));
test('QCM 2 cartes -> 2 options', q && q.options.length === 2);
test('QCM seule -> null', L.fabriquerQCM(defs[0], defs.slice(0, 1), graine(3)) === null);
const doublons = [defs[0], { id: 'z', paquetId: 'p1', recto: F('Z'), verso: F('def G') }];
test('QCM verso identique ignoré', L.fabriquerQCM(defs[0], doublons, graine(3)) === null);
test('QCM sans verso vide', L.fabriquerQCM(defs[0], [defs[0], { id: 'v', recto: F('V'), verso: F('') }], graine(3)) === null);

// --- association
let t = L.fabriquerAssociation(defs, 6, graine(5));
test('association : 5 cartes -> 10 tuiles', t.length === 10);
const six = defs.concat([{ id: 'q5', paquetId: 'p1', recto: F('X'), verso: F('def X') }]);
t = L.fabriquerAssociation(six, 6, graine(5));
test('association : 12 tuiles', t.length === 12);
test('association : chaque paire a 2 tuiles', Object.values(t.reduce((m, x) => (m[x.paire] = (m[x.paire] || 0) + 1, m), {})).every(n => n === 2));
const a = t[0], b = t.find(x => x.paire === a.paire && x.cote !== a.cote), c2 = t.find(x => x.paire !== a.paire);
test('estPaire vrai', L.estPaire(a, b));
test('estPaire faux (autre paire)', !L.estPaire(a, c2));
test('estPaire faux (même tuile)', !L.estPaire(a, a));
test('association reproductible', egal(L.fabriquerAssociation(six, 6, graine(5)).map(x => x.index), t.map(x => x.index)));

// --- texte enrichi
const fauxMath = (l, ctr) => `[${ctr ? 'D' : 'I'}:${l}]`;
test('texte simple', L.texteEnHtml('Bonjour', fauxMath) === 'Bonjour');
test('échappement html', L.texteEnHtml('a < b & c', fauxMath) === 'a &lt; b &amp; c');
test('saut de ligne', L.texteEnHtml('a\nb', fauxMath) === 'a<br>b');
test('formule en ligne', L.texteEnHtml('Soit $x^2$ réel', fauxMath) === 'Soit [I:x^2] réel');
test('formule centrée', L.texteEnHtml('$$\\int_0^1 f$$', fauxMath) === '[D:\\int_0^1 f]');
test('deux formules', L.texteEnHtml('$a$ et $b$', fauxMath) === '[I:a] et [I:b]');
test('dollar échappé', L.texteEnHtml('5\\$ seulement', fauxMath) === '5$ seulement');
test('dollar seul', L.texteEnHtml('un $ seul', fauxMath) === 'un $ seul');
test('formule avec < dedans non cassée', L.texteEnHtml('$a<b$', fauxMath) === '[I:a<b]');
test('script bloqué', !L.texteEnHtml('<script>alert(1)</script>', fauxMath).includes('<script>'));
test('sans moteur : code échappé', L.texteEnHtml('$a<b$').includes('&lt;'));
test('accolades dans formule', L.texteEnHtml('$\\frac{1}{2}$', fauxMath) === '[I:\\frac{1}{2}]');

// --- code coloré
const col = L.colorerCode('def f(l):\n    # impairs\n    return [x for x in l if x % 2 == 1]\nprint("a<b")');
test('mot-clé coloré', col.includes('<span class="c-kw">def</span>'));
test('commentaire coloré', col.includes('<span class="c-com"># impairs</span>'));
test('chaîne échappée', col.includes('<span class="c-str">&quot;a&lt;b&quot;</span>'));
test('nombre coloré', col.includes('<span class="c-num">2</span>'));
test('fonction native', col.includes('<span class="c-fn">print</span>'));
test('pas de balise brute', !col.includes('<b') && !col.includes('<script'));
test('sql', L.colorerCode('SELECT nom FROM t -- c').includes('<span class="c-kw">SELECT</span>'));

test('code en ligne', L.texteEnHtml('la liste `l` ici', fauxMath) === 'la liste <code>l</code> ici');
test('code en ligne échappé', L.texteEnHtml('`a<b`', fauxMath) === '<code>a&lt;b</code>');
test('accent grave seul', L.texteEnHtml('un ` seul', fauxMath) === 'un ` seul');
test('code en ligne ne traverse pas la ligne', L.texteEnHtml('a ` b\nc `', fauxMath) === 'a ` b<br>c `');
test('dollar dans code en ligne', L.texteEnHtml('`$x$`', fauxMath) === '<code>$x$</code>');

// --- faces avec code
test('face : texte + bloc de code', L.faceEnHtml('Voici :\n```python\nx = 1\n```\nfin', fauxMath).includes('<pre class="code">x = <span class="c-num">1</span></pre>'));
test('face : toutCode', L.faceEnHtml('return 3', fauxMath, true).startsWith('<pre class="code"><span class="c-kw">return</span>'));
test('face : toutCode mais déjà des ```', !L.faceEnHtml('texte\n```\nx\n```', fauxMath, true).startsWith('<pre'));
test('face : formule gardée', L.faceEnHtml('$x$', fauxMath) === '[I:x]');
test('face : bloc non fermé = code', L.faceEnHtml('a\n```\nx = 2', fauxMath).includes('<pre class="code">'));

// --- tags
test('tags', egal(L.nettoyerTags('colle X, DS Henri 4;  colle x ,#oral\n'), ['colle X', 'DS Henri 4', 'oral']));
test('tags vides', egal(L.nettoyerTags(' , ; '), []));

// --- sauvegarde
const exp = L.exporterEtat(paquets, cartes, 123);
let lu = L.lireSauvegarde(exp);
test('export/import identique', lu.ok && egal(lu.paquets, paquets) && egal(lu.cartes, cartes));
test('fichier invalide', !L.lireSauvegarde('pas du json').ok);
test('mauvaise app', !L.lireSauvegarde('{"app":"autre"}').ok);
const exp2 = JSON.parse(exp); exp2.cartes.push({ id: 'orpheline', paquetId: 'nope' });
lu = L.lireSauvegarde(JSON.stringify(exp2));
test('carte orpheline ignorée', lu.ok && lu.ignorees === 1 && lu.cartes.length === cartes.length);
const fus = L.fusionner([{ id: 1, modif: 5, v: 'ancien' }, { id: 2, modif: 1 }], [{ id: 1, modif: 9, v: 'nouveau' }, { id: 3, modif: 2 }]);
test('fusion : le plus récent gagne', fus.find(x => x.id === 1).v === 'nouveau' && fus.length === 3);
const fus2 = L.fusionner([{ id: 1, modif: 9, v: 'local' }], [{ id: 1, modif: 5, v: 'importé' }]);
test('fusion : local plus récent gardé', fus2[0].v === 'local');

console.log(ko === 0 ? `Tous les tests passent (${ok}).` : `${ko} échec(s) sur ${ok + ko}.`);
process.exit(ko ? 1 : 0);
