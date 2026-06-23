const observer = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.16 }
);

document.querySelectorAll(".reveal, .stagger-item").forEach(node => observer.observe(node));

const metrics = document.querySelectorAll(".metric");

const numberObserver = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;

      const element = entry.target;
      const target = Number(element.dataset.target || 0);
      const suffix = element.dataset.suffix || "+";
      const duration = 1400;
      const startTime = performance.now();

      const tick = now => {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = Math.round(target * eased);

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          element.textContent = `${target}${suffix}`;
        }
      };

      requestAnimationFrame(tick);
      numberObserver.unobserve(element);
    });
  },
  { threshold: 0.5 }
);

metrics.forEach(metric => numberObserver.observe(metric));

const activityItems = document.querySelectorAll(".activity-ticker li");
let activeActivity = 0;

if (activityItems.length) {
  setInterval(() => {
    activityItems.forEach(item => item.classList.remove("active"));
    activityItems[activeActivity].classList.add("active");
    activeActivity = (activeActivity + 1) % activityItems.length;
  }, 2200);
}
