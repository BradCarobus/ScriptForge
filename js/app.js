// ─── ScriptForge app ────────────────────────────────────────────────────────
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const main = $('#main');

  // ── Constants ───────────────────────────────────────────────────────────
  const STATUS = {
    new: 'Needs vetting', parked: 'Parked', rejected: 'Rejected',
    approved: 'Approved', production: 'Production', published: 'Published',
  };
  const SKEL_FIELDS = [
    ['title', 'Title'], ['thumb', 'Thumbnail mockup'], ['hook', 'Hook'], ['stakes', 'Stakes'],
    ['outline', 'Outline'], ['payoff', 'Payoff'], ['audience', 'Target viewer'],
  ];
  const SKEL_REQUIRED = ['title', 'hook', 'stakes', 'outline'];
  const PROD_STEPS = [
    { id: 'beats', text: 'But/Therefore train locked' },
    { id: 'script', text: 'Script written' },
    { id: 'roast', text: 'Script roasted & revised' },
    { id: 'record', text: 'A-roll recorded' },
    { id: 'broll', text: 'B-roll / assets gathered' },
    { id: 'edit', text: 'Edited' },
    { id: 'thumb', text: 'Thumbnail finished' },
    { id: 'title', text: 'Title locked' },
    { id: 'desc', text: 'Description, tags & chapters' },
    { id: 'upload', text: 'Uploaded & scheduled' },
  ];
  const LINKS = { but: 'BUT', therefore: 'THEREFORE', and: 'AND THEN' };

  // ── UI state ────────────────────────────────────────────────────────────
  const state = {
    view: 'hub',
    bank: { q: '', filter: 'all', sort: 'new' },
    vet: { tab: 'new', sel: null },
    skel: { tab: 'all', sel: null },
    prod: { tab: 'production', sel: null, sub: 'package' },
  };
  try { Object.assign(state, JSON.parse(localStorage.getItem('sf_ui')) || {}); } catch (e) {}
  function saveUI() { try { localStorage.setItem('sf_ui', JSON.stringify(state)); } catch (e) {} }

  // ── Helpers ─────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function color(c, fallback) { return /^#[0-9a-f]{3,8}$/i.test(c || '') ? c : fallback; }
  function imgSrc(s) { return typeof s === 'string' && s.startsWith('data:image/') ? s : ''; }
  function timeAgo(ts) {
    if (!ts) return '';
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function setPath(obj, path, val) {
    const keys = path.split('.');
    let o = obj;
    keys.slice(0, -1).forEach((k, i) => {
      if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      o = o[k];
    });
    o[keys[keys.length - 1]] = val;
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2000);
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }
  function slug(s) { return (s || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }
  function words(s) { return (s || '').trim().split(/\s+/).filter(Boolean).length; }

  const saveTimers = {};
  function queueSave(id) {
    clearTimeout(saveTimers[id]);
    saveTimers[id] = setTimeout(() => { const i = Store.get(id); if (i) Store.save(i); }, 400);
  }
  function saveNow(idea) { clearTimeout(saveTimers[idea.id]); Store.save(idea); }

  function byStatus(...st) { return Store.all().filter((i) => st.includes(i.status)); }
  function newestFirst(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }
  function name(i) { return i.title || 'Untitled idea'; }
  function pill(i) { return `<span class="pill ${i.status}">${STATUS[i.status] || i.status}</span>`; }

  function vetScore(i) {
    const list = Store.settings().checklist;
    if (!list.length) return 0;
    const checks = (i.vet && i.vet.checks) || {};
    return list.filter((c) => checks[c.id]).length / list.length;
  }
  function skelStatus(i) {
    const s = i.skeleton || {};
    const has = (k) => (k === 'thumb' ? !!(s.thumbText || s.thumbDesc || s.thumbImg) : !!String(s[k] || '').trim());
    const done = SKEL_FIELDS.filter(([k]) => has(k)).length;
    const missing = SKEL_FIELDS.filter(([k]) => SKEL_REQUIRED.includes(k) && !has(k)).map(([, l]) => l);
    return { pct: done / SKEL_FIELDS.length, ready: !missing.length, missing };
  }
  function prodPct(i) {
    const c = (i.prod && i.prod.checklist) || {};
    return PROD_STEPS.filter((s) => c[s.id]).length / PROD_STEPS.length;
  }
  function pickedTitle(i) {
    const t = (i.prod && i.prod.titles) || [];
    const p = t.find((x) => x.pick && x.text) || t.find((x) => x.text);
    return (p && p.text) || (i.skeleton && i.skeleton.title) || i.title;
  }
  function bar(pct, cls) { return `<div class="progress ${cls || ''}"><div style="width:${Math.round(pct * 100)}%"></div></div>`; }

  function thumbHTML(t, title) {
    t = t || {};
    const img = imgSrc(t.img);
    return `<div class="thumb" style="background:${color(t.bg, '#1f1f1a')}">
        ${img ? `<img src="${esc(img)}" alt="">` : ''}
        <div class="thumb-text" style="color:${color(t.color, '#ffffff')}">${esc(t.text || (img ? '' : 'THUMBNAIL TEXT'))}</div>
        <span class="dur">12:34</span>
      </div>
      ${title === undefined ? '' : `<div class="yt-meta"><div class="av"></div><div><div class="t">${esc(title || 'Your title here')}</div><div class="c">Your channel · 1.2M views · 2 days ago</div></div></div>`}`;
  }
  function thumbControls(p, t) {
    t = t || {};
    return `<div class="field"><label>Thumbnail text</label><input type="text" data-bind="${p.text}" value="${esc(t.text)}" placeholder="3–4 words max"></div>
      <div class="field"><label>What's in the image?</label><textarea data-bind="${p.desc}" rows="2" placeholder="Face, object, contrast, the 'before vs after'…">${esc(t.desc)}</textarea></div>
      <div class="thumb-controls">
        <label>Bg <input type="color" data-bind="${p.bg}" value="${color(t.bg, '#1f1f1a')}"></label>
        <label>Text <input type="color" data-bind="${p.color}" value="${color(t.color, '#ffffff')}"></label>
        <span class="btn sm file-btn">${t.img ? 'Replace image' : 'Upload image'}<input type="file" accept="image/*" data-img="${p.img}"></span>
        ${t.img ? `<button class="btn sm ghost" data-action="clearImg" data-path="${p.img}">Remove image</button>` : ''}
      </div>`;
  }

  // ── Live fragments (re-rendered after every keystroke without losing focus) ──
  const LIVE = {
    skelThumb(i) { const s = i.skeleton || {}; return thumbHTML({ text: s.thumbText, bg: s.thumbBg, color: s.thumbColor, img: s.thumbImg }, s.title); },
    skelProgress(i) { const st = skelStatus(i); return `${bar(st.pct, st.ready ? 'good' : '')}<div class="muted" style="font-size:.8rem;margin-top:6px">${Math.round(st.pct * 100)}% filled${st.ready ? ' · ready for production' : ' · missing: ' + st.missing.join(', ')}</div>`; },
    skelApprove(i) { const st = skelStatus(i); return `<button class="btn good" data-action="toProduction" ${st.ready ? '' : 'disabled'} title="${st.ready ? '' : 'Missing: ' + esc(st.missing.join(', '))}">Approve for production →</button>`; },
    charCount(i, el) {
      const v = getPath(i, el.dataset.path) || '';
      return `<span class="count ${v.length > 70 ? 'over' : ''}">${v.length}/70</span>`;
    },
    prodThumb(i, el) { const t = i.prod.thumbs[+el.dataset.idx]; return thumbHTML(t, pickedTitle(i)); },
    prodProgress(i) { const p = prodPct(i); return `${bar(p, p === 1 ? 'good' : '')}<div class="muted" style="font-size:.8rem;margin-top:6px">${Math.round(p * 100)}% through production</div>`; },
    verdict(i) {
      const p = vetScore(i);
      const [cls, what, sub] = p >= 0.8 ? ['strong', 'Strong idea — approve it', 'This hits most of the marks.']
        : p >= 0.5 ? ['maybe', 'Maybe — sharpen it', 'Find the angle or stakes that push it over the line, or park it.']
          : ['weak', 'Pass or park', 'Not there yet. Park it and come back with a new angle.'];
      return `<div class="verdict ${cls}"><div class="score">${Math.round(p * 100)}%</div><div><div class="what">${what}</div><div class="muted" style="font-size:.85rem">${sub}</div></div></div>`;
    },
    trainStats(i) {
      const b = i.prod.beats || [];
      const links = b.slice(1).map((x) => x.link || 'therefore');
      const and = links.filter((l) => l === 'and').length;
      return `<span><strong>${b.length}</strong> beats</span><span style="color:var(--accent2)">${links.filter((l) => l === 'but').length} BUT</span><span style="color:var(--good)">${links.filter((l) => l === 'therefore').length} THEREFORE</span>${and ? `<span style="color:var(--bad)">${and} AND THEN — rewrite these</span>` : ''}`;
    },
    scriptStats(i) {
      const w = words(i.prod.script);
      const wpm = +i.prod.wpm || 150;
      const mins = w / wpm;
      return `<span><strong>${w.toLocaleString()}</strong> words</span><span>≈ <strong>${Math.floor(mins)}:${String(Math.round((mins % 1) * 60)).padStart(2, '0')}</strong> runtime</span>`;
    },
  };
  function refreshLive(idea) {
    $$('[data-live]', main).forEach((el) => {
      const fn = LIVE[el.dataset.live];
      if (fn) el.innerHTML = fn(idea, el);
    });
  }

  // ── Actions on ideas ────────────────────────────────────────────────────
  function addIdea(text) {
    text = (text || '').trim();
    if (!text) return null;
    const tags = (text.match(/#[\w-]+/g) || []).map((t) => t.slice(1).toLowerCase());
    const idea = Store.blankIdea(text.replace(/#[\w-]+/g, '').replace(/\s+/g, ' ').trim() || text);
    idea.tags = tags;
    Store.save(idea);
    toast('Banked 💡');
    return idea;
  }

  function openIdea(id) {
    const i = Store.get(id);
    if (!i) return;
    if (['new', 'parked', 'rejected'].includes(i.status)) { state.vet.tab = i.status; state.vet.sel = id; go('vet'); }
    else if (i.status === 'approved') { state.skel.tab = 'all'; state.skel.sel = id; go('skeleton'); }
    else { state.prod.tab = i.status; state.prod.sel = id; go('production'); }
  }

  function setStatus(i, status, msg) {
    i.status = status;
    i[status + 'At'] = Date.now();
    if (status === 'production') {
      i.prod = i.prod || Store.blankProd(i);
      i.onDeck = false;
    }
    saveNow(i);
    if (msg) toast(msg);
  }

  const ACTIONS = {
    star(el, i) { i.starred = !i.starred; saveNow(i); el.classList.toggle('on', i.starred); },
    open(el, i) { openIdea(i.id); },
    del(el, i) {
      if (!confirm(`Delete "${name(i)}"? This can't be undone.`)) return;
      Store.remove(i.id);
      toast('Deleted');
      render();
    },
    filter(el) { state.bank.filter = el.dataset.v; render(); },
    vetTab(el) { state.vet.tab = el.dataset.v; state.vet.sel = null; render(); },
    skelTab(el) { state.skel.tab = el.dataset.v; state.skel.sel = null; render(); },
    prodTab(el) { state.prod.tab = el.dataset.v; state.prod.sel = null; render(); },
    sub(el) { state.prod.sub = el.dataset.v; render(); },
    select(el) {
      const key = { vet: 'vet', skeleton: 'skel', production: 'prod' }[state.view];
      state[key].sel = el.dataset.sel;
      render();
      window.scrollTo({ top: 0 });
    },
    goto(el) { go(el.dataset.v); },

    // Vetting
    approve(el, i) {
      if (vetScore(i) < 0.5 && !confirm('This scored under 50% on your checklist. Approve anyway?')) return;
      i.vet = i.vet || {};
      i.vet.score = vetScore(i);
      setStatus(i, 'approved', 'Approved ✓ — it’s in Skeletons');
      state.vet.sel = null; render();
    },
    park(el, i) { setStatus(i, 'parked', 'Parked for later'); state.vet.sel = null; render(); },
    reject(el, i) { setStatus(i, 'rejected', 'Rejected'); state.vet.sel = null; render(); },
    requeue(el, i) { setStatus(i, 'new', 'Back in the vetting queue'); state.vet.sel = null; render(); },

    // Skeleton / deck
    deck(el, i) { i.onDeck = !i.onDeck; saveNow(i); toast(i.onDeck ? 'Added to On Deck' : 'Removed from On Deck'); render(); },
    toProduction(el, i) {
      if (!skelStatus(i).ready) return;
      setStatus(i, 'production', 'Approved for production 🎬');
      state.skel.sel = null;
      render();
    },
    toVet(el, i) { setStatus(i, 'new', 'Sent back to vetting'); state.skel.sel = null; render(); },
    toSkeleton(el, i) { setStatus(i, 'approved', 'Back in Skeletons'); state.prod.sel = null; render(); },
    clearImg(el, i) { setPath(i, el.dataset.path, ''); saveNow(i); render(); },

    // Production
    publish(el, i) { setStatus(i, 'published', 'Published 🎉'); state.prod.tab = 'published'; render(); },
    unpublish(el, i) { setStatus(i, 'production', 'Back in production'); state.prod.tab = 'production'; render(); },
    addTitle(el, i) {
      i.prod.titles.push({ id: Store.uid(), text: '', pick: !i.prod.titles.length });
      saveNow(i); render();
      const inputs = $$('[data-bind^="prod.titles."]', main); if (inputs.length) inputs[inputs.length - 1].focus();
    },
    pickTitle(el, i) { i.prod.titles.forEach((t, n) => { t.pick = n === +el.dataset.i; }); saveNow(i); render(); },
    delTitle(el, i) { i.prod.titles.splice(+el.dataset.i, 1); saveNow(i); render(); },
    addThumb(el, i) { i.prod.thumbs.push({ id: Store.uid(), text: '', desc: '', bg: '#1f1f1a', color: '#ffffff', img: '', pick: !i.prod.thumbs.length }); saveNow(i); render(); },
    pickThumb(el, i) { i.prod.thumbs.forEach((t, n) => { t.pick = n === +el.dataset.i; }); saveNow(i); render(); },
    delThumb(el, i) { if (confirm('Delete this thumbnail concept?')) { i.prod.thumbs.splice(+el.dataset.i, 1); saveNow(i); render(); } },
    addBeat(el, i) {
      i.prod.beats.push({ id: Store.uid(), text: '', link: i.prod.beats.length ? el.dataset.link : '' });
      saveNow(i); render();
      const tas = $$('.beat textarea', main); if (tas.length) tas[tas.length - 1].focus();
    },
    moveBeat(el, i) {
      const n = +el.dataset.i, m = n + +el.dataset.d, b = i.prod.beats;
      if (m < 0 || m >= b.length) return;
      [b[n].text, b[m].text] = [b[m].text, b[n].text];
      saveNow(i); render();
    },
    delBeat(el, i) { i.prod.beats.splice(+el.dataset.i, 1); if (i.prod.beats[0]) i.prod.beats[0].link = ''; saveNow(i); render(); },
    importBeats(el, i) {
      const fresh = Store.blankProd(i).beats;
      if (!fresh.length) { toast('Skeleton outline is empty'); return; }
      if (i.prod.beats.length && !confirm('Add the skeleton outline lines to the end of your train?')) return;
      if (i.prod.beats.length) fresh[0].link = 'therefore';
      i.prod.beats.push(...fresh);
      saveNow(i); render();
    },
    scriptTemplate(el, i) {
      const p = i.prod;
      let t = `[HOOK]\n${p.hook || ''}\n\n[STAKES]\n${p.stakes || ''}\n\n`;
      p.beats.forEach((b, n) => { t += `[${n ? LINKS[b.link || 'therefore'] + ' — ' : ''}BEAT ${n + 1}] ${b.text}\n\n\n`; });
      t += `[RESOLUTION]\n${p.resolution || ''}\n\n[CTA / NEXT VIDEO]\n${p.cta || ''}\n`;
      p.script = p.script ? p.script + '\n\n' + t : t;
      saveNow(i); render();
    },
    copyScript(el, i) { navigator.clipboard.writeText(i.prod.script || '').then(() => toast('Copied')); },
    downloadScript(el, i) { download(`script-${slug(pickedTitle(i))}.txt`, exportScript(i)); },

    // Settings
    clAdd() { const s = Store.settings(); s.checklist.push({ id: Store.uid(), text: '' }); Store.saveSettings(s); render(); const ins = $$('[data-cl]', main); ins[ins.length - 1].focus(); },
    clDel(el) { const s = Store.settings(); s.checklist.splice(+el.dataset.i, 1); Store.saveSettings(s); render(); },
    clReset() { if (confirm('Reset the vetting checklist to the defaults?')) { Store.saveSettings({ ...Store.settings(), checklist: Store.DEFAULT_CHECKLIST.slice() }); render(); } },
    exportData() { download(`scriptforge-backup-${new Date().toISOString().slice(0, 10)}.json`, Store.exportJSON(), 'application/json'); },
    lock() {
      try { localStorage.removeItem('sf_unlock'); sessionStorage.removeItem('sf_unlock'); } catch (e) {}
      location.reload();
    },
  };

  function exportScript(i) {
    const p = i.prod;
    let out = `${pickedTitle(i)}\n${'='.repeat(60)}\n\n`;
    if (p.hook) out += `HOOK\n${p.hook}\n\n`;
    if (p.stakes) out += `STAKES\n${p.stakes}\n\n`;
    if (p.beats.length) out += 'BUT / THEREFORE TRAIN\n' + p.beats.map((b, n) => `${n ? '  ' + LINKS[b.link || 'therefore'] + '\n' : ''}${n + 1}. ${b.text}`).join('\n') + '\n\n';
    if (p.resolution) out += `RESOLUTION\n${p.resolution}\n\n`;
    out += `${'='.repeat(60)}\nSCRIPT\n${'='.repeat(60)}\n\n${p.script || ''}\n`;
    return out;
  }

  // ── Views ───────────────────────────────────────────────────────────────
  function captureForm(big) {
    return `<form class="capture" data-form="capture">
      <div class="capture-main">
        <input type="text" name="idea" placeholder="${big ? 'Dump an idea… add #tags if you want' : 'Quick idea…'}" autocomplete="off">
        <button class="btn primary" type="submit">Bank it</button>
      </div>
    </form>`;
  }

  function rowHTML(i, extra) {
    return `<div class="row clickable" data-id="${i.id}" data-action="open">
      <div class="grow"><div class="title">${esc(name(i))}</div><div class="sub">${extra || ''}</div></div>
    </div>`;
  }

  function viewHub() {
    const all = Store.all();
    const c = (s) => all.filter((i) => s.includes(i.status)).length;
    const approvedEver = c(['approved', 'production', 'published']);
    const skelDone = all.filter((i) => i.status === 'approved' && skelStatus(i).ready).length;
    const deck = all.filter((i) => i.onDeck && i.status === 'approved').sort(newestFirst);
    const deckable = byStatus('approved').filter((i) => !i.onDeck).sort(newestFirst);
    const prod = byStatus('production').sort((a, b) => (a.productionAt || 0) - (b.productionAt || 0));
    const queue = byStatus('new').sort(newestFirst);
    const total = all.length || 1;
    const seg = [['new', 'var(--info)'], ['parked', 'var(--accent)'], ['approved', 'var(--good)'], ['production', 'var(--accent2)'], ['published', '#2e8b57'], ['rejected', 'var(--bad)']];

    return `
    <div class="page-head"><div><h1 class="page-title">Command Center</h1><p>Every idea, where it stands, and what's next to make.</p></div></div>

    <div class="stats">
      <div class="stat" data-action="goto" data-v="bank"><div class="num">${all.length}</div><div class="lbl">Ideas banked</div></div>
      <div class="stat" data-action="goto" data-v="vet"><div class="num">${c(['new'])}</div><div class="lbl">Awaiting vetting</div></div>
      <div class="stat good" data-action="goto" data-v="skeleton"><div class="num">${approvedEver}</div><div class="lbl">Ideas approved</div></div>
      <div class="stat accent" data-action="goto" data-v="skeleton"><div class="num">${skelDone}</div><div class="lbl">Skeletons ready</div></div>
      <div class="stat hot" data-action="goto" data-v="production"><div class="num">${prod.length}</div><div class="lbl">Ready / in production</div></div>
      <div class="stat" data-action="goto" data-v="production"><div class="num">${c(['published'])}</div><div class="lbl">Published</div></div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>Pipeline</h3>
      <div class="funnel">${seg.map(([s, col]) => `<div style="width:${(c([s]) / total) * 100}%;background:${col}"></div>`).join('')}</div>
      <div class="legend">${seg.map(([s, col]) => `<span style="--c:${col}">${STATUS[s]} · ${c([s])}</span>`).join('')}</div>
    </div>

    <div class="hub-grid">
      <div>
        <div class="card">
          <div class="card-head"><h2>On Deck — current ideas</h2>
            ${deckable.length ? `<select data-deck style="width:auto"><option value="">+ Put an approved idea on deck…</option>${deckable.map((i) => `<option value="${i.id}">${esc(name(i))}</option>`).join('')}</select>` : ''}
          </div>
          ${deck.length ? `<div class="row-list">${deck.map((i) => {
            const st = skelStatus(i);
            return `<div class="row" data-id="${i.id}">
              <div class="grow"><div class="title">${esc(name(i))}</div><div class="sub">${st.ready ? '<span style="color:var(--good)">Skeleton ready</span>' : 'Skeleton ' + Math.round(st.pct * 100) + '%'}</div></div>
              ${bar(st.pct, st.ready ? 'good' : '')}
              <button class="btn sm" data-action="open">Skeleton</button>
              <button class="btn sm good" data-action="toProduction" ${st.ready ? '' : 'disabled'} title="${st.ready ? 'Approve for production' : 'Missing: ' + esc(st.missing.join(', '))}">Produce →</button>
            </div>`;
          }).join('')}</div>` : `<div class="empty"><strong>Nothing on deck</strong>Pick approved ideas you're actively working on. Write the skeleton, then approve them for production.</div>`}
        </div>

        <div class="card">
          <div class="card-head"><h2>Production queue — solid ideas to make</h2><span class="muted" style="font-size:.85rem">${prod.length} waiting</span></div>
          ${prod.length ? `<div class="row-list">${prod.map((i) => `<div class="row clickable" data-id="${i.id}" data-action="open">
              <div class="grow"><div class="title">${esc(pickedTitle(i))}</div><div class="sub">Approved for production ${timeAgo(i.productionAt)}${i.prod && i.prod.publishDate ? ' · 📅 ' + esc(i.prod.publishDate) : ''}</div></div>
              ${bar(prodPct(i), prodPct(i) === 1 ? 'good' : '')}
            </div>`).join('')}</div>` : `<div class="empty"><strong>Queue is empty</strong>Approve a finished skeleton for production and it lands here.</div>`}
        </div>
      </div>

      <div>
        <div class="card"><h3>Quick capture</h3>${captureForm(false)}</div>
        <div class="card">
          <div class="card-head"><h3 style="margin:0">Needs vetting</h3>${queue.length ? `<button class="btn sm" data-action="goto" data-v="vet">Start vetting →</button>` : ''}</div>
          ${queue.length ? `<div class="row-list">${queue.slice(0, 5).map((i) => rowHTML(i, timeAgo(i.createdAt))).join('')}</div>` : `<p class="muted">Queue is clear.</p>`}
        </div>
        <div class="card">
          <h3>Recently touched</h3>
          ${all.length ? `<div class="row-list">${all.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6).map((i) => rowHTML(i, pill(i) + ' ' + timeAgo(i.updatedAt))).join('')}</div>` : `<p class="muted">Nothing yet — bank your first idea.</p>`}
        </div>
      </div>
    </div>`;
  }

  function viewBank() {
    const all = Store.all();
    const filters = [['all', 'All'], ['new', 'Needs vetting'], ['parked', 'Parked'], ['approved', 'Approved'], ['production', 'Production'], ['published', 'Published'], ['rejected', 'Rejected'], ['starred', '★ Starred']];
    return `
    <div class="page-head"><div><h1 class="page-title">Idea Bank</h1><p>Every idea goes here first. No filter, no judgement — just get it out of your head. Vetting comes later.</p></div>
      <div class="muted mono" style="font-size:.8rem">${all.length} ideas</div></div>
    <div class="card">${captureForm(true)}</div>
    <div class="toolbar">
      <input type="text" id="bankSearch" placeholder="Search ideas or #tag" value="${esc(state.bank.q)}">
      <div class="chips">${filters.map(([v, l]) => `<button class="chip ${state.bank.filter === v ? 'active' : ''}" data-action="filter" data-v="${v}">${l}</button>`).join('')}</div>
      <select id="bankSort" style="margin-left:auto">
        ${[['new', 'Newest'], ['old', 'Oldest'], ['edited', 'Recently edited'], ['az', 'A–Z']].map(([v, l]) => `<option value="${v}" ${state.bank.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </div>
    <div id="bankGrid">${bankGrid()}</div>`;
  }

  function bankGrid() {
    const { q, filter, sort } = state.bank;
    let list = Store.all();
    if (filter === 'starred') list = list.filter((i) => i.starred);
    else if (filter !== 'all') list = list.filter((i) => i.status === filter);
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter((i) => (i.title + ' ' + i.notes + ' ' + (i.tags || []).map((t) => '#' + t).join(' ')).toLowerCase().includes(needle));
    }
    const sorters = {
      new: newestFirst,
      old: (a, b) => a.createdAt - b.createdAt,
      edited: (a, b) => b.updatedAt - a.updatedAt,
      az: (a, b) => name(a).localeCompare(name(b)),
    };
    list.sort(sorters[sort] || newestFirst);
    if (!list.length) return `<div class="empty"><strong>${Store.all().length ? 'No matches' : 'Your bank is empty'}</strong>${Store.all().length ? 'Try a different filter.' : 'Type anything above and hit Enter.'}</div>`;

    return `<div class="idea-grid">${list.map((i) => {
      const next = ['new', 'parked'].includes(i.status) ? 'Vet →' : i.status === 'approved' ? 'Skeleton →' : i.status === 'rejected' ? 'Review' : 'Open →';
      return `<div class="idea-card" data-id="${i.id}">
        <div class="top">
          <button class="star ${i.starred ? 'on' : ''}" data-action="star" title="Star">★</button>
          <input type="text" class="title-input" data-bind="title" value="${esc(i.title)}" placeholder="Untitled idea">
        </div>
        <textarea data-bind="notes" rows="2" placeholder="Notes, angle, links…">${esc(i.notes)}</textarea>
        ${(i.tags || []).length ? `<div>${i.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join(' ')}</div>` : ''}
        <div class="foot">
          <span>${pill(i)} ${i.onDeck ? '<span class="pill deck">On deck</span>' : ''} ${timeAgo(i.createdAt)}</span>
          <span class="btn-row"><button class="btn sm" data-action="open">${next}</button><button class="btn sm ghost danger" data-action="del" title="Delete">✕</button></span>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  function sideList(items, selId, metaFn) {
    if (!items.length) return '<p class="muted" style="font-size:.85rem;padding:8px 2px">Nothing here.</p>';
    return items.map((i) => `<button class="side-item ${i.id === selId ? 'active' : ''}" data-action="select" data-sel="${i.id}">
      <span class="t">${esc(name(i))}</span>${metaFn ? metaFn(i) : ''}</button>`).join('');
  }
  function pickSel(list, key) {
    const s = state[key];
    if (!list.find((i) => i.id === s.sel)) s.sel = list[0] ? list[0].id : null;
    return s.sel ? Store.get(s.sel) : null;
  }

  function viewVet() {
    const tabs = [['new', 'Queue'], ['parked', 'Parked'], ['rejected', 'Rejected']];
    const list = byStatus(state.vet.tab).sort((a, b) => (b.starred - a.starred) || newestFirst(a, b));
    const i = pickSel(list, 'vet');
    const cl = Store.settings().checklist;

    return `
    <div class="page-head"><div><h1 class="page-title">Vetting</h1><p>Run each idea through the checklist. Be honest — approving a weak idea costs you 20+ hours later.</p></div></div>
    <div class="split">
      <aside class="side">
        <div class="chips">${tabs.map(([v, l]) => `<button class="chip ${state.vet.tab === v ? 'active' : ''}" data-action="vetTab" data-v="${v}">${l} · ${byStatus(v).length}</button>`).join('')}</div>
        ${sideList(list, i && i.id, (x) => `<span class="m">${x.starred ? '★ ' : ''}${timeAgo(x.createdAt)} · ${Math.round(vetScore(x) * 100)}%</span>`)}
      </aside>
      <section>
        ${!i ? `<div class="empty"><strong>${state.vet.tab === 'new' ? 'Vetting queue is clear' : 'Nothing here'}</strong>${state.vet.tab === 'new' ? 'New ideas from the bank show up here.' : ''}</div>` : `
        <div data-id="${i.id}">
          <div class="editor-head">
            <div style="flex:1;min-width:240px"><input type="text" class="big-title" data-bind="title" value="${esc(i.title)}" placeholder="Untitled idea">
              <div class="btn-row" style="margin-top:6px">${pill(i)} <span class="muted" style="font-size:.8rem">Banked ${timeAgo(i.createdAt)}</span></div></div>
          </div>
          <div class="field"><label>The idea</label><textarea data-bind="notes" rows="3" placeholder="What's the video? What's the angle?">${esc(i.notes)}</textarea></div>
          <div class="card">
            <div class="card-head"><h3 style="margin:0">Checklist</h3><button class="btn sm ghost" data-action="goto" data-v="settings">Edit checklist</button></div>
            <div class="checklist">${cl.map((c) => `<label class="check-item ${i.vet && i.vet.checks && i.vet.checks[c.id] ? 'on' : ''}">
              <input type="checkbox" data-bind="vet.checks.${esc(c.id)}" ${i.vet && i.vet.checks && i.vet.checks[c.id] ? 'checked' : ''}><span>${esc(c.text)}</span></label>`).join('')}</div>
            <div data-live="verdict">${LIVE.verdict(i)}</div>
            <div class="field"><label>Verdict notes</label><textarea data-bind="vet.notes" rows="2" placeholder="Why yes / no? What would make it stronger?">${esc(i.vet && i.vet.notes)}</textarea></div>
            <div class="btn-row">
              <button class="btn good" data-action="approve">✓ Approve</button>
              ${i.status !== 'parked' ? `<button class="btn" data-action="park">Park for later</button>` : ''}
              ${i.status !== 'new' ? `<button class="btn" data-action="requeue">Back to queue</button>` : ''}
              ${i.status !== 'rejected' ? `<button class="btn danger" data-action="reject">✕ Reject</button>` : ''}
              <button class="btn ghost danger" data-action="del" style="margin-left:auto">Delete</button>
            </div>
          </div>
        </div>`}
      </section>
    </div>`;
  }

  function viewSkeleton() {
    let list = byStatus('approved');
    if (state.skel.tab === 'deck') list = list.filter((i) => i.onDeck);
    list.sort((a, b) => (b.onDeck - a.onDeck) || (b.approvedAt || 0) - (a.approvedAt || 0));
    const i = pickSel(list, 'skel');
    const s = (i && i.skeleton) || {};
    const P = (k) => `skeleton.${k}`;

    return `
    <div class="page-head"><div><h1 class="page-title">Skeletons</h1><p>Approved ideas get a skeleton: title, thumbnail mockup, hook, stakes, outline. Finish one and approve it for production.</p></div></div>
    <div class="split">
      <aside class="side">
        <div class="chips">${[['all', 'All approved'], ['deck', 'On deck']].map(([v, l]) => `<button class="chip ${state.skel.tab === v ? 'active' : ''}" data-action="skelTab" data-v="${v}">${l}</button>`).join('')}</div>
        ${sideList(list, i && i.id, (x) => { const st = skelStatus(x); return `<span class="m">${x.onDeck ? '<span class="pill deck">Deck</span>' : ''}${Math.round(st.pct * 100)}%</span>${bar(st.pct, st.ready ? 'good' : '')}`; })}
      </aside>
      <section>
        ${!i ? `<div class="empty"><strong>No approved ideas yet</strong>Approve ideas in Vetting and they'll show up here.</div>` : `
        <div data-id="${i.id}">
          <div class="editor-head">
            <div style="flex:1;min-width:240px">
              <input type="text" class="big-title" data-bind="title" value="${esc(i.title)}" placeholder="Idea name">
              <div data-live="skelProgress" style="max-width:420px;margin-top:8px">${LIVE.skelProgress(i)}</div>
            </div>
            <div class="btn-row">
              <button class="btn" data-action="deck">${i.onDeck ? '★ On deck' : '☆ Put on deck'}</button>
              <span data-live="skelApprove">${LIVE.skelApprove(i)}</span>
            </div>
          </div>

          <div class="card">
            <h3>Packaging — title & thumbnail mockup</h3>
            <div class="field"><label>Video title</label>
              <div class="option" style="margin:0"><input type="text" data-bind="${P('title')}" value="${esc(s.title)}" placeholder="The title that makes the promise"><span data-live="charCount" data-path="${P('title')}">${LIVE.charCount(i, { dataset: { path: P('title') } })}</span></div>
            </div>
            <div class="thumb-wrap">
              <div>${thumbControls({ text: P('thumbText'), desc: P('thumbDesc'), bg: P('thumbBg'), color: P('thumbColor'), img: P('thumbImg') }, { text: s.thumbText, desc: s.thumbDesc, bg: s.thumbBg, color: s.thumbColor, img: s.thumbImg })}</div>
              <div data-live="skelThumb">${LIVE.skelThumb(i)}</div>
            </div>
          </div>

          <div class="card">
            <h3>Hook & stakes</h3>
            <div class="field"><label>Hook</label><span class="hint">First 30 seconds. Confirm the click, then open a loop they need closed.</span>
              <textarea data-bind="${P('hook')}" rows="3">${esc(s.hook)}</textarea></div>
            <div class="field"><label>Stakes</label><span class="hint">What's to win or lose? Why does the viewer need to keep watching?</span>
              <textarea data-bind="${P('stakes')}" rows="3">${esc(s.stakes)}</textarea></div>
          </div>

          <div class="card">
            <h3>Outline & payoff</h3>
            <div class="field"><label>Outline</label><span class="hint">One beat per line. These become your But/Therefore train in production.</span>
              <textarea data-bind="${P('outline')}" rows="7" placeholder="- Setup&#10;- But…&#10;- Therefore…">${esc(s.outline)}</textarea></div>
            <div class="field"><label>Payoff / resolution</label><span class="hint">How does the ending deliver the exact promise of the title?</span>
              <textarea data-bind="${P('payoff')}" rows="2">${esc(s.payoff)}</textarea></div>
          </div>

          <div class="card">
            <h3>Audience & notes</h3>
            <div class="field-row">
              <div class="field"><label>Target viewer</label><textarea data-bind="${P('audience')}" rows="3" placeholder="Who is this for, specifically?">${esc(s.audience)}</textarea></div>
              <div class="field"><label>Notes / references</label><textarea data-bind="${P('notes')}" rows="3" placeholder="Competing videos, links, research…">${esc(s.notes)}</textarea></div>
            </div>
          </div>

          <div class="btn-row" style="margin-top:16px">
            <button class="btn ghost" data-action="toVet">← Send back to vetting</button>
            <button class="btn ghost danger" data-action="del" style="margin-left:auto">Delete idea</button>
          </div>
        </div>`}
      </section>
    </div>`;
  }

  function viewProduction() {
    const list = byStatus(state.prod.tab).sort((a, b) => (a.productionAt || 0) - (b.productionAt || 0));
    const i = pickSel(list, 'prod');
    if (i && !i.prod) { i.prod = Store.blankProd(i); saveNow(i); }
    const subs = [['package', 'Title & Thumbnail'], ['train', 'But / Therefore'], ['hook', 'Hook & Resolution'], ['script', 'Script'], ['checklist', 'Checklist']];

    return `
    <div class="page-head"><div><h1 class="page-title">Production</h1><p>Approved skeletons become videos here. Lock the packaging, build the story train, nail the hook and ending, then write.</p></div></div>
    <div class="split">
      <aside class="side">
        <div class="chips">${[['production', 'In production'], ['published', 'Published']].map(([v, l]) => `<button class="chip ${state.prod.tab === v ? 'active' : ''}" data-action="prodTab" data-v="${v}">${l} · ${byStatus(v).length}</button>`).join('')}</div>
        ${sideList(list, i && i.id, (x) => `<span class="m">${Math.round(prodPct(x) * 100)}%${x.prod && x.prod.publishDate ? ' · 📅 ' + esc(x.prod.publishDate) : ''}</span>${bar(prodPct(x), prodPct(x) === 1 ? 'good' : '')}`)}
      </aside>
      <section>
        ${!i ? `<div class="empty"><strong>${state.prod.tab === 'production' ? 'Nothing in production' : 'Nothing published yet'}</strong>${state.prod.tab === 'production' ? 'Finish a skeleton and approve it for production.' : ''}</div>` : `
        <div data-id="${i.id}">
          <div class="editor-head">
            <div style="flex:1;min-width:240px">
              <input type="text" class="big-title" data-bind="title" value="${esc(i.title)}" placeholder="Idea name">
              <div data-live="prodProgress" style="max-width:420px;margin-top:8px">${LIVE.prodProgress(i)}</div>
            </div>
            <div class="btn-row">
              ${i.status === 'production' ? `<button class="btn ghost" data-action="toSkeleton">← Skeleton</button><button class="btn good" data-action="publish">Mark published</button>` : `<button class="btn" data-action="unpublish">Back to production</button>`}
            </div>
          </div>
          <div class="subtabs">${subs.map(([v, l]) => `<button class="${state.prod.sub === v ? 'active' : ''}" data-action="sub" data-v="${v}">${l}</button>`).join('')}</div>
          ${({ package: prodPackage, train: prodTrain, hook: prodHook, script: prodScript, checklist: prodChecklist }[state.prod.sub] || prodPackage)(i)}
        </div>`}
      </section>
    </div>`;
  }

  function prodPackage(i) {
    const p = i.prod;
    return `
    <div class="card">
      <div class="card-head"><h3 style="margin:0">Title options</h3><span class="muted" style="font-size:.8rem">Write 10+. Pick the winner. Aim for under ~60 characters.</span></div>
      ${p.titles.map((t, n) => `<div class="option ${t.pick ? 'pick' : ''}">
        <button class="pick-btn" data-action="pickTitle" data-i="${n}">${t.pick ? '★ Picked' : 'Pick'}</button>
        <input type="text" data-bind="prod.titles.${n}.text" value="${esc(t.text)}" placeholder="Title option ${n + 1}">
        <span data-live="charCount" data-path="prod.titles.${n}.text">${LIVE.charCount(i, { dataset: { path: `prod.titles.${n}.text` } })}</span>
        <button class="btn sm ghost" data-action="delTitle" data-i="${n}">✕</button></div>`).join('')}
      <button class="btn" data-action="addTitle">+ Add title option</button>
    </div>
    <div class="card">
      <div class="card-head"><h3 style="margin:0">Thumbnail mockups</h3><span class="muted" style="font-size:.8rem">Previews use your picked title. Same promise as the title — not the same words.</span></div>
      ${p.thumbs.length ? `<div class="thumb-cards">${p.thumbs.map((t, n) => `<div class="thumb-card ${t.pick ? 'pick' : ''}">
          <div data-live="prodThumb" data-idx="${n}">${thumbHTML(t, pickedTitle(i))}</div>
          ${thumbControls({ text: `prod.thumbs.${n}.text`, desc: `prod.thumbs.${n}.desc`, bg: `prod.thumbs.${n}.bg`, color: `prod.thumbs.${n}.color`, img: `prod.thumbs.${n}.img` }, t)}
          <div class="btn-row"><button class="pick-btn" data-action="pickThumb" data-i="${n}">${t.pick ? '★ Picked' : 'Pick this one'}</button><button class="btn sm ghost danger" data-action="delThumb" data-i="${n}" style="margin-left:auto">Delete</button></div>
        </div>`).join('')}</div>` : `<p class="muted" style="margin-bottom:12px">No thumbnail concepts yet.</p>`}
      <button class="btn" data-action="addThumb" style="margin-top:14px">+ Add thumbnail concept</button>
    </div>`;
  }

  function prodTrain(i) {
    const b = i.prod.beats;
    return `
    <div class="card">
      <h3>The But / Therefore train</h3>
      <p class="muted" style="font-size:.88rem;margin-bottom:14px">Every beat should connect to the next with <strong style="color:var(--accent2)">BUT</strong> (a complication) or <strong style="color:var(--good)">THEREFORE</strong> (a consequence). If it's <strong style="color:var(--bad)">AND THEN</strong>, it's a list, not a story — that's where viewers leave.</p>
      <div class="train-stats" data-live="trainStats">${LIVE.trainStats(i)}</div>
      ${b.length ? `<div class="train">${b.map((x, n) => {
        const lk = x.link || 'therefore';
        return `${n ? `<div class="link ${lk}"><select data-bind="prod.beats.${n}.link" data-rerender>${Object.entries(LINKS).map(([v, l]) => `<option value="${v}" ${lk === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${lk === 'and' ? '<span class="warn">Weak link — can this be a BUT or THEREFORE?</span>' : ''}</div>` : ''}
        <div class="beat"><span class="n">${n + 1}</span>
          <textarea data-bind="prod.beats.${n}.text" rows="2" placeholder="${n ? 'What happens next…' : 'The setup — where we start'}">${esc(x.text)}</textarea>
          <div class="tools"><button data-action="moveBeat" data-i="${n}" data-d="-1" title="Move up">↑</button><button data-action="moveBeat" data-i="${n}" data-d="1" title="Move down">↓</button><button data-action="delBeat" data-i="${n}" title="Delete">✕</button></div>
        </div>`;
      }).join('')}</div>` : `<div class="empty"><strong>No beats yet</strong>Start with the setup, or import your skeleton outline.</div>`}
      <div class="btn-row" style="margin-top:16px">
        ${b.length ? `<button class="btn" data-action="addBeat" data-link="but">+ BUT…</button><button class="btn" data-action="addBeat" data-link="therefore">+ THEREFORE…</button>` : `<button class="btn primary" data-action="addBeat" data-link="">+ Add the setup beat</button>`}
        <button class="btn ghost" data-action="importBeats">Import skeleton outline</button>
      </div>
    </div>`;
  }

  function prodHook(i) {
    const p = i.prod;
    const f = (k, label, hint, rows) => `<div class="field"><label>${label}</label>${hint ? `<span class="hint">${hint}</span>` : ''}<textarea data-bind="prod.${k}" rows="${rows || 3}">${esc(p[k])}</textarea></div>`;
    return `
    <div class="card">
      <h3>Hook</h3>
      ${f('hook', 'The hook (0:00–0:30)', 'Confirm the click immediately — show them the thumbnail promise is real. Then open a loop.', 5)}
      ${f('stakes', 'Stakes', 'What happens if this fails? Why should they care right now?')}
      ${f('promise', 'The promise', '"By the end of this video, you will…" — must match the title and thumbnail exactly.', 2)}
      ${f('openLoops', 'Open loops', 'Questions you raise early and pay off later. One per line.', 3)}
    </div>
    <div class="card">
      <h3>Resolution</h3>
      ${f('resolution', 'Resolution / payoff', 'Close every loop. Deliver the exact promise — nothing less.', 5)}
      ${f('cta', 'CTA / next video', 'The line that plants the next episode without feeling forced.', 2)}
    </div>`;
  }

  function prodScript(i) {
    const p = i.prod;
    return `
    <div class="script-layout">
      <div>
        <div class="script-stats"><span data-live="scriptStats" style="display:flex;gap:18px">${LIVE.scriptStats(i)}</span>
          <label>wpm <input type="number" data-bind="prod.wpm" value="${esc(p.wpm || 150)}" min="80" max="250"></label>
          <span class="btn-row" style="margin-left:auto">
            <button class="btn sm" data-action="scriptTemplate" title="Insert section headings from your hook, beats and resolution">Insert structure</button>
            <button class="btn sm" data-action="copyScript">Copy</button>
            <button class="btn sm" data-action="downloadScript">Download .txt</button>
          </span>
        </div>
        <textarea class="script-area" data-bind="prod.script" placeholder="Write fast. Write messy. Don't stop.">${esc(p.script)}</textarea>
      </div>
      <aside class="card ref">
        <h3>Reference</h3>
        ${p.hook ? `<div class="blk"><strong>Hook</strong><br>${esc(p.hook)}</div>` : ''}
        ${p.beats.length ? `<strong>Train</strong><ol style="margin:6px 0 14px">${p.beats.map((b, n) => `<li>${n ? `<span class="lk">${LINKS[b.link || 'therefore']}</span>` : ''}${esc(b.text)}</li>`).join('')}</ol>` : ''}
        ${p.resolution ? `<div class="blk"><strong>Resolution</strong><br>${esc(p.resolution)}</div>` : ''}
        ${!p.hook && !p.beats.length && !p.resolution ? '<p class="muted">Fill in the hook, train and resolution tabs — they show up here while you write.</p>' : ''}
      </aside>
    </div>`;
  }

  function prodChecklist(i) {
    const p = i.prod;
    return `
    <div class="card">
      <h3>Production checklist</h3>
      <div class="checklist">${PROD_STEPS.map((s) => `<label class="check-item ${p.checklist[s.id] ? 'on' : ''}"><input type="checkbox" data-bind="prod.checklist.${s.id}" ${p.checklist[s.id] ? 'checked' : ''}><span>${s.text}</span></label>`).join('')}</div>
    </div>
    <div class="card">
      <h3>Release</h3>
      <div class="field-row">
        <div class="field"><label>Publish date</label><input type="date" data-bind="prod.publishDate" value="${esc(p.publishDate)}"></div>
        <div class="field"><label>Video URL</label><input type="url" data-bind="prod.publishedUrl" value="${esc(p.publishedUrl)}" placeholder="https://youtube.com/watch?v=…"></div>
      </div>
      <div class="field"><label>Production notes</label><textarea data-bind="prod.notes" rows="3" placeholder="Locations, gear, people to contact…">${esc(p.notes)}</textarea></div>
    </div>`;
  }

  function viewPlaybook() {
    const card = (t, body) => `<div class="card">${'<h2>' + t + '</h2>'}${body}</div>`;
    return `
    <div class="page-head"><div><h1 class="page-title">Playbook</h1><p>The script fundamentals, condensed. Full version lives in <span class="mono">docs/script-fundamentals.md</span>.</p></div></div>
    <div class="playbook">
      ${card('1 · Foundation', '<p>Find the <strong>common goal</strong>: where what the viewer wants to walk away with overlaps with what you want from the video.</p>')}
      ${card('2 · The Problem', '<p>Every great video solves two problems: the <strong>surface</strong> one they Googled and the <strong>deeper</strong> emotional one they\'d never say out loud.</p><ul><li>Hint at the deeper one — show, don\'t tell.</li></ul>')}
      ${card('3 · Packaging', '<p>Title + thumbnail make a <strong>promise</strong>. The script delivers exactly that — nothing more, nothing less.</p><ul><li>Finish: "By the end, the viewer will have…"</li><li>Anti-promise check: what would make them feel cheated?</li></ul>')}
      ${card('4 · Audience avatars', '<p>2–3 real personas, not demographics: background, what they already know, their frustration in their own words. They decide complexity and tone.</p>')}
      ${card('5 · Research gaps', '<ul><li>Top 3–5 competing videos — what do they do well?</li><li>Unanswered comment questions — these are gold.</li><li>Your unfair advantage / unique angle.</li></ul>')}
      ${card('6 · Structure & arc', '<p>Map the viewer\'s <strong>start state → end state</strong>, then the journey:</p><ul><li>⚡ Hook (0:00–0:30)</li><li>🔥 Stakes / the call</li><li>🗺️ Trials — the main content</li><li>✨ Transformation — the payoff</li></ul>')}
      ${card('7 · Universe', '<p>Channels are serialized universes. What does this build on, what does it set up, and what line plants the next episode?</p>')}
      ${card('8 · Draft', '<ul><li>Have AI <strong>roast the outline</strong>, not write the script.</li><li>Plan 2–4 show-don\'t-tell moments.</li><li>Vary rhythm on purpose — short sentences hit hard.</li><li>Then write fast, messy, and don\'t stop.</li></ul>')}
      ${card('But / Therefore', '<p>Connect beats with <strong>BUT</strong> or <strong>THEREFORE</strong>. "And then" means it\'s a list, not a story.</p><p><em>— the South Park rule</em></p>')}
      ${card('Runtime math', '<p>Spoken scripts run about <strong>150 words per minute</strong>. A 10-minute video ≈ 1,500 words.</p>')}
    </div>`;
  }

  function viewSettings() {
    const cl = Store.settings().checklist;
    const mode = Store.mode();
    return `
    <div class="page-head"><div><h1 class="page-title">Settings</h1></div><button class="btn" data-action="lock">🔒 Lock</button></div>
    <div class="card">
      <div class="card-head"><h2>Vetting checklist</h2><div class="btn-row"><button class="btn sm ghost" data-action="clReset">Reset to defaults</button><button class="btn sm" data-action="clAdd">+ Add item</button></div></div>
      <div class="row-list">${cl.map((c, n) => `<div class="option"><span class="mono muted" style="width:20px">${n + 1}</span><input type="text" data-cl="${n}" value="${esc(c.text)}" placeholder="A yes/no question every idea should pass"><button class="btn sm ghost danger" data-action="clDel" data-i="${n}">✕</button></div>`).join('')}</div>
    </div>
    <div class="card">
      <h2>Data</h2>
      <p class="muted" style="margin:6px 0 14px">${mode === 'firebase' ? 'Connected to Firebase — your ideas sync across devices.' : mode === 'error' ? 'Firebase connection failed — check the config in js/config.js and your Firestore rules. Changes are still saved in this browser.' : mode === 'connecting' ? 'Connecting to Firebase…' : 'Saved in this browser only. Add your Firebase config to <span class="mono">js/config.js</span> to sync across devices.'}</p>
      <div class="btn-row">
        <button class="btn" data-action="exportData">⬇ Export backup (.json)</button>
        <span class="btn file-btn">⬆ Import backup<input type="file" accept="application/json,.json" id="importFile"></span>
      </div>
    </div>`;
  }

  // ── Render / routing ────────────────────────────────────────────────────
  const VIEWS = { hub: viewHub, bank: viewBank, vet: viewVet, skeleton: viewSkeleton, production: viewProduction, playbook: viewPlaybook, settings: viewSettings };

  function go(view) {
    if (!VIEWS[view]) view = 'hub';
    state.view = view;
    if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
    render();
    window.scrollTo({ top: 0 });
  }

  let pendingRender = false;
  function isEditing() {
    const a = document.activeElement;
    return a && main.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'file';
  }

  function render() {
    pendingRender = false;
    main.innerHTML = VIEWS[state.view]();
    $$('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
    updateCounts();
    updateSync();
    saveUI();
  }

  function updateCounts() {
    const counts = {
      bank: Store.all().length,
      vet: byStatus('new').length,
      skeleton: byStatus('approved').length,
      production: byStatus('production').length,
    };
    $$('[data-count]').forEach((el) => { el.textContent = counts[el.dataset.count] || ''; });
  }

  function updateSync() {
    const m = Store.mode();
    const el = $('#sync');
    el.className = 'sync ' + m;
    el.innerHTML = `<span class="dot"></span>${{ local: 'Local only', connecting: 'Connecting…', firebase: 'Synced', error: 'Sync error' }[m]}`;
  }

  // ── Events ──────────────────────────────────────────────────────────────
  function ideaFrom(el) {
    const host = el.closest('[data-id]');
    return host ? Store.get(host.dataset.id) : null;
  }

  main.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !main.contains(el)) return;
    const fn = ACTIONS[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn(el, ideaFrom(el), e);
  });

  main.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.bind) {
      const idea = ideaFrom(el);
      if (!idea) return;
      const val = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (+el.value || 0) : el.value;
      setPath(idea, el.dataset.bind, val);
      if (el.type === 'checkbox') {
        const ci = el.closest('.check-item');
        if (ci) ci.classList.toggle('on', el.checked);
      }
      queueSave(idea.id);
      if (el.hasAttribute('data-rerender')) render();
      else refreshLive(idea);
      updateCounts();
    } else if (el.dataset.cl !== undefined) {
      const s = Store.settings();
      s.checklist[+el.dataset.cl].text = el.value;
      clearTimeout(saveTimers.settings);
      saveTimers.settings = setTimeout(() => Store.saveSettings(s), 400);
    } else if (el.id === 'bankSearch') {
      state.bank.q = el.value;
      $('#bankGrid').innerHTML = bankGrid();
    }
  });

  main.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'bankSort') { state.bank.sort = el.value; $('#bankGrid').innerHTML = bankGrid(); saveUI(); }
    else if (el.hasAttribute('data-deck') && el.value) {
      const i = Store.get(el.value);
      if (i) { i.onDeck = true; saveNow(i); toast('Added to On Deck'); render(); }
    } else if (el.dataset.img && el.files[0]) {
      const idea = ideaFrom(el);
      resizeImage(el.files[0]).then((data) => {
        setPath(idea, el.dataset.img, data);
        saveNow(idea);
        render();
      }).catch(() => toast('Could not read that image'));
    } else if (el.id === 'importFile' && el.files[0]) {
      el.files[0].text().then((t) => {
        try { toast(`Imported ${Store.importJSON(t)} ideas`); render(); } catch (err) { alert('That file is not a ScriptForge backup.'); }
      });
    }
  });

  main.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-form="capture"]');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('input[name=idea]');
    if (addIdea(input.value)) {
      const v = state.view;
      render();
      // Keep the cursor in the capture box for rapid-fire brain dumps.
      const again = $('[data-form="capture"] input[name=idea]', main);
      if (again) again.focus();
      if (v === 'bank') window.scrollTo({ top: 0 });
    }
  });

  main.addEventListener('focusout', () => {
    setTimeout(() => { if (pendingRender && !isEditing()) render(); }, 50);
  });

  $('#nav').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (b) go(b.dataset.view);
  });
  window.addEventListener('hashchange', () => go(location.hash.slice(1)));

  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const scale = Math.min(1, 640 / img.width);
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.75));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  function isUnlocked() {
    try { return localStorage.getItem('sf_unlock') === '1' || sessionStorage.getItem('sf_unlock') === '1'; } catch (e) { return false; }
  }

  function start() {
    $('#lock').classList.add('hidden');
    $('#app').classList.remove('hidden');
    Store.onChange((src) => {
      if (src === 'mode') { updateSync(); return; }
      if (isEditing()) pendingRender = true;
      else render();
    });
    Store.init();
    go(location.hash.slice(1) || state.view);
  }

  $('#lockForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = $('#lockInput').value.trim().toLowerCase() === String(window.SF_PASSWORD).toLowerCase();
    if (!ok) {
      $('#lockError').classList.remove('hidden');
      const card = $('#lockForm');
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      $('#lockInput').select();
      return;
    }
    try { ($('#lockRemember').checked ? localStorage : sessionStorage).setItem('sf_unlock', '1'); } catch (err) {}
    start();
  });

  if (isUnlocked()) start();
})();
