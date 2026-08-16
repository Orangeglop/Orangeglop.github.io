/**
 * FlipBook — Custom portfolio flipbook viewer
 * Vanilla JS, zero dependencies.
 *
 * Page model:
 *   _coverMode = true,  _page = 0  → cover (page 0) shown alone in right slot
 *   _coverMode = false, _page = 1  → spread: left=page1, right=page2
 *   _coverMode = false, _page = 3  → spread: left=page3, right=page4
 */
(function (global) {
  'use strict';

  /* =========================================================
     SVG Icons
  ========================================================= */
  function icon(d, s) {
    s = s || 20;
    return '<svg width="' + s + '" height="' + s +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
      ' stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  }
  var I = {
    prev   : icon('<polyline points="15 18 9 12 15 6"/>'),
    next   : icon('<polyline points="9 18 15 12 9 6"/>'),
    zoomIn   : icon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>'),
    zoomOut  : icon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>'),
    zoomReset: icon('<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M10 14l-7 7"/>'),
    fs       : icon('<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>'),
    fsExit : icon('<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>'),
    dl     : icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
    share  : icon('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
    check  : icon('<polyline points="20 6 9 17 4 12"/>'),
    close  : icon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
    book   : icon('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>', 16),
  };

  /* =========================================================
     DOM / image / toast helpers
  ========================================================= */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function mkBtn(cls, title, html) {
    var b = el('button', 'fb-btn' + (cls ? ' ' + cls : ''), html);
    b.type = 'button'; b.title = title; b.setAttribute('aria-label', title);
    return b;
  }

  function showToast(msg) {
    var existing = document.querySelector('.fb-toast');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    var toast = el('div', 'fb-toast', msg);
    document.body.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add('fb-toast-show');
    });
    setTimeout(function () {
      toast.classList.remove('fb-toast-show');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 2200);
  }

  var _imgCache = {};
  function loadImg(url) {
    if (_imgCache[url]) return _imgCache[url];
    _imgCache[url] = new Promise(function (res, rej) {
      var img = new Image();
      img.onload  = function () { res(img); };
      img.onerror = rej;
      img.src = url;
    });
    return _imgCache[url];
  }
  function prefetch(srcs, center, r) {
    var lo = Math.max(0, center - r), hi = Math.min(srcs.length - 1, center + r);
    for (var i = lo; i <= hi; i++) loadImg(srcs[i]);
  }

  /* =========================================================
     FlipBook
  ========================================================= */
  function FlipBook(opts) {
    this.id          = (opts.id || '').toLowerCase();
    this.source      = opts.source || [];
    this.downloadUrl = opts.downloadUrl || null;
    this.label       = opts.label || '';

    this._page       = 0;       // left-page index when in spread mode
    this._coverMode  = true;    // true: cover alone in right slot
    this._zoomLevel  = 1.0;
    this._panX       = 0;
    this._panY       = 0;
    this._animating  = false;
    this._activeAnim = null;
    this._open       = false;

    this._overlay    = null;
    this._toolbar    = null;
    this._idleTimer  = null;
    this._stage      = null;
    this._stageInner = null;
    this._book       = null;
    this._leftSlot   = null;
    this._rightSlot  = null;
    this._pageInput  = null;
    this._pageTotal  = null;
    this._btnFS      = null;

    this._onKey   = this._handleKey.bind(this);
    this._onFS    = this._handleFS.bind(this);
    this._onWheel = this._handleWheel.bind(this);
    this._onPop   = this._handlePop.bind(this);
    this._pushedHistory = false;

    this._buildDOM();
  }

  /* =========================================================
     Build DOM
  ========================================================= */
  FlipBook.prototype._buildDOM = function () {
    var self = this;

    var overlay = el('div', 'fb-overlay');
    this._overlay = overlay;

    var modal = el('div', 'fb-modal');

    /* ---- Toolbar ---- */
    var tb = el('div', 'fb-toolbar');
    this._toolbar = tb;

    var bPrev = mkBtn('', 'Previous page', I.prev);

    var pWrap = el('div', 'fb-page-wrap');
    var pIn   = el('input', 'fb-page-in');
    pIn.type  = 'text'; pIn.setAttribute('aria-label', 'Page number');
    var pTot  = el('span', 'fb-page-tot');
    pWrap.appendChild(pIn); pWrap.appendChild(pTot);
    this._pageInput = pIn; this._pageTotal = pTot;

    var bNext = mkBtn('', 'Next page', I.next);
    var s1    = el('div', 'fb-sep');
    var bZI   = mkBtn('', 'Zoom in',    I.zoomIn);
    var bZO   = mkBtn('', 'Zoom out',   I.zoomOut);
    var bZR   = mkBtn('', 'Reset zoom', I.zoomReset);
    var s2    = el('div', 'fb-sep');
    var bFS   = mkBtn('', 'Fullscreen', I.fs);
    this._btnFS = bFS;

    [bPrev, pWrap, bNext, s1, bZI, bZO, bZR, s2, bFS].forEach(function (e) { tb.appendChild(e); });

    if (this.downloadUrl) {
      var sDL = el('div', 'fb-sep');
      var dlA = el('a', 'fb-btn fb-dl', I.dl);
      dlA.href = this.downloadUrl; dlA.download = ''; dlA.target = '_blank';
      dlA.title = 'Download PDF'; dlA.setAttribute('aria-label', 'Download PDF');
      tb.appendChild(sDL); tb.appendChild(dlA);
    }

    var sShare = el('div', 'fb-sep');
    var bShare = mkBtn('fb-btn-share', 'Share / Copy link to portfolio', I.share);
    bShare.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      self.copyLink(bShare);
    });
    tb.appendChild(sShare);
    tb.appendChild(bShare);

    tb.appendChild(mkBtn('fb-close', 'Close', I.close));

    /* ---- Top Bar Controls ---- */
    var topClose = el('button', 'fb-top-close', I.close);
    topClose.type = 'button'; topClose.title = 'Close viewer (Esc)'; topClose.setAttribute('aria-label', 'Close viewer');
    topClose.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); self.close(); });
    this._topClose = topClose;

    /* ---- Desktop Nav Arrows ---- */
    var navPrev = el('button', 'fb-nav-arrow fb-nav-prev', I.prev);
    navPrev.type = 'button'; navPrev.title = 'Previous page (Left arrow)'; navPrev.setAttribute('aria-label', 'Previous page');
    navPrev.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); self._back(); navPrev.blur(); });
    var navNext = el('button', 'fb-nav-arrow fb-nav-next', I.next);
    navNext.type = 'button'; navNext.title = 'Next page (Right arrow)'; navNext.setAttribute('aria-label', 'Next page');
    navNext.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); self._forward(); navNext.blur(); });
    this._navPrev = navPrev;
    this._navNext = navNext;

    /* ---- Stage ---- */
    var stage = el('div', 'fb-stage');
    var si    = el('div', 'fb-stage-inner');
    this._stageInner = si;

    /* ---- Book ---- */
    var book = el('div', 'fb-book fb-cover-mode');
    this._book = book;

    var ls    = el('div', 'fb-slot fb-left');
    var rs    = el('div', 'fb-slot fb-right');
    this._leftSlot  = ls;
    this._rightSlot = rs;

    book.appendChild(ls);
    book.appendChild(rs);
    si.appendChild(book);
    stage.appendChild(si);

    modal.appendChild(topClose);
    modal.appendChild(navPrev);
    modal.appendChild(navNext);
    modal.appendChild(stage);
    modal.appendChild(tb);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    this._stage = stage;
    this._setupGestures();
    this._setupIdleToolbar();

    /* ---- Events ---- */
    tb.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    tb.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    tb.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });

    bPrev.addEventListener('click',  function (e) { e.preventDefault(); e.stopPropagation(); self._back();     });
    bNext.addEventListener('click',  function (e) { e.preventDefault(); e.stopPropagation(); self._forward();  });
    bZI.addEventListener('click',    function (e) { e.preventDefault(); e.stopPropagation(); self._doZoom(+1); });
    bZO.addEventListener('click',    function (e) { e.preventDefault(); e.stopPropagation(); self._doZoom(-1); });
    bZR.addEventListener('click',    function (e) { e.preventDefault(); e.stopPropagation(); self._resetZoom(); });
    bFS.addEventListener('click',    function (e) { e.preventDefault(); e.stopPropagation(); self._toggleFS(); });
    tb.querySelector('.fb-close').addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); self.close(); });

    pIn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var n = parseInt(pIn.value, 10); if (!isNaN(n)) self._jumpTo(n); }
    });
    pIn.addEventListener('blur', function () { self._syncUI(); });

    overlay.addEventListener('click', function (e) { if (e.target === overlay) self.close(); });
    overlay.addEventListener('dragstart', function (e) { e.preventDefault(); return false; });
  };

  /* =========================================================
     Open / Close, Copy Link & Browser History Integration
  ========================================================= */
  FlipBook.prototype._handlePop = function () {
    if (this._open) {
      this._pushedHistory = false;
      this.close({ updateHistory: false });
    }
  };

  FlipBook.prototype.copyLink = function (btn) {
    var base = window.location.origin + window.location.pathname;
    var linkUrl = base + '#' + (this.id || 'portfolio');

    function onSuccess() {
      showToast('Portfolio link copied to clipboard!');
      if (btn) {
        var oldHtml = btn.innerHTML;
        btn.innerHTML = I.check;
        btn.classList.add('fb-copied');
        setTimeout(function () {
          btn.innerHTML = oldHtml;
          btn.classList.remove('fb-copied');
        }, 1800);
      }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(linkUrl).then(onSuccess).catch(function () {
        promptFallback();
      });
    } else {
      promptFallback();
    }

    function promptFallback() {
      var ta = document.createElement('textarea');
      ta.value = linkUrl;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        document.body.removeChild(ta);
        onSuccess();
      } catch (e) {
        document.body.removeChild(ta);
        prompt('Copy portfolio URL:', linkUrl);
      }
    }
  };

  FlipBook.prototype.open = function (options) {
    options = options || {};
    if (this._open) {
      if (typeof options.page === 'number' && options.page > 0) {
        this._jumpTo(options.page);
      }
      return;
    }
    var self = this;
    if (this._animating) this._finishAnim();
    this._open = true;
    this._page = 0; this._coverMode = true; this._zoomLevel = 1.0;
    this._panX = 0; this._panY = 0;
    this._stageInner.style.transform = '';
    this._book.classList.add('fb-cover-mode');
    this._putSlot(this._leftSlot,  -1);   // blank (closed book back)
    this._putSlot(this._rightSlot,  0);   // cover image
    this._syncUI();
    document.body.appendChild(this._overlay);
    this._overlay.classList.add('fb-open');
    document.body.style.overflow = 'hidden';

    /* URL & History sync */
    if (options.updateHistory !== false && this.id) {
      var targetHash = '#' + this.id;
      var curHash = (window.location.hash || '').toLowerCase();
      if (curHash !== targetHash) {
        if (window.history && window.history.pushState) {
          try {
            window.history.pushState({ flipbookId: this.id, flipbookOpen: true }, '', targetHash);
            this._pushedHistory = true;
          } catch (err) {}
        } else {
          window.location.hash = targetHash;
        }
      }
    }

    if (typeof options.page === 'number' && options.page > 1) {
      this._jumpTo(options.page);
    }

    document.addEventListener('keydown', this._onKey);
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(function (ev) {
      document.addEventListener(ev, self._onFS);
    });
    this._overlay.addEventListener('wheel', this._onWheel, { passive: false });
    prefetch(this.source, 0, 5);
  };

  FlipBook.prototype.close = function (options) {
    options = options || {};
    if (!this._open) return;
    var self = this;
    if (this._animating) this._finishAnim();
    this._open = false;
    this._overlay.classList.remove('fb-open');
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._resetZoom();
    document.body.style.overflow = '';
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }

    if (options.updateHistory !== false) {
      var curHash = (window.location.hash || '').toLowerCase();
      if (this.id && curHash.indexOf(this.id) !== -1) {
        if (this._pushedHistory && window.history && window.history.back) {
          this._pushedHistory = false;
          try {
            window.history.back();
          } catch (err) {}
        } else if (window.history && window.history.replaceState) {
          var cleanUrl = window.location.pathname + window.location.search;
          window.history.replaceState(null, '', cleanUrl);
        } else {
          window.location.hash = '';
        }
      }
    }

    document.removeEventListener('keydown', this._onKey);
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(function (ev) {
      document.removeEventListener(ev, self._onFS);
    });
    this._overlay.removeEventListener('wheel', this._onWheel);
    var isFS = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    if (isFS) {
      var efs = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
      if (efs) efs.call(document);
    }
  };

  FlipBook.prototype.mount = function (trigger) {
    var self = this;
    trigger.addEventListener('click', function () { self.open(); });
    trigger.setAttribute('tabindex', '0');
    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.open(); }
    });
  };

  /* =========================================================
     Slot loader
  ========================================================= */
  FlipBook.prototype._putSlot = function (slot, idx) {
    slot.innerHTML = '';
    if (idx < 0 || idx >= this.source.length) return; // leave blank
    var spinner = el('div', 'fb-spinner');
    slot.appendChild(spinner);
    loadImg(this.source[idx]).then(function (img) {
      if (!slot.contains(spinner)) return; // stale
      slot.innerHTML = '';
      var im = el('img', 'fb-pg');
      im.src = img.src; im.alt = 'Page ' + (idx + 1); im.draggable = false;
      slot.appendChild(im);
    }).catch(function () {
      if (slot.contains(spinner)) slot.innerHTML = '';
    });
  };

  /* =========================================================
     Flip animation core
     side: 'right' → right-half page peels left  (forward)
           'left'  → left-half page peels right  (backward)
     frontIdx: image on the front face (departing page)
     backIdx:  image on the back face  (arriving page)
     done: called when animation ends (slot post-loading goes here)
     onStart: optional callback triggered when animation starts
  ========================================================= */
  FlipBook.prototype._finishAnim = function () {
    if (!this._activeAnim) return;
    var anim = this._activeAnim;
    this._activeAnim = null;
    this._animating = false;
    anim.cancelled = true;
    if (anim.timer) clearTimeout(anim.timer);
    if (anim.flipper && this._book.contains(anim.flipper)) {
      this._book.removeChild(anim.flipper);
    }
    if (anim.onStart) anim.onStart();
    if (anim.done) anim.done();
  };

  FlipBook.prototype._animate = function (side, frontIdx, backIdx, done, onStart) {
    var self = this;
    var DURATION = 240; // ms — matches CSS animation-duration

    if (this._activeAnim) {
      this._finishAnim();
    }

    this._animating = true;

    var anim = {
      cancelled: false,
      flipper: null,
      timer: null,
      done: done,
      onStart: onStart
    };
    this._activeAnim = anim;

    var fp = (frontIdx >= 0 && frontIdx < this.source.length)
      ? loadImg(this.source[frontIdx]) : Promise.resolve(null);
    var bp = (backIdx  >= 0 && backIdx  < this.source.length)
      ? loadImg(this.source[backIdx])  : Promise.resolve(null);

    Promise.all([fp, bp]).then(function (imgs) {
      if (anim.cancelled) return;

      var flipper = el('div', 'fb-flipper fb-flipper-' + side);
      anim.flipper = flipper;

      /* Front face */
      var front = el('div', 'fb-face fb-face-front');
      if (imgs[0]) { var fi = el('img', 'fb-pg'); fi.src = imgs[0].src; fi.draggable = false; front.appendChild(fi); }
      flipper.appendChild(front);

      /* Back face */
      var back = el('div', 'fb-face fb-face-back');
      if (imgs[1]) { var bi = el('img', 'fb-pg'); bi.src = imgs[1].src; bi.draggable = false; back.appendChild(bi); }
      flipper.appendChild(back);

      self._book.appendChild(flipper);

      /* Trigger CSS animation on next frame */
      requestAnimationFrame(function () {
        if (anim.cancelled) return;
        requestAnimationFrame(function () {
          if (anim.cancelled) return;
          flipper.classList.add('fb-go');
          if (onStart) onStart();
        });
      });

      anim.timer = setTimeout(function () {
        if (self._activeAnim === anim) {
          self._activeAnim = null;
          self._animating = false;
        }
        if (self._book.contains(flipper)) self._book.removeChild(flipper);
        if (done) done();
      }, DURATION);
    });
  };

  /* =========================================================
     Navigation — Forward
     Slot update strategy:
       • Pre-load the slot that will be REVEALED when the flipper
         passes the spine (opposite side from the flipper).
       • Post-load (in callback) the slot that was hidden UNDER
         the flipper's back face throughout the animation.
  ========================================================= */
  FlipBook.prototype._forward = function () {
    var total = this.source.length;
    this._resetZoom();

    if (this._animating) {
      this._finishAnim();
    }

    if (this._coverMode) {
      if (total < 2) return;
      var self = this;
      this._putSlot(this._rightSlot, 2);  // pre-load page 3 (index 2) under cover flipper
      this._animate('right', 0, 1, function () {
        self._putSlot(self._leftSlot, 1);
        self._coverMode = false;
        self._page = 1;
        self._book.classList.remove('fb-cover-mode');
        self._syncUI();
        prefetch(self.source, 1, 6);
      }, function () {
        self._book.classList.remove('fb-cover-mode');
      });
    } else {
      var nl = this._page + 2; // next-left index
      if (nl >= total) return;
      var nr = nl + 1;
      var self = this;
      this._putSlot(this._rightSlot, nr);  // pre-load new right
      this._animate('right', this._page + 1, nl, function () {
        self._putSlot(self._leftSlot, nl); // post-load new left
        self._page = nl;
        self._syncUI();
        prefetch(self.source, nl, 6);
      });
    }
  };

  /* =========================================================
     Navigation — Backward
  ========================================================= */
  FlipBook.prototype._back = function () {
    this._resetZoom();

    if (this._animating) {
      this._finishAnim();
    }

    var self = this;

    if (!this._coverMode && this._page === 1) {
      /* First spread → cover: flip left page over to the right & slide book to center cover */
      this._putSlot(this._leftSlot, -1);   // blank left slot underneath
      this._animate('left', 1, 0, function () {
        self._putSlot(self._rightSlot, 0); // put cover in right slot
        self._coverMode = true;
        self._page = 0;
        self._book.classList.add('fb-cover-mode');
        self._syncUI();
      }, function () {
        self._book.classList.add('fb-cover-mode');
      });
    } else if (!this._coverMode && this._page > 1) {
      var pl = this._page - 2; // prev-left index
      var pr = this._page - 1; // prev-right index
      this._putSlot(this._leftSlot, pl);   // pre-load new left (revealed as flipper peels away)
      this._animate('left', this._page, pr, function () {
        self._putSlot(self._rightSlot, pr); // post-load new right
        self._page = pl;
        self._syncUI();
        prefetch(self.source, pl, 6);
      });
    }
  };

  /* =========================================================
     Jump to page (1-indexed, as shown to user)
  ========================================================= */
  FlipBook.prototype._jumpTo = function (pageNum) {
    this._resetZoom();
    if (this._animating) this._finishAnim();
    pageNum = Math.max(1, Math.min(this.source.length, pageNum));

    if (pageNum === 1) {
      this._coverMode = true; this._page = 0;
      this._book.classList.add('fb-cover-mode');
      this._putSlot(this._leftSlot,  -1);
      this._putSlot(this._rightSlot,  0);
    } else {
      var idx = pageNum - 1;
      if (idx % 2 === 0) idx = Math.max(1, idx - 1); // snap to spread boundary
      this._coverMode = false; this._page = idx;
      this._book.classList.remove('fb-cover-mode');
      this._putSlot(this._leftSlot,  idx);
      this._putSlot(this._rightSlot, idx + 1);
    }
    this._syncUI();
    prefetch(this.source, pageNum - 1, 4);
  };

  /* =========================================================
     Zoom & Pan Transformation
  ========================================================= */
  FlipBook.prototype._isDefaultView = function () {
    return Math.abs(this._zoomLevel - 1.0) < 0.05 &&
           Math.abs(this._panX) < 5 &&
           Math.abs(this._panY) < 5;
  };

  FlipBook.prototype._clampPan = function () {
    if (!this._stage) return;
    var rect = this._stage.getBoundingClientRect();
    var stageW = rect.width || window.innerWidth;
    var stageH = rect.height || window.innerHeight;

    var limitX = Math.max(0, (stageW * this._zoomLevel - stageW) / 2) + stageW * 0.2;
    var limitY = Math.max(0, (stageH * this._zoomLevel - stageH) / 2) + stageH * 0.2;

    this._panX = Math.max(-limitX, Math.min(limitX, this._panX));
    this._panY = Math.max(-limitY, Math.min(limitY, this._panY));
  };

  FlipBook.prototype._applyTransform = function (smooth) {
    this._stageInner.style.transition = smooth
      ? 'transform 0.24s cubic-bezier(0.645, 0.045, 0.355, 1.000)'
      : 'none';
    if (this._isDefaultView()) {
      this._stageInner.style.transform = '';
      if (this._stage) this._stage.classList.remove('fb-grab', 'fb-grabbing');
    } else {
      this._stageInner.style.transform =
        'translate(' + this._panX.toFixed(1) + 'px, ' + this._panY.toFixed(1) + 'px) scale(' + this._zoomLevel.toFixed(3) + ')';
      if (this._stage && !this._stage.classList.contains('fb-grabbing')) {
        this._stage.classList.add('fb-grab');
      }
    }
  };

  FlipBook.prototype._resetZoom = function () {
    if (this._isDefaultView()) return;
    this._zoomLevel = 1.0;
    this._panX = 0;
    this._panY = 0;
    this._applyTransform(true);
  };

  FlipBook.prototype._setZoom = function (val, smooth, anchorX, anchorY) {
    var targetZoom = Math.max(0.5, Math.min(5.0, val));
    var oldZoom = this._zoomLevel;

    if (this._stage && anchorX !== undefined && anchorY !== undefined && oldZoom > 0 && oldZoom !== targetZoom) {
      var rect = this._stage.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var sx = anchorX - cx;
      var sy = anchorY - cy;
      var ratio = targetZoom / oldZoom;

      this._panX = sx - (sx - this._panX) * ratio;
      this._panY = sy - (sy - this._panY) * ratio;
    }

    this._zoomLevel = targetZoom;
    this._clampPan();
    this._applyTransform(smooth);
  };

  FlipBook.prototype._doZoom = function (direction) {
    var mult = direction > 0 ? 1.45 : (1 / 1.45);
    var rect = this._stage ? this._stage.getBoundingClientRect() : null;
    var cx = rect ? (rect.left + rect.width / 2) : (window.innerWidth / 2);
    var cy = rect ? (rect.top + rect.height / 2) : (window.innerHeight / 2);
    this._setZoom(this._zoomLevel * mult, true, cx, cy);
  };

  FlipBook.prototype._handleWheel = function (e) {
    e.preventDefault();
    var delta = -e.deltaY;
    if (e.deltaMode === 1) delta *= 20;
    else if (e.deltaMode === 2) delta *= 600;

    var clampedDelta = Math.max(-120, Math.min(120, delta));
    var factor = Math.exp(clampedDelta * 0.0022);
    this._setZoom(this._zoomLevel * factor, false, e.clientX, e.clientY);
  };

  /* =========================================================
     Gestures (Pinch to Zoom, Pan Image, Swipe to Flip)
  ========================================================= */
  FlipBook.prototype._setupGestures = function () {
    var self = this;
    var stage = this._stage;
    if (!stage) return;

    var initialPinchDist = 0;
    var initialZoom = 1.0;
    var isPinching = false;
    var isTouchPanning = false;
    var isSwiping = false;
    var touchStartX = 0;
    var touchStartY = 0;
    var touchEndX = 0;
    var touchEndY = 0;
    var panTouchStartX = 0;
    var panTouchStartY = 0;
    var touchStartTime = 0;

    function getDist(t1, t2) {
      return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    }

    stage.addEventListener('touchstart', function (e) {
      if (!self._open) return;

      if (e.touches.length === 2) {
        // Two-finger pinch
        isPinching = true;
        isTouchPanning = false;
        isSwiping = false;
        initialPinchDist = getDist(e.touches[0], e.touches[1]);
        initialZoom = self._zoomLevel;
      } else if (e.touches.length === 1) {
        isPinching = false;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchEndX = touchStartX;
        touchEndY = touchStartY;
        touchStartTime = Date.now();

        if (!self._isDefaultView()) {
          // Pan mode when zoomed or panned away from default
          isTouchPanning = true;
          isSwiping = false;
          panTouchStartX = touchStartX - self._panX;
          panTouchStartY = touchStartY - self._panY;
        } else {
          // Swipe mode strictly at default zoom AND default pan
          isTouchPanning = false;
          isSwiping = true;
        }
      }
    }, { passive: false });

    stage.addEventListener('touchmove', function (e) {
      if (!self._open) return;

      if (isPinching && e.touches.length === 2) {
        if (e.cancelable) e.preventDefault();
        var currentDist = getDist(e.touches[0], e.touches[1]);
        if (initialPinchDist > 0) {
          var ratio = currentDist / initialPinchDist;
          var midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          var midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          self._setZoom(initialZoom * ratio, false, midX, midY);
        }
      } else if (isTouchPanning && e.touches.length === 1) {
        if (e.cancelable) e.preventDefault();
        self._panX = e.touches[0].clientX - panTouchStartX;
        self._panY = e.touches[0].clientY - panTouchStartY;
        self._clampPan();
        self._applyTransform(false);
      } else if (isSwiping && e.touches.length === 1) {
        touchEndX = e.touches[0].clientX;
        touchEndY = e.touches[0].clientY;
        var dx = touchEndX - touchStartX;
        var dy = touchEndY - touchStartY;
        if (Math.abs(dx) > Math.abs(dy) && e.cancelable) {
          e.preventDefault();
        }
      }
    }, { passive: false });

    function onTouchEnd(e) {
      if (!self._open) return;

      if (isPinching) {
        if (e.touches.length < 2) {
          isPinching = false;
          initialPinchDist = 0;
        }
      } else if (isTouchPanning) {
        if (e.touches.length === 0) {
          isTouchPanning = false;
        }
      } else if (isSwiping) {
        isSwiping = false;
        if (!self._isDefaultView()) return; // only allow swipe to flip at default zoom and default pan

        if (e.changedTouches && e.changedTouches.length > 0) {
          touchEndX = e.changedTouches[0].clientX;
          touchEndY = e.changedTouches[0].clientY;
        }
        var dt = Date.now() - touchStartTime;
        var dx = touchEndX - touchStartX;
        var dy = touchEndY - touchStartY;

        if (Math.abs(dx) >= 30 && Math.abs(dx) >= Math.abs(dy) * 0.75 && dt < 700) {
          if (dx < 0) {
            self._forward();
          } else {
            self._back();
          }
        }
      }
    }

    stage.addEventListener('touchend', onTouchEnd, { passive: false });
    stage.addEventListener('touchcancel', onTouchEnd, { passive: false });

    /* Desktop mouse pan & swipe drag */
    var mouseStartX = 0;
    var mouseStartY = 0;
    var mouseEndX = 0;
    var mouseEndY = 0;
    var mousePanStartX = 0;
    var mousePanStartY = 0;
    var mouseStartTime = 0;
    var isMouseDown = false;
    var isMousePanning = false;

    stage.addEventListener('dragstart', function (e) { e.preventDefault(); return false; });

    stage.addEventListener('mousedown', function (e) {
      if (!self._open) return;
      if (e.target.closest('.fb-btn, .fb-toolbar, .fb-top-close, .fb-nav-arrow, input, a')) return;
      e.preventDefault();
      self._hasMoved = false;
      isMouseDown = true;
      mouseStartX = e.clientX;
      mouseStartY = e.clientY;
      mouseEndX = mouseStartX;
      mouseEndY = mouseStartY;
      mouseStartTime = Date.now();

      if (!self._isDefaultView()) {
        isMousePanning = true;
        mousePanStartX = e.clientX - self._panX;
        mousePanStartY = e.clientY - self._panY;
        stage.classList.remove('fb-grab');
        stage.classList.add('fb-grabbing');
      } else {
        isMousePanning = false;
      }
    });

    window.addEventListener('mousemove', function (e) {
      if (!self._open || !isMouseDown) return;
      mouseEndX = e.clientX;
      mouseEndY = e.clientY;
      if (Math.abs(mouseEndX - mouseStartX) > 8 || Math.abs(mouseEndY - mouseStartY) > 8) {
        self._hasMoved = true;
      }
      if (isMousePanning) {
        e.preventDefault();
        self._panX = e.clientX - mousePanStartX;
        self._panY = e.clientY - mousePanStartY;
        self._clampPan();
        self._applyTransform(false);
      }
    });

    window.addEventListener('mouseup', function (e) {
      if (!self._open || !isMouseDown) return;
      isMouseDown = false;
      var dx = (e.clientX || mouseEndX) - mouseStartX;
      var dy = (e.clientY || mouseEndY) - mouseStartY;
      if (Math.abs(dx) <= 8 && Math.abs(dy) <= 8) {
        self._hasMoved = false;
      }
      if (isMousePanning) {
        isMousePanning = false;
        stage.classList.remove('fb-grabbing');
        if (!self._isDefaultView()) stage.classList.add('fb-grab');
      } else {
        if (!self._isDefaultView()) return; // only allow swipe to flip at default zoom and default pan

        var dt = Date.now() - mouseStartTime;
        if (Math.abs(dx) >= 35 && Math.abs(dx) >= Math.abs(dy) * 0.75 && dt < 700) {
          if (dx < 0) {
            self._forward();
          } else {
            self._back();
          }
        }
      }
    });
  };

  /* =========================================================
     Auto-dimming idle toolbar & controls
  ========================================================= */
  FlipBook.prototype._setupIdleToolbar = function () {
    var self = this;
    var tb = this._toolbar;
    var overlay = this._overlay;

    function wake() {
      if (tb) tb.classList.remove('fb-tb-idle');
      if (self._topClose) self._topClose.classList.remove('fb-idle-dim');
      if (self._navPrev) self._navPrev.classList.remove('fb-idle-dim');
      if (self._navNext) self._navNext.classList.remove('fb-idle-dim');

      if (self._idleTimer) clearTimeout(self._idleTimer);
      self._idleTimer = setTimeout(function () {
        if (self._open) {
          if (tb) tb.classList.add('fb-tb-idle');
          if (self._topClose) self._topClose.classList.add('fb-idle-dim');
          if (self._navPrev) self._navPrev.classList.add('fb-idle-dim');
          if (self._navNext) self._navNext.classList.add('fb-idle-dim');
        }
      }, 2400);
    }

    overlay.addEventListener('mousemove', wake);
    overlay.addEventListener('touchstart', wake, { passive: true });
    overlay.addEventListener('click', wake);
    if (tb) {
      tb.addEventListener('mouseenter', wake);
      tb.addEventListener('touchstart', wake, { passive: true });
    }
    wake();
  };

  /* =========================================================
     Fullscreen
  ========================================================= */
  FlipBook.prototype._toggleFS = function () {
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
  FlipBook.prototype._handleFS = function () {
    var doc = document;
    var isFS = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
    if (this._btnFS) {
      this._btnFS.innerHTML = isFS ? I.fsExit : I.fs;
      this._btnFS.title     = isFS ? 'Exit fullscreen' : 'Fullscreen';
    }
  };

  /* =========================================================
     Keyboard
  ========================================================= */
  FlipBook.prototype._handleKey = function (e) {
    if (!this._open) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown')  this._forward();
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this._back();
    else if (e.key === 'Escape')                           this.close();
  };

  /* =========================================================
     UI sync
  ========================================================= */
  FlipBook.prototype._syncUI = function () {
    var disp = this._coverMode ? 1 : this._page + 1;
    if (this._pageInput) this._pageInput.value = disp;
    if (this._pageTotal) this._pageTotal.textContent = '/ ' + this.source.length;
  };

  /* =========================================================
     Static: thumbnail card builder & Router
  ========================================================= */
  FlipBook.instances = {};
  FlipBook.list = [];

  FlipBook.register = function (fb) {
    if (fb && fb.id) {
      FlipBook.instances[fb.id.toLowerCase()] = fb;
    }
    FlipBook.list.push(fb);
  };

  FlipBook.parseRoute = function () {
    var hash = (window.location.hash || '').replace(/^#\/?/, '').trim().toLowerCase();
    var params = null;
    try {
      params = new URLSearchParams(window.location.search);
    } catch (e) {}

    var pParam = params ? (params.get('portfolio') || params.get('p') || '').trim().toLowerCase() : '';
    var pageParam = params ? parseInt(params.get('page') || params.get('pg'), 10) : NaN;

    var targetId = '';
    var targetPage = !isNaN(pageParam) && pageParam > 0 ? pageParam : 1;

    if (pParam) {
      targetId = pParam;
    } else if (hash) {
      // Support formats: urban, urban/5, urban:5, urban-5, portfolio-urban, fb-urban-host
      var parts = hash.split(/[/:]/);
      var rawId = parts[0].replace(/^portfolio-|^fb-|-host$/g, '');
      if (parts.length > 1) {
        var p = parseInt(parts[1], 10);
        if (!isNaN(p) && p > 0) targetPage = p;
      }
      targetId = rawId;
    }

    return {
      id: targetId,
      page: targetPage
    };
  };

  FlipBook.checkRoute = function () {
    var route = FlipBook.parseRoute();
    var matched = null;

    if (route.id) {
      for (var key in FlipBook.instances) {
        if (key === route.id || route.id.indexOf(key) !== -1 || key.indexOf(route.id) !== -1) {
          matched = FlipBook.instances[key];
          break;
        }
      }
      if (!matched) {
        for (var i = 0; i < FlipBook.list.length; i++) {
          var fb = FlipBook.list[i];
          var id = (fb.id || '').toLowerCase();
          var label = (fb.label || '').toLowerCase();
          if (id === route.id || label === route.id || (id && route.id.indexOf(id) !== -1)) {
            matched = fb;
            break;
          }
        }
      }
    }

    if (matched) {
      for (var j = 0; j < FlipBook.list.length; j++) {
        var other = FlipBook.list[j];
        if (other !== matched && other._open) {
          other.close({ updateHistory: false });
        }
      }
      matched.open({ page: route.page, updateHistory: false });
    } else {
      var rawHash = (window.location.hash || '').toLowerCase();
      if (!rawHash || rawHash === '#' || rawHash === '#!' || rawHash === '#top') {
        for (var k = 0; k < FlipBook.list.length; k++) {
          if (FlipBook.list[k]._open) {
            FlipBook.list[k].close({ updateHistory: false });
          }
        }
      }
    }
  };

  window.addEventListener('popstate', function () {
    FlipBook.checkRoute();
  });
  window.addEventListener('hashchange', function () {
    FlipBook.checkRoute();
  });

  FlipBook.buildThumb = function (opts) {
    var container = document.getElementById(opts.containerId);
    if (!container) return;

    var fbId = (opts.id || opts.containerId.replace(/^fb-|-host$/g, '') || opts.label || '').toLowerCase();

    var thumb = el('div', 'fb-thumb');
    thumb.setAttribute('role', 'button');
    thumb.setAttribute('aria-label', 'Open ' + opts.label + ' flipbook');
    thumb.setAttribute('data-flipbook-id', fbId);

    /* Clean Card wrapper */
    var card = el('div', 'fb-thumb-card');
    var cImg = el('img', 'fb-thumb-cover');
    cImg.src = opts.thumb; cImg.alt = opts.label; cImg.draggable = false;
    card.appendChild(cImg);

    /* Centered Title */
    var title = el('div', 'fb-thumb-title', opts.label);

    thumb.appendChild(card);
    thumb.appendChild(title);
    container.appendChild(thumb);

    var fb = new FlipBook({
      id:          fbId,
      source:      opts.source,
      downloadUrl: opts.downloadUrl,
      label:       opts.label,
    });
    fb.mount(thumb);
    FlipBook.register(fb);

    if (FlipBook._routeTimer) clearTimeout(FlipBook._routeTimer);
    FlipBook._routeTimer = setTimeout(function () {
      FlipBook.checkRoute();
    }, 20);

    return fb;
  };

  global.FlipBook = FlipBook;

}(window));
