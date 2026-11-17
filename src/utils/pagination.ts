export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export function paginate<T>(data: T[], total: number, page: number, limit: number): Paginated<T> {
  return { data, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
