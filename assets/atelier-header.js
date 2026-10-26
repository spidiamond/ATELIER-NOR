const SELECTOR = '#header-component.header--atelier';
const LEAVE_DELAY = 120;

/**
 * One interaction state for the whole header, so the background, logo,
 * and open menus stay in sync while the pointer crosses links and dropdowns.
 */
const initAtelierHeader = () => {
  const header = document.querySelector(SELECTOR);
  if (!(header instanceof HTMLElement) || header.dataset.atelierBound === 'true') return;

  header.dataset.atelierBound = 'true';
  let leaveTimer = 0;

  const hasOpenMenu = () =>
    Boolean(
      header.querySelector(
        '.menu-list__disclosure[aria-expanded="true"], .dropdown-localization__button[aria-expanded="true"], header-menu[aria-expanded="true"]'
      )
    );

  const setActive = (active) => {
    header.toggleAttribute('data-atelier-active', active);
  };

  header.addEventListener('pointerenter', () => {
    window.clearTimeout(leaveTimer);
    setActive(true);
  });

  header.addEventListener('pointerleave', () => {
    window.clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => {
      if (!header.matches(':focus-within') && !hasOpenMenu()) setActive(false);
    }, LEAVE_DELAY);
  });

  header.addEventListener('focusin', () => {
    window.clearTimeout(leaveTimer);
    setActive(true);
  });

  header.addEventListener('focusout', (event) => {
    const next = event.relatedTarget;
    if (next instanceof Node && header.contains(next)) return;
    window.clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => {
      if (!hasOpenMenu()) setActive(false);
    }, LEAVE_DELAY);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setActive(false);
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAtelierHeader, { once: true });
} else {
  initAtelierHeader();
}

document.addEventListener('shopify:section:load', initAtelierHeader);

const closeOverlayDrawers = (except) => {
  document.querySelectorAll('theme-drawer[data-overlay][open]').forEach((drawer) => {
    if (drawer !== except && typeof drawer.close === 'function') drawer.close();
  });

  const search = document.querySelector('#search-modal');
  if (!search || search === except) return;
  const dialog = search.querySelector('dialog');
  if (dialog?.open && typeof search.closeDialog === 'function') search.closeDialog();
};

document.addEventListener('theme-drawer:open', (event) => {
  const drawer = event.target;
  if (!(drawer instanceof HTMLElement) || !drawer.hasAttribute('data-overlay')) return;
  closeOverlayDrawers(drawer);

  const regionTrigger = document.querySelector('[aria-controls="atelier-region-drawer"]');
  if (drawer.id === 'atelier-region-drawer') regionTrigger?.setAttribute('aria-expanded', 'true');

  const menu = document.querySelector('#Details-menu-drawer-container[open]');
  if (menu) menu.open = false;
  if (drawer.id === 'atelier-region-drawer') {
    drawer.querySelector('.theme-drawer__close-button')?.focus();
  }
});

document.addEventListener('theme-drawer:close', (event) => {
  const drawer = event.target;
  if (!(drawer instanceof HTMLElement) || drawer.id !== 'atelier-region-drawer') return;
  document.querySelector('[aria-controls="atelier-region-drawer"]')?.setAttribute('aria-expanded', 'false');
});

document.addEventListener('dialog:open', (event) => {
  if (event.target?.id !== 'search-modal') return;
  closeOverlayDrawers(event.target);
  const input = event.target.querySelector('input[type="search"]');
  input?.focus();
});

const closePickers = (except) => {
  document.querySelectorAll('[data-atelier-picker][data-open]').forEach((picker) => {
    if (picker === except) return;
    picker.removeAttribute('data-open');
    const trigger = picker.querySelector('[data-atelier-picker-trigger]');
    const panel = picker.querySelector('.atelier-picker__panel');
    trigger?.setAttribute('aria-expanded', 'false');
    if (panel instanceof HTMLElement) panel.hidden = true;
  });
};

const selectPickerOption = (option) => {
  const picker = option.closest('[data-atelier-picker]');
  if (!picker) return;
  const input = picker.querySelector('input[type="hidden"]');
  const label = picker.querySelector('[data-atelier-picker-label]');
  if (input) input.value = option.dataset.value || '';
  if (label) label.textContent = option.dataset.label || '';
  picker.querySelectorAll('[data-atelier-option]').forEach((button) => {
    button.setAttribute('aria-selected', button === option ? 'true' : 'false');
  });
  closePickers();
  picker.querySelector('[data-atelier-picker-trigger]')?.focus();
};

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const option = target.closest('[data-atelier-option]');
  if (option instanceof HTMLButtonElement) {
    selectPickerOption(option);
    return;
  }

  const trigger = target.closest('[data-atelier-picker-trigger]');
  if (trigger instanceof HTMLButtonElement) {
    const picker = trigger.closest('[data-atelier-picker]');
    const panel = picker?.querySelector('.atelier-picker__panel');
    const willOpen = trigger.getAttribute('aria-expanded') !== 'true';
    closePickers(willOpen ? picker : null);
    if (willOpen && picker && panel instanceof HTMLElement) {
      picker.setAttribute('data-open', '');
      trigger.setAttribute('aria-expanded', 'true');
      panel.hidden = false;
    }
    return;
  }

  const tab = target.closest('[data-atelier-tab]');
  if (tab instanceof HTMLButtonElement) {
    const root = tab.closest('[data-atelier-tabs]');
    if (!root) return;
    closePickers();

    const name = tab.dataset.atelierTab;
    root.querySelectorAll('[data-atelier-tab]').forEach((button) => {
      const selected = button === tab;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      if (selected) button.removeAttribute('tabindex');
      else button.tabIndex = -1;
    });
    root.querySelectorAll('[data-atelier-panel]').forEach((panel) => {
      if (!(panel instanceof HTMLElement)) return;
      panel.hidden = panel.dataset.atelierPanel !== name;
    });
    return;
  }

  if (!target.closest('[data-atelier-picker]')) closePickers();
});

document.addEventListener(
  'keydown',
  (event) => {
    const openPicker = document.querySelector('[data-atelier-picker][data-open]');
    if (!(openPicker instanceof HTMLElement)) return;

    const options = [...openPicker.querySelectorAll('[data-atelier-option]')];
    const current = options.findIndex((option) => option === document.activeElement);

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePickers();
      openPicker.querySelector('[data-atelier-picker-trigger]')?.focus();
      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const nextIndex =
      event.key === 'ArrowDown'
        ? current < options.length - 1
          ? current + 1
          : 0
        : current > 0
          ? current - 1
          : options.length - 1;
    options[nextIndex]?.focus();
  },
  true
);
