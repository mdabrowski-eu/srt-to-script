import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { parseSrt, buildScriptText, splitHeaderLines } from './parser.js';
import { buildDocxBlob } from './docx-generator.js';
import { buildPdfBlob } from './pdf-generator.js';
import { downloadBlob, slugify } from './download.js';
import { LANGS, detectLang, persistLang, makeT } from './i18n.js';
import './styles.css';

/* Localized example cue shown in the explainer block. */
const INPUT_EXAMPLE = {
  en: `1
00:00:00,000 --> 00:00:16,240
[Lucy] Okay watch your posture. No slouch more.

2
00:00:16,240 --> 00:00:25,120
[Demon] What kind of demon are you?
[Bean] Me? Oh I'm just like you know`,
  pl: `1
00:00:00,000 --> 00:00:16,240
[Lucy] Okay watch your posture. No slouch more.

2
00:00:16,240 --> 00:00:25,120
[Demon] What kind of demon are you?
[Bean] Me? Oh I'm just like you know`,
};

function App() {
  const [lang, setLang] = useState(detectLang);
  const t = useMemo(() => makeT(lang), [lang]);
  useDocumentLang(lang, t('docTitle'));

  const [header, setHeader] = useState({
    headerText: '',
    notes: '',
  });
  const [srtText, setSrtText] = useState('');
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState(null); // { kind: 'ok'|'error', msg }
  const [busy, setBusy] = useState(null); // 'docx' | 'pdf' | null
  const fileInputRef = useRef(null);

  const parsed = useMemo(() => {
    if (!srtText.trim()) return null;
    try {
      const p = parseSrt(srtText);
      return p.blocks.length > 0 ? p : null;
    } catch (e) {
      return null;
    }
  }, [srtText]);

  const setField = (k) => (e) => setHeader((h) => ({ ...h, [k]: e.target.value }));

  const onFile = useCallback(
    async (file) => {
      if (!file) return;
      setFileName(file.name);
      const text = await file.text();
      setSrtText(text);
      setStatus({ kind: 'ok', msg: t('loaded', { name: file.name }) });
    },
    [t]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  const chooseLang = (code) => {
    setLang(code);
    persistLang(code);
    document.documentElement.lang = code;
  };

  // First header line = title → output filename stem; fallback to uploaded file name.
  const firstHeaderLine = useMemo(
    () => splitHeaderLines(header.headerText)[0] || '',
    [header.headerText]
  );
  const baseName = useMemo(
    () => slugify(firstHeaderLine || fileName.replace(/\.srt$/i, '')),
    [firstHeaderLine, fileName]
  );

  const parsedCount = parsed ? parsed.blocks.length : 0;
  const charCount = parsed ? parsed.characters.length : 0;

  const preview = useMemo(() => {
    if (!parsed) return '';
    return buildScriptText({ header, parsed });
  }, [header, parsed]);

  const generate = async (kind) => {
    if (!parsed) {
      setStatus({ kind: 'error', msg: t('errNoSrt') });
      return;
    }
    setBusy(kind);
    setStatus(null);
    try {
      if (kind === 'docx') {
        const blob = await buildDocxBlob({ header, parsed });
        downloadBlob(blob, `${baseName}.docx`);
        setStatus({ kind: 'ok', msg: t('dlOne', { file: `${baseName}.docx` }) });
      } else {
        const blob = await buildPdfBlob({ header, parsed });
        downloadBlob(blob, `${baseName}.pdf`);
        setStatus({ kind: 'ok', msg: t('dlOne', { file: `${baseName}.pdf` }) });
      }
    } catch (e) {
      console.error(e);
      setStatus({ kind: 'error', msg: t('failed', { err: e.message }) });
    } finally {
      setBusy(null);
    }
  };

  const generateBoth = async () => {
    if (!parsed) {
      setStatus({ kind: 'error', msg: t('errNoSrt') });
      return;
    }
    setBusy('both');
    setStatus(null);
    try {
      const docxBlob = await buildDocxBlob({ header, parsed });
      downloadBlob(docxBlob, `${baseName}.docx`);
      await new Promise((r) => setTimeout(r, 400));
      const pdfBlob = await buildPdfBlob({ header, parsed });
      downloadBlob(pdfBlob, `${baseName}.pdf`);
      setStatus({
        kind: 'ok',
        msg: t('dlBoth', { docx: `${baseName}.docx`, pdf: `${baseName}.pdf` }),
      });
    } catch (e) {
      console.error(e);
      setStatus({ kind: 'error', msg: t('failed', { err: e.message }) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead-row">
          <h1>{t('h1')}</h1>
          <nav className="lang-switch" aria-label="Language">
            {LANGS.map(({ code, label, name }) => (
              <button
                key={code}
                className={`lang-btn ${lang === code ? 'active' : ''}`}
                onClick={() => chooseLang(code)}
                title={name}
                aria-pressed={lang === code}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
        <p className="tagline">{t('tagline')}</p>
      </header>

      <main className="columns">
        {/* ---------- left: form & explainer ---------- */}
        <section className="panel">
          <h2>{t('step1')}</h2>
          <p className="hint">{t('headerHint')}</p>
          <label className="field-label">
            {t('headerLabel')}
            <textarea
              className="header-text"
              value={header.headerText}
              onChange={setField('headerText')}
              placeholder={t('headerPlaceholder')}
              rows={4}
            />
          </label>
          <label className="field-label">
            {t('notesLabel')}
            <input
              type="text"
              className="notes-input"
              value={header.notes}
              onChange={setField('notes')}
              placeholder={t('notesPlaceholder')}
            />
          </label>

          <h2>{t('step2')}</h2>
          <div
            className="dropzone"
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current.click();
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".srt,.txt,text/plain"
              onChange={(e) => onFile(e.target.files && e.target.files[0])}
            />
            {fileName ? (
              <span className="drop-loaded">{t('dropLoaded', { name: fileName })}</span>
            ) : (
              <span>
                <strong>{t('dropDrop')}</strong>
                {t('dropChoose')}
              </span>
            )}
          </div>
          <textarea
            className="srt-paste"
            value={srtText}
            onChange={(e) => {
              setSrtText(e.target.value);
              if (e.target.value.trim() === '') setFileName('');
            }}
            placeholder={t('pastePlaceholder')}
            rows={7}
            spellCheck={false}
          />

          {parsed && (
            <div className="summary" aria-live="polite">
              <strong>{parsedCount}</strong> {t('summBlocks')} · <strong>{charCount}</strong>{' '}
              {t('summChars')}: {parsed.characters.join(', ')}
            </div>
          )}

          <h2>{t('step3')}</h2>
          <div className="actions">
            <button className="btn primary" onClick={generateBoth} disabled={!parsed || busy !== null}>
              {busy === 'both' ? t('generating') : t('btnBoth')}
            </button>
            <button className="btn" onClick={() => generate('docx')} disabled={!parsed || busy !== null}>
              {busy === 'docx' ? t('generating') : t('btnDocx')}
            </button>
            <button className="btn" onClick={() => generate('pdf')} disabled={!parsed || busy !== null}>
              {busy === 'pdf' ? t('generating') : t('btnPdf')}
            </button>
          </div>
          {status && (
            <div className={`status ${status.kind}`} role="status">
              {status.msg}
            </div>
          )}

          {/* ---------- input structure explainer ---------- */}
          <details className="explainer" open>
            <summary>{t('exSummary')}</summary>
            <p>
              {t('exIntro1')}
              <code>--&gt;</code>
              {t('exIntro2')}
            </p>
            <pre className="code">{INPUT_EXAMPLE[lang] || INPUT_EXAMPLE.en}</pre>
            <ul>
              <li>
                <strong>{t('exB1T')}</strong> {t('exB1B')}
                <code>[hh:mm:ss]</code>
                {t('exB1B2')}
              </li>
              <li>
                <strong>{t('exB2T')}</strong> <code>[Name]</code> {t('exB2B1')}
              </li>
              <li>
                <strong>{t('exB3T')}</strong> <code>[Name]</code> {t('exB3B1')}
              </li>
              <li>
                <strong>
                  {t('exB4T')}
                </strong>
                {t('exB4B')}
              </li>
              <li>
                <strong>{t('exB5T')}</strong> {t('exB5B')}
              </li>
            </ul>
          </details>
        </section>

        {/* ---------- right: live preview ---------- */}
        <section className="panel preview-panel">
          <h2>
            {t('previewTitle')} <span className="preview-note">{t('previewNote')}</span>
          </h2>
          {preview ? (
            <pre className="script-preview">{preview.trimEnd()}</pre>
          ) : (
            <div className="preview-empty">{t('previewEmpty')}</div>
          )}
        </section>
      </main>

      <footer className="foot">{t('footer')}</footer>
    </div>
  );
}

/* Keep <html lang> and the document title in sync with the current language. */
function useDocumentLang(lang, title) {
  React.useEffect(() => {
    document.documentElement.lang = lang;
    document.title = title;
  }, [lang, title]);
}

createRoot(document.getElementById('root')).render(<App />);