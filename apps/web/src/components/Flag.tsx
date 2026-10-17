import type { ReactElement } from 'react';

/** Country whose flag stands for a language with no region in its code (e.g. `en`, not `en-gb`). */
const LANGUAGE_COUNTRY: Readonly<Record<string, string>> = {
  en: 'US',
  he: 'IL',
  fr: 'FR',
  de: 'DE',
  es: 'ES',
  it: 'IT',
  pt: 'PT',
  nl: 'NL',
  ru: 'RU',
  uk: 'UA',
  pl: 'PL',
  ja: 'JP',
};

/** The country code for a language code: its region (`pt-br` → BR), else the table above. */
export function countryFor(code: string): string | null {
  const [language, region] = code.toLowerCase().split('-') as [string, string | undefined];
  if (region && /^[a-z]{2}$/.test(region)) return region.toUpperCase();
  return LANGUAGE_COUNTRY[language] ?? null;
}

/**
 * A small flag for a language. Israel and the US are drawn here because Windows shows flag
 * emoji as two letters; other countries use the emoji, and a language with no country its code.
 */
export function Flag({ code }: { readonly code: string }): ReactElement {
  const country = countryFor(code);
  if (country === 'IL') return <IsraelFlag />;
  if (country === 'US') return <UsFlag />;
  if (country) {
    const emoji = String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
    return <span className="flag flag-emoji" aria-hidden="true">{emoji}</span>;
  }
  return <span className="flag flag-code" aria-hidden="true">{code.toUpperCase()}</span>;
}

function IsraelFlag(): ReactElement {
  return (
    <svg className="flag" viewBox="0 0 220 160" aria-hidden="true">
      <rect width="220" height="160" fill="#fff" />
      <rect y="15" width="220" height="25" fill="#0038b8" />
      <rect y="120" width="220" height="25" fill="#0038b8" />
      <g fill="none" stroke="#0038b8" strokeWidth="5.5">
        <polygon points="110,48.5 137.3,95.75 82.7,95.75" />
        <polygon points="110,111.5 137.3,64.25 82.7,64.25" />
      </g>
    </svg>
  );
}

function UsFlag(): ReactElement {
  const stripe = 20 / 13;
  return (
    <svg className="flag" viewBox="0 0 30 20" aria-hidden="true">
      <rect width="30" height="20" fill="#b22234" />
      {[1, 3, 5, 7, 9, 11].map((i) => (
        <rect key={i} y={i * stripe} width="30" height={stripe} fill="#fff" />
      ))}
      <rect width="12" height={7 * stripe} fill="#3c3b6e" />
      <g fill="#fff">
        {[0, 1, 2, 3, 4].flatMap((x) => [0, 1, 2, 3].map((y) => <circle key={`${x}-${y}`} cx={1.4 + x * 2.3} cy={1.4 + y * 2.6} r="0.55" />))}
      </g>
    </svg>
  );
}
