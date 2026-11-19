/* Landing page behaviour, no libraries:
   1. the hero scene: a C4 "zoom" from the system context to a sequence drawn inside the API container,
      a few keyframe states tweened by a small engine (camera = SVG viewBox);
   2. the live example window: tabs, and a guided tour that drives the real explorer through its API;
   3. copy buttons. */
(function () {
  'use strict';
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    if (text != null) e.textContent = text;
    return e;
  }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ======================================================================
     1. hero scene
     ====================================================================== */
  var svg = document.getElementById('zoom');
  if (svg) hero();

  function hero() {
    var BOX = {
      // its open title sits top right: the arrows from the people come down on the left
      sys: { kind: 'system', tag: 'SOFTWARE SYSTEM', name: 'Image Annotation Tool', sub: 'annotate · review · export', opens: true, titleRight: true },
      annotator: { kind: 'person', tag: 'PERSON', name: 'Annotator' },
      admin: { kind: 'person', tag: 'PERSON', name: 'Admin' },
      api: { kind: 'container hl', tag: 'CONTAINER · FASTAPI', name: 'API service', opens: true },
      web: { kind: 'container', tag: 'CONTAINER · REACT', name: 'Web app' },
      worker: { kind: 'container', tag: 'CONTAINER · RQ', name: 'Worker' },
      minio: { kind: 'store', tag: 'OBJECT STORE', name: 'MinIO' },
      pg: { kind: 'store', tag: 'DATA STORE', name: 'PostgreSQL' },
      redis: { kind: 'store', tag: 'QUEUE', name: 'Redis' },
      images: { kind: 'component', tag: 'COMPONENT', name: 'Images routes' },
      auth: { kind: 'component', tag: 'COMPONENT', name: 'Auth' },
      storage: { kind: 'component', tag: 'COMPONENT', name: 'Object storage' },
      models: { kind: 'component', tag: 'COMPONENT', name: 'ORM models' },
      queue: { kind: 'component', tag: 'COMPONENT', name: 'Job queue' }
    };
    // [from, to, visibility per step, label, style]
    var EDGES = [
      ['annotator', 'sys', [1, 0, 0, 0], 'draws boxes', 'accent'], ['admin', 'sys', [1, 0, 0, 0], 'uploads batches', 'accent'],
      // zoomed in (L3, ⇅), only the arrows of the API box stay: the rest would cut across it
      ['annotator', 'web', [0, 1, 0, 0], null, 'accent'], ['admin', 'web', [0, 1, 0, 0], null, 'accent'],
      ['web', 'api', [0, 1, 0, 1], 'REST /api'], ['web', 'images', [0, 0, 1, 0], 'POST /api/images'],
      ['api', 'minio', [0, 1, 0, 1]], ['api', 'pg', [0, 1, 0, 1], 'SQL'], ['api', 'redis', [0, 1, 0, 1], 'enqueue', 'dash'],
      ['redis', 'worker', [0, 1, 0, 0], 'jobs', 'dash'], ['worker', 'pg', [0, 1, 0, 0]],
      ['images', 'auth', [0, 0, 1, 0]], ['images', 'storage', [0, 0, 1, 0]], ['images', 'queue', [0, 0, 1, 0]], ['images', 'models', [0, 0, 1, 0]],
      ['models', 'pg', [0, 0, 1, 0]], ['queue', 'redis', [0, 0, 1, 0], null, 'dash']
    ];
    var PARTS = [['Web app', 'OUTSIDE', 1], ['Images routes', 'COMPONENT'], ['Auth', 'COMPONENT'], ['Object storage', 'COMPONENT'], ['ORM models', 'COMPONENT'], ['PostgreSQL', 'OUTSIDE', 1]];
    var MSGS = [[0, 1, 'POST /api/images'], [1, 2, 'require_role'], [1, 3, 'upload_image(key, bytes)'], [1, 4, 'add Image + Task'], [4, 5, 'INSERT · COMMIT'], [1, 0, '201 · image_ids', 1]];
    var CAPS = [
      ['L1 · System context', 'Who uses the system, and what it is.'],
      ['L2 · Containers', 'Open it: what runs, and what talks to what.'],
      ['L3 · Components', 'Open a container: the modules inside it, and their calls.'],
      ['⇅ Sequence inside the API', 'One scenario, drawn in place: an admin uploads a batch.']
    ];

    // keyframe states. R = [x, y, w, h, opacity, open]
    function R(x, y, w, h, o, open) { return [x, y, w, h, o == null ? 1 : o, open || 0]; }
    function H(cx, cy) { return R(cx - 40, cy - 18, 80, 36, 0); }
    var comps = ['images', 'auth', 'storage', 'models', 'queue'], conts = ['web', 'api', 'worker', 'minio', 'pg', 'redis'];
    function state(cam, seq, boxes, hideAt, compsAt) {
      var b = {};
      Object.keys(BOX).forEach(function (id) { b[id] = boxes[id] || (comps.indexOf(id) >= 0 && compsAt ? H(compsAt[0], compsAt[1]) : H(hideAt[0], hideAt[1])); });
      return { cam: cam, seq: seq, box: b };
    }
    var people = { annotator: R(470, 40, 240, 96), admin: R(890, 40, 240, 96) };
    function withPeople(o) { o.annotator = people.annotator; o.admin = people.admin; return o; }
    var S = [
      state([0, 0, 1600, 900], 0, withPeople({ sys: R(530, 330, 540, 190) }), [800, 425]),
      state([0, 0, 1600, 900], 0, withPeople({
        sys: R(120, 180, 1360, 690, 1, 1),
        web: R(200, 290, 280, 120), api: R(660, 290, 280, 120), worker: R(1120, 290, 280, 120),
        minio: R(200, 620, 280, 120), pg: R(660, 620, 280, 120), redis: R(1120, 620, 280, 120)
      }), [800, 425], [800, 350]),
      state([330, 200, 1120, 630], 0, withPeople({
        sys: R(40, 160, 1900, 1200, 1, 1),
        web: R(170, 420, 260, 120), api: R(540, 270, 880, 540, 1, 1), worker: R(1560, 300, 280, 120),
        minio: R(170, 900, 280, 120), pg: R(840, 920, 280, 120), redis: R(1560, 640, 280, 120),
        // a fan: the routes on the left call a column of four, so no arrow runs behind a box
        images: R(600, 500, 250, 104),
        auth: R(1040, 372, 250, 84), storage: R(1040, 472, 250, 84), queue: R(1040, 572, 250, 84), models: R(1040, 672, 250, 84)
      }), [800, 425])
    ];
    S[3] = JSON.parse(JSON.stringify(S[2])); S[3].seq = 1;
    comps.forEach(function (id) { S[3].box[id][4] = 0; });

    // ---------- scene graph ----------
    var defs = el('defs', {}, svg);
    [['zm', 'z-mk'], ['zm-a', 'z-mk-accent'], ['zm-t', 'z-mk-teal']].forEach(function (m) {
      var mk = el('marker', { id: m[0], viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0,0.5 L10,5 L0,9.5 z', 'class': m[1] }, mk);
    });
    var L0 = el('g', {}, svg), L1 = el('g', {}, svg), LE = el('g', {}, svg), L2 = el('g', {}, svg), LS = el('g', {}, svg), LL = el('g', {}, svg);
    var NODE = {};
    Object.keys(BOX).forEach(function (id) {
      var b = BOX[id], layer = id === 'sys' ? L0 : id === 'api' ? L1 : L2;
      var g = el('g', { 'class': 'z-box ' + b.kind }, layer), n = { g: g };
      n.closed = b.kind === 'store' ? el('path', { 'class': 'z-closed' }, g) : el('rect', { 'class': 'z-closed', rx: 12 }, g);
      if (b.kind === 'store') n.rim = el('path', { 'class': 'z-closed', fill: 'none' }, g);
      if (b.opens) n.open = el('rect', { 'class': 'z-open', rx: 20 }, g);
      n.ct = el('g', {}, g);
      el('text', { 'class': 'z-tag', 'text-anchor': 'middle', y: b.sub ? -22 : -12 }, n.ct, b.tag);
      el('text', { 'class': 'z-name', 'text-anchor': 'middle', y: b.sub ? 10 : 18 }, n.ct, b.name);
      if (b.sub) el('text', { 'class': 'z-sub', 'text-anchor': 'middle', y: 38 }, n.ct, b.sub);
      if (b.opens) {
        var anchor = b.titleRight ? 'end' : 'start';
        n.ot = el('g', {}, g);
        el('text', { 'class': 'z-tag', x: 28, y: 38, 'text-anchor': anchor }, n.ot, b.tag);
        el('text', { 'class': 'z-open-name', x: 28, y: 74, 'text-anchor': anchor }, n.ot, b.name);
        n.right = !!b.titleRight;
      }
      NODE[id] = n;
    });
    var EDGE = EDGES.map(function (e) {
      var p = el('path', { 'class': 'z-edge' + (e[4] ? ' ' + e[4] : ''), 'marker-end': 'url(#' + (e[4] === 'accent' ? 'zm-a' : 'zm') + ')' }, LE);
      var lab = null;
      if (e[3]) { lab = el('g', { 'class': 'z-lab' }, LL); el('rect', { rx: 6, height: 26 }, lab); el('text', { 'text-anchor': 'middle' }, lab, e[3]); }
      return { e: e, p: p, lab: lab };
    });
    // the sequence drawn inside the API box
    var seqG = el('g', {}, LS), chip = el('g', { 'class': 's-chip' }, seqG);
    el('rect', { rx: 8, width: 236, height: 36 }, chip); el('text', { x: 118, y: 24, 'text-anchor': 'middle' }, chip, '⇅ UPLOAD A BATCH');
    var lifeG = el('g', {}, seqG), cardG = el('g', {}, seqG), msgG = el('g', {}, seqG);
    var LIFE = PARTS.map(function (p) {
      var c = el('g', { 'class': 's-card' + (p[2] ? ' out' : '') }, cardG);
      var r = el('rect', { rx: 9, width: 128, height: 50 }, c);
      var t1 = el('text', { 'class': 's-tag', 'text-anchor': 'middle' }, c, p[1]), t2 = el('text', { 'text-anchor': 'middle' }, c, p[0]);
      return { c: c, r: r, t1: t1, t2: t2, line: el('line', { 'class': 's-life' }, lifeG) };
    });
    var MSG = MSGS.map(function (m, i) {
      var g = el('g', {}, msgG);
      return { m: m, g: g, bg: el('rect', { 'class': 's-lbl-bg', rx: 3, height: 20 }, g), t: el('text', { 'class': 's-lbl' }, g, m[2]),
        line: el('path', { 'class': 's-msg' + (m[3] ? ' reply' : ''), 'marker-end': 'url(#' + (m[3] ? 'zm-a' : 'zm-t') + ')' }, g),
        dot: el('circle', { 'class': 's-num', r: 11 }, g), num: el('text', { 'class': 's-num-t', 'text-anchor': 'middle' }, g, String(i + 1)) };
    });

    // ---------- rendering one state ----------
    function rectOf(st, id) { var b = st.box[id]; return { x: b[0], y: b[1], w: b[2], h: b[3], o: b[4] }; }
    function clipTo(r, px, py) {
      var cx = r.x + r.w / 2, cy = r.y + r.h / 2, dx = px - cx, dy = py - cy;
      if (!dx && !dy) return [cx, cy];
      var s = Math.min((r.w / 2 + 4) / Math.abs(dx || 1e-9), (r.h / 2 + 4) / Math.abs(dy || 1e-9));
      return [cx + dx * s, cy + dy * s];
    }
    function render(st, visK, seqClock) {
      svg.setAttribute('viewBox', st.cam.map(function (v) { return v.toFixed(1); }).join(' '));
      Object.keys(NODE).forEach(function (id) {
        var n = NODE[id], b = st.box[id], w = b[2], h = b[3], open = b[5];
        n.g.setAttribute('transform', 'translate(' + b[0].toFixed(1) + ',' + b[1].toFixed(1) + ')');
        n.g.setAttribute('opacity', b[4].toFixed(3));
        n.g.style.display = b[4] < 0.01 ? 'none' : '';
        if (n.rim) {
          var ry = 12;
          n.closed.setAttribute('d', 'M0,' + ry + ' a' + w / 2 + ',' + ry + ' 0 0 1 ' + w + ',0 v' + (h - 2 * ry) + ' a' + w / 2 + ',' + ry + ' 0 0 1 ' + (-w) + ',0 z');
          n.rim.setAttribute('d', 'M0,' + ry + ' a' + w / 2 + ',' + ry + ' 0 0 0 ' + w + ',0');
        } else { n.closed.setAttribute('width', w); n.closed.setAttribute('height', h); }
        n.closed.setAttribute('opacity', (1 - open).toFixed(3));
        if (n.open) {
          n.open.setAttribute('width', w); n.open.setAttribute('height', h); n.open.setAttribute('opacity', open.toFixed(3)); n.ot.setAttribute('opacity', open.toFixed(3));
          if (n.right) for (var c = n.ot.firstChild; c; c = c.nextSibling) c.setAttribute('x', w - 28);
        }
        var s = Math.min(1, w / 230, h / 92);
        n.ct.setAttribute('transform', 'translate(' + (w / 2) + ',' + (h / 2) + ') scale(' + s.toFixed(3) + ')');
        n.ct.setAttribute('opacity', (1 - open).toFixed(3));
      });
      EDGE.forEach(function (E, i) {
        var e = E.e, a = rectOf(st, e[0]), b = rectOf(st, e[1]);
        var o = visK[i] * Math.min(a.o, b.o);
        E.p.style.display = o < 0.01 ? 'none' : '';
        if (E.lab) E.lab.style.display = o < 0.01 ? 'none' : '';
        if (o < 0.01) return;
        var p1 = clipTo(a, b.x + b.w / 2, b.y + b.h / 2), p2 = clipTo(b, a.x + a.w / 2, a.y + a.h / 2);
        E.p.setAttribute('d', 'M' + p1[0].toFixed(1) + ',' + p1[1].toFixed(1) + ' L' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1));
        E.p.setAttribute('opacity', o.toFixed(3));
        if (E.lab) {
          var mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2, tw = e[3].length * 7.9 + 16;
          E.lab.setAttribute('opacity', o.toFixed(3));
          E.lab.firstChild.setAttribute('x', mx - tw / 2); E.lab.firstChild.setAttribute('y', my - 13); E.lab.firstChild.setAttribute('width', tw);
          E.lab.lastChild.setAttribute('x', mx); E.lab.lastChild.setAttribute('y', my + 5);
        }
      });
      // sequence inside the API box
      var api = rectOf(st, 'api');
      seqG.setAttribute('opacity', st.seq.toFixed(3));
      seqG.style.display = st.seq < 0.01 ? 'none' : '';
      if (st.seq < 0.01) return;
      chip.setAttribute('transform', 'translate(' + (api.x + api.w - 262) + ',' + (api.y + 22) + ')');
      var x0 = api.x + 30, sp = (api.w - 60) / PARTS.length, cardY = api.y + 98, top = cardY + 50, X = [];
      LIFE.forEach(function (L, i) {
        var cx = x0 + sp * (i + .5); X.push(cx);
        L.r.setAttribute('x', cx - 64); L.r.setAttribute('y', cardY);
        L.t1.setAttribute('x', cx); L.t1.setAttribute('y', cardY + 19);
        L.t2.setAttribute('x', cx); L.t2.setAttribute('y', cardY + 39);
        L.line.setAttribute('x1', cx); L.line.setAttribute('x2', cx); L.line.setAttribute('y1', top); L.line.setAttribute('y2', api.y + api.h - 22);
      });
      MSG.forEach(function (M, j) {
        var p = clamp((seqClock - 500 - j * 650) / 480, 0, 1);
        M.g.style.display = p <= 0 ? 'none' : '';
        if (p <= 0) return;
        var y = top + 42 + j * 56, xa = X[M.m[0]], xb = X[M.m[1]], sg = xb > xa ? 1 : -1;
        var xe = xa + sg * 12 + (xb - sg * 3 - xa - sg * 12) * ease(p);
        M.line.setAttribute('d', 'M' + (xa + sg * 12) + ',' + y + ' L' + xe.toFixed(1) + ',' + y);
        M.dot.setAttribute('cx', xa); M.dot.setAttribute('cy', y);
        M.num.setAttribute('x', xa); M.num.setAttribute('y', y + 4);
        var tw = M.m[2].length * 9.1, lo = Math.min(xa, xb), hi = Math.max(xa, xb);
        var tx = tw + 34 < hi - lo ? (lo + hi) / 2 - tw / 2 : lo + 18;
        M.t.setAttribute('x', tx); M.t.setAttribute('y', y - 9);
        M.bg.setAttribute('x', tx - 4); M.bg.setAttribute('y', y - 26); M.bg.setAttribute('width', tw + 8);
        var lo2 = clamp((p - .55) / .45, 0, 1);
        M.t.setAttribute('opacity', lo2); M.bg.setAttribute('opacity', lo2 * .92);
      });
    }

    // ---------- timeline ----------
    // A transition always starts from what is on screen (shown, shownVis), so a click mid-zoom turns smoothly.
    function mix(A, B, k) {
      var out = { cam: A.cam.map(function (v, i) { return lerp(v, B.cam[i], k); }), seq: lerp(A.seq, B.seq, k), box: {} };
      Object.keys(A.box).forEach(function (id) { out.box[id] = A.box[id].map(function (v, i) { return lerp(v, B.box[id][i], k); }); });
      return out;
    }
    var HOLD = [2800, 3200, 3000, 7000], MOVE = [1300, 1500, 1050, 1700];
    var buttons = document.querySelectorAll('.hero-window [data-step]'), pauseBtn = document.getElementById('zoom-pause');
    var capT = document.getElementById('zoom-cap-title'), capX = document.getElementById('zoom-cap-text');
    // ?zoom=0…3 opens on that step, paused, fully drawn (for screenshots and links)
    var asked = /[?&]zoom=([0-3])\b/.exec(location.search);
    var initial = asked ? +asked[1] : reduce ? 1 : 0;
    var shown = S[initial], shownVis = EDGES.map(function (e) { return e[2][initial]; });
    var tr = { from: shown, visFrom: shownVis, to: initial, t0: 0, dur: 0, done: false };
    var arrived = 0, playing = false, running = false, onScreen = true;
    function label(i) {
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.step === i)); });
      capT.textContent = CAPS[i][0]; capX.textContent = CAPS[i][1];
    }
    function go(i, dur) {
      tr = { from: shown, visFrom: shownVis.slice(), to: i, t0: performance.now(), dur: reduce ? 0 : dur, done: false };
      label(i);
      start();
    }
    function setPlaying(v) {
      playing = v && !reduce;
      pauseBtn.textContent = playing ? '❚❚' : '▶';
      pauseBtn.setAttribute('aria-label', playing ? 'Pause the animation' : 'Play the animation');
      if (playing) arrived = performance.now();
    }
    buttons.forEach(function (b) { b.addEventListener('click', function () { setPlaying(false); go(+b.dataset.step, 1100); }); });
    pauseBtn.addEventListener('click', function () { setPlaying(!playing); start(); });
    if (reduce) pauseBtn.hidden = true;

    function tick(now) {
      if (!onScreen || document.hidden) { running = false; return; }
      var k = tr.dur ? clamp((now - tr.t0) / tr.dur, 0, 1) : 1, e = ease(k);
      var st = k >= 1 ? S[tr.to] : mix(tr.from, S[tr.to], e);
      var vis = EDGES.map(function (ed, i) { return k >= 1 ? ed[2][tr.to] : lerp(tr.visFrom[i], ed[2][tr.to], e); });
      if (k >= 1 && !tr.done) { tr.done = true; arrived = now; }
      // messages draw once the sequence step is reached; when leaving it they stay drawn while they fade
      var clock = tr.to === 3 ? (k >= 1 ? (reduce ? 1e9 : now - arrived) : 0) : 1e9;
      render(st, vis, clock);
      shown = st; shownVis = vis;
      if (k >= 1 && playing && now - arrived > HOLD[tr.to]) go((tr.to + 1) % 4, MOVE[tr.to]);
      // keep animating while moving, playing, or drawing messages; otherwise stop until the next click
      if (k < 1 || playing || (tr.to === 3 && now - arrived < 6000)) requestAnimationFrame(tick); else running = false;
    }
    function start() { if (!running && onScreen && !document.hidden) { running = true; requestAnimationFrame(tick); } }

    label(initial); setPlaying(!reduce && !asked);
    render(S[initial], shownVis, 1e9);
    if (asked) { tr.done = true; arrived = -1e9; }   // already arrived long ago: everything drawn
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; if (onScreen) start(); }, { threshold: 0.05 }).observe(svg);
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) start(); });
    start();
  }

  /* ======================================================================
     2. live example window
     ====================================================================== */
  var frame = document.getElementById('live-frame');
  if (frame) live();

  function live() {
    var tabs = document.querySelectorAll('.live-window [role="tab"]'), full = document.getElementById('live-full');
    var tourBtn = document.getElementById('tour'), cap = document.getElementById('tour-cap'), hints = document.getElementById('live-hints');
    var timer = null, step = 0;
    function api() { try { var w = frame.contentWindow; return w && w.ARCH_EXPLORER && w.ARCH_EXPLORER.api; } catch (e) { return null; } }
    function isExplorer() { return /explorer/.test(frame.getAttribute('src')); }
    tabs.forEach(function (b) {
      b.addEventListener('click', function () {
        stopTour();
        tabs.forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
        frame.setAttribute('src', b.dataset.src); full.href = b.dataset.full;
        frame.title = b.textContent + ' generated for the example project';
        hints.hidden = !isExplorer(); tourBtn.hidden = true;
      });
    });
    frame.addEventListener('load', function () {
      tourBtn.hidden = !(isExplorer() && api());
      // any interaction inside the page hands control back to the reader
      try { ['pointerdown', 'keydown', 'wheel'].forEach(function (t) { frame.contentDocument.addEventListener(t, function (ev) { if (ev.isTrusted) stopTour(); }, true); }); } catch (e) {}
    });

    var TOUR = [
      [0, function (a) { a.setView('map'); a.setLevel(1); }, 'L1', 'The system in its context: who uses it.'],
      [2600, function (a) { a.setLevel(2); }, 'L2', 'Open it: the containers that run, and what talks to what.'],
      [3000, function (a) { a.toggle('api'); }, 'L3', 'Double-click a container to open it in place.'],
      [3000, function (a) { a.showSeq('api', 'upload'); }, '⇅', 'Draw a scenario inside it: the upload, as a sequence.'],
      [2600, function (a) { a.pickSeqStep('api', 0); }, '1', 'Each message links to the code behind it, in the panel.'],
      [1400, function (a) { a.pickSeqStep('api', 1); }], [1400, function (a) { a.pickSeqStep('api', 2); }],
      [1400, function (a) { a.pickSeqStep('api', 3); }], [1400, function (a) { a.pickSeqStep('api', 4); }],
      [2000, function (a) { a.setView('dynamic'); }, 'D', 'The same flow on the Dynamic tab, at any level.'],
      [3400, function (a) { a.setView('map'); a.setLevel(2); }, '✓', 'Your turn: double-click any box.'],
      [2800, null]
    ];
    function say(tag, text) { if (!text) return; cap.innerHTML = ''; var b = document.createElement('b'); b.textContent = tag; cap.appendChild(b); cap.appendChild(document.createTextNode(text)); cap.hidden = false; }
    function run() {
      var a = api(), s = TOUR[step];
      if (!a || !s) { stopTour(); return; }
      if (!s[1]) { stopTour(); return; }
      try { s[1](a); } catch (e) { stopTour(); return; }
      say(s[2], s[3]);
      step++;
      if (TOUR[step]) timer = setTimeout(run, TOUR[step][0]);
    }
    function stopTour() {
      if (timer) clearTimeout(timer); timer = null; step = 0; cap.hidden = true;
      tourBtn.textContent = '▶ Take the tour'; tourBtn.setAttribute('aria-pressed', 'false');
    }
    tourBtn.addEventListener('click', function () {
      if (timer || step) { stopTour(); return; }
      tourBtn.textContent = '■ Stop the tour'; tourBtn.setAttribute('aria-pressed', 'true');
      run();
    });
  }

  /* ======================================================================
     3. copy buttons
     ====================================================================== */
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.getAttribute('data-copy'), done = function () { b.textContent = 'copied'; setTimeout(function () { b.textContent = 'copy'; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
    });
  });
})();
