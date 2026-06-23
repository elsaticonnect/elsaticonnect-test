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

document.querySelectorAll(".reveal, .stagger-item").forEach(node => {
  observer.observe(node);
});

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

metrics.forEach(metric => {
  numberObserver.observe(metric);
});

const activityItems = document.querySelectorAll(".activity-ticker li");
let activeActivity = 0;

if (activityItems.length) {
  activityItems.forEach(item => item.classList.remove("active"));
  activityItems[0].classList.add("active");

  setInterval(() => {
    activityItems.forEach(item => item.classList.remove("active"));
    activeActivity = (activeActivity + 1) % activityItems.length;
    activityItems[activeActivity].classList.add("active");
  }, 2600);
}

const topbar = document.querySelector(".topbar");
let lastScrollY = window.scrollY;

if (topbar) {
  window.addEventListener("scroll", () => {
    const currentScrollY = window.scrollY;

    if (currentScrollY > 40) {
      topbar.classList.add("topbar-scrolled");
    } else {
      topbar.classList.remove("topbar-scrolled");
    }

    if (currentScrollY > lastScrollY && currentScrollY > 140) {
      topbar.classList.add("topbar-hidden");
    } else {
      topbar.classList.remove("topbar-hidden");
    }

    lastScrollY = currentScrollY;
  });
}

const mobileToggle = document.querySelector(".mobile-menu-toggle");
const nav = document.querySelector(".nav");

if (mobileToggle && nav) {
  mobileToggle.addEventListener("click", () => {
    mobileToggle.classList.toggle("is-open");
    nav.classList.toggle("nav-open");
  });

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      mobileToggle.classList.remove("is-open");
      nav.classList.remove("nav-open");
    });
  });
}
