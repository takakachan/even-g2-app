import JSZip from 'jszip'
import type { SqlValue } from 'sql.js'
import { getAllDecks, saveDeck, deleteDeck, getActiveDeckId, setActiveDeckId, addCard, deleteCard, updateCard } from './store'
import type { Card, Deck } from './types'

function newCard(front: string, back: string): Card {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    front,
    back,
    interval: 1,
    repetitions: 0,
    easeFactor: 2.5,
    dueDate: '2020-01-01T00:00:00.000Z',
  }
}

function isDue(card: Card): boolean {
  return new Date(card.dueDate) <= new Date()
}

// ── parsers ──────────────────────────────────────────────

function parseJson(text: string): Deck {
  const data = JSON.parse(text)
  if (!data.name || !Array.isArray(data.cards)) throw new Error('無効なJSONフォーマット')
  return data as Deck
}

function parseCsv(text: string, deckName: string): Deck {
  const lines = text.trim().split(/\r?\n/)
  const header = lines[0].split(',').map(h => h.trim().toLowerCase())
  const fi = header.indexOf('front')
  const bi = header.indexOf('back')
  if (fi === -1 || bi === -1) throw new Error('CSVにfront/backカラムが必要です')
  const cards = lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      // CSV quoted values support
      const cols = line.match(/("(?:[^"]|"")*"|[^,]*)/g)?.map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"')) ?? line.split(',')
      return newCard(cols[fi]?.trim() ?? '', cols[bi]?.trim() ?? '')
    })
  return { name: deckName, cards }
}

async function parseApkg(file: File): Promise<Deck> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const dbFile = zip.file('collection.anki2') ?? zip.file('collection.anki21')
  if (!dbFile) throw new Error('Ankiファイルの形式が不正です')
  const dbData = await dbFile.async('arraybuffer')

  const initSqlJs = (await import('sql.js')).default
  const SQL = await initSqlJs({ locateFile: () => './sql-wasm.wasm' })
  const db = new SQL.Database(new Uint8Array(dbData))

  const result = db.exec('SELECT flds FROM notes')
  db.close()

  if (!result[0]) return { name: file.name.replace('.apkg', ''), cards: [] }

  const cards = result[0].values.map((row: SqlValue[]) => {
    const flds = row[0] as string
    const parts = flds.split('\x1f')
    return newCard(stripHtml(parts[0] ?? ''), stripHtml(parts[1] ?? ''))
  })
  return { name: file.name.replace('.apkg', ''), cards }
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

// ── UI helpers ────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html !== undefined) e.innerHTML = html
  return e
}

// ── state ─────────────────────────────────────────────────

let currentDeckId: string | null = null
let searchQuery = ''
let cardPage = 0
const PAGE_SIZE = 30

// ── main render ───────────────────────────────────────────

function renderDecks(container: HTMLElement) {
  const decks = getAllDecks()
  const ids = Object.keys(decks)
  const activeDeckId = getActiveDeckId()

  container.innerHTML = ''

  if (ids.length === 0) {
    container.innerHTML = '<p class="mg-empty">デッキがありません</p>'
    return
  }

  ids.forEach(id => {
    const deck = decks[id]
    const dueCount = deck.cards.filter(isDue).length
    const isActive = id === activeDeckId

    const row = el('div', `mg-deck-row${isActive ? ' mg-deck-active' : ''}`)
    row.innerHTML = `
      <div class="mg-deck-info">
        <span class="mg-deck-name">${esc(deck.name)}</span>
        <span class="mg-deck-meta">${deck.cards.length}枚  /  今日: ${dueCount}</span>
      </div>
      <div class="mg-deck-actions">
        <button class="mg-btn mg-btn-sm" data-action="select" data-id="${esc(id)}">選択</button>
        <button class="mg-btn mg-btn-sm mg-btn-danger" data-action="delete-deck" data-id="${esc(id)}">削除</button>
      </div>
    `
    container.appendChild(row)
  })
}

function renderCards(container: HTMLElement) {
  if (!currentDeckId) {
    container.innerHTML = '<p class="mg-empty">デッキを選択してください</p>'
    return
  }
  const decks = getAllDecks()
  const deck = decks[currentDeckId]
  if (!deck) { container.innerHTML = '<p class="mg-empty">デッキが見つかりません</p>'; return }

  const filtered = deck.cards.filter(c =>
    !searchQuery || c.front.includes(searchQuery) || c.back.includes(searchQuery)
  )
  const total = filtered.length
  const start = cardPage * PAGE_SIZE
  const page = filtered.slice(start, start + PAGE_SIZE)

  container.innerHTML = ''
  const info = el('div', 'mg-card-info')
  info.textContent = `${total}枚中 ${start + 1}〜${Math.min(start + PAGE_SIZE, total)}件`
  container.appendChild(info)

  page.forEach(card => {
    const due = isDue(card)
    const row = el('div', 'mg-card-row')
    row.innerHTML = `
      <div class="mg-card-text">
        <span class="mg-card-front">${esc(card.front)}</span>
        <span class="mg-card-sep">→</span>
        <span class="mg-card-back">${esc(card.back)}</span>
      </div>
      <div class="mg-card-meta">
        <span class="mg-badge ${due ? 'mg-badge-due' : 'mg-badge-ok'}">${due ? '復習' : '済'}</span>
        <button class="mg-btn mg-btn-xs" data-action="edit-card" data-id="${esc(card.id)}">編集</button>
        <button class="mg-btn mg-btn-xs mg-btn-danger" data-action="delete-card" data-id="${esc(card.id)}">削除</button>
      </div>
    `
    container.appendChild(row)
  })

  // pagination
  if (total > PAGE_SIZE) {
    const pag = el('div', 'mg-pagination')
    if (cardPage > 0) {
      const prev = el('button', 'mg-btn mg-btn-sm', '←')
      prev.addEventListener('click', () => { cardPage--; renderCards(container) })
      pag.appendChild(prev)
    }
    pag.appendChild(Object.assign(el('span'), { textContent: `${cardPage + 1} / ${Math.ceil(total / PAGE_SIZE)}` }))
    if (start + PAGE_SIZE < total) {
      const next = el('button', 'mg-btn mg-btn-sm', '→')
      next.addEventListener('click', () => { cardPage++; renderCards(container) })
      pag.appendChild(next)
    }
    container.appendChild(pag)
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── modals ────────────────────────────────────────────────

function showModal(html: string, onMount?: (modal: HTMLElement) => void) {
  const overlay = el('div', 'mg-overlay')
  overlay.innerHTML = `<div class="mg-modal">${html}<button class="mg-modal-close">✕</button></div>`
  document.body.appendChild(overlay)
  overlay.querySelector('.mg-modal-close')!.addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  if (onMount) onMount(overlay.querySelector('.mg-modal') as HTMLElement)
  return overlay
}

function showAddDeckModal(onDone: () => void) {
  const overlay = showModal(`
    <h3 class="mg-modal-title">デッキを追加</h3>
    <div class="mg-tabs">
      <button class="mg-tab mg-tab-active" data-tab="file">ファイル</button>
      <button class="mg-tab" data-tab="empty">空のデッキ</button>
    </div>
    <div data-panel="file">
      <p class="mg-hint">JSON / CSV / APKG に対応しています</p>
      <label class="mg-file-label">
        <span>ファイルを選択</span>
        <input type="file" id="mg-file-input" accept=".json,.csv,.apkg" style="display:none">
      </label>
      <p id="mg-file-status" class="mg-hint"></p>
      <button class="mg-btn mg-btn-primary" id="mg-import-btn" disabled>インポート</button>
    </div>
    <div data-panel="empty" style="display:none">
      <label class="mg-label">デッキ名</label>
      <input type="text" id="mg-deck-name" class="mg-input" placeholder="例: 英単語2025">
      <button class="mg-btn mg-btn-primary" id="mg-create-btn">作成</button>
    </div>
  `, modal => {
    // tab switching
    modal.querySelectorAll('.mg-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        modal.querySelectorAll('.mg-tab').forEach(t => t.classList.remove('mg-tab-active'))
        tab.classList.add('mg-tab-active')
        const target = (tab as HTMLElement).dataset.tab!
        modal.querySelectorAll('[data-panel]').forEach(p => {
          (p as HTMLElement).style.display = (p as HTMLElement).dataset.panel === target ? '' : 'none'
        })
      })
    })

    let parsedDeck: Deck | null = null
    const fileInput = modal.querySelector<HTMLInputElement>('#mg-file-input')!
    const importBtn = modal.querySelector<HTMLButtonElement>('#mg-import-btn')!
    const fileStatus = modal.querySelector<HTMLElement>('#mg-file-status')!
    const fileLabel = modal.querySelector<HTMLElement>('.mg-file-label span')!

    fileLabel.closest('label')!.addEventListener('click', () => fileInput.click())

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0]
      if (!file) return
      fileLabel.textContent = file.name
      fileStatus.textContent = '解析中...'
      importBtn.disabled = true
      parsedDeck = null
      try {
        if (file.name.endsWith('.json')) {
          parsedDeck = parseJson(await file.text())
        } else if (file.name.endsWith('.csv')) {
          parsedDeck = parseCsv(await file.text(), file.name.replace('.csv', ''))
        } else if (file.name.endsWith('.apkg')) {
          parsedDeck = await parseApkg(file)
        }
        fileStatus.textContent = `✓ ${parsedDeck?.cards.length ?? 0}枚のカードを読み込みました`
        importBtn.disabled = false
      } catch (e) {
        fileStatus.textContent = `エラー: ${(e as Error).message}`
      }
    })

    importBtn.addEventListener('click', () => {
      if (!parsedDeck) return
      saveDeck(parsedDeck.name, parsedDeck)
      setActiveDeckId(parsedDeck.name)
      currentDeckId = parsedDeck.name
      overlay.remove()
      onDone()
    })

    modal.querySelector('#mg-create-btn')!.addEventListener('click', () => {
      const name = (modal.querySelector<HTMLInputElement>('#mg-deck-name')!).value.trim()
      if (!name) return
      const deck: Deck = { name, cards: [] }
      saveDeck(name, deck)
      setActiveDeckId(name)
      currentDeckId = name
      overlay.remove()
      onDone()
    })
  })
}

function showCardModal(deckId: string, card: Card | null, onDone: () => void) {
  const title = card ? 'カードを編集' : 'カードを追加'
  const overlay = showModal(`
    <h3 class="mg-modal-title">${title}</h3>
    <label class="mg-label">表面</label>
    <textarea id="mg-card-front" class="mg-input mg-textarea" rows="3">${card ? esc(card.front) : ''}</textarea>
    <label class="mg-label">裏面</label>
    <textarea id="mg-card-back" class="mg-input mg-textarea" rows="3">${card ? esc(card.back) : ''}</textarea>
    ${card ? '<label class="mg-label"><input type="checkbox" id="mg-reset-progress"> 進捗をリセット</label>' : ''}
    <button class="mg-btn mg-btn-primary" id="mg-save-card">保存</button>
  `, modal => {
    modal.querySelector('#mg-save-card')!.addEventListener('click', () => {
      const front = (modal.querySelector<HTMLTextAreaElement>('#mg-card-front')!).value.trim()
      const back = (modal.querySelector<HTMLTextAreaElement>('#mg-card-back')!).value.trim()
      if (!front || !back) return

      const decks = getAllDecks()
      let deck = decks[deckId]
      if (!deck) return

      if (card) {
        const resetProgress = (modal.querySelector<HTMLInputElement>('#mg-reset-progress'))?.checked
        const updated: Card = resetProgress
          ? newCard(front, back)
          : { ...card, front, back }
        if (resetProgress) updated.id = card.id
        deck = updateCard(deck, updated)
      } else {
        deck = addCard(deck, newCard(front, back))
      }

      saveDeck(deckId, deck)
      overlay.remove()
      onDone()
    })
  })
}

// ── build UI ──────────────────────────────────────────────

function buildPanel(): HTMLElement {
  const panel = el('div', 'mg-panel mg-hidden')
  panel.innerHTML = `
    <div class="mg-header">
      <span class="mg-title">Even SRS 管理</span>
      <button class="mg-btn mg-btn-sm" id="mg-reload-btn">G2更新</button>
      <button class="mg-icon-btn" id="mg-close-btn">✕</button>
    </div>

    <div class="mg-tabs mg-main-tabs">
      <button class="mg-tab mg-tab-active" data-main-tab="decks">デッキ</button>
      <button class="mg-tab" data-main-tab="cards">カード</button>
    </div>

    <div id="mg-decks-panel">
      <div id="mg-deck-list"></div>
      <button class="mg-btn mg-btn-primary mg-add-btn" id="mg-add-deck-btn">＋ デッキを追加</button>
    </div>

    <div id="mg-cards-panel" style="display:none">
      <div class="mg-card-controls">
        <select id="mg-deck-select" class="mg-input mg-select"></select>
        <input type="text" id="mg-search" class="mg-input" placeholder="検索...">
      </div>
      <div id="mg-card-list"></div>
      <button class="mg-btn mg-btn-primary mg-add-btn" id="mg-add-card-btn">＋ カードを追加</button>
    </div>
  `
  return panel
}

function attachEvents(panel: HTMLElement) {
  const deckList = panel.querySelector('#mg-deck-list') as HTMLElement
  const cardList = panel.querySelector('#mg-card-list') as HTMLElement
  const deckSelect = panel.querySelector<HTMLSelectElement>('#mg-deck-select')!
  const searchInput = panel.querySelector<HTMLInputElement>('#mg-search')!

  function refreshDecks() {
    renderDecks(deckList)
    refreshDeckSelect()
  }

  function refreshDeckSelect() {
    const decks = getAllDecks()
    deckSelect.innerHTML = Object.entries(decks)
      .map(([id, d]) => `<option value="${esc(id)}">${esc(d.name)}</option>`)
      .join('')
    if (currentDeckId && decks[currentDeckId]) deckSelect.value = currentDeckId
    else if (Object.keys(decks).length > 0) currentDeckId = Object.keys(decks)[0]
  }

  // main tabs
  panel.querySelectorAll('[data-main-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('[data-main-tab]').forEach(t => t.classList.remove('mg-tab-active'))
      tab.classList.add('mg-tab-active')
      const target = (tab as HTMLElement).dataset.mainTab!
      ;(panel.querySelector('#mg-decks-panel') as HTMLElement).style.display = target === 'decks' ? '' : 'none'
      ;(panel.querySelector('#mg-cards-panel') as HTMLElement).style.display = target === 'cards' ? '' : 'none'
      if (target === 'cards') { refreshDeckSelect(); renderCards(cardList) }
    })
  })

  // deck list actions (delegated)
  deckList.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')
    if (!btn) return
    const { action, id } = btn.dataset
    if (action === 'select' && id) {
      setActiveDeckId(id)
      currentDeckId = id
      refreshDecks()
    }
    if (action === 'delete-deck' && id) {
      if (!confirm(`「${getAllDecks()[id]?.name}」を削除しますか？`)) return
      deleteDeck(id)
      if (currentDeckId === id) currentDeckId = Object.keys(getAllDecks())[0] ?? null
      refreshDecks()
    }
  })

  // card list actions (delegated)
  cardList.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')
    if (!btn || !currentDeckId) return
    const { action, id } = btn.dataset
    if (action === 'edit-card' && id) {
      const card = getAllDecks()[currentDeckId]?.cards.find(c => c.id === id)
      if (card) showCardModal(currentDeckId, card, () => renderCards(cardList))
    }
    if (action === 'delete-card' && id) {
      if (!confirm('このカードを削除しますか？')) return
      const deck = getAllDecks()[currentDeckId]
      if (deck) { saveDeck(currentDeckId, deleteCard(deck, id)); renderCards(cardList) }
    }
  })

  // deck select change
  deckSelect.addEventListener('change', () => {
    currentDeckId = deckSelect.value
    cardPage = 0
    renderCards(cardList)
  })

  // search
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value
    cardPage = 0
    renderCards(cardList)
  })

  panel.querySelector('#mg-add-deck-btn')!.addEventListener('click', () => {
    showAddDeckModal(refreshDecks)
  })

  panel.querySelector('#mg-add-card-btn')!.addEventListener('click', () => {
    if (!currentDeckId) return
    showCardModal(currentDeckId, null, () => renderCards(cardList))
  })

  panel.querySelector('#mg-close-btn')!.addEventListener('click', () => {
    panel.classList.add('mg-hidden')
  })

  panel.querySelector('#mg-reload-btn')!.addEventListener('click', () => {
    location.reload()
  })

  // initial render
  currentDeckId = getActiveDeckId()
  refreshDecks()
}

// ── export ────────────────────────────────────────────────

export function initManageUI() {
  const style = el('style')
  style.textContent = CSS
  document.head.appendChild(style)

  const fab = el('button', 'mg-fab', '⚙')
  document.body.appendChild(fab)

  const panel = buildPanel()
  document.body.appendChild(panel)

  fab.addEventListener('click', () => panel.classList.toggle('mg-hidden'))

  attachEvents(panel)
}

// ── CSS ───────────────────────────────────────────────────

const CSS = `
.mg-fab {
  position: fixed; bottom: 20px; right: 20px; z-index: 9000;
  width: 48px; height: 48px; border-radius: 50%;
  background: #7c3aed; color: #fff; border: none;
  font-size: 22px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.3);
  display: flex; align-items: center; justify-content: center;
}
.mg-panel {
  position: fixed; inset: 0; z-index: 8999;
  background: #fff; overflow-y: auto;
  display: flex; flex-direction: column;
  font-family: system-ui, sans-serif; font-size: 14px; color: #1a1a2e;
}
.mg-panel.mg-hidden { display: none; }
.mg-header {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 16px; border-bottom: 1px solid #e5e7eb;
  position: sticky; top: 0; background: #fff; z-index: 1;
}
.mg-title { font-weight: 700; font-size: 15px; flex: 1; }
.mg-icon-btn {
  background: none; border: none; font-size: 18px; cursor: pointer;
  color: #6b7280; padding: 4px 8px;
}
.mg-tabs { display: flex; border-bottom: 1px solid #e5e7eb; }
.mg-main-tabs { margin: 0; }
.mg-tab {
  flex: 1; padding: 10px; border: none; background: none; cursor: pointer;
  font-size: 14px; color: #6b7280; border-bottom: 2px solid transparent;
}
.mg-tab.mg-tab-active { color: #7c3aed; border-bottom-color: #7c3aed; font-weight: 600; }
#mg-decks-panel, #mg-cards-panel { padding: 12px 16px; flex: 1; }
.mg-deck-row {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px;
  margin-bottom: 8px;
}
.mg-deck-row.mg-deck-active { border-color: #7c3aed; background: #f5f3ff; }
.mg-deck-info { flex: 1; min-width: 0; }
.mg-deck-name { font-weight: 600; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mg-deck-meta { font-size: 12px; color: #6b7280; }
.mg-deck-actions { display: flex; gap: 6px; flex-shrink: 0; }
.mg-card-controls { display: flex; gap: 8px; margin-bottom: 10px; }
.mg-card-controls .mg-input { flex: 1; }
.mg-card-row {
  padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 6px;
}
.mg-card-text { margin-bottom: 4px; font-size: 13px; }
.mg-card-front { font-weight: 600; }
.mg-card-sep { color: #9ca3af; margin: 0 6px; }
.mg-card-back { color: #4b5563; }
.mg-card-meta { display: flex; align-items: center; gap: 6px; }
.mg-badge {
  font-size: 11px; padding: 1px 6px; border-radius: 10px; font-weight: 600;
}
.mg-badge-due { background: #fef3c7; color: #92400e; }
.mg-badge-ok { background: #d1fae5; color: #065f46; }
.mg-card-info { font-size: 12px; color: #6b7280; margin-bottom: 8px; }
.mg-add-btn { width: 100%; margin-top: 12px; }
.mg-pagination { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 10px; font-size: 13px; }
.mg-btn {
  padding: 6px 12px; border-radius: 6px; border: 1px solid #d1d5db;
  background: #fff; cursor: pointer; font-size: 13px; font-weight: 500;
}
.mg-btn:hover { background: #f9fafb; }
.mg-btn-primary { background: #7c3aed; color: #fff; border-color: #7c3aed; }
.mg-btn-primary:hover { background: #6d28d9; }
.mg-btn-primary:disabled { background: #a78bfa; border-color: #a78bfa; cursor: not-allowed; }
.mg-btn-danger { color: #dc2626; border-color: #fca5a5; }
.mg-btn-danger:hover { background: #fef2f2; }
.mg-btn-sm { padding: 4px 10px; font-size: 12px; }
.mg-btn-xs { padding: 2px 8px; font-size: 11px; }
.mg-empty { color: #9ca3af; text-align: center; padding: 24px; }
.mg-select { appearance: none; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24'%3E%3Cpath d='M7 10l5 5 5-5z' fill='%236b7280'/%3E%3C/svg%3E") right 8px center no-repeat; padding-right: 28px; }
.mg-input, .mg-select {
  width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px;
  font-size: 14px; box-sizing: border-box; outline: none;
}
.mg-input:focus, .mg-select:focus { border-color: #7c3aed; box-shadow: 0 0 0 2px #ede9fe; }
.mg-textarea { resize: vertical; }
.mg-label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin: 10px 0 4px; }
.mg-overlay {
  position: fixed; inset: 0; z-index: 9100;
  background: rgba(0,0,0,.5); display: flex; align-items: flex-end;
  animation: mg-fade .15s;
}
.mg-modal {
  background: #fff; border-radius: 16px 16px 0 0; padding: 20px 16px 32px;
  width: 100%; box-sizing: border-box; max-height: 90vh; overflow-y: auto;
  position: relative; animation: mg-slide .2s;
}
.mg-modal-title { margin: 0 0 14px; font-size: 16px; font-weight: 700; }
.mg-modal-close {
  position: absolute; top: 14px; right: 14px;
  background: none; border: none; font-size: 18px; cursor: pointer; color: #6b7280;
}
.mg-tabs { display: flex; gap: 0; margin-bottom: 14px; border: 1px solid #d1d5db; border-radius: 6px; overflow: hidden; }
.mg-tabs .mg-tab { border: none; border-radius: 0; border-bottom: none; }
.mg-tabs .mg-tab:not(:last-child) { border-right: 1px solid #d1d5db; }
.mg-file-label {
  display: block; border: 2px dashed #d1d5db; border-radius: 8px;
  padding: 20px; text-align: center; cursor: pointer; color: #6b7280;
  margin: 10px 0;
}
.mg-file-label:hover { border-color: #7c3aed; color: #7c3aed; }
.mg-hint { font-size: 12px; color: #6b7280; margin: 6px 0; }
@keyframes mg-fade { from { opacity:0 } to { opacity:1 } }
@keyframes mg-slide { from { transform: translateY(40px); opacity:0 } to { transform: none; opacity:1 } }
@media (prefers-color-scheme: dark) {
  .mg-panel, .mg-modal { background: #1a1a2e; color: #e5e7eb; }
  .mg-header { background: #1a1a2e; border-color: #374151; }
  .mg-deck-row, .mg-card-row { border-color: #374151; }
  .mg-deck-row.mg-deck-active { background: #2d1b69; border-color: #7c3aed; }
  .mg-btn { background: #1f2937; border-color: #374151; color: #e5e7eb; }
  .mg-btn:hover { background: #374151; }
  .mg-input, .mg-select { background: #1f2937; border-color: #374151; color: #e5e7eb; }
  .mg-overlay { background: rgba(0,0,0,.7); }
  .mg-tabs { border-color: #374151; }
  .mg-tabs .mg-tab:not(:last-child) { border-right-color: #374151; }
  .mg-tab { color: #9ca3af; }
  .mg-tab.mg-tab-active { color: #a78bfa; border-bottom-color: #a78bfa; }
  .mg-file-label { border-color: #374151; color: #9ca3af; }
}
`
