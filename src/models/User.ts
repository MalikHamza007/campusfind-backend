import { Schema, model, Types, InferSchemaType, HydratedDocument } from 'mongoose';

export const ROLES = ['student', 'admin', 'super_admin'] as const;
export type Role = (typeof ROLES)[number];
/** Staff = lost & found office (admin) and the system owner (super_admin). */
export const STAFF_ROLES: readonly Role[] = ['admin', 'super_admin'];
export const isStaffRole = (r?: string | null) => r === 'admin' || r === 'super_admin';

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    studentId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    department: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, default: 'student' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    avatarFileId: { type: Schema.Types.ObjectId, ref: 'File' },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, optimisticConcurrency: true },
);
userSchema.index({ role: 1, status: 1 });
userSchema.index({ fullName: 'text', email: 'text', studentId: 'text', department: 'text' });

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model('User', userSchema);

export function publicUser(u: any) {
  return {
    id: String(u._id),
    fullName: u.fullName,
    email: u.email,
    studentId: u.studentId,
    department: u.department,
    phone: u.phone ?? null,
    role: u.role,
    status: u.status,
    avatarFileId: u.avatarFileId ? String(u.avatarFileId) : null,
    lastLoginAt: u.lastLoginAt ?? null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    version: u.__v ?? 0,
  };
}
export type ObjectId = Types.ObjectId;
