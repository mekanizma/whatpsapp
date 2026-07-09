import type { Ticket } from '@/types';

export function getTicketAssigneeLabel(ticket: Pick<Ticket, 'staff' | 'last_staff'>): {
  name: string;
  isLast: boolean;
} | null {
  if (ticket.staff?.name) {
    return { name: ticket.staff.name, isLast: false };
  }
  if (ticket.last_staff?.name) {
    return { name: ticket.last_staff.name, isLast: true };
  }
  return null;
}
