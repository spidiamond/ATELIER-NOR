import { Component } from '@theme/component';
import { prefersReducedMotion } from '@theme/utilities';

const SWIPE_THRESHOLD = 50;

/**
 * @typedef {Object} Refs
 * @property {HTMLElement} stage
 * @property {HTMLElement} cursor
 * @property {HTMLElement} eyebrow
 * @property {HTMLElement} headline
 * @property {HTMLAnchorElement} cta
 * @property {HTMLElement} ctaLabel
 * @property {HTMLButtonElement} preview
 * @property {HTMLButtonElement} sideNext
 * @property {HTMLButtonElement} prevZone
 * @property {HTMLButtonElement} nextZone
 * @property {HTMLElement[]} slides
 * @property {HTMLElement[]} frames
 * @property {HTMLElement} previewThumb
 * @property {HTMLElement} previewTitle
 */

/** @extends {Component<Refs>} */
class AtelierEditorialHero extends Component {
  /** @type {number} */
  #index = 0;

  /** @type {ReturnType<typeof setInterval> | undefined} */
  #autoplayTimer;

  /** @type {boolean} */
  #transitioning = false;

  /** @type {AbortController | null} */
  #abort = null;

  /** @type {number | undefined} */
  #touchStartX;

  /** @type {boolean} */
  #pointerFine = false;

  connectedCallback() {
    super.connectedCallback();
    this.#pointerFine = window.matchMedia('(pointer: fine)').matches;
    this.#abort = new AbortController();
    const { signal } = this.#abort;

    this.#index = this.#findInitialIndex();
    this.#applySlide({ animate: false });
    this.#startAutoplay();

    const { stage, prevZone, nextZone, preview, sideNext, cursor } = this.refs;

    prevZone?.addEventListener('click', () => this.#navigate(-1), { signal });
    nextZone?.addEventListener('click', () => this.#navigate(1), { signal });
    preview?.addEventListener('click', () => this.#navigate(1), { signal });
    sideNext?.addEventListener('click', () => this.#navigate(1), { signal });

    stage?.addEventListener('pointerenter', () => this.#pauseAutoplay(), { signal });
    stage?.addEventListener('pointerleave', () => this.#resumeAutoplay(), { signal });
    stage?.addEventListener('focusin', () => this.#pauseAutoplay(), { signal });
    stage?.addEventListener('focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && stage.contains(next)) return;
      this.#resumeAutoplay();
    }, { signal });

    if (this.#cursorEnabled() && this.#pointerFine && cursor && stage) {
      stage.addEventListener(
        'pointermove',
        (event) => {
          if (!(event instanceof PointerEvent) || event.pointerType !== 'mouse') return;
          this.#moveCursor(event);
        },
        { signal }
      );

      stage.addEventListener(
        'pointerleave',
        () => {
          cursor.hidden = true;
          this.removeAttribute('data-cursor-active');
        },
        { signal }
      );

      stage.addEventListener(
        'pointerenter',
        (event) => {
          if (!(event instanceof PointerEvent) || event.pointerType !== 'mouse') return;
          cursor.hidden = false;
          this.setAttribute('data-cursor-active', '');
          this.#moveCursor(event);
        },
        { signal }
      );
    }

    stage?.addEventListener(
      'touchstart',
      (event) => {
        if (!(event instanceof TouchEvent)) return;
        this.#touchStartX = event.changedTouches[0]?.clientX;
        this.#pauseAutoplay();
      },
      { passive: true, signal }
    );

    stage?.addEventListener(
      'touchend',
      (event) => {
        if (!(event instanceof TouchEvent) || this.#touchStartX == null) return;
        const endX = event.changedTouches[0]?.clientX;
        if (endX == null) return;
        const delta = endX - this.#touchStartX;
        this.#touchStartX = undefined;
        if (Math.abs(delta) >= SWIPE_THRESHOLD) {
          this.#navigate(delta < 0 ? 1 : -1);
        }
        this.#resumeAutoplay();
      },
      { passive: true, signal }
    );

  }

  disconnectedCallback() {
    this.#clearAutoplay();
    this.#abort?.abort();
    this.#abort = null;
    super.disconnectedCallback();
  }

  #cursorEnabled() {
    return this.dataset.directionalCursor !== 'false';
  }

  #autoplayEnabled() {
    return this.dataset.autoplay !== 'false' && !prefersReducedMotion();
  }

  #slideCount() {
    return this.refs.slides?.length ?? 0;
  }

  #findInitialIndex() {
    const slides = this.refs.slides ?? [];
    const active = slides.findIndex((slide) => slide.dataset.active === 'true');
    return active >= 0 ? active : 0;
  }

  #wrap(index) {
    const count = this.#slideCount();
    if (count <= 0) return 0;
    return ((index % count) + count) % count;
  }

  #navigate(delta) {
    if (this.#transitioning || this.#slideCount() === 0) return;
    this.#index = this.#wrap(this.#index + delta);
    this.#applySlide({ animate: true });
    this.#restartAutoplay();
  }

  #moveCursor(event) {
    const { stage, cursor } = this.refs;
    if (!stage || !cursor) return;

    const rect = stage.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const isNext = event.clientX >= midpoint;

    cursor.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
    cursor.dataset.direction = isNext ? 'next' : 'prev';
  }

  #applySlide({ animate }) {
    const slides = this.refs.slides ?? [];
    const frames = this.refs.frames ?? [];
    const count = slides.length;
    if (count === 0) return;

    const slide = slides[this.#index];
    const nextIndex = this.#wrap(this.#index + 1);
    const nextSlide = slides[nextIndex];

    frames.forEach((frame, i) => {
      frame.classList.toggle('is-active', i === this.#index);
    });

    slides.forEach((item, i) => {
      item.dataset.active = i === this.#index ? 'true' : 'false';
    });

    const reduced = prefersReducedMotion();
    const shouldAnimate = animate && !reduced;

    this.#transitioning = shouldAnimate;
    const { eyebrow, headline, cta, ctaLabel } = this.refs;

    const updateCopy = () => {
      if (eyebrow) eyebrow.textContent = slide.dataset.eyebrow ?? '';
      if (headline) headline.textContent = slide.dataset.headline ?? '';
      if (ctaLabel) ctaLabel.textContent = slide.dataset.ctaLabel ?? '';
      const url = slide.dataset.ctaUrl;
      if (cta && url) cta.href = url;
    };

    if (shouldAnimate && eyebrow && headline) {
      eyebrow.classList.add('is-fading');
      headline.classList.add('is-fading');
      window.setTimeout(() => {
        updateCopy();
        eyebrow.classList.remove('is-fading');
        headline.classList.remove('is-fading');
        this.#transitioning = false;
      }, 220);
    } else {
      updateCopy();
      this.#transitioning = false;
    }

    this.#updatePreview(nextSlide);
    this.setAttribute('data-active-index', String(this.#index));
  }

  /** @param {HTMLElement | undefined} nextSlide */
  #updatePreview(nextSlide) {
    const { preview, previewThumb, previewTitle } = this.refs;
    if (!preview || !nextSlide) return;

    if (previewTitle) previewTitle.textContent = nextSlide.dataset.previewTitle ?? nextSlide.dataset.headline ?? '';

    const image = nextSlide.dataset.previewImage;
    if (previewThumb && image) {
      previewThumb.style.backgroundImage = `url("${image.replace(/"/g, '\\"')}")`;
    }
  }

  #clearAutoplay() {
    if (this.#autoplayTimer) window.clearInterval(this.#autoplayTimer);
    this.#autoplayTimer = undefined;
  }

  #startAutoplay() {
    this.#clearAutoplay();
    if (!this.#autoplayEnabled()) return;

    const interval = Number.parseInt(this.dataset.autoplayInterval ?? '6000', 10) || 6000;
    this.#autoplayTimer = window.setInterval(() => {
      if (this.#transitioning) return;
      this.#index = this.#wrap(this.#index + 1);
      this.#applySlide({ animate: true });
    }, interval);
  }

  #restartAutoplay() {
    this.#clearAutoplay();
    this.#startAutoplay();
  }

  #pauseAutoplay() {
    this.#clearAutoplay();
  }

  #resumeAutoplay() {
    if (!this.#autoplayEnabled()) return;
    this.#startAutoplay();
  }
}

if (!customElements.get('atelier-editorial-hero')) {
  customElements.define('atelier-editorial-hero', AtelierEditorialHero);
}
