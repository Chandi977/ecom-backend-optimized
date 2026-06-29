import { normalizeMojibake, normalizeMojibakeInObject } from './text-encoding';
import mongoose from 'mongoose';

describe('normalizeMojibake', () => {
  it('repairs common UTF-8-as-Latin1 mojibake sequences', () => {
    expect(normalizeMojibake('cafÃ©')).toBe('café');
    expect(normalizeMojibake('Ã¨Ãª')).toBe('èê');
    expect(normalizeMojibake('Å"uvre')).toBe('œuvre');
  });

  it('strips stray Â artifacts', () => {
    expect(normalizeMojibake('priceÂ 10')).toBe('price 10');
  });

  it('leaves clean text untouched', () => {
    expect(normalizeMojibake('plain ASCII text')).toBe('plain ASCII text');
  });
});

describe('normalizeMojibakeInObject', () => {
  it('normalizes string values recursively', () => {
    const input = {
      title: 'cafÃ©',
      tags: ['Ã¨', 'clean'],
      nested: { note: 'Å"uvre' },
      count: 3,
      active: true,
    };

    expect(normalizeMojibakeInObject(input)).toEqual({
      title: 'café',
      tags: ['è', 'clean'],
      nested: { note: 'œuvre' },
      count: 3,
      active: true,
    });
  });

  it('passes non-string primitives through unchanged', () => {
    expect(normalizeMojibakeInObject(42)).toBe(42);
    expect(normalizeMojibakeInObject(null)).toBeNull();
  });

  it('preserves non-plain objects while walking surrounding fields', () => {
    const id = new mongoose.Types.ObjectId();
    const date = new Date('2026-06-25T00:00:00.000Z');
    const input = {
      _id: id,
      createdAt: date,
      title: 'plain title',
      nested: {
        _id: id,
        note: 'plain note',
      },
    };

    const result = normalizeMojibakeInObject(input);

    expect(result._id).toBe(id);
    expect(result.createdAt).toBe(date);
    expect(result.title).toBe('plain title');
    expect(result.nested._id).toBe(id);
    expect(result.nested.note).toBe('plain note');
  });
});
