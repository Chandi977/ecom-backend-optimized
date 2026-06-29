import { Response } from 'express';
import User from '../auth/auth.model';
import PasswordReset from '../password-reset/password-reset.model';
import { hashPassword, comparePassword } from '../../utils/validators/password-hash';
import { addJob, emailQueue } from '../../queue';
import { IAuthRequest } from '../../types';

// Max guesses allowed against a single OTP before it is locked. The IP rate
// limiter can be evaded with rotating IPs, so this caps brute force per code.
const MAX_OTP_ATTEMPTS = 5;

export const forgotPassword = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { email } = req.body;
  const email_address = email;
  try {
    const user = await User.findOne({ email_address }).exec();
    if (!user) {
      res.status(404).json({ message: 'User not found' }); return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    // Store only a one-way hash of the OTP so a DB breach can't reveal active reset codes.
    const hashedOtp = await hashPassword(otp);
    const resetEntry = new PasswordReset({
      email: email_address,
      otp: hashedOtp,
      expiresAt: new Date(Date.now() + 600000),
    });
    await resetEntry.save();

    // The plaintext OTP is only ever sent to the user's email, never persisted.
    await addJob(emailQueue, 'forgot-password', {
      to: email_address,
      subject: 'Password Reset OTP',
      otp,
    });

    res.status(200).json({ message: 'OTP generated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error', error: error instanceof Error ? error.message : 'Unknown' });
  }
};

export const verifyOTP = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { email, otp } = req.body;
  const email_address = email;
  try {
    const user = await User.findOne({ email_address }).exec();
    if (!user) {
      res.status(404).json({ message: 'User not found' }); return;
    }

    const resetEntry = await PasswordReset.findOne({ email: email_address }).sort({ createdAt: -1 }).exec();
    if (!resetEntry) {
      res.status(400).json({ message: 'Invalid OTP' }); return;
    }
    // The TTL index only sweeps expired docs roughly once a minute, so an
    // expired OTP can still be present. Reject it explicitly here so a stale
    // code is never accepted in that window.
    if (resetEntry.expiresAt < new Date()) {
      res.status(400).json({ message: 'OTP expired' }); return;
    }
    // Lock the OTP once it has been guessed too many times.
    if ((resetEntry.attempts ?? 0) >= MAX_OTP_ATTEMPTS) {
      res.status(429).json({ message: 'Too many invalid attempts. Please request a new OTP.' }); return;
    }
    // Compare the submitted OTP against the stored bcrypt hash.
    const isOtpValid = await comparePassword(otp, resetEntry.otp);
    if (!isOtpValid) {
      resetEntry.attempts = (resetEntry.attempts ?? 0) + 1;
      await resetEntry.save();
      res.status(400).json({ message: 'Invalid OTP' }); return;
    }

    // Mark the OTP verified so resetPassword can confirm the requester proved
    // ownership of the email before the password is changed.
    resetEntry.verified = true;
    await resetEntry.save();

    res.status(200).json({ message: 'OTP verified successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error', error: error instanceof Error ? error.message : 'Unknown' });
  }
};

export const resetPassword = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { email_address, new_password, confirm_password } = req.body;
  try {
    const user = await User.findOne({ email_address }).exec();
    if (!user) {
      res.status(404).json({ message: 'User not found' }); return;
    }
    if (new_password !== confirm_password) {
      res.status(400).json({ message: 'Passwords do not match' }); return;
    }

    // Require a verified, unexpired OTP for this email. Without this gate the
    // endpoint would reset any account's password given only the email address.
    const resetEntry = await PasswordReset.findOne({ email: email_address }).sort({ createdAt: -1 }).exec();
    if (!resetEntry || !resetEntry.verified || resetEntry.expiresAt < new Date()) {
      res.status(400).json({ message: 'OTP not verified. Please verify the OTP before resetting your password.' }); return;
    }

    const hashedPassword = await hashPassword(new_password);
    user.password = hashedPassword;
    await user.save();

    // Invalidate every reset entry for this email so the verified OTP can't be replayed.
    await PasswordReset.deleteMany({ email: email_address }).exec();

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error', error: error instanceof Error ? error.message : 'Unknown' });
  }
};
