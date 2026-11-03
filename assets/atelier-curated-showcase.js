import { Component } from '@theme/component';
import { prefersReducedMotion } from '@theme/utilities';

/**
 * @typedef {Object} Refs
 * @property {HTMLButtonElement[]} tabs
 * @property {HTMLElement[]} panels
 * @property {HTMLElement[]} scrollers
 * @property {HTMLElement[]} progressTracks
 * @property {HTMLElement[]} progressFills
 */

/** @extends {Component<Refs>} */
class AtelierCuratedShowcase extends Component {
  /** @type {number} */
  #activeTab = 0;

  /** @type {AbortController | null} */
  #abort = null;

  /** @type {ResizeObserver | null} */
  #resizeObserver = null;

  connectedCallback() {
    super.connectedCallback();
    this.#abort = new AbortController();
    const { signal } = this.#abort;

    this.#activeTab = this.#findInitialTab();
    this.#showTab(this.#activeTab, { animate: false });

    this.refs.tabs?.forEach((tab, index) => {
      tab.addEventListener('click', () => this.#selectTab(index), { signal });
      tab.addEventListener('keydown', (event) => this.#handleTabKeydown(event, index), { signal });
    });

    this.refs.scrollers?.forEach((scroller, index) => {
      scroller.addEventListener('scroll', () => this.#updateProgress(index), { passive: true, signal });
    });

    this.#resizeObserver = new ResizeObserver(() => {
      this.refs.scrollers?.forEach((_, index) => this.#updateProgress(index));
    });

    this.refs.scrollers?.forEach((scroller) => this.#resizeObserver?.observe(scroller));

    this.querySelectorAll('[data-showcase-quick]').forEach((button) => {
      button.addEventListener(
        'click',
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          const card = button.closest('product-card');
          const quickAdd = card?.querySelector('quick-add-component button');
          quickAdd?.click();
        },
        { signal }
      );
    });

    this.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const swatch = target.closest('.atelier-showcase-card__swatch');
        if (!(swatch instanceof HTMLButtonElement)) return;

        const card = swatch.closest('product-card');
        const swatchRow = swatch.closest('.atelier-showcase-card__swatches');
        if (!card || !swatchRow) return;

        swatchRow.querySelectorAll('.atelier-showcase-card__swatch').forEach((button) => {
          button.classList.remove('is-selected');
          button.setAttribute('aria-pressed', 'false');
        });
        swatch.classList.add('is-selected');
        swatch.setAttribute('aria-pressed', 'true');

        const variantUrl = swatch.dataset.variantUrl;
        const variantImage = swatch.dataset.variantImage;
        const link = card.querySelector('.product-card__link');
        if (variantUrl && link instanceof HTMLAnchorElement) link.href = variantUrl;

        if (variantImage) {
          const primary = card.querySelector('.atelier-showcase-card__image--primary');
          if (primary instanceof HTMLImageElement) primary.srcset = `${variantImage} 900w`;
        }
      },
      { signal }
    );

    document.addEventListener(
      'shopify:section:load',
      () => {
        this.refs.scrollers?.forEach((_, index) => this.#updateProgress(index));
      },
      { signal }
    );
  }

  disconnectedCallback() {
    this.#resizeObserver?.disconnect();
    this.#abort?.abort();
    this.#abort = null;
    super.disconnectedCallback();
  }

  #findInitialTab() {
    const index = this.refs.tabs?.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    return index != null && index >= 0 ? index : 0;
  }

  /**
   * @param {KeyboardEvent} event
   * @param {number} index
   */
  #handleTabKeydown(event, index) {
    const tabs = this.refs.tabs ?? [];
    if (!tabs.length) return;

    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;

    event.preventDefault();
    this.#selectTab(next);
    tabs[next]?.focus();
  }

  /** @param {number} index */
  #selectTab(index) {
    if (index === this.#activeTab) return;
    this.#activeTab = index;
    this.#showTab(index, { animate: true });
  }

  /**
   * @param {number} index
   * @param {{ animate: boolean }} options
   */
  #showTab(index, { animate }) {
    const reduced = prefersReducedMotion();
    const animatePanel = animate && !reduced;

    this.refs.tabs?.forEach((tab, tabIndex) => {
      const selected = tabIndex === index;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
    });

    this.refs.panels?.forEach((panel, panelIndex) => {
      const active = panelIndex === index;
      panel.hidden = !active;
      if (active) {
        panel.style.opacity = animatePanel ? '0' : '1';
        if (animatePanel) {
          requestAnimationFrame(() => {
            panel.style.transition = 'opacity 280ms cubic-bezier(0.22, 1, 0.36, 1)';
            panel.style.opacity = '1';
          });
        }
        this.#updateProgress(panelIndex);
      }
    });

    this.setAttribute('data-active-tab', String(index));
  }

  /** @param {number} index */
  #updateProgress(index) {
    const scroller = this.refs.scrollers?.[index];
    const track = this.refs.progressTracks?.[index];
    const fill = this.refs.progressFills?.[index];
    if (!scroller || !track || !fill) return;

    const maxScroll = scroller.scrollWidth - scroller.clientWidth;
    if (maxScroll <= 4) {
      track.hidden = true;
      return;
    }

    track.hidden = false;
    const ratio = scroller.scrollLeft / maxScroll;
    const trackWidth = track.clientWidth;
    const segmentCount = Math.max(2, Math.round(scroller.scrollWidth / scroller.clientWidth));
    const segmentWidth = trackWidth / segmentCount;
    const activeIndex = Math.round(ratio * (segmentCount - 1));

    fill.style.width = `${segmentWidth}px`;
    fill.style.transform = `translateX(${activeIndex * segmentWidth}px)`;
  }
}

if (!customElements.get('atelier-curated-showcase')) {
  customElements.define('atelier-curated-showcase', AtelierCuratedShowcase);
}
