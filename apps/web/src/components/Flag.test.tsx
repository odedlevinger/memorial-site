import { render } from '@testing-library/react';
import { countryFor, Flag } from './Flag';

describe('Flag', () => {
  it('maps language codes to countries: region first, then the language table', () => {
    expect(countryFor('he')).toBe('IL');
    expect(countryFor('en')).toBe('US');
    expect(countryFor('en-gb')).toBe('GB');
    expect(countryFor('pt-BR')).toBe('BR');
    expect(countryFor('zh-hant')).toBeNull(); // a script, not a region
    expect(countryFor('xx')).toBeNull();
  });

  it('draws Israel and the US, uses emoji for other countries and the code otherwise', () => {
    expect(render(<Flag code="he" />).container.querySelector('svg polygon')).toBeTruthy();
    expect(render(<Flag code="en" />).container.querySelectorAll('svg circle')).toHaveLength(20);
    expect(render(<Flag code="fr" />).container.textContent).toBe('🇫🇷');
    expect(render(<Flag code="eo" />).container.textContent).toBe('EO');
  });
});
