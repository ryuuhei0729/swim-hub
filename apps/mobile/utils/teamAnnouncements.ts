import type { TeamAnnouncement } from "@swim-hub/shared/types";

/**
 * 利用者に見せるお知らせ (公開済みかつ表示期間内) だけに絞る。
 * ホームのお知らせ (TeamAnnouncementsAPI.list の viewOnly) と同じ条件にしている。
 */
export function filterVisibleAnnouncements(
  announcements: readonly TeamAnnouncement[],
  now: Date = new Date(),
): TeamAnnouncement[] {
  return announcements.filter((announcement) => {
    if (announcement.is_published !== true) return false;
    const startAt = announcement.start_at ? new Date(announcement.start_at) : null;
    const endAt = announcement.end_at ? new Date(announcement.end_at) : null;
    return (!startAt || startAt <= now) && (!endAt || endAt >= now);
  });
}
