import type { ReactElement } from 'react';
import type { TopicKind } from '../content';

/** What each kind of topic page is called in the back office. */
export const KIND_NAMES: Readonly<Record<TopicKind, string>> = { pictures: 'Picture set', text: 'Text', book: 'Book', movie: 'Movie' };

interface KindSelectProps {
  readonly value: TopicKind;
  readonly onChange: (kind: TopicKind) => void;
  readonly 'aria-label'?: string;
}

export function KindSelect({ value, onChange, 'aria-label': label }: KindSelectProps): ReactElement {
  return (
    <select value={value} aria-label={label} onChange={(e): void => onChange(e.target.value as TopicKind)}>
      {(Object.keys(KIND_NAMES) as TopicKind[]).map((k) => (
        <option key={k} value={k}>{KIND_NAMES[k]}</option>
      ))}
    </select>
  );
}
