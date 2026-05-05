export const LANGS = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
};

const STRINGS = {
  en: {
    // Sidebar
    appSubtitle:        "achievement companion",
    labelAccount:       "Account",
    btnUpdate:          "Update",
    navFavorites:       "Favorites",
    navNearly:          "Nearly completed",
    navBrowse:          "Browse",
    btnSettings:        "Settings",
    btnGithub:          "GitHub",
    btnDonate:          "Donate",
    btnLegal:           "Legal & credits",
    // Topbar
    btnShowHidden:      "Show hidden",
    titleNearly:        "Nearly completed",
    titleFavorites:     "Favorites",
    titleBrowse:        "Browse achievements",
    subtitleBrowseHint: "Select a category from the sidebar",
    // Table headers
    thPct:              "%",
    thProgress:         "Progress",
    thAchievement:      "Achievement",
    thRewards:          "Rewards",
    // Empty states
    emptyFavorites:     "No favorites yet — open an achievement and click ★ to pin it here.",
    emptyFavNoData:     "Achievement data not loaded — press Update first.",
    emptyNearly:        "Press Update to load your achievements.",
    emptyNearlyFilter:  "No achievements matched the current filters.",
    emptyBrowser:       "Select a category from the sidebar to browse.",
    emptyBrowserCat:    "No achievements in this category.",
    // Progress
    progCompleted:      "Completed",
    // Setup
    setupTitle:         "Add your first account",
    setupDesc:          "Generate an API key at",
    setupDescEnd:       "Enable the account and progression permissions.",
    setupLabelName:     "Account name",
    setupPlaceName:     "e.g. Main, Alt…",
    setupLabelKey:      "API key",
    setupPlaceKey:      "Paste your API key…",
    setupLabelLang:     "Language",
    setupSave:          "Save & continue",
    setupErrName:       "Please enter a name for this account.",
    setupErrKey:        "Please enter an API key.",
    setupErrInvalid:    "Invalid API key. Make sure account and progression permissions are enabled.",
    // Settings modal
    settingsTitle:      "Settings",
    tabApi:             "API",
    tabUi:              "UI",
    tabView:            "View",
    sectAccounts:       "Accounts",
    btnAddAccount:      "+ Add account",
    noAccounts:         "No accounts added yet.",
    btnCancel:          "Cancel",
    btnSaveAccount:     "Save account",
    sectFilters:        "Filters",
    labelMaxResults:    "Max results",
    labelThreshold:     "Min threshold (%)",
    labelTierTarget:    "Tier target",
    optNextTier:        "Next tier",
    optFinalTier:       "Final tier",
    labelFetchMode:     "Achievements to fetch",
    optStarted:         "Account — Started only",
    optAllCats:         "Account — All categories",
    optAll:             "All achievements",
    labelHideCompleted:          "Hide completed achievements",
    labelClearCompletedFavorites: "Clear completed from favorites",
    labelAccentColor:            "Accent color",
    labelLightMode:              "Light mode",
    labelLanguage:               "Language",
    sectCache:          "Cache",
    btnClearCache:      "Clear cache",
    btnSave:            "Save",
    addAccName:         "Name",
    addAccPlaceName:    "e.g. Alt",
    addAccKey:          "API key",
    addAccPlaceKey:     "Paste your API key…",
    validating:         "Validating…",
    errName:            "Please enter a name.",
    errKey:             "Please enter an API key.",
    errInvalid:         "Invalid API key. Make sure account and progression permissions are enabled.",
    // Legal
    legalTitle:         "Legal & credits",
    legalPrivTitle:     "Privacy & data",
    legalPriv1:         "All API requests are made directly from your browser to the official Guild Wars 2 API. No data is ever sent to or stored on any third-party server.",
    legalPriv2:         "Your API keys are stored exclusively in your browser's local storage and never leave your device.",
    legalPriv3:         "This website is provided as-is, without any warranty of any kind.",
    legalLicTitle:      "License",
    legalLic:           "This project is released under the GNU General Public License v3.0. You are free to use, study, and modify it. Any modified version you distribute must also be released under GPLv3 and make its source code available.",
    legalDiscTitle:     "Disclaimer",
    legalDisc:          "This project is not affiliated with or endorsed by ArenaNet or NCSoft. Guild Wars 2 is a trademark of ArenaNet, LLC.",
    btnClose:           "Close",
    // Search
    searchPlaceholder:  "Search achievements…",
    // Wiki button
    btnWiki:            "Wiki",
    // Status messages
    statusLoading:      "Loading…",
    statusFetchingAccount: "Fetching your account achievements…",
    statusFetchingDefs: "Fetching {n} achievement definitions…",
    statusFetchingItems: "Fetching names for {n} items…",
    statusFetchingTitles: "Fetching names for {n} titles…",
    statusFetchingSkins: "Fetching names for {n} skins…",
    statusFetchingCats: "Fetching achievement categories…",
    statusStale:        "· definitions may be stale",
    statusErrProgress:  "Could not fetch progress — check your API key and connection, then try again.",
    achCount:           "{n} achievement",
    achCountPlural:     "{n} achievements",
    cacheEntries:       "{n} entries cached",
    cacheEmpty:         "Cache is empty",
  },

  fr: {
    appSubtitle:        "suivi des succès",
    labelAccount:       "Compte",
    btnUpdate:          "Mettre à jour",
    navFavorites:       "Favoris",
    navNearly:          "Presque terminés",
    navBrowse:          "Parcourir",
    btnSettings:        "Paramètres",
    btnGithub:          "GitHub",
    btnDonate:          "Faire un don",
    btnLegal:           "Mentions légales",
    btnShowHidden:      "Afficher masqués",
    titleNearly:        "Presque terminés",
    titleFavorites:     "Favoris",
    titleBrowse:        "Parcourir les succès",
    subtitleBrowseHint: "Sélectionnez une catégorie",
    thPct:              "%",
    thProgress:         "Progression",
    thAchievement:      "Succès",
    thRewards:          "Récompenses",
    emptyFavorites:     "Pas encore de favoris — ouvrez un succès et cliquez sur ★ pour l'épingler ici.",
    emptyFavNoData:     "Données non chargées — appuyez sur Mettre à jour.",
    emptyNearly:        "Appuyez sur Mettre à jour pour charger vos succès.",
    emptyNearlyFilter:  "Aucun succès ne correspond aux filtres actuels.",
    emptyBrowser:       "Sélectionnez une catégorie dans la barre latérale.",
    emptyBrowserCat:    "Aucun succès dans cette catégorie.",
    progCompleted:      "Terminé",
    setupTitle:         "Ajouter votre premier compte",
    setupDesc:          "Générez une clé API sur",
    setupDescEnd:       "Activez les permissions compte et progression.",
    setupLabelName:     "Nom du compte",
    setupPlaceName:     "ex. Principal, Alt…",
    setupLabelKey:      "Clé API",
    setupPlaceKey:      "Collez votre clé API…",
    setupLabelLang:     "Langue",
    setupSave:          "Enregistrer et continuer",
    setupErrName:       "Veuillez entrer un nom pour ce compte.",
    setupErrKey:        "Veuillez entrer une clé API.",
    setupErrInvalid:    "Clé API invalide. Assurez-vous que les permissions compte et progression sont activées.",
    settingsTitle:      "Paramètres",
    tabApi:             "API",
    tabUi:              "Interface",
    tabView:            "Vue",
    sectAccounts:       "Comptes",
    btnAddAccount:      "+ Ajouter un compte",
    noAccounts:         "Aucun compte ajouté.",
    btnCancel:          "Annuler",
    btnSaveAccount:     "Enregistrer le compte",
    sectFilters:        "Filtres",
    labelMaxResults:    "Résultats max",
    labelThreshold:     "Seuil minimum (%)",
    labelTierTarget:    "Palier cible",
    optNextTier:        "Palier suivant",
    optFinalTier:       "Palier final",
    labelFetchMode:     "Succès à récupérer",
    optStarted:         "Compte — Commencés uniquement",
    optAllCats:         "Compte — Toutes les catégories",
    optAll:             "Tous les succès",
    labelHideCompleted:          "Masquer les succès terminés",
    labelClearCompletedFavorites: "Retirer les terminés des favoris",
    labelAccentColor:            "Couleur d'accentuation",
    labelLightMode:              "Mode clair",
    labelLanguage:               "Langue",
    sectCache:          "Cache",
    btnClearCache:      "Vider le cache",
    btnSave:            "Enregistrer",
    addAccName:         "Nom",
    addAccPlaceName:    "ex. Alt",
    addAccKey:          "Clé API",
    addAccPlaceKey:     "Collez votre clé API…",
    validating:         "Validation…",
    errName:            "Veuillez entrer un nom.",
    errKey:             "Veuillez entrer une clé API.",
    errInvalid:         "Clé API invalide. Assurez-vous que les permissions compte et progression sont activées.",
    legalTitle:         "Mentions légales",
    legalPrivTitle:     "Confidentialité & données",
    legalPriv1:         "Toutes les requêtes API sont effectuées directement depuis votre navigateur vers l'API officielle de Guild Wars 2. Aucune donnée n'est envoyée ou stockée sur un serveur tiers.",
    legalPriv2:         "Vos clés API sont stockées exclusivement dans le stockage local de votre navigateur et ne quittent jamais votre appareil.",
    legalPriv3:         "Ce site est fourni tel quel, sans garantie d'aucune sorte.",
    legalLicTitle:      "Licence",
    legalLic:           "Ce projet est publié sous la licence GNU General Public License v3.0. Vous êtes libre de l'utiliser, de l'étudier et de le modifier. Toute version modifiée que vous distribuez doit également être publiée sous GPLv3.",
    legalDiscTitle:     "Avertissement",
    legalDisc:          "Ce projet n'est pas affilié à ArenaNet ou NCSoft. Guild Wars 2 est une marque déposée d'ArenaNet, LLC.",
    btnClose:           "Fermer",
    searchPlaceholder:  "Rechercher des succès…",
    btnWiki:            "Wiki",
    statusLoading:      "Chargement…",
    statusFetchingAccount: "Récupération des succès du compte…",
    statusFetchingDefs: "Récupération de {n} définitions de succès…",
    statusFetchingItems: "Récupération des noms de {n} objets…",
    statusFetchingTitles: "Récupération des noms de {n} titres…",
    statusFetchingSkins: "Récupération des noms de {n} apparences…",
    statusFetchingCats: "Récupération des catégories de succès…",
    statusStale:        "· définitions peut-être obsolètes",
    statusErrProgress:  "Impossible de récupérer la progression — vérifiez votre clé API et votre connexion.",
    achCount:           "{n} succès",
    achCountPlural:     "{n} succès",
    cacheEntries:       "{n} entrées en cache",
    cacheEmpty:         "Cache vide",
  },

  de: {
    appSubtitle:        "Erfolgsbegleiter",
    labelAccount:       "Konto",
    btnUpdate:          "Aktualisieren",
    navFavorites:       "Favoriten",
    navNearly:          "Fast abgeschlossen",
    navBrowse:          "Durchsuchen",
    btnSettings:        "Einstellungen",
    btnGithub:          "GitHub",
    btnDonate:          "Spenden",
    btnLegal:           "Rechtliches",
    btnShowHidden:      "Versteckte anzeigen",
    titleNearly:        "Fast abgeschlossen",
    titleFavorites:     "Favoriten",
    titleBrowse:        "Erfolge durchsuchen",
    subtitleBrowseHint: "Kategorie in der Seitenleiste wählen",
    thPct:              "%",
    thProgress:         "Fortschritt",
    thAchievement:      "Erfolg",
    thRewards:          "Belohnungen",
    emptyFavorites:     "Noch keine Favoriten — öffne einen Erfolg und klicke ★ um ihn anzuheften.",
    emptyFavNoData:     "Daten nicht geladen — drücke Aktualisieren.",
    emptyNearly:        "Drücke Aktualisieren um deine Erfolge zu laden.",
    emptyNearlyFilter:  "Keine Erfolge entsprechen den aktuellen Filtern.",
    emptyBrowser:       "Wähle eine Kategorie in der Seitenleiste.",
    emptyBrowserCat:    "Keine Erfolge in dieser Kategorie.",
    progCompleted:      "Abgeschlossen",
    setupTitle:         "Erstes Konto hinzufügen",
    setupDesc:          "Erstelle einen API-Schlüssel auf",
    setupDescEnd:       "Aktiviere die Berechtigungen Konto und Fortschritt.",
    setupLabelName:     "Kontoname",
    setupPlaceName:     "z.B. Haupt, Alt…",
    setupLabelKey:      "API-Schlüssel",
    setupPlaceKey:      "API-Schlüssel einfügen…",
    setupLabelLang:     "Sprache",
    setupSave:          "Speichern & fortfahren",
    setupErrName:       "Bitte gib einen Namen für dieses Konto ein.",
    setupErrKey:        "Bitte gib einen API-Schlüssel ein.",
    setupErrInvalid:    "Ungültiger API-Schlüssel. Stelle sicher, dass Konto- und Fortschrittsberechtigungen aktiviert sind.",
    settingsTitle:      "Einstellungen",
    tabApi:             "API",
    tabUi:              "Oberfläche",
    tabView:            "Ansicht",
    sectAccounts:       "Konten",
    btnAddAccount:      "+ Konto hinzufügen",
    noAccounts:         "Noch keine Konten hinzugefügt.",
    btnCancel:          "Abbrechen",
    btnSaveAccount:     "Konto speichern",
    sectFilters:        "Filter",
    labelMaxResults:    "Max. Ergebnisse",
    labelThreshold:     "Mindestschwelle (%)",
    labelTierTarget:    "Stufenziel",
    optNextTier:        "Nächste Stufe",
    optFinalTier:       "Letzte Stufe",
    labelFetchMode:     "Zu ladende Erfolge",
    optStarted:         "Konto — Nur begonnene",
    optAllCats:         "Konto — Alle Kategorien",
    optAll:             "Alle Erfolge",
    labelHideCompleted:          "Abgeschlossene ausblenden",
    labelClearCompletedFavorites: "Abgeschlossene aus Favoriten entfernen",
    labelAccentColor:            "Akzentfarbe",
    labelLightMode:              "Heller Modus",
    labelLanguage:               "Sprache",
    sectCache:          "Cache",
    btnClearCache:      "Cache leeren",
    btnSave:            "Speichern",
    addAccName:         "Name",
    addAccPlaceName:    "z.B. Alt",
    addAccKey:          "API-Schlüssel",
    addAccPlaceKey:     "API-Schlüssel einfügen…",
    validating:         "Wird geprüft…",
    errName:            "Bitte gib einen Namen ein.",
    errKey:             "Bitte gib einen API-Schlüssel ein.",
    errInvalid:         "Ungültiger API-Schlüssel. Stelle sicher, dass Konto- und Fortschrittsberechtigungen aktiviert sind.",
    legalTitle:         "Rechtliches",
    legalPrivTitle:     "Datenschutz & Daten",
    legalPriv1:         "Alle API-Anfragen werden direkt von deinem Browser an die offizielle Guild Wars 2 API gesendet. Es werden keine Daten an Drittserver gesendet oder dort gespeichert.",
    legalPriv2:         "Deine API-Schlüssel werden ausschließlich im lokalen Speicher deines Browsers gespeichert und verlassen dein Gerät nicht.",
    legalPriv3:         "Diese Website wird ohne jegliche Garantie bereitgestellt.",
    legalLicTitle:      "Lizenz",
    legalLic:           "Dieses Projekt wird unter der GNU General Public License v3.0 veröffentlicht. Du kannst es frei verwenden, studieren und modifizieren. Jede verteilte modifizierte Version muss ebenfalls unter GPLv3 veröffentlicht werden.",
    legalDiscTitle:     "Haftungsausschluss",
    legalDisc:          "Dieses Projekt ist nicht mit ArenaNet oder NCSoft verbunden. Guild Wars 2 ist eine Marke von ArenaNet, LLC.",
    btnClose:           "Schließen",
    searchPlaceholder:  "Erfolge suchen…",
    btnWiki:            "Wiki",
    statusLoading:      "Lädt…",
    statusFetchingAccount: "Kontoerfolge werden abgerufen…",
    statusFetchingDefs: "{n} Erfolgsdefinitionen werden abgerufen…",
    statusFetchingItems: "Namen für {n} Gegenstände werden abgerufen…",
    statusFetchingTitles: "Namen für {n} Titel werden abgerufen…",
    statusFetchingSkins: "Namen für {n} Skins werden abgerufen…",
    statusFetchingCats: "Erfolgskategorien werden abgerufen…",
    statusStale:        "· Definitionen möglicherweise veraltet",
    statusErrProgress:  "Fortschritt konnte nicht abgerufen werden — überprüfe deinen API-Schlüssel und deine Verbindung.",
    achCount:           "{n} Erfolg",
    achCountPlural:     "{n} Erfolge",
    cacheEntries:       "{n} Einträge im Cache",
    cacheEmpty:         "Cache ist leer",
  },

  es: {
    appSubtitle:        "compañero de logros",
    labelAccount:       "Cuenta",
    btnUpdate:          "Actualizar",
    navFavorites:       "Favoritos",
    navNearly:          "Casi completados",
    navBrowse:          "Explorar",
    btnSettings:        "Configuración",
    btnGithub:          "GitHub",
    btnDonate:          "Donar",
    btnLegal:           "Legal y créditos",
    btnShowHidden:      "Mostrar ocultos",
    titleNearly:        "Casi completados",
    titleFavorites:     "Favoritos",
    titleBrowse:        "Explorar logros",
    subtitleBrowseHint: "Selecciona una categoría",
    thPct:              "%",
    thProgress:         "Progreso",
    thAchievement:      "Logro",
    thRewards:          "Recompensas",
    emptyFavorites:     "Sin favoritos aún — abre un logro y haz clic en ★ para fijarlo aquí.",
    emptyFavNoData:     "Datos no cargados — pulsa Actualizar primero.",
    emptyNearly:        "Pulsa Actualizar para cargar tus logros.",
    emptyNearlyFilter:  "Ningún logro coincide con los filtros actuales.",
    emptyBrowser:       "Selecciona una categoría en la barra lateral.",
    emptyBrowserCat:    "No hay logros en esta categoría.",
    progCompleted:      "Completado",
    setupTitle:         "Añade tu primera cuenta",
    setupDesc:          "Genera una clave API en",
    setupDescEnd:       "Activa los permisos de cuenta y progresión.",
    setupLabelName:     "Nombre de cuenta",
    setupPlaceName:     "ej. Principal, Alt…",
    setupLabelKey:      "Clave API",
    setupPlaceKey:      "Pega tu clave API…",
    setupLabelLang:     "Idioma",
    setupSave:          "Guardar y continuar",
    setupErrName:       "Por favor ingresa un nombre para esta cuenta.",
    setupErrKey:        "Por favor ingresa una clave API.",
    setupErrInvalid:    "Clave API inválida. Asegúrate de que los permisos de cuenta y progresión estén activados.",
    settingsTitle:      "Configuración",
    tabApi:             "API",
    tabUi:              "Interfaz",
    tabView:            "Vista",
    sectAccounts:       "Cuentas",
    btnAddAccount:      "+ Añadir cuenta",
    noAccounts:         "No hay cuentas añadidas aún.",
    btnCancel:          "Cancelar",
    btnSaveAccount:     "Guardar cuenta",
    sectFilters:        "Filtros",
    labelMaxResults:    "Resultados máx.",
    labelThreshold:     "Umbral mínimo (%)",
    labelTierTarget:    "Objetivo de nivel",
    optNextTier:        "Siguiente nivel",
    optFinalTier:       "Nivel final",
    labelFetchMode:     "Logros a obtener",
    optStarted:         "Cuenta — Solo iniciados",
    optAllCats:         "Cuenta — Todas las categorías",
    optAll:             "Todos los logros",
    labelHideCompleted:          "Ocultar logros completados",
    labelClearCompletedFavorites: "Quitar completados de favoritos",
    labelAccentColor:            "Color de acento",
    labelLightMode:              "Modo claro",
    labelLanguage:               "Idioma",
    sectCache:          "Caché",
    btnClearCache:      "Limpiar caché",
    btnSave:            "Guardar",
    addAccName:         "Nombre",
    addAccPlaceName:    "ej. Alt",
    addAccKey:          "Clave API",
    addAccPlaceKey:     "Pega tu clave API…",
    validating:         "Validando…",
    errName:            "Por favor ingresa un nombre.",
    errKey:             "Por favor ingresa una clave API.",
    errInvalid:         "Clave API inválida. Asegúrate de que los permisos estén activados.",
    legalTitle:         "Legal y créditos",
    legalPrivTitle:     "Privacidad y datos",
    legalPriv1:         "Todas las solicitudes API se realizan directamente desde tu navegador a la API oficial de Guild Wars 2. No se envían ni almacenan datos en servidores de terceros.",
    legalPriv2:         "Tus claves API se almacenan exclusivamente en el almacenamiento local de tu navegador y nunca abandonan tu dispositivo.",
    legalPriv3:         "Este sitio web se proporciona tal cual, sin garantía de ningún tipo.",
    legalLicTitle:      "Licencia",
    legalLic:           "Este proyecto se publica bajo la Licencia Pública General GNU v3.0. Eres libre de usarlo, estudiarlo y modificarlo. Cualquier versión modificada que distribuyas también debe publicarse bajo GPLv3.",
    legalDiscTitle:     "Aviso legal",
    legalDisc:          "Este proyecto no está afiliado ni respaldado por ArenaNet o NCSoft. Guild Wars 2 es una marca registrada de ArenaNet, LLC.",
    btnClose:           "Cerrar",
    searchPlaceholder:  "Buscar logros…",
    btnWiki:            "Wiki",
    statusLoading:      "Cargando…",
    statusFetchingAccount: "Obteniendo logros de la cuenta…",
    statusFetchingDefs: "Obteniendo {n} definiciones de logros…",
    statusFetchingItems: "Obteniendo nombres de {n} objetos…",
    statusFetchingTitles: "Obteniendo nombres de {n} títulos…",
    statusFetchingSkins: "Obteniendo nombres de {n} apariencias…",
    statusFetchingCats: "Obteniendo categorías de logros…",
    statusStale:        "· definiciones pueden estar desactualizadas",
    statusErrProgress:  "No se pudo obtener el progreso — comprueba tu clave API y conexión.",
    achCount:           "{n} logro",
    achCountPlural:     "{n} logros",
    cacheEntries:       "{n} entradas en caché",
    cacheEmpty:         "Caché vacío",
  },
};

// Wiki base URLs per language
const WIKI_BASES = {
  en: "https://wiki.guildwars2.com/wiki/",
  fr: "https://wiki-fr.guildwars2.com/wiki/",
  de: "https://wiki-de.guildwars2.com/wiki/",
  es: "https://wiki-es.guildwars2.com/wiki/",
};

const EN_WIKI_API = "https://wiki.guildwars2.com/api.php";

// Lang codes for MediaWiki interwiki
const WIKI_LANG_CODE = { en: null, fr: "fr", de: "de", es: "es" };

let _lang = "en";

export function setLang(lang) { _lang = lang; }
export function getLang()     { return _lang; }

export function t(key, vars = {}) {
  const dict = STRINGS[_lang] || STRINGS.en;
  let str = dict[key] ?? STRINGS.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, v);
  return str;
}

export function achCountStr(n) {
  return n === 1 ? t("achCount", { n }) : t("achCountPlural", { n });
}

// Apply all data-i18n attributes in the document
export function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
}

// ── Wiki URL resolution ───────────────────────────────────────────────────────

function wikiApiGet(params) {
  const query = new URLSearchParams({ ...params, format: "json", origin: "*" });
  return fetch(`${EN_WIKI_API}?${query}`, {
    headers: { "User-Agent": "GW2AchTracker/1.0" },
  }).then(r => r.json());
}

function makeWikiUrl(base, pageTitle, anchor) {
  const slug = pageTitle.replace(/ /g, "_");
  let url = base + encodeURIComponent(slug).replace(/%28/g, "(").replace(/%29/g, ")").replace(/%3A/g, ":").replace(/%2F/g, "/");
  if (anchor) url += "#" + anchor.replace(/ /g, "_");
  return url;
}

/**
 * Resolve the correct wiki URL for an achievement.
 * Uses the EN wiki redirect+langlink chain described in the debug session.
 *
 * @param {string} enName  - achievement name in English
 * @param {string} localName - achievement name in the current UI language
 * @param {string} lang    - current language code
 * @returns {Promise<string>} resolved URL
 */
export async function resolveWikiUrl(enName, localName, lang) {
  const wikiBase  = WIKI_BASES[lang]  || WIKI_BASES.en;
  const langCode  = WIKI_LANG_CODE[lang];

  // EN: just use the name directly — EN wiki is complete
  if (lang === "en" || !langCode) {
    return makeWikiUrl(WIKI_BASES.en, enName, null);
  }

  try {
    // Step 1: resolve EN title with redirects + langlinks in one call
    const data = await wikiApiGet({
      action:    "query",
      titles:    enName,
      redirects: "1",
      prop:      "langlinks",
      lllang:    langCode,
    });

    const query     = data.query || {};
    const redirects = query.redirects || [];
    const pages     = query.pages     || {};
    const page      = Object.values(pages)[0];

    if (!page || page.missing !== undefined) {
      // No EN page found — fall back to local name on local wiki
      return makeWikiUrl(wikiBase, localName, null);
    }

    const enPageTitle = page.title;

    // Was there a redirect with a fragment?
    let enFragment = null;
    let wasRedirect = false;
    for (const redir of redirects) {
      if (redir.from?.toLowerCase() === enName.toLowerCase()) {
        wasRedirect = true;
        enFragment  = redir.tofragment || null;
        break;
      }
    }

    // Find the local-language langlink
    let localPageTitle = null;
    for (const ll of page.langlinks || []) {
      if (ll.lang === langCode) {
        localPageTitle = ll["*"];
        break;
      }
    }

    if (localPageTitle) {
      // Use local page + local name as anchor (mirrors EN's tofragment pattern)
      const anchor = (wasRedirect || enFragment) ? localName : null;
      return makeWikiUrl(wikiBase, localPageTitle, anchor);
    }

    // No langlink — fall back to local name on local wiki
    return makeWikiUrl(wikiBase, localName, null);

  } catch {
    // Network error — fall back
    return makeWikiUrl(wikiBase, localName, null);
  }
}