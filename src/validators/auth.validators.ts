import { z } from 'zod';
import { env } from '../config/env';
import { cleanText } from './common';

export const passwordRule = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/\d/, 'Password needs a number')
  .regex(/[^A-Za-z0-9]/, 'Password needs a symbol');

export const universityEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'))
  .refine((e) => env.emailDomains.includes(e.split('@')[1] ?? ''), {
    message: `Use your university email (${env.emailDomains.map((d) => '@' + d).join(', ')})`,
  });

export const studentIdRule = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,5}-\d{4}-[A-Z]{2,5}-\d{3}$/, 'Student ID format: GSU-2024-CS-041');

export const phoneRule = z
  .string()
  .trim()
  .regex(/^\+?[0-9 \-]{10,16}$/, 'Enter a valid phone number')
  .optional()
  .or(z.literal('').transform(() => undefined));

export const registerSchema = z
  .object({
    fullName: cleanText(2, 80, 'Full name'),
    email: universityEmail,
    studentId: studentIdRule,
    department: cleanText(2, 80, 'Department'),
    phone: phoneRule,
    password: passwordRule,
  })
  .strict();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Password is required').max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordRule,
});
