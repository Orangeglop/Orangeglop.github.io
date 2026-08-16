/**
 * main.js — Lightweight interactions for Orangeglop.github.io
 * Zero dependencies, pure vanilla JavaScript.
 */
(function () {
  'use strict';

  /* ==========================================================================
     Header Scroll Elevation
     ========================================================================== */
  function initHeaderScroll() {
    var header = document.querySelector('.site-header');
    if (!header) return;

    var checkScroll = function () {
      if (window.scrollY > 12) {
        header.classList.add('is-scrolled');
      } else {
        header.classList.remove('is-scrolled');
      }
    };

    window.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();
  }

  /* ==========================================================================
     Mobile Navigation Drawer Toggle
     ========================================================================== */
  function initMobileNav() {
    var toggleBtn = document.querySelector('.mobile-nav-toggle');
    var drawer = document.querySelector('.mobile-drawer');
    if (!toggleBtn || !drawer) return;

    toggleBtn.addEventListener('click', function () {
      var isOpen = drawer.classList.toggle('is-open');
      toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Close mobile drawer when clicking a link
    var links = drawer.querySelectorAll('.nav-link');
    links.forEach(function (link) {
      link.addEventListener('click', function () {
        drawer.classList.remove('is-open');
        toggleBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ==========================================================================
     Scroll Reveal (IntersectionObserver)
     ========================================================================== */
  function initScrollReveal() {
    var revealElements = document.querySelectorAll('[data-reveal]');
    if (!revealElements.length) return;

    if (!('IntersectionObserver' in window)) {
      revealElements.forEach(function (el) {
        el.classList.add('is-revealed');
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '0px 0px -40px 0px',
      threshold: 0.1
    });

    revealElements.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ==========================================================================
     Accessible Vanilla Carousel
     ========================================================================== */
  function initCarousels() {
    var carousels = document.querySelectorAll('.carousel-container');
    if (!carousels.length) return;

    carousels.forEach(function (carousel) {
      var slides = carousel.querySelectorAll('.carousel-slide');
      var dots = carousel.querySelectorAll('.carousel-dot');
      var prevBtn = carousel.querySelector('.carousel-nav-btn.prev');
      var nextBtn = carousel.querySelector('.carousel-nav-btn.next');
      var captionEl = carousel.querySelector('.carousel-caption-pill');

      if (!slides.length) return;

      var currentIndex = 0;
      var total = slides.length;
      var autoTimer = null;
      var interval = parseInt(carousel.getAttribute('data-interval') || '4500', 10);

      function updateSlide(newIndex) {
        if (newIndex < 0) newIndex = total - 1;
        if (newIndex >= total) newIndex = 0;

        slides[currentIndex].classList.remove('active');
        if (dots[currentIndex]) dots[currentIndex].classList.remove('active');

        currentIndex = newIndex;

        slides[currentIndex].classList.add('active');
        if (dots[currentIndex]) dots[currentIndex].classList.add('active');

        // Update caption if exists
        var slideImg = slides[currentIndex].querySelector('img');
        if (captionEl && slideImg) {
          var captionText = slideImg.getAttribute('alt') || '';
          if (captionText) {
            captionEl.textContent = captionText;
            captionEl.style.display = 'block';
          } else {
            captionEl.style.display = 'none';
          }
        }
      }

      function nextSlide() { updateSlide(currentIndex + 1); }
      function prevSlide() { updateSlide(currentIndex - 1); }

      if (nextBtn) {
        nextBtn.addEventListener('click', function (e) {
          e.preventDefault();
          nextSlide();
          resetTimer();
        });
      }

      if (prevBtn) {
        prevBtn.addEventListener('click', function (e) {
          e.preventDefault();
          prevSlide();
          resetTimer();
        });
      }

      dots.forEach(function (dot, idx) {
        dot.addEventListener('click', function (e) {
          e.preventDefault();
          updateSlide(idx);
          resetTimer();
        });
      });

      // Auto-rotation
      function startTimer() {
        if (interval > 0 && !autoTimer) {
          autoTimer = setInterval(nextSlide, interval);
        }
      }

      function stopTimer() {
        if (autoTimer) {
          clearInterval(autoTimer);
          autoTimer = null;
        }
      }

      function resetTimer() {
        stopTimer();
        startTimer();
      }

      carousel.addEventListener('mouseenter', stopTimer);
      carousel.addEventListener('mouseleave', startTimer);
      carousel.addEventListener('focusin', stopTimer);
      carousel.addEventListener('focusout', startTimer);

      // Touch / Swipe support
      var touchStartX = 0;
      var touchEndX = 0;

      carousel.addEventListener('touchstart', function (e) {
        touchStartX = e.changedTouches[0].screenX;
        stopTimer();
      }, { passive: true });

      carousel.addEventListener('touchend', function (e) {
        touchEndX = e.changedTouches[0].screenX;
        var diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 40) {
          if (diff > 0) nextSlide();
          else prevSlide();
        }
        startTimer();
      }, { passive: true });

      // Keyboard arrow navigation when hovering/focused
      carousel.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') {
          prevSlide();
          resetTimer();
        } else if (e.key === 'ArrowRight') {
          nextSlide();
          resetTimer();
        }
      });

      // Initial caption set
      var firstImg = slides[0].querySelector('img');
      if (captionEl && firstImg) {
        var firstText = firstImg.getAttribute('alt') || '';
        if (firstText) captionEl.textContent = firstText;
        else captionEl.style.display = 'none';
      }

      startTimer();
    });
  }

  /* ==========================================================================
     Bootstrap / Initialize
     ========================================================================== */
  function init() {
    initHeaderScroll();
    initMobileNav();
    initScrollReveal();
    initCarousels();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
