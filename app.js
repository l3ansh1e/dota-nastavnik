// Дота-Наставник: тренажёр драфта и энциклопедия для новичков.
// Данные: HEROES (dotaconstants), MATCHUPS (OpenDota, винрейты пар), KNOWLEDGE (база знаний).

var KB = {};
(typeof KNOWLEDGE !== 'undefined' ? KNOWLEDGE : []).forEach(function (k) { KB[k.id] = k; });

var byId = {};
HEROES.forEach(function (h) { byId[h.id] = h; });

function imgUrl(slug) {
  return 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/' + slug + '.png';
}
function ruName(h) { return KB[h.id] ? KB[h.id].name_ru : h.name; }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Достоинство пары по статистике: adv > 0 — герой a статистически выигрывает у героя b.
function matchupAdv(aId, bId) {
  if (typeof MATCHUPS === 'undefined') return 0;
  var m = MATCHUPS[aId];
  if (m && typeof m[bId] === 'number') return m[bId];
  var r = MATCHUPS[bId];
  if (r && typeof r[aId] === 'number') return -r[aId];
  return 0;
}

var POS_NAMES = { 1: 'керри', 2: 'мид', 3: 'оффлейн', 4: 'саппорт', 5: 'фулл-саппорт' };

function heroPositions(h) {
  if (KB[h.id] && KB[h.id].positions && KB[h.id].positions.length) return KB[h.id].positions;
  var roles = (h.roles || '').split(',');
  if (roles.indexOf('Support') >= 0) return [5, 4];
  if (roles.indexOf('Carry') >= 0) return [1, 2];
  if (roles.indexOf('Initiator') >= 0 || roles.indexOf('Durable') >= 0) return [3];
  return [2];
}
function heroDamage(h) {
  if (KB[h.id] && KB[h.id].damage) return KB[h.id].damage;
  var roles = (h.roles || '').split(',');
  if (roles.indexOf('Nuker') >= 0 && roles.indexOf('Carry') < 0) return 'magic';
  return 'phys';
}
function heroTags(h) {
  if (KB[h.id] && KB[h.id].tags && KB[h.id].tags.length) return KB[h.id].tags;
  return (h.roles || '').toLowerCase().split(',');
}
function hasTag(h, t) { return heroTags(h).indexOf(t) >= 0; }

// ===== Сравнение способностей =====
// Из описаний способностей вытаскиваются «инструменты» героя (немота, стан, иллюзии...)
// и его «зависимости» (живёт заклинаниями, каналит ульт, бьёт с руки...).
// На пересечении инструментов одного и зависимостей другого строится объяснение,
// какая способность бьёт какую — без этого оценка была бы голой статистикой.

var TOOL_DEFS = [
  ['silence', /немот|тишин|молчан|безмолв|не могут колдовать|нельзя колдовать|запреща\S* колдовать/i],
  // «стан» только как отдельное слово — иначе ловится внутри «восСТАНавливает»
  ['stun', /оглуш|(?<![а-яё])стан(?:ит|ят|ом|а|ы|у|е)?(?![а-яё])/i],
  ['hex', /превраща\S+ (врага|цель)|в овцу|в свинью|в лягушку|в безобидн/i],
  ['evasion', /уклоня|промахива/i],
  ['illusions', /иллюз/i],
  ['break', /отключа\S* пассив/i],
  ['manaburn', /(сжига|выжига|жжёт)[^.]{0,20}ман[уы]/i]
];

var TRAITS_CACHE = {};
function heroTraits(h) {
  if (TRAITS_CACHE[h.id]) return TRAITS_CACHE[h.id];
  var kb = KB[h.id];
  var t = { tools: {}, channel: null, passives: 0, spellReliant: false, attackReliant: false, escapeReliant: false, singleTargetControl: null };
  (kb && kb.abilities || []).forEach(function (a) {
    var tip = a.tip || '';
    TOOL_DEFS.forEach(function (def) {
      if (!t.tools[def[0]] && def[1].test(tip)) t.tools[def[0]] = a.name;
    });
    if (!t.channel && /канал|не двигайся и не прерывайся|пока поддерживаешь/i.test(tip)) t.channel = a.name;
    if (/^пассивно/i.test(tip)) t.passives++;
    // Контроль одной цели: глагол захвата + одиночная цель («врага», «цель» — не «врагов»)
    if (!t.singleTargetControl && /(усыпля|хвата|держит|превраща|оглуша)\S*\s+(одн\S+\s+)?(врага|цель)(?![а-яё])/i.test(tip)) t.singleTargetControl = a.name;
  });
  t.spellReliant = heroDamage(h) === 'magic' && !hasTag(h, 'carry');
  t.attackReliant = hasTag(h, 'carry') && heroDamage(h) === 'phys';
  t.escapeReliant = hasTag(h, 'escape');
  TRAITS_CACHE[h.id] = t;
  return t;
}

// Что инструменты героя a делают с зависимостями героя b. Возвращает строки-объяснения.
// Имена героев — только в именительном падеже: склонять произвольные имена нельзя.
function abilityClash(a, b) {
  var ta = heroTraits(a), tb = heroTraits(b);
  var an = ruName(a), bn = ruName(b);
  var out = [];
  if (ta.tools.silence && tb.spellReliant) {
    out.push(bn + ' живёт заклинаниями, а ' + an + ' выключает их немотой (' + ta.tools.silence + ') — замолчав, такой герой почти не влияет на драку.');
  }
  if (tb.channel && (ta.tools.stun || ta.tools.silence || ta.tools.hex)) {
    out.push(an + ' одной кнопкой (' + (ta.tools.stun || ta.tools.silence || ta.tools.hex) + ') прерывает ' + tb.channel + ' — длинное заклинание не успеет отработать.');
  }
  if (ta.tools.hex && tb.escapeReliant) {
    out.push(an + ' умеет превращать в безобидное существо (' + ta.tools.hex + ') — фокусы с побегом, на которых держится ' + bn + ', не сработают.');
  }
  if (ta.tools.evasion && tb.attackReliant) {
    out.push(an + ' уклоняется от ударов (' + ta.tools.evasion + '), а ' + bn + ' наносит урон именно автоатаками — часть ударов уйдёт в молоко.');
  }
  if (ta.tools.illusions && tb.singleTargetControl) {
    out.push(an + ' плодит копии (' + ta.tools.illusions + ') — точечный контроль (' + tb.singleTargetControl + ') уйдёт в иллюзию, а не в настоящего героя.');
  }
  if (ta.tools.break && tb.passives >= 2) {
    out.push(an + ' отключает пассивные способности (' + ta.tools.break + '), а ' + bn + ' именно на них и держится.');
  }
  if (ta.tools.manaburn && tb.spellReliant) {
    out.push(an + ' выжигает ману (' + ta.tools.manaburn + '), а ' + bn + ' без маны молчит.');
  }
  return out;
}

// Есть ли в базе знаний явная запись об этой паре (тогда движок молчит — база точнее).
function kbCoversPair(a, b) {
  var ka = KB[a.id], kc = KB[b.id];
  var hit = false;
  if (ka) (ka.strong_against || []).concat(ka.weak_against || []).forEach(function (c) { if (c.hero === b.name) hit = true; });
  if (kc) (kc.strong_against || []).concat(kc.weak_against || []).forEach(function (c) { if (c.hero === a.name) hit = true; });
  return hit;
}

// ===== Оценка пика =====
// Возвращает { score, grade, reasons: [{type:'good'|'bad'|'info', text}] }
function scorePick(hero, myTeam, enemyTeam, quiet) {
  var score = 0;
  var reasons = [];
  var kb = KB[hero.id];

  // 1. Статистика матчапов против каждого вражеского пика
  enemyTeam.forEach(function (e) {
    var adv = matchupAdv(hero.id, e.id);
    var pct = adv * 100;
    score += pct * 2.2;
    if (Math.abs(pct) >= 1.5 && !quiet) {
      var wr = (50 + pct).toFixed(1);
      reasons.push({
        type: pct > 0 ? 'good' : 'bad',
        text: 'По статистике реальных матчей ' + ruName(hero) + ' ' + (pct > 0 ? 'выигрывает у ' : 'проигрывает ') + ruName(e) + ' — ' + wr + '% побед в этой паре.'
      });
    }
  });

  // 1б. Сравнение способностей: какая абилка бьёт какую.
  // Работает там, где база знаний молчит о паре, — чтобы у любого матчапа было «почему», а не голые проценты.
  enemyTeam.forEach(function (e) {
    if (kbCoversPair(hero, e)) return;
    abilityClash(hero, e).slice(0, 2).forEach(function (txt) {
      score += 4;
      if (!quiet) reasons.push({ type: 'good', text: txt });
    });
    abilityClash(e, hero).slice(0, 2).forEach(function (txt) {
      score -= 4;
      if (!quiet) reasons.push({ type: 'bad', text: txt });
    });
  });

  // 2. Знания: явные контры из базы
  if (kb) {
    enemyTeam.forEach(function (e) {
      (kb.strong_against || []).forEach(function (c) {
        if (c.hero === e.name) { score += 9; if (!quiet) reasons.push({ type: 'good', text: 'Контрит ' + ruName(e) + ': ' + c.why }); }
      });
      (kb.weak_against || []).forEach(function (c) {
        if (c.hero === e.name) { score -= 11; if (!quiet) reasons.push({ type: 'bad', text: 'Уязвим против ' + ruName(e) + ': ' + c.why }); }
      });
      var ekb = KB[e.id];
      if (ekb) {
        (ekb.strong_against || []).forEach(function (c) {
          if (c.hero === hero.name) { score -= 9; if (!quiet) reasons.push({ type: 'bad', text: ruName(e) + ' контрит этот пик: ' + c.why }); }
        });
      }
    });
    // 3. Синергия с союзниками
    myTeam.forEach(function (a) {
      (kb.synergy || []).forEach(function (s) {
        if (s.hero === a.name) { score += 7; if (!quiet) reasons.push({ type: 'good', text: 'Синергия с ' + ruName(a) + ': ' + s.why }); }
      });
      var akb = KB[a.id];
      if (akb) {
        (akb.synergy || []).forEach(function (s) {
          if (s.hero === hero.name) { score += 7; if (!quiet) reasons.push({ type: 'good', text: 'Связка с ' + ruName(a) + ': ' + s.why }); }
        });
      }
    });
  }

  // 4. Баланс позиций
  var taken = {};
  myTeam.forEach(function (a) { taken[heroPositions(a)[0]] = true; });
  var mainPos = heroPositions(hero)[0];
  var freePos = heroPositions(hero).filter(function (p) { return !taken[p]; });
  if (freePos.length > 0) {
    if (!taken[mainPos]) {
      score += 8;
      if (!quiet && myTeam.length > 0) reasons.push({ type: 'good', text: 'Закрывает свободную позицию ' + mainPos + ' (' + POS_NAMES[mainPos] + ') — в команде каждый должен заниматься своим делом.' });
    }
  } else {
    score -= 9;
    if (!quiet) reasons.push({ type: 'bad', text: 'Все его позиции (' + heroPositions(hero).join(', ') + ') уже заняты союзниками — кому-то придётся играть не свою роль, и команда потеряет золото и опыт.' });
  }

  // Слишком много керри
  var carries = myTeam.filter(function (a) { return hasTag(a, 'carry'); }).length;
  if (hasTag(hero, 'carry') && carries >= 2) {
    score -= 6;
    if (!quiet) reasons.push({ type: 'bad', text: 'В команде уже ' + carries + ' керри. Золота на карте на всех не хватит — кто-то останется без предметов.' });
  }
  // Нет саппорта к концу драфта
  var sups = myTeam.filter(function (a) { return hasTag(a, 'support'); }).length;
  if (myTeam.length >= 3 && sups === 0 && hasTag(hero, 'support')) {
    score += 7;
    if (!quiet) reasons.push({ type: 'good', text: 'Наконец-то саппорт! Без него некому покупать варды (обзор) и помогать керри на линии.' });
  }

  // 5. Баланс урона
  if (myTeam.length >= 2) {
    var phys = 0, magic = 0;
    myTeam.forEach(function (a) { var d = heroDamage(a); if (d === 'phys') phys++; else if (d === 'magic') magic++; });
    var d = heroDamage(hero);
    if (phys >= 2 && magic === 0 && d === 'magic') {
      score += 5;
      if (!quiet) reasons.push({ type: 'good', text: 'Добавляет магический урон — до этого весь урон был физическим, врагу хватило бы одной брони.' });
    } else if (phys >= 3 && d === 'phys') {
      score -= 5;
      if (!quiet) reasons.push({ type: 'bad', text: 'Весь урон команды — физический. Враги соберут броню (Assault Cuirass, Shiva) и перестанут получать урон.' });
    } else if (magic >= 3 && d === 'magic') {
      score -= 5;
      if (!quiet) reasons.push({ type: 'bad', text: 'Слишком много магического урона — враги соберут защиту от магии (BKB, Pipe), и к концу игры урона не останется.' });
    }
  }

  // 6. Контроль и инициация
  if (myTeam.length >= 3) {
    var hasDis = myTeam.some(function (a) { return hasTag(a, 'disabler'); });
    var hasInit = myTeam.some(function (a) { return hasTag(a, 'initiator'); });
    if (!hasDis && hasTag(hero, 'disabler')) {
      score += 5;
      if (!quiet) reasons.push({ type: 'good', text: 'Даёт контроль (станы/немоту) — без него враги будут просто убегать из драк.' });
    }
    if (!hasInit && hasTag(hero, 'initiator')) {
      score += 4;
      if (!quiet) reasons.push({ type: 'good', text: 'Умеет начинать драки — команде нужен тот, кто сделает первый ход.' });
    }
  }

  var grade = score >= 24 ? 'S' : score >= 13 ? 'A' : score >= 3 ? 'B' : score >= -8 ? 'C' : 'D';
  return { score: score, grade: grade, reasons: reasons };
}

var GRADE_PHRASES = {
  S: 'Великолепный пик! Так драфтят на профессиональной сцене.',
  A: 'Отличный выбор — почти идеально под ситуацию.',
  B: 'Нормальный пик. Сработает, но были варианты посильнее.',
  C: 'Спорный выбор — у врага есть чем ответить.',
  D: 'Опасный пик — врагу будет легко его наказать.'
};

// ===== Состояние драфта =====
var state = {
  attrFilter: 'all-attrs',
  wikiAttrFilter: 'all-attrs',
  draft: null
};

function newDraft() {
  state.draft = { my: [], enemy: [], history: [], over: false, waiting: false };
  document.getElementById('draft-result').classList.add('hidden');
  document.getElementById('draft-result').innerHTML = '';
  hideFeedback();
  botPick();
  renderDraft();
}

function isTaken(id) {
  var d = state.draft;
  if (!d) return false;
  return d.my.concat(d.enemy).some(function (h) { return h.id === id; });
}

function availableHeroes() {
  return HEROES.filter(function (h) { return !isTaken(h.id); });
}

// Бот: закрывает свои роли + смотрит матчапы против наших. Берёт не строго лучшего,
// а случайного из верхушки списка — чтобы драфты не повторялись из игры в игру.
function botPick() {
  var d = state.draft;
  if (!d || d.enemy.length >= 5) return;
  var pool = availableHeroes().map(function (h) {
    // Лёгкий шум рвёт ничьи (на первом пике все герои равны) — иначе бот зацикливается на одном герое.
    return { h: h, s: scorePick(h, d.enemy, d.my, true).score + Math.random() * 2 - 1 };
  }).sort(function (a, b) { return b.s - a.s; });
  var top = pool.slice(0, 6);
  var weights = top.map(function (c, i) { return 1 / (i + 2); });
  var sum = 0;
  weights.forEach(function (w) { sum += w; });
  var r = Math.random() * sum;
  var pick = top[0].h;
  for (var i = 0; i < top.length; i++) { r -= weights[i]; if (r <= 0) { pick = top[i].h; break; } }
  d.enemy.push(pick);
}

function playerPick(id) {
  var d = state.draft;
  if (!d || d.over || d.waiting || isTaken(id)) return;
  var hero = byId[id];
  var result = scorePick(hero, d.my.slice(), d.enemy.slice(), false);
  d.history.push({
    hero: hero,
    grade: result.grade,
    score: result.score,
    reasons: result.reasons,
    mySnapshot: d.my.slice(),
    enemySnapshot: d.enemy.slice(),
    takenSnapshot: d.my.concat(d.enemy).map(function (h) { return h.id; })
  });
  d.my.push(hero);
  showFeedback(hero, result);

  if (d.my.length >= 5) {
    d.over = true;
    renderDraft();
    setTimeout(showResult, 600);
  } else {
    d.waiting = true;
    renderDraft();
    setTimeout(function () {
      botPick();
      d.waiting = false;
      renderDraft();
    }, 700);
  }
}

function showFeedback(hero, result) {
  var el = document.getElementById('pick-feedback');
  var html = '<div class="pf-head">' +
    '<img src="' + imgUrl(hero.slug) + '" alt="">' +
    '<div><div class="pf-title">' + esc(ruName(hero)) + ' <span style="color:var(--muted);font-weight:400">(' + esc(hero.name) + ')</span></div>' +
    '<div class="pf-sub">' + esc(GRADE_PHRASES[result.grade]) + '</div></div>' +
    '<span class="grade grade-' + result.grade + '">' + result.grade + '</span></div>';
  var kb = KB[hero.id];
  if (kb && kb.summary) {
    html += '<div class="pf-strength"><span class="pfs-label">Чем силён</span>' + esc(kb.summary) + '</div>';
  }
  var rs = result.reasons.slice(0, 7);
  if (rs.length === 0) rs = [{ type: 'info', text: 'Пик ровный: явных контр и явных плюсов против такого драфта нет. Смотри на роли и комфорт.' }];
  html += '<ul class="pf-reasons">' + rs.map(function (r) {
    return '<li class="' + r.type + '">' + esc(r.text) + '</li>';
  }).join('') + '</ul>';
  html += '<button class="pf-close" onclick="hideFeedback()">Понятно</button>';
  el.innerHTML = html;
  el.classList.remove('hidden');
}
function hideFeedback() { document.getElementById('pick-feedback').classList.add('hidden'); }

function showResult() {
  var d = state.draft;
  var total = d.history.reduce(function (s, h) { return s + h.score; }, 0);
  var avg = total / d.history.length;
  var verdict = avg >= 18 ? 'Драфт уровня турнира! Бот может идти домой.' :
    avg >= 9 ? 'Сильный драфт — у твоей команды отличные шансы.' :
    avg >= 0 ? 'Рабочий драфт, но несколько пиков можно было усилить. Смотри разбор ниже.' :
    'Драфт получился тяжёлым — у бота много ответов на твоих героев. Разбор ниже покажет, где свернули не туда.';

  var html = '<div class="dr-head"><h2>Разбор драфта</h2><div class="dr-verdict">' + esc(verdict) + '</div></div><div class="dr-grid">';

  d.history.forEach(function (step, i) {
    // Кто был бы сильнее на этом же ходу
    var alts = HEROES
      .filter(function (h) { return step.takenSnapshot.indexOf(h.id) < 0 && h.id !== step.hero.id; })
      .map(function (h) { return { h: h, s: scorePick(h, step.mySnapshot, step.enemySnapshot, true).score }; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, 3);

    html += '<div class="dr-pick"><div class="dr-pick-head">' +
      '<img src="' + imgUrl(step.hero.slug) + '" alt="">' +
      '<div><b>Пик ' + (i + 1) + ':</b> ' + esc(ruName(step.hero)) +
      '<div style="font-size:11px;color:var(--muted)">' + esc(step.hero.name) + '</div></div>' +
      '<span class="grade grade-' + step.grade + '">' + step.grade + '</span></div>';
    var skb = KB[step.hero.id];
    if (skb && skb.summary) {
      var firstSentence = skb.summary.split('. ')[0];
      html += '<div class="dr-strength">' + esc(firstSentence + (firstSentence.slice(-1) === '.' ? '' : '.')) + '</div>';
    }
    var rs = step.reasons.slice(0, 4);
    if (rs.length) {
      html += '<div class="dr-reasons">' + rs.map(function (r) {
        var mark = r.type === 'good' ? '+ ' : r.type === 'bad' ? '− ' : '';
        return mark + esc(r.text);
      }).join('<br>') + '</div>';
    }
    if (step.grade !== 'S' && alts.length && alts[0].s > step.score + 4) {
      html += '<div class="dr-alts"><div class="alt-label">Сильнее в тот момент были бы:</div>' +
        alts.map(function (a) {
          return '<span class="dr-alt" onclick="openHero(' + a.h.id + ')"><img src="' + imgUrl(a.h.slug) + '">' + esc(ruName(a.h)) + '</span>';
        }).join('') + '</div>';
    } else {
      html += '<div class="dr-alts"><div class="alt-label">Это был один из лучших доступных пиков.</div></div>';
    }
    html += '</div>';
  });

  html += '</div><div class="dr-actions">' +
    '<button onclick="newDraft()">Сыграть ещё раз</button>' +
    '<button class="secondary" onclick="go(\'wiki\')">Изучить героев</button></div>';

  var el = document.getElementById('draft-result');
  el.innerHTML = html;
  el.classList.remove('hidden');
  el.scrollIntoView({ behavior: 'smooth' });
}

// ===== Рендеринг драфта =====
function renderDraft() {
  var d = state.draft;
  if (!d) return;
  var status = document.getElementById('draft-status');
  if (d.over) {
    status.innerHTML = 'Драфт завершён — смотри разбор ниже';
  } else if (d.waiting) {
    status.innerHTML = '<span class="turn-bot">Бот выбирает героя...</span>';
  } else {
    status.innerHTML = '<span class="turn-me">Твой ход</span> — пик ' + (d.my.length + 1) + ' из 5. Бот уже взял: <b>' + esc(ruName(d.enemy[d.enemy.length - 1])) + '</b>';
  }
  renderTeam('my-picks', d.my, d.history);
  renderTeam('enemy-picks', d.enemy, null);
  renderMeta('my-meta', d.my);
  renderMeta('enemy-meta', d.enemy);
  renderGrid();
  renderHints();
}

function renderTeam(elId, team, history) {
  var html = team.map(function (h, i) {
    var gradeHtml = '';
    if (history) {
      var step = history[i];
      if (step) gradeHtml = '<span class="grade grade-' + step.grade + ' pi-grade">' + step.grade + '</span>';
    }
    return '<div class="pick-item" onclick="openHero(' + h.id + ')">' +
      '<img src="' + imgUrl(h.slug) + '" alt="">' +
      '<div><div class="pi-name">' + esc(ruName(h)) + '</div>' +
      '<div class="pi-pos">поз. ' + heroPositions(h).join('/') + '</div></div>' + gradeHtml + '</div>';
  }).join('');
  for (var i = team.length; i < 5; i++) html += '<div class="pick-slot-empty">пик ' + (i + 1) + '</div>';
  document.getElementById(elId).innerHTML = html;
}

function renderMeta(elId, team) {
  if (!team.length) { document.getElementById(elId).innerHTML = ''; return; }
  var phys = 0, magic = 0, mixed = 0;
  team.forEach(function (h) { var d = heroDamage(h); if (d === 'phys') phys++; else if (d === 'magic') magic++; else mixed++; });
  var dis = team.filter(function (h) { return hasTag(h, 'disabler'); }).length;
  var ini = team.filter(function (h) { return hasTag(h, 'initiator'); }).length;
  document.getElementById(elId).innerHTML =
    'Урон: физ ' + phys + ' / маг ' + magic + ' / смеш ' + mixed + '<br>' +
    'Контроль: ' + dis + ' · Инициация: ' + ini;
}

function setAttrFilter(btn) {
  state.attrFilter = btn.dataset.attr;
  document.querySelectorAll('#attr-filters .attr-f').forEach(function (b) { b.classList.remove('active'); });
  btn.classList.add('active');
  renderGrid();
}

function filterHeroes(query, attr) {
  var q = (query || '').toLowerCase().trim();
  return HEROES.filter(function (h) {
    if (attr !== 'all-attrs' && h.attr !== attr) return false;
    if (!q) return true;
    var kb = KB[h.id];
    return h.name.toLowerCase().indexOf(q) >= 0 ||
      h.slug.indexOf(q) >= 0 ||
      (kb && kb.name_ru && kb.name_ru.toLowerCase().indexOf(q) >= 0);
  });
}

function renderGrid() {
  var d = state.draft;
  var q = document.getElementById('search').value;
  var heroes = filterHeroes(q, state.attrFilter);
  var recIds = {};
  if (d && !d.over && !d.waiting && document.getElementById('hints-toggle').checked) {
    recommendations().forEach(function (r) { recIds[r.h.id] = true; });
  }
  document.getElementById('hero-grid').innerHTML = heroes.map(function (h) {
    var cls = 'hg-item' + (isTaken(h.id) ? ' taken' : '') + (recIds[h.id] ? ' recommended' : '');
    return '<div class="' + cls + '" onclick="playerPick(' + h.id + ')" title="' + esc(h.name) + '">' +
      '<span class="hg-attr attr-dot-' + h.attr + '"></span>' +
      '<img loading="lazy" src="' + imgUrl(h.slug) + '" alt="">' +
      '<div class="hg-name">' + esc(ruName(h)) + '</div></div>';
  }).join('');
}

function recommendations() {
  var d = state.draft;
  if (!d || d.over) return [];
  return availableHeroes()
    .map(function (h) { return { h: h, r: scorePick(h, d.my, d.enemy, false) }; })
    .sort(function (a, b) { return b.r.score - a.r.score; })
    .slice(0, 5);
}

function renderHints() {
  var d = state.draft;
  var body = document.getElementById('hints-body');
  if (!document.getElementById('hints-toggle').checked) {
    body.innerHTML = '<div class="hint-off-note">Подсказки выключены — думай сам, как в настоящем матче.</div>';
    renderGrid();
    return;
  }
  if (!d || d.over) { body.innerHTML = ''; return; }
  if (d.waiting) { body.innerHTML = '<div class="hint-off-note">Ждём пик бота...</div>'; return; }
  var recs = recommendations();
  body.innerHTML = recs.map(function (rec) {
    var top = rec.r.reasons.filter(function (r) { return r.type === 'good'; }).slice(0, 1);
    var why = top.length ? top[0].text : 'Ровный, безопасный пик под текущую ситуацию.';
    if (why.length > 110) why = why.slice(0, 107) + '...';
    return '<div class="hint-item" onclick="playerPick(' + rec.h.id + ')">' +
      '<img src="' + imgUrl(rec.h.slug) + '" alt="">' +
      '<div><div class="h-name">' + esc(ruName(rec.h)) + ' <span class="grade grade-' + rec.r.grade + '" style="width:20px;height:20px;font-size:12px">' + rec.r.grade + '</span></div>' +
      '<div class="h-why">' + esc(why) + '</div></div></div>';
  }).join('');
  renderGrid();
}

// ===== Энциклопедия =====
function setWikiAttrFilter(btn) {
  state.wikiAttrFilter = btn.dataset.attr;
  document.querySelectorAll('#wiki-attr-filters .attr-f').forEach(function (b) { b.classList.remove('active'); });
  btn.classList.add('active');
  renderWiki();
}

function renderWiki() {
  var q = document.getElementById('wiki-search').value;
  var pos = parseInt(document.getElementById('wiki-pos').value, 10);
  var heroes = filterHeroes(q, state.wikiAttrFilter).filter(function (h) {
    if (!pos) return true;
    return heroPositions(h).indexOf(pos) >= 0;
  });
  document.getElementById('wiki-grid').innerHTML = heroes.map(function (h) {
    return '<div class="hg-item" onclick="openHero(' + h.id + ')" title="' + esc(h.name) + '">' +
      '<span class="hg-attr attr-dot-' + h.attr + '"></span>' +
      '<img loading="lazy" src="' + imgUrl(h.slug) + '" alt="">' +
      '<div class="hg-name">' + esc(ruName(h)) + '</div></div>';
  }).join('');
}

var DIFF_LABEL = { 1: 'для новичка', 2: 'средняя сложность', 3: 'сложный герой' };
var PHASE_LABEL = { early: 'силён в начале игры', mid: 'силён в середине игры', late: 'силён в конце игры' };
var DMG_LABEL = { phys: 'физический урон', magic: 'магический урон', mixed: 'смешанный урон' };
var ATTR_COLOR = { str: '#f0642f', agi: '#3ddc66', int: '#38c6f4', all: '#c084fc' };
var ATTR_NAME = { str: 'Сила', agi: 'Ловкость', int: 'Интеллект', all: 'Универсал' };
var PHASE_SHORT = { early: 'Ранняя игра', mid: 'Середина', late: 'Поздняя игра' };
var PHASE_ORDER = { early: 0, mid: 1, late: 2 };

// План движения по карте: позиция героя × фаза игры. Языком новичка.
var MAP_PLAN = {
  1: {
    early: 'Стой на лёгкой линии (нижняя за Свет, верхняя за Тьму) с саппортом. Твоя работа — добивать крипов последним ударом: каждый крип — золото. В драки через всю карту не лезь: твоя смерть стоит команде дороже, чем чужое убийство.',
    mid: 'Линии развалились — уходи в лес и фарми лагеря между волнами крипов. Подключайся к дракам, только если они на твоей половине карты или есть верное убийство. Пропали с карты все пятеро врагов — отойди к своей вышке.',
    late: 'Теперь ты — главная сила команды. Двигайся вместе со всеми и не умирай в одиночку: твоя смерть — это потерянный Рошан или трон. Заходи в драку вторым, когда враги уже потратили станы.'
  },
  2: {
    early: 'Твоя линия — центральная, один на один. Добивай крипов и денай своих (не давай добивать врагу). Каждые две минуты проверяй руны на реке: бутылка плюс руна — твоё преимущество. Выиграл размен — дави, проигрываешь — играй от вышки.',
    mid: 'Ты — двигатель команды. С 8–12 минуты начинай ходить на боковые линии (это называется ганг) и устраивать драки два на одного. Забирай руны, после удачного ганга снеси вышку. Чем активнее ты сейчас, тем легче всей команде.',
    late: 'Твоё личное преимущество постепенно тает — играй с командой. Начинай драки своими заклинаниями или береги их для вражеского керри. Один на один с раскачанным керри врага не разменивайся.'
  },
  3: {
    early: 'Твоя линия — сложная (верхняя за Свет, нижняя за Тьму), против тебя двое или трое. Задача — не умирать и забирать опыт: стой в радиусе опыта, добивай что достаётся. Размен «я погиб, но их керри не фармил» — в твою пользу.',
    mid: 'Ты — заводила драк. Собери предмет для входа (Blink Dagger, Force Staff) и начинай бой первым: впитывай урон и держи врагов, пока твои керри и маги наносят урон. Ходи с командой, дави вышки.',
    late: 'Заходи в драку первым и принимай удар на себя — для этого ты и нужен. Береги вход (Blink) для ключевой цели. Между драками держись с командой: разбредаться по карте в поздней игре смертельно.'
  },
  4: {
    early: 'Ты на сложной линии помогаешь оффлейнеру или бродишь между линиями. Ставь варды (обзор), дёргай врагов, сходи в центр отнести руну миду. Крипов не добивай — золото линии нужно не тебе.',
    mid: 'Твоя самая активная фаза: ходи с мидером на ганги, ставь варды на половине врага, стакай лагеря для керри. Покупай командные предметы: пыль против невидимок, Glimmer Cape, Force Staff.',
    late: 'Держись за спинами команды — ты умираешь с двух ударов. Твоя ценность — контроль и спасающие предметы в нужную секунду. Перед дракой дай команде обзор, после драки переставь варды глубже.'
  },
  5: {
    early: 'Ты живёшь ради керри: стой с ним на лёгкой линии, оттягивай крипов в лес (пулл), мешай вражескому оффлейнеру, лечи и защищай. Варды — твоя обязанность. Крипов не добивай вообще — всё золото керри.',
    mid: 'Переключайся на команду: варды по всей карте, спасай тех, кого поймали, участвуй во всех драках. Денег мало — трать с умом: пыль, Smoke of Deceit для внезапных нападений, Glimmer Cape.',
    late: 'Ты — самый хрупкий в команде, но твой контроль и спасение решают драки. Стой сзади, береги заклинания для вражеского керри или для спасения своего. Держи золото на выкуп (buyback) — это страховка всей команды.'
  }
};

// Почему у героя подсвечена именно эта фаза. Без имени-подлежащего:
// произвольные имена не склоняются и не имеют известного рода.
function phaseWhy(h, kb) {
  var t = heroTraits(h);
  if (kb.phase === 'early') {
    return 'Сильная фаза — самое начало игры: ' +
      (t.spellReliant || hasTag(h, 'nuker') ? 'заклинания бьют в полную силу уже на ранних уровнях, пока у врагов мало здоровья и защиты.' : 'этот герой давит на линии, не нуждаясь в дорогих предметах.') +
      ' Преимущество тает со временем — реализуй его: дерись, помогай команде, не отсиживайся.';
  }
  if (kb.phase === 'mid') {
    return 'Сильная фаза — середина игры: к 15–25 минуте собраны ключевые предметы и прокачан ультимейт, а враги ещё не накопили защиту. В это окно решается исход драк — играй максимально активно.';
  }
  return 'Сильная фаза — поздняя игра: ' +
    (t.attackReliant ? 'с каждым предметом автоатаки всё страшнее, и к 35+ минуте этого героя почти не остановить.' : 'с полным набором предметов герой выходит на пик силы.') +
    ' Задача — спокойно дожить до своего времени.';
}

function phaseNote(h, kb, phase) {
  if (phase === kb.phase) return phaseWhy(h, kb);
  if (PHASE_ORDER[kb.phase] > PHASE_ORDER[phase]) {
    return 'Это ещё не сильная фаза этого героя — время подготовки. Пережить её, накопить золото и опыт, не отдавать врагу лёгкие убийства.';
  }
  return 'Пик силы уже позади — с каждой минутой враги догоняют. Преимущество надо реализовывать раньше: затягивать игру этому герою невыгодно.';
}

function phaseItems(kb, phase) {
  var it = kb.items || {};
  if (phase === 'early') return { label: 'Что покупать', list: (it.start || []).concat(it.early || []) };
  if (phase === 'mid') return { label: 'Что покупать', list: it.core || [] };
  return { label: 'Что докупать по ситуации', list: it.situational || [] };
}

// Панель фазы на карточке героя: почему фаза сильная/слабая, закупка, движение по карте.
function showPhase(heroId, phase) {
  var h = byId[heroId], kb = KB[heroId];
  if (!h || !kb) return;
  var bar = document.getElementById('phase-bar');
  var panel = document.getElementById('phase-panel');
  if (!bar || !panel) return;
  bar.innerHTML = ['early', 'mid', 'late'].map(function (p) {
    var cls = 'phase-seg' + (kb.phase === p ? ' on' : '') + (phase === p ? ' sel' : '');
    var title = kb.phase === p ? 'сильная фаза героя' : 'нажми — план на эту фазу';
    return '<div class="' + cls + '" onclick="showPhase(' + heroId + ',\'' + p + '\')" title="' + title + '"><span>' + PHASE_SHORT[p] + (kb.phase === p ? ' ★' : '') + '</span></div>';
  }).join('');

  var html = '<div class="pp-why' + (phase === kb.phase ? ' pp-strong' : '') + '">' + esc(phaseNote(h, kb, phase)) + '</div>';
  var items = phaseItems(kb, phase);
  if (items.list.length) {
    html += '<div class="pp-row"><div class="pp-label">' + items.label + '</div><div class="pp-items">' +
      items.list.map(function (it) { return '<span class="item-chip">' + esc(it) + '</span>'; }).join('') + '</div></div>';
  }
  var pos = heroPositions(h)[0];
  var plan = (MAP_PLAN[pos] || MAP_PLAN[2])[phase];
  html += '<div class="pp-row"><div class="pp-label">Как двигаться по карте — ты ' + esc(POS_NAMES[pos]) + '</div><div class="pp-text">' + esc(plan) + '</div></div>';
  panel.innerHTML = html;
}

function findByName(name) {
  for (var i = 0; i < HEROES.length; i++) if (HEROES[i].name === name) return HEROES[i];
  return null;
}

// Винрейт пары a против b в процентах, null если статистики нет
function pairWinrate(aId, bId) {
  if (typeof MATCHUPS === 'undefined') return null;
  var m = MATCHUPS[aId];
  if (m && typeof m[bId] === 'number') return 50 + m[bId] * 100;
  var r = MATCHUPS[bId];
  if (r && typeof r[aId] === 'number') return 50 - r[aId] * 100;
  return null;
}

// Средний винрейт героя по всем парам — «сила в мете»
function metaWinrate(id) {
  if (typeof MATCHUPS === 'undefined' || !MATCHUPS[id]) return null;
  var vals = [];
  for (var k in MATCHUPS[id]) vals.push(MATCHUPS[id][k]);
  if (!vals.length) return null;
  var sum = 0;
  vals.forEach(function (v) { sum += v; });
  return 50 + (sum / vals.length) * 100;
}

// SVG-кольцо с процентом в центре. Окружность r=15.9155 даёт длину ровно 100.
function ringSvg(pct, color, sub, big) {
  var shown = Math.max(2, Math.min(98, pct));
  var cls = big ? 'ring ring-big' : 'ring';
  return '<div class="' + cls + '">' +
    '<svg viewBox="0 0 36 36">' +
    '<circle class="ring-track" cx="18" cy="18" r="15.9155"></circle>' +
    '<circle class="ring-glow" cx="18" cy="18" r="15.9155" stroke="' + color + '" stroke-dasharray="' + shown.toFixed(1) + ' 100"></circle>' +
    '<circle class="ring-fill" cx="18" cy="18" r="15.9155" stroke="' + color + '" stroke-dasharray="' + shown.toFixed(1) + ' 100"></circle>' +
    '<text x="18" y="19.6" class="ring-text">' + pct.toFixed(big ? 1 : 0) + '%</text>' +
    '</svg>' +
    (sub ? '<div class="ring-sub">' + esc(sub) + '</div>' : '') +
    '</div>';
}

function diffDiamonds(level) {
  var out = '';
  for (var i = 1; i <= 3; i++) out += '<span class="diff-d' + (i <= level ? ' on' : '') + '"></span>';
  return '<span class="diff-row" title="' + esc(DIFF_LABEL[level] || '') + '">' + out + '</span>';
}

function abilityKey(i, total) {
  if (total <= 4) return ['Q', 'W', 'E', 'R'][i] || '';
  if (total === 5) return ['Q', 'W', 'E', 'D', 'R'][i] || '';
  return ['Q', 'W', 'E', 'D', 'F', 'R'][i] || '';
}

function vsRows(list, heroId, noRing) {
  return (list || []).map(function (c) {
    var h = findByName(c.hero);
    if (!h) return '';
    var wr = noRing ? null : pairWinrate(heroId, h.id);
    var ringHtml = '';
    if (wr !== null) {
      var col = wr >= 50 ? 'var(--green)' : 'var(--red)';
      ringHtml = ringSvg(wr, col, '', false);
    }
    return '<div class="vs-row" onclick="openHero(' + h.id + ')">' +
      '<img src="' + imgUrl(h.slug) + '" alt="">' +
      '<div class="vs-body"><div class="vs-name">' + esc(ruName(h)) + ' <span class="vs-en">' + esc(h.name) + '</span></div>' +
      '<div class="vs-why">' + esc(c.why) + '</div></div>' +
      (ringHtml ? '<div class="vs-ring" title="винрейт пары по статистике OpenDota">' + ringHtml + '</div>' : '') +
      '</div>';
  }).join('');
}

function openHero(id) {
  var h = byId[id];
  var kb = KB[id];
  var ac = ATTR_COLOR[h.attr] || '#f0b952';
  var img = imgUrl(h.slug);
  var meta = metaWinrate(id);

  var html = '<button class="mc-close" onclick="closeModal()">✕</button>';

  // Баннер в атрибутном цвете: размытый портрет фоном, чёткий слева, кольцо меты справа
  html += '<div class="mc2-banner" style="--ac:' + ac + '">' +
    '<img class="mc2-bg" src="' + img + '" alt="" aria-hidden="true">' +
    '<div class="mc2-banner-in">' +
    '<img class="mc2-portrait" src="' + img + '" alt="">' +
    '<div class="mc2-title">' +
    '<div class="mc2-attr-row"><span class="attr-pill"><span class="attr-dot"></span>' + esc(ATTR_NAME[h.attr] || h.attr) + '</span>' +
    (kb ? diffDiamonds(kb.difficulty) : '') + '</div>' +
    '<h2>' + esc(kb ? kb.name_ru : h.name) + '</h2>' +
    '<div class="mc2-en">' + esc(h.name) + '</div>' +
    '<div class="mc2-badges">' +
    (kb
      ? '<span class="badge">позиции ' + kb.positions.join(' / ') + '</span>' +
        '<span class="badge">' + esc(DMG_LABEL[kb.damage] || kb.damage) + '</span>' +
        '<span class="badge">' + esc(PHASE_SHORT[kb.phase] || kb.phase) + '</span>'
      : '<span class="badge">' + esc(h.roles) + '</span>') +
    '</div></div>' +
    (meta !== null ? '<div class="mc2-meta">' + ringSvg(meta, meta >= 50 ? 'var(--green)' : 'var(--red)', 'винрейт в мете', true) + '</div>' : '') +
    '</div></div>';

  html += '<div class="mc2-summary">' + esc(kb ? kb.summary : 'Подробная карточка для этого героя ещё готовится.') + '</div>';

  if (kb) {
    // Фазы игры: кликабельные сегменты + панель «план на фазу» (закупка, движение по карте, почему фаза сильная)
    html += '<div class="mc-section phase-section" style="--ac:' + ac + '">' +
      '<div class="phase-bar phase-bar-click" id="phase-bar"></div>' +
      '<div class="phase-panel" id="phase-panel"></div></div>';

    var abTotal = (kb.abilities || []).length;
    html += '<div class="mc-section"><h3>Способности</h3>' + (kb.abilities || []).map(function (a, i) {
      return '<div class="ability"><span class="ab-key" style="--ac:' + ac + '">' + abilityKey(i, abTotal) + '</span>' +
        '<div><div class="ab-name">' + esc(a.name) + ' <span class="ab-ru">' + esc(a.name_ru) + '</span></div>' +
        '<div class="ab-tip">' + esc(a.tip) + '</div></div></div>';
    }).join('') + '</div>';

    if (kb.skill_build) {
      html += '<div class="mc-section"><h3>Прокачка скиллов</h3><div class="skill-order">' +
        esc(kb.skill_build.order).split(/\s+/).map(function (k) { return '<span class="so-key">' + k + '</span>'; }).join('') +
        '</div><div class="mc-note">' + esc(kb.skill_build.why) + '</div></div>';
    }
    if (kb.items) {
      html += '<div class="mc-section"><h3>Предметы</h3><div class="items-line" style="--ac:' + ac + '">';
      [['start', 'Старт'], ['early', 'Ранняя игра'], ['core', 'Основа'], ['situational', 'По ситуации']].forEach(function (st) {
        var arr = kb.items[st[0]] || [];
        if (arr.length) {
          html += '<div class="items-stage"><div class="is-label">' + st[1] + '</div><div class="is-items">' +
            arr.map(function (it) { return '<span class="item-chip">' + esc(it) + '</span>'; }).join('') + '</div></div>';
        }
      });
      html += '</div>';
      if (kb.items.why) html += '<div class="mc-note">' + esc(kb.items.why) + '</div>';
      html += '</div>';
    }
    if (kb.strong_against && kb.strong_against.length) {
      html += '<div class="mc-section"><h3 class="h-good">Силён против</h3>' + vsRows(kb.strong_against, id) + '</div>';
    }
    if (kb.weak_against && kb.weak_against.length) {
      html += '<div class="mc-section"><h3 class="h-bad">Опасны для него</h3>' + vsRows(kb.weak_against, id) + '</div>';
    }
    if (kb.synergy && kb.synergy.length) {
      html += '<div class="mc-section"><h3>Хорошие союзники</h3>' + vsRows(kb.synergy, id, true) + '</div>';
    }
    if (kb.newbie_tips && kb.newbie_tips.length) {
      html += '<div class="mc-section"><h3>Советы новичку</h3><ul class="tips-list">' + kb.newbie_tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>';
    }
  } else {
    html += '<div class="mc-section"><div class="kb-missing">База знаний по этому герою сейчас готовится. Уже доступны роли: ' + esc(h.roles) + '</div></div>';
  }

  document.getElementById('modal-card').innerHTML = html;
  if (kb) showPhase(id, kb.phase);
  document.getElementById('hero-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('hero-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

// ===== Навигация =====
function go(screen) {
  ['home', 'draft', 'wiki'].forEach(function (s) {
    document.getElementById('screen-' + s).classList.toggle('hidden', s !== screen);
  });
  document.querySelectorAll('.nav-btn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.nav === screen);
  });
  closeModal();
  if (screen === 'draft' && !state.draft) newDraft();
  if (screen === 'wiki') renderWiki();
  window.scrollTo(0, 0);
}

// ===== Старт =====
(function init() {
  var kbCount = Object.keys(KB).length;
  var muCount = typeof MATCHUPS !== 'undefined' ? Object.keys(MATCHUPS).length : 0;
  document.getElementById('home-stats').textContent =
    'В базе: ' + HEROES.length + ' героев · статистика матчапов по ' + muCount +
    ' героям (OpenDota) · подробные карточки: ' + kbCount + ' героев';
  // Прямая ссылка на героя: #hero-<id> открывает его карточку в энциклопедии
  var m = (window.location.hash || '').match(/^#hero-(\d+)$/);
  if (m && byId[+m[1]]) {
    go('wiki');
    openHero(+m[1]);
  }
})();
