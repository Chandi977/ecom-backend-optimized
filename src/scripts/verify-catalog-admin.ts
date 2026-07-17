import mongoose from 'mongoose';
import { DBconnection } from '../database';
import User from '../modules/auth/auth.model';

const run = async () => {
  await DBconnection();

  const email = 'catalog@premind.com';

  const user = await User.findOne({ email_address: email });
  if (!user) {
    console.log(`User ${email} not found. Creating...`);
    const { hashPassword } = await import('../utils/validators/password-hash');
    const hashedPassword = await hashPassword('CatalogPass123!');
    const newUser = new User({
      first_name: 'Catalog',
      last_name: 'Manager',
      email_address: email,
      password: hashedPassword,
      role: 'catalog-manager',
      isVerified: true,
    });
    await newUser.save();
    console.log(`Created ${email} with password CatalogPass123!`);
  } else {
    user.isVerified = true;
    user.role = 'catalog-manager';
    await user.save();
    console.log(`Verified ${email} as catalog-manager`);
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
