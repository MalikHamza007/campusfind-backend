import { ClientSession, Types } from 'mongoose';
import { Request } from 'express';
import { AuditLog } from '../models/AuditLog';

export async function audit(
  req: Request | null,
  action: string,
  entityType: string,
  entityId?: Types.ObjectId | string | null,
  metadata: Record<string, unknown> = {},
  session?: ClientSession,
  actorOverride?: string,
): Promise<void> {
  const actorId = actorOverride ?? req?.user?.id;
  await AuditLog.create(
    [
      {
        actorId: actorId ? new Types.ObjectId(actorId) : undefined,
        action,
        entityType,
        entityId: entityId ? new Types.ObjectId(String(entityId)) : undefined,
        metadata,
        ip: req?.ip ?? '',
      },
    ],
    { session },
  );
}
