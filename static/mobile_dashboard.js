const mobileNav = document.querySelector('.mobile-bottom-nav');
const mobileFab = mobileNav?.querySelector('.mobile-nav-fab');
const mobileActions = document.querySelector('#mobile-quick-actions');

function setMobileActionsOpen(open) {
  if (!mobileNav || !mobileFab || !mobileActions) return;
  mobileNav.dataset.expanded = String(open);
  mobileFab.setAttribute('aria-expanded', String(open));
  mobileFab.setAttribute('aria-label', open ? 'Close quick actions' : 'Open quick actions');
  mobileActions.hidden = !open;
}

mobileFab?.addEventListener('click', () => {
  setMobileActionsOpen(mobileNav.dataset.expanded !== 'true');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setMobileActionsOpen(false);
});

document.addEventListener('click', (event) => {
  if (mobileNav?.dataset.expanded === 'true' && !event.target.closest('.mobile-bottom-nav')) {
    setMobileActionsOpen(false);
  }
});
