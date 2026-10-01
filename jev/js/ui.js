/* ui.js — panels, narration, controls.
 *
 * Every number is read from Sim.planNow() or Sim.state. Nothing is copied
 * into a second store, so the panel cannot drift away from the van.
 */
(function (global) {
  'use strict';

  var Sim = global.Sim, World = global.World, Jev = global.Jev, Iso = global.Iso;

  var $ = function (id) { return document.getElementById(id); };

  var el = {};
  var activeDistrict = null;
  var pinnedDistrict = null;
  var lastPaint = 0;
  var flyTo = null;
  var sheetOpen = false;

  var STATION_LABEL = {
    gate: 'gate', state: 'state', forge: 'forge', choice: 'choice',
    score: 'score', noul: 'noul', wire: 'wire', review: 'review',
    act: 'act', done: 'done'
  };

  function init() {
    [
      'stage-chip', 'stage-tag', 'stage-name', 'stage-short', 'stage-body',
      'dwell', 'dwell-bar', 'dwell-hint',
      'ans-choice', 'ans-score', 'ans-noul', 'ans-hint',
      'feat-list', 'sum-choice', 'sum-conf', 'sum-score', 'sum-noul',
      'sum-in', 'sum-out', 'sum-note', 'state-quote', 'district-chips',
      'hud-phase', 'hud-model', 'hud-answers', 'hud-branch', 'hud-note',
      'inspector', 'btn-run', 'btn-play', 'play-glyph', 'btn-step', 'btn-reset',
      'speed', 'ticket', 'levels', 'review', 'escalate',
      'v-speed', 'v-ticket', 'v-levels', 'v-review', 'v-escalate',
      'trim', 'follow', 'labels',
      'btn-about', 'about', 'about-close', 'btn-panel', 'tooltip',
      'sheet-handle', 'btn-tune', 'dock', 'dock-tune'
    ].forEach(function (id) { el[id] = $(id); });

    buildChips();
    wire();
    applyResponsiveLabels();

    Sim.on(function (name, payload) {
      if (name === 'station') onStation(payload);
      if (name === 'reset') { pinnedDistrict = null; paint(true); }
    });
  }

  function buildChips() {
    World.districts.forEach(function (d) {
      var b = document.createElement('button');
      b.textContent = d.name;
      b.dataset.id = d.id;
      b.addEventListener('click', function () {
        showDistrict(d, true);
        flyTo = { x: d.x, y: d.y };
      });
      el['district-chips'].appendChild(b);
    });
  }

  function wire() {
    el['btn-run'].addEventListener('click', function () { Sim.run(); paint(true); });
    el['btn-play'].addEventListener('click', function () { Sim.toggle(); paint(true); });
    el['btn-step'].addEventListener('click', function () { Sim.step(); });
    el['btn-reset'].addEventListener('click', function () { Sim.replayTour(); Sim.run(); paint(true); });

    bindRange('speed', 'v-speed', function (v) {
      Sim.state.speed = v;
      return v.toFixed(2) + '×';
    });
    bindRange('ticket', 'v-ticket', function (v) {
      var i = v | 0;
      Sim.state.ticketIndex = i;
      var t = Jev.TICKETS[i];
      return t ? t.label : '';
    });
    bindRange('levels', 'v-levels', function (v) {
      Sim.state.levels = v | 0;
      return (v | 0) + ' levels';
    });
    bindRange('review', 'v-review', function (v) {
      Sim.state.reviewBelow = v;
      return 'under ' + v.toFixed(2);
    });
    bindRange('escalate', 'v-escalate', function (v) {
      Sim.state.escalateAbove = v;
      return 'above ' + v.toFixed(2);
    });

    el.trim.addEventListener('change', function () { Sim.state.trim = el.trim.checked; paint(true); });
    el.labels.addEventListener('change', function () { global.Renderer.setLabels(el.labels.checked); });

    el['btn-about'].addEventListener('click', function () { el.about.hidden = false; });
    el['about-close'].addEventListener('click', function () { el.about.hidden = true; });
    el.about.addEventListener('click', function (e) { if (e.target === el.about) el.about.hidden = true; });

    el['btn-panel'].addEventListener('click', function () {
      var hidden = el.inspector.classList.toggle('hidden');
      el['btn-panel'].setAttribute('aria-expanded', String(!hidden));
      applyResponsiveLabels();
    });
    window.addEventListener('resize', applyResponsiveLabels);

    el['sheet-handle'].addEventListener('click', function () { setSheet(!sheetOpen); });
    el['btn-tune'].addEventListener('click', function () {
      var open = el.dock.classList.toggle('tune-open');
      el['btn-tune'].setAttribute('aria-expanded', String(open));
      el['btn-tune'].title = open ? 'Hide settings' : 'Show settings';
    });
  }

  function isMobile() { return window.matchMedia('(max-width: 900px)').matches; }

  function applyResponsiveLabels() {
    var hidden = el.inspector.classList.contains('hidden');
    var narrow = isMobile();
    el['btn-panel'].textContent = narrow ? (hidden ? 'Panel' : 'Hide') : (hidden ? 'Show panel' : 'Hide panel');
    el['btn-about'].textContent = narrow ? 'About' : 'About & accuracy';
    el['dwell-hint'].innerHTML = narrow
      ? 'reading stop: tap <b>❚❚</b> below to hold it here'
      : 'reading stop: press <kbd>Space</kbd> to hold it here';
  }

  function setSheet(open) {
    sheetOpen = open;
    el.inspector.classList.toggle('open', open);
    el['sheet-handle'].setAttribute('aria-expanded', String(open));
    if (open) el.inspector.scrollTop = 0;
  }

  function bindRange(id, out, fn) {
    var input = el[id];
    var apply = function () { el[out].textContent = fn(parseFloat(input.value)); };
    input.addEventListener('input', apply);
    apply();
  }

  function onStation(station) {
    var id = station === 'done' ? null : (World.stationToDistrict[station] || station);
    activeDistrict = id;
    if (!pinnedDistrict && id) {
      var d = World.districtById[id];
      if (d) writeCard(d, station);
    }
    if (station === 'done') writeDone();
    paint(true);
  }

  function writeCard(d, station) {
    el['stage-chip'].textContent = STATION_LABEL[station] || d.id;
    el['stage-chip'].style.color = d.color;
    el['stage-chip'].style.background = Iso.rgba(d.color, 0.14);
    el['stage-chip'].style.borderColor = Iso.rgba(d.color, 0.3);
    el['stage-tag'].textContent = d.tag;
    el['stage-name'].textContent = d.name;
    el['stage-short'].textContent = d.short;
    el['stage-body'].textContent = d.body;
  }

  function writeDone() {
    var view = Sim.planNow();
    var p = view.policy;
    var a = view.call.response.answers;
    el['stage-chip'].textContent = 'done';
    el['stage-chip'].style.color = '';
    el['stage-chip'].style.background = '';
    el['stage-chip'].style.borderColor = '';
    el['stage-tag'].textContent = p.action;
    el['stage-name'].textContent = 'The call returned. The branch was yours.';
    el['stage-short'].textContent = 'route_team is ' + a.route_team.choice +
      ', needs_human is ' + Jev.fmtNum(a.needs_human.noul, 3) +
      ', severity is ' + Jev.fmtNum(a.severity.score) + '.';
    el['stage-body'].textContent = 'Those three arrived together, from one stub call on one state. ' +
      'Choice confidence is ' + Jev.fmtNum(a.route_team.confidence, 3) +
      ' against a review gate of ' + Jev.fmtNum(p.reviewBelow, 2) +
      (p.review ? ', so the van turned into Review Bay. ' : ', so the van skipped Review Bay. ') +
      'Noul is ' + (p.escalate ? 'above' : 'under') + ' ' + Jev.fmtNum(p.escalateAbove, 2) +
      ', so Act Gate ' + (p.escalate ? 'escalates' : 'stays automatic') +
      '. Jev did not choose either cutoff. Move a slider and press Run.';
  }

  function showDistrict(d, pin) {
    pinnedDistrict = pin ? d.id : null;
    writeCard(d, Sim.state.station);
    if (pin) {
      el['stage-chip'].textContent = 'pinned';
      el['stage-tag'].textContent = d.tag + ' · tap empty ground to resume';
      if (isMobile()) setSheet(true);
    }
    updateChips();
  }

  function updateChips() {
    var kids = el['district-chips'].children;
    for (var i = 0; i < kids.length; i++) {
      kids[i].classList.toggle('on', kids[i].dataset.id === (pinnedDistrict || activeDistrict));
    }
  }

  function paint(force) {
    var now = performance.now();
    if (!force && now - lastPaint < 90) return;
    lastPaint = now;

    var s = Sim.state;
    var view = Sim.planNow();
    var call = view.call;
    var ans = call.response.answers;
    var pol = view.policy;

    el['play-glyph'].textContent = s.paused || s.finished ? '▶' : '❚❚';
    el['hud-phase'].textContent = s.station ? (STATION_LABEL[s.station] || s.station) : 'idle';
    el['hud-model'].textContent = call.response.model;
    el['hud-answers'].textContent = s.call ? '3 / 3' : '0 / 3';
    el['hud-branch'].textContent = branchLabel(s, pol);
    el['hud-note'].textContent = hudNote(s);

    var showing = s.reading && s.dwellTotal > 0 && s.dwellLeft > 0;
    el.dwell.hidden = !showing;
    if (showing) el['dwell-bar'].style.width = (s.dwellLeft / s.dwellTotal * 100).toFixed(1) + '%';

    el['ans-hint'].textContent = view.frozenCall ? 'posted at the forge' : 'projected — not posted yet';
    paintChoice(ans.route_team, view.frozenCall);
    paintScore(ans.severity, view.frozenCall);
    paintNoul(ans.needs_human.noul, view.frozenCall);

    el['sum-choice'].textContent = ans.route_team.choice;
    el['sum-conf'].textContent = Jev.fmtNum(ans.route_team.confidence, 3);
    el['sum-score'].textContent = Jev.fmtNum(ans.severity.score);
    el['sum-noul'].textContent = Jev.fmtNum(ans.needs_human.noul, 3);
    el['sum-in'].textContent = String(call.response.usage.input_tokens);
    el['sum-out'].textContent = String(call.response.usage.output_tokens);
    el['sum-note'].textContent = interpret(view);
    el['state-quote'].textContent = call.request.state;
    paintFeatures(call.features);
    updateChips();
  }

  function branchLabel(s, pol) {
    if (s.acted) return s.acted.action;
    if (s.branch) return s.branch.review ? 'turned to review' : 'direct road';
    return pol.review ? 'will review' : 'will go direct';
  }

  function hudNote(s) {
    if (s.finished) return '';
    if (s.reading) return '⏸ holding here so you can read the panel';
    if (!s.running) return 'Press Run to post one System One call.';
    if (Sim.van.routeName === 'review') return '↩ choice confidence is under your review gate, so the van turned into Review Bay';
    if (s.tourDone) return '⏩ every district explained, running the rest at speed (drag Speed down to slow it)';
    if (s.call) return 'One round trip: Choice, Score, and Noul were filled together at the forge';
    return '';
  }

  function interpret(view) {
    var p = view.policy;
    var conf = Jev.fmtNum(p.confidence, 3);
    var noul = Jev.fmtNum(p.noul, 3);
    var sentence;
    if (view.frozenAct) {
      sentence = 'This trip is committed. Choice confidence ' + conf +
        (p.review ? ' sent the van to Review Bay' : ' cleared the review gate') +
        ', and noul ' + noul + (p.escalate ? ' escalates' : ' stays under the escalate gate') + '.';
    } else if (view.frozenBranch) {
      sentence = (p.review ? 'This trip already turned into Review Bay. ' : 'This trip already took the direct road. ') +
        'Noul ' + noul + (p.escalate ? ' is above ' : ' is under ') + Jev.fmtNum(p.escalateAbove, 2) +
        ', so the Act Gate lamp still follows the escalate slider until the van arrives.';
    } else if (view.frozenCall) {
      sentence = 'Posted call: confidence ' + conf +
        (p.review ? ' is under ' : ' clears ') + Jev.fmtNum(p.reviewBelow, 2) +
        (p.review ? ', so the van will turn at Wire Yard. ' : ', so the van will skip Review Bay. ') +
        'Noul ' + noul + (p.escalate ? ' will escalate.' : ' will not escalate.');
    } else {
      sentence = 'Projected, not posted: confidence ' + conf +
        (p.review ? ' would turn into Review Bay' : ' would skip Review Bay') +
        ', and noul ' + noul + (p.escalate ? ' would escalate.' : ' would not escalate.');
    }
    if (view.stale) sentence += ' Ticket or levels changed after the forge; this trip keeps the posted state.';
    return sentence;
  }

  function barRow(label, frac, value, hot, posted) {
    var pct = Math.max(0, Math.min(1, frac)) * 100;
    return '<div class="bar' + (posted ? ' paid' : '') + (hot ? ' live' : '') + '">' +
      '<span class="lbl">' + escapeHtml(label) + '</span>' +
      '<span class="track"><span class="fill" style="width:' + pct.toFixed(1) + '%"></span></span>' +
      '<span class="val">' + escapeHtml(value) + '</span></div>';
  }

  function paintChoice(choice, posted) {
    var keys = Jev.CHOICE_KEYS;
    var html = '';
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      html += barRow(k, choice.probabilities[k], Jev.fmtProb(choice.probabilities[k]), k === choice.choice, posted);
    }
    el['ans-choice'].innerHTML = html;
  }

  function paintScore(score, posted) {
    var keys = Object.keys(score.probabilities);
    var html = '';
    var top = 0, topK = keys[0], i, p;
    for (i = 0; i < keys.length; i++) {
      p = score.probabilities[keys[i]];
      if (p > top) { top = p; topK = keys[i]; }
    }
    for (i = 0; i < keys.length; i++) {
      html += barRow(keys[i], score.probabilities[keys[i]], Jev.fmtProb(score.probabilities[keys[i]]), keys[i] === topK, posted);
    }
    el['ans-score'].innerHTML = html;
  }

  function paintNoul(noul, posted) {
    el['ans-noul'].innerHTML = barRow('yes', noul, Jev.fmtNum(noul, 3), noul >= 0.5, posted) +
      barRow('no', 1 - noul, Jev.fmtNum(1 - noul, 3), noul < 0.5, posted);
  }

  function paintFeatures(f) {
    var keys = ['billing', 'identity', 'engineering', 'product', 'urgent', 'human'];
    var html = '';
    for (var i = 0; i < keys.length; i++) {
      html += '<div class="stat"><span class="k">' + keys[i] + '</span><b>' + f[keys[i]] + '</b></div>';
    }
    el['feat-list'].innerHTML = html;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  global.UI = {
    init: init,
    paint: paint,
    run: function () { Sim.run(); paint(true); },
    resetAll: function () { Sim.replayTour(); Sim.run(); paint(true); },
    showDistrict: showDistrict,
    unpin: function () { pinnedDistrict = null; updateChips(); },
    activeDistrict: function () { return pinnedDistrict || activeDistrict; },
    takeFlyTo: function () { var f = flyTo; flyTo = null; return f; },
    el: el
  };
})(typeof window !== 'undefined' ? window : globalThis);
