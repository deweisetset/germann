import { getGermanWord, translateToIndonesian, isGermanWordWiktionary, getHybridWord } from './dictionary-api.js';

export class WortleGame {
    constructor() {
        this.currentRow = 0;
        this.currentCell = 0;
        this.gameOver = false;
        this.currentWord = '';
        this.targetWord = '';
        this.translation = '';
        // caches for validation results (persisted)
        this.validCache = new Set(JSON.parse(localStorage.getItem('validatedWords') || '[]'));
        this.invalidCache = new Set(JSON.parse(localStorage.getItem('invalidWords') || '[]'));
        this.validating = false; // flag while validating a guess
        this._listenersInitialized = false; // flag to prevent duplicate event listeners
        
    // DOM elements
    this.grid = document.getElementById('grid');
    this.keys = document.querySelectorAll('.key');
        
        this.initializeGame();
    }

    async initializeGame() {
        try {
            // Gunakan getHybridWord untuk mendapatkan kata target
            const wordData = await getHybridWord();
            if (!wordData || !wordData.de) {
                throw new Error('Could not get word from hybrid source');
            }

            // Set target word dan terjemahan
            this.targetWord = wordData.de.toUpperCase();
            this.translation = wordData.id || '';

            // Load daftar kata untuk validasi
            try {
                const response = await fetch('./words5.json');
                if (response.ok) {
                    const wordList = await response.json();
                    // Filter kata 5 huruf untuk validasi
                    this.validWords = wordList
                        .filter(word => word.de && word.de.length === 5)
                        .map(w => w.de.toUpperCase());
                    
                    // Pastikan kata target ada dalam daftar valid
                    if (!this.validWords.includes(this.targetWord)) {
                        this.validWords.push(this.targetWord);
                    }
                } else {
                    throw new Error('Failed to load words5.json');
                }
            } catch (error) {
                console.warn('Using minimal word list for validation:', error);
                this.validWords = [this.targetWord]; // minimal include target word
            }

            console.log(`Game initialized with word: ${this.targetWord}`);
            console.log(`Translation: ${this.translation}`);
            console.log(`Valid words loaded: ${this.validWords.length}`);
            // Message area removed; log for debugging instead
            console.log('Tebak kata bahasa Jerman!');
        } catch (error) {
            console.debug('Error initializing game (using fallback):', error);
            // Fallback to a single default word if everything fails
            this.targetWord = 'KATZE';
            this.translation = 'kucing';
            this.validWords = [this.targetWord];
        }

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Remove old listeners if they exist (for reset game case)
        if (!this._listenersInitialized) {
            // Virtual keyboard
            this.keys.forEach(key => {
                key.addEventListener('click', () => this.handleInput(key.textContent.toLowerCase()));
            });

            // Physical keyboard
            document.addEventListener('keydown', (e) => this.handleKeydown(e));
            
            this._listenersInitialized = true;
        }
    }

    handleKeydown(e) {
        if (this.gameOver) return;

        if (e.key === 'Enter') {
            if (this.validating) return; // prevent double submit while validating
            this.submitGuess();
        } else if (e.key === 'Backspace') {
            this.deleteLetter();
        } else if (e.key.match(/^[a-zäöüß]$/i)) {
            // accept ß and umlauts from physical keyboard; normalize to lowercase
            this.addLetter(e.key.toLowerCase());
        }
    }

    handleInput(value) {
        if (this.gameOver) return;

        if (value === 'enter') {
            this.submitGuess();
        } else if (value === '⌫') {
            this.deleteLetter();
        } else if (this.currentCell < 5) {
            this.addLetter(value);
        }
    }

    addLetter(letter) {
        // Normalize input: some keyboards/IME may send 'ss' instead of the German ß character.
        // If that happens, convert 'ss' to 'ß' so the grid shows the correct glyph.
        if (typeof letter === 'string' && letter.toLowerCase() === 'ss') {
            letter = 'ß';
        }

        if (this.currentCell < 5) {
            const cells = this.grid.children[this.currentRow].children;
            const cell = cells[this.currentCell];
            
            // Determine display character. We want most letters uppercase in the grid,
            // but CSS `text-transform: uppercase` converts 'ß' to 'SS'. To keep the
            // correct glyph, compute displayChar in JS and avoid letting CSS uppercase
            // turn 'ß' into 'SS'.
            const displayChar = (letter === 'ß') ? 'ß' : letter.toUpperCase();
            // Animate cell when adding letter
            cell.textContent = displayChar;
            cell.classList.add('pop');
            setTimeout(() => cell.classList.remove('pop'), 100);

            this.currentCell++;
            this.currentWord += letter;
        }
    }

    deleteLetter() {
        if (this.currentCell > 0) {
            this.currentCell--;
            const cells = this.grid.children[this.currentRow].children;
            const cell = cells[this.currentCell];
            
            // Animate cell when deleting letter
            cell.classList.add('shake');
            setTimeout(() => {
                cell.textContent = '';
                cell.classList.remove('shake');
            }, 50);

            this.currentWord = this.currentWord.slice(0, -1);
        }
    }

        // Persist validation caches to localStorage
        _saveCache() {
            try {
                localStorage.setItem('validatedWords', JSON.stringify(Array.from(this.validCache)));
                localStorage.setItem('invalidWords', JSON.stringify(Array.from(this.invalidCache)));
            } catch (e) {
                // ignore cache save errors
            }
        }

        // Generate variants to handle umlauts and ß
        _makeVariants(word) {
            const w = (word || '').toLowerCase().trim();
            const map = [['ä','ae'], ['ö','oe'], ['ü','ue'], ['ß','ss']];
            const variants = new Set([w]);

            for (const [u,a] of map) {
                if (w.includes(u)) variants.add(w.replace(new RegExp(u,'g'), a));
            }
            for (const [u,a] of map) {
                if (w.includes(a)) variants.add(w.replace(new RegExp(a,'g'), u));
            }

            return Array.from(variants);
        }

    async validateWord(word) {
        // Hybrid validation with cache + local list + dictionary API + Wiktionary
        const raw = word.toLowerCase().trim();
        const variants = this._makeVariants(raw);

        // 1) Local list check (this.validWords contains UPPERCASE words)
        for (const v of variants) {
            if (this.validWords && this.validWords.includes(v.toUpperCase())) return true;
        }

        // 2) Cache check
        for (const v of variants) {
            if (this.validCache.has(v.toUpperCase())) return true;
            if (this.invalidCache.has(v.toUpperCase())) return false;
        }

        // 3) Try dictionary API (dictionaryapi.dev)
        for (const v of variants) {
            try {
                const def = await getGermanWord(v);
                if (Array.isArray(def) && def.length > 0) {
                    this.validCache.add(v.toUpperCase());
                    this._saveCache();
                    return true;
                }
            } catch (e) {
                // normal fallback, jangan log
            }
        }

        // 4) Fallback to Wiktionary
        for (const v of variants) {
            try {
                const ok = await isGermanWordWiktionary(v);
                if (ok) {
                    this.validCache.add(v.toUpperCase());
                    this._saveCache();
                    return true;
                }
            } catch (e) {
                // normal fallback, jangan log
            }
        }

        // 5) Not valid -> cache and return false
        this.invalidCache.add(raw.toUpperCase());
        this._saveCache();
        return false;
    }

    // Diagnose which checks pass for a guessed word. Returns an object with details.
    async diagnoseWord(word) {
        const raw = (word || '').toLowerCase().trim();
        const variants = this._makeVariants(raw);
        const report = {
            input: raw,
            inLocalList: false,
            inValidCache: false,
            inInvalidCache: false,
            dictionaryApi: {},
            wiktionary: {},
        };

        // Local list
        for (const v of variants) {
            if (this.validWords && this.validWords.includes(v.toUpperCase())) {
                report.inLocalList = true; break;
            }
        }

        // Caches
        for (const v of variants) {
            if (this.validCache.has(v.toUpperCase())) report.inValidCache = true;
            if (this.invalidCache.has(v.toUpperCase())) report.inInvalidCache = true;
        }

        // Dictionary API
        for (const v of variants) {
            try {
                const def = await getGermanWord(v);
                report.dictionaryApi[v] = Array.isArray(def) && def.length > 0 ? true : false;
            } catch (e) {
                report.dictionaryApi[v] = 'error';
            }
        }

        // Wiktionary
        for (const v of variants) {
            try {
                const ok = await isGermanWordWiktionary(v);
                report.wiktionary[v] = !!ok;
            } catch (e) {
                report.wiktionary[v] = 'error';
            }
        }

        return report;
    }

    async submitGuess() {
        if (this.currentWord.length !== 5) {
            this.showMessage('Kata harus 5 huruf!', 'error');
            this.shakeRow();
            return;
        }

        // Validate: show checking UI, prevent double submit
        this.validating = true;
        this.showMessage('Memeriksa kata...', 'info');
        const isValid = await this.validateWord(this.currentWord);
        this.validating = false;

        if (!isValid) {
            // run diagnostic to give user more helpful feedback
            const report = await this.diagnoseWord(this.currentWord);
            console.log('Validation report for', this.currentWord, report);

            // If any external source recognizes the word, accept it by caching variants
            const apiRecognized = Object.values(report.dictionaryApi).some(v => v === true);
            const wikiRecognized = Object.values(report.wiktionary).some(v => v === true);

            if (apiRecognized || wikiRecognized) {
                // add the entered word and its variants to valid cache so it can be used
                const variants = this._makeVariants(this.currentWord.toLowerCase());
                for (const v of variants) {
                    this.validCache.add(v.toUpperCase());
                }
                this._saveCache();
                // continue as if valid
                console.log('Auto-accepted external-valid word and cached variants:', variants);
                // no return here — proceed with normal reveal logic
            } else {
                // Otherwise keep existing behavior
                this.showMessage('Coba kata bahasa Jerman yang lain!', 'error');
                this.shakeRow();
                return;
            }
        }

        // Check letters and update colors
        const cells = this.grid.children[this.currentRow].children;
        const result = this.checkGuess();
        
        // Animate reveal
        for (let i = 0; i < result.length; i++) {
            const cell = cells[i];
            const { letter, status } = result[i];
            
            // Delay each cell reveal
            setTimeout(() => {
                cell.classList.add('flip');
                setTimeout(() => {
                    cell.classList.add(status);
                    // Update keyboard colors
                    this.updateKeyboardColor(letter, status);
                }, 250);
            }, i * 100);
        }

        // Check win/lose conditions
        if (this.currentWord.toUpperCase() === this.targetWord) {
            // Calculate score: 100 for row 0, 80 for row 1, etc
            const scoreMap = [100, 80, 70, 50, 30, 10];
            const score = scoreMap[this.currentRow] || 0;
            
            setTimeout(() => {
                // Save score to server if user is logged in
                if (window.currentUser && window.currentUser.id) {
                    this.saveScoreToServer(score, this.targetWord, this.currentRow + 1);
                }
                // show end dialog for win
                this.showEndDialog(true, score);
                this.gameOver = true;
            }, 1500);
        } else if (this.currentRow === 5) {
            setTimeout(() => {
                // show end dialog for lose
                this.showEndDialog(false, 0);
                this.gameOver = true;
            }, 1500);
        }

        this.currentRow++;
        this.currentCell = 0;
        this.currentWord = '';
    }

    checkGuess() {
        const result = [];
        const targetLetters = [...this.targetWord.toLowerCase()];
        const guessLetters = [...this.currentWord.toLowerCase()];
        
        // First pass: Mark correct letters
        for (let i = 0; i < guessLetters.length; i++) {
            if (guessLetters[i] === targetLetters[i]) {
                result[i] = { letter: guessLetters[i], status: 'correct' };
                targetLetters[i] = null;
                guessLetters[i] = null;
            }
        }
        
        // Second pass: Mark present/absent letters
        for (let i = 0; i < guessLetters.length; i++) {
            if (guessLetters[i] === null) continue;
            
            const targetIndex = targetLetters.indexOf(guessLetters[i]);
            if (targetIndex !== -1) {
                result[i] = { letter: guessLetters[i], status: 'present' };
                targetLetters[targetIndex] = null;
            } else {
                result[i] = { letter: guessLetters[i], status: 'absent' };
            }
        }
        
        return result;
    }

    updateKeyboardColor(letter, status) {
        const key = Array.from(this.keys).find(k => k.textContent.toLowerCase() === letter);
        if (key) {
            if (status === 'correct') {
                key.className = 'key correct';
            } else if (status === 'present' && !key.classList.contains('correct')) {
                key.className = 'key present';
            } else if (status === 'absent' && !key.classList.contains('correct') && !key.classList.contains('present')) {
                key.className = 'key absent';
            }
        }
    }

    // showMessage used to update an on-page message area. That area was removed.
    // Keep a lightweight console fallback for debugging.
    showMessage(text, type) {
        console.log(`MESSAGE [${type || 'info'}]: ${text}`);
    }

    // Show end-game dialog. If win==true show success content, otherwise show losing content.
    async showEndDialog(win, score = 0) {
        // build messages
        const target = this.targetWord;
        const translation = this.translation || '—';

        // create overlay
        const overlay = document.createElement('div');
        overlay.className = 'overlay';

        const dialog = document.createElement('div');
        dialog.className = 'end-dialog';

        const title = document.createElement('h2');
        title.textContent = win ? 'JAWABANMU BENAR' : 'JAWABAN YANG BENAR ADALAH';

        // Add score display if win
        let scoreEl = null;
        if (win && score > 0) {
            scoreEl = document.createElement('p');
            scoreEl.style.fontSize = '18px';
            scoreEl.style.color = '#43A047';
            scoreEl.style.fontWeight = 'bold';
            scoreEl.textContent = `+${score} Poin!`;
        }

        const msg = document.createElement('p');
        // If we don't have a translation yet, try to fetch one
        if (!this.translation || this.translation === '') {
            msg.textContent = 'Mencari terjemahan...';
            // attempt to fetch translation (non-blocking UI)
            try {
                const t = await translateToIndonesian(target.toLowerCase());
                this.translation = t || '—';
            } catch (e) {
                console.debug('Translation fetch in dialog (normal fallback):', e);
                this.translation = '—';
            }
            // update message after fetching
            msg.innerHTML = `"${target}" artinya "${this.translation}".`;
        } else {
            msg.innerHTML = `"${target}" artinya "${translation}".`;
        }

        // AI example placeholder
        const aiContainer = document.createElement('div');
        aiContainer.className = 'ai-example';
        aiContainer.textContent = 'Mencari contoh kalimat (AI)...';

        const btn = document.createElement('button');
        btn.className = 'btn-play-again';
        btn.textContent = 'Bermain lagi?';
        btn.addEventListener('click', () => {
            // Remove overlay and reset game state without reloading page
            document.body.removeChild(overlay);
            this.resetGame();
        });

        dialog.appendChild(title);
        if (scoreEl) dialog.appendChild(scoreEl);
        dialog.appendChild(msg);
        dialog.appendChild(aiContainer);
        dialog.appendChild(btn);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Fetch AI example sentence (non-blocking but awaited here so user sees result shortly)
        try {
            const example = await this.fetchExampleSentence(target);
            if (example && (example.german || example.translation)) {
                // clear placeholder and append formatted content
                aiContainer.innerHTML = `<strong>Contoh (DE):</strong> ${example.german || ''}<br/><strong>Terjemahan:</strong> ${example.translation || ''}`;
            } else {
                aiContainer.textContent = 'Contoh kalimat tidak tersedia.';
            }
        } catch (e) {
            console.debug('AI example fetch failed (normal):', e);
            aiContainer.textContent = 'Contoh kalimat tidak tersedia.';
        }
    }

    async fetchExampleSentence(word) {
        try {
            // Use Netlify Function endpoint
            const res = await fetch('/.netlify/functions/openai-example', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({word})
            });
            if (!res.ok) {
                // Try to parse error details
                let errText = await res.text();
                console.debug('AI endpoint status:', res.status);
                return null;
            }
            const data = await res.json();
            return data.result || null;
        } catch (err) {
            console.debug('AI fetch error (normal):', err);
            return null;
        }
    }

    shakeRow() {
        const row = this.grid.children[this.currentRow];
        row.classList.add('shake');
        setTimeout(() => row.classList.remove('shake'), 500);
    }

    async resetGame() {
        // Reset game state without reloading page (keeps login session)
        this.currentRow = 0;
        this.currentCell = 0;
        this.gameOver = false;
        this.currentWord = '';
        this.targetWord = '';
        this.translation = '';
        this.validating = false;

        // Clear grid
        const cells = this.grid.querySelectorAll('.grid-cell');
        cells.forEach(cell => {
            cell.textContent = '';
            cell.className = 'grid-cell';
        });

        // Reset keyboard styling
        this.keys.forEach(key => {
            key.className = 'key';
            if (key.textContent === 'Enter') key.classList.add('wide');
            if (key.textContent === '⌫') key.classList.add('wide');
        });

        // Initialize new game (without re-adding event listeners)
        await this.initializeGame();
        // Note: setupEventListeners() is only called once in initializeGame() via _listenersInitialized flag
    }

    // Save score to server
    async saveScoreToServer(score, word, attempts) {
        try {
            const res = await fetch('api/save-score.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: window.currentUser.id,
                    score: score,
                    word: word,
                    attempts: attempts
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                // Update window.currentUser dengan total_score terbaru
                window.currentUser.total_score = data.user.total_score;
                localStorage.setItem('currentUser', JSON.stringify(window.currentUser));
                
                // Dispatch event agar UI update total score
                const event = new CustomEvent('scoreUpdated', { detail: data.user });
                window.dispatchEvent(event);
                
                console.log('Score saved:', score, 'New total:', data.user.total_score);
            } else {
                console.error('Failed to save score:', data);
            }
        } catch (err) {
            console.error('Save score error:', err);
        }
    }
}

// UI Helper Functions - exported for use in HTML
export function displayPlayerInfo() {
    const playerInfoEl = document.getElementById('playerInfo');
    if (!playerInfoEl) return;
    
    const user = window.currentUser || (localStorage.getItem('currentUser') && JSON.parse(localStorage.getItem('currentUser')));
    if (user && user.display_name) {
        const totalScore = user.total_score || 0;
        playerInfoEl.textContent = `${user.display_name} : ${totalScore}`;
        playerInfoEl.style.display = 'block';
    } else {
        playerInfoEl.style.display = 'none';
    }
}

export function initUIHandlers() {
    // Display player info on initial load
    displayPlayerInfo();
    
    // Update when user logs in/out
    window.addEventListener('userLoggedIn', displayPlayerInfo);
    window.addEventListener('userLoggedOut', () => {
        const playerInfoEl = document.getElementById('playerInfo');
        if (playerInfoEl) playerInfoEl.style.display = 'none';
    });
    
    // Update when score changes
    window.addEventListener('scoreUpdated', displayPlayerInfo);

    // Info button: show overlay with how-to-play steps
    const infoBtn = document.getElementById('infoBtn');
    if (infoBtn) {
        infoBtn.addEventListener('click', () => {
            const overlay = document.createElement('div');
            overlay.className = 'overlay';

            const dialog = document.createElement('div');
            dialog.className = 'end-dialog';

            const title = document.createElement('h2');
            title.textContent = 'Cara Bermain';

            const ol = document.createElement('ol');
            const steps = [
                'Tebak kata bahasa jerman dalam 6 percobaan.',
                'Tekan enter untuk melihat hasil.',
                'Kotak abu-abu menandakan hurufnya salah dan tidak ada di kata yang benar.',
                'Kotak kuning menandakan hurufnya ada di kata yang benar, tapi posisi salah.',
                'Kotak hijau menandakan hurufnya benar dan ada di posisi yang benar.',
            ];
            steps.forEach(s => { const li = document.createElement('li'); li.textContent = s; ol.appendChild(li); });

            const btnClose = document.createElement('button');
            btnClose.className = 'btn-play-again';
            btnClose.textContent = 'Tutup';
            btnClose.addEventListener('click', () => document.body.removeChild(overlay));

            dialog.appendChild(title);
            dialog.appendChild(ol);
            dialog.appendChild(btnClose);
            overlay.appendChild(dialog);

            // close when clicking outside dialog
            overlay.addEventListener('click', (e) => { if (e.target === overlay) document.body.removeChild(overlay); });

            document.body.appendChild(overlay);
        });
    }

    // Hint button placeholder: clickable but no rules yet
    const hintBtn = document.getElementById('hintBtn');
    if (hintBtn) {
        hintBtn.addEventListener('click', () => {
            console.log('Hint button clicked (placeholder)');
            // visual feedback: brief scale animation
            hintBtn.classList.add('pop');
            setTimeout(() => hintBtn.classList.remove('pop'), 150);
        });
    }

    // Leaderboard button
    const leaderboardBtn = document.getElementById('leaderboardBtn');
    if (leaderboardBtn) {
        leaderboardBtn.addEventListener('click', showLeaderboard);
    }
}

async function showLeaderboard() {
    try {
        const res = await fetch('api/get-leaderboard.php');
        const data = await res.json();

        if (!data.success || !data.leaderboard) {
            alert('Gagal memuat leaderboard');
            return;
        }

        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'overlay';

        const dialog = document.createElement('div');
        dialog.className = 'leaderboard-dialog';

        // Title
        const title = document.createElement('h2');
        title.textContent = '🏆 LEADERBOARD';
        title.className = 'leaderboard-title';

        // Table
        const table = document.createElement('table');
        table.className = 'leaderboard-table';

        // Table header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        const headers = ['Rank', 'Player', 'Score'];
        headers.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Table body
        const tbody = document.createElement('tbody');
        data.leaderboard.forEach((player, idx) => {
            const row = document.createElement('tr');
            
            // Rank with medal emoji
            const rankCell = document.createElement('td');
            let medal = '';
            if (idx === 0) medal = '🥇';
            else if (idx === 1) medal = '🥈';
            else if (idx === 2) medal = '🥉';
            rankCell.textContent = medal ? `${medal} ${player.rank}` : player.rank;
            rankCell.className = 'rank-cell';
            
            // Player name
            const nameCell = document.createElement('td');
            nameCell.textContent = player.display_name;
            nameCell.className = 'name-cell';
            
            // Score
            const scoreCell = document.createElement('td');
            scoreCell.textContent = player.total_score;
            scoreCell.className = 'score-cell';
            
            row.appendChild(rankCell);
            row.appendChild(nameCell);
            row.appendChild(scoreCell);
            tbody.appendChild(row);
        });
        table.appendChild(tbody);

        // Close button
        const btnClose = document.createElement('button');
        btnClose.className = 'btn-play-again';
        btnClose.textContent = 'Tutup';
        btnClose.addEventListener('click', () => document.body.removeChild(overlay));

        dialog.appendChild(title);
        dialog.appendChild(table);
        dialog.appendChild(btnClose);
        overlay.appendChild(dialog);

        // Close when clicking outside
        overlay.addEventListener('click', (e) => { if (e.target === overlay) document.body.removeChild(overlay); });

        document.body.appendChild(overlay);
    } catch (err) {
        console.error('Leaderboard error:', err);
        alert('Error loading leaderboard');
    }
}