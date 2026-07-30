(function () {
  var carousel = document.getElementById('reviews-carousel');
  var track = document.getElementById('reviews-track');
  var prevBtn = document.getElementById('rc-prev');
  var nextBtn = document.getElementById('rc-next');
  if (!carousel || !track || !prevBtn || !nextBtn) return;

  var gap = 24;
  var autoDelay = 4000;
  var autoTimer = null;
  var busy = false;
  var originals = [];
  var idx = 0;

  function getVisible() {
    return window.innerWidth < 640 ? 1 : window.innerWidth < 900 ? 2 : 3;
  }

  function cardWidth() {
    return track.children.length ? track.children[0].offsetWidth + gap : 0;
  }

  function removeClones() {
    var clones = track.querySelectorAll('.rc-clone');
    clones.forEach(function (el) { el.parentNode.removeChild(el); });
  }

  function buildClones() {
    removeClones();
    var vis = getVisible();
    var n = originals.length;
    // Prepend last `vis` originals
    for (var i = n - vis; i < n; i++) {
      var c = originals[i].cloneNode(true);
      c.classList.add('rc-clone');
      track.insertBefore(c, track.firstChild);
    }
    // Append first `vis` originals
    for (var j = 0; j < vis; j++) {
      var c2 = originals[j].cloneNode(true);
      c2.classList.add('rc-clone');
      track.appendChild(c2);
    }
  }

  function setWidths() {
    var vis = getVisible();
    // Use carousel's own clientWidth (it has overflow:hidden so it reflects true available)
    var available = carousel.clientWidth;
    if (available <= 0) {
      // Fallback: measure from window
      available = Math.min(window.innerWidth, document.documentElement.clientWidth) - 88 - 64;
    }
    var w = Math.floor((available - gap * (vis - 1)) / vis);
    if (w < 1) return;
    var all = track.children;
    for (var k = 0; k < all.length; k++) {
      all[k].style.flex = '0 0 ' + w + 'px';
      all[k].style.maxWidth = w + 'px';
    }
  }

  function offset() {
    var vis = getVisible();
    return (idx + vis) * cardWidth();
  }

  function jumpTo(noAnim) {
    track.style.transition = noAnim ? 'none' : 'transform 0.4s ease';
    if (noAnim) track.offsetHeight; // reflow
    track.style.transform = 'translateX(-' + offset() + 'px)';
  }

  function slide(dir) {
    if (busy) return;
    busy = true;
    idx += dir;
    track.style.transition = 'transform 0.4s ease';
    track.style.transform = 'translateX(-' + offset() + 'px)';
  }

  track.addEventListener('transitionend', function () {
    var n = originals.length;
    if (idx >= n) { idx -= n; jumpTo(true); }
    else if (idx < 0) { idx += n; jumpTo(true); }
    busy = false;
  });

  function startAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(function () { slide(1); }, autoDelay);
  }

  function stopAuto() { clearInterval(autoTimer); }

  prevBtn.addEventListener('click', function () { stopAuto(); slide(-1); startAuto(); });
  nextBtn.addEventListener('click', function () { stopAuto(); slide(1); startAuto(); });

  carousel.addEventListener('mouseenter', stopAuto);
  carousel.addEventListener('mouseleave', startAuto);

  function init() {
    originals = Array.from(track.querySelectorAll('.review-card-new'));
    buildClones();
    setWidths();
    jumpTo(true);
    startAuto();
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      stopAuto();
      buildClones();
      setWidths();
      jumpTo(true);
      startAuto();
    }, 100);
  });

  function safeInit() {
    // Wait until the carousel has a real width
    var w = carousel.clientWidth;
    if (w > 0 && w < 5000) {
      init();
    } else {
      requestAnimationFrame(safeInit);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeInit);
  } else {
    requestAnimationFrame(safeInit);
  }
})();
