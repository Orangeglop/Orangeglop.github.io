/**
 * PdfViewer — Custom single-column scrollable PDF viewer
 * Matches FlipBook aesthetic with frosted-glass background,
 * floating glassmorphism toolbar, double-buffered high-DPI canvas rendering,
 * user-definable deep link sharing (via button href="#custom-hash"),
 * and multi-touch gestures.
 */
(function (global) {
  'use strict';

  /* =========================================================
     SVG Icons (Matches FlipBook)
  ========================================================= */
  function icon(d, s) {
    s = s || 20;
    return '<svg width="' + s + '" height="' + s +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
      ' stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  }

  var I = {
    prev     : icon('<polyline points="18 15 12 9 6 15"/>'), // Up chevron
    next     : icon('<polyline points="6 9 12 15 18 9"/>'),  // Down chevron
    zoomIn   : icon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>'),
    zoomOut  : icon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>'),
    zoomReset: icon('<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M10 14l-7 7"/>'),
    fs       : icon('<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>'),
    fsExit   : icon('<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>'),
    close    : icon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>')
  };

  /* =========================================================
     DOM Helpers
  ========================================================= */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function mkBtn(cls, title, html) {
    var b = el('button', 'pv-btn' + (cls ? ' ' + cls : ''), html);
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    return b;
  }

  /* =========================================================
     PDF.js Script Loader Fallback
  ========================================================= */
  var _pdfjsPromise = null;
  function ensurePdfJs() {
    if (window.pdfjsLib) {
      return Promise.resolve(window.pdfjsLib);
    }
    if (_pdfjsPromise) return _pdfjsPromise;

    _pdfjsPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = function () {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        } else {
          reject(new Error('PDF.js failed to initialize'));
        }
      };
      script.onerror = function () {
        reject(new Error('Failed to load PDF.js from CDN'));
      };
      document.head.appendChild(script);
    });

    return _pdfjsPromise;
  }

  /* =========================================================
     PdfViewer Class
  ========================================================= */
  function PdfViewer(opts) {
    opts = opts || {};
    this.pdfUrl          = opts.pdfUrl || opts.url || '';
    this.title           = opts.title || 'PDF Document';
    this.hash            = opts.hash || '#pdf';

    this._pdfDoc         = null;
    this._totalPages     = 0;
    this._currentPage    = 1;
    this._zoomScale      = 1.0;
    this._baseWidth      = 820;
    this._pageContainers = [];
    this._renderedPages  = {};
    this._renderTasks    = {};
    this._observer       = null;
    this._open           = false;
    this._pushedHistory  = false;
    this._idleTimer      = null;
    this._zoomDebounce   = null;

    this._overlay        = null;
    this._modal          = null;
    this._scrollContainer= null;
    this._pagesWrapper   = null;
    this._toolbar        = null;
    this._pageInput      = null;
    this._pageTotal      = null;
    this._btnFS          = null;
    this._topClose       = null;

    this._onKey   = this._handleKey.bind(this);
    this._onFS    = this._handleFS.bind(this);
    this._onPop   = this._handlePop.bind(this);
    this._onScroll= this._handleScroll.bind(this);
    this._onWheel = this._handleWheel.bind(this);

    this._buildDOM();
  }

  /* =========================================================
     Build DOM
  ========================================================= */
  PdfViewer.prototype._buildDOM = function () {
    var self = this;

    var overlay = el('div', 'pv-overlay');
    this._overlay = overlay;

    var modal = el('div', 'pv-modal');
    this._modal = modal;

    /* ---- Top Bar Close Button ---- */
    var topClose = el('button', 'pv-top-close', I.close);
    topClose.type = 'button';
    topClose.title = 'Close viewer (Esc)';
    topClose.setAttribute('aria-label', 'Close viewer');
    topClose.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      self.close();
    });
    this._topClose = topClose;

    /* ---- Scrollable Document Stage ---- */
    var scrollContainer = el('div', 'pv-scroll-container');
    this._scrollContainer = scrollContainer;

    var pagesWrapper = el('div', 'pv-pages-wrapper');
    this._pagesWrapper = pagesWrapper;
    scrollContainer.appendChild(pagesWrapper);

    /* ---- Bottom Floating Toolbar ---- */
    var tb = el('div', 'pv-toolbar');
    this._toolbar = tb;

    var bPrev = mkBtn('', 'Previous page (Up arrow)', I.prev);
    bPrev.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      self.goToPage(self._currentPage - 1);
    });

    var pWrap = el('div', 'pv-page-wrap');
    var pIn   = el('input', 'pv-page-in');
    pIn.type  = 'text';
    pIn.setAttribute('aria-label', 'Page number');
    var pTot  = el('span', 'pv-page-tot');
    pWrap.appendChild(pIn);
    pWrap.appendChild(pTot);
    this._pageInput = pIn;
    this._pageTotal = pTot;

    var bNext = mkBtn('', 'Next page (Down arrow)', I.next);
    bNext.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      self.goToPage(self._currentPage + 1);
    });

    var s1 = el('div', 'pv-sep');
    var bZI = mkBtn('', 'Zoom in (+)', I.zoomIn);
    bZI.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      self.setZoom(self._zoomScale + 0.2);
    });

    var bZO = mkBtn('', 'Zoom out (-)', I.zoomOut);
    bZO.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      self.setZoom(self._zoomScale - 0.2);
    });

    var bZR = mkBtn('', 'Fit width / Reset zoom', I.zoomReset);
    bZR.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      self.setZoom(1.0);
    });

    var s2 = el('div', 'pv-sep');
    var bFS = mkBtn('', 'Fullscreen', I.fs);
    bFS.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      self._toggleFS();
    });
    this._btnFS = bFS;

    [bPrev, pWrap, bNext, s1, bZI, bZO, bZR, s2, bFS].forEach(function (e) {
      tb.appendChild(e);
    });

    var s3 = el('div', 'pv-sep');
    tb.appendChild(s3);

    var bClose = mkBtn('pv-close', 'Close (Esc)', I.close);
    bClose.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      self.close();
    });
    tb.appendChild(bClose);

    modal.appendChild(topClose);
    modal.appendChild(scrollContainer);
    modal.appendChild(tb);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    this._setupIdleToolbar();
    this._setupTouchGestures();

    /* Events */
    tb.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    tb.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    tb.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });

    pIn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var n = parseInt(pIn.value, 10);
        if (!isNaN(n)) self.goToPage(n);
      }
    });
    pIn.addEventListener('blur', function () {
      self._syncUI();
    });

    scrollContainer.addEventListener('scroll', this._onScroll, { passive: true });
    overlay.addEventListener('wheel', this._onWheel, { passive: false });
  };

  /* =========================================================
     Continuous Multi-Touch Gestures (Ultra-Smooth Pinch & Double-Tap)
  ========================================================= */
  PdfViewer.prototype._setupTouchGestures = function () {
    var self = this;
    var container = this._scrollContainer;
    if (!container) return;

    var isPinching = false;
    var initialPinchDist = 0;
    var startZoom = 1.0;

    var touchRaf = null;
    var pendingZoom = null;
    var pendingMidX = 0;
    var pendingMidY = 0;

    var lastTapTime = 0;
    var lastTapX = 0;
    var lastTapY = 0;

    function getDistance(t1, t2) {
      return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    }

    function applyPinch() {
      touchRaf = null;
      if (pendingZoom !== null && self._open) {
        self.setZoom(pendingZoom, pendingMidX, pendingMidY);
        pendingZoom = null;
      }
    }

    container.addEventListener('touchstart', function (e) {
      if (!self._open) return;

      if (e.touches.length === 2) {
        isPinching = true;
        initialPinchDist = getDistance(e.touches[0], e.touches[1]);
        startZoom = self._zoomScale;
      } else if (e.touches.length === 1) {
        isPinching = false;
        var now = Date.now();
        var tapX = e.touches[0].clientX;
        var tapY = e.touches[0].clientY;

        if (now - lastTapTime < 320 && Math.hypot(tapX - lastTapX, tapY - lastTapY) < 30) {
          if (!e.target.closest('.pv-btn, .pv-toolbar, .pv-top-close, input, a')) {
            e.preventDefault();
            if (self._zoomScale > 1.2) {
              self.setZoom(1.0, tapX, tapY);
            } else {
              self.setZoom(1.8, tapX, tapY);
            }
            lastTapTime = 0;
            return;
          }
        }
        lastTapTime = now;
        lastTapX = tapX;
        lastTapY = tapY;
      }
    }, { passive: false });

    container.addEventListener('touchmove', function (e) {
      if (!self._open) return;

      if (isPinching && e.touches.length === 2) {
        if (e.cancelable) e.preventDefault();
        var currentDist = getDistance(e.touches[0], e.touches[1]);
        if (initialPinchDist > 0) {
          var ratio = currentDist / initialPinchDist;
          pendingZoom = Math.max(0.5, Math.min(3.5, startZoom * ratio));
          pendingMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          pendingMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

          if (!touchRaf) {
            touchRaf = requestAnimationFrame(applyPinch);
          }
        }
      }
    }, { passive: false });

    function onTouchEnd(e) {
      if (isPinching && e.touches.length < 2) {
        isPinching = false;
        initialPinchDist = 0;
        if (touchRaf) {
          cancelAnimationFrame(touchRaf);
          touchRaf = null;
        }
        /* Trigger high-DPI re-rasterization after pinch release */
        if (self._zoomDebounce) clearTimeout(self._zoomDebounce);
        self._zoomDebounce = setTimeout(function () {
          self._renderedPages = {};
          self._renderPage(self._currentPage);
          if (self._currentPage > 1) self._renderPage(self._currentPage - 1);
          if (self._currentPage < self._totalPages) self._renderPage(self._currentPage + 1);
        }, 90);
      }
    }

    container.addEventListener('touchend', onTouchEnd, { passive: true });
    container.addEventListener('touchcancel', onTouchEnd, { passive: true });

    container.addEventListener('gesturestart', function (e) {
      if (!self._open) return;
      e.preventDefault();
      startZoom = self._zoomScale;
    });

    container.addEventListener('gesturechange', function (e) {
      if (!self._open) return;
      e.preventDefault();
      var targetZoom = Math.max(0.5, Math.min(3.5, startZoom * e.scale));
      self.setZoom(targetZoom, e.clientX, e.clientY);
    });

    container.addEventListener('gestureend', function (e) {
      if (!self._open) return;
      e.preventDefault();
    });
  };

  /* =========================================================
     Open / Close, Deep Linking & Document Loading
  ========================================================= */
  PdfViewer.prototype.open = function () {
    if (this._open) return;
    var self = this;
    this._open = true;
    this._currentPage = 1;
    this._zoomScale = 1.0;

    document.body.appendChild(this._overlay);
    this._overlay.classList.add('pv-open');
    document.body.style.overflow = 'hidden';

    if (this._scrollContainer) {
      this._scrollContainer.scrollTop = 0;
      this._scrollContainer.scrollLeft = 0;
    }

    /* User-defined Link Hash Integration */
    var targetHash = this.hash || '#pdf';
    if (!targetHash.startsWith('#')) targetHash = '#' + targetHash;

    if (window.history && window.history.pushState) {
      try {
        window.history.pushState({ pdfViewerOpen: true }, '', targetHash);
        this._pushedHistory = true;
      } catch (err) {}
    }
    window.addEventListener('popstate', this._onPop);

    document.addEventListener('keydown', this._onKey);
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(function (ev) {
      document.addEventListener(ev, self._onFS);
    });

    this._loadDocument();
  };

  PdfViewer.prototype.close = function () {
    if (!this._open) return;
    this._open = false;
    this._overlay.classList.remove('pv-open');
    if (this._idleTimer) clearTimeout(this._idleTimer);
    if (this._zoomDebounce) clearTimeout(this._zoomDebounce);
    document.body.style.overflow = '';

    window.removeEventListener('popstate', this._onPop);

    /* Clean URL hash when closing */
    if (this._pushedHistory) {
      this._pushedHistory = false;
      try {
        window.history.back();
      } catch (err) {}
    } else if (window.history && window.history.replaceState) {
      try {
        var cleanUrl = window.location.pathname + window.location.search;
        window.history.replaceState(null, '', cleanUrl);
      } catch (e) {}
    }

    document.removeEventListener('keydown', this._onKey);
    var self = this;
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(function (ev) {
      document.removeEventListener(ev, self._onFS);
    });

    var isFS = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    if (isFS) {
      var efs = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
      if (efs) efs.call(document);
    }
  };

  PdfViewer.prototype._handlePop = function () {
    if (this._open) {
      this._pushedHistory = false;
      this.close();
    }
  };

  /* =========================================================
     Document Loading & Page Setup
  ========================================================= */
  PdfViewer.prototype._loadDocument = function () {
    var self = this;
    if (this._pdfDoc) return;

    this._pagesWrapper.innerHTML =
      '<div class="pv-page-container" style="width: min(820px, 92vw); aspect-ratio: 1 / 1.414;">' +
      '  <div class="pv-page-loading">' +
      '    <div class="pv-spinner"></div>' +
      '    <span>Loading document...</span>' +
      '  </div>' +
      '</div>';

    ensurePdfJs().then(function (pdfjsLib) {
      return pdfjsLib.getDocument({
        url: self.pdfUrl,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true
      }).promise;
    }).then(function (pdfDoc) {
      self._pdfDoc = pdfDoc;
      self._totalPages = pdfDoc.numPages;
      self._setupPages();
      self._syncUI();
    }).catch(function (err) {
      console.error('PdfViewer load error:', err);
      self._pagesWrapper.innerHTML =
        '<div class="pv-page-container" style="width: min(600px, 90vw); padding: 40px 20px; text-align: center;">' +
        '  <div style="color: #ef4444; font-size: 1.1rem; font-weight: 600; margin-bottom: 8px;">Unable to load document</div>' +
        '  <p style="color: #64748b; font-size: 0.9rem;">The requested document could not be previewed.</p>' +
        '</div>';
    });
  };

  PdfViewer.prototype._setupPages = function () {
    var self = this;
    this._pagesWrapper.innerHTML = '';
    this._pageContainers = [];
    this._renderedPages = {};

    var availableWidth = Math.min(window.innerWidth - 32, self._baseWidth);
    var baseW = Math.round(availableWidth * self._zoomScale);

    var pagePromises = [];
    for (var i = 1; i <= self._totalPages; i++) {
      pagePromises.push(self._pdfDoc.getPage(i));
    }

    Promise.all(pagePromises).then(function (pages) {
      pages.forEach(function (page, idx) {
        var pageNum = idx + 1;
        var vp = page.getViewport({ scale: 1.0 });
        var pageAspect = vp.height / vp.width;
        var pageHeight = Math.round(baseW * pageAspect);

        var container = el('div', 'pv-page-container');
        container.dataset.pageNumber = pageNum;
        container.style.width = baseW + 'px';
        container.style.height = pageHeight + 'px';

        var loading = el('div', 'pv-page-loading');
        loading.innerHTML = '<div class="pv-spinner"></div><span>Page ' + pageNum + '</span>';
        container.appendChild(loading);

        var canvas = el('canvas', 'pv-page-canvas');
        container.appendChild(canvas);

        var tag = el('div', 'pv-page-number-tag', 'Page ' + pageNum + ' / ' + self._totalPages);
        container.appendChild(tag);

        self._pagesWrapper.appendChild(container);
        self._pageContainers.push({
          num: pageNum,
          el: container,
          canvas: canvas,
          loading: loading,
          aspect: pageAspect,
          baseVp: vp
        });
      });

      self._setupObserver();
      if (self._scrollContainer) {
        self._scrollContainer.scrollTop = 0;
        self._scrollContainer.scrollLeft = 0;
      }
      self._currentPage = 1;
      self._syncUI();
    });
  };

  /* =========================================================
     Intersection Observer & Lazy Page Rendering
  ========================================================= */
  PdfViewer.prototype._setupObserver = function () {
    var self = this;
    if (this._observer) {
      this._observer.disconnect();
    }

    if ('IntersectionObserver' in window) {
      this._observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var pageNum = parseInt(entry.target.dataset.pageNumber, 10);
            self._renderPage(pageNum);
          }
        });
      }, {
        root: self._scrollContainer,
        rootMargin: '500px 0px 500px 0px',
        threshold: 0.01
      });

      this._pageContainers.forEach(function (p) {
        self._observer.observe(p.el);
      });
    } else {
      for (var i = 1; i <= this._totalPages; i++) {
        this._renderPage(i);
      }
    }
  };

  /* =========================================================
     Double-Buffered High-DPI Page Rendering
  ========================================================= */
  PdfViewer.prototype._renderPage = function (pageNum) {
    var self = this;
    if (!this._pdfDoc || pageNum < 1 || pageNum > this._totalPages) return;
    if (this._renderedPages[pageNum] === this._zoomScale) return;

    var pObj = this._pageContainers[pageNum - 1];
    if (!pObj) return;

    if (this._renderTasks[pageNum]) {
      try {
        this._renderTasks[pageNum].cancel();
      } catch (e) {}
      delete this._renderTasks[pageNum];
    }

    var targetZoom = this._zoomScale;

    this._pdfDoc.getPage(pageNum).then(function (page) {
      if (!self._open) return;

      var currentWidth = parseFloat(pObj.el.style.width) || (self._baseWidth * targetZoom);
      var unscaledVp = page.getViewport({ scale: 1.0 });
      var scale = currentWidth / unscaledVp.width;
      var dpr = window.devicePixelRatio || 1;
      var viewport = page.getViewport({ scale: scale * dpr });

      var tempCanvas = document.createElement('canvas');
      tempCanvas.className = 'pv-page-canvas';
      tempCanvas.width = Math.floor(viewport.width);
      tempCanvas.height = Math.floor(viewport.height);
      tempCanvas.style.width = '100%';
      tempCanvas.style.height = '100%';

      var ctx = tempCanvas.getContext('2d', { alpha: false });
      var renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      var task = page.render(renderContext);
      self._renderTasks[pageNum] = task;

      return task.promise.then(function () {
        delete self._renderTasks[pageNum];
        if (self._zoomScale !== targetZoom) return;

        self._renderedPages[pageNum] = targetZoom;

        if (pObj.canvas && pObj.canvas.parentNode) {
          pObj.canvas.parentNode.replaceChild(tempCanvas, pObj.canvas);
        } else {
          pObj.el.appendChild(tempCanvas);
        }
        pObj.canvas = tempCanvas;

        if (pObj.loading && pObj.loading.parentNode) {
          pObj.loading.parentNode.removeChild(pObj.loading);
        }

        setTimeout(function () {
          if (!self._open || self._zoomScale !== targetZoom) return;
          if (pageNum + 1 <= self._totalPages && !self._renderedPages[pageNum + 1]) {
            self._renderPage(pageNum + 1);
          }
          if (pageNum - 1 >= 1 && !self._renderedPages[pageNum - 1]) {
            self._renderPage(pageNum - 1);
          }
        }, 60);
      });
    }).catch(function (err) {
      if (err && err.name !== 'RenderingCancelledException') {
        console.error('Page ' + pageNum + ' render error:', err);
      }
    });
  };

  /* =========================================================
     Jump-Free Stable Zoom Controls with Middle Anchoring
  ========================================================= */
  PdfViewer.prototype.setZoom = function (newScale, anchorClientX, anchorClientY) {
    var scale = Math.max(0.5, Math.min(3.5, newScale));
    if (Math.abs(this._zoomScale - scale) < 0.001) return;

    var self = this;
    var scrollContainer = this._scrollContainer;
    if (!scrollContainer || this._pageContainers.length === 0) {
      this._zoomScale = scale;
      return;
    }

    var containerRect = scrollContainer.getBoundingClientRect();
    var containerWidth = scrollContainer.clientWidth;
    var containerHeight = scrollContainer.clientHeight;

    var visualAnchorX = (anchorClientX !== undefined)
      ? (anchorClientX - containerRect.left)
      : (containerWidth / 2);
    var visualAnchorY = (anchorClientY !== undefined)
      ? (anchorClientY - containerRect.top)
      : (containerHeight / 2);

    visualAnchorX = Math.max(0, Math.min(containerWidth, visualAnchorX));
    visualAnchorY = Math.max(0, Math.min(containerHeight, visualAnchorY));

    var docAnchorX = scrollContainer.scrollLeft + visualAnchorX;
    var docAnchorY = scrollContainer.scrollTop + visualAnchorY;

    var anchorPObj = this._pageContainers[0];
    var yRatio = 0.5;
    var xRatio = 0.5;

    for (var i = 0; i < this._pageContainers.length; i++) {
      var p = this._pageContainers[i];
      var pTop = p.el.offsetTop;
      var pHeight = p.el.offsetHeight;
      if (docAnchorY >= pTop && docAnchorY <= pTop + pHeight) {
        anchorPObj = p;
        yRatio = (docAnchorY - pTop) / Math.max(1, pHeight);
        var pLeft = p.el.offsetLeft;
        var pWidth = p.el.offsetWidth;
        xRatio = (docAnchorX - pLeft) / Math.max(1, pWidth);
        break;
      } else if (docAnchorY < pTop) {
        anchorPObj = (i > 0) ? this._pageContainers[i - 1] : p;
        break;
      } else {
        anchorPObj = p;
      }
    }

    this._zoomScale = scale;

    var availableWidth = Math.min(window.innerWidth - 32, this._baseWidth);
    var width = Math.round(availableWidth * scale);

    this._pageContainers.forEach(function (p) {
      var height = Math.round(width * p.aspect);
      p.el.style.width = width + 'px';
      p.el.style.height = height + 'px';
    });

    if (anchorPObj) {
      var newPageTop = anchorPObj.el.offsetTop;
      var newPageLeft = anchorPObj.el.offsetLeft;
      var newPageWidth = width;
      var newPageHeight = Math.round(width * anchorPObj.aspect);

      var newDocAnchorY = newPageTop + (yRatio * newPageHeight);
      var newDocAnchorX = newPageLeft + (xRatio * newPageWidth);

      scrollContainer.scrollTop = Math.max(0, newDocAnchorY - visualAnchorY);
      scrollContainer.scrollLeft = Math.max(0, newDocAnchorX - visualAnchorX);
    }

    if (this._zoomDebounce) clearTimeout(this._zoomDebounce);
    this._zoomDebounce = setTimeout(function () {
      self._renderedPages = {};
      self._renderPage(self._currentPage);
      if (self._currentPage > 1) self._renderPage(self._currentPage - 1);
      if (self._currentPage < self._totalPages) self._renderPage(self._currentPage + 1);
    }, 120);
  };

  /* =========================================================
     Wheel with Ctrl / Trackpad Pinch Zoom
  ========================================================= */
  PdfViewer.prototype._handleWheel = function (e) {
    if (!this._open) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      var delta = -e.deltaY;
      var factor = Math.exp(delta * 0.003);
      this.setZoom(this._zoomScale * factor, e.clientX, e.clientY);
    }
  };

  /* =========================================================
     Scroll & Page Tracking
  ========================================================= */
  PdfViewer.prototype._handleScroll = function () {
    if (!this._open || !this._scrollContainer || this._pageContainers.length === 0) return;

    var containerTop = this._scrollContainer.scrollTop;
    var containerHeight = this._scrollContainer.clientHeight;
    var centerY = containerTop + containerHeight / 2;

    var currentNum = 1;
    for (var i = 0; i < this._pageContainers.length; i++) {
      var p = this._pageContainers[i];
      var pTop = p.el.offsetTop;
      var pHeight = p.el.offsetHeight;
      if (centerY >= pTop && centerY <= pBottom) {
        currentNum = p.num;
        break;
      } else if (centerY < pTop) {
        currentNum = Math.max(1, p.num - 1);
        break;
      } else {
        currentNum = p.num;
      }
    }

    if (this._currentPage !== currentNum) {
      this._currentPage = currentNum;
      this._syncUI();
    }
  };

  PdfViewer.prototype.goToPage = function (pageNum) {
    pageNum = Math.max(1, Math.min(this._totalPages, pageNum));
    this._currentPage = pageNum;
    this._syncUI();

    var pObj = this._pageContainers[pageNum - 1];
    if (pObj && this._scrollContainer) {
      var targetScroll = pObj.el.offsetTop - 24;
      this._scrollContainer.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: 'smooth'
      });
    }
  };

  /* =========================================================
     Auto-dimming idle toolbar & controls
  ========================================================= */
  PdfViewer.prototype._setupIdleToolbar = function () {
    var self = this;
    var tb = this._toolbar;
    var overlay = this._overlay;

    function wake() {
      if (tb) tb.classList.remove('pv-tb-idle');
      if (self._topClose) self._topClose.classList.remove('pv-idle-dim');

      if (self._idleTimer) clearTimeout(self._idleTimer);
      self._idleTimer = setTimeout(function () {
        if (self._open) {
          if (tb) tb.classList.add('pv-tb-idle');
          if (self._topClose) self._topClose.classList.add('pv-idle-dim');
        }
      }, 2400);
    }

    overlay.addEventListener('mousemove', wake);
    overlay.addEventListener('touchstart', wake, { passive: true });
    overlay.addEventListener('click', wake);
    if (this._scrollContainer) {
      this._scrollContainer.addEventListener('scroll', wake, { passive: true });
    }
    if (tb) {
      tb.addEventListener('mouseenter', wake);
      tb.addEventListener('touchstart', wake, { passive: true });
    }
    wake();
  };

  /* =========================================================
     Fullscreen
  ========================================================= */
  PdfViewer.prototype._toggleFS = function () {
    var self = this;
    var doc = document;
    var docEl = doc.documentElement;
    var isFS = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;

    if (!isFS) {
      var rfs = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
      if (rfs) {
        var p = rfs.call(docEl);
        if (p && p.catch) {
          p.catch(function () {
            var orfs = self._overlay.requestFullscreen || self._overlay.webkitRequestFullscreen;
            if (orfs) orfs.call(self._overlay);
          });
        }
      }
    } else {
      var efs = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
      if (efs) efs.call(doc);
    }
  };

  PdfViewer.prototype._handleFS = function () {
    var doc = document;
    var isFS = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
    if (this._btnFS) {
      this._btnFS.innerHTML = isFS ? I.fsExit : I.fs;
      this._btnFS.title     = isFS ? 'Exit fullscreen' : 'Fullscreen';
    }
  };

  /* =========================================================
     Keyboard Shortcuts
  ========================================================= */
  PdfViewer.prototype._handleKey = function (e) {
    if (!this._open) return;

    if (e.key === 'Escape') {
      this.close();
    } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      this.goToPage(this._currentPage + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      this.goToPage(this._currentPage - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      this.goToPage(1);
    } else if (e.key === 'End') {
      e.preventDefault();
      this.goToPage(this._totalPages);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      this.setZoom(this._zoomScale + 0.2);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      this.setZoom(this._zoomScale - 0.2);
    } else if (e.key === '0') {
      e.preventDefault();
      this.setZoom(1.0);
    }
  };

  /* =========================================================
     UI Sync
  ========================================================= */
  PdfViewer.prototype._syncUI = function () {
    if (this._pageInput) this._pageInput.value = this._currentPage;
    if (this._pageTotal) this._pageTotal.textContent = '/ ' + (this._totalPages || '—');
  };

  /* =========================================================
     Static Factory & Auto-Initialization with User-Defined Hash
  ========================================================= */
  var _activeViewer = null;

  PdfViewer.open = function (pdfUrl, opts) {
    opts = opts || {};
    opts.pdfUrl = pdfUrl;
    if (_activeViewer) {
      _activeViewer.close();
    }
    _activeViewer = new PdfViewer(opts);
    _activeViewer.open();
    return _activeViewer;
  };

  PdfViewer.mount = function (triggerEl, pdfUrl, opts) {
    if (!triggerEl) return;
    opts = opts || {};
    opts.pdfUrl = pdfUrl || triggerEl.getAttribute('data-pdf-viewer') || triggerEl.getAttribute('data-pdf-url');
    opts.title = opts.title || triggerEl.getAttribute('data-pdf-title');

    var linkHref = triggerEl.getAttribute('href') || '';
    if (linkHref.startsWith('#') && linkHref.length > 1) {
      opts.hash = linkHref;
    } else if (triggerEl.getAttribute('data-pdf-hash')) {
      opts.hash = triggerEl.getAttribute('data-pdf-hash');
    }

    triggerEl.addEventListener('click', function (e) {
      e.preventDefault();
      PdfViewer.open(opts.pdfUrl, opts);
    });
  };

  PdfViewer.initAuto = function () {
    var triggers = document.querySelectorAll('[data-pdf-viewer], .btn-pdf-viewer');
    triggers.forEach(function (el) {
      var url = el.getAttribute('data-pdf-viewer') || el.getAttribute('data-pdf-url');
      if (url) {
        PdfViewer.mount(el, url);
      }
    });

    /* Deep Link Sharing: match current window.location.hash with user-defined button href */
    var currentHash = window.location.hash || '';
    if (currentHash && currentHash.length > 1) {
      var matchedTrigger = null;

      // 1. Exact match on button href (e.g. href="#paper", href="#the-window", href="#my-doc")
      triggers.forEach(function (el) {
        var btnHref = el.getAttribute('href') || '';
        var btnHash = el.getAttribute('data-pdf-hash') || '';
        if (btnHref.toLowerCase() === currentHash.toLowerCase() ||
            (btnHash && ('#' + btnHash.toLowerCase()) === currentHash.toLowerCase())) {
          matchedTrigger = el;
        }
      });

      // 2. Generic fallback if URL has #pdf and page has a PDF viewer button
      if (!matchedTrigger && currentHash.toLowerCase().indexOf('pdf') !== -1 && triggers.length > 0) {
        matchedTrigger = triggers[0];
      }

      if (matchedTrigger) {
        var pdfUrl = matchedTrigger.getAttribute('data-pdf-viewer') || matchedTrigger.getAttribute('data-pdf-url');
        if (pdfUrl) {
          setTimeout(function () {
            PdfViewer.open(pdfUrl, {
              hash: currentHash,
              title: matchedTrigger.getAttribute('data-pdf-title')
            });
          }, 80);
        }
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', PdfViewer.initAuto);
  } else {
    PdfViewer.initAuto();
  }

  global.PdfViewer = PdfViewer;

}(window));
