/**
 * Idempotent first-admin bootstrap from ADMIN_EMAIL / ADMIN_PASSWORD.
 * - creates the admin if missing; - if the account exists it is (re)activated and promoted, password untouched.
 * Safe to run on every deploy. Never deletes data.
 */
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { connectDb, disconnectDb } from '../config/db';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { passwordRule } from '../validators/auth.validators';

async function main() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD');
  passwordRule.parse(env.ADMIN_PASSWORD);
  await connectDb();
  const email = env.ADMIN_EMAIL.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== 'admin' || existing.status !== 'active') {
      existing.role = 'admin';
      existing.status = 'active';
      await existing.save();
      console.log('[seed:admin] existing account promoted/activated');
    } else console.log('[seed:admin] admin already present — nothing to do');
  } else {
    const u = await User.create({
      fullName: 'Lost & Found Office',
      email,
      studentId: 'GSU-2015-ADM-001',
      department: 'Lost & Found Office',
      passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, env.BCRYPT_ROUNDS),
      role: 'admin',
      status: 'active',
    });
    await AuditLog.create({ actorId: u._id, action: 'user.admin_bootstrapped', entityType: 'user', entityId: u._id, metadata: { email } });
    console.log('[seed:admin] admin created');
  }
}

main()
  .then(() => disconnectDb())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('[seed:admin] failed:', err.message);
    await disconnectDb().catch(() => undefined);
    process.exit(1);
  });
