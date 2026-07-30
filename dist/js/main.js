// Wheatland Construction - Site JS

// Mobile nav toggle
document.addEventListener('DOMContentLoaded', function() {
  const toggle = document.querySelector('.nav-toggle');
  const navList = document.querySelector('.nav-list');
  if (toggle && navList) {
    toggle.addEventListener('click', function() {
      navList.classList.toggle('open');
    });
  }

  // Dropdown toggle on mobile
  document.querySelectorAll('.has-dropdown').forEach(function(item) {
    item.addEventListener('click', function(e) {
      if (window.innerWidth <= 900) {
        item.classList.toggle('open');
      }
    });
  });

  // Lightbox
  const overlay = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  if (overlay && lightboxImg) {
    document.querySelectorAll('.gallery-grid img, .gallery-lightbox').forEach(function(img) {
      img.addEventListener('click', function() {
        lightboxImg.src = this.src.replace(/-\d+x\d+\./, '.').replace('-scaled', '');
        overlay.classList.add('active');
      });
    });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay || e.target.classList.contains('lightbox-close')) {
        overlay.classList.remove('active');
        lightboxImg.src = '';
      }
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { overlay.classList.remove('active'); lightboxImg.src = ''; }
    });
  }

  // Dynamic copyright year
  const yr = document.getElementById('copyright-year');
  if (yr) yr.textContent = new Date().getFullYear();

  // Form submission
  const form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      const msg = document.getElementById('form-message');
      btn.disabled = true;
      btn.textContent = 'Sending...';
      msg.className = '';
      msg.textContent = '';
      try {
        const data = new FormData(form);
        const resp = await fetch('/submit', { method: 'POST', body: data });
        const json = await resp.json();
        if (json.ok) {
          msg.className = 'success';
          msg.textContent = 'Thank you! We will be in touch soon.';
          form.reset();
          if (window.turnstile) window.turnstile.reset();
        } else {
          throw new Error(json.error || 'Submission failed');
        }
      } catch(err) {
        msg.className = 'error';
        msg.textContent = 'Something went wrong. Please call us at (316) 322-7898.';
        if (window.turnstile) window.turnstile.reset();
      } finally {
        btn.disabled = false;
        btn.textContent = 'Submit Request';
      }
    });
  }
});

// Back to top
(function(){
  var btn = document.querySelector('.back-to-top');
  if (!btn) return;
  window.addEventListener('scroll', function(){
    btn.classList.toggle('visible', window.scrollY > 400);
  });
})();
