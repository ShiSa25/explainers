/* model.js — one System One call, computed locally.
 *
 * THIS IS THE LESSON. Written before any scenery. Every number on the panel
 * comes out of systemOne() or applyPolicy() below. Nothing is a table of
 * pre-baked answers: change the ticket text and the probabilities move
 * because the feature counts moved.
 *
 * Real Jev is a trained hosted model:
 *   POST https://api.typesafe.ai/v1/systemone
 *   Authorization: Bearer $TYPESAFE_API_KEY
 * This file does not call it. A static GitHub Pages site has no key, and a
 * keyword stub is not a model. Treat the mechanism (shared state, typed
 * questions, parallel answers, code-owned thresholds) as the lesson. Treat
 * the probabilities as a worked example of the wire shape.
 *
 * The honest boundary, restated in the About modal and the README:
 *
 *   Mandated, and computed here in the mandated shape
 *     Request { model, state, questions } with at least one question.
 *     Questions share one state and are scored in one call, not three.
 *     Choice → { type, choice, probabilities, confidence }; probabilities sum to 1.
 *     Score  → { type, score, probabilities, legend, confidence };
 *              score = Σ (levelIndex × probability), so it can fall between rungs.
 *              Level count is an integer from 2 to 10.
 *     Noul   → { type, noul } in [0, 1]. No confidence field.
 *     Response { model, answers keyed by your question names, usage }.
 *     applyPolicy() is ordinary code: it thresholds noul and choice confidence.
 *     The model does not own those cutoffs.
 *
 *   Scaled down
 *     Four Choice options, not the API maximum of 255.
 *     One string of state, not an object or array (both are legal).
 *     Five score levels by default, inside the mandated 2–10.
 *
 *   ASSUMED
 *     The four toy tickets, the footer used by the Trim toggle, the escalate
 *     cutoff 0.70 and the review cutoff 0.50, the feature word lists, and
 *     every weight below. Token counts are ceil(chars / 4) in and 12 per
 *     question out — a stand-in, not Jev's tokenizer.
 *
 *   PEDAGOGUE FAKE
 *     Logits are a weighted sum of keyword counts, then a softmax (Choice,
 *     Score) or a sigmoid (Noul). That is not how Jev is trained.
 *     confidence is 1 − H/ln(K), normalized Shannon entropy. TypeSafe derives
 *     confidence from the distribution but does not publish the statistic
 *     (docs.typesafe.ai/confidence). Do not quote these confidences as Jev's.
 */
(function (global) {
  'use strict';

  var MODEL_ID = 'jev-latest';     // mandated example id; pin e.g. jev-1.13.0 in production
  var CHARS_PER_TOKEN = 4;         // ASSUMED: usage.input_tokens stand-in
  var OUTPUT_TOKENS_PER_Q = 12;    // ASSUMED: usage.output_tokens stand-in
  var CHOICE_BIAS = -0.15;         // ASSUMED: shared logit before any keyword hits
  var HIT = 1.05;                  // ASSUMED: logit added per keyword hit
  var SCORE_SIGMA = 0.82;          // ASSUMED: how wide the level distribution is
  var SCORE_RAW_SPAN = 4.2;        // ASSUMED: feature mass that maps onto the top rung

  /* ASSUMED pedagogy weights for the noul logit. A positive logit is "yes". */
  var NOUL_W = {
    bias: -1.35,
    urgent: 0.72,
    human: 0.55,
    engineering: 0.38,
    identity: 0.45,
    billing: 0.06,
    product: -0.08,
    length: 0.25
  };

  /* Choice option order is the tie-break: argmax walks this list. */
  var CHOICE_KEYS = ['billing', 'identity', 'engineering', 'product'];

  /* Mandated shape: criteria is a map, description may be null, max 255. */
  var CHOICE_CRITERIA = {
    billing: 'Payment, refund, invoice, or subscription issues',
    identity: 'Login, password, account access, or authentication',
    engineering: 'Crashes, errors, outages, or product defects',
    product: 'How-to questions and feature requests'
  };

  /* Ten descriptions so a 2–10 slider can slice a prefix. The count limit is
     mandated; these sentences are ASSUMED teaching copy. */
  var LEVEL_TEXT = [
    'No real impact; a question or a nit',
    'Inconvenience; a workaround exists',
    'A feature is broken for this customer',
    'Blocking; the customer cannot proceed',
    'Widespread failure for many customers',
    'Production outage on one surface',
    'Production outage across the product',
    'Data loss or a security incident',
    'Safety-critical, or the whole site is down',
    'The service cannot operate'
  ];

  /* ASSUMED word lists. A token may increment more than one list ("failing"
     is both an engineering defect and an urgency mark). Matching is exact
     on tokens split on non-letters, not a substring search. */
  var LEXICON = {
    billing: ['refund', 'charge', 'charged', 'invoice', 'billing', 'payment', 'subscription', 'payout', 'duplicate'],
    identity: ['login', 'password', 'account', 'auth', 'locked', 'signin', 'credentials'],
    engineering: ['crash', 'error', 'errors', 'bug', 'timeout', 'timeouts', 'exception', 'outage', 'failing', 'failed', '500'],
    product: ['export', 'docs', 'feature', 'question', 'how', 'where', 'size'],
    urgent: ['urgent', 'asap', 'immediately', 'outage', 'production', 'down', 'critical', 'failing', 'failed', 'help'],
    human: ['agent', 'human', 'person', 'manager', 'engineer', 'someone']
  };

  /* Appended when Trim is off. ASSUMED: a leaked footer, so the reader can
     watch keyword counts move. It is part of the state string, not a question. */
  var FOOTER = ' Internal footer: account login password credentials auth. Macro prints the word urgent on every ticket.';

  /* Inputs, not answers. systemOne() never switches on these ids. */
  var TICKETS = [
    {
      id: 'ambiguous',
      label: 'Ambiguous',
      text: 'My running shoes arrived in the wrong size and my card was charged twice. Can someone help?'
    },
    {
      id: 'outage',
      label: 'Outage',
      text: 'Production is down. The checkout API returns 500 errors and timeouts. This is urgent — please get an engineer, the site has been failing for 40 minutes.'
    },
    {
      id: 'billing',
      label: 'Billing',
      text: 'Please refund the duplicate subscription charge on invoice 1842. The payment was charged twice yesterday.'
    },
    {
      id: 'howto',
      label: 'How-to',
      text: 'How do I export last month docs? I have a question about where the feature lives.'
    }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function tokensOf(text) {
    return String(text).toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length > 0; });
  }

  function countHits(toks, words) {
    var set = Object.create(null);
    var i, n = 0;
    for (i = 0; i < words.length; i++) set[words[i]] = 1;
    for (i = 0; i < toks.length; i++) if (set[toks[i]]) n++;
    return n;
  }

  function extractFeatures(text) {
    var toks = tokensOf(text);
    var f = {
      chars: String(text).length,
      tokens: toks.length,
      length01: clamp(String(text).length / 480, 0, 1)
    };
    var k;
    for (k in LEXICON) {
      if (Object.prototype.hasOwnProperty.call(LEXICON, k)) f[k] = countHits(toks, LEXICON[k]);
    }
    return f;
  }

  function composeState(ticketText, trim) {
    return trim ? String(ticketText) : String(ticketText) + FOOTER;
  }

  /* Stable softmax over a plain object of logits. Subtract the max first. */
  function softmax(logits) {
    var keys = Object.keys(logits);
    var i, m = -Infinity, sum = 0, exps = {}, out = {};
    for (i = 0; i < keys.length; i++) if (logits[keys[i]] > m) m = logits[keys[i]];
    for (i = 0; i < keys.length; i++) {
      exps[keys[i]] = Math.exp(logits[keys[i]] - m);
      sum += exps[keys[i]];
    }
    for (i = 0; i < keys.length; i++) out[keys[i]] = sum > 0 ? exps[keys[i]] / sum : 1 / keys.length;
    return out;
  }

  function sigmoid(z) {
    if (z >= 0) return 1 / (1 + Math.exp(-z));
    var e = Math.exp(z);
    return e / (1 + e);
  }

  /* PEDAGOGUE FAKE. Not the unpublished TypeSafe statistic.
     1 when all mass sits on one bin, 0 when the distribution is flat. */
  function confidenceFromDistribution(probs) {
    var keys = Object.keys(probs);
    var k = keys.length;
    if (k <= 1) return 1;
    var h = 0, i, p;
    for (i = 0; i < k; i++) {
      p = probs[keys[i]];
      if (p > 1e-12) h -= p * Math.log(p);
    }
    var hMax = Math.log(k);
    return clamp(1 - (hMax > 0 ? h / hMax : 0), 0, 1);
  }

  function argmax(probs, order) {
    var bestK = order[0], best = -1, i, p;
    for (i = 0; i < order.length; i++) {
      p = probs[order[i]];
      if (p > best) { best = p; bestK = order[i]; }
    }
    return bestK;
  }

  function sumValues(obj) {
    var s = 0, k;
    for (k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) s += obj[k];
    return s;
  }

  function questionChars(questions) {
    var n = 0, id, q, k, i;
    for (id in questions) {
      if (!Object.prototype.hasOwnProperty.call(questions, id)) continue;
      q = questions[id];
      n += id.length + String(q.instructions || '').length + String(q.type || '').length;
      if (q.criteria && typeof q.criteria === 'object' && !Array.isArray(q.criteria)) {
        for (k in q.criteria) {
          if (Object.prototype.hasOwnProperty.call(q.criteria, k) && q.criteria[k] != null) {
            n += k.length + String(q.criteria[k]).length;
          }
        }
      } else if (Array.isArray(q.criteria)) {
        for (i = 0; i < q.criteria.length; i++) n += String(q.criteria[i]).length;
      }
    }
    return n;
  }

  function buildQuestions(levelCount) {
    var n = clamp(levelCount | 0, 2, 10);
    var criteria = LEVEL_TEXT.slice(0, n);
    return {
      route_team: {
        type: 'choice',
        instructions: 'Which team should handle this ticket?',
        criteria: CHOICE_CRITERIA
      },
      needs_human: {
        type: 'noul',
        instructions: 'Does this ticket need a human before any automated reply?',
        criteria: {
          true: 'Explicit urgency, an outage, or a request for a person',
          false: 'A routine request an automated reply could start'
        }
      },
      severity: {
        type: 'score',
        instructions: 'How severe is the impact described in the ticket?',
        criteria: criteria
      }
    };
  }

  function choiceAnswer(features) {
    var logits = {};
    var i, key;
    for (i = 0; i < CHOICE_KEYS.length; i++) {
      key = CHOICE_KEYS[i];
      logits[key] = CHOICE_BIAS + HIT * (features[key] || 0);
    }
    var probabilities = softmax(logits);
    return {
      type: 'choice',
      choice: argmax(probabilities, CHOICE_KEYS),
      probabilities: probabilities,
      confidence: confidenceFromDistribution(probabilities)
    };
  }

  function noulAnswer(features) {
    var z = NOUL_W.bias
      + NOUL_W.urgent * features.urgent
      + NOUL_W.human * features.human
      + NOUL_W.engineering * features.engineering
      + NOUL_W.identity * features.identity
      + NOUL_W.billing * features.billing
      + NOUL_W.product * features.product
      + NOUL_W.length * features.length01;
    return { type: 'noul', noul: sigmoid(z) };
  }

  /* Position on 0..n-1 from feature mass, then a gaussian-like softmax around
     it. score is the mandated probability-weighted index. */
  function scoreAnswer(features, levelCount) {
    var n = clamp(levelCount | 0, 2, 10);
    var span = n - 1;
    var raw = 0.55 * Math.min(features.engineering, 4)
      + 0.42 * Math.min(features.urgent, 4)
      + 0.20 * Math.min(features.billing, 4)
      + 0.15 * Math.min(features.human, 3)
      + 0.35 * features.length01;
    var pos = clamp(raw / SCORE_RAW_SPAN * span, 0, span);
    /* pos is the feature target the softmax is centred on. It is not a wire
       field; score below is the mandated probability-weighted index. */
    var logits = {};
    var legend = {};
    var i;
    var denom = 2 * SCORE_SIGMA * SCORE_SIGMA;
    for (i = 0; i < n; i++) {
      logits[String(i)] = -((i - pos) * (i - pos)) / denom;
      legend[String(i)] = LEVEL_TEXT[i];
    }
    var probabilities = softmax(logits);
    var score = 0;
    for (i = 0; i < n; i++) score += i * probabilities[String(i)];
    return {
      type: 'score',
      score: score,
      confidence: confidenceFromDistribution(probabilities),
      legend: legend,
      probabilities: probabilities
    };
  }

  function systemOne(stateText, opts) {
    opts = opts || {};
    var levels = clamp((opts.levels == null ? 5 : opts.levels) | 0, 2, 10);
    var model = opts.model || MODEL_ID;
    var features = extractFeatures(stateText);
    var questions = buildQuestions(levels);
    var answers = {
      route_team: choiceAnswer(features),
      needs_human: noulAnswer(features),
      severity: scoreAnswer(features, levels)
    };
    /* Noul answers do not carry confidence. Drop it if a future edit adds one. */
    if (answers.needs_human.confidence != null) delete answers.needs_human.confidence;

    var qChars = questionChars(questions);
    var usage = {
      input_tokens: Math.max(1, Math.ceil((String(stateText).length + qChars) / CHARS_PER_TOKEN)),
      output_tokens: OUTPUT_TOKENS_PER_Q * 3
    };

    return {
      /* Wire shapes. Panel and ledger quote these, not the underscore fields. */
      request: { model: model, state: String(stateText), questions: questions },
      response: { model: model, answers: answers, usage: usage },
      /* Stub internals. Not API fields. */
      features: features
    };
  }

  /* Code-owned policy. ASSUMED defaults: noul > 0.70 escalates, choice
     confidence < 0.50 sends the van to Review Bay. Jev does not return an
     action; this function is the if-statement at Act Gate. */
  function applyPolicy(call, thresholds) {
    var t = thresholds || {};
    var reviewBelow = t.reviewBelow == null ? 0.5 : t.reviewBelow;
    var escalateAbove = t.escalateAbove == null ? 0.7 : t.escalateAbove;
    var choice = call.response.answers.route_team;
    var noul = call.response.answers.needs_human.noul;
    var score = call.response.answers.severity.score;
    var review = choice.confidence < reviewBelow;
    var escalate = noul > escalateAbove;
    var action = review ? 'review' : (escalate ? 'escalate' : 'auto');
    return {
      review: review,
      escalate: escalate,
      action: action,
      team: choice.choice,
      confidence: choice.confidence,
      noul: noul,
      score: score,
      reviewBelow: reviewBelow,
      escalateAbove: escalateAbove
    };
  }

  function fmtProb(p) {
    return (Math.round(p * 1000) / 10).toFixed(1) + '%';
  }

  function fmtNum(n, digits) {
    var d = digits == null ? 2 : digits;
    var f = Math.pow(10, d);
    return (Math.round(n * f) / f).toFixed(d);
  }

  function probSum(obj) {
    return sumValues(obj);
  }

  global.Jev = {
    MODEL_ID: MODEL_ID,
    CHARS_PER_TOKEN: CHARS_PER_TOKEN,
    OUTPUT_TOKENS_PER_Q: OUTPUT_TOKENS_PER_Q,
    TICKETS: TICKETS,
    FOOTER: FOOTER,
    CHOICE_KEYS: CHOICE_KEYS,
    LEVEL_TEXT: LEVEL_TEXT,
    LEXICON: LEXICON,
    composeState: composeState,
    extractFeatures: extractFeatures,
    softmax: softmax,
    sigmoid: sigmoid,
    confidenceFromDistribution: confidenceFromDistribution,
    buildQuestions: buildQuestions,
    systemOne: systemOne,
    applyPolicy: applyPolicy,
    fmtProb: fmtProb,
    fmtNum: fmtNum,
    probSum: probSum
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
