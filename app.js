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
    const map = { home: 'home', practice: 'practice', reading: 'practice', writing: 'practice', listening: 'practice', speaking: 'practice', knm: 'practice', vocab: 'practice', plan: 'plan', mocks: 'mocks', mockRun: 'mocks', progress: 'more', tutor: 'more', settings: 'more', help: 'more', more: 'more' };
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
      tutor: viewTutor, settings: viewSettings, help: viewHelp, more: viewMore
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      mediaRec = new MediaRecorder(stream);
      mediaRec.ondataavailable = e => chunks.push(e.data);
      mediaRec.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
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
      toast('Mikrofon izni yok veya desteklenmiyor (https/localhost gerekir)');
      $('#recStatus').textContent = 'Mikrofon kullanılamıyor. Metin kutusuna yazabilirsin.';
    }
  }
  function stopRec() {
    if (mediaRec && mediaRec.state !== 'inactive') mediaRec.stop();
    $('#recStart').disabled = false; $('#recStop').disabled = true;
  }
  function doSTT(forMock) {
    const r = getRecognition();
    if (!r) { toast('SpeechRecognition desteklenmiyor (Chrome önerilir, https)'); return; }
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
    r.onerror = () => toast('STT hatası');
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

  /* ===== PWA ===== */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { });
  }

  // Expose for tests
  window.__A2V2 = {
    D, progress, loadP, saveP, startMock, finishMock, generatePlan, readiness, go, state, settings,
    pct, shuffle
  };

  render();
})();
