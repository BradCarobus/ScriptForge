// ─── Data layer ─────────────────────────────────────────────────────────────
// Ideas live in one collection. Always cached in localStorage; mirrored to
// Firestore when a Firebase config is present in config.js.
(function () {
  const LS_IDEAS = 'sf_ideas_v1';
  const LS_SETTINGS = 'sf_settings_v1';
  const FB_VERSION = '10.12.2';

  const DEFAULT_CHECKLIST = [
    { id: 'click', text: 'I would click this if a stranger made it' },
    { id: 'pitch', text: 'I can pitch it in one sentence' },
    { id: 'package', text: 'I can already picture the title + thumbnail' },
    { id: 'curiosity', text: 'There is a clear curiosity gap — a question the viewer needs answered' },
    { id: 'stakes', text: 'There are real stakes — something to win or lose' },
    { id: 'broad', text: 'It can reach beyond my current audience' },
    { id: 'angle', text: 'I have an angle nobody else has done' },
    { id: 'excited', text: "I'd be excited to spend 20+ hours on it" },
    { id: 'feasible', text: 'I can actually make it (time, money, access)' },
    { id: 'payoff', text: 'The ending can pay off the promise' },
  ];

  let ideas = {};
  let settings = { checklist: DEFAULT_CHECKLIST.slice() };
  let db = null;
  let mode = 'local'; // 'local' | 'connecting' | 'firebase' | 'error'
  let listeners = [];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function readLocal() {
    try { ideas = JSON.parse(localStorage.getItem(LS_IDEAS)) || {}; } catch (e) { ideas = {}; }
    try {
      const s = JSON.parse(localStorage.getItem(LS_SETTINGS));
      if (s && Array.isArray(s.checklist)) settings = s;
    } catch (e) {}
  }

  function writeLocal() {
    try {
      localStorage.setItem(LS_IDEAS, JSON.stringify(ideas));
      localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.warn('localStorage write failed', e);
    }
  }

  function emit(source) {
    listeners.forEach((fn) => fn(source));
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  async function connectFirebase(config) {
    mode = 'connecting';
    emit('mode');
    try {
      const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;
      await loadScript(`${base}/firebase-app-compat.js`);
      await loadScript(`${base}/firebase-firestore-compat.js`);
      firebase.initializeApp(config);
      db = firebase.firestore();

      let first = true;
      db.collection('ideas').onSnapshot((snap) => {
        const remote = {};
        snap.forEach((d) => { remote[d.id] = d.data(); });
        // First connect with an empty database: upload what's in this browser.
        if (first && snap.empty && Object.keys(ideas).length) {
          Object.values(ideas).forEach((i) => db.collection('ideas').doc(i.id).set(i));
        } else if (snap.metadata.hasPendingWrites) {
          // Echo of our own local write — data already matches, skip the re-render.
          ideas = remote;
          writeLocal();
        } else {
          ideas = remote;
          writeLocal();
          emit('remote');
        }
        first = false;
        mode = 'firebase';
        emit('mode');
      }, (err) => {
        console.error(err);
        mode = 'error';
        emit('mode');
      });

      db.collection('meta').doc('settings').onSnapshot((d) => {
        if (d.exists && Array.isArray(d.data().checklist)) {
          settings = d.data();
          writeLocal();
          emit('remote');
        }
      });
    } catch (e) {
      console.error(e);
      mode = 'error';
      emit('mode');
    }
  }

  function blankIdea(title) {
    const now = Date.now();
    return {
      id: uid(),
      title: title || '',
      notes: '',
      tags: [],
      status: 'new', // new | parked | rejected | approved | production | published
      starred: false,
      onDeck: false,
      createdAt: now,
      updatedAt: now,
      vet: { checks: {}, notes: '' },
      skeleton: {
        title: '', thumbText: '', thumbDesc: '', thumbBg: '#1f1f1a', thumbColor: '#ffffff', thumbImg: '',
        hook: '', stakes: '', outline: '', payoff: '', audience: '', notes: '',
      },
      prod: null,
    };
  }

  function blankProd(idea) {
    const s = idea.skeleton || {};
    const beats = (s.outline || '')
      .split('\n')
      .map((l) => l.replace(/^\s*([-*•]|\d+[.)])\s*/, '').trim())
      .filter(Boolean)
      .map((text, i) => ({ id: uid(), text, link: i === 0 ? '' : /^but\b/i.test(text) ? 'but' : /^and\b/i.test(text) ? 'and' : 'therefore' }));
    return {
      titles: s.title ? [{ id: uid(), text: s.title, pick: true }] : [],
      thumbs: (s.thumbText || s.thumbDesc || s.thumbImg)
        ? [{ id: uid(), text: s.thumbText, desc: s.thumbDesc, bg: s.thumbBg, color: s.thumbColor, img: s.thumbImg, pick: true }]
        : [],
      beats,
      hook: s.hook || '',
      stakes: s.stakes || '',
      promise: '',
      openLoops: '',
      resolution: s.payoff || '',
      cta: '',
      script: '',
      wpm: 150,
      checklist: {},
      publishDate: '',
      publishedUrl: '',
    };
  }

  window.Store = {
    DEFAULT_CHECKLIST,
    uid,
    blankIdea,
    blankProd,

    init() {
      readLocal();
      const cfg = window.SF_FIREBASE_CONFIG || {};
      if (cfg.apiKey && cfg.projectId) connectFirebase(cfg);
    },
    onChange(fn) { listeners.push(fn); },
    mode() { return mode; },

    all() { return Object.values(ideas); },
    get(id) { return ideas[id]; },

    add(title) {
      const idea = blankIdea(title);
      this.save(idea);
      return idea;
    },

    save(idea) {
      idea.updatedAt = Date.now();
      ideas[idea.id] = idea;
      writeLocal();
      if (db) {
        db.collection('ideas').doc(idea.id).set(JSON.parse(JSON.stringify(idea)))
          .catch((e) => { console.error(e); mode = 'error'; emit('mode'); });
      }
    },

    remove(id) {
      delete ideas[id];
      writeLocal();
      if (db) db.collection('ideas').doc(id).delete();
    },

    settings() { return settings; },
    saveSettings(next) {
      settings = next;
      writeLocal();
      if (db) db.collection('meta').doc('settings').set(JSON.parse(JSON.stringify(settings)));
    },

    exportJSON() {
      return JSON.stringify({ app: 'scriptforge', version: 2, exportedAt: new Date().toISOString(), settings, ideas: Object.values(ideas) }, null, 2);
    },

    importJSON(text) {
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.ideas)) throw new Error('Not a ScriptForge backup');
      data.ideas.forEach((i) => { if (i && i.id) this.save(i); });
      if (data.settings && Array.isArray(data.settings.checklist)) this.saveSettings(data.settings);
      return data.ideas.length;
    },
  };
})();
