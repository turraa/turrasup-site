(function () {
  const reveals = document.querySelectorAll('.reveal');
  if (!reveals.length) return;

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
  );

  reveals.forEach((el, i) => {
    el.style.setProperty('--reveal-delay', `${Math.min(i * 0.08, 0.4)}s`);
    io.observe(el);
  });

  const showcase = document.querySelector('.showcase-track');
  if (showcase) {
    window.addEventListener(
      'scroll',
      () => {
        const y = window.scrollY;
        showcase.style.transform = `translateY(${y * 0.04}px)`;
      },
      { passive: true },
    );
  }
})();
