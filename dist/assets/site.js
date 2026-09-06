(function () {

  // Alte Hash-Adressen (#/jobs) auf echte Unterseiten umleiten
  if (location.hash.indexOf('#/') === 0) {
    var old = location.hash.slice(2).replace(/\/+$/, '');
    var target = old === '' ? '/' : '/' + old + '/';
    if (old === 'kontakt/unternehmen') target = '/kontakt/#kontakt-unternehmen';
    if (old === 'kontakt/bewerber') target = '/kontakt/#kontakt-bewerber';
    location.replace(target);
  }

  var mobileNav = document.getElementById('mobileNav');
  var burger = document.getElementById('burgerBtn');

  function closeMobileNav() {
    mobileNav.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
  }

  // Aktiven Menüpunkt anhand des Pfads markieren
  var top = location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
  document.querySelectorAll('[data-route]').forEach(function (a) {
    a.classList.toggle('active', a.dataset.route === top);
  });

  // Skip-Link: direkt fokussieren, ohne den Hash-Router auszuloesen
  var skipLink = document.getElementById('skipLink');
  if (skipLink) {
    skipLink.addEventListener('click', function (e) {
      e.preventDefault();
      var target = document.getElementById('inhalt');
      if (target) { target.focus(); target.scrollIntoView({ block: 'start' }); }
    });
  }

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  }

  burger.addEventListener('click', function () {
    var willOpen = !mobileNav.classList.contains('open');
    mobileNav.classList.toggle('open', willOpen);
    burger.setAttribute('aria-expanded', String(willOpen));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMobileNav();
  });

  function showFieldError(field, message) {
    field.classList.add('has-error');
    var msg = field.querySelector('.field-error');
    if (!msg) {
      msg = document.createElement('p');
      msg.className = 'field-error';
      field.appendChild(msg);
    }
    msg.textContent = message;
  }

  function clearFieldError(field) {
    field.classList.remove('has-error');
    var msg = field.querySelector('.field-error');
    if (msg) { msg.remove(); }
  }

  function validateForm(form) {
    var firstInvalid = null;
    form.querySelectorAll('.field').forEach(function (field) {
      var input = field.querySelector('input, select, textarea');
      if (!input) { return; }
      clearFieldError(field);
      var value = (input.value || '').trim();
      if (input.hasAttribute('required') && !value) {
        showFieldError(field, 'Bitte ausfüllen.');
        if (!firstInvalid) { firstInvalid = input; }
        return;
      }
      if (input.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        showFieldError(field, 'Bitte eine gültige E-Mail-Adresse eingeben.');
        if (!firstInvalid) { firstInvalid = input; }
      }
    });
    if (firstInvalid) { firstInvalid.focus(); return false; }
    return true;
  }

  document.querySelectorAll('.contact-card form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = new FormData(form);
      if (data.get('website')) { return; }
      if (!validateForm(form)) { return; }
      var subject = form.dataset.subject || 'Nachricht über foxandpeople.at';
      var lines = [];
      form.querySelectorAll('.field').forEach(function (field) {
        var input = field.querySelector('input, select, textarea');
        var label = field.querySelector('label');
        if (!input || !label) { return; }
        var labelText = label.textContent.replace('*', '').trim();
        if (input.type === 'file') {
          if (input.files && input.files.length) {
            lines.push(labelText + ': ' + input.files[0].name + ' (bitte im E-Mail-Programm manuell anhängen)');
          }
          return;
        }
        if (input.value) { lines.push(labelText + ': ' + input.value); }
      });
      var body = encodeURIComponent(lines.join('\n'));
      window.location.href = 'mailto:office@foxandpeople.at?subject=' + encodeURIComponent(subject) + '&body=' + body;
      var status = form.querySelector('[data-status-for="' + form.dataset.kind + '"]');
      if (status) { status.classList.add('show'); }
    });

    form.querySelectorAll('.field input, .field textarea, .field select').forEach(function (input) {
      input.addEventListener('input', function () {
        var field = input.closest('.field');
        if (field && field.classList.contains('has-error')) { clearFieldError(field); }
      });
    });
  });

  var fSegment = document.getElementById('f-segment');
  var fOrt = document.getElementById('f-ort');
  var fArt = document.getElementById('f-art');
  if (fSegment) {
    function applyFilter() {
      var seg = fSegment.value, ort = fOrt.value, art = fArt.value;
      var visible = 0;
      document.querySelectorAll('#jobList .job-row').forEach(function (row) {
        var match = (seg === 'alle' || row.dataset.segment === seg)
          && (ort === 'alle' || row.dataset.ort.split('|').indexOf(ort) !== -1)
          && (art === 'alle' || row.dataset.art === art);
        row.hidden = !match;
        if (match) visible++;
      });
      document.getElementById('filterEmpty').classList.toggle('show', visible === 0);
    }
    [fSegment, fOrt, fArt].forEach(function (s) { s.addEventListener('change', applyFilter); });
  }
})();
