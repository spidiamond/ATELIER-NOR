import { Component } from '@theme/component';
import { prefersReducedMotion } from '@theme/utilities';

/**
 * @typedef {Object} Refs
 * @property {HTMLImageElement} baseImage
 * @property {HTMLImageElement} revealImage
 * @property {HTMLElement} revealLayer
 * @property {HTMLAnchorElement} cta
 * @property {HTMLElement} categoryList
 * @property {HTMLButtonElement[]} items
 */

/** @extends {Component<Refs>} */
class AtelierCategoriesShowcase extends Component {
  /** @type {number} */
  #activeIndex = 0;

  /** @type {number} */
  #transitionGeneration = 0;

  /** @type {AbortController | null} */
  #abort = null;

  /** @type {boolean} */
  #animating = false;

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #autoplayTimer;

  /** @type {boolean} */
  #autoplayPaused = false;

  connectedCallback() {
    super.connectedCallback();
    this.#abort = new AbortController();
    const { signal } = this.#abort;

    const persistedIndex = this.#readPersistedIndex();
    const defaultIndex = this.#findInitialIndex();
    this.#activeIndex = persistedIndex ?? defaultIndex;
    this.#applyActiveState(this.#activeIndex);

    if (persistedIndex != null && persistedIndex !== defaultIndex) {
      this.#setBaseImageForIndex(persistedIndex, { animate: false });
    }

    this.refs.items?.forEach((button, index) => {
      button.addEventListener(
        'pointerenter',
        (event) => {
          if (!(event instanceof PointerEvent)) return;
          if (event.pointerType === 'touch') return;
          if (!window.matchMedia('(hover: hover)').matches) return;
          this.#pauseAutoplay();
          this.#select(index);
        },
        { signal }
      );
      button.addEventListener(
        'focus',
        () => {
          requestAnimationFrame(() => {
            if (!button.matches(':focus-visible')) return;
            this.#pauseAutoplay();
            this.#select(index);
          });
        },
        { signal }
      );
      button.addEventListener('click', () => {
        this.#pauseAutoplay();
        this.#select(index);
      }, { signal });
    });

    const { categoryList } = this.refs;
    categoryList?.addEventListener('pointerenter', () => this.#pauseAutoplay(), { signal });
    categoryList?.addEventListener('pointerleave', () => this.#resumeAutoplay(), { signal });
    categoryList?.addEventListener('focusin', () => this.#pauseAutoplay(), { signal });
    categoryList?.addEventListener(
      'focusout',
      (event) => {
        const related = event.relatedTarget;
        if (related instanceof Node && categoryList.contains(related)) return;
        this.#resumeAutoplay();
      },
      { signal }
    );

    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) this.#clearAutoplayTimer();
        else if (!this.#autoplayPaused) this.#scheduleAutoplay();
      },
      { signal }
    );

    this.addEventListener('keydown', (event) => this.#handleKeydown(event), { signal });

    this.#scheduleAutoplay();
  }

  /** @param {KeyboardEvent} event */
  #handleKeydown(event) {
    const items = this.refs.items;
    if (!items?.length) return;

    const { key } = event;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return;

    event.preventDefault();
    let next = this.#activeIndex;

    if (key === 'ArrowDown') next = Math.min(items.length - 1, this.#activeIndex + 1);
    if (key === 'ArrowUp') next = Math.max(0, this.#activeIndex - 1);
    if (key === 'Home') next = 0;
    if (key === 'End') next = items.length - 1;

    this.#pauseAutoplay();
    items[next]?.focus();
    this.#select(next);
  }

  disconnectedCallback() {
    this.#clearAutoplayTimer();
    this.#abort?.abort();
    this.#abort = null;
    super.disconnectedCallback();
  }

  #autoplayEnabled() {
    return this.dataset.autoplay !== 'false' && !prefersReducedMotion();
  }

  #autoplayIntervalMs() {
    const seconds = Number.parseInt(this.dataset.autoplayInterval ?? '5', 10) || 5;
    return seconds * 1000;
  }

  #pauseAutoplay() {
    this.#autoplayPaused = true;
    this.#clearAutoplayTimer();
  }

  #resumeAutoplay() {
    if (!this.#autoplayEnabled()) return;
    this.#autoplayPaused = false;
    this.#scheduleAutoplay();
  }

  #scheduleAutoplay() {
    this.#clearAutoplayTimer();
    if (this.#autoplayPaused || !this.#autoplayEnabled()) return;

    this.#autoplayTimer = window.setTimeout(() => {
      this.#autoplayTimer = undefined;
      this.#advanceAutoplay();
    }, this.#autoplayIntervalMs());
  }

  #advanceAutoplay() {
    if (this.#autoplayPaused || !this.#autoplayEnabled()) return;

    const items = this.refs.items;
    if (!items?.length) return;

    const next = (this.#activeIndex + 1) % items.length;
    this.#select(next);
    this.#scheduleAutoplay();
  }

  #clearAutoplayTimer() {
    if (this.#autoplayTimer != null) {
      window.clearTimeout(this.#autoplayTimer);
      this.#autoplayTimer = undefined;
    }
  }

  #settleInFlightTransition() {
    const { baseImage, revealImage, revealLayer } = this.refs;
    if (!revealLayer || revealLayer.hidden) return;
    if (revealImage?.src && baseImage) {
      this.#setBaseImageSrc(revealImage.src, revealImage.alt);
    }
    revealLayer.classList.remove('is-revealing');
    revealLayer.hidden = true;
    this.#animating = false;
  }

  #findInitialIndex() {
    const index = this.refs.items?.findIndex((item) => item.getAttribute('aria-pressed') === 'true');
    return index != null && index >= 0 ? index : 0;
  }

  /** @param {number} index */
  #select(index) {
    if (!this.refs.items?.[index]) return;
    if (index === this.#activeIndex && !this.#animating) return;

    this.#settleInFlightTransition();

    this.#transitionGeneration += 1;
    const generation = this.#transitionGeneration;
    const item = this.refs.items[index];
    const imageUrl = item.dataset.imageUrl ?? '';
    const collectionUrl = item.dataset.collectionUrl;

    this.#activeIndex = index;
    this.#applyActiveState(index);
    this.#persistIndex(index);

    if (!imageUrl) return;

    if (this.#baseImageShows(imageUrl)) return;

    if (prefersReducedMotion()) {
      this.#setBaseImageSrc(imageUrl, item.textContent?.trim() ?? '');
      return;
    }

    this.#runRevealTransition(imageUrl, index, generation, collectionUrl);
  }

  /**
   * @param {string} imageUrl
   * @param {number} index
   * @param {number} generation
   * @param {string | undefined} collectionUrl
   */
  async #runRevealTransition(imageUrl, index, generation, collectionUrl) {
    const { baseImage, revealImage, revealLayer } = this.refs;
    if (!baseImage || !revealImage || !revealLayer) return;

    this.#animating = true;

    try {
      await this.#preloadImage(imageUrl);
    } catch {
      this.#animating = false;
      return;
    }

    if (generation !== this.#transitionGeneration) {
      this.#animating = false;
      return;
    }

    revealImage.src = imageUrl;
    revealImage.alt = this.refs.items[index]?.textContent?.trim() ?? '';
    revealLayer.hidden = false;
    revealLayer.classList.remove('is-revealing');
    void revealLayer.offsetWidth;
    revealLayer.classList.add('is-revealing');

    await this.#waitForTransition(revealLayer);
    if (generation !== this.#transitionGeneration) {
      this.#animating = false;
      return;
    }

    this.#setBaseImageSrc(imageUrl, revealImage.alt);
    revealLayer.classList.remove('is-revealing');
    revealLayer.hidden = true;

    this.#animating = false;
    if (collectionUrl && this.refs.cta) this.refs.cta.href = collectionUrl;
  }

  /** @param {number} index @param {{ animate?: boolean }} [options] */
  #setBaseImageForIndex(index, { animate = true } = {}) {
    const item = this.refs.items?.[index];
    const imageUrl = item?.dataset.imageUrl;
    if (!imageUrl) return;

    if (animate && !prefersReducedMotion()) {
      this.#select(index);
      return;
    }

    this.#setBaseImageSrc(imageUrl, item?.textContent?.trim() ?? '');
  }

  /** @param {string} url @param {string} alt */
  #setBaseImageSrc(url, alt) {
    const { baseImage } = this.refs;
    if (!baseImage) return;
    // Initial Liquid markup includes a Dresses-only srcset; leaving it in place
    // makes currentSrc ignore programmatic src updates after a category change.
    baseImage.removeAttribute('srcset');
    baseImage.sizes = '100vw';
    baseImage.src = url;
    baseImage.alt = alt;
  }

  /** @param {string} imageUrl */
  #baseImageShows(imageUrl) {
    const { baseImage } = this.refs;
    if (!baseImage?.src) return false;
    try {
      const current = new URL(baseImage.currentSrc || baseImage.src, window.location.href);
      const next = new URL(imageUrl, window.location.href);
      return current.pathname === next.pathname;
    } catch {
      return baseImage.src === imageUrl;
    }
  }

  #storageKey() {
    const sectionId = this.dataset.sectionId;
    return sectionId ? `atelier-categories:${sectionId}` : null;
  }

  #readPersistedIndex() {
    const key = this.#storageKey();
    if (!key) return null;
    const raw = sessionStorage.getItem(key);
    if (raw == null) return null;
    const index = Number.parseInt(raw, 10);
    if (!Number.isFinite(index) || index < 0) return null;
    if (!this.refs.items?.[index]) return null;
    return index;
  }

  /** @param {number} index */
  #persistIndex(index) {
    const key = this.#storageKey();
    if (!key) return;
    sessionStorage.setItem(key, String(index));
  }

  /** @param {number} index */
  #applyActiveState(index) {
    this.refs.items?.forEach((button, i) => {
      const selected = i === index;
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.classList.toggle('is-active', selected);
      if (selected) button.tabIndex = 0;
      else button.tabIndex = -1;
    });

    const item = this.refs.items?.[index];
    if (item && this.refs.cta) {
      const url = item.dataset.collectionUrl;
      if (url) this.refs.cta.href = url;
    }

    this.setAttribute('data-active-index', String(index));
  }

  /** @param {string} url */
  #preloadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(undefined);
      img.onerror = reject;
      img.src = url;
    });
  }

  /** @param {HTMLElement} element */
  #waitForTransition(element) {
    const duration = Number.parseInt(this.dataset.transitionDuration ?? '900', 10) || 900;
    return new Promise((resolve) => {
      const onEnd = (event) => {
        if (event.target !== element) return;
        element.removeEventListener('transitionend', onEnd);
        resolve(undefined);
      };
      element.addEventListener('transitionend', onEnd);
      window.setTimeout(resolve, duration + 80);
    });
  }
}

if (!customElements.get('atelier-categories-showcase')) {
  customElements.define('atelier-categories-showcase', AtelierCategoriesShowcase);
}
