window.MathJax = {
  tex: {
    inlineMath: [["\\(", "\\)"]],
    displayMath: [["\\[", "\\]"]],
    processEscapes: false,
    macros: {
      heva: ["\\left\\{\\begin{aligned}#1\\end{aligned}\\right.", 1],
      hoac: ["\\left[\\begin{aligned}#1\\end{aligned}\\right.", 1],
      R: "\\mathbb{R}",
      mathscr: ["\\mathcal{#1}", 1],
      True: "",
      x: "x", y: "y", z: "z",
    },
  },
  options: { enableMenu: false },
  chtml: { scale: 1.02 },
  startup: {
    ready() {
      MathJax.startup.defaultReady();
      (window.__mjQueue || []).forEach(f => f());
      window.__mjQueue = [];
    },
  },
};
