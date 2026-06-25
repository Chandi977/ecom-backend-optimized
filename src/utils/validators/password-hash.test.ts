import { hashPassword, comparePassword } from './password-hash';

describe('password-hash', () => {
  it('hashes a password into a non-plaintext bcrypt string', async () => {
    const hash = await hashPassword('s3cret!');
    expect(hash).not.toBe('s3cret!');
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('correct-horse');
    await expect(comparePassword('correct-horse', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse');
    await expect(comparePassword('battery-staple', hash)).resolves.toBe(false);
  });

  it('produces distinct hashes for identical input (random salt)', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(a).not.toBe(b);
  });
});
