import {
  buildUnsubscribeUrl,
  normalizeEmail,
  unsubscribeToken,
  verifyUnsubscribeToken,
} from './marketing.service';

describe('promotional email unsubscribe tokens', () => {
  const email = 'Customer@Example.com';

  it('normalizes email addresses before hashing / storing', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });

  it('produces a deterministic, case-insensitive token', () => {
    expect(unsubscribeToken('Foo@Bar.com')).toBe(unsubscribeToken('foo@bar.com'));
    expect(unsubscribeToken(email)).toHaveLength(32);
  });

  it('verifies the token for its own address only', () => {
    const token = unsubscribeToken(email);
    expect(verifyUnsubscribeToken(email, token)).toBe(true);
    expect(verifyUnsubscribeToken('someone-else@example.com', token)).toBe(false);
  });

  it('rejects missing and tampered tokens', () => {
    const token = unsubscribeToken(email);
    expect(verifyUnsubscribeToken('', '')).toBe(false);
    expect(verifyUnsubscribeToken(email, '')).toBe(false);
    expect(verifyUnsubscribeToken(email, `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`)).toBe(false);
  });

  it('builds a storefront link carrying the normalized address and token', () => {
    const url = new URL(buildUnsubscribeUrl(email));
    expect(url.pathname).toBe('/unsubscribe');
    expect(url.searchParams.get('e')).toBe('customer@example.com');
    expect(url.searchParams.get('t')).toBe(unsubscribeToken(email));
  });
});
