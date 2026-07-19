(function () {
  'use strict';

  var SUPABASE_URL = 'https://jnouvwxomrcffqwilqkq.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_RkMJQopffWlV6DSwCRkndQ_Xw6GJMf3';
  var COMMUNITY_URL = 'https://www.btownbrief.com/community';

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function store(k, d) {
    try { var raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : d; } catch (e) { return d; }
  }
  function save(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  var visitor = store('ch-visitor', null);
  if (!visitor) {
    visitor = 'v' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    save('ch-visitor', visitor);
  }

  var CATEGORIES = [];
  var CHALLENGES = [];
  var completions = [];
  var category = (store('ch-dials', {}) || {}).category || 'all';
  var done = store('ch-done', {}) || {};
  var reported = store('ch-reported', {}) || {};
  var expanded = {};
  var townMode = null;
  var linkedId = null;

  function track(ev, page) {
    fetch(SUPABASE_URL + '/rest/v1/rpc/btb_track_event', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_event: ev, p_page: page || '', p_variant: '' }),
      keepalive: true
    }).catch(function () {});
  }

  function rpc(fn, args) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(function (res) {
      if (!res.ok) throw new Error(fn + ' → ' + res.status);
      return res.text().then(function (text) { return text ? JSON.parse(text) : null; });
    });
  }

  function localCompletions() { return store('ch-local', []) || []; }
  function saveLocal(row) {
    var rows = localCompletions();
    rows.unshift(row);
    save('ch-local', rows);
    completions = rows;
  }

  function challengeById(id) {
    return CHALLENGES.filter(function (challenge) { return challenge.id === id; })[0];
  }

  function detailHtml(detail) {
    if (/^https:\/\//.test(detail)) {
      return '<a href="' + esc(detail) + '" target="_blank" rel="noopener">' + esc(detail) + '</a>';
    }
    return esc(detail);
  }

  function boardHtml(challenge) {
    var rows = completions.filter(function (row) { return row.chid === challenge.id; });
    var count = rows.length;
    var limit = expanded[challenge.id] ? rows.length : 5;
    var list = rows.slice(0, limit).map(function (row) {
      return '<li class="completion">' +
        '<button class="report" type="button" data-report="' + esc(row.id) + '" title="Report" aria-label="Report ' +
          esc(row.name) + '"' + (reported[row.id] ? ' disabled' : '') + '>⚑</button>' +
        '<p class="completion-line"><span class="completion-name">' + esc(row.name) + '</span>' +
          (row.note ? ' — ' + esc(row.note) : '') + '</p>' +
      '</li>';
    }).join('');

    return '<div class="board" data-board="' + esc(challenge.id) + '">' +
      '<div class="board-top"><h3 class="board-title">' + count + ' ' +
        (count === 1 ? 'person has' : 'people have') + ' done it</h3></div>' +
      (count ? '<ol class="board-list">' + list + '</ol>' : '<p class="board-empty">No one yet. Be the first.</p>') +
      (rows.length > 5 ? '<button class="linkish show-all" type="button" data-expand="' + esc(challenge.id) + '">' +
        (expanded[challenge.id] ? 'Show less' : 'Show all') + '</button>' : '') +
      '<button class="btn btn-go done-button" type="button" data-did="' + esc(challenge.id) + '"' +
        (done[challenge.id] ? ' disabled' : '') + '>' + (done[challenge.id] ? 'You did it' : 'I did it →') + '</button>' +
      '<form class="done-form" data-form="' + esc(challenge.id) + '" hidden novalidate>' +
        '<div class="form-row">' +
          '<input name="name" type="text" minlength="2" maxlength="40" placeholder="Your name" aria-label="Your name" required>' +
          '<input name="note" type="text" maxlength="200" placeholder="how’d it go? (optional)" aria-label="How did it go?">' +
        '</div>' +
        '<div class="form-actions"><button class="btn btn-quiet" type="submit">Put me on the board</button>' +
          '<p class="form-error" hidden></p></div>' +
      '</form>' +
      '<p class="town-status" hidden></p>' +
    '</div>';
  }

  function cardHtml(challenge) {
    return '<article class="challenge' + (linkedId === challenge.id ? ' is-linked' : '') + '" id="challenge-' +
      esc(challenge.id) + '" data-category="' + esc(challenge.category) + '">' +
      '<div class="challenge-head"><span class="challenge-emoji" aria-hidden="true">' + esc(challenge.emoji) + '</span>' +
        '<div><h2>' + esc(challenge.title) + '</h2><p class="where">' + esc(challenge.where) + '</p></div></div>' +
      '<p class="blurb">' + esc(challenge.blurb) + '</p>' +
      (challenge.details.length ? '<ul class="details">' + challenge.details.map(function (detail) {
        return '<li>' + detailHtml(detail) + '</li>';
      }).join('') + '</ul>' : '') +
      '<p class="prize">🏆 ' + esc(challenge.prize || 'Bragging rights') + '</p>' +
      '<div class="facts"><span class="verified' + (challenge.verified ? '' : ' unverified') + '">' +
        (challenge.verified ? '✓ Details verified July 2026' : '⚠️ Confirm details with the venue') + '</span>' +
        (challenge.source ? '<a class="source" href="' + esc(challenge.source) + '" target="_blank" rel="noopener">details ↗</a>' : '') +
        (challenge.original ? '<span class="original">A Btown Brief original</span>' : '') + '</div>' +
      boardHtml(challenge) +
      '<a class="talk" href="' + COMMUNITY_URL + '">Doing this one? Come talk about it →</a>' +
    '</article>';
  }

  function renderChips() {
    var options = [{ slug: 'all', label: 'All', emoji: '' }].concat(CATEGORIES);
    $('category-chips').innerHTML = options.map(function (item) {
      return '<button class="chip" type="button" data-category="' + item.slug + '" aria-pressed="' +
        (category === item.slug) + '">' + (item.emoji ? item.emoji + ' ' : '') + esc(item.label) + '</button>';
    }).join('');
  }

  function renderCards() {
    var visible = CHALLENGES.filter(function (challenge) {
      return category === 'all' || challenge.category === category;
    });
    $('challenge-grid').innerHTML = visible.map(cardHtml).join('');
  }

  function celebrate(challenge) {
    var card = $('challenge-' + challenge.id);
    if (!card) return;
    var emoji = document.createElement('span');
    emoji.className = 'celebrate';
    emoji.textContent = challenge.emoji;
    emoji.setAttribute('aria-hidden', 'true');
    card.appendChild(emoji);
    setTimeout(function () { emoji.remove(); }, 1100);
  }

  function statusFor(id, message) {
    var board = document.querySelector('[data-board="' + id + '"]');
    if (!board) return;
    var status = board.querySelector('.town-status');
    status.textContent = message;
    status.hidden = false;
  }

  function finishSubmit(challenge, row, message) {
    completions.unshift(row);
    done[challenge.id] = true;
    save('ch-done', done);
    renderCards();
    statusFor(challenge.id, message);
    celebrate(challenge);
  }

  function finishLocal(challenge, row) {
    saveLocal(row);
    done[challenge.id] = true;
    save('ch-done', done);
    renderCards();
    statusFor(challenge.id, 'Saved on this device only — the town board is napping.');
    celebrate(challenge);
  }

  function submit(form) {
    var id = form.getAttribute('data-form');
    var challenge = challengeById(id);
    var name = form.elements.name.value.trim();
    var note = form.elements.note.value.trim();
    var error = form.querySelector('.form-error');
    error.hidden = true;

    if (name.length < 2 || name.length > 40) {
      error.textContent = 'Name must be 2–40 characters.';
      error.hidden = false;
      return;
    }
    if (note.length > 200) {
      error.textContent = 'Note must be 200 characters or fewer.';
      error.hidden = false;
      return;
    }

    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    track('ch-submit', id);

    var localRow = function (rowId) {
      return { id: rowId, chid: id, name: name, note: note, created_at: new Date().toISOString() };
    };

    if (townMode === 'local') {
      finishLocal(challenge, localRow('l' + Date.now()));
      return;
    }

    rpc('btb_ch_submit', { p_chid: id, p_name: name, p_note: note, p_voter: visitor })
      .then(function (rowId) {
        finishSubmit(challenge, localRow(rowId), 'You’re on the board.');
      })
      .catch(function () {
        townMode = 'local';
        finishLocal(challenge, localRow('l' + Date.now()));
      });
  }

  function wire() {
    $('category-chips').addEventListener('click', function (event) {
      var button = event.target.closest('[data-category]');
      if (!button) return;
      category = button.getAttribute('data-category');
      save('ch-dials', { category: category });
      renderChips();
      renderCards();
    });

    $('challenge-grid').addEventListener('click', function (event) {
      var did = event.target.closest('[data-did]');
      if (did && !did.disabled) {
        var form = did.parentNode.querySelector('[data-form]');
        form.hidden = !form.hidden;
        if (!form.hidden) form.elements.name.focus();
        return;
      }

      var more = event.target.closest('[data-expand]');
      if (more) {
        var expandId = more.getAttribute('data-expand');
        expanded[expandId] = !expanded[expandId];
        renderCards();
        return;
      }

      var flag = event.target.closest('[data-report]');
      if (flag && !flag.disabled) {
        var completionId = flag.getAttribute('data-report');
        reported[completionId] = true;
        save('ch-reported', reported);
        flag.disabled = true;
        if (townMode === 'live') {
          rpc('btb_ch_flag', { p_completion: completionId, p_voter: visitor })
            .catch(function () { townMode = 'local'; });
        }
      }
    });

    $('challenge-grid').addEventListener('submit', function (event) {
      var form = event.target.closest('[data-form]');
      if (!form) return;
      event.preventDefault();
      submit(form);
    });
  }

  function loadBoards() {
    return rpc('btb_ch_board', {})
      .then(function (rows) {
        townMode = 'live';
        completions = rows || [];
      })
      .catch(function () {
        townMode = 'local';
        completions = localCompletions();
      });
  }

  fetch('data/challenges.json')
    .then(function (res) {
      if (!res.ok) throw new Error('challenge deck → ' + res.status);
      return res.json();
    })
    .then(function (doc) {
      CATEGORIES = doc.categories;
      CHALLENGES = doc.challenges;
      if (category !== 'all' && !CATEGORIES.some(function (item) { return item.slug === category; })) category = 'all';

      linkedId = new URLSearchParams(location.search).get('c');
      if (linkedId && !challengeById(linkedId)) linkedId = null;
      if (linkedId) {
        category = 'all';
        track('ch-linked', linkedId);
      }
      track('ch-view', 'challenges');

      return loadBoards().then(function () {
        renderChips();
        renderCards();
        wire();
        if (linkedId) requestAnimationFrame(function () {
          $('challenge-' + linkedId).scrollIntoView({ block: 'center' });
        });
      });
    })
    .catch(function () {
      $('challenge-grid').innerHTML = '<p class="board-empty">The challenges didn’t load. A refresh usually does it.</p>';
    });
})();
