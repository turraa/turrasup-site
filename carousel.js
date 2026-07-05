(function () {
  /**
   * Карусель тарифов: свайп, стрелки, точки, адаптив.
   */
  function initCarousel(root) {
    if (!root || root.dataset.carouselInit) return null;
    root.dataset.carouselInit = '1';

    const viewport = root.querySelector('.carousel__viewport');
    const track = root.querySelector('.carousel__track');
    const prev = root.querySelector('.carousel__btn--prev');
    const next = root.querySelector('.carousel__btn--next');
    const dotsWrap = root.querySelector('.carousel__dots');
    if (!viewport || !track) return null;

    let index = 0;
    let slides = [];
    let dots = [];

    function getSlides() {
      return [...track.children].filter((el) => el.classList.contains('carousel__slide'));
    }

    function clampIndex(i) {
      const max = Math.max(0, slides.length - 1);
      return Math.max(0, Math.min(i, max));
    }

    function renderDots() {
      if (!dotsWrap) return;
      dotsWrap.innerHTML = '';
      dots = slides.map((_, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'carousel__dot' + (i === index ? ' is-active' : '');
        b.setAttribute('aria-label', `Слайд ${i + 1}`);
        b.addEventListener('click', () => goTo(i));
        dotsWrap.appendChild(b);
        return b;
      });
    }

    function update() {
      slides = getSlides();
      if (!slides.length) return;
      index = clampIndex(index);
      const slide = slides[index];
      const offset = slide.offsetLeft - (viewport.clientWidth - slide.offsetWidth) / 2;
      track.style.transform = `translateX(${-offset}px)`;
      slides.forEach((s, i) => s.classList.toggle('is-active', i === index));
      dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
      if (prev) prev.disabled = index === 0;
      if (next) next.disabled = index >= slides.length - 1;
    }

    function goTo(i, animate = true) {
      index = clampIndex(i);
      if (!animate) track.style.transition = 'none';
      update();
      if (!animate) requestAnimationFrame(() => { track.style.transition = ''; });
    }

    function go(delta) {
      goTo(index + delta);
    }

    prev?.addEventListener('click', () => go(-1));
    next?.addEventListener('click', () => go(1));

    let touchX = 0;
    viewport.addEventListener(
      'touchstart',
      (e) => {
        touchX = e.touches[0].clientX;
      },
      { passive: true },
    );
    viewport.addEventListener(
      'touchend',
      (e) => {
        const dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      },
      { passive: true },
    );

    const ro = new ResizeObserver(() => update());
    ro.observe(viewport);

    root.carouselRefresh = () => {
      renderDots();
      update();
    };

    root.carouselGoTo = goTo;

    renderDots();
    requestAnimationFrame(() => {
      const featured = slides.findIndex((s) => s.querySelector('.plan-card--featured'));
      if (featured >= 0) goTo(featured, false);
      else update();
    });

    return root;
  }

  window.TurraCarousel = { init: initCarousel };
})();
