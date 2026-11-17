import { Schema, model } from 'mongoose';

const auditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
// Append-only: block updates and deletes at the model level.
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as const) {
  auditLogSchema.pre(op, function () {
    if ((this as any).getOptions?.().allowAuditReset) return;
    throw new Error('Audit logs are append-only');
  });
}

export const AuditLog = model('AuditLog', auditLogSchema);
