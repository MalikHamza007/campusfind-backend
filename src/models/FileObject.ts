import { Schema, model } from 'mongoose';

export const FILE_PURPOSES = ['item_image', 'claim_evidence', 'avatar'] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

const fileSchema = new Schema(
  {
    originalName: { type: String, required: true },
    storedName: { type: String, required: true, unique: true },
    /** Object key inside the private bucket (e.g. files/2026/11/<uuid>). Never sent to clients. */
    relativePath: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true },
    purpose: { type: String, enum: FILE_PURPOSES, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Set while a delete is in progress (tombstone → delete object → delete row). */
    deletingAt: { type: Date, default: null },
  },
  { timestamps: true },
);
fileSchema.index({ uploadedBy: 1, createdAt: -1 });
fileSchema.index({ sha256: 1 });

export const FileObject = model('File', fileSchema);

export function publicFile(f: any, extra: Record<string, unknown> = {}) {
  return {
    id: String(f._id),
    originalName: f.originalName,
    mimeType: f.mimeType,
    size: f.size,
    sha256: f.sha256,
    purpose: f.purpose,
    uploadedBy: f.uploadedBy?._id ? { id: String(f.uploadedBy._id), fullName: f.uploadedBy.fullName } : String(f.uploadedBy),
    createdAt: f.createdAt,
    ...extra,
  };
}
