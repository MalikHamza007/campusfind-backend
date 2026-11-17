import { Schema, model } from 'mongoose';

export const CLAIM_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn', 'returned'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

const claimSchema = new Schema(
  {
    foundItemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    lostItemId: { type: Schema.Types.ObjectId, ref: 'Item' },
    claimantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ownershipEvidence: { type: String, required: true, trim: true },
    evidenceFileIds: [{ type: Schema.Types.ObjectId, ref: 'File' }],
    status: { type: String, enum: CLAIM_STATUSES, required: true, default: 'pending' },
    /** true while pending/approved — backs the partial unique indexes below. */
    active: { type: Boolean, default: true },
    adminNote: { type: String, trim: true },
    /** Staff member handling the claim (picked up from the queue or set on review). */
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    returnedAt: { type: Date },
    withdrawnAt: { type: Date },
  },
  { timestamps: true },
);
// One active (pending/approved) claim per student per found item.
claimSchema.index({ foundItemId: 1, claimantId: 1 }, { unique: true, partialFilterExpression: { active: true } });
// At most ONE approved claim per found item — the database rejects a concurrent second approval.
claimSchema.index({ foundItemId: 1 }, { unique: true, partialFilterExpression: { status: 'approved' }, name: 'one_approved_per_item' });
claimSchema.index({ status: 1, createdAt: -1 });
claimSchema.index({ claimantId: 1, status: 1 });
claimSchema.index({ assignedTo: 1, status: 1 });

export const Claim = model('Claim', claimSchema);
