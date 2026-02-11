/**
 * Crossword Game Logic
 * Handles game initialization, grid management, and answer checking
 */
/* Crossword/Word-search game implementation
   - 15 columns x 8 rows
   - place up to 10 words from words5.json
   - draw selection lines by click-and-drag (mouse/touch)
*/

import { translateToIndonesian, getHybridWord } from './dictionary-api.js';

const DEFAULT_ROWS = 8;
const DEFAULT_COLS = 15;

function randInt(max) { return Math.floor(Math.random() * max); }

export class CrosswordGame {
  constructor() {
    this.rows = DEFAULT_ROWS;
    this.cols = DEFAULT_COLS;
    this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
    this.words = []; // list of placed words {word, coords: [{r,c}], found}
    this.foundCount = 0;

    // DOM refs
    this.gridEl = null;
    this.overlay = null;
    this.wordsCol1 = null;
    this.wordsCol2 = null;

    // selection state
    this.selecting = false;
    this.selection = []; // array of {r,c,el}
    this.selectionLine = null;
    // Line drawing settings
    // Ubah nilai `this.lineWidth` untuk menyesuaikan ketebalan garis.
    // Nilai kecil seperti 0.8 - 1 akan menghasilkan garis setipis garisan pensil yang tajam.
    // Jika masih terasa tebal, ubah di sini ke `0.8` atau `0.6`.
    this.lineWidth = 1;
    // Hint limits
    this.hintRemaining = 3;
    // Modal refs (initialized after DOM ready)
    this.messageModal = null;
    this.messageModalBox = null;
  }

  async initializeGame() {
    this.gridEl = document.getElementById('crosswordGrid');
    this.overlay = document.getElementById('gridOverlay');
    this.wordsCol1 = document.getElementById('wordsColumn1');
    this.wordsCol2 = document.getElementById('wordsColumn2');

    // modal element (for info / end-game messages)
    this.messageModal = document.getElementById('messageModal');
    if (this.messageModal) this.messageModalBox = this.messageModal.querySelector('.modal-box');

    await this.loadWordsAndPlace();
    this.renderGrid();
    this.renderWordList();
    this.attachEvents();
  }

  async loadWordsAndPlace() {
    // New behavior:
    //  - try to load words from an API if `window.WORD_SOURCE_URL` is set, otherwise use local `words5.json`.
    //  - support source items as strings or objects ({de, word, translation, id}).
    //  - enforce word length between 4 and 6 (inclusive).
    //  - attach `translation` field when available or attempt to fetch it.

    // Determine source: if `window.WORD_SOURCE_URL` is set (e.g. an online API), use it;
    // otherwise fall back to the local `words5.json` file.
    const sourceUrl = (window && window.WORD_SOURCE_URL) ? window.WORD_SOURCE_URL : './words5.json';
    let rawBank = [];
    try {
      const resp = await fetch(sourceUrl);
      if (resp.ok) {
        const data = await resp.json();
        // API may return either an array or an object wrapper. Normalize common shapes:
        if (Array.isArray(data)) {
          rawBank = data;
        } else if (data && typeof data === 'object') {
          // Try common properties that may hold the array
          rawBank = data.words || data.data || data.results || data.items || [];
          // If wrapper property is not an array, but the object itself looks like a single entry,
          // convert to single-element array so normalization later will handle it.
          if (!Array.isArray(rawBank) && Object.keys(data).length > 0) rawBank = [data];
        }
      }
    } catch (e) {
      console.warn('Could not load word source', sourceUrl, e);
    }

    // Normalize entries into objects { word, translation }
    const normalize = (item) => {
      if (!item) return null;
      if (typeof item === 'string') return { word: String(item).toUpperCase(), translation: '' };
      // possible shapes: {de: 'word', id: 'translation'} or {word: 'WORD', translation: '...'}
      if (item.de || item.word) {
        const w = (item.de || item.word).toString().toUpperCase();
        const t = item.id || item.translation || item.indonesia || item.indonesian || '';
        return { word: w, translation: t };
      }
      return null;
    };

    let bank = (rawBank || []).map(normalize).filter(Boolean);

    // Filter by letters and length 4..6
    bank = bank.filter(e => /^[A-ZÄÖÜẞ]+$/.test(e.word) && e.word.length >= 4 && e.word.length <= 6);

    // If not enough candidates, add fallback seeds (4..6 letters)
    const targetCount = 10;
    if (bank.length < targetCount) {
      const fallback = ['KATZE','HUNDE','MILCH','BAUM','SCHNEE','HAUS','STADT','WASSER','FEUER','BLUME','NACHT','SONNE','BRIEF','FREUND'];
      const added = fallback.map(w => ({ word: w.toUpperCase(), translation: '' }));
      // merge, keeping unique words
      const map = new Map();
      bank.concat(added).forEach(e => { if (e && e.word) map.set(e.word, e); });
      bank = Array.from(map.values()).filter(e => e.word.length >= 4 && e.word.length <= 6);
    }

    // Shuffle
    for (let i = bank.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [bank[i], bank[j]] = [bank[j], bank[i]];
    }

    // Prepare placement
    const placed = [];
    const directions = [
      { dr: 0, dc: 1 },{ dr: 0, dc: 1 },{ dr: 0, dc: 1 },{ dr: 0, dc: 1 },
      { dr: 1, dc: 0 },{ dr: 1, dc: 0 },{ dr: 1, dc: 0 },{ dr: 1, dc: 0 },
      { dr: 1, dc: 1 },{ dr: 1, dc: -1 }
    ];

    for (let i = 0; i < bank.length && placed.length < targetCount; i++) {
      const item = bank[i];
      const word = (item.word || '').replace(/[^A-ZÄÖÜẞ]/g, '');
      if (!word || word.length < 4 || word.length > 6) continue;

      let attempts = 0, ok = false;
      while (attempts < 200 && !ok) {
        attempts++;
        const dir = directions[randInt(directions.length)];
        const startR = randInt(this.rows);
        const startC = randInt(this.cols);
        const endR = startR + dir.dr * (word.length - 1);
        const endC = startC + dir.dc * (word.length - 1);
        if (endR < 0 || endR >= this.rows || endC < 0 || endC >= this.cols) continue;

        // check conflicts
        let conflict = false;
        const coords = [];
        let r = startR, c = startC;
        for (let k = 0; k < word.length; k++) {
          const existing = this.grid[r][c];
          if (existing && existing !== word[k]) { conflict = true; break; }
          coords.push({ r, c });
          r += dir.dr; c += dir.dc;
        }
        if (conflict) continue;

        // place
        for (let k = 0; k < word.length; k++) {
          const { r, c } = coords[k];
          this.grid[r][c] = word[k];
        }

        // Ensure we have a translation; if missing, try to fetch via translateToIndonesian
        let translation = item.translation || '';
        if (!translation) {
          try {
            // translateToIndonesian expects germanWord (lowercase/utf-8 OK)
            translation = await translateToIndonesian(word.toLowerCase()) || '';
          } catch (e) {
            translation = '';
          }
        }

        placed.push({ word, coords, found: false, translation });
        ok = true;
      }
    }

    // Fill rest with random letters
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (!this.grid[r][c]) this.grid[r][c] = letters[randInt(letters.length)];
      }
    }

    this.words = placed.slice(0, targetCount);
  }

  renderGrid() {
    this.gridEl.innerHTML = '';
    // create cells
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'crossword-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        const span = document.createElement('div');
        span.className = 'letter';
        span.textContent = this.grid[r][c];
        cell.appendChild(span);
        this.gridEl.appendChild(cell);
      }
    }

    // resize overlay to grid pixel size
    this.updateOverlaySize();
    window.addEventListener('resize', () => this.updateOverlaySize());
  }

  updateOverlaySize() {
    const rect = this.gridEl.getBoundingClientRect();
    this.overlay.setAttribute('width', rect.width);
    this.overlay.setAttribute('height', rect.height);
    this.overlay.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  }

  renderWordList() {
    this.wordsCol1.innerHTML = '';
    this.wordsCol2.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const w = this.words[i];
      const li = document.createElement('li');
      li.id = `word-${i}`;
      li.style.padding = '0.25rem 0';
      // Buat placeholder dengan tanda '-' sesuai banyak huruf, dipisah spasi: "- - -"
      if (w) {
        const placeholder = Array.from({ length: w.word.length }).map(() => '-').join(' ');
        li.textContent = `${i + 1}. ${placeholder}`;
      } else {
        li.textContent = `${i + 1}. ---`;
      }
      if (i < 5) this.wordsCol1.appendChild(li); else this.wordsCol2.appendChild(li);
    }
  }

  attachEvents() {
    // mouse events
    this.gridEl.querySelectorAll('.crossword-cell').forEach(cell => {
      cell.addEventListener('mousedown', (e) => this.onPointerDown(e, cell));
      cell.addEventListener('mouseenter', (e) => this.onPointerEnter(e, cell));
    });
    window.addEventListener('mouseup', (e) => this.onPointerUp(e));

    // touch support
    this.gridEl.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    this.gridEl.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    window.addEventListener('touchend', (e) => this.onPointerUp(e));

    // Controls: Info, Hint (3x), Give Up, Reset, Play Again
    const infoBtn = document.getElementById('infoBtn');
    const hintBtn = document.getElementById('hintBtn');
    const giveUpBtn = document.getElementById('giveUpBtn');
    const resetBtn = document.getElementById('resetBtn');
    const playAgainBtn = document.getElementById('playAgainBtn');

    if (infoBtn) infoBtn.addEventListener('click', () => this.showInfo());
    if (hintBtn) {
      hintBtn.addEventListener('click', () => this.onHintClick());
      // show remaining hints
      hintBtn.textContent = `Hint (${this.hintRemaining})`;
    }
    if (giveUpBtn) giveUpBtn.addEventListener('click', () => this.onGiveUp());
    if (resetBtn) resetBtn.addEventListener('click', () => location.reload());
    if (playAgainBtn) playAgainBtn.addEventListener('click', () => location.reload());

    // Modal: close X and outside click to dismiss
    if (this.messageModal) {
      const closeBtn = this.messageModal.querySelector('.modal-close');
      if (closeBtn) closeBtn.addEventListener('click', () => this.hideModal());
      this.messageModal.addEventListener('click', (e) => {
        if (e.target === this.messageModal) this.hideModal();
      });
    }
  }

  showInfo() {
    const lines = [
      '1) Tarik garis melalui huruf untuk membentuk kata.',
      '2) Garis boleh horizontal, vertikal, atau diagonal.',
      '3) Kamu bisa menggunakan hint maksimal 3x untuk menampilkan huruf pertama.',
      '4) Setelah kata ditemukan, garis permanen akan muncul dan kata di daftar terungkap.',
      '5) Gunakan tombol Reset untuk mulai ulang permainan.'
    ];
    const body = `<div class="modal-body">${lines.map(l => `<div>${l}</div>`).join('')}</div>`;
    // Edit the `lines` array above to change the info text shown in the modal.
    // showModal(title, bodyHtml, showPlayAgain, center)
    this.showModal('CARA BERMAIN', body, false, false);
  }

  onHintClick() {
    const hintBtn = document.getElementById('hintBtn');
    if (this.hintRemaining <= 0) {
      this.showModal('Hint', '<div class="modal-body">Tidak ada hint tersisa.</div>', false);
      return;
    }
    this.revealOneLetter();
    this.hintRemaining--;
    if (hintBtn) hintBtn.textContent = `Hint (${this.hintRemaining})`;
    if (this.hintRemaining <= 0 && hintBtn) hintBtn.disabled = true;
  }

  onGiveUp() {
    // remember how many were found before reveal
    const found = this.foundCount;
    // reveal all words (skip built-in win dialog)
    this.revealAll(true);
    if (found < 5) {
      const body = `<div class="modal-body">PERMAINAN SELESAI.<br>Kamu berhasil menemukan ${found} kata. Aku yakin kamu pasti bisa di permainan berikutnya.</div>`;
      // Center the text and buttons for this modal (true)
      this.showModal('PERMAINAN SELESAI', body, true, true);
    } else {
      const body = `<div class="modal-body">PERMAINAN SELESAI.<br>Kamu berhasil menemukan ${found} kata. Kamu hampir menemukan semua kata!</div>`;
      this.showModal('PERMAINAN SELESAI', body, true, true);
    }
  }

  showModal(title, bodyHtml, showPlayAgain, center) {
    // center: if true, center modal content and actions
    /*
      EDIT NOTES (JS modal behavior):
      - This helper controls the modal content and action buttons.
      - Parameters:
        * title (string) - the modal title text.
        * bodyHtml (string) - HTML inserted into `.modal-content`.
        * showPlayAgain (bool) - whether to include a "Main Lagi" button.
        * center (bool) - if true, center text and center the action buttons.
      - To change default button labels ("Tutup", "Main Lagi"), edit the strings below
        where the buttons are created (close.textContent, again.textContent).
      - To always center the modal content, set `center` to true when calling this function,
        or add `text-align: center;` to `.modal-content` in `crossword.css`.
    */
    if (!this.messageModal) return;
    const titleEl = this.messageModal.querySelector('.modal-title');
    const contentEl = this.messageModal.querySelector('.modal-content');
    const playArea = this.messageModal.querySelector('.modal-actions');
    if (titleEl) titleEl.textContent = title || '';
    if (contentEl) {
      contentEl.innerHTML = bodyHtml || '';
      contentEl.style.textAlign = center ? 'center' : '';
    }
    if (playArea) {
      playArea.innerHTML = '';
      // center actions if requested
      playArea.style.justifyContent = center ? 'center' : 'flex-end';
      const close = document.createElement('button');
      close.className = 'btn btn-secondary';
      close.textContent = 'Tutup';
      close.addEventListener('click', () => this.hideModal());
      playArea.appendChild(close);
      if (showPlayAgain) {
        const again = document.createElement('button');
        again.className = 'btn btn-primary';
        again.textContent = 'Main Lagi';
        again.addEventListener('click', () => location.reload());
        playArea.appendChild(again);
      }
    }
    this.messageModal.style.display = 'flex';
  }

  hideModal() {
    if (!this.messageModal) return;
    this.messageModal.style.display = 'none';
  }

  onPointerDown(e, cell) {
    e.preventDefault();
    this.clearSelection();
    this.selecting = true;
    this.direction = null; // reset direction for new selection
    this.addCellToSelection(cell);
  }

  onPointerEnter(e, cell) {
    if (!this.selecting) return;
    const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
    if (this.selection.length > 0) {
      const last = this.selection[this.selection.length - 1];
      if (last.r === r && last.c === c) return;
      
      // Enforce direction consistency
      if (this.selection.length === 1) {
        // First move: establish direction
        this.direction = { r: Math.sign(r - last.r), c: Math.sign(c - last.c) };
      }
      
      // Check if new cell follows the established direction
      const expectedR = last.r + this.direction.r;
      const expectedC = last.c + this.direction.c;
      if (r !== expectedR || c !== expectedC) {
        // Not in the right direction, don't add
        return;
      }
    }
    this.addCellToSelection(cell);
  }

  onTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el && el.classList.contains('crossword-cell')) {
      this.onPointerDown(e, el);
    }
  }

  onTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el && el.classList.contains('crossword-cell')) this.onPointerEnter(e, el);
  }

  onPointerUp(e) {
    if (!this.selecting) return;
    this.selecting = false;
    if (this.selection.length < 2) { this.clearSelection(); return; }
    // validate straight line
    const coords = this.selection.map(s => ({ r: s.r, c: s.c }));
    const dr = coords[1].r - coords[0].r;
    const dc = coords[1].c - coords[0].c;
    const step = { r: Math.sign(dr), c: Math.sign(dc) };
    // ensure each step follows same direction
    let straight = true;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const cur = coords[i];
      if (cur.r - prev.r !== step.r || cur.c - prev.c !== step.c) { straight = false; break; }
    }
    if (!straight) { this.flashSelection(false); return; }

    const word = this.selection.map(s => s.letter).join('');
    const rev = word.split('').reverse().join('');
    const idx = this.words.findIndex(w => !w.found && (w.word === word || w.word === rev));
    if (idx >= 0) {
      this.markFound(idx, this.selection.map(s => ({ r: s.r, c: s.c })));
    } else {
      this.flashSelection(false);
    }
  }

  addCellToSelection(cell) {
    const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
    const letter = cell.textContent.trim();
    const item = { r, c, el: cell, letter };
    this.selection.push(item);
    cell.classList.add('selected');
    this.drawSelectionLine(false);
  }

  clearSelection() {
    this.selection.forEach(s => s.el.classList.remove('selected'));
    this.selection = [];
    // remove temporary lines
    const tmp = this.overlay.querySelectorAll('.temp-line');
    tmp.forEach(n => n.remove());
  }

  drawSelectionLine(permanent) {
    // draw a polyline through centers of selected cells (only for temporary selection display)
    const rect = this.gridEl.getBoundingClientRect();
    const points = this.selection.map(s => {
      const elRect = s.el.getBoundingClientRect();
      const x = elRect.left - rect.left + elRect.width / 2;
      const y = elRect.top - rect.top + elRect.height / 2;
      return `${x},${y}`;
    }).join(' ');

    // remove previous temp
    this.overlay.querySelectorAll('.temp-line').forEach(n => n.remove());

    // Only draw line while selecting (temporary), don't draw permanent lines
    if (!permanent) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      line.setAttribute('points', points);
      line.setAttribute('class', 'selection-line temp-line');
      line.setAttribute('stroke', '#fffeeaff');
      line.setAttribute('fill', 'transparent');

      // Gunakan `this.lineWidth` agar konsisten dan mudah disesuaikan di satu tempat
      line.setAttribute('stroke-width', String(this.lineWidth));
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('stroke-linejoin', 'round');

      this.overlay.appendChild(line);
    }
  }

  flashSelection(correct) {
    // draw temp red line then remove
    const rect = this.gridEl.getBoundingClientRect();
    const points = this.selection.map(s => {
      const elRect = s.el.getBoundingClientRect();
      const x = elRect.left - rect.left + elRect.width / 2;
      const y = elRect.top - rect.top + elRect.height / 2;
      return `${x},${y}`;
    }).join(' ');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', points);
    line.setAttribute('class', 'selection-line flash-red');
    line.setAttribute('stroke', correct ? '#fffeeaff' : 'red');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke-width', String(this.lineWidth));
    this.overlay.appendChild(line);
    setTimeout(() => { line.remove(); this.clearSelection(); }, 420);
  }

  markFound(idx, coords) {
    const w = this.words[idx];
    w.found = true;
    this.foundCount++;
    
    // No green line drawn, only boxes will be highlighted
    // reveal word in list
    const li = document.getElementById(`word-${idx}`);
    if (li) {
      if (w.translation) li.textContent = `${idx + 1}. ${w.word} (${w.translation})`;
      else li.textContent = `${idx + 1}. ${w.word}`;
    }

    // mark cells visually with green background
    coords.forEach(({r,c}) => {
      const cell = this.gridEl.querySelector(`.crossword-cell[data-r="${r}"][data-c="${c}"]`);
      if (cell) cell.classList.add('correct');
    });

    // Gambar garis permanen mengikuti koordinat kata yang ditemukan.
    // Hapus garis sementara (temp-line) yang mewakili seleksi saat ini,
    // lalu tambahkan polyline permanen berwarna hijau.
    this.overlay.querySelectorAll('.temp-line').forEach(n => n.remove());
    const rect = this.gridEl.getBoundingClientRect();
    const points = coords.map(({r,c}) => {
      const cell = this.gridEl.querySelector(`.crossword-cell[data-r="${r}"][data-c="${c}"]`);
      if (!cell) return null;
      const elRect = cell.getBoundingClientRect();
      const x = elRect.left - rect.left + elRect.width / 2;
      const y = elRect.top - rect.top + elRect.height / 2;
      return `${x},${y}`;
    }).filter(p => p).join(' ');
    if (points) {
      const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pl.setAttribute('points', points);
      pl.setAttribute('class', 'selection-line permanent-line');
      pl.setAttribute('stroke', '#fffeeaff');
      pl.setAttribute('fill', 'none');
      pl.setAttribute('stroke-width', String(this.lineWidth));
      pl.setAttribute('stroke-linecap', 'round');
      pl.setAttribute('stroke-linejoin', 'round');
      this.overlay.appendChild(pl);
    }

    if (this.foundCount >= this.words.length) this.showWinDialog();
  }

  revealOneLetter() {
    // find a word not yet found and reveal first unrevealed letter by replacing corresponding word list item
    const wf = this.words.find(w => !w.found);
    if (!wf) { this.showMessage('Semua kata sudah ditemukan!', 'info'); return; }
    const idx = this.words.indexOf(wf);
    const li = document.getElementById(`word-${idx}`);
    if (li) {
      const rest = wf.word.slice(1).split('').map(() => '-').join(' ');
      li.textContent = `${idx + 1}. ${wf.word[0]}${rest ? ' ' + rest : ''}`;
    }
  }

  revealAll(skipWin = false) {
    // reveal all words and mark them found
    for (let i = 0; i < this.words.length; i++) {
      if (!this.words[i].found) {
        this.markFoundRevealed(i, this.words[i].coords);
      }
    }
    // optionally show win dialog after reveal
    if (!skipWin) this.showWinDialog();
  }

  markFoundRevealed(idx, coords) {
    // Mark as found but with red styling (no green line)
    const w = this.words[idx];
    w.found = true;
    this.foundCount++;

    // reveal word in list
    const li = document.getElementById(`word-${idx}`);
    if (li) {
      if (w.translation) li.textContent = `${idx + 1}. ${w.word} (${w.translation})`;
      else li.textContent = `${idx + 1}. ${w.word}`;
    }

    // mark cells with 'revealed' class (red styling)
    coords.forEach(({r,c}) => {
      const cell = this.gridEl.querySelector(`.crossword-cell[data-r="${r}"][data-c="${c}"]`);
      if (cell) cell.classList.add('revealed');
    });
    // Also draw a permanent (revealed) red line for revealed words
    const rect = this.gridEl.getBoundingClientRect();
    const points = coords.map(({r,c}) => {
      const cell = this.gridEl.querySelector(`.crossword-cell[data-r="${r}"][data-c="${c}"]`);
      if (!cell) return null;
      const elRect = cell.getBoundingClientRect();
      const x = elRect.left - rect.left + elRect.width / 2;
      const y = elRect.top - rect.top + elRect.height / 2;
      return `${x},${y}`;
    }).filter(p => p).join(' ');
    if (points) {
      const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pl.setAttribute('points', points);
      pl.setAttribute('class', 'selection-line permanent-line revealed-line');
      pl.setAttribute('stroke', 'red');
      pl.setAttribute('fill', 'none');
      pl.setAttribute('stroke-width', String(this.lineWidth));
      pl.setAttribute('stroke-linecap', 'round');
      pl.setAttribute('stroke-linejoin', 'round');
      this.overlay.appendChild(pl);
    }
  }

  showWinDialog() {
    // Use the black modal to show the congratulation message centered
    const body = `<div class="modal-body">kamu berhasil menemukan semua kata 🎉✨</div>`;
    // showPlayAgain=true, center=true to center text and actions
    this.showModal('SELAMAT !', body, true, true);
  }

  
}

