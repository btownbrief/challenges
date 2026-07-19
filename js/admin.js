(function () {
  'use strict';

  var SUPABASE_URL = 'https://jnouvwxomrcffqwilqkq.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_RkMJQopffWlV6DSwCRkndQ_Xw6GJMf3';
  var PASS_KEY = 'ch-admin-pass';
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function rpc(fn, args) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (text) { throw new Error(text || (fn + ' → ' + res.status)); });
      return res.text().then(function (text) { return text ? JSON.parse(text) : null; });
    });
  }

  var pass = '';
  try { pass = localStorage.getItem(PASS_KEY) || ''; } catch (e) {}
  var rows = [];
  var tab = 'flagged';
  var challenges = {};

  function lock() {
    pass = '';
    try { localStorage.removeItem(PASS_KEY); } catch (e) {}
    $('board').hidden = true;
    $('gate').hidden = false;
    $('pass-input').value = '';
  }

  function visible() {
    if (tab === 'flagged') return rows.filter(function (row) { return row.flags > 0 && row.status === 'visible'; });
    if (tab === 'hidden') return rows.filter(function (row) { return row.status === 'hidden'; });
    return rows;
  }

  function render() {
    $('n-flagged').textContent = rows.filter(function (row) { return row.flags > 0 && row.status === 'visible'; }).length;
    $('n-hidden').textContent = rows.filter(function (row) { return row.status === 'hidden'; }).length;
    $('n-all').textContent = rows.length;
    var list = visible();
    if (!list.length) {
      $('rows').innerHTML = '';
      $('empty').textContent = tab === 'flagged' ? 'Nothing has been reported.' : tab === 'hidden' ? 'Nothing is hidden.' : 'No completions yet.';
      $('empty').hidden = false;
      return;
    }
    $('empty').hidden = true;
    $('rows').innerHTML = list.map(function (row) {
      var challenge = challenges[row.chid];
      var hidden = row.status === 'hidden';
      return '<article class="mod' + (hidden ? ' is-hidden' : '') + (row.flags > 0 && !hidden ? ' is-flagged' : '') + '">' +
        '<div class="mod-ch"><a href="./?c=' + esc(row.chid) + '" target="_blank" rel="noopener">' + esc(row.chid) + '</a>' +
          (challenge ? ' <span>' + esc(challenge) + '</span>' : '') + '</div>' +
        '<p class="mod-body">' + esc(row.name) + '</p>' +
        (row.note ? '<p class="mod-note">' + esc(row.note) + '</p>' : '') +
        '<div class="mod-meta"><span>' + esc(new Date(row.created_at).toLocaleString()) + '</span>' +
          (row.flags > 0 ? '<span class="flagpill">' + row.flags + ' report' + (row.flags === 1 ? '' : 's') + '</span>' : '') +
          (hidden ? '<span class="hidpill">hidden</span>' : '') +
          '<span class="mod-actions">' + (hidden
            ? '<button class="linkish" data-show="' + esc(row.id) + '">Restore</button>'
            : '<button class="linkish" data-hide="' + esc(row.id) + '">Hide</button>') +
            '<button class="linkish danger" data-delete="' + esc(row.id) + '">Delete</button></span></div>' +
      '</article>';
    }).join('');
  }

  function load() {
    return rpc('btb_ch_admin_list', { p_pass: pass }).then(function (data) {
      rows = data || [];
      render();
    });
  }

  function unlock(candidate) {
    return rpc('btb_ch_admin_check', { p_pass: candidate }).then(function (ok) {
      if (!ok) throw new Error('Wrong passphrase.');
      pass = candidate;
      try { localStorage.setItem(PASS_KEY, pass); } catch (e) {}
      $('gate').hidden = true;
      $('board').hidden = false;
      return load();
    });
  }

  function act(promise) {
    return promise.then(load).catch(function (error) {
      if (/passphrase/i.test(error.message)) lock();
      else window.alert('That didn’t work: ' + error.message);
    });
  }

  $('gate-form').addEventListener('submit', function (event) {
    event.preventDefault();
    $('gate-err').hidden = true;
    unlock($('pass-input').value.trim()).catch(function (error) {
      $('gate-err').textContent = /passphrase|Wrong/i.test(error.message)
        ? 'Wrong passphrase.'
        : 'Couldn’t reach the database. Has db/challenges.sql been run?';
      $('gate-err').hidden = false;
    });
  });

  $('rows').addEventListener('click', function (event) {
    var hide = event.target.closest('[data-hide]');
    var show = event.target.closest('[data-show]');
    var del = event.target.closest('[data-delete]');
    if (hide) return act(rpc('btb_ch_admin_set_status', { p_pass: pass, p_completion: hide.getAttribute('data-hide'), p_status: 'hidden' }));
    if (show) return act(rpc('btb_ch_admin_set_status', { p_pass: pass, p_completion: show.getAttribute('data-show'), p_status: 'visible' }));
    if (del && window.confirm('Delete this completion for good?')) {
      return act(rpc('btb_ch_admin_delete', { p_pass: pass, p_completion: del.getAttribute('data-delete') }));
    }
  });

  $('tabs').addEventListener('click', function (event) {
    var button = event.target.closest('[data-tab]');
    if (!button) return;
    tab = button.getAttribute('data-tab');
    [].forEach.call(this.querySelectorAll('[data-tab]'), function (item) {
      item.setAttribute('aria-pressed', String(item === button));
    });
    render();
  });
  $('refresh').addEventListener('click', function () { act(Promise.resolve()); });
  $('lock').addEventListener('click', lock);

  fetch('data/challenges.json')
    .then(function (res) { return res.json(); })
    .then(function (doc) {
      doc.challenges.forEach(function (challenge) { challenges[challenge.id] = challenge.title; });
      if (rows.length) render();
    })
    .catch(function () {});

  if (pass) unlock(pass).catch(lock);
})();
