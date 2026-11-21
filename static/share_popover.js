(() => {
  const popover = document.createElement('section');
  popover.className = 'share-popover';
  popover.hidden = true;
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', 'Share Document');
  popover.innerHTML = `<div class="share-popover-header"><strong>Share Document</strong><button class="share-popover-close" type="button" aria-label="Close">×</button></div><div class="share-popover-body"><label>Email address<input type="email" placeholder="name@company.com" autocomplete="email" /></label><div class="share-popover-actions"><button type="button" class="copy-share">Copy Link</button><button type="button" class="send-share">Send</button></div></div>`;
  document.body.append(popover);

  let documentId = null;
  let anchor = null;
  let toastTimer;

  function toast(message) {
    let node = document.querySelector('#explore-toast, #viewer-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'viewer-toast';
      document.body.append(node);
    }
    node.textContent = message;
    node.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('visible'), 2600);
  }

  function place() {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = 288;
    let left = rect.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = rect.bottom + 10;
    if (top + 190 > window.innerHeight) top = rect.top - 190;
    popover.style.left = `${left}px`;
    popover.style.top = `${Math.max(8, top)}px`;
  }

  window.openSharePopover = (id, target) => {
    documentId = id;
    anchor = target;
    popover.hidden = false;
    popover.querySelector('input').value = '';
    place();
    popover.querySelector('input').focus();
  };

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-share-document]');
    if (target) {
      event.preventDefault();
      window.openSharePopover(target.dataset.shareDocument, target);
      return;
    }
    if (!popover.contains(event.target)) popover.hidden = true;
  });
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
  popover.querySelector('.share-popover-close').addEventListener('click', () => { popover.hidden = true; });
  popover.querySelector('.copy-share').addEventListener('click', async () => {
    if (!documentId) return;
    const link = `${window.location.origin}/documents/${documentId}/view`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Document link copied.');
    } catch { window.prompt('Copy document link:', link); }
    popover.hidden = true;
  });
  popover.querySelector('.send-share').addEventListener('click', () => {
    const input = popover.querySelector('input');
    if (!input.value.trim() || !input.checkValidity()) {
      input.reportValidity();
      return;
    }
    const link = `${window.location.origin}/documents/${documentId}/view`;
    const subject = encodeURIComponent('Shared document');
    const body = encodeURIComponent(`Here is the document: ${link}`);
    window.location.href = `mailto:${encodeURIComponent(input.value.trim())}?subject=${subject}&body=${body}`;
    popover.hidden = true;
  });
})();
