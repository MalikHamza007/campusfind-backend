import { Schema, model } from 'mongoose';

const geoCacheSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    payload: { type: Schema.Types.Mixed, required: true },
    fetchedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    staleUntil: { type: Date, required: true },
  },
  { versionKey: false },
);
// Mongo removes entries once they are past the stale-fallback window.
geoCacheSchema.index({ staleUntil: 1 }, { expireAfterSeconds: 0 });

export const GeoCache = model('GeoCache', geoCacheSchema);
