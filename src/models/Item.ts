import { Schema, model } from 'mongoose';

export const REPORT_TYPES = ['lost', 'found'] as const;
export const CATEGORIES = ['id_card', 'electronics', 'calculator', 'book', 'keys', 'wallet', 'clothing', 'other'] as const;
export const ITEM_STATUSES = ['open', 'claim_pending', 'matched', 'returned', 'closed'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

const itemSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    reportType: { type: String, enum: REPORT_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    category: { type: String, enum: CATEGORIES, required: true },
    description: { type: String, required: true, trim: true },
    eventDate: { type: Date, required: true },
    locationName: { type: String, required: true, trim: true },
    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    // GeoJSON mirror of coordinates for the 2dsphere index (lng, lat order).
    geo: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    status: { type: String, enum: ITEM_STATUSES, required: true, default: 'open' },
    distinctiveFeatures: { type: String, trim: true },
    color: { type: String, trim: true },
    brand: { type: String, trim: true },
    imageFileIds: [{ type: Schema.Types.ObjectId, ref: 'File' }],
    reportedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    returnedAt: { type: Date },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
itemSchema.index({ title: 'text', description: 'text', brand: 'text', locationName: 'text' });
itemSchema.index({ reportType: 1, status: 1 });
itemSchema.index({ category: 1, eventDate: -1 });
itemSchema.index({ geo: '2dsphere' });
itemSchema.index({ reportedBy: 1, createdAt: -1 });

export const Item = model('Item', itemSchema);
