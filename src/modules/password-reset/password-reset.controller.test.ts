import type { Response } from 'express';
import { hashPassword, comparePassword } from '../../utils/validators/password-hash';

// --- Mocks for external dependencies (DB models + job queue) ---------------

// Capture every document created via `new PasswordReset(...)` so the test can
// inspect what actually gets persisted.
const constructedDocs: Array<Record<string, unknown>> = [];
const saveMock = jest.fn().mockResolvedValue(undefined);

jest.mock('./password-reset.model', () => {
  class PasswordResetMock {
    static findOne = jest.fn();
    static deleteMany = jest.fn();
    save = saveMock;
    constructor(data: Record<string, unknown>) {
      Object.assign(this, data);
      constructedDocs.push(this as unknown as Record<string, unknown>);
    }
  }
  return { __esModule: true, default: PasswordResetMock };
});

jest.mock('../auth/auth.model', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

const addJobMock = jest.fn().mockResolvedValue(undefined);
jest.mock('../../queue', () => ({
  __esModule: true,
  addJob: (...args: unknown[]) => addJobMock(...args),
  emailQueue: { name: 'email' },
}));

import { forgotPassword, verifyOTP, resetPassword } from './password-reset.controller';
import User from '../auth/auth.model';
import PasswordReset from './password-reset.model';

const mockUser = User as unknown as { findOne: jest.Mock };
const mockReset = PasswordReset as unknown as { findOne: jest.Mock; deleteMany: jest.Mock };

type TestResponse = Response & { statusCode?: number; body?: { message?: string } };

const makeRes = (): TestResponse => {
  const res = {} as TestResponse;
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response['status'];
  res.json = jest.fn((payload: { message?: string }) => {
    res.body = payload;
    return res;
  }) as unknown as Response['json'];
  return res;
};

const existingUser = (email = 'user@example.com') => ({
  exec: jest.fn().mockResolvedValue({ email_address: email }),
});

const resetEntryChain = (entry: unknown) => ({
  sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(entry) }),
});

beforeEach(() => {
  constructedDocs.length = 0;
});

describe('forgotPassword', () => {
  it('persists only a bcrypt hash of the OTP and emails the plaintext code', async () => {
    mockUser.findOne.mockReturnValue(existingUser());
    const res = makeRes();

    await forgotPassword({ body: { email: 'user@example.com' } } as never, res);

    expect(res.statusCode).toBe(200);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(constructedDocs).toHaveLength(1);

    // The plaintext OTP is the 6-digit code dispatched to the email queue.
    expect(addJobMock).toHaveBeenCalledTimes(1);
    const emailedOtp = (addJobMock.mock.calls[0][2] as { otp: string }).otp;
    expect(emailedOtp).toMatch(/^\d{6}$/);

    // The stored value must be a hash, never the plaintext OTP.
    const storedOtp = constructedDocs[0].otp as string;
    expect(storedOtp).not.toBe(emailedOtp);
    expect(storedOtp).toMatch(/^\$2[aby]\$/);
    await expect(comparePassword(emailedOtp, storedOtp)).resolves.toBe(true);
  });

  it('returns 404 when the user does not exist', async () => {
    mockUser.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    const res = makeRes();

    await forgotPassword({ body: { email: 'ghost@example.com' } } as never, res);

    expect(res.statusCode).toBe(404);
    expect(saveMock).not.toHaveBeenCalled();
  });
});

describe('verifyOTP', () => {
  it('accepts a correct OTP by comparing against the stored hash', async () => {
    const otp = '123456';
    const hashed = await hashPassword(otp);
    mockUser.findOne.mockReturnValue(existingUser());
    mockReset.findOne.mockReturnValue(
      resetEntryChain({ otp: hashed, expiresAt: new Date(Date.now() + 60_000), attempts: 0, save: jest.fn() })
    );
    const res = makeRes();

    await verifyOTP({ body: { email: 'user@example.com', otp } } as never, res);

    expect(res.statusCode).toBe(200);
  });

  it('rejects an incorrect OTP and records the failed attempt', async () => {
    const hashed = await hashPassword('123456');
    const save = jest.fn().mockResolvedValue(undefined);
    const entry = { otp: hashed, expiresAt: new Date(Date.now() + 60_000), attempts: 0, save };
    mockUser.findOne.mockReturnValue(existingUser());
    mockReset.findOne.mockReturnValue(resetEntryChain(entry));
    const res = makeRes();

    await verifyOTP({ body: { email: 'user@example.com', otp: '000000' } } as never, res);

    expect(res.statusCode).toBe(400);
    expect(res.body?.message).toBe('Invalid OTP');
    expect(entry.attempts).toBe(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('locks the OTP after too many failed attempts', async () => {
    const hashed = await hashPassword('123456');
    mockUser.findOne.mockReturnValue(existingUser());
    mockReset.findOne.mockReturnValue(
      resetEntryChain({ otp: hashed, expiresAt: new Date(Date.now() + 60_000), attempts: 5, save: jest.fn() })
    );
    const res = makeRes();

    await verifyOTP({ body: { email: 'user@example.com', otp: '000000' } } as never, res);

    expect(res.statusCode).toBe(429);
  });

  it('rejects an expired OTP before comparing', async () => {
    const hashed = await hashPassword('123456');
    mockUser.findOne.mockReturnValue(existingUser());
    mockReset.findOne.mockReturnValue(
      resetEntryChain({ otp: hashed, expiresAt: new Date(Date.now() - 1_000), attempts: 0, save: jest.fn() })
    );
    const res = makeRes();

    await verifyOTP({ body: { email: 'user@example.com', otp: '123456' } } as never, res);

    expect(res.statusCode).toBe(400);
    expect(res.body?.message).toBe('OTP expired');
  });

  it('rejects when no reset entry exists', async () => {
    mockUser.findOne.mockReturnValue(existingUser());
    mockReset.findOne.mockReturnValue(resetEntryChain(null));
    const res = makeRes();

    await verifyOTP({ body: { email: 'user@example.com', otp: '123456' } } as never, res);

    expect(res.statusCode).toBe(400);
    expect(res.body?.message).toBe('Invalid OTP');
  });
});

describe('resetPassword', () => {
  const validBody = {
    email_address: 'user@example.com',
    new_password: 'NewPass123!',
    confirm_password: 'NewPass123!',
  };

  it('resets the password when a verified, unexpired OTP exists', async () => {
    const user = { email_address: 'user@example.com', password: 'old', save: jest.fn().mockResolvedValue(undefined) };
    mockUser.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(user) });
    mockReset.findOne.mockReturnValue(
      resetEntryChain({ verified: true, expiresAt: new Date(Date.now() + 60_000) })
    );
    mockReset.deleteMany.mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) });
    const res = makeRes();

    await resetPassword({ body: validBody } as never, res);

    expect(res.statusCode).toBe(200);
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(user.password).not.toBe('old');
    expect(mockReset.deleteMany).toHaveBeenCalledWith({ email: 'user@example.com' });
  });

  it('refuses to reset the password without a verified OTP (closes the bypass)', async () => {
    const user = { email_address: 'user@example.com', password: 'old', save: jest.fn().mockResolvedValue(undefined) };
    mockUser.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(user) });
    mockReset.findOne.mockReturnValue(
      resetEntryChain({ verified: false, expiresAt: new Date(Date.now() + 60_000) })
    );
    const res = makeRes();

    await resetPassword({ body: validBody } as never, res);

    expect(res.statusCode).toBe(400);
    expect(res.body?.message).toMatch(/not verified/i);
    expect(user.save).not.toHaveBeenCalled();
  });

  it('refuses to reset when the verified OTP has expired', async () => {
    const user = { email_address: 'user@example.com', password: 'old', save: jest.fn().mockResolvedValue(undefined) };
    mockUser.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(user) });
    mockReset.findOne.mockReturnValue(
      resetEntryChain({ verified: true, expiresAt: new Date(Date.now() - 1_000) })
    );
    const res = makeRes();

    await resetPassword({ body: validBody } as never, res);

    expect(res.statusCode).toBe(400);
    expect(user.save).not.toHaveBeenCalled();
  });
});
