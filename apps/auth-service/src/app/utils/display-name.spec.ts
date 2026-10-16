import { computeDisplayName, parseDisplayName } from './display-name.js';

describe('computeDisplayName', () => {
  it('combines all three fields with middle initial', () => {
    expect(computeDisplayName('David', 'Amit', 'Cohen')).toBe('David A. Cohen');
  });

  it('omits middle initial when secondName is null', () => {
    expect(computeDisplayName('David', null, 'Cohen')).toBe('David Cohen');
  });

  it('omits middle initial when secondName is undefined', () => {
    expect(computeDisplayName('David', undefined, 'Cohen')).toBe('David Cohen');
  });

  it('omits lastName when null', () => {
    expect(computeDisplayName('David', null, null)).toBe('David');
  });

  it('returns null when all fields are null', () => {
    expect(computeDisplayName(null, null, null)).toBeNull();
  });

  it('returns null when all fields are undefined', () => {
    expect(computeDisplayName(undefined, undefined, undefined)).toBeNull();
  });

  it('returns null when all fields are empty strings', () => {
    expect(computeDisplayName('', '', '')).toBeNull();
  });

  it('uses only the first letter of secondName as initial', () => {
    expect(computeDisplayName('David', 'Ben-Ami', 'Cohen')).toBe('David B. Cohen');
  });

  it('uppercases the initial letter', () => {
    expect(computeDisplayName('David', 'amit', 'Cohen')).toBe('David A. Cohen');
  });

  it('uses single-char secondName as initial', () => {
    expect(computeDisplayName('David', 'A', 'Cohen')).toBe('David A. Cohen');
  });

  it('trims leading/trailing whitespace from all fields', () => {
    expect(computeDisplayName('  David  ', '  Amit  ', '  Cohen  ')).toBe('David A. Cohen');
  });

  it('handles firstName only with no other fields', () => {
    expect(computeDisplayName('David', '', '')).toBe('David');
  });

  it('handles lastName only when firstName is null', () => {
    expect(computeDisplayName(null, null, 'Cohen')).toBe('Cohen');
  });
});

describe('parseDisplayName', () => {
  it('returns all nulls for null input', () => {
    expect(parseDisplayName(null)).toEqual({ firstName: null, secondName: null, lastName: null });
  });

  it('returns all nulls for undefined input', () => {
    expect(parseDisplayName(undefined)).toEqual({ firstName: null, secondName: null, lastName: null });
  });

  it('returns all nulls for empty string', () => {
    expect(parseDisplayName('')).toEqual({ firstName: null, secondName: null, lastName: null });
  });

  it('returns all nulls for whitespace-only string', () => {
    expect(parseDisplayName('   ')).toEqual({ firstName: null, secondName: null, lastName: null });
  });

  it('maps single word to firstName only', () => {
    expect(parseDisplayName('David')).toEqual({ firstName: 'David', secondName: null, lastName: null });
  });

  it('maps two words to firstName + lastName', () => {
    expect(parseDisplayName('David Cohen')).toEqual({ firstName: 'David', secondName: null, lastName: 'Cohen' });
  });

  it('maps three words to firstName + secondName + lastName', () => {
    expect(parseDisplayName('David Amit Cohen')).toEqual({ firstName: 'David', secondName: 'Amit', lastName: 'Cohen' });
  });

  it('maps four words: first word → firstName, last word → lastName, middle → secondName', () => {
    expect(parseDisplayName('David Ben Ami Cohen')).toEqual({
      firstName: 'David',
      secondName: 'Ben Ami',
      lastName: 'Cohen',
    });
  });

  it('handles extra internal whitespace by splitting on any whitespace', () => {
    expect(parseDisplayName('David  Cohen')).toEqual({ firstName: 'David', secondName: null, lastName: 'Cohen' });
  });

  it('trims leading and trailing whitespace before parsing', () => {
    expect(parseDisplayName('  David Cohen  ')).toEqual({ firstName: 'David', secondName: null, lastName: 'Cohen' });
  });
});
