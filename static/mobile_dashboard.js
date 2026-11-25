const mobileNav = document.querySelector('.mobile-bottom-nav');
const mobileFab = mobileNav?.querySelector('.mobile-nav-fab');
const mobileActions = document.querySelector('#mobile-quick-actions');
const entityToggle = mobileNav?.querySelector('.entity-nav-toggle');
const entityMenu = mobileNav?.querySelector('#mobile-entity-menu');

function setMobileActionsOpen(open) {
  if (!mobileNav || !mobileFab || !mobileActions) return;
  if (open) setEntityMenuOpen(false);
  mobileNav.dataset.expanded = String(open);
  mobileFab.setAttribute('aria-expanded', String(open));
  mobileFab.setAttribute('aria-label', open ? 'Close quick actions' : 'Open quick actions');
  mobileActions.hidden = !open;
}

function setEntityMenuOpen(open) {
  if (!entityToggle || !entityMenu) return;
  entityMenu.hidden = !open;
  entityToggle.setAttribute('aria-expanded', String(open));
}

mobileFab?.addEventListener('click', () => {
  setMobileActionsOpen(mobileNav.dataset.expanded !== 'true');
});

entityToggle?.addEventListener('click', () => {
  const open = entityMenu?.hidden ?? true;
  setMobileActionsOpen(false);
  setEntityMenuOpen(open);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setMobileActionsOpen(false);
    setEntityMenuOpen(false);
  }
});

document.addEventListener('click', (event) => {
  if (mobileNav?.dataset.expanded === 'true' && !event.target.closest('.mobile-bottom-nav')) {
    setMobileActionsOpen(false);
  }
  if (entityMenu && !entityMenu.hidden && !event.target.closest('.mobile-bottom-nav')) {
    setEntityMenuOpen(false);
  }
});
