import { isStaffRole } from '../models/User';
import { ClientSession, Types } from 'mongoose';
import { Item } from '../models/Item';
import { Claim } from '../models/Claim';
import { nextSeq } from '../models/Counter';
import { maskIdNumbers } from '../utils/mask';
import { contentPath } from './file.service';
import { AuthUser } from '../middlewares/auth';

export async function nextItemCode(reportType: 'lost' | 'found', session?: ClientSession) {
  const seq = await nextSeq(`item:${reportType}`, reportType === 'lost' ? 1001 : 2001, session);
  return `CF-${reportType === 'lost' ? 'L' : 'F'}-${seq}`;
}

function shortName(fullName?: string) {
  if (!fullName) return 'Campus member';
  const [first, ...rest] = fullName.split(' ');
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
}

/**
 * Shape an item for a viewer. Reporter contact details are never exposed to other students,
 * and ID numbers on ID-card reports are masked for everyone but the owner and admins.
 */
export function serializeItem(item: any, viewer: AuthUser, opts: { withImages?: 'all' | 'first' | 'none' } = {}) {
  const reporter = item.reportedBy;
  const reporterId = String(reporter?._id ?? reporter);
  const isOwner = reporterId === viewer.id;
  const privileged = isOwner || isStaffRole(viewer.role);
  const mask = (s?: string) => (item.category === 'id_card' && !privileged ? maskIdNumbers(s) : s);
  const imageIds: string[] = (item.imageFileIds ?? []).map((f: any) => String(f?._id ?? f));
  const which = opts.withImages ?? 'first';
  const images = (which === 'none' ? [] : which === 'first' ? imageIds.slice(0, 1) : imageIds).map((id) => ({ id, ...contentPath(id, viewer.id) }));

  return {
    id: String(item._id),
    code: item.code,
    reportType: item.reportType,
    title: mask(item.title),
    category: item.category,
    description: mask(item.description),
    eventDate: item.eventDate,
    locationName: item.locationName,
    coordinates: { lat: item.coordinates.lat, lng: item.coordinates.lng },
    status: item.status,
    distinctiveFeatures: mask(item.distinctiveFeatures) ?? null,
    color: item.color ?? null,
    brand: item.brand ?? null,
    imageFileIds: imageIds,
    imageCount: imageIds.length,
    images,
    reporter:
      isStaffRole(viewer.role) && reporter?.email
        ? { id: reporterId, fullName: reporter.fullName, email: reporter.email, studentId: reporter.studentId, department: reporter.department }
        : { id: isOwner ? reporterId : null, fullName: isOwner ? reporter?.fullName : shortName(reporter?.fullName), department: reporter?.department ?? null },
    isMine: isOwner,
    returnedAt: item.returnedAt ?? null,
    deletedAt: item.deletedAt ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    version: item.__v ?? 0,
  };
}

/** True when any pending/approved claim touches the item (as found item or linked lost report). */
export async function hasActiveClaim(itemId: Types.ObjectId | string, session?: ClientSession) {
  return !!(await Claim.exists({ $or: [{ foundItemId: itemId }, { lostItemId: itemId }], status: { $in: ['pending', 'approved'] } }).session(session ?? null));
}
