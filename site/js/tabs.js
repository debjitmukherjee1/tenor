/* tabs.js — bottom-dock tab switching shared by the newer suite tools.
   Moves the sliding indicator, swaps panels, mirrors the tab in the URL hash
   and fires a "tabchange" event so charts in a newly shown panel can resize. */
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  var indicator = document.getElementById("tab-indicator");
  if (!tabs.length) return;

  function move(tab) {
    if (!indicator || !tab) return;
    indicator.style.left = tab.offsetLeft + "px";
    indicator.style.width = tab.offsetWidth + "px";
  }

  function show(name, push) {
    var found = tabs.some(function (t) { return t.dataset.tab === name; });
    if (!found) name = tabs[0].dataset.tab;
    tabs.forEach(function (t) {
      var on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (on) move(t);
    });
    document.querySelectorAll(".panel").forEach(function (p) { p.classList.toggle("active", p.id === name); });
    if (push && history.replaceState) history.replaceState(null, "", "#" + name);
    document.dispatchEvent(new CustomEvent("tabchange", { detail: name }));
    if (push) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { show(t.dataset.tab, true); });
    t.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      var n = tabs[(i + d + tabs.length) % tabs.length];
      n.focus(); show(n.dataset.tab, true);
    });
  });
  window.addEventListener("resize", function () { move(document.querySelector(".tab.active")); });
  window.addEventListener("load", function () { move(document.querySelector(".tab.active")); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { move(document.querySelector(".tab.active")); });

  window.addEventListener("hashchange", function () { show((location.hash || "").slice(1), false); });
  window.SuiteTabs = { show: show };
  show((location.hash || "").slice(1), false);
})();
