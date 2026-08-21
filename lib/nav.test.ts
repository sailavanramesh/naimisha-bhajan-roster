import { describe, it, expect } from 'vitest';
import {
  MEMBER_NAV,
  NAV_TREE,
  activeHrefIn,
  groupContaining,
  isNavGroup,
  navFor,
  navLeaves,
  type NavLeaf,
} from './nav';
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

/**
 * The shape of the menu, 2026-08-21. Seventeen items in one flat column put the
 * roster and the admin screen at the same size and the same distance away.
 *
 * Two things are worth asserting about the fix. The pages somebody opens the app
 * FOR must stay at the top level — that is the whole request — and no page may
 * fall out of the tree while it is still in MEMBER_NAV, which would be the same
 * failure as before wearing a different hat: a page somebody is entitled to,
 * with nothing linking to it.
 */
describe('the shape of the menu', () => {
  const primary = NAV_TREE.filter((e): e is NavLeaf => !isNavGroup(e)).map((e) => e.href);

  it('leaves the pages people come for at the top level', () => {
    for (const href of ['/roster', '/my-list', '/find-my-pitch', '/explore', '/guide']) {
      expect(primary, href).toContain(href);
    }
  });

  it('keeps the guide last, where it has always been', () => {
    const last = NAV_TREE[NAV_TREE.length - 1];
    expect(isNavGroup(last) ? null : last.href).toBe('/guide');
  });

  it('folds the dashboard away rather than deleting it', () => {
    expect(primary).not.toContain('/dashboard');
    expect(navLeaves(NAV_TREE).map((l) => l.href)).toContain('/dashboard');
  });

  it('links every page a member is allowed to reach', () => {
    const memberTree = navFor('member');
    const hrefs = navLeaves(memberTree).map((l) => l.href);
    for (const href of MEMBER_NAV) expect(hrefs, href).toContain(href);
  });

  it('shows an editor everything, and lists nothing twice', () => {
    const hrefs = navLeaves(navFor('editor')).map((l) => l.href);
    expect(hrefs).toEqual(navLeaves(NAV_TREE).map((l) => l.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('keeps the coordinator-only pages away from a member', () => {
    const hrefs = navLeaves(navFor('member')).map((l) => l.href);
    for (const href of ['/dashboard', '/availability/team', '/build', '/admin', '/fairness']) {
      expect(hrefs, href).not.toContain(href);
    }
  });

  /*
   * A fold with one thing in it is worse than no fold: "People" expanding to
   * reveal only Singers is a click for nothing. A member should get the link.
   */
  it('turns a group left with one child into that child', () => {
    const memberTree = navFor('member');
    expect(
      memberTree.filter((e): e is NavLeaf => !isNavGroup(e)).map((e) => e.href),
    ).toContain('/singers');
    for (const entry of memberTree) {
      if (isNavGroup(entry)) expect(entry.children.length, entry.label).toBeGreaterThan(1);
    }
  });

  it('lights up the longest matching link, not the first one listed', () => {
    const tree = navFor('editor');
    expect(activeHrefIn(tree, '/availability/team')).toBe('/availability/team');
    expect(activeHrefIn(tree, '/availability/team/anything')).toBe('/availability/team');
    expect(activeHrefIn(tree, '/availability')).toBe('/availability');
    expect(activeHrefIn(tree, '/roster/abc123')).toBe('/roster');
    expect(activeHrefIn(tree, '/nowhere')).toBeNull();
  });

  it('knows which fold a page is in, so arriving opens it', () => {
    const tree = navFor('editor');
    expect(groupContaining(tree, '/dashboard')).toBe('Coordinating');
    expect(groupContaining(tree, '/roster')).toBeNull();
  });
});
