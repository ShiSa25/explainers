/* sim.js — walk one System One call through Decision Depot.
 *
 * The pacing engine is the template's. Three ideas do the work:
 *
 *   1. The van moves along a route by distance. A station fires when it
 *      passes one. Stations own the model steps; travel owns nothing.
 *   2. The first time a district is reached, the van stops long enough to
 *      read the write-up. Later visits get a short beat.
 *   3. tour.seen lives outside the run, so Run keeps what you have read
 *      and Reset replays the slow tour.
 *
 * The algorithm, in the order the van meets it:
 *   forge  — Jev.systemOne() once. Choice, Score, and Noul land together.
 *   booths — reveal those answers. They do not recompute.
 *   wire   — the response is on the crate. The fork is not taken yet.
 *   advanceRoute() — the only branch. Low choice confidence turns south.
 *   act    — applyPolicy() freezes the escalate lamp. Code, not the model.
 */
(function (global) {
  'use strict';

  var Jev = global.Jev;
  var World = global.World;
  var Iso = global.Iso;

  var BASE_SPEED = 6;

  var tour = { seen: Object.create(null), done: false };

  var state = {
    running: false,
    paused: true,
    finished: false,

    station: null,
    stationT: 0,
    stepMode: false,
    speed: 1,

    /* Model inputs. Sliders write these; systemOne reads them at the forge. */
    ticketIndex: 0,
    trim: true,             // ASSUMED default: send the customer text only
    levels: 5,              // mandated range is 2–10; 5 is the teaching default
    reviewBelow: 0.5,       // ASSUMED, matching a docs example of confidence < 0.5
    escalateAbove: 0.7,     // ASSUMED, in the spirit of the docs' noul > 0.7 example

    /* Frozen as the van passes the stations that own them. */
    call: null,
    branch: null,
    acted: null,
    visited: null,
    reviewThisTrip: false,

    reading: false,
    dwellLeft: 0,
    dwellTotal: 0,
    fastForward: false,
    tourDone: false
  };

  var van = {
    routeName: 'out',
    dist: 0,
    dwell: 0,
    stationIdx: 0
  };

  var listeners = [];
  function emit(name, payload) {
    for (var i = 0; i < listeners.length; i++) listeners[i](name, payload);
  }

  function mark(id) {
    state.visited[id] = true;
  }

  function levelCount(call) {
    var q = call && call.request && call.request.questions && call.request.questions.severity;
    return q && q.criteria ? q.criteria.length : 0;
  }

  /* Live projection. Stations already passed keep the object they froze. */
  function planNow() {
    var ticket = Jev.TICKETS[state.ticketIndex] || Jev.TICKETS[0];
    var text = Jev.composeState(ticket.text, state.trim);
    var levels = state.levels | 0;
    var liveCall = Jev.systemOne(text, { levels: levels });
    var call = state.call || liveCall;
    var stale = !!(state.call && (state.call.request.state !== text || levelCount(state.call) !== levels));
    var live = Jev.applyPolicy(call, {
      reviewBelow: state.reviewBelow,
      escalateAbove: state.escalateAbove
    });
    var policy = live;
    if (state.acted) {
      policy = {
        review: state.branch.review,
        escalate: state.acted.escalate,
        action: state.acted.action,
        team: state.acted.team,
        confidence: state.acted.confidence,
        noul: state.acted.noul,
        score: state.acted.score,
        reviewBelow: state.acted.reviewBelow,
        escalateAbove: state.acted.escalateAbove
      };
    } else if (state.branch) {
      policy = {
        review: state.branch.review,
        escalate: live.escalate,
        action: state.branch.review ? 'review' : (live.escalate ? 'escalate' : 'auto'),
        team: live.team,
        confidence: call.response.answers.route_team.confidence,
        noul: live.noul,
        score: live.score,
        reviewBelow: state.branch.reviewBelow,
        escalateAbove: state.escalateAbove
      };
    }
    return { call: call, policy: policy, stale: stale, frozenCall: !!state.call, frozenBranch: !!state.branch, frozenAct: !!state.acted };
  }

  function beginTrip() {
    state.call = null;
    state.branch = null;
    state.acted = null;
    state.visited = Object.create(null);
    state.reviewThisTrip = false;
    state.station = null;
    state.fastForward = false;
    state.reading = false;
    state.dwellLeft = 0;
    state.dwellTotal = 0;
    van.routeName = 'out';
    van.dist = 0;
    van.stationIdx = 0;
    van.dwell = 0;
  }

  function reset() {
    state.finished = false;
    state.tourDone = tour.done;
    beginTrip();
  }

  function run() {
    reset();
    state.running = true;
    state.paused = false;
    emit('reset');
  }

  /* ---- per-station work -------------------------------------------------- */

  var OPS = {
    gate: function () { mark('gate'); },
    state: function () { mark('state'); },

    /* The only call. Three answers, one shared state, no network. */
    forge: function () {
      mark('forge');
      var ticket = Jev.TICKETS[state.ticketIndex] || Jev.TICKETS[0];
      var text = Jev.composeState(ticket.text, state.trim);
      state.call = Jev.systemOne(text, { levels: state.levels | 0 });
    },

    choice: function () { mark('choice'); },
    score: function () { mark('score'); },
    noul: function () { mark('noul'); },

    /* The response is in hand. The turn itself waits for advanceRoute(). */
    wire: function () { mark('wire'); },

    review: function () { mark('review'); },

    act: function () {
      mark('act');
      var call = state.call;
      var live = Jev.applyPolicy(call, {
        reviewBelow: state.branch ? state.branch.reviewBelow : state.reviewBelow,
        escalateAbove: state.escalateAbove
      });
      var review = state.branch ? state.branch.review : live.review;
      state.acted = {
        escalate: live.escalate,
        action: review ? (live.escalate ? 'review+escalate' : 'review') : (live.escalate ? 'escalate' : 'auto'),
        team: live.team,
        noul: live.noul,
        confidence: call.response.answers.route_team.confidence,
        score: live.score,
        reviewBelow: state.branch ? state.branch.reviewBelow : state.reviewBelow,
        escalateAbove: state.escalateAbove
      };
      tour.done = true;
      state.tourDone = true;
    }
  };

  function travelBoost() {
    return (state.fastForward ? 2.4 : 1) * (state.tourDone ? 3.0 : 1);
  }
  function dwellBoost() {
    return (state.fastForward ? 2.2 : 1) * (state.tourDone ? 1.4 : 1);
  }

  function fire(st) {
    state.station = st.id;
    state.stationT = 0;
    var op = OPS[st.id];
    if (op) op();
    emit('station', st.id);
  }

  /* The only place the road forks. */
  function advanceRoute() {
    if (van.routeName === 'out') {
      var call = state.call;
      var reviewBelow = state.reviewBelow;
      var decision = Jev.applyPolicy(call, {
        reviewBelow: reviewBelow,
        escalateAbove: state.escalateAbove
      });
      state.branch = { review: decision.review, reviewBelow: reviewBelow };
      state.reviewThisTrip = decision.review;
      van.routeName = decision.review ? 'review' : 'direct';
      van.dist = 0;
      van.stationIdx = 0;
      van.dwell = 0.35;
      return;
    }
    state.finished = true;
    state.paused = true;
    state.station = 'done';
    emit('station', 'done');
  }

  function update(dt) {
    state.stationT += dt;
    if (!state.running || state.paused || state.finished) return;

    var sdt = dt * state.speed * travelBoost();

    if (van.dwell > 0) {
      /* Reading time scales with the speed slider only. */
      van.dwell -= dt * state.speed;
      state.dwellLeft = Math.max(0, van.dwell);
      if (van.dwell <= 0) { state.reading = false; state.dwellTotal = 0; }
      return;
    }

    var route = World.routes[van.routeName];
    van.dist += BASE_SPEED * sdt;

    var sts = World.stations[van.routeName];
    if (van.stationIdx < sts.length) {
      var st = sts[van.stationIdx];
      if (van.dist >= st.dist) {
        van.dist = st.dist;
        van.stationIdx++;
        var topic = World.stationToDistrict[st.id] || st.id;
        var firstTime = !tour.seen[topic];
        fire(st);
        tour.seen[topic] = true;
        van.dwell = firstTime ? World.readSeconds(st.id) : st.dwell / dwellBoost();
        state.reading = firstTime;
        state.dwellTotal = van.dwell;
        state.dwellLeft = van.dwell;
        if (state.stepMode) { state.paused = true; state.stepMode = false; }
        return;
      }
    }

    if (van.dist >= route.total) advanceRoute();
  }

  function vanPosition() {
    return Iso.smoothAt(World.routes[van.routeName], van.dist, 0.8);
  }

  global.Sim = {
    state: state,
    van: van,
    run: run,
    reset: function () { reset(); emit('reset'); },
    replayTour: function () { tour.seen = Object.create(null); tour.done = false; },
    update: update,
    vanPosition: vanPosition,
    planNow: planNow,
    on: function (fn) { listeners.push(fn); },
    play: function () { if (!state.finished) { state.paused = false; state.running = true; } },
    pause: function () { state.paused = true; },
    toggle: function () { if (state.paused) this.play(); else this.pause(); },
    step: function () {
      if (state.finished) return;
      state.running = true;
      state.stepMode = true;
      state.paused = false;
      if (van.dwell > 0) van.dwell = 0;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
