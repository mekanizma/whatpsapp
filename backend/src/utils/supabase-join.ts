/** Supabase join sonucu tek kayıt veya dizi olarak dönebilir */
export function normalizeJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function mapTicketRow<T extends { staff?: unknown; last_staff?: unknown }>(
  row: T
): T & {
  staff: { name: string; email?: string } | null;
  last_staff: { name: string; email?: string } | null;
} {
  const staff = normalizeJoin(row.staff as { name: string; email?: string } | { name: string; email?: string }[] | null);
  const last_staff = normalizeJoin(
    row.last_staff as { name: string; email?: string } | { name: string; email?: string }[] | null
  );
  return { ...row, staff, last_staff };
}

export function mapMessageRow<T extends { staff?: unknown; sender_name?: string | null }>(
  row: T
): T & { staff: { name: string } | null; sender_display_name: string | null } {
  const staff = normalizeJoin(row.staff as { name: string } | { name: string }[] | null);
  const senderName = typeof row.sender_name === 'string' ? row.sender_name.trim() : '';
  return {
    ...row,
    staff,
    sender_display_name: staff?.name || senderName || null,
  };
}
