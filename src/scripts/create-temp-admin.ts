import mongoose from 'mongoose';
import { DBconnection } from '../database';
import User from '../modules/auth/auth.model';
import { hashPassword } from '../utils/validators/password-hash';

const run = async () => {
  await DBconnection();
  
  const email = 'tempadmin@premind.com';
  
  // Check if already exists
  const existing = await User.findOne({ email_address: email });
  if (existing) {
    console.log('Temp admin already exists');
    await mongoose.disconnect();
    process.exit(0);
  }
  
  const hashedPassword = await hashPassword('AdminPassword123!');
  
  const newAdmin = new User({
    first_name: 'Temp',
    last_name: 'Admin',
    email_address: email,
    password: hashedPassword,
    role: 'admin',
    isVerified: true
  });
  
  await newAdmin.save();
  console.log('Created temp admin user with email tempadmin@premind.com and password AdminPassword123!');
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
