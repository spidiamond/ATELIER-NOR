import { Component } from '@theme/component';
import { prefersReducedMotion } from '@theme/utilities';
import { getScrollEventTarget, getScrollTop } from '@theme/scroll-container';

/**
 * @typedef {Object} Refs
 * @property {HTMLElement} track
 * @property {HTMLElement} segment
 */

/** @extends {Component<Refs>} */
class AtelierEditorialMarquee extends Component {
  /** @type {number} */
  #offset = 0;

  /** @type {number} */
  #scrollInfluence = 0;

  /** @type {number} */
  #lastScrollTop = 0;

  /** @type {number} */
  #lastScrollTime = 0;

  /** @type {number} */
  #segmentWidth = 0;

  /** @type {number | undefined} */
  #rafId;

  /** @type {number} */
  #lastFrameTime = 0;

  /** @type {AbortController | null} */
  #abort = null;

  /** @type {ResizeObserver | null} */
  #resizeObserver = null;

  connectedCallback() {
    super.connectedCallback();
    this.#abort = new AbortController();
    const { signal } = this.#abort;

    this.#lastScrollTop = getScrollTop();
    this.#lastScrollTime = performance.now();
    this.#lastFrameTime = this.#lastScrollTime;

    this.#measure();
    this.#resizeObserver = new ResizeObserver(() => this.#measure());
    const segment = this.refs.segment;
    if (segment) this.#resizeObserver.observe(segment);

    const scrollTarget = getScrollEventTarget();
    scrollTarget.addEventListener('scroll', this.#handleScroll, { passive: true, signal });

    if (prefersReducedMotion()) {
      this.setAttribute('data-reduced-motion', '');
      return;
    }

    this.#rafId = requestAnimationFrame(this.#tick);
  }

  disconnectedCallback() {
    if (this.#rafId) cancelAnimationFrame(this.#rafId);
    this.#resizeObserver?.disconnect();
    this.#abort?.abort();
    this.#abort = null;
    super.disconnectedCallback();
  }

  #measure = () => {
    const segment = this.refs.segment;
    if (!segment) return;
    this.#segmentWidth = segment.offsetWidth;
    if (this.#segmentWidth <= 0) return;

    const wrapped = this.#offset % this.#segmentWidth;
    this.#offset = wrapped <= 0 ? wrapped : wrapped - this.#segmentWidth;
    this.#applyTransform();
  };

  #handleScroll = () => {
    const now = performance.now();
    const scrollTop = getScrollTop();
    const delta = scrollTop - this.#lastScrollTop;
    const elapsed = Math.max(now - this.#lastScrollTime, 1);

    this.#lastScrollTop = scrollTop;
    this.#lastScrollTime = now;

    const sensitivity = (Number.parseFloat(this.dataset.scrollSensitivity ?? '35') || 35) / 100;
    const instant = (delta / elapsed) * sensitivity;
    const blendRaw = (Number.parseFloat(this.dataset.scrollBlend ?? '22') || 22) / 100;
    const blend = Math.min(0.35, Math.max(0.12, blendRaw));

    this.#scrollInfluence = this.#scrollInfluence * (1 - blend) + instant * blend;
  };

  #tick = (now) => {
    this.#rafId = requestAnimationFrame(this.#tick);

    const track = this.refs.track;
    if (!track || this.#segmentWidth <= 0) return;

    const frameDelta = Math.min(now - this.#lastFrameTime, 48);
    this.#lastFrameTime = now;

    const decay = (Number.parseFloat(this.dataset.influenceDecay ?? '96') || 96) / 100;
    this.#scrollInfluence *= decay;

    const baseSpeed = (Number.parseFloat(this.dataset.baseSpeed ?? '45') || 45) / 1000;
    const minInfluence = (Number.parseFloat(this.dataset.minInfluence ?? '-175') || -175) / 100;
    const maxInfluence = (Number.parseFloat(this.dataset.maxInfluence ?? '175') || 175) / 100;

    const clampedInfluence = Math.max(minInfluence, Math.min(maxInfluence, this.#scrollInfluence));
    const speed = baseSpeed + clampedInfluence;

    this.#offset -= speed * frameDelta;

    while (this.#offset <= -this.#segmentWidth) {
      this.#offset += this.#segmentWidth;
    }
    while (this.#offset > 0) {
      this.#offset -= this.#segmentWidth;
    }

    this.#applyTransform();
  };

  #applyTransform() {
    const track = this.refs.track;
    if (!track) return;
    track.style.transform = `translate3d(${this.#offset}px, 0, 0)`;
  }
}

if (!customElements.get('atelier-editorial-marquee')) {
  customElements.define('atelier-editorial-marquee', AtelierEditorialMarquee);
}
