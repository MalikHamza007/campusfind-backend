import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { storage } from '../src/services/storage';
import { User } from '../src/models/User';

export const app = createApp();
let rs: MongoMemoryReplSet;
export const PASSWORD = 'Str0ng!Pass';

export async function startDb() {
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri('campusfind_test'));
  await mongoose.connection.syncIndexes();
  await storage().init();
}
export async function stopDb() {
  await mongoose.disconnect();
  await rs?.stop();
}
export async function clearDb() {
  for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
}

let n = 0;
export async function makeUser(role: 'student' | 'admin' | 'super_admin' = 'student', extra: Record<string, unknown> = {}) {
  n++;
  const email = `user${n}.${role}@campusfind.edu.pk`;
  const user = await User.create({
    fullName: `Test Person ${n}`,
    email,
    studentId: `GSU-2024-CS-${String(n).padStart(3, '0')}`,
    department: 'Computer Science',
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    role,
    status: 'active',
    ...extra,
  });
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { user, id: String(user._id), token: res.body.accessToken as string, cookie: res.headers['set-cookie'] as unknown as string[], email };
}
export const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

export const validItem = (over: Record<string, unknown> = {}) => ({
  reportType: 'lost',
  title: 'Casio FX-991ES Calculator',
  category: 'calculator',
  description: 'Grey scientific calculator lost after the midterm exam in the lab.',
  eventDate: new Date(Date.now() - 2 * 864e5).toISOString(),
  locationName: 'IT Lab 03',
  coordinates: { lat: 31.5198, lng: 74.3488 },
  color: 'Grey',
  brand: 'Casio',
  ...over,
});

// Smallest valid files by magic bytes
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
export const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
export const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

export async function upload(token: string, purpose: string, buf = PNG, name = 'photo.png') {
  return request(app).post('/api/files').set(auth(token)).field('purpose', purpose).attach('file', buf, name);
}
