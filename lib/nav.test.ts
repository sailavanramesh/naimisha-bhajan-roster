import { describe, it, expect } from 'vitest';
import { MEMBER_NAV } from './nav';
import { can } from './capabilities';

/**
 * The member nav has now twice been the reason somebody could not reach a page
 * that was perfectly willing to admit them — Programs and Songs on 2026-08-17,
 * My pitch and When I can't on 2026-08-20. Both times the capability was
 * already granted and only this list was in the way, which is a failure that
 * looks like a permissions problem and is not one.
 *
 * So: the pages a member is entitled to act on must be IN the list, and the
 * coordinator-only ones must not be.
 */
describe('what a member can reach from the nav', () => {
  it('offers the pages about their own pitch and their own dates', () => {
    expect(MEMBER_NAV).toContain('/find-my-pitch');
    expect(MEMBER_NAV).toContain('/availability');
    expect(MEMBER_NAV).toContain('/my-list');
  });

  it('offers the reading surface they need on the night', () => {
    for (const href of ['/roster', '/program', '/songs', '/bhajans', '/guide']) {
      expect(MEMBER_NAV, href).toContain(href);
    }
  });

  it('does NOT offer the coordinator-only surfaces', () => {
    // The dashboard is a coordinator's overview; the availability board is the
    // planning view and is gated on assignSingers in the page itself.
    expect(MEMBER_NAV).not.toContain('/dashboard');
    expect(MEMBER_NAV).not.toContain('/availability/team');
    expect(MEMBER_NAV).not.toContain('/build');
    expect(MEMBER_NAV).not.toContain('/admin');
    expect(MEMBER_NAV).not.toContain('/fairness');
  });

  it('lists nothing twice', () => {
    expect(new Set(MEMBER_NAV).size).toBe(MEMBER_NAV.length);
  });

  /**
   * The link and the permission have to agree. A page in the member nav whose
   * capability a member lacks is a dead end; a capability granted with no way
   * to reach the page is the bug fixed on 2026-08-20.
   */
  it('backs each personal page with the capability it needs', () => {
    expect(MEMBER_NAV).toContain('/availability');
    expect(can('member', 'manageOwnAvailability')).toBe(true);

    expect(MEMBER_NAV).toContain('/find-my-pitch');
    expect(can('member', 'manageOwnLearning')).toBe(true);
  });

  it('keeps the planning board out of a member\'s reach both ways', () => {
    expect(MEMBER_NAV).not.toContain('/availability/team');
    expect(can('member', 'assignSingers')).toBe(false);
  });
});
