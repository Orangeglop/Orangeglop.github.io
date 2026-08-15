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
    zoomIn : icon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>'),
    zoomOut: icon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>'),
    fs     : icon('<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>'),
    fsExit : icon('<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>'),
    dl     : icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
    close  : icon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
    book   : icon('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>', 16),
  };

  /* =========================================================
     DOM / image helpers
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
    this.source      = opts.source || [];
    this.downloadUrl = opts.downloadUrl || null;
    this.label       = opts.label || '';

    this._page       = 0;       // left-page index when in spread mode
    this._coverMode  = true;    // true: cover alone in right slot
    this._zoomLevel  = 1.0;
    this._animating  = false;
    this._pendingFlip = null;  // 'forward' | 'back' | null — queued click during animation
    this._open       = false;

    this._overlay    = null;
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

    var bPrev = mkBtn('', 'Previous page', I.prev);

    var pWrap = el('div', 'fb-page-wrap');
    var pIn   = el('input', 'fb-page-in');
    pIn.type  = 'text'; pIn.setAttribute('aria-label', 'Page number');
    var pTot  = el('span', 'fb-page-tot');
    pWrap.appendChild(pIn); pWrap.appendChild(pTot);
    this._pageInput = pIn; this._pageTotal = pTot;

    var bNext = mkBtn('', 'Next page', I.next);
    var s1    = el('div', 'fb-sep');
    var bZI   = mkBtn('', 'Zoom in',   I.zoomIn);
    var bZO   = mkBtn('', 'Zoom out',  I.zoomOut);
    var s2    = el('div', 'fb-sep');
    var bFS   = mkBtn('', 'Fullscreen', I.fs);
    this._btnFS = bFS;

    [bPrev, pWrap, bNext, s1, bZI, bZO, s2, bFS].forEach(function (e) { tb.appendChild(e); });

    if (this.downloadUrl) {
      var sDL = el('div', 'fb-sep');
      var dlA = el('a', 'fb-btn fb-dl', I.dl);
      dlA.href = this.downloadUrl; dlA.download = ''; dlA.target = '_blank';
      dlA.title = 'Download PDF'; dlA.setAttribute('aria-label', 'Download PDF');
      tb.appendChild(sDL); tb.appendChild(dlA);
    }

    tb.appendChild(mkBtn('fb-close', 'Close', I.close));

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
    modal.appendChild(tb);
    modal.appendChild(stage);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    /* ---- Events ---- */
    bPrev.addEventListener('click',  function () { self._back();     });
    bNext.addEventListener('click',  function () { self._forward();  });
    bZI.addEventListener('click',    function () { self._doZoom(+0.2); });
    bZO.addEventListener('click',    function () { self._doZoom(-0.2); });
    bFS.addEventListener('click',    function () { self._toggleFS(); });
    tb.querySelector('.fb-close').addEventListener('click', function () { self.close(); });

    pIn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var n = parseInt(pIn.value, 10); if (!isNaN(n)) self._jumpTo(n); }
    });
    pIn.addEventListener('blur', function () { self._syncUI(); });

    overlay.addEventListener('click', function (e) { if (e.target === overlay) self.close(); });
  };

  /* =========================================================
     Open / Close
  ========================================================= */
  FlipBook.prototype.open = function () {
    if (this._open) return;
    this._open = true;
    this._page = 0; this._coverMode = true; this._zoomLevel = 1.0;
    this._stageInner.style.transform = '';
    this._book.classList.add('fb-cover-mode');
    this._putSlot(this._leftSlot,  -1);   // blank (closed book back)
    this._putSlot(this._rightSlot,  0);   // cover image
    this._syncUI();
    this._overlay.classList.add('fb-open');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', this._onKey);
    document.addEventListener('fullscreenchange', this._onFS);
    this._overlay.addEventListener('wheel', this._onWheel, { passive: false });
    prefetch(this.source, 0, 5);
  };

  FlipBook.prototype.close = function () {
    if (!this._open) return;
    this._open = false;
    this._overlay.classList.remove('fb-open');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', this._onKey);
    document.removeEventListener('fullscreenchange', this._onFS);
    this._overlay.removeEventListener('wheel', this._onWheel);
    if (document.fullscreenElement) document.exitFullscreen();
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
  FlipBook.prototype._animate = function (side, frontIdx, backIdx, done, onStart) {
    var self = this;
    var DURATION = 380; // ms — must match CSS animation-duration

    var fp = (frontIdx >= 0 && frontIdx < this.source.length)
      ? loadImg(this.source[frontIdx]) : Promise.resolve(null);
    var bp = (backIdx  >= 0 && backIdx  < this.source.length)
      ? loadImg(this.source[backIdx])  : Promise.resolve(null);

    Promise.all([fp, bp]).then(function (imgs) {
      var flipper = el('div', 'fb-flipper fb-flipper-' + side);

      /* Front face */
      var front = el('div', 'fb-face fb-face-front');
      if (imgs[0]) { var fi = el('img', 'fb-pg'); fi.src = imgs[0].src; fi.draggable = false; front.appendChild(fi); }
      flipper.appendChild(front);

      /* Back face */
      var back = el('div', 'fb-face fb-face-back');
      if (imgs[1]) { var bi = el('img', 'fb-pg'); bi.src = imgs[1].src; bi.draggable = false; back.appendChild(bi); }
      flipper.appendChild(back);

      self._book.appendChild(flipper);

      /* Trigger CSS animation on next frame (ensure initial state renders first) */
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          flipper.classList.add('fb-go');
          if (onStart) onStart();
        });
      });

      setTimeout(function () {
        if (self._book.contains(flipper)) self._book.removeChild(flipper);
        self._animating = false;
        if (done) done();
        /* Process any click that arrived during the animation */
        if (self._pendingFlip) {
          var pf = self._pendingFlip; self._pendingFlip = null;
          if (pf === 'forward') self._forward(); else self._back();
        }
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
    if (this._animating) { this._pendingFlip = 'forward'; return; }
    var self = this, total = this.source.length;

    if (this._coverMode) {
      if (total < 2) return;
      this._animating = true;
      this._putSlot(this._rightSlot, 2);  // pre-load page 3 (index 2) under cover flipper
      this._animate('right', 0, 1, function () {
        self._putSlot(self._leftSlot, 1);
        self._coverMode = false;
        self._page = 1;
        self._syncUI();
        prefetch(self.source, 1, 6);
      }, function () {
        self._book.classList.remove('fb-cover-mode');
      });
    } else {
      var nl = this._page + 2; // next-left index
      if (nl >= total) return;
      this._animating = true;
      var nr = nl + 1;
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
    if (this._animating) { this._pendingFlip = 'back'; return; }
    var self = this;

    if (!this._coverMode && this._page === 1) {
      /* First spread → cover: flip left page over to the right & slide book to center cover */
      this._animating = true;
      this._putSlot(this._leftSlot, -1);   // blank left slot underneath
      this._animate('left', 1, 0, function () {
        self._putSlot(self._rightSlot, 0); // put cover in right slot
        self._coverMode = true;
        self._page = 0;
        self._syncUI();
      }, function () {
        self._book.classList.add('fb-cover-mode');
      });
    } else if (!this._coverMode && this._page > 1) {
      this._animating = true;
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
    if (this._animating) return;
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
     Zoom (scroll-wheel + buttons)
  ========================================================= */
  FlipBook.prototype._doZoom = function (delta) {
    this._zoomLevel = Math.max(0.5, Math.min(4.0, this._zoomLevel + delta));
    this._stageInner.style.transform =
      this._zoomLevel === 1.0 ? '' : 'scale(' + this._zoomLevel.toFixed(3) + ')';
  };

  FlipBook.prototype._handleWheel = function (e) {
    e.preventDefault();
    /* Smooth out trackpad vs mouse wheel: cap single-event delta */
    var raw = e.deltaY;
    var d = raw > 0 ? -Math.min(Math.abs(raw), 100) : Math.min(Math.abs(raw), 100);
    this._doZoom(d * 0.0007);
  };

  /* =========================================================
     Fullscreen
  ========================================================= */
  FlipBook.prototype._toggleFS = function () {
    if (!document.fullscreenElement) {
      this._overlay.requestFullscreen && this._overlay.requestFullscreen();
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  };
  FlipBook.prototype._handleFS = function () {
    var fs = !!document.fullscreenElement;
    this._btnFS.innerHTML = fs ? I.fsExit : I.fs;
    this._btnFS.title     = fs ? 'Exit fullscreen' : 'Fullscreen';
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
     Static: thumbnail card builder
  ========================================================= */
  FlipBook.buildThumb = function (opts) {
    var container = document.getElementById(opts.containerId);
    if (!container) return;

    var thumb = el('div', 'fb-thumb');
    thumb.setAttribute('role', 'button');
    thumb.setAttribute('aria-label', 'Open ' + opts.label + ' flipbook');

    var cImg = el('img', 'fb-thumb-cover');
    cImg.src = opts.thumb; cImg.alt = opts.label; cImg.draggable = false;

    var lbl = el('div', 'fb-thumb-label');
    lbl.innerHTML = I.book + '<span>' + opts.label + '</span>';

    thumb.appendChild(cImg);
    thumb.appendChild(lbl);
    container.appendChild(thumb);

    var fb = new FlipBook({
      source:      opts.source,
      downloadUrl: opts.downloadUrl,
      label:       opts.label,
    });
    fb.mount(thumb);
    return fb;
  };

  global.FlipBook = FlipBook;

}(window));
