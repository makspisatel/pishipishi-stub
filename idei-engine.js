// Движок генераторов идей «Пиши. Пиши!». Без сети и без ИИ: только списки из idei-data.js.
// Все функции чистые: состояние на входе — новое состояние на выходе. rnd подменяется в тестах.

var IdeiEngine = (function () {
  var D = typeof IDEI_DATA !== 'undefined' ? IDEI_DATA : require('./idei-data.js')

  var LOGLINE_SHORT = ['hero', 'flaw', 'event', 'goal', 'stakes']
  var LOGLINE_FULL = ['hero', 'flaw', 'event', 'goal', 'deadline', 'obstacle', 'helper', 'stakes']
  var LIST = { hero: 'heroes', flaw: 'flaws', event: 'events', goal: 'goals', stakes: 'stakes',
    deadline: 'deadlines', obstacle: 'obstacles', helper: 'helpers' }
  // Барабаны, у частей которых есть метки для иронии.
  var IRONIC = ['event', 'goal', 'obstacle']

  function pickWeighted(items, weightOf, rnd) {
    var total = 0
    for (var i = 0; i < items.length; i++) total += weightOf(items[i])
    var x = rnd() * total
    for (var j = 0; j < items.length; j++) {
      x -= weightOf(items[j])
      if (x < 0) return items[j]
    }
    return items[items.length - 1]
  }

  // Части барабана, подходящие жанру. Герои — исключение: ими можно играть через жанры
  // (своих больше, чужие реже), а событие, цель и остальное должны жанру подходить.
  function weightFor(barrel, item, genre) {
    var g = item.g || []
    if (genre === 'any') return 1
    if (g.indexOf(genre) >= 0) return 3
    if (g.length === 0) return 2
    return barrel === 'hero' ? 1 : 0
  }

  function candidates(barrel, genre) {
    return D[LIST[barrel]].filter(function (it) { return weightFor(barrel, it, genre) > 0 })
  }

  function pick(barrel, genre, rnd, avoid, filter) {
    var list = candidates(barrel, genre)
    if (filter) list = list.filter(filter)
    if (!list.length) return null
    if (avoid && list.length > 1) list = list.filter(function (it) { return it !== avoid })
    return pickWeighted(list, function (it) { return weightFor(barrel, it, genre) }, rnd)
  }

  function shares(a, b) {
    var ta = a.t || [], tb = b.t || []
    for (var i = 0; i < ta.length; i++) if (tb.indexOf(ta[i]) >= 0) return true
    return false
  }

  // state: { parts: {barrel: item}, locks: {barrel: true} }
  // opts: { genre, irony, full }
  function spinLogline(state, opts, rnd) {
    rnd = rnd || Math.random
    var genre = opts.genre || 'any'
    var barrels = opts.full ? LOGLINE_FULL : LOGLINE_SHORT
    var prev = (state && state.parts) || {}
    var locks = (state && state.locks) || {}
    var parts = {}
    var free = function (b) { return !locks[b] || !prev[b] }
    barrels.forEach(function (b) { if (!free(b)) parts[b] = prev[b] })

    if (free('hero')) parts.hero = pick('hero', genre, rnd, prev.hero)

    if (opts.irony) {
      var ironic = IRONIC.filter(function (b) { return barrels.indexOf(b) >= 0 })
      var open = ironic.filter(free)
      if (!free('flaw')) {
        // Изъян закреплён: ирония подбирает под него одно из открытых событий, целей, препятствий.
        var tries = open.slice()
        while (tries.length) {
          var k = Math.floor(rnd() * tries.length)
          var b = tries.splice(k, 1)[0]
          var hit = pick(b, genre, rnd, null, function (it) { return shares(it, parts.flaw) })
          if (hit) { parts[b] = hit; break }
        }
      } else {
        var fixed = ironic.filter(function (b) { return !free(b) })
        var fixedTagged = fixed.filter(function (b) { return (parts[b].t || []).length })
        if (fixedTagged.length) {
          // Что-то с меткой закреплено: подбираем изъян под него.
          var anchor = parts[fixedTagged[Math.floor(rnd() * fixedTagged.length)]]
          parts.flaw = pick('flaw', genre, rnd, prev.flaw, function (f) { return shares(f, anchor) })
        } else {
          // Ничего не закреплено: случайная пара «изъян — часть с той же меткой».
          var pairs = []
          open.forEach(function (b) {
            candidates(b, genre).forEach(function (it) {
              D.flaws.forEach(function (f) { if (shares(f, it)) pairs.push({ b: b, it: it, f: f }) })
            })
          })
          if (pairs.length) {
            var p = pairs[Math.floor(rnd() * pairs.length)]
            parts.flaw = p.f
            parts[p.b] = p.it
          }
        }
      }
    }

    barrels.forEach(function (b) { if (!parts[b]) parts[b] = pick(b, genre, rnd, prev[b]) })
    return { parts: parts, locks: locks }
  }

  function form(item, r) { return item.s != null ? item.s : item[r] }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1) }
  // После героя с придаточным («мальчик, который…») нужна закрывающая запятая.
  function heroTail(s) { return s.indexOf(',') >= 0 ? ',' : '' }
  // Придаточное в конце фрагмента закрывается запятой перед тире или обстоятельством.
  var SUB = /,\s*(котор|где|кто|что|чьё|чья|чей|когда|пока|чтобы|о которой|с которым|из которой)/
  function closes(s) { return SUB.test(s) }

  function renderLogline(parts, full) {
    var r = parts.hero.r
    var must = r === 'f' ? 'должна' : 'должен'
    var head = cap(form(parts.flaw, r) + ' ' + parts.hero.s) + heroTail(parts.hero.s) + ' ' +
      form(parts.event, r) + (closes(form(parts.event, r)) ? ',' : '') + ' — и теперь ' + must + ' ' + form(parts.goal, r)
    if (!full) return head + ', иначе ' + parts.stakes.s + '.'
    var dl = parts.deadline.s
    var sep = closes(form(parts.goal, r)) || dl.indexOf('пока') === 0 ? ', ' : ' '
    return head + sep + dl + '. Но ' + parts.obstacle.s +
      ', и помочь может только ' + parts.helper.s + '. Иначе ' + parts.stakes.s + '.'
  }

  // Хайконцепт: три произведения, у каждого своя роль. Жанра нет — чистое веселье.
  // state: { works: [a, b, c], locks: [bool, bool, bool], extra: { foe: i, item: i } }
  // Порядок ролей: [0] — герой, [1] — путь, [2] — мир. «Перемешать роли» переставляет произведения.
  function spinHC(state, rnd) {
    rnd = rnd || Math.random
    var prev = (state && state.works) || []
    var locks = (state && state.locks) || [false, false, false]
    var works = [null, null, null]
    var used = []
    for (var i = 0; i < 3; i++) if (locks[i] && prev[i]) { works[i] = prev[i]; used.push(prev[i]) }
    for (var j = 0; j < 3; j++) {
      if (works[j]) continue
      var pool = D.works.filter(function (w) { return used.indexOf(w) < 0 && w !== prev[j] })
      if (!pool.length) pool = D.works.filter(function (w) { return used.indexOf(w) < 0 })
      works[j] = pool[Math.floor(rnd() * pool.length)]
      used.push(works[j])
    }
    return { works: works, locks: locks,
      extra: { foe: Math.floor(rnd() * 3), item: Math.floor(rnd() * 3) } }
  }

  function shuffleRoles(state, rnd) {
    rnd = rnd || Math.random
    var w = state.works.slice(), l = state.locks.slice()
    var idx = [0, 1, 2]
    // Перестановка без «осталось как было».
    do {
      for (var i = 2; i > 0; i--) { var k = Math.floor(rnd() * (i + 1)); var t = idx[i]; idx[i] = idx[k]; idx[k] = t }
    } while (idx[0] === 0 && idx[1] === 1 && idx[2] === 2)
    return { works: idx.map(function (i) { return w[i] }), locks: idx.map(function (i) { return l[i] }), extra: state.extra }
  }

  function renderHC(state, opts) {
    var a = state.works[0], b = state.works[1], c = state.works[2]
    var hero = a.hero
    var title = '«' + a.n + '» встречает ' + b.acc + ' в мире «' + c.n + '»'
    var text = cap(hero.s) + heroTail(hero.s) + ' ' + (hero.r === 'f' ? 'должна' : 'должен') +
      ' ' + b.path + (closes(b.path) ? ',' : '') + ' — ' + c.world + '.'
    var extras = []
    if (opts && opts.foe) {
      var fw = state.works[state.extra.foe]
      extras.push('Против — ' + fw.foe + ' («' + fw.n + '»).')
    }
    if (opts && opts.item) {
      var iw = state.works[state.extra.item]
      extras.push('Ключ ко всему — ' + iw.item + ' («' + iw.n + '»).')
    }
    var roles = { hero: a.n, path: b.n, world: c.n }
    return { title: title, text: [text].concat(extras).join(' '), roles: roles }
  }

  function shipLine(rnd) {
    rnd = rnd || Math.random
    return D.ship[Math.floor(rnd() * D.ship.length)]
  }

  return {
    LOGLINE_SHORT: LOGLINE_SHORT, LOGLINE_FULL: LOGLINE_FULL,
    spinLogline: spinLogline, renderLogline: renderLogline,
    spinHC: spinHC, shuffleRoles: shuffleRoles, renderHC: renderHC,
    shipLine: shipLine, form: form, shares: shares, data: D,
  }
})()

if (typeof module !== 'undefined') module.exports = IdeiEngine
