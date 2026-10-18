
import { useState } from 'react';
import type { ChangeEvent, FormEvent, ReactElement } from 'react';
import { contentApi, type ContentStatus, type Language, type Picture, type Topic } from '../content';
import { FormattedTextarea } from './FormattedTextarea';
import { inputLang, textIn } from './translation';
import { errorText } from './useAsync';

interface PictureEditorProps {
  readonly picture: Picture;
  /** Caption, date, place and story are edited in this language. */
  readonly lang: Language;
  readonly topics: readonly Topic[];
  readonly onClose: () => void;
  readonly onSaved: (message: string) => void;
}

interface Fields {
  caption: string;
  dateText: string;
  place: string;
  story: string;
  status: ContentStatus;
  topicId: string;
}

const orNull = (s: string): string | null => (s.trim() ? s.trim() : null);

/** Modal editor for one picture: captions, status, move, replace image, delete. */
export function PictureEditor({ picture, lang, topics, onClose, onSaved }: PictureEditorProps): ReactElement {
  const [f, setF] = useState<Fields>({
    caption: textIn(picture, 'caption', picture.caption, lang),
    dateText: textIn(picture, 'dateText', picture.dateText, lang),
    place: textIn(picture, 'place', picture.place, lang),
    story: textIn(picture, 'story', picture.story, lang),
    status: picture.status,
    topicId: picture.topicId,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, message: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onSaved(message);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const save = (e: FormEvent): void => {
    e.preventDefault();
    void run(
      () =>
        contentApi.updatePicture(picture.id, {
          caption: orNull(f.caption),
          dateText: orNull(f.dateText),
          place: orNull(f.place),
          story: orNull(f.story),
          status: f.status,
          ...(f.topicId !== picture.topicId ? { topicId: f.topicId } : {}),
        }, lang.code),
      f.topicId !== picture.topicId ? 'Picture saved and moved' : 'Picture saved',
    );
  };

  const replace = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) void run(() => contentApi.replacePictureImage(picture.id, file), 'Image replaced');
  };

  const remove = (): void => {
    if (window.confirm('Delete this picture? This cannot be undone.')) void run(() => contentApi.deletePicture(picture.id), 'Picture deleted');
  };

  const set = <K extends keyof Fields>(k: K, v: Fields[K]): void => setF({ ...f, [k]: v });
  /** In another language, the default language's text shows greyed until translated. */
  const hint = (base: string | null): string | undefined => (lang.isDefault ? undefined : (base ?? undefined));

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit picture">
      <form className="modal admin-form" onSubmit={save}>
        <img className="modal-preview" src={picture.images.display} alt="" />
        <label>Caption<input value={f.caption} maxLength={300} placeholder={hint(picture.caption)} {...inputLang(lang)} onChange={(e): void => set('caption', e.target.value)} /></label>
        <label>Date / year<input value={f.dateText} maxLength={60} placeholder={hint(picture.dateText) ?? 'e.g. Summer 1974'} {...inputLang(lang)} onChange={(e): void => set('dateText', e.target.value)} /></label>
        <label>Place<input value={f.place} maxLength={120} placeholder={hint(picture.place)} {...inputLang(lang)} onChange={(e): void => set('place', e.target.value)} /></label>
        <FormattedTextarea label="Story" value={f.story} maxLength={5000} rows={5} placeholder={hint(picture.story)} {...inputLang(lang)} onChange={(v): void => set('story', v)} />
        <label>Status
          <select value={f.status} onChange={(e): void => set('status', e.target.value as ContentStatus)}>
            <option value="draft">Draft (hidden)</option>
            <option value="published">Published</option>
          </select>
        </label>
        <label>Topic
          <select value={f.topicId} onChange={(e): void => set('topicId', e.target.value)}>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="admin-row">
          <button className="btn" type="submit" disabled={busy}>Save</button>
          <label className="btn">
            Replace image
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy} onChange={replace} aria-label="Replace image" />
          </label>
          <button className="btn danger" type="button" disabled={busy} onClick={remove}>Delete</button>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
