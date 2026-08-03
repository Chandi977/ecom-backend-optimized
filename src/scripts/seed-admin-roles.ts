import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { DBconnection } from '../database';
import User from '../modules/auth/auth.model';

const ROLES = [
  { role: 'admin', email: 'admin@prempackaging.com', first_name: 'Admin', last_name: 'User' },
  { role: 'manager', email: 'manager@prempackaging.com', first_name: 'Manager', last_name: 'User' },
  { role: 'general', email: 'general@prempackaging.com', first_name: 'General', last_name: 'User' },
  { role: 'seo', email: 'seo@prempackaging.com', first_name: 'SEO', last_name: 'User' },
  { role: 'catalog-manager', email: 'catalog@prempackaging.com', first_name: 'Catalog', last_name: 'Manager' },
];

const PASSWORD = 'Password@123';

async function main() {
  console.log('Connecting to MongoDB...');
  await DBconnection();
  console.log('Connected.');

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(PASSWORD, salt);

  for (const { role, email, first_name, last_name } of ROLES) {
    const existing = await User.findOne({ email_address: email }).exec();
    if (existing) {
      console.log(`✓ ${role} already exists (${email})`);
      continue;
    }

    await User.create({
      first_name,
      last_name,
      email_address: email,
      password: hashedPassword,
      role,
      isVerified: true,
    });

    console.log(`✓ Created ${role} (${email}) — password: ${PASSWORD}`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
