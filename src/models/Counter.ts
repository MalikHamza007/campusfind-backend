import { Schema, model, ClientSession } from 'mongoose';

const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false });
export const Counter = model('Counter', counterSchema);

/** Atomic sequence used for human-friendly item codes (CF-L-1001, CF-F-2001). */
export async function nextSeq(key: string, start: number, session?: ClientSession): Promise<number> {
  await Counter.updateOne({ _id: key }, { $setOnInsert: { seq: start - 1 } }, { upsert: true, session });
  const doc = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { returnDocument: 'after', session });
  return doc!.seq;
}
