/* Dutch A2 Inburgering Practice v2 — Turkish UI */
(function () {
  const D = window.A2DATA;
  if (!D) { document.getElementById('main').innerHTML = '<div class="card"><p>Veri yüklenemedi. data/all-data.js dosyasını kontrol edin.</p></div>'; return; }

  const SK = 'dutchA2v2_progress';
  const SS = 'dutchA2v2_settings';
  const DEFAULTS = { provider: 'xai', apiKey: '', model: 'grok-4-fast', openaiModel: 'gpt-4o-mini', langEN: false, ttsRate: 0.9 };
  const PROVIDERS = {
    xai: { name: 'xAI (Grok)', base: 'https://api.x.ai/v1' },
    openai: { name: 'OpenAI', base: 'https://api.openai.com/v1' }
  };

  // Exam timing (researched DUO A2)
  const EXAM = D.exam;

  function loadP() {
    try { return Object.assign(defP(), JSON.parse(localStorage.getItem(SK) || '{}')); }
    catch { return defP(); }
  }
  function defP() {
    return {
      reading: {}, writing: {}, listening: {}, speaking: {}, knm: {}, vocab: {}, // id -> score/box
      history: [], mocks: [], streak: 0, lastStudy: null,
      plan: { examDates: {}, dailyMin: 45, generated: null },
      grammar: { history: [] },
      bank: { done: {}, mocks: [] },
      weak: {}
    };
  }
  function saveP(p) { localStorage.setItem(SK, JSON.stringify(p)); }
  function loadS() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(SS) || '{}')); }
    catch { return Object.assign({}, DEFAULTS); }
  }
  function saveS(s) { localStorage.setItem(SS, JSON.stringify(s)); }

  let progress = loadP();
  let settings = loadS();
  let state = {
    screen: 'home', sub: null, id: null,
    answers: {}, checked: false,
    vocabIdx: 0, vocabFlip: false, vocabQueue: null,
    mock: null, chat: [], chatBusy: false,
    listenReplays: 0, speakRec: null, speakBlob: null, speakText: '',
    showEN: false
  };

  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); };
  const shuffle = a => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[x[i], x[j]] = [x[j], x[i]]; } return x; };
  const pct = (n, d) => d ? Math.round(100 * n / d) : 0;
  const today = () => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };

  /* ===== NAV ===== */
  $('#nav').addEventListener('click', e => {
    const b = e.target.closest('button[data-n]');
    if (!b) return;
    go(b.dataset.n);
  });
  function setNav(n) {
    const map = { home: 'home', practice: 'practice', reading: 'practice', writing: 'practice', listening: 'practice', speaking: 'practice', knm: 'practice', vocab: 'practice', plan: 'plan', mocks: 'mocks', mockRun: 'mocks', grammar: 'practice', bank: 'practice', bankList: 'practice', bankItem: 'practice', bankMock: 'mocks', progress: 'more', tutor: 'more', settings: 'more', help: 'more', more: 'more' };
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.n === (map[n] || n)));
  }
  function go(screen, opts = {}) {
    Object.assign(state, { screen, answers: {}, checked: false, listenReplays: 0, speakBlob: null, speakText: '' }, opts);
    setNav(screen);
    render();
    window.scrollTo(0, 0);
  }

  /* ===== TTS / STT ===== */
  function speakNL(text, rate) {
    return new Promise((resolve, reject) => {
      if (!window.speechSynthesis) { reject(new Error('TTS yok')); return; }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices();
      const nl = voices.find(v => /nl(-|_)?NL/i.test(v.lang)) || voices.find(v => /^nl/i.test(v.lang));
      if (nl) u.voice = nl;
      u.lang = 'nl-NL';
      u.rate = rate || settings.ttsRate || 0.9;
      u.onend = () => resolve();
      u.onerror = e => reject(e.error || e);
      speechSynthesis.speak(u);
    });
  }
  function hasNLVoice() {
    const voices = speechSynthesis.getVoices() || [];
    return voices.some(v => /^nl/i.test(v.lang));
  }
  function getRecognition() {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) return null;
    const r = new R();
    r.lang = 'nl-NL'; r.interimResults = false; r.maxAlternatives = 1;
    return r;
  }

  /* ===== RENDER ===== */
  function render() {
    const main = $('#main');
    const views = {
      home: viewHome, practice: viewPractice, reading: viewReadingList, readingDetail: viewReadingDetail,
      writing: viewWritingList, writingDetail: viewWritingDetail, listening: viewListenList, listeningDetail: viewListenDetail,
      speaking: viewSpeakList, speakingDetail: viewSpeakDetail, knm: viewKnm, vocab: viewVocab,
      plan: viewPlan, mocks: viewMocks, mockRun: viewMockRun, progress: viewProgress,
      tutor: viewTutor, settings: viewSettings, help: viewHelp, more: viewMore, grammar: viewGrammar,
      bank: viewBank, bankList: viewBankList, bankItem: viewBankItem, bankMock: viewBankMock
    };
    main.innerHTML = `<div class="screen">${(views[state.screen] || viewHome)()}</div>`;
    bind();
  }

  function viewHome() {
    const tasks = todayTasks();
    const ready = readiness();
    return `
      <div class="card">
        <h2>Hoş geldin / Welkom</h2>
        <p class="muted">DUO A2 inburgering pratiği. Arayüz Türkçe; alıştırmalar Hollandaca. Seri: <strong>${progress.streak || 0}</strong> gün</p>
        <div class="stats">
          <div class="st"><div class="n">${Object.keys(progress.reading).length}/${D.readings.length}</div><div class="l">Lezen</div></div>
          <div class="st"><div class="n">${Object.keys(progress.vocab).filter(k => (progress.vocab[k] || 0) >= 4).length}</div><div class="l">Kelime (kutu≥4)</div></div>
          <div class="st"><div class="n">${progress.mocks.length}</div><div class="l">Deneme</div></div>
        </div>
      </div>
      <button class="mbtn" data-go="bank" style="margin-bottom:12px;border:2px solid var(--p);background:#eef4fc"><span class="ic">🗂️</span><div><strong>Sınav Soru Bankası</strong><span>${window.EXAM_BANK ? (EXAM_BANK.lezen.length + ' metin · ' + EXAM_BANK.luisteren.length + ' dinleme · ' + EXAM_BANK.knm.length + ' KNM · ' + EXAM_BANK.schrijven.length + ' yazma · ' + EXAM_BANK.spreken.length + ' konuşma') : ''} · resmi formatta denemeler</span></div></button>
      <button class="mbtn" data-go="grammar" style="margin-bottom:12px;border:2px solid var(--a);background:#fffbea"><span class="ic" style="background:var(--a)">📝</span><div><strong>Gramer Testi</strong><span>${(window.GRAMMAR_TEST||{questions:[]}).questions.length} soru · ayrılabilen fiiller, op, fiil yeri, naar/bij</span></div></button>
      <div class="card">
        <h2>Bugünün planı</h2>
        ${tasks.length ? tasks.map(t => `<div class="plan-day"><strong>${esc(t.title)}</strong><div class="muted">${esc(t.detail)} · ~${t.min} dk</div></div>`).join('') : '<p class="muted">Plan için sınav tarihi ve günlük süreyi Plan sekmesinden gir.</p>'}
        <button class="btn bp bb" data-go="plan" style="margin-top:8px">Planı aç</button>
      </div>
      <div class="card">
        <h2>Hazırlık tahmini</h2>
        ${Object.entries(ready).map(([k, v]) => `<div class="rb" style="margin:4px 0"><span>${esc(v.label)}</span><span class="pill">${v.pct}% · ${esc(v.note)}</span></div>`).join('')}
      </div>
      <div class="grid">
        <button class="mbtn" data-go="practice"><span class="ic">📚</span><div><strong>Pratik</strong><span>Lezen, Luisteren, Schrijven, Spreken, KNM, Vocab</span></div></button>
        <button class="mbtn" data-go="mocks"><span class="ic">⏱️</span><div><strong>Deneme sınavları</strong><span>Gerçek süre ve format</span></div></button>
        <button class="mbtn" data-go="tutor"><span class="ic">🤖</span><div><strong>Yapay zekâ öğretmen</strong><span>Türkçe cevap (API anahtarı)</span></div></button>
      </div>`;
  }

  function viewPractice() {
    return `<div class="card"><h2>Pratik bölümleri</h2>
      <div class="grid">
        <button class="mbtn" data-go="bank" style="border:2px solid var(--p)"><span class="ic">🗂️</span><div><strong>Sınav Soru Bankası</strong><span>Bölüm ve konuya göre</span></div></button>
        <button class="mbtn" data-go="grammar" style="border:2px solid var(--a)"><span class="ic">📝</span><div><strong>Gramer Testi</strong><span>${(window.GRAMMAR_TEST||{questions:[]}).questions.length} soru · 5 konu</span></div></button>
        <button class="mbtn" data-go="reading"><span class="ic">📖</span><div><strong>Lezen</strong><span>${D.readings.length} metin</span></div></button>
        <button class="mbtn" data-go="listening"><span class="ic">🎧</span><div><strong>Luisteren</strong><span>${D.listening.length} dinleme</span></div></button>
        <button class="mbtn" data-go="writing"><span class="ic">✍️</span><div><strong>Schrijven</strong><span>${D.writings.length} yazma</span></div></button>
        <button class="mbtn" data-go="speaking"><span class="ic">🗣️</span><div><strong>Spreken</strong><span>${D.speaking.length} konuşma</span></div></button>
        <button class="mbtn" data-go="knm"><span class="ic">🏛️</span><div><strong>KNM</strong><span>${D.knm.questions.length} soru · 8 tema</span></div></button>
        <button class="mbtn" data-go="vocab"><span class="ic">🃏</span><div><strong>Kelime</strong><span>${D.vocab.length} kelime · Leitner</span></div></button>
      </div></div>`;
  }

  function viewMore() {
    return `<div class="card"><h2>Diğer</h2>
      <button class="mbtn" data-go="progress" style="margin-bottom:8px"><span class="ic">📊</span><div><strong>İlerleme</strong><span>Grafik ve geçmiş</span></div></button>
      <button class="mbtn" data-go="tutor" style="margin-bottom:8px"><span class="ic">🤖</span><div><strong>YZ öğretmen</strong><span>Ayarlarda anahtar</span></div></button>
      <button class="mbtn" data-go="settings" style="margin-bottom:8px"><span class="ic">⚙️</span><div><strong>Ayarlar</strong><span>API, TTS hızı, yedek</span></div></button>
      <button class="mbtn" data-go="help"><span class="ic">❓</span><div><strong>Yardım</strong><span>Sınav formatı ve tarayıcı</span></div></button>
    </div>`;
  }

  /* ===== READING ===== */
  function viewReadingList() {
    return `<div class="card"><button class="btn bg bs" data-go="practice">← Pratik</button>
      <h2 style="margin-top:8px">Lezen — Okuma</h2>
      <p class="muted">${D.readings.length} orijinal A2 metin · her birinde 3 soru</p>
      ${D.readings.map(r => {
      const sc = progress.reading[r.id];
      return `<div class="li" data-rid="${esc(r.id)}"><div><span class="badge">${esc(r.type)}</span><strong>${esc(r.title)}</strong></div><span class="pill">${sc != null ? sc + '/' + r.questions.length : '—'}</span></div>`;
    }).join('')}</div>`;
  }
  function viewReadingDetail() {
    const r = D.readings.find(x => x.id === state.id);
    if (!r) return '<div class="card">Bulunamadı</div>';
    const qs = r.questions.map((q, qi) => {
      const sel = state.answers[qi];
      const ch = q.choices.map((c, ci) => {
        let cls = 'ch' + (sel === ci ? ' sel' : '');
        if (state.checked) { if (ci === q.answer) cls += ' ok'; else if (sel === ci) cls += ' bad'; }
        return `<button class="${cls}" data-qi="${qi}" data-ci="${ci}" ${state.checked ? 'disabled' : ''}>${String.fromCharCode(97 + ci)}) ${esc(c)}</button>`;
      }).join('');
      const exp = state.checked ? `<div class="exp"><strong>${sel === q.answer ? '✓ Doğru' : '✗ Yanlış'}.</strong> ${esc(q.explain_tr)}</div>` : '';
      return `<div style="margin:12px 0"><h3>${qi + 1}. ${esc(q.q)}</h3>${ch}${exp}</div>`;
    }).join('');
    return `<div class="card"><button class="btn bg bs" data-go="reading">← Liste</button>
      <h2 style="margin-top:8px">${esc(r.title)}</h2>
      <div class="rtxt">${esc(r.text)}</div>${qs}
      <div class="row">${state.checked
        ? `<button class="btn bg" data-go="reading">Liste</button><button class="btn bp" id="retry">Tekrar</button>`
        : `<button class="btn bp" id="checkR" ${Object.keys(state.answers).length < r.questions.length ? 'disabled' : ''}>Kontrol et</button>`
      }</div></div>`;
  }

  /* ===== WRITING ===== */
  function viewWritingList() {
    return `<div class="card"><button class="btn bg bs" data-go="practice">← Pratik</button>
      <h2 style="margin-top:8px">Schrijven — Yazma</h2>
      ${D.writings.map(w => `<div class="li" data-wid="${esc(w.id)}"><strong>${esc(w.title)}</strong><span class="pill">${progress.writing[w.id] ? 'Tamam' : '—'}</span></div>`).join('')}
    </div>`;
  }
  function viewWritingDetail() {
    const w = D.writings.find(x => x.id === state.id);
    if (!w) return '<div class="card">Yok</div>';
    const hasKey = !!(settings.apiKey && settings.apiKey.trim());
    return `<div class="card"><button class="btn bg bs" data-go="writing">← Liste</button>
      <h2 style="margin-top:8px">${esc(w.title)}</h2>
      <p>${esc(w.prompt_tr)}</p>
      <h3>Faydalı kalıplar</h3><div>${w.phrases.map(p => `<span class="chip">${esc(p)}</span>`).join('')}</div>
      <h3>Kontrol listesi</h3><ul style="margin-left:18px">${w.checklist_tr.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
      <div class="exp">${esc(w.tip_tr)}</div>
      <h3>Cevabın</h3><textarea class="ta" id="wIn" placeholder="Hollandaca yaz..."></textarea>
      <div class="row">
        <button class="btn bp" id="showModel">Örnek cevap</button>
        <button class="btn bg" id="markW">Tamamlandı</button>
        <button class="btn ba" id="aiW">${hasKey ? 'YZ düzeltme' : 'YZ (anahtar gerekli)'}</button>
      </div>
      <div id="modelW" class="hidden"><h3>Model</h3><div class="model">${esc(w.model)}</div>
        <button class="btn bg bs" id="ttsModel" style="margin-top:6px">🔊 TTS dinle</button></div>
      <div id="aiOut" class="hidden" style="margin-top:10px"></div>
    </div>`;
  }

  /* ===== LISTENING ===== */
  function viewListenList() {
    return `<div class="card"><button class="btn bg bs" data-go="practice">← Pratik</button>
      <h2 style="margin-top:8px">Luisteren — Dinleme</h2>
      <p class="muted">Web Speech TTS (nl-NL). Gerçek sınavda video/ses; burada metin seslendirilir. Tekrar hakkı sınırı var.</p>
      <div id="voiceWarn"></div>
      ${D.listening.map(l => `<div class="li" data-lid="${esc(l.id)}"><div><span class="badge">${esc(l.type)}</span><strong>${esc(l.title)}</strong></div>
        <span class="pill">${progress.listening[l.id] != null ? progress.listening[l.id] + '/' + l.questions.length : '—'}</span></div>`).join('')}
    </div>`;
  }
  function viewListenDetail() {
    const l = D.listening.find(x => x.id === state.id);
    if (!l) return '<div class="card">Yok</div>';
    const left = (l.replayLimit || 2) - state.listenReplays;
    const qs = l.questions.map((q, qi) => {
      const sel = state.answers[qi];
      const ch = q.choices.map((c, ci) => {
        let cls = 'ch' + (sel === ci ? ' sel' : '');
        if (state.checked) { if (ci === q.answer) cls += ' ok'; else if (sel === ci) cls += ' bad'; }
        return `<button class="${cls}" data-qi="${qi}" data-ci="${ci}" ${state.checked ? 'disabled' : ''}>${String.fromCharCode(97 + ci)}) ${esc(c)}</button>`;
      }).join('');
      const exp = state.checked ? `<div class="exp">${esc(q.explain_tr)}</div>` : '';
      return `<div style="margin:10px 0"><h3>${qi + 1}. ${esc(q.q)}</h3>${ch}${exp}</div>`;
    }).join('');
    return `<div class="card"><button class="btn bg bs" data-go="listening">← Liste</button>
      <h2 style="margin-top:8px">${esc(l.title)}</h2>
      <div class="audio-box">
        <button class="btn bp" id="playL" ${left <= 0 && !state.checked ? 'disabled' : ''}>▶ Dinle</button>
        <span class="muted">Kalan tekrar: ${Math.max(0, left)}</span>
        <label class="muted">Hız <input type="range" id="rateL" min="0.6" max="1.2" step="0.05" value="${settings.ttsRate}" style="width:100px;margin:0"></label>
      </div>
      ${state.checked ? `<div class="model"><strong>Transkript:</strong>\n${esc(l.transcript)}</div>` : '<p class="muted">Transkript cevapladıktan sonra açılır.</p>'}
      ${qs}
      <button class="btn bp" id="checkL" ${Object.keys(state.answers).length < l.questions.length || state.checked ? 'disabled' : ''}>Kontrol et</button>
    </div>`;
  }

  /* ===== SPEAKING ===== */
  function viewSpeakList() {
    return `<div class="card"><button class="btn bg bs" data-go="practice">← Pratik</button>
      <h2 style="margin-top:8px">Spreken — Konuşma</h2>
      <p class="muted">Gerçek sınavda bilgisayara konuşursun (mikrofon). Burada kaydet + isteğe bağlı konuşmayı yazıya çevir.</p>
      ${D.speaking.map(s => `<div class="li" data-sid="${esc(s.id)}"><div><span class="badge">${esc(s.type)}</span><strong>${esc(s.title)}</strong></div>
        <span class="pill">${progress.speaking[s.id] != null ? progress.speaking[s.id] + '%' : '—'}</span></div>`).join('')}
    </div>`;
  }
  function viewSpeakDetail() {
    const s = D.speaking.find(x => x.id === state.id);
    if (!s) return '<div class="card">Yok</div>';
    const hasKey = !!(settings.apiKey && settings.apiKey.trim());
    return `<div class="card"><button class="btn bg bs" data-go="speaking">← Liste</button>
      <h2 style="margin-top:8px">${esc(s.title)}</h2>
      <p class="muted">${esc(s.prompt_tr)}</p>
      <div class="rtxt">${esc(s.prompt_nl)}</div>
      <div class="exp">${esc(s.tip_tr)}</div>
      <div class="row" style="margin:10px 0">
        <button class="btn bp" id="recStart">● Kaydet</button>
        <button class="btn bg" id="recStop" disabled>■ Dur</button>
        <button class="btn ba" id="sttBtn">STT (nl-NL)</button>
        <button class="btn bg" id="playModelS">🔊 Model TTS</button>
      </div>
      <div id="recStatus" class="muted"></div>
      <audio id="recAudio" controls class="hidden" style="width:100%;margin:8px 0"></audio>
      <label class="f">Algılanan / yazdığın metin</label>
      <textarea class="ta" id="sText" placeholder="Konuşma metni burada...">${esc(state.speakText)}</textarea>
      <div class="row">
        <button class="btn bok" id="scoreS">Anahtar kelime kontrolü</button>
        <button class="btn ba" id="aiS">${hasKey ? 'YZ geri bildirim' : 'YZ (anahtar)'}</button>
        <button class="btn bg" id="showMS">Model cevap</button>
      </div>
      <div id="sOut" style="margin-top:8px"></div>
      <div id="sModel" class="hidden"><div class="model">${esc(s.model)}</div></div>
    </div>`;
  }

  /* ===== KNM ===== */
  function viewKnm() {
    if (state.sub === 'theme' && state.id) {
      const qs = D.knm.questions.filter(q => q.theme === state.id);
      const th = D.knm.themes.find(t => t.id === state.id);
      return `<div class="card"><button class="btn bg bs" data-go="knm">← Temalar</button>
        <h2 style="margin-top:8px">${esc(th ? th.tr : state.id)}</h2>
        <p class="muted">${qs.length} soru</p>
        ${qs.map((q, i) => `<div class="li" data-kid="${esc(q.id)}"><strong>${i + 1}. ${esc(q.q)}</strong><span class="pill">${progress.knm[q.id] === 1 ? '✓' : progress.knm[q.id] === 0 ? '✗' : '—'}</span></div>`).join('')}
      </div>`;
    }
    if (state.sub === 'q' && state.id) {
      const q = D.knm.questions.find(x => x.id === state.id);
      if (!q) return '<div class="card">Yok</div>';
      const sel = state.answers[0];
      const ch = q.choices.map((c, ci) => {
        let cls = 'ch' + (sel === ci ? ' sel' : '');
        if (state.checked) { if (ci === q.answer) cls += ' ok'; else if (sel === ci) cls += ' bad'; }
        return `<button class="${cls}" data-qi="0" data-ci="${ci}" ${state.checked ? 'disabled' : ''}>${String.fromCharCode(97 + ci)}) ${esc(c)}</button>`;
      }).join('');
      return `<div class="card"><button class="btn bg bs" id="backKnmTheme">← Tema</button>
        <span class="badge">${esc(q.theme_tr)}</span>
        <h2 style="margin-top:8px">${esc(q.q)}</h2>${ch}
        ${state.checked ? `<div class="exp">${esc(q.explain_tr)}</div>` : ''}
        ${!state.checked ? `<button class="btn bp" id="checkK" ${sel == null ? 'disabled' : ''}>Kontrol</button>` : `<button class="btn bp" id="nextK">Sonraki</button>`}
      </div>`;
    }
    return `<div class="card"><button class="btn bg bs" data-go="practice">← Pratik</button>
      <h2 style="margin-top:8px">KNM — Hollanda toplumu</h2>
      <p class="muted">8 resmi tema (2025 eindtermen). ${D.knm.questions.length} soru.</p>
      ${D.knm.themes.map(t => {
      const qs = D.knm.questions.filter(q => q.theme === t.id);
      const done = qs.filter(q => progress.knm[q.id] != null).length;
      return `<div class="li" data-ktheme="${esc(t.id)}"><div><strong>${esc(t.tr)}</strong><div class="muted">${esc(t.nl)}</div></div><span class="pill">${done}/${qs.length}</span></div>`;
    }).join('')}
    </div>`;
  }

  /* ===== VOCAB Leitner ===== */
  function leitnerDue() {
    // boxes 0-5; show box 0 always, higher boxes less often via simple rotation
    const items = D.vocab.map((v, i) => ({ ...v, idx: i, box: progress.vocab[i] || 0 }));
    const due = items.filter(v => v.box < 5).sort((a, b) => a.box - b.box || Math.random() - 0.5);
    return due;
  }
  function viewVocab() {
    if (!state.vocabQueue) state.vocabQueue = leitnerDue();
    const known = Object.values(progress.vocab).filter(b => b >= 4).length;
    if (!state.vocabQueue.length) {
      return `<div class="card"><h2>Kelime</h2><p>Tüm kelimeler yüksek kutuda 🎉</p>
        <button class="btn bp" id="resetV">Sıfırla</button></div>`;
    }
    const i = state.vocabIdx % state.vocabQueue.length;
    const c = state.vocabQueue[i];
    return `<div class="card"><button class="btn bg bs" data-go="practice">← Pratik</button>
      <div class="rb"><h2>Kelime (Leitner)</h2><span class="muted">${known} güçlü · kutu ${c.box}</span></div>
      <div class="bar"><i style="width:${pct(known, D.vocab.length)}%"></i></div>
      <span class="badge">${esc(c.theme_tr)}</span>
      <div class="flash" id="flash">
        <div class="nl">${esc(c.nl)}</div>
        ${state.vocabFlip ? `<div class="tr">${esc(c.tr)}${settings.langEN || state.showEN ? ' · ' + esc(c.en) : ''}</div><div class="muted" style="margin-top:8px">${esc(c.example)}</div>` : '<div class="muted" style="margin-top:12px">Dokun — Türkçe anlam</div>'}
      </div>
      <div class="row">
        <button class="btn bbad bb" id="vNo" ${state.vocabFlip ? '' : 'disabled'}>Bilmiyorum</button>
        <button class="btn bok bb" id="vYes" ${state.vocabFlip ? '' : 'disabled'}>Biliyorum</button>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn bg bs" id="vTts">🔊</button>
        <button class="btn bg bs" id="toggleEN">EN ${state.showEN ? 'açık' : 'kapalı'}</button>
        <button class="btn bg bs" id="resetV">Sıfırla</button>
      </div>
    </div>`;
  }

  /* ===== STUDY PLAN ===== */
  function generatePlan() {
    const daily = progress.plan.dailyMin || 45;
    const dates = progress.plan.examDates || {};
    const parts = ['lezen', 'luisteren', 'schrijven', 'spreken', 'knm'];
    const nearest = parts.map(p => dates[p]).filter(Boolean).sort()[0];
    if (!nearest) return null;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(nearest + 'T00:00:00');
    const days = Math.max(1, Math.ceil((end - start) / 86400000));
    const plan = [];
    const weakBoost = readiness();
    for (let d = 0; d < Math.min(days, 90); d++) {
      const day = new Date(start); day.setDate(start.getDate() + d);
      const iso = day.getFullYear()+'-'+String(day.getMonth()+1).padStart(2,'0')+'-'+String(day.getDate()).padStart(2,'0');
      const rot = parts[d % parts.length];
      const second = parts[(d + 2) % parts.length];
      const tasks = [];
      let left = daily;
      const mk = (part, min, title, detail) => { if (left <= 0) return; const m = Math.min(min, left); tasks.push({ part, min: m, title, detail }); left -= m; };
      // boost weak
      const weakPart = Object.entries(weakBoost).sort((a, b) => a[1].pct - b[1].pct)[0];
      if (weakPart && weakPart[1].pct < 70) mk(weakPart[0], Math.min(20, daily), 'Zayıf alan: ' + weakPart[1].label, 'Tekrar / deneme');
      mk(rot, Math.min(20, left), partLabel(rot) + ' pratik', 'Alıştırmalar');
      mk('vocab', Math.min(10, left), 'Kelime (Leitner)', 'Kartlar');
      if (left > 0) mk(second, left, partLabel(second), 'Ek pratik');
      plan.push({ date: iso, tasks });
    }
    progress.plan.generated = plan;
    saveP(progress);
    return plan;
  }
  function partLabel(p) {
    return ({ lezen: 'Lezen', luisteren: 'Luisteren', schrijven: 'Schrijven', spreken: 'Spreken', knm: 'KNM', vocab: 'Kelime' })[p] || p;
  }
  function todayTasks() {
    const plan = progress.plan.generated || generatePlan();
    if (!plan) return [];
    const t = today();
    const day = plan.find(d => d.date === t) || plan[0];
    return day ? day.tasks : [];
  }
  function viewPlan() {
    const p = progress.plan;
    const gen = p.generated || [];
    return `<div class="card">
      <h2>Kişisel çalışma planı</h2>
      <p class="muted">Her bölüm için ayrı sınav tarihi girebilirsin. Günlük dakika ile plan üretilir; zayıf alanlara öncelik verilir.</p>
      <label class="f">Günlük süre (dk)</label>
      <input type="number" id="dailyMin" value="${p.dailyMin || 45}" min="15" max="240">
      ${['lezen', 'luisteren', 'schrijven', 'spreken', 'knm'].map(k => `
        <label class="f">${partLabel(k)} sınav tarihi</label>
        <input type="date" data-edate="${k}" value="${esc(p.examDates[k] || '')}">`).join('')}
      <div class="row"><button class="btn bp" id="genPlan">Planı oluştur / güncelle</button></div>
    </div>
    <div class="card"><h2>Önümüzdeki günler</h2>
      ${gen.slice(0, 14).map(d => `<div class="plan-day"><strong>${esc(d.date)}</strong>${d.tasks.map(t => `<div class="muted">• ${esc(t.title)} (${t.min} dk)</div>`).join('')}</div>`).join('') || '<p class="muted">Henüz plan yok.</p>'}
    </div>`;
  }

  /* ===== MOCKS ===== */
  function viewMocks() {
    return `<div class="card"><h2>Deneme sınavları</h2>
      <p class="muted">Süreler resmi DUO A2 sürelerine yakındır. Geçme eşiği resmi cesuur yayımlanmadığı için tahmini (~%70).</p>
      <div class="li" style="cursor:default;background:#eef4fc;border-radius:10px;padding:10px;margin-bottom:6px"><div><strong>🗂️ Soru Bankası denemeleri (resmi format)</strong><div class="muted">Lezen 25/65dk · Luisteren 25/45dk · KNM 40/45dk · Schrijven 4/40dk · Spreken 16/35dk</div></div>
        <button class="btn bp bs" data-go="bank">Aç</button></div>
      <div class="li" style="cursor:default;background:#fffbea;border-radius:10px;padding:10px"><div><strong>📝 Gramer Testi (uzun)</strong><div class="muted">${(window.GRAMMAR_TEST||{questions:[]}).questions.length} soru · 5 konu · Türkçe açıklama</div></div>
        <button class="btn ba bs" data-go="grammar">Aç</button></div>
      ${mockMenu().map(m => `
        <div class="li" style="cursor:default"><div><strong>${esc(m.title)}</strong><div class="muted">${esc(m.desc)}</div></div>
          <button class="btn bp bs" data-mock="${esc(m.key)}">Başlat</button></div>`).join('')}
      <h3 style="margin-top:12px">Geçmiş</h3>
      ${(progress.mocks || []).slice().reverse().slice(0, 15).map(m =>
      `<div class="li" style="cursor:default"><div><strong>${esc(m.part)}</strong><div class="muted">${esc(m.at)}</div></div>
        <span class="pill">${m.score}% ${m.pass ? '✓' : '✗'}</span></div>`).join('') || '<p class="muted">Henüz deneme yok.</p>'}
    </div>`;
  }
  function mockMenu() {
    return [
      { key: 'lezen1', title: 'Lezen deneme 1', desc: '25 soru · 65 dk · bilgisayar MC' },
      { key: 'lezen2', title: 'Lezen deneme 2', desc: '25 soru · 65 dk' },
      { key: 'luisteren1', title: 'Luisteren deneme 1', desc: '25 soru · 45 dk · TTS dinleme' },
      { key: 'luisteren2', title: 'Luisteren deneme 2', desc: '25 soru · 45 dk' },
      { key: 'schrijven1', title: 'Schrijven deneme 1', desc: '4 görev · 40 dk · kâğıt formatı simülasyonu' },
      { key: 'schrijven2', title: 'Schrijven deneme 2', desc: '4 görev · 40 dk' },
      { key: 'spreken1', title: 'Spreken deneme 1', desc: '16 görev · 35 dk · kayıt' },
      { key: 'spreken2', title: 'Spreken deneme 2', desc: '16 görev · 35 dk' },
      { key: 'knm1', title: 'KNM deneme 1', desc: '40 soru · 45 dk · 8 tema' },
      { key: 'knm2', title: 'KNM deneme 2', desc: '40 soru · 45 dk' },
    ];
  }

  let mockTimer = null;
  function stopMockTimer() { if (mockTimer) { clearInterval(mockTimer); mockTimer = null; } }

  function startMock(key) {
    stopMockTimer();
    const part = key.replace(/\d+$/, '');
    const ver = key.match(/\d+$/)[0];
    let questions = [], minutes = 45, passAt = 70, mode = 'mc';
    if (part === 'lezen') {
      minutes = EXAM.lezen.minutes; mode = 'mc';
      const pool = [];
      D.readings.forEach(r => r.questions.forEach(q => pool.push({ ...q, text: r.text, source: r.title, kind: 'lezen' })));
      questions = shuffle(pool).slice(ver === '1' ? 0 : 1).slice(0, 25);
      // ensure 25
      while (questions.length < 25) questions = questions.concat(shuffle(pool)).slice(0, 25);
      questions = questions.slice(0, 25);
    } else if (part === 'luisteren') {
      minutes = EXAM.luisteren.minutes;
      const pool = [];
      D.listening.forEach(l => l.questions.forEach(q => pool.push({ ...q, transcript: l.transcript, source: l.title, kind: 'luisteren', lid: l.id })));
      questions = shuffle(pool).slice(0, 25);
    } else if (part === 'knm') {
      minutes = EXAM.knm.minutes;
      questions = shuffle(D.knm.questions).slice(0, 40).map(q => ({ ...q, kind: 'knm' }));
    } else if (part === 'schrijven') {
      minutes = EXAM.schrijven.minutes; mode = 'write';
      questions = shuffle(D.writings).slice(0, 4).map(w => ({ ...w, kind: 'schrijven' }));
      passAt = 65;
    } else if (part === 'spreken') {
      minutes = EXAM.spreken.minutes; mode = 'speak';
      questions = shuffle(D.speaking).slice(0, 16).map(s => ({ ...s, kind: 'spreken' }));
      passAt = 60;
    }
    state.mock = {
      key, part, mode, questions, answers: {}, texts: {}, current: 0,
      secondsLeft: minutes * 60, finished: false, passAt, score: 0, review: ''
    };
    mockTimer = setInterval(() => {
      if (!state.mock || state.mock.finished) { stopMockTimer(); return; }
      state.mock.secondsLeft--;
      const el = $('#mockTimer');
      if (el) { el.textContent = fmtTime(state.mock.secondsLeft); el.classList.toggle('w', state.mock.secondsLeft <= 60); }
      if (state.mock.secondsLeft <= 0) finishMock();
    }, 1000);
    go('mockRun');
  }
  function fmtTime(s) { const m = Math.floor(s / 60), sec = s % 60; return m + ':' + String(sec).padStart(2, '0'); }

  function finishMock() {
    stopMockTimer();
    const m = state.mock;
    if (!m || m.finished) return;
    let correct = 0, total = 0, review = '';
    if (m.mode === 'mc') {
      total = m.questions.length;
      m.questions.forEach((q, i) => {
        const sel = m.answers[i];
        const ok = sel === q.answer;
        if (ok) correct++;
        review += `<div style="margin:8px 0;padding:8px;background:#f8fafc;border-radius:8px"><strong>S${i + 1}.</strong> ${esc(q.q)}<br>
          <span class="badge ${ok ? 'ok' : 'bad'}">${ok ? 'Doğru' : 'Yanlış'}</span>
          <div class="muted">${esc(q.explain_tr || '')}</div></div>`;
      });
    } else if (m.mode === 'write') {
      // self-check: marked done counts as attempt; score by filled length heuristic + checklist presence
      total = m.questions.length;
      m.questions.forEach((w, i) => {
        const t = (m.texts[i] || '').trim();
        const ok = t.length >= 40;
        if (ok) correct++;
        review += `<div style="margin:8px 0"><strong>${esc(w.title)}</strong><div class="muted">${ok ? 'Metin girildi — örnekle karşılaştır' : 'Eksik / çok kısa'}</div>
          <div class="model">${esc(w.model)}</div></div>`;
      });
    } else if (m.mode === 'speak') {
      total = m.questions.length;
      m.questions.forEach((s, i) => {
        const t = (m.texts[i] || '').toLowerCase();
        const hits = (s.keywords || []).filter(k => t.includes(k.toLowerCase())).length;
        const ok = hits >= Math.ceil((s.keywords || []).length / 2) || t.length > 20;
        if (ok) correct++;
        review += `<div style="margin:8px 0"><strong>${esc(s.title)}</strong> — anahtar: ${hits}/${(s.keywords || []).length}
          <div class="model">${esc(s.model)}</div></div>`;
      });
    }
    const score = pct(correct, total);
    const pass = score >= m.passAt;
    m.finished = true; m.score = score; m.correct = correct; m.total = total; m.review = review; m.pass = pass;
    progress.mocks.push({ part: m.part + ' ' + m.key, score, pass, at: new Date().toLocaleString('tr-TR'), correct, total });
    // weak tracking
    progress.weak[m.part] = score;
    touchStreak();
    saveP(progress);
    render();
  }

  function viewMockRun() {
    const m = state.mock;
    if (!m) return '<div class="card"><button class="btn bp" data-go="mocks">Geri</button></div>';
    if (m.finished) {
      return `<div class="card">
        <h2>Sonuç — ${esc(m.part)}</h2>
        <div class="stats">
          <div class="st"><div class="n">${m.correct}/${m.total}</div><div class="l">Doğru / tamam</div></div>
          <div class="st"><div class="n">${m.score}%</div><div class="l">Puan</div></div>
          <div class="st"><div class="n">${m.pass ? '✓' : '✗'}</div><div class="l">${m.pass ? 'Tahmini geçti' : 'Tekrar et'}</div></div>
        </div>
        <p class="muted">Not: Resmi cesuur yayımlanmaz; ~${m.passAt}% pratik eşiğidir.</p>
        ${m.review}
        <div class="row" style="margin-top:12px"><button class="btn bp" data-go="mocks">Denemelere dön</button>
          <button class="btn bg" data-go="home">Ana sayfa</button></div>
      </div>`;
    }
    const q = m.questions[m.current];
    let body = '';
    if (m.mode === 'mc') {
      if (q.text) body += `<div class="rtxt" style="max-height:140px;overflow:auto;font-size:.85rem">${esc(q.text)}</div>`;
      if (q.transcript) body += `<div class="audio-box"><button class="btn bp bs" id="mockPlay">▶ Dinle</button><span class="muted">${esc(q.source || '')}</span></div>`;
      body += `<h3>${esc(q.q)}</h3>`;
      body += q.choices.map((c, i) => `<button class="ch ${m.answers[m.current] === i ? 'sel' : ''}" data-mci="${i}">${String.fromCharCode(97 + i)}) ${esc(c)}</button>`).join('');
    } else if (m.mode === 'write') {
      body += `<h3>${esc(q.title)}</h3><p>${esc(q.prompt_tr)}</p>
        <div>${q.phrases.map(p => `<span class="chip">${esc(p)}</span>`).join('')}</div>
        <textarea class="ta" id="mText" placeholder="Hollandaca...">${esc(m.texts[m.current] || '')}</textarea>`;
    } else {
      body += `<h3>${esc(q.title)}</h3><div class="rtxt">${esc(q.prompt_nl)}</div>
        <textarea class="ta" id="mText" placeholder="Konuşmanı yaz veya STT kullan...">${esc(m.texts[m.current] || '')}</textarea>
        <button class="btn bg bs" id="mockStt">STT</button>`;
    }
    return `<div class="card">
      <div class="rb"><span class="badge">${m.current + 1}/${m.questions.length}</span>
        <span class="timer ${m.secondsLeft <= 60 ? 'w' : ''}" id="mockTimer">${fmtTime(m.secondsLeft)}</span></div>
      <div class="bar"><i style="width:${pct(m.current, m.questions.length)}%"></i></div>
      ${body}
      <div class="row" style="margin-top:10px">
        <button class="btn bg" id="mPrev" ${m.current === 0 ? 'disabled' : ''}>Önceki</button>
        ${m.current < m.questions.length - 1
        ? `<button class="btn bp" id="mNext">Sonraki</button>`
        : `<button class="btn ba" id="mSubmit">Bitir / gönder</button>`}
      </div>
    </div>`;
  }

  /* ===== PROGRESS / SETTINGS / HELP / TUTOR ===== */
  function readiness() {
    const avg = (obj, n) => {
      const vals = Object.values(obj);
      if (!vals.length) return 0;
      if (typeof vals[0] === 'number' && vals[0] <= 1) return pct(vals.filter(v => v === 1).length, Math.max(n, vals.length));
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * (vals[0] > 3 ? 100 / 3 : 1));
    };
    const rScores = Object.values(progress.reading);
    const rPct = rScores.length ? Math.round(rScores.reduce((a, b) => a + b, 0) / (rScores.length * 3) * 100) : 0;
    const lScores = Object.values(progress.listening);
    const lPct = lScores.length ? Math.round(lScores.reduce((a, b) => a + b, 0) / (lScores.length * 2) * 100) : 0;
    const kPct = (() => { const v = Object.values(progress.knm); return v.length ? pct(v.filter(x => x === 1).length, v.length) : 0; })();
    const mockPart = p => {
      const ms = progress.mocks.filter(m => m.part.startsWith(p));
      return ms.length ? ms[ms.length - 1].score : null;
    };
    const pack = (label, practicePct, mockScore) => {
      const pctV = mockScore != null ? Math.round(practicePct * 0.4 + mockScore * 0.6) : practicePct;
      return { label, pct: pctV, note: pctV >= 70 ? 'iyi' : pctV >= 40 ? 'orta' : 'zayıf' };
    };
    return {
      lezen: pack('Lezen', rPct, mockPart('lezen')),
      luisteren: pack('Luisteren', lPct, mockPart('luisteren')),
      schrijven: pack('Schrijven', Object.keys(progress.writing).length ? Math.min(100, Object.keys(progress.writing).length / D.writings.length * 100) : 0, mockPart('schrijven')),
      spreken: pack('Spreken', (() => { const v = Object.values(progress.speaking); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0; })(), mockPart('spreken')),
      knm: pack('KNM', kPct, mockPart('knm'))
    };
  }

  function viewProgress() {
    const r = readiness();
    return `<div class="card"><button class="btn bg bs" data-go="more">←</button>
      <h2 style="margin-top:8px">İlerleme panosu</h2>
      ${Object.values(r).map(v => `<div style="margin:8px 0"><div class="rb"><strong>${esc(v.label)}</strong><span>${v.pct}%</span></div>
        <div class="bar"><i style="width:${v.pct}%"></i></div><span class="muted">${esc(v.note)}</span></div>`).join('')}
      <h3>Gramer Testi</h3>
      ${((progress.grammar && progress.grammar.history) || []).slice().reverse().slice(0, 5).map(h => `<div class="li" style="cursor:default"><div>${esc(h.scope === 'all' ? 'Tüm test' : ((window.GRAMMAR_TEST.topics.find(t => t.id === h.scope) || {}).tr || h.scope))}<div class="muted">${esc(h.at)}</div></div><span class="pill">${h.score}%</span></div>`).join('') || '<p class="muted">Henüz gramer testi yok.</p>'}
      <h3>Zayıf konular (KNM)</h3>
      ${weakKnmThemes()}
      <h3>Deneme geçmişi</h3>
      ${(progress.mocks || []).slice().reverse().slice(0, 20).map(m =>
      `<div class="li" style="cursor:default"><div>${esc(m.part)}<div class="muted">${esc(m.at)}</div></div><span class="pill">${m.score}%</span></div>`).join('') || '<p class="muted">Yok</p>'}
    </div>`;
  }
  function weakKnmThemes() {
    const by = {};
    D.knm.questions.forEach(q => {
      if (progress.knm[q.id] == null) return;
      by[q.theme] = by[q.theme] || { ok: 0, n: 0, tr: q.theme_tr };
      by[q.theme].n++; if (progress.knm[q.id] === 1) by[q.theme].ok++;
    });
    const arr = Object.values(by).map(t => ({ ...t, pct: pct(t.ok, t.n) })).sort((a, b) => a.pct - b.pct);
    if (!arr.length) return '<p class="muted">Henüz KNM verisi yok.</p>';
    return arr.map(t => `<div class="rb"><span class="${t.pct < 60 ? 'weak' : ''}">${esc(t.tr)}</span><span class="pill">${t.pct}%</span></div>`).join('');
  }

  function viewSettings() {
    return `<div class="card"><button class="btn bg bs" data-go="more">←</button>
      <h2 style="margin-top:8px">Ayarlar</h2>
      <label class="f">YZ sağlayıcı</label>
      <select id="prov"><option value="xai" ${settings.provider === 'xai' ? 'selected' : ''}>xAI</option>
        <option value="openai" ${settings.provider === 'openai' ? 'selected' : ''}>OpenAI</option></select>
      <label class="f">API anahtarı (yalnızca bu tarayıcıda)</label>
      <input type="password" id="akey" value="${esc(settings.apiKey)}" placeholder="Anahtar yapıştır">
      <label class="f">xAI model</label><input type="text" id="amodel" value="${esc(settings.model)}">
      <label class="f">OpenAI model</label><input type="text" id="omodel" value="${esc(settings.openaiModel)}">
      <label class="f">TTS hızı</label><input type="number" id="trate" step="0.05" min="0.5" max="1.3" value="${settings.ttsRate}">
      <div class="row"><button class="btn bp" id="saveSet">Kaydet</button><button class="btn bg" id="clrKey">Anahtarı sil</button></div>
      <hr style="border:0;border-top:1px solid var(--b);margin:14px 0">
      <h3>Yedek</h3>
      <div class="row"><button class="btn bp" id="expJ">JSON dışa aktar</button>
        <label class="btn bg" style="cursor:pointer">JSON içe aktar<input type="file" id="impJ" accept="application/json" hidden></label></div>
      <button class="btn bbad bs" id="resetAll" style="margin-top:10px">Tüm ilerlemeyi sil</button>
    </div>`;
  }

  function viewHelp() {
    const e = EXAM;
    return `<div class="card"><button class="btn bg bs" data-go="more">←</button>
      <h2 style="margin-top:8px">Yardım & sınav formatı</h2>
      <p>Bu uygulama resmi sınav değildir; DUO formatına yakın pratik sunar. Tüm sorular orijinaldir.</p>
      <h3>Resmi A2 süreleri (DUO)</h3>
      <ul style="margin-left:18px;font-size:.9rem">
        <li><strong>Lezen:</strong> ${e.lezen.minutes} dk, bilgisayar, ~25 MC (oefenexamen)</li>
        <li><strong>Luisteren:</strong> ${e.luisteren.minutes} dk, bilgisayar, ~25 soru</li>
        <li><strong>Schrijven:</strong> ${e.schrijven.minutes} dk, <em>kalem-kâğıt</em>, 4 görev</li>
        <li><strong>Spreken:</strong> ${e.spreken.minutes} dk, bilgisayar + mikrofon, ~16 soru</li>
        <li><strong>KNM:</strong> ${e.knm.minutes} dk, bilgisayar, temalar; pratikte ~40 soru</li>
      </ul>
      <p class="muted">Kaynaklar: inburgeren.nl taalexamens & kennisexamens; oefenen.jsp; Staatscourant 2024/15802 (KNM 8 tema); Cito/Rijksoverheid KNM 1 Temmuz 2025.</p>
      <h3>Tarayıcı sınırları</h3>
      <ul style="margin-left:18px;font-size:.9rem">
        <li><strong>Mikrofon / STT / Service Worker:</strong> genelde <code>https://</code> veya <code>localhost</code> gerekir. Telefonunda dosyayı doğrudan açınca bazı özellikler çalışmayabilir.</li>
        <li><strong>nl-NL ses:</strong> cihazda Hollandaca TTS sesi yoksa dinleme sınırlı olur; Android/iOS ayarlarından ses paketi ekle.</li>
        <li>PWA kurulum için uygulamayı bir web sunucusundan (veya GitHub Pages) aç.</li>
      </ul>
    </div>`;
  }

  function viewTutor() {
    const hasKey = !!(settings.apiKey && settings.apiKey.trim());
    const bubbles = state.chat.map(m => `<div class="bub ${m.role === 'user' ? 'u' : m.role === 'err' ? 'e' : 'b'}">${esc(m.text)}</div>`).join('')
      || `<div class="bub b">Merhaba! Ben A2 öğretmeninim. Dilbilgisi, kelime veya yazma/konuşma için Türkçe yardımcı olurum. ${hasKey ? '' : 'Ayarlardan API anahtarı ekle.'}</div>`;
    return `<div class="card"><div class="rb"><h2>YZ öğretmen</h2><button class="btn bg bs" data-go="settings">Ayarlar</button></div>
      <div class="chat" id="clog">${bubbles}</div>
      <div class="row"><input type="text" id="cin" placeholder="Türkçe veya Hollandaca sor..." style="flex:1;margin:0" ${hasKey && !state.chatBusy ? '' : 'disabled'}>
        <button class="btn bp" id="csend" ${hasKey && !state.chatBusy ? '' : 'disabled'}>Gönder</button></div>
      <button class="btn bg bs" id="cclear" style="margin-top:8px">Sohbeti temizle</button>
    </div>`;
  }

  /* ===== BIND ===== */
  function bind() {
    document.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', () => go(el.dataset.go)));
    document.querySelectorAll('[data-rid]').forEach(el => el.addEventListener('click', () => go('readingDetail', { id: el.dataset.rid })));
    document.querySelectorAll('[data-wid]').forEach(el => el.addEventListener('click', () => go('writingDetail', { id: el.dataset.wid })));
    document.querySelectorAll('[data-lid]').forEach(el => el.addEventListener('click', () => go('listeningDetail', { id: el.dataset.lid })));
    document.querySelectorAll('[data-sid]').forEach(el => el.addEventListener('click', () => go('speakingDetail', { id: el.dataset.sid })));
    document.querySelectorAll('[data-ktheme]').forEach(el => el.addEventListener('click', () => go('knm', { sub: 'theme', id: el.dataset.ktheme })));
    document.querySelectorAll('[data-kid]').forEach(el => el.addEventListener('click', () => go('knm', { sub: 'q', id: el.dataset.kid, answers: {}, checked: false })));
    document.querySelectorAll('[data-mock]').forEach(el => el.addEventListener('click', () => startMock(el.dataset.mock)));
    bindGrammar();
    bindBank();

    document.querySelectorAll('.ch[data-qi]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.checked) return;
        state.answers[btn.dataset.qi] = +btn.dataset.ci;
        render();
      });
    });

    const checkR = $('#checkR');
    if (checkR) checkR.addEventListener('click', () => {
      const r = D.readings.find(x => x.id === state.id);
      let c = 0; r.questions.forEach((q, i) => { if (state.answers[i] === q.answer) c++; });
      state.checked = true; progress.reading[r.id] = c;
      progress.history.push({ type: 'Lezen', detail: r.title, score: c + '/' + r.questions.length, at: Date.now() });
      touchStreak(); saveP(progress); render();
    });
    const retry = $('#retry');
    if (retry) retry.addEventListener('click', () => { state.answers = {}; state.checked = false; render(); });

    // writing
    const sm = $('#showModel'); if (sm) sm.addEventListener('click', () => $('#modelW').classList.remove('hidden'));
    const mw = $('#markW'); if (mw) mw.addEventListener('click', () => { progress.writing[state.id] = true; touchStreak(); saveP(progress); toast('Kaydedildi'); });
    const tw = $('#ttsModel'); if (tw) tw.addEventListener('click', () => { const w = D.writings.find(x => x.id === state.id); speakNL(w.model).catch(() => toast('TTS hatası')); });
    const aw = $('#aiW'); if (aw) aw.addEventListener('click', aiWriting);

    // listening
    if (state.screen === 'listening') {
      const warn = $('#voiceWarn');
      if (warn && speechSynthesis) {
        speechSynthesis.onvoiceschanged = () => { if (!hasNLVoice()) warn.innerHTML = '<div class="exp">⚠️ Cihazında <strong>nl-NL</strong> sesi bulunamadı. Ayarlardan Hollandaca TTS sesi yükle; yoksa dinleme sınırlı çalışır.</div>'; };
        if (speechSynthesis.getVoices().length && !hasNLVoice()) warn.innerHTML = '<div class="exp">⚠️ nl-NL sesi yok. Telefon/bilgisayar dil seslerini kontrol et.</div>';
      }
    }
    const playL = $('#playL');
    if (playL) playL.addEventListener('click', async () => {
      const l = D.listening.find(x => x.id === state.id);
      const rate = +($('#rateL')?.value || settings.ttsRate);
      settings.ttsRate = rate; saveS(settings);
      if (!state.checked) state.listenReplays++;
      try { await speakNL(l.transcript, rate); } catch { toast('Ses çalınamadı'); }
      render();
    });
    const checkL = $('#checkL');
    if (checkL) checkL.addEventListener('click', () => {
      const l = D.listening.find(x => x.id === state.id);
      let c = 0; l.questions.forEach((q, i) => { if (state.answers[i] === q.answer) c++; });
      state.checked = true; progress.listening[l.id] = c; touchStreak(); saveP(progress); render();
    });

    // speaking record
    const rs = $('#recStart'); const rst = $('#recStop');
    if (rs) rs.addEventListener('click', startRec);
    if (rst) rst.addEventListener('click', stopRec);
    const stt = $('#sttBtn'); if (stt) stt.addEventListener('click', doSTT);
    const pms = $('#playModelS'); if (pms) pms.addEventListener('click', () => { const s = D.speaking.find(x => x.id === state.id); speakNL(s.model).catch(() => toast('TTS yok')); });
    const scs = $('#scoreS'); if (scs) scs.addEventListener('click', scoreSpeak);
    const ais = $('#aiS'); if (ais) ais.addEventListener('click', aiSpeak);
    const sms = $('#showMS'); if (sms) sms.addEventListener('click', () => $('#sModel').classList.remove('hidden'));

    // knm
    const ck = $('#checkK');
    if (ck) ck.addEventListener('click', () => {
      const q = D.knm.questions.find(x => x.id === state.id);
      const ok = state.answers[0] === q.answer;
      progress.knm[q.id] = ok ? 1 : 0; state.checked = true; touchStreak(); saveP(progress); render();
    });
    const bk = $('#backKnmTheme');
    if (bk) bk.addEventListener('click', () => {
      const q = D.knm.questions.find(x => x.id === state.id);
      go('knm', { sub: 'theme', id: q.theme });
    });
    const nk = $('#nextK');
    if (nk) nk.addEventListener('click', () => {
      const q = D.knm.questions.find(x => x.id === state.id);
      const list = D.knm.questions.filter(x => x.theme === q.theme);
      const i = list.findIndex(x => x.id === q.id);
      const next = list[i + 1];
      if (next) go('knm', { sub: 'q', id: next.id, answers: {}, checked: false });
      else go('knm', { sub: 'theme', id: q.theme });
    });

    // vocab
    const flash = $('#flash'); if (flash) flash.addEventListener('click', () => { state.vocabFlip = true; render(); });
    const vy = $('#vYes'); if (vy) vy.addEventListener('click', () => rateVocab(1));
    const vn = $('#vNo'); if (vn) vn.addEventListener('click', () => rateVocab(-1));
    const rv = $('#resetV'); if (rv) rv.addEventListener('click', () => { progress.vocab = {}; saveP(progress); state.vocabQueue = null; render(); });
    const vt = $('#vTts'); if (vt) vt.addEventListener('click', () => { const c = state.vocabQueue[state.vocabIdx % state.vocabQueue.length]; speakNL(c.nl).catch(() => { }); });
    const te = $('#toggleEN'); if (te) te.addEventListener('click', () => { state.showEN = !state.showEN; render(); });

    // plan
    const gp = $('#genPlan');
    if (gp) gp.addEventListener('click', () => {
      progress.plan.dailyMin = +($('#dailyMin').value || 45);
      progress.plan.examDates = progress.plan.examDates || {};
      document.querySelectorAll('[data-edate]').forEach(inp => { progress.plan.examDates[inp.dataset.edate] = inp.value; });
      generatePlan(); toast('Plan güncellendi'); render();
    });

    // mock run
    document.querySelectorAll('[data-mci]').forEach(b => b.addEventListener('click', () => { state.mock.answers[state.mock.current] = +b.dataset.mci; render(); }));
    const mt = $('#mText');
    if (mt) mt.addEventListener('change', () => { state.mock.texts[state.mock.current] = mt.value; });
    if (mt) mt.addEventListener('blur', () => { state.mock.texts[state.mock.current] = mt.value; });
    const mp = $('#mPrev'); if (mp) mp.addEventListener('click', () => { saveMockText(); state.mock.current--; render(); });
    const mn = $('#mNext'); if (mn) mn.addEventListener('click', () => { saveMockText(); state.mock.current++; render(); });
    const ms = $('#mSubmit'); if (ms) ms.addEventListener('click', () => { saveMockText(); finishMock(); });
    const mpl = $('#mockPlay'); if (mpl) mpl.addEventListener('click', () => { const q = state.mock.questions[state.mock.current]; speakNL(q.transcript).catch(() => toast('TTS')); });
    const mst = $('#mockStt'); if (mst) mst.addEventListener('click', () => doSTT(true));

    // settings
    const ss = $('#saveSet');
    if (ss) ss.addEventListener('click', () => {
      settings.provider = $('#prov').value; settings.apiKey = $('#akey').value.trim();
      settings.model = $('#amodel').value.trim() || DEFAULTS.model;
      settings.openaiModel = $('#omodel').value.trim() || DEFAULTS.openaiModel;
      settings.ttsRate = +($('#trate').value || 0.9); saveS(settings); toast('Kaydedildi');
    });
    const ck2 = $('#clrKey'); if (ck2) ck2.addEventListener('click', () => { settings.apiKey = ''; saveS(settings); toast('Silindi'); render(); });
    const ex = $('#expJ'); if (ex) ex.addEventListener('click', exportJSON);
    const im = $('#impJ'); if (im) im.addEventListener('change', importJSON);
    const ra = $('#resetAll'); if (ra) ra.addEventListener('click', () => { if (confirm('Tüm ilerleme silinsin mi?')) { progress = defP(); saveP(progress); toast('Sıfırlandı'); go('home'); } });

    // tutor
    const csend = $('#csend'); if (csend) csend.addEventListener('click', sendChat);
    const cin = $('#cin'); if (cin) cin.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
    const cc = $('#cclear'); if (cc) cc.addEventListener('click', () => { state.chat = []; render(); });
    const clog = $('#clog'); if (clog) clog.scrollTop = clog.scrollHeight;
  }

  function saveMockText() {
    const mt = $('#mText');
    if (mt && state.mock) state.mock.texts[state.mock.current] = mt.value;
  }

  function touchStreak() {
    const t = today();
    if (progress.lastStudy === t) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    const ys = y.toISOString().slice(0, 10);
    progress.streak = progress.lastStudy === ys ? (progress.streak || 0) + 1 : 1;
    progress.lastStudy = t;
  }

  function rateVocab(dir) {
    const c = state.vocabQueue[state.vocabIdx % state.vocabQueue.length];
    let box = progress.vocab[c.idx] || 0;
    box = dir > 0 ? Math.min(5, box + 1) : 0;
    progress.vocab[c.idx] = box;
    saveP(progress);
    if (dir > 0 && box >= 4) {
      state.vocabQueue.splice(state.vocabIdx % state.vocabQueue.length, 1);
    } else {
      const [x] = state.vocabQueue.splice(state.vocabIdx % state.vocabQueue.length, 1);
      state.vocabQueue.push(x);
    }
    if (state.vocabIdx >= state.vocabQueue.length) state.vocabIdx = 0;
    state.vocabFlip = false;
    touchStreak();
    render();
  }

  /* ===== MEDIA ===== */
  let mediaRec = null, chunks = [];
  async function startRec() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('nomedia'), { name: 'NoMediaDevices' });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      let opts = {};
      if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) opts = { mimeType: 'audio/mp4' };
        else if (MediaRecorder.isTypeSupported('audio/webm')) opts = { mimeType: 'audio/webm' };
      }
      mediaRec = new MediaRecorder(stream, opts);
      mediaRec.ondataavailable = e => chunks.push(e.data);
      mediaRec.onstop = () => {
        const blob = new Blob(chunks, { type: mediaRec.mimeType || opts.mimeType || 'audio/mp4' });
        state.speakBlob = blob;
        const a = $('#recAudio');
        if (a) { a.src = URL.createObjectURL(blob); a.classList.remove('hidden'); }
        stream.getTracks().forEach(t => t.stop());
        $('#recStatus').textContent = 'Kayıt hazır — dinleyebilirsin.';
      };
      mediaRec.start();
      $('#recStart').disabled = true; $('#recStop').disabled = false;
      $('#recStatus').innerHTML = '<span class="rec-dot"></span> Kaydediliyor...';
    } catch (e) {
      const n = (e && e.name) || '';
      let msg;
      if (n === 'NotAllowedError' || n === 'SecurityError') msg = 'Mikrofon izni reddedildi. iPhone: Ayarlar > Safari (veya kullandığın tarayıcı uygulaması) > Mikrofon > İzin Ver. Sonra sayfayı yenile.';
      else if (n === 'NotFoundError') msg = 'Mikrofon bulunamadı.';
      else if (n === 'NoMediaDevices') msg = 'Bu tarayıcı mikrofona izin vermiyor. Linki Safari veya Chrome ile aç (uygulama içi tarayıcı değil).';
      else msg = 'Mikrofon açılamadı (' + (n || (e && e.message) || 'bilinmeyen hata') + ').';
      toast(msg);
      $('#recStatus').textContent = msg + ' Bu arada cevabını metin kutusuna yazabilirsin.';
    }
  }
  function stopRec() {
    if (mediaRec && mediaRec.state !== 'inactive') mediaRec.stop();
    $('#recStart').disabled = false; $('#recStop').disabled = true;
  }
  function doSTT(forMock) {
    const r = getRecognition();
    if (!r) { toast('Bu tarayıcıda konuşmayı yazıya çevirme yok. iPhone\'da klavyedeki mikrofon tuşuyla da yazdırabilirsin.'); return; }
    r.onresult = ev => {
      const text = ev.results[0][0].transcript;
      if (forMock) {
        state.mock.texts[state.mock.current] = text;
        const mt = $('#mText'); if (mt) mt.value = text;
      } else {
        state.speakText = text;
        const t = $('#sText'); if (t) t.value = text;
      }
      toast('STT tamam');
    };
    r.onerror = (ev) => toast(ev && (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') ? 'Konuşma tanıma izni yok. iPhone: Ayarlar > Gizlilik ve Güvenlik > Konuşma Tanıma ve Mikrofon izinlerini aç.' : 'STT hatası: ' + ((ev && ev.error) || ''));
    r.start();
    toast('Konuş...');
  }
  function scoreSpeak() {
    const s = D.speaking.find(x => x.id === state.id);
    const text = ($('#sText')?.value || '').toLowerCase();
    const hits = s.keywords.filter(k => text.includes(k.toLowerCase()));
    const score = pct(hits.length, s.keywords.length);
    progress.speaking[s.id] = score; saveP(progress);
    $('#sOut').innerHTML = `<div class="exp">Kapsama: <strong>${hits.length}/${s.keywords.length}</strong> (${score}%)<br>Bulunan: ${esc(hits.join(', ') || '—')}<br>Model: ${esc(s.model)}</div>`;
  }

  /* ===== AI ===== */
  async function callLLM(messages) {
    const prov = PROVIDERS[settings.provider] || PROVIDERS.xai;
    const model = settings.provider === 'openai' ? settings.openaiModel : settings.model;
    const res = await fetch(prov.base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.apiKey },
      body: JSON.stringify({ model, messages, temperature: 0.4 })
    });
    if (!res.ok) throw new Error('API ' + res.status + ' ' + (await res.text()).slice(0, 180));
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
  const SYS = 'Sen Türkçe konuşan bir Dutch A2 inburgering öğretmenisin. Kısa, net ve motive edici cevap ver. Hollandaca düzeltmelerde düzeltilmiş metin + hata listesi + A2 geçti/sınırda/kaldı tahmini sun.';

  async function sendChat() {
    const input = $('#cin'); if (!input || !input.value.trim() || state.chatBusy) return;
    const text = input.value.trim();
    state.chat.push({ role: 'user', text }); state.chatBusy = true; render();
    try {
      const messages = [{ role: 'system', content: SYS },
      ...state.chat.filter(m => m.role === 'user' || m.role === 'bot').map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text }))];
      const reply = await callLLM(messages);
      state.chat.push({ role: 'bot', text: reply });
    } catch (e) { state.chat.push({ role: 'err', text: 'Hata: ' + e.message }); }
    state.chatBusy = false; render();
  }
  async function aiWriting() {
    if (!settings.apiKey) { go('settings'); return; }
    const w = D.writings.find(x => x.id === state.id);
    const text = ($('#wIn')?.value || '').trim();
    if (!text) { toast('Önce yaz'); return; }
    const box = $('#aiOut'); box.classList.remove('hidden'); box.innerHTML = '<p class="muted">Düzeltiliyor...</p>';
    try {
      const reply = await callLLM([
        { role: 'system', content: SYS },
        { role: 'user', content: `Görev: ${w.prompt_tr}\nModel:\n${w.model}\nÖğrenci:\n${text}\n\nTürkçe: düzeltilmiş metin, hatalar, A2 tahmini, 1 ipucu.` }
      ]);
      box.innerHTML = `<h3>YZ geri bildirim</h3><div class="model">${esc(reply)}</div>`;
    } catch (e) { box.innerHTML = `<div class="exp">${esc(e.message)}</div>`; }
  }
  async function aiSpeak() {
    if (!settings.apiKey) { go('settings'); return; }
    const s = D.speaking.find(x => x.id === state.id);
    const text = ($('#sText')?.value || '').trim();
    if (!text) { toast('Metin yok'); return; }
    const box = $('#sOut'); box.innerHTML = '<p class="muted">...</p>';
    try {
      const reply = await callLLM([
        { role: 'system', content: SYS },
        { role: 'user', content: `Spreken görevi: ${s.prompt_nl}\nModel: ${s.model}\nÖğrenci: ${text}\nTürkçe geri bildirim ver.` }
      ]);
      box.innerHTML = `<div class="model">${esc(reply)}</div>`;
    } catch (e) { box.innerHTML = `<div class="exp">${esc(e.message)}</div>`; }
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify({ progress, settings: { ...settings, apiKey: '' }, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'dutch-a2-v2-backup.json'; a.click();
  }
  function importJSON(e) {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.progress) { progress = Object.assign(defP(), data.progress); saveP(progress); }
        toast('İçe aktarıldı'); go('home');
      } catch { toast('Geçersiz dosya'); }
    };
    reader.readAsText(f);
  }

  /* ===== GRAMMAR TEST ===== */
  const G = window.GRAMMAR_TEST || { topics: [], questions: [] };
  const gNorm = s => String(s || '').toLowerCase().replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim();
  function gTopic(id) { return G.topics.find(t => t.id === id) || { tr: id }; }
  function gramStart(scope) {
    const qs = scope === 'all' ? G.questions.slice() : G.questions.filter(q => q.topic === scope);
    state.gram = { scope, qs: qs.map(q => q.id), i: 0, results: {}, given: {}, phase: 'q', built: [], bank: null, finished: false };
    gPrepare();
    go('grammar', { sub: 'run' });
  }
  function gCur() { const g = state.gram; return g && G.questions.find(q => q.id === g.qs[g.i]); }
  function gPrepare() {
    const q = gCur(); const g = state.gram;
    g.built = []; g.phase = 'q';
    if (q && q.type === 'order') {
      let b = shuffle(q.words.map((w, i) => i));
      // avoid presenting an already-correct order
      if (b.map(i => q.words[i].toLowerCase()).join(' ') === q.answers[0].join(' ')) b = b.slice(1).concat(b[0]);
      g.bank = b;
    } else g.bank = null;
  }
  function gIsCorrect(q, val) {
    if (q.type === 'mc') return val === q.answer;
    if (q.type === 'fill') return q.accept.some(a => gNorm(a) === gNorm(val));
    if (q.type === 'order') { const s = gNorm((val || []).join(' ')); return q.answers.some(a => gNorm(a.join(' ')) === s); }
    return false;
  }
  function gramAnswer(val) {
    const g = state.gram; const q = gCur(); if (!g || !q || g.phase !== 'q') return;
    g.given[q.id] = q.type === 'order' ? (val || []).join(' ') : (q.type === 'mc' ? q.choices[val] : String(val || ''));
    g.results[q.id] = gIsCorrect(q, val);
    g.phase = 'fb';
    render();
  }
  function gramNext() {
    const g = state.gram;
    if (g.i < g.qs.length - 1) { g.i++; gPrepare(); render(); window.scrollTo(0, 0); }
    else gramFinish();
  }
  function gramFinish() {
    const g = state.gram; if (!g || g.finished) return;
    const per = {};
    g.qs.forEach(id => {
      const q = G.questions.find(x => x.id === id);
      per[q.topic] = per[q.topic] || { ok: 0, n: 0 };
      per[q.topic].n++; if (g.results[id]) per[q.topic].ok++;
    });
    const correct = g.qs.filter(id => g.results[id]).length;
    g.finished = true; g.score = pct(correct, g.qs.length); g.correct = correct; g.per = per;
    progress.grammar = progress.grammar || { history: [] };
    progress.grammar.history.push({ at: new Date().toLocaleString('tr-TR'), scope: g.scope, score: g.score, correct, total: g.qs.length, perTopic: per });
    progress.history.push({ type: 'Gramer', detail: g.scope === 'all' ? 'Tüm test' : gTopic(g.scope).tr, score: correct + '/' + g.qs.length, at: Date.now() });
    touchStreak(); saveP(progress);
    state.sub = 'results'; render(); window.scrollTo(0, 0);
  }
  function viewGrammar() {
    const g = state.gram;
    if (state.sub === 'run' && g && !g.finished) return viewGramQ();
    if (state.sub === 'results' && g && g.finished) return viewGramResults();
    const hist = (progress.grammar && progress.grammar.history) || [];
    return `<div class="card"><h2>📝 Gramer Testi</h2>
      <p class="muted">Sohbette konuştuğumuz konular: ayrılabilen fiiller, 'op', fiil yeri, kalıp ifadeler, naar/bij. Çoktan seçmeli, boşluk doldurma ve kelime sıralama soruları. Her cevaptan sonra Türkçe açıklama.</p>
      <button class="btn bp bb" data-gstart="all" style="margin:8px 0">Tüm testi başlat (${G.questions.length} soru)</button>
      <h3>Konuya göre</h3>
      ${G.topics.map(t => {
        const n = G.questions.filter(q => q.topic === t.id).length;
        return `<div class="li" style="cursor:default"><div><strong>${esc(t.tr)}</strong><div class="muted">${esc(t.nl)} · ${n} soru</div></div><button class="btn bg bs" data-gstart="${esc(t.id)}">Başlat</button></div>`;
      }).join('')}
      <h3 style="margin-top:10px">Geçmiş</h3>
      ${hist.slice().reverse().slice(0, 8).map(h => `<div class="li" style="cursor:default"><div>${esc(h.scope === 'all' ? 'Tüm test' : gTopic(h.scope).tr)}<div class="muted">${esc(h.at)}</div></div><span class="pill">${h.correct}/${h.total} · ${h.score}%</span></div>`).join('') || '<p class="muted">Henüz test yok.</p>'}
    </div>`;
  }
  function viewGramQ() {
    const g = state.gram; const q = gCur(); const fb = g.phase === 'fb';
    const ok = g.results[q.id];
    let body = '';
    if (q.type === 'mc') {
      const given = g.given[q.id];
      body = q.choices.map((c, i) => {
        let cls = 'ch';
        if (fb) { if (i === q.answer) cls += ' ok'; else if (c === given) cls += ' bad'; }
        return `<button class="${cls}" data-gmc="${i}" ${fb ? 'disabled' : ''}>${String.fromCharCode(97 + i)}) ${esc(c)}</button>`;
      }).join('');
    } else if (q.type === 'fill') {
      body = `${q.hint ? `<p class="muted">Fiil: <strong>${esc(q.hint)}</strong> (doğru biçimde yaz)</p>` : ''}
        <input type="text" id="gFill" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Kelimeyi yaz" value="${esc(fb ? g.given[q.id] : '')}" ${fb ? 'disabled' : ''}>
        ${fb ? '' : '<button class="btn bp bb" id="gFillOk">Kontrol et</button>'}`;
    } else {
      const builtTxt = g.built.map(i => q.words[i]);
      body = `<div class="gbuilt" id="gBuilt">${fb ? esc(g.given[q.id]) : (builtTxt.length ? g.built.map((wi, k) => `<button class="gw sel" data-gb="${k}">${esc(q.words[wi])}</button>`).join('') : '<span class="muted">Kelimelere dokun…</span>')}</div>
        ${fb ? '' : `<div class="gbank">${g.bank.map(wi => g.built.includes(wi) ? `<span class="gw used">${esc(q.words[wi])}</span>` : `<button class="gw" data-gw="${wi}">${esc(q.words[wi])}</button>`).join('')}</div>
        <div class="row"><button class="btn bg" id="gClear">Temizle</button><button class="btn bp" id="gOrderOk" ${g.built.length < q.words.length ? 'disabled' : ''}>Kontrol et</button></div>`}`;
    }
    const correctTxt = q.type === 'mc' ? q.choices[q.answer] : q.type === 'fill' ? q.accept[0] : q.answers.map(a => { const s = a.map(w => q.words.find(x => x.toLowerCase() === w) || w).join(' '); return s.charAt(0).toUpperCase() + s.slice(1) + '.'; }).join('  /  ');
    const fbBox = fb ? `<div class="exp"><strong>${ok ? '✓ Doğru!' : '✗ Yanlış.'}</strong>${ok ? '' : ` Doğru cevap: <strong>${esc(correctTxt)}</strong>`}<br>${esc(q.explain)}</div>
      <button class="btn bp bb" id="gNext" style="margin-top:8px">${g.i < g.qs.length - 1 ? 'Sonraki soru →' : 'Sonuçları gör'}</button>` : '';
    return `<div class="card">
      <div class="rb"><span class="badge">${g.i + 1}/${g.qs.length}</span><span class="badge">${esc(gTopic(q.topic).tr)}</span></div>
      <div class="bar"><i style="width:${pct(g.i, g.qs.length)}%"></i></div>
      <h3>${esc(q.q)}</h3>
      ${body}${fbBox}
      <button class="btn bg bs" id="gQuit" style="margin-top:10px">Testi bitir</button>
    </div>`;
  }
  function viewGramResults() {
    const g = state.gram;
    const wrong = g.qs.map(id => G.questions.find(q => q.id === id)).filter(q => !g.results[q.id]);
    return `<div class="card"><h2>Gramer Testi — Sonuç</h2>
      <div class="stats">
        <div class="st"><div class="n">${g.correct}/${g.qs.length}</div><div class="l">Doğru</div></div>
        <div class="st"><div class="n">${g.score}%</div><div class="l">Puan</div></div>
        <div class="st"><div class="n">${g.score >= 70 ? '✓' : '↻'}</div><div class="l">${g.score >= 70 ? 'İyi' : 'Tekrar et'}</div></div>
      </div>
      <h3>Konulara göre</h3>
      ${Object.entries(g.per).map(([t, v]) => { const p = pct(v.ok, v.n); return `<div style="margin:6px 0"><div class="rb"><span class="${p < 60 ? 'weak' : ''}">${esc(gTopic(t).tr)}</span><span class="pill">${v.ok}/${v.n} · ${p}%</span></div><div class="bar"><i style="width:${p}%"></i></div></div>`; }).join('')}
      <h3>Yanlış cevaplar (${wrong.length})</h3>
      ${wrong.map(q => { const c = q.type === 'mc' ? q.choices[q.answer] : q.type === 'fill' ? q.q.replace('___', q.accept[0]) : q.answers[0].map(w => q.words.find(x => x.toLowerCase() === w) || w).join(' ');
        return `<div style="margin:8px 0;padding:9px;background:#f8fafc;border-radius:8px"><strong>${esc(q.q)}</strong>
        <div class="muted">Senin cevabın: ${esc(g.given[q.id] || '—')}</div><div>Doğru: <strong>${esc(c)}</strong></div><div class="exp">${esc(q.explain)}</div></div>`; }).join('') || '<p>Hepsi doğru! 🎉</p>'}
      <div class="row" style="margin-top:10px"><button class="btn bp" data-gstart="${esc(g.scope)}">Tekrar</button><button class="btn bg" id="gMenu">Gramer menüsü</button><button class="btn bg" data-go="home">Ana sayfa</button></div>
    </div>`;
  }
  function bindGrammar() {
    document.querySelectorAll('[data-gstart]').forEach(el => el.addEventListener('click', () => gramStart(el.dataset.gstart)));
    if (state.screen !== 'grammar') return;
    const g = state.gram;
    document.querySelectorAll('[data-gmc]').forEach(el => el.addEventListener('click', () => gramAnswer(+el.dataset.gmc)));
    const fi = $('#gFill');
    const fok = $('#gFillOk');
    if (fok) fok.addEventListener('click', () => gramAnswer(fi.value));
    if (fi && !fi.disabled) { fi.addEventListener('keydown', e => { if (e.key === 'Enter') gramAnswer(fi.value); }); }
    document.querySelectorAll('[data-gw]').forEach(el => el.addEventListener('click', () => { g.built.push(+el.dataset.gw); render(); }));
    document.querySelectorAll('[data-gb]').forEach(el => el.addEventListener('click', () => { g.built.splice(+el.dataset.gb, 1); render(); }));
    const gc = $('#gClear'); if (gc) gc.addEventListener('click', () => { g.built = []; render(); });
    const go2 = $('#gOrderOk'); if (go2) go2.addEventListener('click', () => { const q = gCur(); gramAnswer(g.built.map(i => q.words[i].toLowerCase())); });
    const gn = $('#gNext'); if (gn) gn.addEventListener('click', gramNext);
    const gq = $('#gQuit'); if (gq) gq.addEventListener('click', () => { if (confirm('Testi şimdi bitir? Cevaplanmayan sorular yanlış sayılır.')) gramFinish(); });
    const gm = $('#gMenu'); if (gm) gm.addEventListener('click', () => go('grammar', { sub: null }));
  }

  /* ===== SINAV SORU BANKASI (orijinal içerik, resmi formatta) ===== */
  const B = window.EXAM_BANK || null;
  const BPARTS = {
    lezen: { ic: '📖', name: 'Lezen', n: 25, min: 65, unit: 'soru' },
    luisteren: { ic: '🎧', name: 'Luisteren', n: 25, min: 45, unit: 'soru' },
    knm: { ic: '🇳🇱', name: 'KNM', n: 40, min: 45, unit: 'soru' },
    schrijven: { ic: '✍️', name: 'Schrijven', n: 4, min: 40, unit: 'görev' },
    spreken: { ic: '🗣️', name: 'Spreken', n: 16, min: 35, unit: 'görev' }
  };
  const BPASS = { lezen: 18, luisteren: 18, knm: 28, schrijven: 65, spreken: 60 }; // MC: doğru sayısı; diğerleri: %
  const OFFICIAL = [
    { g: 'Spreken', items: [['Spreken 1', 'https://oefenexamensduo.optimumassessment.com/spa/assessment-login/#/DZ66'], ['Spreken 2', 'https://oefenexamensduo.optimumassessment.com/spa/assessment-login/#/N94P'], ['Spreken 3', 'https://oefenexamensduo.optimumassessment.com/spa/assessment-login/#/TKWW']] },
    { g: 'Luisteren', items: [['Luisteren 1', 'https://oefenexamensduo.optimumassessment.com/spa/assessment-login/#/NCJ5'], ['Luisteren 2', 'https://oefenexamensduo.optimumassessment.com/spa/assessment-login/#/J845'], ['Luisteren 3', 'https://oefenexamensduo.optimumassessment.com/spa/assessment-login/#/5QCB']] },
    { g: 'Lezen', items: [['Lezen 1', 'https://oefenexamensduo.optimumassessment.com/spa/assessment-login/#/RV5Y'], ['Lezen 2', 'https://oefenexamensduo.optimumassessment.com/spa/assessment-login/#/JJPV'], ['Lezen 3', 'https://oefenexamensduo.optimumassessment.com/spa/assessment-login/#/QCA1'], ['Lezen 4', 'https://oefenexamensduo.optimumassessment.com/spa/assessment-login/#/6N1Z']] },
    { g: 'Schrijven (PDF)', items: [['Schrijven 1', 'https://www.inburgeren.nl/images/oefenexamen-schrijven-1.pdf'], ['Schrijven 2', 'https://www.inburgeren.nl/images/oefenexamen-schrijven-2.pdf'], ['Schrijven 3', 'https://www.inburgeren.nl/images/oefenexamen-schrijven-3.pdf']] },
    { g: 'KNM', items: [['KNM 1', 'https://oefenexamensduo.optimumassessment.com/spa/assessment-login/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250ZXh0IjoiVkpNTSJ9.-Qa5IarlRuKR5LjKwnp25UJ0scDIyVcL_OCcK4KjLqw'], ['KNM 2', 'https://oefenexamensduo.optimumassessment.com/spa/assessment-login/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250ZXh0IjoiVlkySyJ9._lDFdnq0xhaSjrxGhvbDaqW4FsBsUREFbHBHxbzdZy4']] }
  ];
  function bkP() { if (!progress.bank) progress.bank = { done: {}, mocks: [] }; if (!progress.bank.done) progress.bank.done = {}; if (!progress.bank.mocks) progress.bank.mocks = []; return progress.bank; }
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function sShuffle(arr, seed) { const r = rng(seed), x = arr.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1));[x[i], x[j]] = [x[j], x[i]]; } return x; }
  const topicTr = t => (B && B.meta.topicsTr[t]) || t;
  const diffTr = d => (B && B.meta.diffTr[d]) || d;
  const L4 = ['A', 'B', 'C', 'D'];
  function kwScore(kw, text) {
    const t = ' ' + String(text || '').toLowerCase() + ' ';
    const hits = kw.filter(g => g.split('|').some(w => t.includes(w.toLowerCase())));
    return { hits: hits.length, total: kw.length, pct: pct(hits.length, kw.length) };
  }
  const wCount = s => (String(s || '').trim().match(/\S+/g) || []).length;
  const sCount = s => (String(s || '').match(/[^.!?]{3,}[.!?]/g) || []).length;
  function bankScoreWrite(task, val) {
    if (task.kind === 'form') {
      const v = val || {};
      let filled = 0, openOk = 0, open = 0;
      task.fields.forEach((f, i) => { const x = v['f' + i]; if (x && String(x).trim()) filled++; if (f.t === 'open') { open++; if (wCount(x) >= 4) openOk++; } });
      return { pct: Math.round(60 * filled / task.fields.length + 40 * (open ? openOk / open : 1)), detail: `Doldurulan alan: ${filled}/${task.fields.length} · Açık sorular (≥4 kelime): ${openOk}/${open}` };
    }
    const txt = String(val || '');
    const w = wCount(txt), s = sCount(txt), k = kwScore(task.kw || [], txt);
    const p = Math.round(40 * Math.min(1, w / (task.min || 20)) + 20 * Math.min(1, s / 3) + 40 * (k.total ? k.hits / k.total : 1));
    return { pct: p, detail: `Kelime: ${w} (hedef ≥${task.min}) · Cümle: ${s} (hedef ≥3) · İçerik maddeleri: ${k.hits}/${k.total}` };
  }
  function bankFind(part, id) { return (B[part] || []).find(x => x.id === id); }
  function bankItemsByTopic(part, topic) { return (B[part] || []).filter(x => !topic || x.topic === topic); }

  /* --- speaking/listening audio --- */
  let bkSpeakToken = 0;
  async function speakLines(lines, rate) {
    if (!window.speechSynthesis) { toast('TTS yok'); return; }
    const tok = ++bkSpeakToken; speechSynthesis.cancel();
    const voices = speechSynthesis.getVoices();
    const nlv = voices.filter(v => /^nl/i.test(v.lang));
    for (const [spk, text] of lines) {
      if (tok !== bkSpeakToken) return;
      await new Promise(res => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'nl-NL'; u.rate = rate || settings.ttsRate || 0.9;
        if (nlv.length) u.voice = nlv[spk === 'M' && nlv.length > 1 ? 1 : 0];
        u.pitch = spk === 'M' ? 0.8 : spk === 'V' ? 1.2 : 1;
        u.onend = res; u.onerror = res; speechSynthesis.speak(u);
        setTimeout(res, 3000 + text.length * 120); // güvenlik: TTS takılırsa
      });
    }
  }

  /* --- shared renderers --- */
  function bkMC(q, sel, checked, attr) {
    return `<div style="margin:10px 0"><strong>${esc(q.q)}</strong>
      ${q.o.map((o, ci) => { let c = 'ch'; if (sel === ci) c += ' sel'; if (checked) { if (ci === q.a) c += ' ok'; else if (sel === ci) c += ' bad'; }
      return `<button class="${c}" ${attr}="${esc(q.id)}" data-bc="${ci}" ${checked ? 'disabled' : ''}><strong>${L4[ci]}</strong> &nbsp;${esc(o)}</button>`; }).join('')}
      ${checked ? `<div class="exp">${sel === q.a ? '✅ Doğru.' : '❌ Doğru cevap: <strong>' + L4[q.a] + '</strong>.'} ${esc(q.tr)}</div>` : ''}</div>`;
  }
  function bkReadText(t) { return `<div class="rtxt" ${t.mono ? 'style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.8rem;overflow-x:auto;white-space:pre"' : ''}>${esc(t.text)}</div>`; }
  function bkWriteTask(t, val, attr) {
    // attr: veri bağlama ön eki (data-bkt / data-bmt)
    if (t.kind === 'form') {
      const v = val || {};
      return `<p>${esc(t.situation)}</p><div style="border:1px solid #c8d3e0;border-radius:10px;padding:10px;background:#fff"><strong>${esc(t.title)}</strong>
        ${t.fields.map((f, i) => {
          const cur = v['f' + i] || '';
          if (f.t === 'choice') return `<div style="margin:8px 0"><div class="muted">${esc(f.l)}</div>${f.o.map(o => `<label style="display:block;margin:3px 0"><input type="radio" name="bf${i}" ${attr}f="${i}" value="${esc(o)}" ${cur === o ? 'checked' : ''}> ${esc(o)}</label>`).join('')}</div>`;
          if (f.t === 'open') return `<div style="margin:8px 0"><div class="muted">${esc(f.l)}</div><textarea rows="2" ${attr}f="${i}" style="width:100%">${esc(cur)}</textarea></div>`;
          return `<div style="margin:8px 0"><div class="muted">${esc(f.l)}</div><input type="text" ${attr}f="${i}" value="${esc(cur)}" style="width:100%"></div>`;
        }).join('')}</div>`;
    }
    let head = '', foot = '';
    if (t.kind === 'email') {
      head = `<p>${esc(t.situation)}</p><p><strong>Schrijf in de e-mail:</strong></p><ul>${t.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul><p class="muted">Schrijf de e-mail. Schrijf in hele zinnen.</p>
        <div style="border:1px solid #c8d3e0;border-radius:10px;padding:10px;background:#fff;font-size:.9rem"><div><strong>Aan:</strong> ${esc(t.to)}</div><div><strong>Onderwerp:</strong> ${esc(t.subject)}</div><hr style="border:none;border-top:1px solid #e3e8ef"><div>${esc(t.aanhef)}</div>`;
      foot = `<div>${esc(t.slot)}</div><div class="muted">[uw naam]</div></div>`;
    } else if (t.kind === 'wijkkrant') {
      head = `<p>${esc(t.situation)}</p><p><strong>Denk aan:</strong></p><ul>${t.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul><div style="border:1px solid #c8d3e0;border-radius:10px;padding:10px;background:#fff">`;
      foot = `</div>`;
    } else if (t.kind === 'briefje') {
      head = `<p>${esc(t.situation)}</p><div class="row" style="gap:8px;margin:8px 0">${t.pics.map((p, i) => `<div style="flex:1;min-width:80px;text-align:center;border:1px solid #c8d3e0;border-radius:10px;padding:8px;background:#fff"><div style="font-size:2rem">${p[0]}</div><div class="muted">${i + 1}${p[1] ? ' · ' + esc(p[1]) : ''}</div></div>`).join('')}</div>
        <div style="border:1px solid #c8d3e0;border-radius:10px;padding:10px;background:#fff"><div>${esc(t.aanhef)}</div>`;
      foot = `<div>${esc(t.slot)}</div><div class="muted">[uw naam]</div></div>`;
    }
    return head + `<textarea rows="6" ${attr}="1" style="width:100%;margin:6px 0" placeholder="Schrijf hier…">${esc(val || '')}</textarea>` + foot;
  }
  function bkSpeakPrompt(t) {
    const secName = ['', 'Deel 1 · Video-vraag', 'Deel 2 · Eén plaatje', 'Deel 3 · Twee plaatjes', 'Deel 4 · Drie plaatjes'][t.sec];
    let vis = '';
    if (t.sec === 1) vis = `<div style="text-align:center;font-size:2.6rem">${esc(t.who.split(' ')[0])}</div><div class="muted" style="text-align:center">${esc(t.who.split(' ').slice(1).join(' '))} (video yerine TTS ile soruyu dinle)</div>`;
    if (t.sec === 2) vis = `<div style="text-align:center;font-size:2.4rem;padding:8px;background:#fff;border:1px solid #c8d3e0;border-radius:10px">${esc(t.scene)}</div><div class="muted" style="text-align:center">Resim: ${esc(t.sceneTr)}</div>`;
    if (t.sec === 3) vis = `<div class="row" style="gap:8px">${[t.a, t.b].map((p, i) => `<div style="flex:1;text-align:center;border:1px solid #c8d3e0;border-radius:10px;padding:8px;background:#fff"><div style="font-size:2.4rem">${p[0]}</div><div class="muted">${L4[i]}: ${esc(p[1])}</div></div>`).join('')}</div>`;
    if (t.sec === 4) vis = `<div class="row" style="gap:6px">${t.pics.map((p, i) => `<div style="flex:1;text-align:center;border:1px solid #c8d3e0;border-radius:10px;padding:8px;background:#fff"><div style="font-size:2rem">${p[0]}</div><div class="muted">${i + 1}${p[1] ? ' · ' + esc(p[1]) : ''}</div></div>`).join('')}</div><div class="muted" style="text-align:center">${esc(t.person)}</div>`;
    return `<div class="pill">${secName}</div>${vis}<p style="margin-top:8px"><strong>${esc(t.q)}</strong></p>
      <button class="btn ba bs" data-bksay="${esc(t.id)}">🔊 Soruyu dinle</button> <span class="muted">Cevap süresi gerçek sınavda ~1 dk.</span>`;
  }
  function bkRecUI(textAttr, val) {
    return `<div class="audio-box"><button class="btn bp" id="recStart">● Kaydet</button><button class="btn bg" id="recStop" disabled>■ Durdur</button>
      <button class="btn ba" id="bkSTT">🎤 Yazıya çevir</button><span id="recStatus" class="muted"></span></div>
      <audio id="recAudio" controls class="hidden" style="width:100%"></audio>
      <textarea id="sText" ${textAttr} rows="3" style="width:100%" placeholder="Söylediğin cevap (STT veya yaz)">${esc(val || '')}</textarea>`;
  }

  /* --- views --- */
  function viewBank() {
    if (!B) return '<div class="card"><p>Soru bankası yüklenemedi (data/bank.js).</p></div>';
    const d = bkP().done;
    const cnt = { lezen: B.lezen.reduce((a, t) => a + t.qs.length, 0), luisteren: B.luisteren.reduce((a, t) => a + t.qs.length, 0), knm: B.knm.length, schrijven: B.schrijven.length, spreken: B.spreken.length };
    const doneIn = part => part === 'lezen' || part === 'luisteren' ? B[part].reduce((a, t) => a + t.qs.filter(q => q.id in d).length, 0) : B[part].filter(x => x.id in d).length;
    const sub = { lezen: `${B.lezen.length} metin · ${cnt.lezen} soru`, luisteren: `${B.luisteren.length} dinleme · ${cnt.luisteren} soru`, knm: `${cnt.knm} soru · 8 tema`, schrijven: `${cnt.schrijven} görev (e-posta, form, wijkkrant, not)`, spreken: `${cnt.spreken} görev · 4 bölüm` };
    return `<div class="card"><h2>🗂️ Sınav Soru Bankası</h2>
      <p class="muted">Resmi DUO A2 sınavlarının <strong>formatında</strong>, tamamen <strong>orijinal</strong> sorular. Her soruda Türkçe açıklama, konu ve zorluk etiketi var.</p>
      <div class="grid">${Object.entries(BPARTS).map(([k, p]) => `<button class="mbtn" data-bkpart="${k}"><span class="ic">${p.ic}</span><div><strong>${p.name}</strong><span>${sub[k]} · çözülen ${doneIn(k)}/${cnt[k]}</span></div></button>`).join('')}</div></div>
      <div class="card"><h2>📋 Resmi formatta tam denemeler</h2>
      <p class="muted">Soru/görev sayısı ve süre resmi sınavla aynı. Bankadan çekilir; Deneme A/B/C sabit setlerdir, "Rastgele" her seferinde farklıdır.</p>
      ${bankMockMenu()}</div>
      ${viewOfficialCard()}`;
  }
  function bankMockMenu() {
    return Object.entries(BPARTS).map(([k, p]) => `<div class="li" style="cursor:default;flex-wrap:wrap;gap:6px"><div><strong>${p.ic} ${p.name}</strong><div class="muted">${p.n} ${p.unit} · ${p.min} dk${k === 'knm' ? ' · geçme ≈28/40' : ''}${k === 'spreken' ? ' · 4 bölüm × 4' : ''}</div></div>
      <div class="row" style="gap:4px">${[1, 2, 3].map(v => `<button class="btn bp bs" data-bkmock="${k}:${v}">${L4[v - 1]}</button>`).join('')}<button class="btn bg bs" data-bkmock="${k}:0">Rastgele</button></div></div>`).join('');
  }
  function viewOfficialCard() {
    return `<div class="card"><h2>🔗 Resmi örnek sınavlar</h2>
      <p class="muted">DUO'nun ücretsiz resmi alıştırma sınavları (inburgeren.nl). Bu uygulamada resmi içerik <strong>yoktur</strong>; sadece bağlantı. Not: DUO'ya göre Spreken alıştırması Safari'de çalışmaz; bilgisayar önerilir.</p>
      ${OFFICIAL.map(g => `<div style="margin:6px 0"><strong>${esc(g.g)}:</strong> ${g.items.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener" class="pill" style="display:inline-block;margin:3px 2px;text-decoration:none">${esc(n)} ↗</a>`).join('')}</div>`).join('')}
      <a href="https://www.inburgeren.nl/examen-doen/oefenen.jsp" target="_blank" rel="noopener">inburgeren.nl › Oefenen ↗</a></div>`;
  }
  function viewBankList() {
    const part = state.bpart, p = BPARTS[part], d = bkP().done;
    const items = B[part];
    const topics = [...new Set(items.map(x => x.topic))];
    const list = bankItemsByTopic(part, state.btopic);
    const status = it => {
      if (it.qs) { const n = it.qs.filter(q => q.id in d).length, c = it.qs.filter(q => d[q.id] === 1).length; return n ? `${c}/${it.qs.length}` : ''; }
      if (part === 'knm') return it.id in d ? (d[it.id] === 1 ? '✓' : '✗') : '';
      return it.id in d ? d[it.id] + '%' : '';
    };
    const label = it => part === 'knm' ? it.q : part === 'spreken' ? `[Deel ${it.sec}] ${it.q}` : part === 'schrijven' ? `[${({ email: 'E-mail', form: 'Formulier', wijkkrant: 'Wijkkrant', briefje: 'Briefje' })[it.kind]}] ${it.title}` : it.title;
    return `<div class="card"><button class="btn bg bs" data-go="bank">← Banka</button>
      <h2>${p.ic} ${p.name} — soru bankası</h2>
      <div class="row" style="flex-wrap:wrap;gap:4px;margin:6px 0"><button class="btn bs ${!state.btopic ? 'bp' : 'bg'}" data-bktopic="">Hepsi (${items.length})</button>
      ${topics.map(t => `<button class="btn bs ${state.btopic === t ? 'bp' : 'bg'}" data-bktopic="${esc(t)}">${esc(part === 'knm' ? B.meta.knmThemes[t] : topicTr(t))} (${items.filter(x => x.topic === t).length})</button>`).join('')}</div>
      ${part === 'knm' ? `<button class="btn ba bb" data-bkitem="${esc(list[0].id)}" style="margin-bottom:6px">▶ Bu seçimle sırayla çöz</button>` : ''}
      ${list.map((it, i) => `<div class="li" data-bkitem="${esc(it.id)}"><div><strong>${i + 1}. ${esc(label(it))}</strong><div class="muted">${esc(topicTr(it.topic))} · ${esc(diffTr(it.diff))}${it.type ? ' · ' + esc(it.type) : ''}</div></div><span class="pill">${status(it) || '›'}</span></div>`).join('')}
    </div>`;
  }
  function viewBankItem() {
    const part = state.bpart, it = bankFind(part, state.bid), A = state.bAns || {};
    if (!it) return '<div class="card"><p>Bulunamadı.</p></div>';
    const back = `<button class="btn bg bs" data-bkpart="${part}">← Liste</button>`;
    const tags = `<div class="muted">${esc(BPARTS[part].name)} · ${esc(part === 'knm' ? B.meta.knmThemes[it.topic] : topicTr(it.topic))} · ${esc(diffTr(it.diff))} · ${esc(it.id)}</div>`;
    if (part === 'lezen' || part === 'luisteren') {
      const allAns = it.qs.every(q => q.id in A);
      const body = part === 'lezen' ? `<p class="muted">Lees de tekst. Beantwoord de vragen.</p>${bkReadText(it)}` :
        `<div class="audio-box"><button class="btn bp" id="bkPlay">▶ Dinle</button><span class="muted">Dinleme: ${state.bPlays || 0} kez · gerçek sınavda tekrar dinlenebilir ama süre işler</span></div>
         ${state.checked ? `<details open><summary>Metin (transcript)</summary><div class="rtxt">${it.lines.map(l => esc((l[0] === 'O' ? '📢' : l[0] === 'M' ? '👨' : '👩') + ' ' + l[1])).join('\n')}</div></details>` : ''}`;
      return `<div class="card">${back}<h2>${esc(it.title)}</h2>${tags}${body}
        ${it.qs.map(q => bkMC(q, A[q.id], state.checked, 'data-bkq')).join('')}
        ${state.checked ? `<div class="row"><button class="btn bp" id="bkRetry">Tekrar</button>${bkNextBtn(part, it.id)}</div>` : `<button class="btn bok bb" id="bkCheck" ${allAns ? '' : 'disabled'}>Kontrol et</button>`}</div>`;
    }
    if (part === 'knm') {
      const list = bankItemsByTopic('knm', state.btopic), idx = list.findIndex(x => x.id === it.id);
      return `<div class="card">${back}<div class="row" style="justify-content:space-between"><h2>KNM ${idx + 1}/${list.length}</h2></div>${tags}
        <div style="font-size:2.6rem;text-align:center;background:#fff;border:1px solid #c8d3e0;border-radius:10px;padding:8px;margin:6px 0">${esc(it.img)}</div>
        ${bkMC(it, A[it.id], state.checked, 'data-bkq')}
        ${state.checked ? `<div class="row">${bkNextBtn(part, it.id)}</div>` : `<button class="btn bok bb" id="bkCheck" ${it.id in A ? '' : 'disabled'}>Kontrol et</button>`}</div>`;
    }
    if (part === 'schrijven') {
      const val = state.bVal;
      return `<div class="card">${back}<h2>✍️ ${esc(it.title)}</h2>${tags}${bkWriteTask(it, val, 'data-bkt')}
        <div class="row" style="margin-top:8px"><button class="btn bok" id="bkWCheck">Kontrol et</button><button class="btn bg" id="bkWModel">Örnek cevap</button></div>
        <div id="bkWOut">${state.bOut || ''}</div>
        <div id="bkWM" class="hidden"><div class="model">${esc(it.model)}</div><div class="exp"><strong>Kontrol listesi:</strong><ul>${it.check.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div></div>${bkNextBtn(part, it.id)}</div>`;
    }
    if (part === 'spreken') {
      return `<div class="card">${back}<h2>🗣️ Spreken</h2>${tags}${bkSpeakPrompt(it)}${bkRecUI('data-bks="1"', state.bVal)}
        <div class="row" style="margin-top:8px"><button class="btn bok" id="bkSCheck">Değerlendir</button><button class="btn bg" id="bkSModel">Örnek cevap</button></div>
        <div id="bkSOut">${state.bOut || ''}</div>
        <div id="bkSM" class="hidden"><div class="model">${esc(it.model)}</div><div class="exp">💡 ${esc(it.tip)}</div><button class="btn ba bs" id="bkSModelTTS">🔊 Örneği dinle</button></div>${bkNextBtn(part, it.id)}</div>`;
    }
    return '';
  }
  function bkNextBtn(part, id) {
    const list = bankItemsByTopic(part, state.btopic), i = list.findIndex(x => x.id === id), nx = list[i + 1];
    return nx ? `<button class="btn bp" data-bkitem="${esc(nx.id)}">Sonraki ›</button>` : `<button class="btn bg" data-bkpart="${part}">Listeye dön</button>`;
  }

  /* --- mock exams from bank --- */
  let bankTimer = null;
  function stopBankTimer() { if (bankTimer) { clearInterval(bankTimer); bankTimer = null; } }
  function bankBuild(part, ver) {
    const seed = ver ? ver * 7919 + part.length * 31 : (Date.now() & 0x7fffffff);
    const P = BPARTS[part];
    if (part === 'lezen' || part === 'luisteren') {
      const out = [];
      for (const t of sShuffle(B[part], seed)) { for (const q of t.qs) { if (out.length < P.n) out.push({ tid: t.id, q }); } if (out.length >= P.n) break; }
      return out;
    }
    if (part === 'knm') {
      const themes = Object.keys(B.meta.knmThemes); let out = [];
      themes.forEach((th, i) => { out = out.concat(sShuffle(B.knm.filter(q => q.topic === th), seed + i).slice(0, 5)); });
      return sShuffle(out, seed + 99).map(q => ({ q }));
    }
    if (part === 'schrijven') {
      const by = k => sShuffle(B.schrijven.filter(t => t.kind === k), seed + k.length);
      const em = by('email'), fo = by('form'), wk = by('wijkkrant'), br = by('briefje');
      const third = (seed % 2) ? wk[0] : br[0], fourth = (seed % 2) ? br[0] : em[1];
      return [em[0], fo[0], third, fourth].map(t => ({ t }));
    }
    if (part === 'spreken') {
      let out = []; [1, 2, 3, 4].forEach(s => { out = out.concat(sShuffle(B.spreken.filter(x => x.sec === s), seed + s).slice(0, 4)); });
      return out.map(t => ({ t }));
    }
    return [];
  }
  function bankMockStart(part, ver) {
    stopBankTimer(); stopMockTimer && stopMockTimer();
    const P = BPARTS[part];
    state.bm = { part, ver: +ver, items: bankBuild(part, +ver), ans: {}, texts: {}, plays: {}, cur: 0, secs: P.min * 60, finished: false, result: null, started: Date.now() };
    bankTimer = setInterval(() => {
      const m = state.bm; if (!m || m.finished) { stopBankTimer(); return; }
      m.secs--; const el = $('#bmTimer'); if (el) { el.textContent = fmtTime(m.secs); el.classList.toggle('w', m.secs <= 60); }
      if (m.secs <= 0) bankMockFinish();
    }, 1000);
    go('bankMock');
  }
  function bankMockFinish() {
    stopBankTimer();
    const m = state.bm; if (!m || m.finished) return;
    m.finished = true;
    const part = m.part, byTopic = {}; let correct = 0, total = m.items.length, score = 0, pass = false, rows = [];
    const addT = (t, ok) => { byTopic[t] = byTopic[t] || [0, 0]; byTopic[t][1]++; if (ok) byTopic[t][0]++; };
    const d = bkP().done;
    if (part === 'lezen' || part === 'luisteren' || part === 'knm') {
      m.items.forEach((it, i) => {
        const q = it.q, sel = m.ans[i], ok = sel === q.a; if (ok) correct++;
        const topic = part === 'knm' ? q.topic : bankFind(part, it.tid).topic; addT(topic, ok);
        d[q.id] = ok ? 1 : 0;
        if (!ok) rows.push(`<div style="margin:8px 0;padding:8px;background:#f8fafc;border-radius:8px"><strong>S${i + 1}.</strong> ${esc(q.q)}<div class="muted">Senin cevabın: ${sel == null ? '—' : L4[sel] + ' ' + esc(q.o[sel])}</div><div>Doğru: <strong>${L4[q.a]} ${esc(q.o[q.a])}</strong></div><div class="exp">${esc(q.tr)}</div></div>`);
      });
      score = pct(correct, total); pass = correct >= BPASS[part];
    } else {
      let sum = 0;
      m.items.forEach((it, i) => {
        const t = it.t, r = part === 'schrijven' ? bankScoreWrite(t, m.texts[i]) : (() => { const k = kwScore(t.kw, m.texts[i]); return { pct: k.pct, detail: `İçerik kelimeleri: ${k.hits}/${k.total}` }; })();
        sum += r.pct; addT(t.topic, r.pct >= BPASS[part]); if (r.pct >= BPASS[part]) correct++;
        d[t.id] = r.pct;
        rows.push(`<div style="margin:8px 0;padding:8px;background:#f8fafc;border-radius:8px"><strong>${i + 1}. ${esc(t.title || t.q)}</strong> <span class="badge ${r.pct >= BPASS[part] ? 'ok' : 'bad'}">${r.pct}%</span><div class="muted">${esc(r.detail)}</div><div class="muted">Senin cevabın: ${esc(typeof m.texts[i] === 'object' ? Object.values(m.texts[i] || {}).join(' · ') : (m.texts[i] || '—'))}</div><div class="model">${esc(t.model)}</div>${t.tip ? `<div class="exp">💡 ${esc(t.tip)}</div>` : ''}</div>`);
      });
      score = Math.round(sum / Math.max(1, total)); pass = score >= BPASS[part];
    }
    const weak = Object.entries(byTopic).filter(([, v]) => v[0] / v[1] < 0.6).map(([k]) => part === 'knm' ? B.meta.knmThemes[k] : topicTr(k));
    let verdict;
    if (part === 'lezen' || part === 'luisteren') verdict = correct >= 23 ? 'Geçme şansın büyük görünüyor (23–25 doğru).' : correct >= 17 ? 'Makul bir şansın var (17–22 doğru) — zayıf konuları tekrar et.' : 'Henüz yeterli değil (<17). Daha çok alıştırma yap.';
    else if (part === 'knm') verdict = correct >= 28 ? `Geçme sınırının (≈28/40) üstündesin: ${correct}/40.` : `Geçme sınırının (≈28/40) altındasın: ${correct}/40. Zayıf temaları çalış.`;
    else verdict = pass ? `İyi! Ortalama %${score} (hedef ≥%${BPASS[part]}). Bu otomatik bir tahmindir; gerçek değerlendirmeyi sınav görevlisi yapar.` : `Ortalama %${score} (hedef ≥%${BPASS[part]}). Her maddeye tam cümleyle cevap vermeye çalış. (Otomatik tahmin)`;
    const reviewTr = `${verdict}${weak.length ? ' Zayıf konular: ' + weak.join(', ') + '.' : ''}`;
    m.result = { score, correct, total, pass, byTopic, rows: rows.join(''), reviewTr, used: BPARTS[part].min * 60 - m.secs };
    const at = new Date().toLocaleString('tr-TR');
    bkP().mocks.push({ part, ver: m.ver, score, correct, total, pass, at, reviewTr, byTopic });
    progress.mocks.push({ part: part + ' bank-' + (m.ver ? L4[m.ver - 1] : 'rastgele'), score, pass, at, correct, total });
    touchStreak(); saveP(progress);
    if (state.screen === 'bankMock') render();
  }
  function viewBankMock() {
    const m = state.bm; if (!m) return viewBank();
    const P = BPARTS[m.part];
    if (m.finished && m.result) {
      const r = m.result;
      return `<div class="card"><h2>${P.ic} ${P.name} — sonuç</h2>
        <div class="stats"><div class="st"><div class="n">${r.score}%</div><div class="l">Skor</div></div><div class="st"><div class="n">${r.correct}/${r.total}</div><div class="l">${m.part === 'schrijven' || m.part === 'spreken' ? 'Yeterli görev' : 'Doğru'}</div></div><div class="st"><div class="n">${r.pass ? '✓' : '✗'}</div><div class="l">Tahmin</div></div></div>
        <div class="exp" style="margin-top:8px">🇹🇷 ${esc(r.reviewTr)}</div>
        <h3>Konulara göre</h3>${Object.entries(r.byTopic).map(([k, v]) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin:4px 0"><span>${esc(m.part === 'knm' ? B.meta.knmThemes[k] : topicTr(k))}</span><span class="pill">${v[0]}/${v[1]}</span></div>`).join('')}
        <h3>${m.part === 'schrijven' || m.part === 'spreken' ? 'Görev değerlendirmesi' : 'Yanlışların açıklaması'}</h3>${r.rows || '<p>Hepsi doğru! 🎉</p>'}
        <div class="row" style="margin-top:10px"><button class="btn bp" data-bkmock="${m.part}:${m.ver}">Tekrar</button><button class="btn bg" data-go="bank">Banka</button><button class="btn bg" data-go="mocks">Sınavlar</button></div></div>`;
    }
    const it = m.items[m.cur], n = m.items.length;
    let body = '';
    if (m.part === 'lezen') { const t = bankFind('lezen', it.tid); body = `<div class="muted">${esc(t.title)}</div>${bkReadText(t)}${bkMC(it.q, m.ans[m.cur], false, 'data-bmq')}`; }
    else if (m.part === 'luisteren') { const t = bankFind('luisteren', it.tid); body = `<div class="audio-box"><button class="btn bp" id="bmPlay">▶ Fragmanı dinle</button><span class="muted">${esc(t.title)} · ${m.plays[it.tid] || 0} kez dinlendi</span></div>${bkMC(it.q, m.ans[m.cur], false, 'data-bmq')}`; }
    else if (m.part === 'knm') body = `<div style="font-size:2.6rem;text-align:center;background:#fff;border:1px solid #c8d3e0;border-radius:10px;padding:8px">${esc(it.q.img)}</div>${bkMC(it.q, m.ans[m.cur], false, 'data-bmq')}`;
    else if (m.part === 'schrijven') body = `<h3>Opdracht ${m.cur + 1}</h3>${bkWriteTask(it.t, m.texts[m.cur], 'data-bmt')}`;
    else body = bkSpeakPrompt(it.t) + bkRecUI('data-bmt="1"', m.texts[m.cur]);
    const answered = m.part === 'schrijven' || m.part === 'spreken' ? Object.keys(m.texts).filter(k => m.texts[k] && (typeof m.texts[k] !== 'object' || Object.keys(m.texts[k]).length)).length : Object.keys(m.ans).length;
    return `<div class="card"><div class="row" style="justify-content:space-between"><strong>${P.ic} ${P.name} · ${m.ver ? 'Deneme ' + L4[m.ver - 1] : 'Rastgele'}</strong><span class="timer" id="bmTimer">${fmtTime(m.secs)}</span></div>
      <div class="muted">${m.cur + 1}/${n} · cevaplanan ${answered}/${n}</div><div class="bar"><i style="width:${pct(m.cur + 1, n)}%"></i></div>
      ${body}
      <div class="row" style="margin-top:10px"><button class="btn bg" id="bmPrev" ${m.cur ? '' : 'disabled'}>‹ Önceki</button>${m.cur < n - 1 ? '<button class="btn bp" id="bmNext">Sonraki ›</button>' : ''}<button class="btn bbad" id="bmEnd">Bitir</button></div>
      <div class="row" style="flex-wrap:wrap;gap:3px;margin-top:8px">${m.items.map((_, i) => `<button class="btn bs ${i === m.cur ? 'bp' : ((m.part === 'schrijven' || m.part === 'spreken') ? m.texts[i] : m.ans[i] != null) ? 'bok' : 'bg'}" data-bmgo="${i}" style="min-width:34px;padding:4px">${i + 1}</button>`).join('')}</div></div>`;
  }

  function bindBank() {
    document.querySelectorAll('[data-bkpart]').forEach(el => el.addEventListener('click', () => go('bankList', { bpart: el.dataset.bkpart, btopic: el.dataset.bkpart === state.bpart ? state.btopic : '' })));
    document.querySelectorAll('[data-bktopic]').forEach(el => el.addEventListener('click', () => go('bankList', { btopic: el.dataset.bktopic })));
    document.querySelectorAll('[data-bkitem]').forEach(el => el.addEventListener('click', () => go('bankItem', { bid: el.dataset.bkitem, bAns: {}, bPlays: 0, bVal: null, bOut: '' })));
    document.querySelectorAll('[data-bkmock]').forEach(el => el.addEventListener('click', () => { const [p, v] = el.dataset.bkmock.split(':'); bankMockStart(p, +v); }));
    document.querySelectorAll('[data-bksay]').forEach(el => el.addEventListener('click', () => { const t = bankFind('spreken', el.dataset.bksay); speakLines([['O', t.q]]); }));
    const stt = $('#bkSTT'); if (stt) stt.addEventListener('click', () => { doSTT(false); });
    // practice
    if (state.screen === 'bankItem') {
      const part = state.bpart, it = bankFind(part, state.bid);
      document.querySelectorAll('[data-bkq]').forEach(el => el.addEventListener('click', () => { if (state.checked) return; state.bAns[el.dataset.bkq] = +el.dataset.bc; render(); }));
      const chk = $('#bkCheck'); if (chk) chk.addEventListener('click', () => {
        const qs = it.qs || [it], d = bkP().done; let c = 0;
        qs.forEach(q => { const ok = state.bAns[q.id] === q.a; d[q.id] = ok ? 1 : 0; if (ok) c++; });
        state.checked = true;
        progress.history.push({ type: 'Banka ' + BPARTS[part].name, detail: it.title || it.id, score: c + '/' + qs.length, at: Date.now() });
        touchStreak(); saveP(progress); render();
      });
      const rt = $('#bkRetry'); if (rt) rt.addEventListener('click', () => { state.bAns = {}; state.checked = false; render(); });
      const pl = $('#bkPlay'); if (pl) pl.addEventListener('click', () => { state.bPlays = (state.bPlays || 0) + 1; const s = pl.nextElementSibling; if (s) s.textContent = `Dinleme: ${state.bPlays} kez · çalıyor…`; speakLines(it.lines); });
      // schrijven
      document.querySelectorAll('[data-bkt]').forEach(el => el.addEventListener('input', () => { state.bVal = el.value; }));
      document.querySelectorAll('[data-bktf]').forEach(el => el.addEventListener(el.type === 'radio' ? 'change' : 'input', () => { state.bVal = Object.assign({}, state.bVal || {}, { ['f' + el.dataset.bktf]: el.value }); }));
      const wc = $('#bkWCheck'); if (wc) wc.addEventListener('click', () => {
        const r = bankScoreWrite(it, state.bVal); bkP().done[it.id] = r.pct; touchStreak(); saveP(progress);
        state.bOut = `<div class="exp">Otomatik kontrol: <strong>${r.pct}%</strong><br>${esc(r.detail)}<br><span class="muted">Bu sadece biçim/içerik tahminidir; örnek cevapla karşılaştır.</span></div>`;
        $('#bkWOut').innerHTML = state.bOut;
      });
      const wm = $('#bkWModel'); if (wm) wm.addEventListener('click', () => $('#bkWM').classList.remove('hidden'));
      // spreken
      const st = $('[data-bks]'); if (st) st.addEventListener('input', () => { state.bVal = st.value; });
      const sc = $('#bkSCheck'); if (sc) sc.addEventListener('click', () => {
        const txt = $('#sText').value; state.bVal = txt; const k = kwScore(it.kw, txt); bkP().done[it.id] = k.pct; touchStreak(); saveP(progress);
        state.bOut = `<div class="exp">İçerik kapsamı: <strong>${k.hits}/${k.total}</strong> (${k.pct}%)${it.sec > 1 ? '' : ''}<br>💡 ${esc(it.tip)}</div>`;
        $('#bkSOut').innerHTML = state.bOut;
      });
      const smb = $('#bkSModel'); if (smb) smb.addEventListener('click', () => $('#bkSM').classList.remove('hidden'));
      const smt = $('#bkSModelTTS'); if (smt) smt.addEventListener('click', () => speakLines([['V', it.model]]));
    }
    // mock
    if (state.screen === 'bankMock' && state.bm && !state.bm.finished) {
      const m = state.bm;
      document.querySelectorAll('[data-bmq]').forEach(el => el.addEventListener('click', () => { m.ans[m.cur] = +el.dataset.bc; render(); }));
      document.querySelectorAll('[data-bmt]').forEach(el => el.addEventListener('input', () => { m.texts[m.cur] = el.value; }));
      document.querySelectorAll('[data-bmtf]').forEach(el => el.addEventListener(el.type === 'radio' ? 'change' : 'input', () => { m.texts[m.cur] = Object.assign({}, m.texts[m.cur] || {}, { ['f' + el.dataset.bmtf]: el.value }); }));
      const pl = $('#bmPlay'); if (pl) pl.addEventListener('click', () => { const it = m.items[m.cur]; m.plays[it.tid] = (m.plays[it.tid] || 0) + 1; speakLines(bankFind('luisteren', it.tid).lines); const s = pl.nextElementSibling; if (s) s.textContent = `${m.plays[it.tid]} kez dinlendi · çalıyor…`; });
      const pv = $('#bmPrev'); if (pv) pv.addEventListener('click', () => { bkCapture(); m.cur--; bkStop(); render(); });
      const nx = $('#bmNext'); if (nx) nx.addEventListener('click', () => { bkCapture(); m.cur++; bkStop(); render(); });
      document.querySelectorAll('[data-bmgo]').forEach(el => el.addEventListener('click', () => { bkCapture(); m.cur = +el.dataset.bmgo; bkStop(); render(); }));
      const en = $('#bmEnd'); if (en) en.addEventListener('click', () => { bkCapture(); if (confirm('Denemeyi bitir ve sonuçları gör?')) bankMockFinish(); });
    }
  }
  function bkCapture() { const m = state.bm, tx = $('#sText'); if (m && !m.finished && m.part === 'spreken' && tx && tx.value) m.texts[m.cur] = tx.value; }
  function bkStop() { bkSpeakToken++; try { speechSynthesis.cancel(); } catch { } }

  /* ===== PWA ===== */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { });
  }

  // Expose for tests
  window.__A2V2 = {
    D, progress, loadP, saveP, startMock, finishMock, generatePlan, readiness, go, state, settings,
    pct, shuffle, G, gramStart, gramAnswer, gramNext, gramFinish,
    B, bankMockStart, bankMockFinish, bankScoreWrite, kwScore, bankBuild, bkP, getProgress: () => progress
  };

  render();
})();
