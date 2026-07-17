import mongoose from 'mongoose';
import { DBconnection } from '../database';
import User from '../modules/auth/auth.model';

const run = async () => {
  await DBconnection();
  const admins = await User.find({ role: { $in: ['admin', 'catalog-manager'] } }).lean().exec();
  console.log('--- ADMIN USERS ---');
  console.log(admins.map(u => ({ email: u.email_address, role: u.role, name: u.first_name })));
};

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
  });
