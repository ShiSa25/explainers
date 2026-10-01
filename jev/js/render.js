/* render.js — one painter's pass over Decision Depot.
 *
 * Ground, washes, and roads are flat, so they are painted first. Everything
 * with a footprint then goes into one list sorted by x + y. Labels are screen
 * space, still under the dpr transform.
 */
(function (global) {
  'use strict';

  var Iso = global.Iso, World = global.World, Sim = global.Sim, Jev = global.Jev;
  var P = Iso.project;

  var cam = null, ctx = null, t = 0;
  var labels = [];
  var showLabels = true;
  var C = World.palette;

  var FACE_ANG = Math.atan2(Iso.TH, Iso.TW);
  var FACE_U = Math.hypot(Iso.TW, Iso.TH);

  function drawSky(w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#eef3f6');
    g.addColorStop(0.55, '#e9eef0');
    g.addColorStop(1, '#e3e6e2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function plate(inset, z) {
    return [
      P(inset, inset, z), P(World.GW - inset, inset, z),
      P(World.GW - inset, World.GH - inset, z), P(inset, World.GH - inset, z)
    ];
  }

  var GRASS = ['#8aa96a', '#93b073', '#83a463', '#9ab77c'];

  function drawGround() {
    ctx.fillStyle = 'rgba(120,124,110,0.30)';
    Iso.poly(ctx, plate(-0.9, -0.35));
    ctx.fillStyle = '#93b073';
    Iso.poly(ctx, plate(0, 0));

    for (var gx = 1; gx < World.GW; gx += 2) {
      for (var gy = 1; gy < World.GH; gy += 2) {
        var n = Iso.hash2(gx, gy, 17);
        if (n < 0.45) continue;
        ctx.fillStyle = GRASS[(n * 4) | 0];
        Iso.disc(ctx, gx + n, gy + (1 - n), 0, 0.7 + n * 0.5);
      }
    }

    ctx.strokeStyle = 'rgba(74,69,64,0.28)';
    ctx.lineWidth = 1.4;
    Iso.polyLine(ctx, plate(0, 0), true);
  }

  function drawZones(activeId) {
    for (var i = 0; i < World.districts.length; i++) {
      var d = World.districts[i];
      var on = d.id === activeId;
      ctx.fillStyle = Iso.rgba(d.color, on ? 0.16 : 0.055);
      Iso.disc(ctx, d.x, d.y, 0.01, d.r);
      if (on) {
        ctx.strokeStyle = Iso.rgba(d.color, 0.5);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        var p = P(d.x, d.y, 0.01);
        ctx.ellipse(p.x, p.y, d.r * Iso.TW * 1.41421, d.r * Iso.TH * 1.41421, 0, 0, 6.2832);
        ctx.stroke();
      }
    }
  }

  function roadQuad(a, b, width, dz) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len * width / 2, ny = dx / len * width / 2;
    var za = (a.z || 0) + (dz || 0), zb = (b.z || 0) + (dz || 0);
    Iso.poly(ctx, [
      P(a.x + nx, a.y + ny, za), P(b.x + nx, b.y + ny, zb),
      P(b.x - nx, b.y - ny, zb), P(a.x - nx, a.y - ny, za)
    ]);
  }

  function drawRoute(route, opts) {
    var width = opts.width, i, s;
    ctx.fillStyle = opts.shoulder || C.road;
    for (i = 0; i < route.segs.length; i++) {
      s = route.segs[i];
      roadQuad(s.a, s.b, width + 0.5, 0);
      Iso.disc(ctx, s.a.x, s.a.y, s.a.z || 0, (width + 0.5) / 2);
    }
    var last = route.pts[route.pts.length - 1];
    Iso.disc(ctx, last.x, last.y, last.z || 0, (width + 0.5) / 2);

    ctx.fillStyle = opts.surface || C.roadTop;
    for (i = 0; i < route.segs.length; i++) {
      s = route.segs[i];
      roadQuad(s.a, s.b, width, 0.005);
      Iso.disc(ctx, s.a.x, s.a.y, (s.a.z || 0) + 0.005, width / 2);
    }
    Iso.disc(ctx, last.x, last.y, (last.z || 0) + 0.005, width / 2);

    ctx.strokeStyle = opts.dash || 'rgba(96,90,78,0.35)';
    ctx.lineWidth = 1.3;
    ctx.setLineDash([6, 7]);
    ctx.beginPath();
    for (i = 0; i < route.pts.length; i++) {
      var p = P(route.pts[i].x, route.pts[i].y, (route.pts[i].z || 0) + 0.01);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawRoads() {
    drawRoute(World.routes.out, { width: 2.35 });
    drawRoute(World.routes.review, { width: 2.05, surface: '#e3d0cb', dash: 'rgba(176,84,112,0.5)' });
    drawRoute(World.routes.direct, { width: 2.15, surface: '#d5ddcf', dash: 'rgba(95,138,82,0.45)' });
  }

  /* ----------------------------------------------------------- landmarks */

  function liveFeatures() {
    var s = Sim.state;
    if (s.call) return s.call.features;
    var ticket = Jev.TICKETS[s.ticketIndex] || Jev.TICKETS[0];
    return Jev.extractFeatures(Jev.composeState(ticket.text, s.trim));
  }

  function drawScreen(b) {
    Iso.box(ctx, { x: b.x - 0.9, y: b.y - 0.7, z: 0, w: 1.8, d: 1.4, h: 0.5, color: '#b9b2a2' });
    Iso.box(ctx, { x: b.x - 0.15, y: b.y - 0.1, z: 0.5, w: 0.3, d: 0.3, h: 0.7, color: '#8e8878' });
    Iso.orientedBox(ctx, {
      x: b.x, y: b.y, z: 1.2, hx: 1, hy: -1, len: 2.4, wid: 0.16, h: 1.5, color: '#f4f1e6'
    });
    var lit = !!Sim.state.call;
    Iso.orientedBox(ctx, {
      x: b.x, y: b.y, z: 1.35, hx: 1, hy: -1, len: 2.05, wid: 0.05, h: 1.15,
      color: lit ? Iso.mix('#dfe9ef', b.color, 0.45) : '#cfd6d8', edge: false
    });
  }

  function drawGatePost(b) {
    Iso.box(ctx, { x: b.x - 0.28, y: b.y - 0.28, z: 0, w: 0.56, d: 0.56, h: 3.1, color: b.color });
  }

  function drawGateBeam(b) {
    Iso.box(ctx, {
      x: b.x - 0.3, y: b.y - 1.85, z: 3.1, w: 0.6, d: 3.7, h: 0.42,
      color: Iso.mix(b.color, '#ffffff', 0.25)
    });
  }

  function drawDock(b) {
    Iso.box(ctx, { x: b.x - 2.3, y: b.y - 1.3, z: 0, w: 4.6, d: 2.6, h: 1.15, color: '#c5d4c0',
      panels: { cols: 4, seed: 2, color: '#e4efe0' } });
    var chars = liveFeatures().chars;
    var h = 0.45 + Math.min(1.35, chars / 260);
    Iso.box(ctx, {
      x: b.x - 0.55, y: b.y - 0.45, z: 1.15, w: 1.15, d: 0.95, h: h,
      color: '#c4a36a'
    });
  }

  function drawForge(b) {
    var lit = !!Sim.state.call;
    var cols = [C.plum, C.ochre, C.teal];
    Iso.box(ctx, { x: b.x - 2.5, y: b.y - 1.15, z: 0, w: 5.0, d: 2.3, h: 0.4, color: '#e7d3c0' });
    for (var i = 0; i < 3; i++) {
      Iso.box(ctx, {
        x: b.x - 2.05 + i * 1.45, y: b.y - 0.55, z: 0.4,
        w: 1.15, d: 1.15, h: lit ? 1.45 : 0.5,
        color: cols[i]
      });
    }
  }

  function drawPosts(b) {
    var keys = Jev.CHOICE_KEYS;
    var probs = Sim.state.call ? Sim.state.call.response.answers.route_team.probabilities : null;
    var cols = ['#c4a36a', '#6f8fbf', '#d07a45', '#7da56a'];
    for (var i = 0; i < keys.length; i++) {
      var p = probs ? probs[keys[i]] : 0.06;
      Iso.cylinder(ctx, {
        x: b.x - 1.8 + i * 1.2, y: b.y, z: 0, r: 0.36,
        h: 0.32 + p * 3.15,
        color: cols[i], ring: probs ? 0.72 : 0.2
      });
    }
  }

  function drawRamp(b) {
    var call = Sim.state.call;
    var n = 5, score = 0;
    if (call) {
      n = Object.keys(call.response.answers.severity.probabilities).length;
      score = call.response.answers.severity.score;
    }
    var span = Math.max(1, n - 1);
    var i, stepW = 4.8 / n;
    for (i = 0; i < n; i++) {
      var h = 0.26 + (i / span) * 1.55;
      Iso.box(ctx, {
        x: b.x - 2.4 + i * stepW, y: b.y, z: 0,
        w: stepW * 0.86, d: 1.15, h: h,
        color: i % 2 ? '#e2c48a' : '#c2913c'
      });
    }
    if (call) {
      var t = score / span;
      var bh = 0.26 + t * 1.55;
      Iso.cylinder(ctx, {
        x: b.x - 2.4 + t * (stepW * n) + stepW * 0.15,
        y: b.y + 0.55, z: bh, r: 0.2, h: 0.22, color: '#f7f3ea'
      });
    }
  }

  function drawDial(b) {
    /* Housing. The gauge is painted on the +y face, the one the noul lane
       looks at, using the wall's screen angle rather than a pixel guess. */
    Iso.box(ctx, { x: b.x - 0.95, y: b.y - 0.7, z: 0, w: 1.9, d: 1.35, h: 1.85, color: '#b7d4d1' });
    var noul = Sim.state.call ? Sim.state.call.response.answers.needs_human.noul : 0;
    var p = P(b.x, b.y + 0.65, 1.05);
    var rx = 0.62 * FACE_U, ry = 0.55 * Iso.TZ;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(FACE_ANG);
    ctx.fillStyle = '#f7f4ec';
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, 6.2832);
    ctx.fill();
    ctx.strokeStyle = 'rgba(47,90,88,0.85)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    var ang = Math.PI * (1 - noul);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(ang) * rx * 0.72, Math.sin(ang) * ry * 0.72);
    ctx.stroke();
    ctx.fillStyle = C.teal;
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  function drawDesk(b) {
    Iso.box(ctx, { x: b.x - 1.3, y: b.y - 0.7, z: 0, w: 2.6, d: 1.5, h: 0.85, color: '#e4c9d0' });
    var on = Sim.state.branch && Sim.state.branch.review;
    Iso.cylinder(ctx, {
      x: b.x + 0.7, y: b.y - 0.15, z: 0.85, r: 0.16, h: 0.7,
      color: on ? '#b05470' : '#c8b4b8'
    });
    if (on) {
      var p = P(b.x + 0.7, b.y - 0.15, 1.7);
      ctx.fillStyle = Iso.rgba('#b05470', 0.35);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, 6.2832);
      ctx.fill();
    }
  }

  function drawLamps(b) {
    var plan = Sim.planNow();
    var show = !!Sim.state.call;
    var escalate = show && plan.policy.escalate;
    var autoOn = show && !plan.policy.escalate;
    Iso.cylinder(ctx, {
      x: b.x - 0.7, y: b.y, z: 0, r: 0.38, h: autoOn ? 2.15 : 1.35,
      color: autoOn ? '#6d9068' : '#b7c3b4', ring: 0.55
    });
    Iso.cylinder(ctx, {
      x: b.x + 0.7, y: b.y, z: 0, r: 0.38, h: escalate ? 2.15 : 1.35,
      color: escalate ? '#b05470' : '#cbb8bc', ring: 0.55
    });
  }

  var KIND = {
    screen: drawScreen,
    gatePost: drawGatePost,
    gateBeam: drawGateBeam,
    dock: drawDock,
    forge: drawForge,
    posts: drawPosts,
    ramp: drawRamp,
    dial: drawDial,
    desk: drawDesk,
    lamps: drawLamps
  };

  function drawLamp(p) {
    Iso.cylinder(ctx, { x: p.x, y: p.y, z: 0, r: 0.13, h: 2.7, color: '#9c968a' });
    Iso.box(ctx, { x: p.x - 0.28, y: p.y - 0.22, z: 2.7, w: 0.56, d: 0.44, h: 0.18, color: '#c8c2b2' });
  }

  function drawTree(p) {
    var n = Iso.hash2(p.x, p.y, p.seed || 1);
    Iso.cylinder(ctx, { x: p.x, y: p.y, z: 0, r: 0.18, h: 0.9 + n * 0.4, color: '#8a7358' });
    var r = 0.85 + n * 0.5;
    ctx.fillStyle = n < 0.5 ? '#5f8a52' : '#6d9068';
    Iso.disc(ctx, p.x, p.y, 1.5 + n * 0.8, r);
    ctx.fillStyle = Iso.rgba('#ffffff', 0.16);
    Iso.disc(ctx, p.x - r * 0.25, p.y - r * 0.25, 1.62 + n * 0.8, r * 0.6);
  }

  /* The flank bars are the vector the van is carrying: keyword counts before
     the call, then the distribution of the booth it is reading. The crate is
     the state. The three cards appear together, because the call returned
     them together. */
  function flankValues(s) {
    if (!s.call) {
      var f = liveFeatures();
      var keys = Jev.CHOICE_KEYS;
      var max = 1, i;
      for (i = 0; i < keys.length; i++) if (f[keys[i]] > max) max = f[keys[i]];
      var out = [];
      for (i = 0; i < keys.length; i++) out.push(f[keys[i]] / max);
      return out;
    }
    var st = s.station;
    if (st === 'score') {
      var probs = s.call.response.answers.severity.probabilities;
      var n = Object.keys(probs).length, arr = [], k;
      for (k = 0; k < n; k++) arr.push(probs[String(k)]);
      return arr;
    }
    if (st === 'noul' || st === 'wire' || st === 'review' || st === 'act' || st === 'done') {
      var q = s.call.response.answers.needs_human.noul;
      return [q, 1 - q];
    }
    var cp = s.call.response.answers.route_team.probabilities;
    return Jev.CHOICE_KEYS.map(function (key) { return cp[key]; });
  }

  var BAR_COLORS = ['#6f63a8', '#4a7a9b', '#c07a3c', '#6d9068', '#3f8a86', '#c2913c', '#b05470', '#8b5f96', '#a85a44', '#5f8a52'];

  function drawVan(v) {
    var s = Sim.state;
    var hx = v.dx, hy = v.dy;
    var z = v.z || 0;
    var px = -hy, py = hx;

    ctx.fillStyle = 'rgba(80,76,66,0.22)';
    Iso.disc(ctx, v.x, v.y, z + 0.01, 1.05);

    Iso.orientedBox(ctx, { x: v.x, y: v.y, z: z + 0.16, hx: hx, hy: hy, len: 2.5, wid: 1.25, h: 0.34, color: '#5c6a72' });
    Iso.orientedBox(ctx, { x: v.x - hx * 0.35, y: v.y - hy * 0.35, z: z + 0.5, hx: hx, hy: hy, len: 1.7, wid: 1.2, h: 1.0, color: '#eae6da' });
    Iso.orientedBox(ctx, { x: v.x + hx * 0.85, y: v.y + hy * 0.85, z: z + 0.5, hx: hx, hy: hy, len: 0.85, wid: 1.1, h: 0.76, color: '#8a5a3c' });

    var vals = flankValues(s);
    var side = (px + py) > 0 ? 1 : -1;
    var gx = v.x - hx * 0.35 + px * side * 0.62;
    var gy = v.y - hy * 0.35 + py * side * 0.62;
    var GLEN = 1.45;
    var n = vals.length;
    var i, slot = GLEN / n;
    for (i = 0; i < n; i++) {
      var bh = 0.08 + Math.max(0, vals[i]) * 0.72;
      var along = -GLEN / 2 + slot * (i + 0.5);
      Iso.orientedBox(ctx, {
        x: gx + hx * along, y: gy + hy * along, z: z + 0.62,
        hx: hx, hy: hy, len: Math.max(0.06, slot * 0.72), wid: 0.06, h: bh,
        color: BAR_COLORS[i % BAR_COLORS.length], edge: false
      });
    }

    if (s.call) {
      var ans = s.call.response.answers;
      var span = Math.max(1, Object.keys(ans.severity.probabilities).length - 1);
      var bands = [
        ans.route_team.probabilities[ans.route_team.choice],
        ans.severity.score / span,
        ans.needs_human.noul
      ];
      var cardCols = ['#8b5f96', '#c2913c', '#3f8a86'];
      for (i = 0; i < 3; i++) {
        var row = i - 1;
        Iso.orientedBox(ctx, {
          x: v.x - hx * 0.85 + px * row * 0.32,
          y: v.y - hy * 0.85 + py * row * 0.32,
          z: z + 1.52, hx: hx, hy: hy, len: 0.34, wid: 0.28, h: 0.42,
          color: '#f4f1e6'
        });
        Iso.orientedBox(ctx, {
          x: v.x - hx * 0.85 + px * row * 0.32,
          y: v.y - hy * 0.85 + py * row * 0.32,
          z: z + 1.54, hx: hx, hy: hy, len: 0.26, wid: 0.08,
          h: 0.08 + bands[i] * 0.32,
          color: cardCols[i], edge: false
        });
      }
    } else {
      var chars = liveFeatures().chars;
      var ch = 0.32 + Math.min(0.7, chars / 420);
      Iso.orientedBox(ctx, {
        x: v.x - hx * 0.7, y: v.y - hy * 0.7, z: z + 1.52,
        hx: hx, hy: hy, len: 0.7, wid: 0.62, h: ch, color: '#c4a36a'
      });
    }

    ctx.fillStyle = '#3f3a34';
    [[0.8, 0.5], [0.8, -0.5], [-0.8, 0.5], [-0.8, -0.5]].forEach(function (o) {
      Iso.disc(ctx, v.x + hx * o[0] + px * o[1], v.y + hy * o[0] + py * o[1], z + 0.14, 0.22);
    });
  }

  function vanCaption(s) {
    if (!s.call) {
      return { text: liveFeatures().chars + ' chars', sub: 'state crate' };
    }
    var a = s.call.response.answers;
    if (s.station === 'score') return { text: Jev.fmtNum(a.severity.score), sub: 'score' };
    if (s.station === 'noul') return { text: Jev.fmtNum(a.needs_human.noul, 3), sub: 'P(yes)' };
    if (s.acted) return { text: s.acted.action, sub: a.route_team.choice };
    if (s.branch && s.branch.review) return { text: 'review', sub: Jev.fmtNum(a.route_team.confidence, 2) + ' conf' };
    return {
      text: a.route_team.choice,
      sub: Jev.fmtNum(a.route_team.confidence, 2) + ' conf'
    };
  }

  function districtSub(d, s) {
    if (!s.visited || !s.visited[d.id] || !s.call) return null;
    var a = s.call.response.answers;
    if (d.id === 'choice') return a.route_team.choice + ' ' + Jev.fmtProb(a.route_team.probabilities[a.route_team.choice]);
    if (d.id === 'score') return 'score ' + Jev.fmtNum(a.severity.score);
    if (d.id === 'noul') return 'noul ' + Jev.fmtNum(a.needs_human.noul, 3);
    if (d.id === 'state') return s.call.features.chars + ' chars';
    if (d.id === 'forge') return '3 answers';
    if (d.id === 'wire') return s.call.response.usage.input_tokens + ' in';
    if (d.id === 'review') return 'held';
    if (d.id === 'act' && s.acted) return s.acted.action;
    if (d.id === 'gate') return 'jev-latest';
    return null;
  }

  /* -------------------------------------------------------------- labels */

  function drawLabels() {
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    ctx.textBaseline = 'middle';
    labels.sort(function (a, b) { return (b.pri || 0) - (a.pri || 0); });

    var placed = [];
    var i;
    for (i = 0; i < labels.length; i++) {
      var L = labels[i];
      var p = P(L.x, L.y, L.z);
      L.ax = p.x * cam.scale + cam.ox;
      L.ay = p.y * cam.scale + cam.oy;
      L.px = (L.size || 12) * Math.min(1.15, Math.max(0.92, cam.scale));
      ctx.font = (L.bold ? '600 ' : '') + L.px + 'px ' + fontOf(L);
      var wpx = ctx.measureText(L.text).width;
      var subw = L.sub ? ctx.measureText(L.sub).width * 0.85 : 0;
      L.boxW = Math.max(wpx, subw) + 16;
      L.boxH = L.sub ? L.px * 2.4 : L.px * 1.75;
      L.sy = L.lift ? L.ay - L.lift - L.boxH / 2 : L.ay;
      for (var tries = 0; tries < 10 && overlaps(L, placed); tries++) L.sy -= L.boxH * 0.92;
      placed.push(L);
    }
    for (i = 0; i < labels.length; i++) drawPlate(labels[i]);
  }

  function fontOf(L) {
    return L.mono
      ? 'ui-monospace, Menlo, Consolas, monospace'
      : '"Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif';
  }

  function overlaps(L, placed) {
    for (var i = 0; i < placed.length; i++) {
      var o = placed[i];
      if (Math.abs(L.ax - o.ax) < (L.boxW + o.boxW) / 2 + 2 &&
          Math.abs(L.sy - o.sy) < (L.boxH + o.boxH) / 2 + 2) return true;
    }
    return false;
  }

  function drawPlate(L) {
    var ax = L.ax, ay = L.ay, sy = L.sy, size = L.px;
    var boxW = L.boxW, boxH = L.boxH;
    ctx.textAlign = 'center';
    ctx.font = (L.bold ? '600 ' : '') + size + 'px ' + fontOf(L);
    if (L.lift) {
      ctx.strokeStyle = Iso.rgba(L.tint || '#6e6250', 0.6);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ax, sy + boxH / 2);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      ctx.fillStyle = Iso.rgba(L.tint || '#6e6250', 0.85);
      ctx.beginPath();
      ctx.arc(ax, ay, 2.4, 0, 6.2832);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(96,84,66,0.26)';
    roundRect(ax - boxW / 2 + 1, sy - boxH / 2 + 2.5, boxW, boxH, 5);
    ctx.fill();
    ctx.fillStyle = L.tint ? Iso.mix('#fffdf7', L.tint, 0.14) : '#fffdf7';
    roundRect(ax - boxW / 2, sy - boxH / 2, boxW, boxH, 5);
    ctx.fill();
    ctx.strokeStyle = Iso.rgba(L.tint || '#6e6250', 0.85);
    ctx.lineWidth = L.bold ? 1.7 : 1.2;
    roundRect(ax - boxW / 2, sy - boxH / 2, boxW, boxH, 5);
    ctx.stroke();
    ctx.fillStyle = L.color || '#3a352e';
    ctx.fillText(L.text, ax, sy + (L.sub ? -size * 0.42 : 0));
    if (L.sub) {
      ctx.font = (size * 0.85) + 'px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillStyle = 'rgba(88,80,68,0.75)';
      ctx.fillText(L.sub, ax, sy + size * 0.62);
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function key(o) { return o.x + o.y + ((o.w || 0) + (o.d || 0)) * 0.5; }

  function draw(canvas, camera, time, activeDistrict, hoverDistrict) {
    ctx = canvas.getContext('2d');
    cam = camera;
    t = time;
    labels.length = 0;

    var w = canvas.width / cam.dpr, h = canvas.height / cam.dpr;
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    drawSky(w, h);
    ctx.setTransform(cam.scale * cam.dpr, 0, 0, cam.scale * cam.dpr, cam.ox * cam.dpr, cam.oy * cam.dpr);

    drawGround();
    drawZones(activeDistrict);
    drawRoads();

    var items = [];
    var i, s = Sim.state;
    for (i = 0; i < World.buildings.length; i++) {
      var b = World.buildings[i];
      if (b.kind && KIND[b.kind]) items.push({ k: b.x + b.y, f: KIND[b.kind], a: b });
      else items.push({ k: key(b), f: null, a: b });
    }
    for (i = 0; i < World.props.length; i++) {
      var pr = World.props[i];
      items.push({ k: pr.x + pr.y, f: pr.kind === 'tree' ? drawTree : drawLamp, a: pr });
    }
    var v = Sim.vanPosition();
    items.push({ k: v.x + v.y + 0.2, f: drawVan, a: v });

    items.sort(function (p, q) { return p.k - q.k; });
    for (i = 0; i < items.length; i++) {
      if (items[i].f) { items[i].f(items[i].a); continue; }
      var o = items[i].a;
      Iso.box(ctx, o);
      if (o.roof) {
        Iso.gableRoof(ctx, {
          x: o.x - 0.08, y: o.y - 0.08, z: o.z + o.h,
          w: o.w + 0.16, d: o.d + 0.16, h: o.roofH || 0.45, color: o.roof
        });
      }
    }

    if (showLabels) {
      var declutter = cam.scale < 0.34;
      for (i = 0; i < World.districts.length; i++) {
        var d = World.districts[i];
        var isActive = d.id === activeDistrict || d.id === hoverDistrict;
        if (declutter && !isActive) continue;
        var sub = districtSub(d, s);
        if (!sub && isActive) sub = d.tag;
        labels.push({
          x: d.x, y: d.y, z: 0, lift: isActive ? 34 : 26,
          text: d.name, sub: sub,
          color: isActive ? d.color : '#3d3831',
          tint: d.color,
          size: isActive ? 16.5 : 14, bold: isActive,
          pri: isActive ? 2 : 1
        });
      }
    }

    if (s.running) {
      var cap = vanCaption(s);
      labels.push({
        x: v.x, y: v.y, z: (v.z || 0) + 2.6, lift: 8,
        text: cap.text, sub: cap.sub,
        color: '#3d3831', tint: '#8a8272', size: 14, bold: true, mono: true,
        pri: 3
      });
    }

    drawLabels();
  }

  global.Renderer = {
    draw: draw,
    setLabels: function (v) { showLabels = v; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
