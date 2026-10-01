/* world.js — Decision Depot. Routes, stations, districts, buildings.
 *
 * Nothing here computes the lesson. model.js does. A station id is a step
 * in that call; a district id is the write-up the reader stops to read.
 * Stations are anchored to waypoint indices (route.cum[i]), never to
 * hand-measured distances.
 *
 * The journey:
 *   App Yard → System One Gate → State Bay → Question Forge
 *   → Choice Booth, Score Ramp, Noul Dial (one response, unrolled)
 *   → Wire Yard, where advanceRoute() turns for Review Bay or Act Gate.
 */
(function (global) {
  'use strict';

  var Iso = global.Iso;
  var makeRoute = Iso.makeRoute;

  /* Spine, then the three booths, then the junction the branch is decided at. */
  var OUT = makeRoute([
    [6, 16],     // 0 App Yard — the van starts here, before any station
    [14, 16],    // 1 System One Gate
    [23, 16],    // 2 State Bay
    [32, 16],    // 3 Question Forge
    [40, 16],    // 4 plaza before the booths
    [40, 9],     // 5 up onto the choice lane
    [49, 9],     // 6 Choice Booth
    [49, 16],    // 7 Score Ramp
    [49, 23],    // 8 Noul Dial
    [57, 23],    // 9 corner
    [57, 16]     // 10 Wire Yard — last point; the fork is the next route
  ]);

  /* Low choice confidence. South into Review Bay, then east to Act Gate. */
  var REVIEW = makeRoute([
    [57, 16],    // 0 junction
    [57, 25],    // 1 Review Bay
    [63, 25],    // 2 corner
    [63, 16]     // 3 Act Gate
  ]);

  /* Confidence cleared the review gate. Straight on to Act Gate. */
  var DIRECT = makeRoute([
    [57, 16],    // 0 junction
    [63, 16]     // 1 Act Gate
  ]);

  function station(route, idx, id, dwell) {
    return { dist: route.cum[idx], id: id, dwell: dwell == null ? 0.9 : dwell };
  }

  var STATIONS = {
    out: [
      station(OUT, 1, 'gate', 1.0),
      station(OUT, 2, 'state', 1.0),
      station(OUT, 3, 'forge', 1.3),
      station(OUT, 6, 'choice', 1.2),
      station(OUT, 7, 'score', 1.2),
      station(OUT, 8, 'noul', 1.2),
      station(OUT, 10, 'wire', 1.4)
    ],
    review: [
      station(REVIEW, 1, 'review', 1.3),
      station(REVIEW, 3, 'act', 1.5)
    ],
    direct: [
      station(DIRECT, 1, 'act', 1.5)
    ]
  };

  var STATION_TO_DISTRICT = {
    gate: 'gate', state: 'state', forge: 'forge',
    choice: 'choice', score: 'score', noul: 'noul',
    wire: 'wire', review: 'review', act: 'act'
  };

  var C = {
    steel:  '#4a7a9b',
    violet: '#6f63a8',
    ochre:  '#c2913c',
    stone:  '#7d8b96',
    rose:   '#b05470',
    sage:   '#6d9068',
    teal:   '#3f8a86',
    orange: '#c07a3c',
    brick:  '#a85a44',
    moss:   '#5f8a52',
    plum:   '#8b5f96',
    ink:    '#4a4540',
    paper:  '#e5e1d5',
    road:   '#c9c4b6',
    roadTop:'#d8d3c6'
  };

  var DISTRICTS = [
    {
      id: 'gate', name: 'System One Gate', x: 14, y: 16, r: 4.0, color: C.steel,
      tag: 'Decisions, not prose',
      short: 'A summarizing model writes prose. Jev returns fields your code can branch on.',
      body: 'Jev is TypeSafe’s flagship System One model: a hosted decision API, not a chat LLM. You send one shared state and typed questions, and your code branches on the fields that come back. The endpoint is POST https://api.typesafe.ai/v1/systemone, with a Bearer token and a model id such as jev-latest. The arch over this road is that gate. This town never opens the URL. Every number you see is computed in model.js by a local stub, and About says which of them to trust.'
    },
    {
      id: 'state', name: 'State Bay', x: 23, y: 16, r: 4.0, color: C.sage,
      tag: 'One shared state',
      short: 'Every question in the call reads the same state, so trim it to what the decision needs.',
      body: 'State is what every question evaluates. The API accepts a string, an object, or an array; this depot sends one string, the customer ticket. Questions travel beside it, and all 3 see the same value. The crate on the van is that string, and its height tracks the character count. Uncheck Trim and press Run. A footer is appended with the tokens login, password, and urgent. This stub counts tokens, so the shoe ticket stops being a billing and product split and noul crosses 0.70. A trained Jev might discount a footer. This stub will not.'
    },
    {
      id: 'forge', name: 'Question Forge', x: 32, y: 16, r: 4.0, color: C.orange,
      tag: 'Name the questions',
      short: 'You name each question. Those names come back as the keys on answers.',
      body: 'Each question has a key you choose, a type of choice, score, or noul, instructions, and criteria when the type needs them. This call asks 3: route_team, needs_human, and severity. System One scores every question in parallel, in one round trip. Extra questions barely add latency. Severity on a how-to is speculative fan-out: your code can drop it. Watch the bed. The 3 answer cards appear together here. The next booths are that one response, unrolled so each card can be read. Drag Levels, from 2 to 10, before the van arrives and the score card is rebuilt.'
    },
    {
      id: 'choice', name: 'Choice Booth', x: 49, y: 9, r: 3.6, color: C.plum,
      tag: 'Options → winner',
      short: 'A Choice picks one labelled option and returns the whole distribution.',
      body: 'Use a Choice when the answer is one label from a fixed set. criteria is a map of at most 255 keys, and a description may be null. The 4 keys are billing, identity, engineering, and product. choice is the highest probability, and probabilities sums to 1. TypeSafe derives confidence from that spread and does not publish the formula. The post heights are the stub softmax. Confidence here is 1 minus normalized entropy, marked fake in the ledger. On the shoe ticket the top 2 options are 1 keyword each, so confidence falls under 0.50 and the road turns. A tie keeps the earlier key.'
    },
    {
      id: 'score', name: 'Score Ramp', x: 49, y: 16, r: 3.5, color: C.ochre,
      tag: 'Levels → position',
      short: 'A Score is a probability-weighted position on an ordered ladder, and it may fall between rungs.',
      body: 'Use a Score for a position on a ladder. criteria is an array of 2 to 10 descriptions, low to high. probabilities is keyed by level index and sums to 1. score is each index times its probability, so it can fall between rungs. The published example is 0×0 + 1×0.70 + 2×0.30 = 1.30. legend maps each index back to your text. The bead sits at that fractional score, not on a step. Drag Levels from 5 to 2 before the forge, or press Run. The same ticket is rescored on a shorter ladder, and the bead moves.'
    },
    {
      id: 'noul', name: 'Noul Dial', x: 49, y: 23, r: 3.5, color: C.teal,
      tag: 'Yes → probability',
      short: 'Noul is the probability of yes. It does not carry a separate confidence.',
      body: 'A Noul is one yes-or-no. noul runs from 0 to 1, with no confidence beside it. Near 1 is a strong yes, near 0 a strong no, and near 0.5 means the two are about equally likely, not a medium severity. A spectrum is a Score. This call sets optional true and false criteria. The needle is a sigmoid of keyword counts, not a calibrated Jev probability. Escalate starts at 0.70, assumed. Drag it above the live noul before Act Gate. The needle stays. The lamp changes, because the cutoff was never part of the answer.'
    },
    {
      id: 'wire', name: 'Wire Yard', x: 57, y: 16, r: 3.8, color: C.brick,
      tag: 'One POST',
      short: 'The response is the model id, your answers, and token usage, from one POST.',
      body: 'The request is model, state, and questions, and there must be at least 1 question. This town sends jev-latest. A production call can pin a build such as jev-1.13.0. The response is that model id, answers keyed by your names, and usage with input_tokens and output_tokens. Each answer carries a type. Token counts on the panel are estimated: characters divided by 4 on the way in, and 12 per question on the way out. Nothing here sends a Bearer token. The junction applies your review threshold to choice confidence. Under the line the road turns south. Over it, the van drives straight to Act Gate.'
    },
    {
      id: 'review', name: 'Review Bay', x: 57, y: 25, r: 3.6, color: C.rose,
      tag: 'Low confidence',
      short: 'Low confidence means do not guess. The van turns because your threshold said so.',
      body: 'Confidence-gated routing uses the answer as one axis and confidence as the other. Act when it is high, be careful in the middle, and hand the case to a person when it is low. One Choice example in the docs refuses to guess below 0.50. This bay uses that figure as the default, and only on route_team. Noul has no confidence field, so you threshold noul itself at Act Gate. The turn is the point of drawing a town: a lower confidence is a different road, and you can watch the van take it. Drag Review under the live choice confidence and press Run. The same state skips this bay.'
    },
    {
      id: 'act', name: 'Act Gate', x: 63, y: 16, r: 3.6, color: C.moss,
      tag: 'Your code branches',
      short: 'Jev returns fields. The if statements that act on them belong to your code.',
      body: 'Two checks run here, and both are ordinary code. If needs_human.noul is above the escalate slider, the right lamp lights. If it is not, the left lamp lights and route_team is what a switch would take. Neither lamp is a response field. Jev returned choice, probabilities, confidence, score, legend, and noul. The if is yours, so a bad cutoff is a diff rather than a sentence buried in a prompt. On the outage ticket, noul sits near 1 and the right lamp lights, while Review Bay is skipped because choice confidence is high. Move a slider and press Run. The lamp follows the cutoff.'
    }
  ];

  var DISTRICT_BY_ID = {};
  DISTRICTS.forEach(function (d) { DISTRICT_BY_ID[d.id] = d; });

  function readSeconds(stationId) {
    var d = DISTRICT_BY_ID[STATION_TO_DISTRICT[stationId] || stationId];
    if (!d) return 9;
    var words = (d.short + ' ' + d.body).split(/\s+/).length;
    return Math.min(26, Math.max(9, words / 3.8 + 3.5));
  }

  var buildings = [];
  var props = [];

  function put(o) { buildings.push(o); return o; }

  function block(x, y, o) {
    put({
      x: x, y: y, z: 0, w: o.w, d: o.d, h: o.h, color: o.color,
      roof: o.roof, roofH: o.roofH,
      windows: { cols: o.cols || 3, seed: Math.round(x * 7 + y * 13), color: o.lit }
    });
  }

  function distToRoutes(x, y) {
    var best = 1e9;
    [OUT, REVIEW, DIRECT].forEach(function (r) {
      r.segs.forEach(function (s) {
        var vx = s.b.x - s.a.x, vy = s.b.y - s.a.y;
        var len2 = vx * vx + vy * vy || 1;
        var t = ((x - s.a.x) * vx + (y - s.a.y) * vy) / len2;
        t = Math.max(0, Math.min(1, t));
        var d = Math.hypot(x - (s.a.x + vx * t), y - (s.a.y + vy * t));
        if (d < best) best = d;
      });
    });
    return best;
  }

  function build() {
    if (buildings.length) return;

    /* App Yard: where the ticket is written, before the gate. */
    block(2.2, 10.2, { w: 3.2, d: 2.4, h: 2.2, color: '#c3d0d9', cols: 3, lit: C.steel, roof: '#9aa8b2', roofH: 0.6 });
    put({ kind: 'screen', x: 7.2, y: 11.4, color: C.steel });

    /* System One Gate: the road passes under a single arch, piece by piece. */
    put({ kind: 'gatePost', x: 14, y: 14.3, color: C.steel });
    put({ kind: 'gateBeam', x: 14, y: 16.0, color: C.steel });
    put({ kind: 'gatePost', x: 14, y: 17.7, color: C.steel });
    block(10.4, 9.6, { w: 2.8, d: 2.2, h: 2.0, color: '#c5d3dc', cols: 2, lit: C.steel, roof: '#9aa8b2', roofH: 0.5 });

    /* State Bay: a shed set back north of the road. The crate row is the state. */
    put({ kind: 'dock', x: 23, y: 10.6, color: C.sage });
    block(18.6, 9.2, { w: 2.4, d: 2.0, h: 1.8, color: '#c5d4c0', cols: 2, lit: C.sage });

    /* Question Forge: three molds, one per question, lit together. */
    put({ kind: 'forge', x: 32, y: 10.4, color: C.orange });
    block(27.4, 9.4, { w: 2.6, d: 2.0, h: 2.2, color: '#e0c1a2', cols: 2, lit: C.orange });

    /* Choice Booth: four posts, heights are the live distribution. */
    put({ kind: 'posts', x: 49, y: 5.6, color: C.plum });
    block(43.6, 3.6, { w: 2.4, d: 2.0, h: 1.8, color: '#d5c3da', cols: 2, lit: C.plum });

    /* Score Ramp: steps and a bead at the fractional score. */
    put({ kind: 'ramp', x: 49, y: 12.15, color: C.ochre });

    /* Noul Dial, in the gap between the score lane and the noul lane. */
    put({ kind: 'dial', x: 45.2, y: 19.6, color: C.teal });
    block(36.4, 26.4, { w: 2.2, d: 1.8, h: 1.6, color: '#b7d0ce', cols: 2, lit: C.teal });

    /* Wire Yard: a second arch, so the response is a gate the van drives under. */
    put({ kind: 'gatePost', x: 57, y: 14.3, color: C.brick });
    put({ kind: 'gateBeam', x: 57, y: 16.0, color: C.brick });
    put({ kind: 'gatePost', x: 57, y: 17.7, color: C.brick });

    /* Review Bay, west of the south spur so the van is not swallowed. */
    put({ kind: 'desk', x: 52.4, y: 23.2, color: C.rose });
    block(49.6, 28.6, { w: 2.4, d: 1.8, h: 1.6, color: '#e3c5ce', cols: 2, lit: C.rose });

    /* Act Gate: two lamps. Left is automatic, right escalates. */
    put({ kind: 'lamps', x: 63, y: 12.2, color: C.moss });
    block(59.2, 10.0, { w: 2.4, d: 1.8, h: 1.7, color: '#c3d4bd', cols: 2, lit: C.moss });

    var spots = [
      [10, 4], [18, 4], [28, 5], [36, 4], [44, 12], [36, 22],
      [20, 22], [12, 24], [8, 28], [30, 28], [40, 30], [62, 22],
      [68, 12], [68, 20], [46, 28], [24, 28], [16, 12]
    ];
    spots.forEach(function (s, i) {
      if (distToRoutes(s[0], s[1]) < 2.8) return;
      var n = Iso.hash2(s[0], s[1], 3);
      if (n < 0.42) {
        block(s[0], s[1], {
          w: 1.6 + n * 1.2, d: 1.5 + n * 0.6, h: 1.3 + n * 1.4,
          color: n < 0.2 ? '#d8cfbe' : '#cfc7b6', cols: 2, lit: '#8b9aa4',
          roof: '#b09a86', roofH: 0.45
        });
      } else {
        props.push({ kind: n < 0.75 ? 'tree' : 'lamp', x: s[0], y: s[1], seed: i });
      }
    });

    for (var k = 0; k < 4; k++) {
      var lx = 18 + k * 6;
      props.push({ kind: 'lamp', x: lx, y: k % 2 ? 19.2 : 12.6, seed: 40 + k });
    }
  }

  global.World = {
    GW: 70, GH: 34,
    routes: { out: OUT, review: REVIEW, direct: DIRECT },
    stations: STATIONS,
    districts: DISTRICTS,
    districtById: DISTRICT_BY_ID,
    stationToDistrict: STATION_TO_DISTRICT,
    readSeconds: readSeconds,
    buildings: buildings,
    props: props,
    palette: C,
    distToRoutes: distToRoutes,
    build: build
  };
})(typeof window !== 'undefined' ? window : globalThis);
