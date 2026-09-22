    // ===== Active nav highlight (multi-page, from <body data-page>) =====
    (function () {
      var page = document.body.getAttribute('data-page');
      if (!page) return;
      var link = document.querySelector('.nav a[data-nav="' + page + '"]');
      if (link) link.setAttribute('aria-current', 'page');
    })();

    // ===== Mobile navigation toggle =====
    (function () {
      var toggle = document.getElementById('navToggle');
      var nav = document.getElementById('primaryNav');
      if (!toggle || !nav) return;

      function isMobile() { return window.matchMedia('(max-width: 760px)').matches; }

      function setOpen(open) {
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        nav.hidden = !open;
      }

      function sync() {
        if (isMobile()) { setOpen(false); }
        else { nav.hidden = false; toggle.setAttribute('aria-expanded', 'false'); }
      }
      sync();
      window.addEventListener('resize', sync);

      toggle.addEventListener('click', function () {
        setOpen(toggle.getAttribute('aria-expanded') !== 'true');
      });

      nav.addEventListener('click', function (e) {
        if (e.target.tagName === 'A' && isMobile()) setOpen(false);
      });
    })();

    // ===== Register-interest forms (page + floating drawer share this) =====
    (function () {
      // Submissions POST to register.php (a PHP mail handler in this folder).
      // Set the recipient inbox + From address at the top of register.php.
      // If the endpoint is ever unreachable, we fall back to the visitor's
      // email client so an enquiry is never lost.
      var FORM_ENDPOINT = 'register.php';
      var FALLBACK_EMAIL = 'globalacademy@tarbiyyah.co.uk';

      // Keep in step with the fields in the form markup and with register.php.
      var FIELD_LABELS = [
        ['parent_name', 'Parent/guardian'],
        ['email',       'Email'],
        ['phone',       'Contact number'],
        ['country',     'Country'],
        ['timezone',    'Time zone'],
        ['child_name',  "Child's name"],
        ['child_dob',   'Date of birth'],
        ['yeargroup',   'Year group'],
        ['start',       'Preferred start'],
        ['heard',       'Heard about us'],
        ['message',     'Message']
      ];

      function mailtoFallback(data) {
        var subject = 'Register interest — Tarbiyyah Global Academy';
        var body = FIELD_LABELS.map(function (f) {
          return f[1] + ': ' + (data.get(f[0]) || '');
        }).join('\n');
        window.location.href = 'mailto:' + FALLBACK_EMAIL +
          '?subject=' + encodeURIComponent(subject) +
          '&body=' + encodeURIComponent(body);
      }

      // Stamp the visitor's IANA time zone (e.g. "Asia/Kuala_Lumpur") into the
      // hidden field. The Academy teaches a live UK timetable, so knowing where
      // a family actually is matters more than their postal address. Silently
      // skipped on browsers without Intl — the field just stays empty.
      try {
        var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz) {
          document.querySelectorAll('.js-reg-form input[name="timezone"]')
            .forEach(function (el) { el.value = tz; });
        }
      } catch (e) { /* no Intl support — not important enough to break on */ }

      // Wire every register form on the page (there can be more than one).
      document.querySelectorAll('.js-reg-form').forEach(function (form) {
        var scope = form.closest('.js-reg');
        var fields = scope.querySelector('.js-reg-fields');
        var success = scope.querySelector('.js-reg-success');

        form.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!form.reportValidity()) return;

          var data = new FormData(form);
          if (fields) fields.hidden = true;   // immediate feedback (matches design)
          success.hidden = false;
          success.focus();

          fetch(FORM_ENDPOINT, {
            method: 'POST',
            body: data,
            headers: { 'Accept': 'application/json' }
          })
            .then(function (res) { if (!res.ok) throw new Error('bad status'); })
            .catch(function () { mailtoFallback(data); });
        });
      });
    })();

    // ===== Floating register: always-in-view CTA + slide-down drawer =====
    (function () {
      var fab = document.getElementById('regFab');
      var drawer = document.getElementById('regDrawer');
      var backdrop = document.getElementById('regBackdrop');
      var closeBtn = document.getElementById('regClose');
      var registerSection = document.getElementById('register');
      if (!fab || !drawer || !backdrop) return;

      var pastHero = false;       // scrolled past the hero
      var registerInView = false; // the main register section is on screen
      var drawerOpen = false;
      var lastFocus = null;

      function updateFab() {
        var show = pastHero && !registerInView && !drawerOpen;
        fab.classList.toggle('is-visible', show);
      }

      function openDrawer() {
        if (drawerOpen) return;
        drawerOpen = true;
        lastFocus = document.activeElement;
        backdrop.hidden = false;
        drawer.hidden = false;
        // next frame so the transition runs
        requestAnimationFrame(function () {
          backdrop.classList.add('is-open');
          drawer.classList.add('is-open');
        });
        document.body.style.overflow = 'hidden';
        fab.setAttribute('aria-expanded', 'true');
        updateFab();
        var first = drawer.querySelector('input, select, textarea, button');
        if (first) first.focus();
      }

      function closeDrawer() {
        if (!drawerOpen) return;
        drawerOpen = false;
        backdrop.classList.remove('is-open');
        drawer.classList.remove('is-open');
        document.body.style.overflow = '';
        fab.setAttribute('aria-expanded', 'false');
        window.setTimeout(function () {
          if (!drawerOpen) { drawer.hidden = true; backdrop.hidden = true; }
        }, 450);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
        updateFab();
      }

      fab.addEventListener('click', openDrawer);
      closeBtn.addEventListener('click', closeDrawer);
      backdrop.addEventListener('click', closeDrawer);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && drawerOpen) closeDrawer();
      });

      // Visibility driven by IntersectionObserver where available.
      if ('IntersectionObserver' in window) {
        var hero = document.querySelector('.hero');
        if (hero) {
          new IntersectionObserver(function (entries) {
            pastHero = !entries[0].isIntersecting;
            updateFab();
          }, { rootMargin: '-40% 0px 0px 0px' }).observe(hero);
        } else {
          pastHero = true;
        }
        if (registerSection) {
          new IntersectionObserver(function (entries) {
            registerInView = entries[0].isIntersecting;
            updateFab();
          }, { threshold: 0.12 }).observe(registerSection);
        }
      } else {
        // No IO: just show the CTA once the user scrolls a little.
        window.addEventListener('scroll', function () {
          pastHero = window.pageYOffset > 500;
          updateFab();
        }, { passive: true });
      }
    })();
