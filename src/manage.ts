import JSZip from 'jszip'
import type { SqlValue } from 'sql.js'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { getAllDecks, saveDeck, deleteDeck, getActiveDeckId, setActiveDeckId, addCard, deleteCard, updateCard } from './store'
import type { Card, Deck } from './types'

function newCard(front: string, back: string): Card {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    front, back,
    interval: 1, repetitions: 0, easeFactor: 2.5,
    dueDate: '2020-01-01T00:00:00.000Z',
  }
}

function isDue(card: Card): boolean {
  return new Date(card.dueDate) <= new Date()
}

// ── parsers ──────────────────────────────────────────────

function parseJson(text: string): Deck {
  const d = JSON.parse(text)
  if (!d.name || !Array.isArray(d.cards)) throw new Error('Invalid JSON format')
  return d as Deck
}

function parseCsv(text: string, name: string): Deck {
  const lines = text.trim().split(/\r?\n/)
  const header = lines[0].split(',').map(h => h.trim().toLowerCase())
  const fi = header.indexOf('front'), bi = header.indexOf('back')
  if (fi === -1 || bi === -1) throw new Error('CSV requires front/back columns')
  const cards = lines.slice(1).filter(l => l.trim()).map(line => {
    const cols = line.match(/("(?:[^"]|"")*"|[^,]*)/g)
      ?.map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"')) ?? line.split(',')
    return newCard(cols[fi]?.trim() ?? '', cols[bi]?.trim() ?? '')
  })
  return { name, cards }
}

async function parseApkg(file: File): Promise<Deck> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const dbFile = zip.file('collection.anki2') ?? zip.file('collection.anki21')
  if (!dbFile) throw new Error('Invalid .apkg file')
  const dbData = await dbFile.async('arraybuffer')
  const initSqlJs = (await import('sql.js')).default
  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl })
  const db = new SQL.Database(new Uint8Array(dbData))
  const result = db.exec('SELECT flds FROM notes')
  db.close()
  if (!result[0]) return { name: file.name.replace('.apkg', ''), cards: [] }
  const cards = result[0].values.map((row: SqlValue[]) => {
    const parts = (row[0] as string).split('\x1f')
    return newCard(stripHtml(parts[0] ?? ''), stripHtml(parts[1] ?? ''))
  })
  return { name: file.name.replace('.apkg', ''), cards }
}

function stripHtml(s: string) {
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── state ─────────────────────────────────────────────────

let currentDeckId: string | null = null
let searchQuery = ''
let cardPage = 0
const PAGE = 40

// ── bottom sheet ─────────────────────────────────────────

function sheet(html: string, onMount?: (el: HTMLElement) => void) {
  const wrap = document.createElement('div')
  wrap.className = 'mg-sheet-wrap'
  wrap.innerHTML = `<div class="mg-sheet">${html}</div>`
  document.body.appendChild(wrap)
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove() })
  if (onMount) onMount(wrap.querySelector('.mg-sheet')!)
  return wrap
}

// ── add deck sheet ────────────────────────────────────────

function openAddDeck(onDone: () => void) {
  sheet(`
    <div class="mg-sh-header">
      <span>ADD DECK</span>
      <button class="mg-sh-close">✕</button>
    </div>
    <div class="mg-sh-tabs">
      <button class="mg-sh-tab active" data-t="file">FILE</button>
      <button class="mg-sh-tab" data-t="empty">EMPTY</button>
    </div>
    <div data-p="file">
      <input type="file" accept="*/*" id="mg-fi" style="position:absolute;opacity:0;width:0;height:0">
      <label class="mg-drop" for="mg-fi">
        <span id="mg-drop-label">JSON / CSV / APKG</span>
      </label>
      <p id="mg-fstatus" class="mg-hint"></p>
      <button class="mg-sh-btn" id="mg-import" disabled>IMPORT</button>
    </div>
    <div data-p="empty" hidden>
      <input type="text" class="mg-input" id="mg-dname" placeholder="Deck name">
      <button class="mg-sh-btn" id="mg-create">CREATE</button>
    </div>
  `, el => {
    el.querySelector('.mg-sh-close')!.addEventListener('click', () => el.closest('.mg-sheet-wrap')!.remove())
    el.querySelectorAll('.mg-sh-tab').forEach(t => t.addEventListener('click', () => {
      el.querySelectorAll('.mg-sh-tab').forEach(x => x.classList.remove('active'))
      t.classList.add('active')
      const target = (t as HTMLElement).dataset.t!
      el.querySelectorAll('[data-p]').forEach(p => {
        (p as HTMLElement).hidden = (p as HTMLElement).dataset.p !== target
      })
    }))

    let parsed: Deck | null = null
    const fi = el.querySelector<HTMLInputElement>('#mg-fi')!
    const status = el.querySelector<HTMLElement>('#mg-fstatus')!
    const importBtn = el.querySelector<HTMLButtonElement>('#mg-import')!
    const dropLabel = el.querySelector<HTMLElement>('#mg-drop-label')!

    fi.addEventListener('change', async () => {
      const file = fi.files?.[0]; if (!file) return
      dropLabel.textContent = file.name
      status.textContent = 'Parsing...'
      importBtn.disabled = true; parsed = null
      try {
        if (file.name.endsWith('.json')) parsed = parseJson(await file.text())
        else if (file.name.endsWith('.csv')) parsed = parseCsv(await file.text(), file.name.replace('.csv', ''))
        else parsed = await parseApkg(file)
        status.textContent = `✓  ${parsed.cards.length} cards`
        importBtn.disabled = false
      } catch (e) { status.textContent = `Error: ${(e as Error).message}` }
    })

    importBtn.addEventListener('click', () => {
      if (!parsed) return
      saveDeck(parsed.name, parsed); setActiveDeckId(parsed.name)
      currentDeckId = parsed.name
      el.closest('.mg-sheet-wrap')!.remove(); onDone()
    })

    el.querySelector('#mg-create')!.addEventListener('click', () => {
      const name = (el.querySelector<HTMLInputElement>('#mg-dname')!).value.trim()
      if (!name) return
      const d: Deck = { name, cards: [] }
      saveDeck(name, d); setActiveDeckId(name); currentDeckId = name
      el.closest('.mg-sheet-wrap')!.remove(); onDone()
    })
  })
}

// ── card edit sheet ───────────────────────────────────────

function openCardEdit(deckId: string, card: Card | null, onDone: () => void) {
  sheet(`
    <div class="mg-sh-header">
      <span>${card ? 'EDIT CARD' : 'ADD CARD'}</span>
      <button class="mg-sh-close">✕</button>
    </div>
    <label class="mg-label">FRONT</label>
    <textarea class="mg-input mg-ta" id="mg-front" rows="2">${card ? esc(card.front) : ''}</textarea>
    <label class="mg-label">BACK</label>
    <textarea class="mg-input mg-ta" id="mg-back" rows="2">${card ? esc(card.back) : ''}</textarea>
    ${card ? '<label class="mg-label mg-check"><input type="checkbox" id="mg-reset"> Reset progress</label>' : ''}
    <button class="mg-sh-btn" id="mg-save">SAVE</button>
  `, el => {
    el.querySelector('.mg-sh-close')!.addEventListener('click', () => el.closest('.mg-sheet-wrap')!.remove())
    el.querySelector('#mg-save')!.addEventListener('click', () => {
      const front = (el.querySelector<HTMLTextAreaElement>('#mg-front')!).value.trim()
      const back = (el.querySelector<HTMLTextAreaElement>('#mg-back')!).value.trim()
      if (!front || !back) return
      const decks = getAllDecks(); let deck = decks[deckId]; if (!deck) return
      if (card) {
        const reset = (el.querySelector<HTMLInputElement>('#mg-reset'))?.checked
        const updated = reset ? { ...newCard(front, back), id: card.id } : { ...card, front, back }
        deck = updateCard(deck, updated)
      } else {
        deck = addCard(deck, newCard(front, back))
      }
      saveDeck(deckId, deck)
      el.closest('.mg-sheet-wrap')!.remove(); onDone()
    })
  })
}

// ── main render ───────────────────────────────────────────

function renderAll(root: HTMLElement) {
  const decks = getAllDecks()
  const deckIds = Object.keys(decks)
  const activeId = getActiveDeckId()

  // decks section
  const deckSec = root.querySelector('#mg-decks')!
  deckSec.innerHTML = deckIds.length === 0
    ? '<p class="mg-empty">No decks</p>'
    : deckIds.map(id => {
        const d = decks[id]
        const due = d.cards.filter(isDue).length
        const active = id === activeId
        const finished = d.cards.length > 0 && due === 0
        return `<div class="mg-deck-row${active ? ' active' : ''}" data-deck="${esc(id)}">
          <div class="mg-deck-main">
            <span class="mg-deck-name">${esc(d.name)}${finished ? ' <span class="mg-done-mark">✓</span>' : ''}</span>
            <span class="mg-deck-stat">${d.cards.length} cards · ${due} due</span>
          </div>
          <div class="mg-row-actions">
            <button class="mg-pill" data-action="rename-deck" data-id="${esc(id)}">NAME</button>
            ${!active ? `<button class="mg-pill" data-action="select" data-id="${esc(id)}">USE</button>` : '<span class="mg-active-mark">●</span>'}
            <button class="mg-pill mg-pill-del" data-action="del-deck" data-id="${esc(id)}">DEL</button>
          </div>
        </div>`
      }).join('')

  // deck select in card section
  const sel = root.querySelector<HTMLSelectElement>('#mg-csel')!
  sel.innerHTML = deckIds.map(id => `<option value="${esc(id)}">${esc(decks[id].name)}</option>`).join('')
  if (currentDeckId && decks[currentDeckId]) sel.value = currentDeckId
  else if (deckIds.length > 0) { currentDeckId = deckIds[0]; sel.value = deckIds[0] }

  renderCards(root)
}

function renderCards(root: HTMLElement) {
  const list = root.querySelector('#mg-cards')!
  if (!currentDeckId) { list.innerHTML = '<p class="mg-empty">Select a deck</p>'; return }
  const deck = getAllDecks()[currentDeckId]
  if (!deck) { list.innerHTML = '<p class="mg-empty">Deck not found</p>'; return }

  const filtered = deck.cards.filter(c =>
    !searchQuery || c.front.includes(searchQuery) || c.back.includes(searchQuery)
  )
  const start = cardPage * PAGE
  const page = filtered.slice(start, start + PAGE)

  const paginationHtml = filtered.length > PAGE ? `
    <div class="mg-page">
      <button class="mg-pill" id="mg-prev" ${cardPage === 0 ? 'disabled' : ''}>←</button>
      <span>${cardPage + 1} / ${Math.ceil(filtered.length / PAGE)}</span>
      <button class="mg-pill" id="mg-next" ${start + PAGE >= filtered.length ? 'disabled' : ''}>→</button>
    </div>` : ''

  list.innerHTML = page.length === 0
    ? '<p class="mg-empty">No cards</p>'
    : page.map(c => `
      <div class="mg-card-row" data-card="${esc(c.id)}">
        <div class="mg-card-txt">
          <span class="mg-cf">${esc(c.front)}</span>
          <span class="mg-cb">${esc(c.back)}</span>
        </div>
        <div class="mg-row-actions">
          <span class="mg-due-dot ${isDue(c) ? 'due' : ''}"></span>
          <button class="mg-pill" data-action="edit-card" data-id="${esc(c.id)}">EDIT</button>
          <button class="mg-pill mg-pill-del" data-action="del-card" data-id="${esc(c.id)}">×</button>
        </div>
      </div>`).join('') + paginationHtml

  root.querySelector('#mg-prev')?.addEventListener('click', () => { cardPage--; renderCards(root) })
  root.querySelector('#mg-next')?.addEventListener('click', () => { cardPage++; renderCards(root) })
}

// ── build & mount ─────────────────────────────────────────

export function initManageUI() {
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.className = 'mg-root'
  root.innerHTML = `
    <header class="mg-top">
      <span class="mg-logo">EVEN ANKI</span>
      <button class="mg-top-btn" id="mg-reload">RELOAD G2</button>
    </header>

    <section class="mg-sec">
      <div class="mg-sec-hd">
        <span>DECKS</span>
        <button class="mg-pill" id="mg-add-deck">＋ ADD</button>
      </div>
      <div id="mg-decks"></div>
    </section>

    <section class="mg-sec">
      <div class="mg-sec-hd">
        <span>CARDS</span>
        <button class="mg-pill" id="mg-add-card">＋ ADD</button>
      </div>
      <div class="mg-card-ctrl">
        <select class="mg-input mg-sel" id="mg-csel"></select>
        <input class="mg-input" id="mg-search" placeholder="Search...">
      </div>
      <div id="mg-cards"></div>
    </section>
  `
  document.body.appendChild(root)

  root.querySelector('#mg-reload')!.addEventListener('click', () => location.reload())

  root.querySelector('#mg-add-deck')!.addEventListener('click', () => openAddDeck(() => renderAll(root)))

  root.querySelector('#mg-add-card')!.addEventListener('click', () => {
    if (!currentDeckId) return
    openCardEdit(currentDeckId, null, () => renderCards(root))
  })

  root.querySelector('#mg-decks')!.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
    if (!btn) return
    const { action, id } = btn.dataset
    if (!id) return
    if (action === 'rename-deck') {
      const deck = getAllDecks()[id]
      if (!deck) return
      const newName = prompt('新しいデッキ名:', deck.name)?.trim()
      if (!newName || newName === deck.name) return
      const decks = getAllDecks()
      const renamed = { ...deck, name: newName }
      // IDとして使っているnameも更新
      delete decks[id]
      decks[newName] = renamed
      localStorage.setItem('even-srs-decks', JSON.stringify(decks))
      if (currentDeckId === id) currentDeckId = newName
      if (getActiveDeckId() === id) setActiveDeckId(newName)
      renderAll(root)
    }
    if (action === 'select') { setActiveDeckId(id); currentDeckId = id; renderAll(root) }
    if (action === 'del-deck') {
      if (!confirm(`Delete "${getAllDecks()[id]?.name}"?`)) return
      deleteDeck(id)
      if (currentDeckId === id) currentDeckId = Object.keys(getAllDecks())[0] ?? null
      renderAll(root)
    }
  })

  root.querySelector('#mg-cards')!.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
    if (!btn || !currentDeckId) return
    const { action, id } = btn.dataset
    if (!id) return
    if (action === 'edit-card') {
      const card = getAllDecks()[currentDeckId]?.cards.find(c => c.id === id)
      if (card) openCardEdit(currentDeckId, card, () => renderCards(root))
    }
    if (action === 'del-card') {
      const d = getAllDecks()[currentDeckId]
      if (d) { saveDeck(currentDeckId, deleteCard(d, id)); renderCards(root) }
    }
  })

  root.querySelector<HTMLSelectElement>('#mg-csel')!.addEventListener('change', e => {
    currentDeckId = (e.target as HTMLSelectElement).value
    cardPage = 0; renderCards(root)
  })

  root.querySelector<HTMLInputElement>('#mg-search')!.addEventListener('input', e => {
    searchQuery = (e.target as HTMLInputElement).value
    cardPage = 0; renderCards(root)
  })

  currentDeckId = getActiveDeckId()
  renderAll(root)
}

// ── CSS ───────────────────────────────────────────────────

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #f4f4f4; color: #1a1a1a;
  font-family: 'SF Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 13px; line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.mg-root {
  min-height: 100svh; padding: 0 0 60px;
  max-width: 640px; margin: 0 auto;
}

/* header */
.mg-top {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px 14px; border-bottom: 1px solid #e0e0e0;
  position: sticky; top: 0; background: #f4f4f4; z-index: 10;
}
.mg-logo {
  font-size: 11px; letter-spacing: .2em; color: #999; font-weight: 600;
}
.mg-top-btn {
  font-family: inherit; font-size: 10px; letter-spacing: .12em;
  background: none; border: 1px solid #d5d5d5; color: #999;
  padding: 5px 10px; border-radius: 4px; cursor: pointer;
}
.mg-top-btn:hover { border-color: #aaa; color: #555; }

/* sections */
.mg-sec { padding: 24px 20px 0; }
.mg-sec-hd {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
  font-size: 10px; letter-spacing: .16em; color: #bbb; font-weight: 600;
}

/* deck rows */
.mg-deck-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 0; border-bottom: 1px solid #eaeaea;
}
.mg-deck-row.active .mg-deck-name { color: #000; }
.mg-deck-main { flex: 1; min-width: 0; }
.mg-deck-name { display: block; font-size: 13px; color: #555; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mg-deck-stat { font-size: 11px; color: #c5c5c5; letter-spacing: .04em; }
.mg-active-mark { color: #000; font-size: 8px; padding: 0 4px; }
.mg-done-mark { color: #aaa; font-size: 11px; }

/* card rows */
.mg-card-ctrl { display: flex; gap: 8px; margin-bottom: 10px; }
.mg-card-ctrl .mg-input { flex: 1; }
.mg-card-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 0; border-bottom: 1px solid #eaeaea;
}
.mg-card-txt { flex: 1; min-width: 0; }
.mg-cf { display: block; font-size: 13px; color: #555; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mg-cb { font-size: 11px; color: #c5c5c5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
.mg-row-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.mg-due-dot { width: 6px; height: 6px; border-radius: 50%; background: #d5d5d5; flex-shrink: 0; }
.mg-due-dot.due { background: #000; }
.mg-empty { color: #d5d5d5; padding: 20px 0; text-align: center; font-size: 12px; letter-spacing: .1em; }

/* pills / buttons */
.mg-pill {
  font-family: inherit; font-size: 10px; letter-spacing: .1em; font-weight: 600;
  background: none; border: 1px solid #d5d5d5; color: #aaa;
  padding: 4px 9px; border-radius: 3px; cursor: pointer; white-space: nowrap;
}
.mg-pill:hover { border-color: #aaa; color: #555; }
.mg-pill:disabled { opacity: .3; cursor: default; }
.mg-pill-del { color: #d5d5d5; }
.mg-pill-del:hover { border-color: #aaa; color: #e53e3e; }

/* inputs */
.mg-input, .mg-sel {
  width: 100%; background: #fff; border: 1px solid #e0e0e0; color: #555;
  padding: 9px 10px; border-radius: 4px; font-family: inherit; font-size: 16px;
  outline: none; appearance: none;
}
.mg-input:focus, .mg-sel:focus { border-color: #aaa; color: #1a1a1a; }
.mg-sel { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24'%3E%3Cpath d='M7 10l5 5 5-5z' fill='%23aaa'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 8px center; padding-right: 28px; }

/* pagination */
.mg-page { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 14px 0; font-size: 11px; color: #ccc; }

/* bottom sheets */
.mg-sheet-wrap {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(0,0,0,.25); display: flex; align-items: flex-end;
}
.mg-sheet {
  background: #f4f4f4; border-top: 1px solid #e0e0e0;
  border-radius: 12px 12px 0 0; padding: 20px 20px 40px;
  width: 100%; max-height: 85vh; overflow-y: auto;
  animation: sh-up .2s cubic-bezier(.2,.8,.3,1);
}
.mg-sh-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 18px;
  font-size: 11px; letter-spacing: .16em; color: #bbb; font-weight: 600;
}
.mg-sh-close { background: none; border: none; color: #bbb; font-size: 16px; cursor: pointer; padding: 0; }
.mg-sh-tabs { display: flex; gap: 0; border: 1px solid #e0e0e0; border-radius: 4px; overflow: hidden; margin-bottom: 16px; }
.mg-sh-tab {
  flex: 1; font-family: inherit; font-size: 10px; letter-spacing: .12em; font-weight: 600;
  background: none; border: none; color: #bbb; padding: 8px; cursor: pointer;
}
.mg-sh-tab.active { background: #eaeaea; color: #555; }
.mg-sh-tab:not(:last-child) { border-right: 1px solid #e0e0e0; }
.mg-sh-btn {
  width: 100%; margin-top: 14px; font-family: inherit;
  font-size: 11px; letter-spacing: .14em; font-weight: 600;
  background: #000; color: #fff; border: none;
  padding: 12px; border-radius: 4px; cursor: pointer;
}
.mg-sh-btn:disabled { background: #e0e0e0; color: #bbb; cursor: default; }
.mg-sh-btn:not(:disabled):hover { background: #333; }
.mg-drop {
  display: block; border: 1px dashed #d5d5d5; border-radius: 6px;
  padding: 28px; text-align: center; cursor: pointer; color: #c5c5c5;
  font-size: 12px; letter-spacing: .08em; margin: 8px 0;
}
.mg-drop:hover { border-color: #aaa; color: #888; }
.mg-hint { font-size: 11px; color: #bbb; margin: 6px 0; }
.mg-label { font-size: 10px; letter-spacing: .12em; color: #bbb; margin: 12px 0 6px; display: block; font-weight: 600; }
.mg-check { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.mg-ta { resize: vertical; }

@keyframes sh-up { from { transform: translateY(100%) } to { transform: none } }
`
