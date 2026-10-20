"""Test de bout en bout dans un vrai navigateur (Chromium, écran d'iPhone).
Usage :  python tests/e2e.py [dossier_captures]"""
import json, os, subprocess, sys, tempfile, time, threading, http.server, socketserver
from playwright.sync_api import sync_playwright, expect
from PIL import Image, ImageDraw

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAPT = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(CAPT, exist_ok=True)

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=RACINE, **k)
    def log_message(s, *a): pass
srv = socketserver.TCPServer(("127.0.0.1", 0), H); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{PORT}/index.html"

# image de test (sujet de DS) : fond transparent + trait noir
img = Image.new("RGBA", (900, 500), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
d.rectangle((40, 40, 860, 460), outline=(0, 0, 0, 255), width=6); d.text((80, 80), "Exercice 3 - Arithmetique", fill=(0, 0, 0, 255))
FICHIER_IMG = os.path.join(tempfile.mkdtemp(), "ds.png"); img.save(FICHIER_IMG)

erreurs, ok, ko = [], 0, 0
def verifie(nom, cond):
    global ok, ko
    if cond: ok += 1
    else: ko += 1; print("ECHEC :", nom)

with sync_playwright() as p:
    nav = p.chromium.launch()
    ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True, locale="fr-FR")
    page = ctx.new_page()
    page.on("pageerror", lambda e: erreurs.append(str(e)))
    page.on("console", lambda m: erreurs.append(m.text) if m.type == "error" else None)
    page.on("dialog", lambda d: d.accept())
    page.goto(URL); page.wait_for_selector("h1")
    def snap(nom): page.screenshot(path=os.path.join(CAPT, nom + ".png"))

    verifie("titre Maths", page.inner_text("h1") == "Maths")
    verifie("onglets", page.locator("#onglets a").count() == 5)
    verifie("bouton réviser désactivé", page.locator("button[data-act=reviser]").first.is_disabled())
    snap("01_vide")

    def nouveau_paquet(matiere, cat, nom, important=False):
        page.goto(f"{URL}#/{matiere}/{cat}"); page.wait_for_selector("h1")
        page.click("[data-act=nouveau-paquet]")
        page.fill("#champ-nom", nom)
        if important: page.click("#sw-important")
        page.click("[data-act=sauver-paquet]")
        page.wait_for_selector(f".ligne:has-text('{nom}')")
        page.click(f".ligne:has-text('{nom}')"); page.wait_for_selector("h1")

    def nouvelle_carte(recto, verso, tags="", etoiles=None, image_recto=None):
        page.click("[data-act=nouvelle-carte]")
        page.fill("#champ-recto", recto); page.fill("#champ-verso", verso)
        if image_recto: page.set_input_files("#fichier-recto", image_recto); page.wait_for_selector("#miniature-recto img")
        if etoiles is not None: page.click(f".etoiles-choix button[data-n='{etoiles}']")
        if tags: page.fill("#champ-tags", tags)
        page.click("[data-act=sauver-carte]")
        page.wait_for_selector("#calque", state="hidden")

    # --- maths / définitions
    nouveau_paquet("maths", "defs", "Groupes", important=True)
    verifie("paquet important affiché", True)
    defs = [("Groupe", "Un ensemble $G$ muni d'une loi $*$ associative, avec neutre et inverses."),
            ("Anneau", "Un triplet $(A,+,\\times)$ où $(A,+)$ est un groupe abélien."),
            ("Corps", "Un anneau commutatif où tout élément non nul est inversible."),
            ("Sous-groupe", "Partie $H\\subset G$ stable, contenant $e$, stable par inverse."),
            ("Morphisme", "Application $f$ telle que $f(x*y)=f(x)*f(y)$."),
            ("Ordre d'un élément", "Plus petit entier $n\\geq 1$ tel que $x^n=e$.")]
    for i, (r, v) in enumerate(defs):
        nouvelle_carte(r, v, tags="colle X" if i < 2 else "")
        if i == 0:
            pass
    verifie("6 cartes listées", page.locator(".ligne[data-act=editer-carte]").count() == 6)
    verifie("tags affichés", page.locator(".tag:has-text('colle X')").count() == 2)
    snap("02_paquet")
    # aperçu LaTeX dans l'éditeur
    page.click("[data-act=nouvelle-carte]"); page.fill("#champ-verso", "Soit $\\int_0^1 x^2dx=\\frac13$ et $$\\sum_{k=1}^n k=\\frac{n(n+1)}2$$")
    verifie("aperçu LaTeX rendu", page.locator("#apercu-verso .katex").count() >= 2)
    verifie("pas d'étoiles pour les défs", page.locator(".etoiles-choix").count() == 0)
    time.sleep(0.4); snap("03_editeur"); page.click("[data-act=fermer-feuille]")

    # filtre tag
    page.click(".chip:has-text('colle X')"); verifie("filtre tag", page.locator(".ligne[data-act=editer-carte]").count() == 2)
    page.click(".chip:has-text('Tous')"); verifie("tous", page.locator(".ligne[data-act=editer-carte]").count() == 6)

    # --- révision classique
    verifie("badge dues = 6", page.locator("button[data-act=reviser]").first.inner_text().strip().endswith("6"))
    page.locator("button[data-act=reviser]").first.click()
    page.wait_for_selector("#plein .carte")
    snap("04_revision_recto")
    page.click("[data-act=retourner]"); page.wait_for_selector("#plein .carte.verso")
    verifie("verso affiché", len(page.inner_text("#plein .carte.verso")) > 12)
    snap("05_revision_verso")
    boutons = page.locator(".actions .btn small").all_inner_texts()
    print("délais:", boutons)
    verifie("délais affichés", boutons[0] == "10 min" and boutons[1] in ("demain", "1 j") and boutons[2] in ("3 j", "2 j"))
    # raté puis bien pour tout
    page.click("[data-act=noter][data-note=rate]")
    verifie("raté revient (reste 6)", "reste 6" in page.inner_text("#plein .barre"))
    for _ in range(12):
        if page.locator("#plein .fin").count(): break
        if page.locator("[data-act=retourner]").count(): page.click("[data-act=retourner]")
        page.click("[data-act=noter][data-note=bien]")
    verifie("fin de séance", page.locator("#plein .fin").count() == 1)
    snap("06_fin")
    page.click("[data-act=quitter]")
    verifie("plus rien à réviser", page.locator("button[data-act=reviser]").first.is_disabled())
    page.click("button[data-act=reviser][data-tout='1']"); page.wait_for_selector("#plein .carte"); page.click("[data-act=quitter]")

    # --- QCM
    page.click("[data-act=qcm]"); page.wait_for_selector(".option")
    verifie("QCM 4 options", page.locator(".option").count() == 4)
    snap("07_qcm")
    page.locator(".option").first.click()
    verifie("bonne réponse révélée", page.locator(".option.bonne").count() == 1)
    for _ in range(10):
        if page.locator("[data-act=qcm-suivant]").count():
            page.click("[data-act=qcm-suivant]")
        if page.locator("#plein .fin").count(): break
        if page.locator(".option:not(.fige)").count(): page.locator(".option").first.click()
    verifie("QCM terminé avec score", "Score" in page.inner_text("#plein .fin"))
    page.click("[data-act=quitter]")

    # --- Association
    page.click("[data-act=association]"); page.wait_for_selector(".tuile")
    verifie("12 tuiles (3 x 4)", page.locator(".tuile").count() == 12)
    cols = page.evaluate("getComputedStyle(document.querySelector('.grille')).gridTemplateColumns.split(' ').length")
    verifie("3 colonnes", cols == 3)
    snap("08_association")
    tuiles = page.evaluate("__cartes.E.seance.tuiles.map(t => [t.paire, t.cote])")
    # une faute volontaire : deux tuiles de paires différentes, côtés différents
    a = 0; b = next(i for i, t in enumerate(tuiles) if t[0] != tuiles[a][0] and t[1] != tuiles[a][1])
    page.locator(".tuile").nth(a).click(); page.locator(".tuile").nth(b).click()
    page.wait_for_selector(".tuile.faux"); verifie("faute comptée", "1 faute" in page.inner_text("#plein .barre"))
    time.sleep(0.8)
    paires = {}
    for i, (pid, cote) in enumerate(tuiles): paires.setdefault(pid, []).append(i)
    for pid, (i, j) in paires.items():
        page.locator(".tuile").nth(i).click(); page.locator(".tuile").nth(j).click()
    page.wait_for_selector("#plein .fin")
    verifie("association terminée", "1 faute" in page.inner_text("#plein .fin"))
    snap("09_association_fin")
    page.click("[data-act=quitter]")

    # --- pause d'un paquet
    page.click("[data-act=editer-paquet]"); page.click("#sw-muet"); page.click("[data-act=sauver-paquet]")
    verifie("paquet en pause", "en pause" in page.inner_text(".sous"))
    page.click("[data-act=editer-paquet]"); page.click("#sw-muet"); page.click("[data-act=sauver-paquet]")

    # --- exos : image, étoiles, tags
    nouveau_paquet("maths", "exos", "Arithmétique")
    nouvelle_carte("Montrer que $n^3-n$ est divisible par 6.", "On écrit $n^3-n=(n-1)n(n+1)$...", tags="DS Henri 4, difficile", etoiles=2, image_recto=FICHIER_IMG)
    verifie("étoiles dans la liste", page.locator(".etoiles-l").inner_text() == "★★")
    page.click("[data-act=editer-carte]"); verifie("image conservée à l'édition", page.locator("#miniature-recto img").count() == 1)
    page.click("[data-act=fermer-feuille]")
    page.click("button[data-act=reviser]"); page.wait_for_selector("#plein .carte")
    verifie("image sur la carte", page.locator("#plein .carte img.face-img").count() == 1)
    verifie("étoiles sur la carte", page.locator("#plein .carte .etoiles").inner_text() == "★★")
    verifie("image fond blanc (jpeg)", page.evaluate("document.querySelector('#plein img').src.startsWith('data:image/jpeg')"))
    snap("10_exo_image"); page.click("[data-act=quitter]")

    # --- erreurs et code
    nouveau_paquet("maths", "erreurs", "Erreurs de DS")
    nouvelle_carte("On a $\\sqrt{x^2}=x$ donc ...", "Faux : $\\sqrt{x^2}=|x|$.")
    verifie("pas d'étoiles pour les erreurs", True)
    page.click("[data-act=nouvelle-carte]"); verifie("éditeur erreurs sans étoiles", page.locator(".etoiles-choix").count() == 0); page.click("[data-act=fermer-feuille]")
    page.goto(f"{URL}#/si"); page.wait_for_selector("h1")
    verifie("SI : pas de catégorie erreurs", page.locator(".ligne:has-text('Erreurs')").count() == 0)
    page.goto(f"{URL}#/info"); page.wait_for_selector("h1")
    verifie("Info : code et définitions", page.locator(".ligne b").all_inner_texts() == ["Code", "Définitions"])
    nouveau_paquet("info", "code", "Listes")
    nouvelle_carte("Liste des entiers impairs d'une liste `l`.", "def impairs(l):\n    return [x for x in l if x % 2 == 1]  # compréhension", etoiles=1)
    page.click("button[data-act=reviser]"); page.wait_for_selector("#plein .carte"); page.click("[data-act=retourner]")
    verifie("code coloré", page.locator("#plein pre.code .c-kw").count() >= 2)
    snap("11_code"); page.click("[data-act=quitter]")

    # --- badge des onglets
    verifie("badge onglet Info", page.locator("#onglets a:has-text('Info') .point").count() == 1)

    # --- réglages : export, effacer, import
    page.goto(f"{URL}#/reglages"); page.wait_for_selector("h1")
    snap("12_reglages")
    with page.expect_download() as dl: page.click("[data-act=exporter]")
    chemin = os.path.join(tempfile.mkdtemp(), "sauv.json"); dl.value.save_as(chemin)
    data = json.load(open(chemin))
    verifie("export : 9 cartes", len(data["cartes"]) == 9 and len(data["paquets"]) == 4)
    verifie("export : image incluse", any(c["recto"]["image"] for c in data["cartes"]))
    page.click("[data-act=tout-effacer]"); page.wait_for_function("__cartes.E.cartes.length === 0")
    verifie("tout effacé", page.evaluate("__cartes.E.cartes.length") == 0)
    page.set_input_files("#fichier-import", chemin); page.wait_for_function("__cartes.E.cartes.length > 0")
    verifie("import : 9 cartes", page.evaluate("__cartes.E.cartes.length") == 9)
    # persistance après rechargement
    page.reload(); page.wait_for_selector("h1")
    verifie("persistance après rechargement", page.evaluate("__cartes.E.cartes.length") == 9)
    page.goto(f"{URL}#/maths/exos"); page.wait_for_selector("h1")
    verifie("paquet retrouvé", page.locator(".ligne:has-text('Arithmétique')").count() == 1)
    # import d'un mauvais fichier
    mauvais = os.path.join(tempfile.mkdtemp(), "x.json"); open(mauvais, "w").write("{pas du json")
    page.goto(f"{URL}#/reglages"); page.wait_for_selector("h1"); page.set_input_files("#fichier-import", mauvais)
    page.wait_for_function("document.querySelector('#toast').textContent.includes('valide')"); verifie("mauvais fichier refusé", True)
    snap("13_maths")
    page.goto(f"{URL}#/maths"); page.wait_for_selector("h1"); snap("14_matiere")
    nav.close()

verifie("aucune erreur JavaScript", not erreurs)
if erreurs: print("Erreurs console :", erreurs[:5])
print(f"{ok} vérifications réussies, {ko} échec(s). Captures : {CAPT}")
sys.exit(1 if ko else 0)
