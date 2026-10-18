import { useState } from 'react';
import type { ReactElement } from 'react';
import type { Language, Role } from '../content';
import { useI18n } from '../i18n';
import { hrefFor, type Route } from '../route';
import { AdminActivity } from './AdminActivity';
import { AdminEditors } from './AdminEditors';
import { AdminLanguages } from './AdminLanguages';
import { AdminPages } from './AdminPages';
import { AdminTopic } from './AdminTopic';
import { AdminTopics } from './AdminTopics';

interface AdminAppProps {
  readonly route: Route;
  readonly role: Role;
  /** Called after any change that affects the public site, so the header refreshes. */
  readonly onContentChanged: () => void;
}

/** Back office shell — only for editors and owners (SPEC §1). Always English, left to right. */
export function AdminApp({ route, role, onContentChanged }: AdminAppProps): ReactElement {
  const { languages, defaultLanguage } = useI18n();
  const [editCode, setEditCode] = useState<string | null>(null);
  const editLang = languages.find((l) => l.code === editCode) ?? defaultLanguage;

  if (role === 'viewer') {
    return (
      <article className="prose-page account" dir="ltr" lang="en">
        <h1 className="page-title">Back office</h1>
        <p>You need to be signed in as an editor to manage the site.</p>
        <p><a href={hrefFor({ page: 'account' })}>Sign in</a></p>
      </article>
    );
  }

  const translatable = route.page === 'admin-topic' || route.page === 'admin-pages';
  const tab = (to: Route, label: string, active = route.page === to.page): ReactElement => (
    <a href={hrefFor(to)} aria-current={active ? 'page' : undefined}>{label}</a>
  );

  return (
    <section className="admin" dir="ltr" lang="en">
      <nav className="admin-tabs" aria-label="Back office">
        {tab({ page: 'admin' }, 'Topics', route.page === 'admin' || route.page === 'admin-topic')}
        {tab({ page: 'admin-pages' }, 'Pages')}
        {tab({ page: 'admin-languages' }, 'Languages')}
        {tab({ page: 'admin-activity' }, 'Activity')}
        {role === 'owner' && tab({ page: 'admin-editors' }, 'Editors')}
      </nav>
      {translatable && languages.length > 1 && (
        <EditLanguagePicker languages={languages} value={editLang} defaultLanguage={defaultLanguage} onChange={setEditCode} />
      )}
      {route.page === 'admin-topic' ? (
        <AdminTopic key={route.id} id={route.id} lang={editLang} onChanged={onContentChanged} />
      ) : route.page === 'admin-editors' && role === 'owner' ? (
        <AdminEditors onOwnerChanged={onContentChanged} />
      ) : route.page === 'admin-pages' ? (
        <AdminPages lang={editLang} onChanged={onContentChanged} />
      ) : route.page === 'admin-languages' ? (
        <AdminLanguages onChanged={onContentChanged} />
      ) : route.page === 'admin-activity' ? (
        <AdminActivity />
      ) : (
        <AdminTopics onChanged={onContentChanged} />
      )}
    </section>
  );
}

interface PickerProps {
  readonly languages: readonly Language[];
  readonly value: Language;
  readonly defaultLanguage: Language;
  readonly onChange: (code: string) => void;
}

function EditLanguagePicker({ languages, value, defaultLanguage, onChange }: PickerProps): ReactElement {
  return (
    <div className="admin-lang">
      <label>
        Editing language
        <select value={value.code} onChange={(e): void => onChange(e.target.value)}>
          {languages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}{l.isDefault ? ' (default)' : ''}
            </option>
          ))}
        </select>
      </label>
      {!value.isDefault && (
        <p className="admin-help">
          You are editing the {value.name} text. Anything left empty shows the {defaultLanguage.name} text, shown greyed in each
          field. Web addresses, status, order and photos are shared by all languages.
        </p>
      )}
    </div>
  );
}
