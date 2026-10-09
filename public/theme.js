// Runs before the app styles to apply the saved appearance before the first paint.
(() => {
  let preference = "light";
  try {
    const saved = localStorage.getItem("geek-musical-theme");
    if (saved === "light" || saved === "dark") preference = saved;
  } catch {}
  document.documentElement.dataset.theme = preference;
  document.documentElement.dataset.themePreference = preference;
})();
