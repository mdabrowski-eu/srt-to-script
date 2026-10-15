/**
 * Tiny i18n layer: EN + PL dictionaries, browser-language detection and
 * localStorage persistence. Parametrized strings use {token} placeholders.
 */

const STORAGE_KEY = 'srt-script-lang';

export const LANGS = /** @type {const} */ ([
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'pl', label: 'PL', name: 'Polski' },
]);

const DICT = {
  en: {
    docTitle: 'SRT → Voice Actor Script',
    h1: 'SRT → Voice Actor Script',
    tagline:
      'Turn SRT subtitles into a clean script for dubbing / voice acting - DOCX + PDF, typewriter font, full Polish character support.',

    step1: '1 · Header information',
    headerHint:
      'One line per row, centered at the top of the script. The first line is also used for the output filename.',
    headerLabel: 'Header text',
    headerPlaceholder: 'e.g.\nRozczarowani\nScenka 1 - Kitchen, morning\nS01E01',
    notesLabel: 'Notes (bottom of script)',
    notesPlaceholder: 'Optional production notes',

    logoLabel: 'Logo image (above header)',
    logoChoose: 'Choose image…',
    logoNone: 'PNG / JPG, e.g. a letterhead logo',
    logoPosLabel: 'Position:',
    logoPosLeft: 'Left',
    logoPosCenter: 'Center',
    logoPosRight: 'Right',
    logoRemove: '✕ Remove',

    templateLabel: 'Script template',
    tplTheatre: 'Theatre',
    tplTheatreHint: 'character names centered, dialogue indented',
    tplLeft: 'All left',
    tplLeftHint: 'everything below the header aligned left',
    compactLabel: 'Compact',
    compactHint: 'strip timestamps and blank lines between blocks (modifier — works with both templates)',

    step2: '2 · Subtitles (SRT)',
    dropDrop: 'Drop an .srt file here',
    dropChoose: ' or click to choose',
    dropLoaded: '✓ {name} loaded - click to replace',
    pastePlaceholder: '…or paste raw SRT content here',

    summBlocks: 'timed blocks',
    summChars: 'characters',

    step3: '3 · Generate',
    btnBoth: 'Download DOCX + PDF',
    btnDocx: 'DOCX only',
    btnPdf: 'PDF only',
    generating: 'Generating…',

    errNoSrt: 'Load or paste an SRT file first.',
    loaded: 'Loaded {name}',
    dlOne: 'Downloaded {file}',
    dlBoth: 'Downloaded {docx} and {pdf}',
    failed: 'Generation failed: {err}',

    exSummary: 'How the input is structured',
    exIntro1:
      'A standard SRT cue looks like this - an index line, a start ',
    exIntro2: ' end timestamp line, then text:',
    exB1T: 'Timestamps.',
    exB1B: 'Only the start time is used, printed as ',
    exB1B2: '; the end time and milliseconds are dropped.',
    exB2T: 'Characters.',
    exB2B1: 'A tag at the start of a line marks a speaker. The tag itself is removed; the text after it is the spoken line, with leading spaces stripped. Lines without a tag continue the previous speaker’s line.',
    exB3T: 'Multiple characters.',
    exB3B1: 'One cue can contain several turns - each becomes its own centered name + dialogue.',
    exB4T: 'overlap / off.',
    exB4B: ' These are not interpreted - if they appear in the text, they are pasted through as-is.',
    exB5T: 'HTML markup',
    exB5B: ' such as tags in dialogue is stripped.',

    previewTitle: 'Live preview',
    previewNote: 'mirrors the generated file layout',
    previewEmpty: 'Load or paste SRT content to see the script preview here.',

    footer:
      ''
  },

  pl: {
    docTitle: 'SRT → Scenariusz dla lektora',
    h1: 'SRT → Scenariusz dla lektora',
    tagline:
      'Zamień napisy SRT na czytelny scenariusz do dubbingu / nagrania lektorskiego - DOCX + PDF, krój maszynopisu, pełne wsparcie polskich znaków.',

    step1: '1 · Nagłówek',
    headerHint:
      'Pierwsza linia służy też jako nazwa pliku wynikowego.',
    headerLabel: 'Nagłówek',
    headerPlaceholder: 'np.\nRozczarowani\nScenka 1 - Kuchnia, rano\nS01E01',
    notesLabel: 'Notatki (na dole scenariusza)',
    notesPlaceholder: 'Opcjonalne notatki produkcyjne',

    logoLabel: 'Obraz nagłówka (np. logo)',
    logoChoose: 'Wybierz obraz…',
    logoNone: 'PNG / JPG, np. logo na paperze firmowym',
    logoPosLabel: 'Położenie:',
    logoPosLeft: 'Lewo',
    logoPosCenter: 'Środek',
    logoPosRight: 'Prawo',
    logoRemove: '✕ Usuń',

    templateLabel: 'Układ scenariusza',
    tplTheatre: 'Sceniczny',
    tplTheatreHint: 'imiona wyśrodkowane, dialogi z wcięciem',
    tplLeft: 'Wyrównane do lewej',
    tplLeftHint: 'wszystko pod nagłówkiem wyrównane do lewej',
    compactLabel: 'Kompaktowy',
    compactHint: 'usuwa znaczniki czasu i puste linie między blokami (modyfikator — działa z oboma układami)',

    step2: '2 · Napisy (SRT)',
    dropDrop: 'Przeciągnij tutaj plik .srt',
    dropChoose: ' lub kliknij, aby wybrać',
    dropLoaded: '✓ wczytano {name} - kliknij, aby zastąpić',
    pastePlaceholder: '…lub wklej tutaj treść SRT',

    summBlocks: 'segmenty z czasem',
    summChars: 'postaci',

    step3: '3 · Generowanie',
    btnBoth: 'Pobierz DOCX + PDF',
    btnDocx: 'Tylko DOCX',
    btnPdf: 'Tylko PDF',
    generating: 'Generowanie…',

    errNoSrt: 'Najpierw wczytaj lub wklej plik SRT.',
    loaded: 'Wczytano {name}',
    dlOne: 'Pobrano {file}',
    dlBoth: 'Pobrano {docx} i {pdf}',
    failed: 'Generowanie nie powiodło się: {err}',

    exSummary: 'Jak zbudowany jest plik wejściowy',
    exIntro1:
      'Standardowy blok napisów SRT wygląda tak - linia indeksu, znacznik czasu (start ',
    exIntro2: ' koniec), a potem tekst:',
    exB1T: 'Znaczniki czasu.',
    exB1B: 'Używany jest tylko czas startu, zapisywany jako ',
    exB1B2: '; czas końca i milisekundy są pomijane.',
    exB2T: 'Postacie.',
    exB2B1: 'Znacznik na początku linii oznacza postać. Sam znacznik jest usuwany, a tekst po nim to kwestia - bez wiodących spacji. Linie bez znacznika kontynuują kwestię poprzedniej postaci.',
    exB3T: 'Wiele postaci.',
    exB3B1: 'Jeden blok może zawierać kilka kwestii - każda dostaje własne wyśrodkowane imię i dialog.',
    exB4T: 'overlap / off.',
    exB4B: ' Nie są interpretowane - jeśli występują w tekście, wklejane są bez zmian.',
    exB5T: 'Znaczniki HTML',
    exB5B: ' (np. kursywa/pogrubienie) są usuwane z dialogów.',

    previewTitle: 'Podgląd na żywo',
    previewNote: 'odwzorowuje układ generowanego pliku',
    previewEmpty: 'Wczytaj lub wklej treść SRT, aby zobaczyć podgląd scenariusza.',

    footer:
      '',
  },
};

/** Detect language: saved choice first, then browser UI language, else 'en'. */
export function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && DICT[saved]) return saved;
  } catch {
    /* storage unavailable - ignore */
  }
  const navLangs =
    (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || [];
  for (const l of navLangs) {
    if (l && /^pl\b/i.test(l)) return 'pl';
  }
  return 'en';
}

export function persistLang(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

/** Translation factory: t(key, params?) with {token} substitution, EN fallback. */
export function makeT(lang) {
  const dict = (lang && DICT[lang]) || DICT.en;
  return (key, params) => {
    let s = dict[key] != null ? dict[key] : DICT.en[key];
    if (s == null) return key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.replaceAll(`{${k}}`, String(v));
      }
    }
    return s;
  };
}

/** For tests / SSR: expose dictionaries read-only. */
export function getDict(lang) {
  return DICT[lang] || DICT.en;
}