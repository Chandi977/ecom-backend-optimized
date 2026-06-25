import {
  validateSignup,
  validateSignin,
  validateEmail,
  validateProduct,
  validateCategory,
  sanitizeString,
} from './index';

describe('validateSignup', () => {
  it('requires first_name, email_address and password', () => {
    expect(validateSignup({ first_name: 'A', email_address: 'a@b.com', password: 'x' })).toBe(true);
    expect(validateSignup({ email_address: 'a@b.com', password: 'x' })).toBe(false);
    expect(validateSignup({})).toBe(false);
  });
});

describe('validateSignin', () => {
  it('requires email_address and password', () => {
    expect(validateSignin({ email_address: 'a@b.com', password: 'x' })).toBe(true);
    expect(validateSignin({ email_address: 'a@b.com' })).toBe(false);
  });
});

describe('validateEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validateEmail('first.last@sub.domain.co')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(validateEmail('not-an-email')).toBe(false);
    expect(validateEmail('missing@domain')).toBe(false);
    expect(validateEmail('spaces in@email.com')).toBe(false);
    expect(validateEmail('')).toBe(false);
  });
});

describe('validateProduct', () => {
  it('requires name and category', () => {
    expect(validateProduct({ name: 'Widget', category: 'c1' })).toBe(true);
    expect(validateProduct({ name: 'Widget' })).toBe(false);
  });
});

describe('validateCategory', () => {
  it('requires a name', () => {
    expect(validateCategory({ name: 'Tools' })).toBe(true);
    expect(validateCategory({})).toBe(false);
  });
});

describe('sanitizeString', () => {
  it('escapes HTML-sensitive characters', () => {
    expect(sanitizeString('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
    expect(sanitizeString("O'Reilly & Sons")).toBe('O&#x27;Reilly &amp; Sons');
  });

  it('returns an empty string for non-string input', () => {
    expect(sanitizeString(42)).toBe('');
    expect(sanitizeString(null)).toBe('');
    expect(sanitizeString(undefined)).toBe('');
  });
});
