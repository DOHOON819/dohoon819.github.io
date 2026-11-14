(() => {
  const links = Array.from(document.querySelectorAll(".rail-link"));
  const panels = links.map(link => document.getElementById(link.hash.slice(1)));
  let selected = 0;
  let requested = 0;
  let scheduled = false;

  function select(index) {
    selected = index;
    links.forEach((link, i) => {
      link.classList.toggle("is-active", i === index);
      if (i === index) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }

  function update() {
    scheduled = false;
    const positions = panels.map(panel => panel.getBoundingClientRect().top);
    const readingLine = Math.min(180, window.innerHeight * 0.3);
    const atBottom = window.scrollY > 0 &&
      window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 3;
    let best = 0;
    positions.forEach((top, i) => {
      if ((top <= readingLine || atBottom) && top > positions[best] + 2) best = i;
    });
    // Side-by-side panels share a scroll position. Keep the user's chosen panel.
    if (Math.abs(positions[requested] - positions[best]) <= 2) best = requested;
    else if (Math.abs(positions[selected] - positions[best]) <= 2) best = selected;
    select(best);
  }

  function schedule() {
    if (!scheduled) {
      scheduled = true;
      window.requestAnimationFrame(update);
    }
  }

  function followHash() {
    const index = links.findIndex(link => link.hash === window.location.hash);
    if (index >= 0) { requested = index; select(index); }
  }

  links.forEach((link, i) => link.addEventListener("click", () => { requested = i; select(i); }));
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("hashchange", () => { followHash(); schedule(); });
  followHash();
  schedule();
})();
