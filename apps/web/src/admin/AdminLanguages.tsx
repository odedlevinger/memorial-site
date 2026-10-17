import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { contentApi, type Direction, type Language } from '../content';
import { ENGLISH_LABELS, LABEL_KEYS, makeI18n, useI18n } from '../i18n';
import { inputLang } from './translation';
import { errorText } from './useAsync';

const DIRECTION_NAMES: Readonly<Record<Direction, string>> = { ltr: 'Left to right', rtl: 'Right to left' };

/** The languages the site is offered in: add, rename, set direction and labels, choose the default. */
export function AdminLanguages({ onChanged }: { readonly onChanged: () => void }): ReactElement {
  const { languages } = useI18n();
  // Mutations answer with the fresh list; App's copy catches up through onChanged().
  const [list, setList] = useState<readonly Language[]>(languages);
  const [labelsFor, setLabelsFor] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<Language[]>, done: string): Promise<boolean> => {
    setError(null);
    setMessage(null);
    try {
      setList(await action());
      setMessage(done);
      onChanged();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  };

  const editing = list.find((l) => l.code === labelsFor);

  return (
    <div>
      <h1 className="page-title">Languages</h1>
      <p className="admin-help">
        Visitors choose a language from the menu; the default language is shown until they do. Text
        that has not been translated yet appears in the default language. Choose the language to edit
        at the top of the Topics and Pages tabs.
      </p>
      {message && <p className="notice" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <ul className="admin-list">
        {list.map((l) => (
          <LanguageRow
            key={l.code}
            language={l}
            onSave={(patch): void => void run(() => contentApi.updateLanguage(l.code, patch), `${patch.name} saved`)}
            onMakeDefault={(): void => void run(() => contentApi.updateLanguage(l.code, { isDefault: true }), `${l.name} is now the default language`)}
            onLabels={(): void => setLabelsFor(labelsFor === l.code ? null : l.code)}
            onRemove={(): void => {
              if (window.confirm(`Stop offering the site in ${l.name}? Its translations are kept in case you add it again.`)) {
                void run(() => contentApi.removeLanguage(l.code), `${l.name} removed`);
              }
            }}
          />
        ))}
      </ul>
      <AddLanguage onAdd={(language): Promise<boolean> => run(() => contentApi.addLanguage(language), `${language.name} added`)} />
      {editing && (
        <LabelsEditor
          key={editing.code}
          language={editing}
          languages={list}
          onSave={(labels): void => void run(() => contentApi.updateLanguage(editing.code, { labels }), `${editing.name} labels saved`)}
        />
      )}
    </div>
  );
}

interface RowProps {
  readonly language: Language;
  readonly onSave: (patch: { name: string; direction: Direction }) => void;
  readonly onMakeDefault: () => void;
  readonly onLabels: () => void;
  readonly onRemove: () => void;
}

function LanguageRow({ language, onSave, onMakeDefault, onLabels, onRemove }: RowProps): ReactElement {
  const [name, setName] = useState(language.name);
  const [direction, setDirection] = useState<Direction>(language.direction);
  useEffect(() => {
    setName(language.name);
    setDirection(language.direction);
  }, [language]);

  const save = (e: FormEvent): void => {
    e.preventDefault();
    onSave({ name: name.trim(), direction });
  };

  return (
    <li>
      <form className="admin-row lang-row" onSubmit={save} aria-label={`${language.name} (${language.code})`}>
        <code className="admin-meta">{language.code}</code>
        <input aria-label="Name" value={name} required maxLength={40} dir={direction} lang={language.code} onChange={(e): void => setName(e.target.value)} />
        <select aria-label="Direction" value={direction} onChange={(e): void => setDirection(e.target.value as Direction)}>
          {Object.entries(DIRECTION_NAMES).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button className="btn" type="submit">Save</button>
        {language.isDefault ? (
          <span className="cover-badge">Default</span>
        ) : (
          <button className="btn" type="button" onClick={onMakeDefault}>Make default</button>
        )}
        <button className="btn" type="button" onClick={onLabels}>Labels</button>
        {!language.isDefault && (
          <button className="btn danger" type="button" onClick={onRemove}>Remove</button>
        )}
      </form>
    </li>
  );
}

function AddLanguage({ onAdd }: { readonly onAdd: (language: Pick<Language, 'code' | 'name' | 'direction'>) => Promise<boolean> }): ReactElement {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [direction, setDirection] = useState<Direction>('ltr');

  const add = (e: FormEvent): void => {
    e.preventDefault();
    void onAdd({ code: code.trim().toLowerCase(), name: name.trim(), direction }).then((ok) => {
      if (!ok) return;
      setCode('');
      setName('');
      setDirection('ltr');
    });
  };

  return (
    <section aria-labelledby="add-language">
      <h2 id="add-language" className="admin-h2">Add a language</h2>
      <form className="admin-form" onSubmit={add}>
        <label>
          Language code
          <input value={code} required maxLength={20} pattern="[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,2}" placeholder="e.g. he, en, fr, pt-br" onChange={(e): void => setCode(e.target.value)} />
        </label>
        <label>
          Name, as visitors see it in the menu
          <input value={name} required maxLength={40} placeholder="e.g. עברית, English, Français" dir="auto" onChange={(e): void => setName(e.target.value)} />
        </label>
        <label>
          Text direction
          <select value={direction} onChange={(e): void => setDirection(e.target.value as Direction)}>
            {Object.entries(DIRECTION_NAMES).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <div className="admin-row">
          <button className="btn" type="submit">Add language</button>
        </div>
      </form>
    </section>
  );
}

interface LabelsProps {
  readonly language: Language;
  readonly languages: readonly Language[];
  readonly onSave: (labels: Record<string, string>) => void;
}

/** The public site's menu items, buttons and messages in one language. */
function LabelsEditor({ language, languages, onSave }: LabelsProps): ReactElement {
  const [values, setValues] = useState<Record<string, string>>({ ...language.labels });
  // What each label shows when left empty: this language's built-in text, else the default's.
  const withoutOverrides = languages.map((l) => (l.code === language.code ? { ...l, labels: {} } : l));
  const fallback = makeI18n(withoutOverrides, language.code, () => undefined);

  const save = (e: FormEvent): void => {
    e.preventDefault();
    onSave(Object.fromEntries(Object.entries(values).filter(([, text]) => text.trim() !== '')));
  };

  return (
    <section aria-labelledby="labels-title">
      <h2 id="labels-title" className="admin-h2">{language.name} labels</h2>
      <p className="admin-help">
        The menu, buttons and messages of the public site. Leave a label empty to use the text shown
        greyed. <code>{'{n}'}</code> and <code>{'{count}'}</code> are filled in with numbers.
      </p>
      <form className="admin-form labels-form" onSubmit={save}>
        {LABEL_KEYS.map((key) => (
          <label key={key}>
            {ENGLISH_LABELS[key]}
            <input
              value={values[key] ?? ''}
              maxLength={500}
              placeholder={fallback.t(key)}
              {...inputLang(language)}
              onChange={(e): void => setValues({ ...values, [key]: e.target.value })}
            />
          </label>
        ))}
        <div className="admin-row">
          <button className="btn" type="submit">Save labels</button>
        </div>
      </form>
    </section>
  );
}
