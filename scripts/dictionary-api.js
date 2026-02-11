// Fungsi untuk mengambil definisi kata bahasa Jerman dari Wiktionary (de.wiktionary.org)
// Mengambil bagian "Deutsch" (jika ada) menggunakan MediaWiki API (action=parse prop=sections -> prop=text)
// Jika tidak ditemukan, fallback mencoba REST HTML endpoint.
async function getGermanWord(word) {
    try {
        if (!word || typeof word !== 'string') return null;
        const endpoint = 'https://de.wiktionary.org/w/api.php';
        const title = word;

        // 1) Ambil daftar section untuk menemukan index dari section "Deutsch"
        const secParams = new URLSearchParams({
            action: 'parse',
            page: title,
            prop: 'sections',
            format: 'json',
            origin: '*'
        });

        let res = await fetch(`${endpoint}?${secParams.toString()}`);
        if (!res.ok) {
            // jika request gagal, coba fallback ke REST API HTML (ini normal, jangan log)
        } else {
            const secData = await res.json();
            const sections = secData && secData.parse && secData.parse.sections;
            if (Array.isArray(sections)) {
                // cari section dengan nama/anchor Deutsch (case-insensitive)
                const deutsch = sections.find(s => /Deutsch/i.test(s.line) || /Deutsch/i.test(s.anchor));
                if (deutsch && deutsch.index) {
                    // ambil HTML untuk section tersebut
                    const idx = deutsch.index;
                    const textParams = new URLSearchParams({
                        action: 'parse',
                        page: title,
                        prop: 'text',
                        section: idx,
                        format: 'json',
                        origin: '*'
                    });

                    res = await fetch(`${endpoint}?${textParams.toString()}`);
                    if (res.ok) {
                        const textData = await res.json();
                        const html = textData && textData.parse && textData.parse.text && textData.parse.text['*'];
                        return {
                            title: title,
                            source: 'wiktionary-parse-section',
                            sectionIndex: idx,
                            html: html || ''
                        };
                    }
                }
            }
        }

        // 2) Fallback: coba REST HTML endpoint (mengambil seluruh halaman sebagai HTML)
        try {
            const restUrl = `https://de.wiktionary.org/api/rest_v1/page/html/${encodeURIComponent(title)}`;
            const restRes = await fetch(restUrl, { headers: { 'Accept': 'text/html' } });
            if (restRes.ok) {
                const pageHtml = await restRes.text();
                return {
                    title: title,
                    source: 'wiktionary-rest-html',
                    html: pageHtml
                };
            }
        } catch (err) {
            // fallback gagal, itu normal — jangan log error
        }

        // jika semua gagal, kembalikan null
        return null;
    } catch (error) {
        console.debug('Wiktionary fetch failed (normal fallback):', error);
        return null;
    }
}

// Validate a German word using de.wiktionary.org MediaWiki API.
// Returns true if the Wiktionary page contains a Deutsch section.
async function isGermanWordWiktionary(word) {
    try {
        const endpoint = 'https://de.wiktionary.org/w/api.php';

        // Try multiple title variants: as-is and capitalized (MediaWiki normalizes first letter)
        const variants = [word, word.charAt(0).toUpperCase() + word.slice(1)];

        // Helper to extract revision content supporting slots (modern MW) and old '*' field
        function extractContentFromPage(page) {
            if (!page || !page.revisions || !page.revisions[0]) return '';
            const rev = page.revisions[0];
            // Newer MediaWiki uses slots.main['*']
            if (rev.slots && rev.slots.main && typeof rev.slots.main['*'] === 'string') return rev.slots.main['*'];
            // Older format
            if (typeof rev['*'] === 'string') return rev['*'];
            // Some APIs return content in content or other fields
            if (rev.content && typeof rev.content === 'string') return rev.content;
            return '';
        }

        for (const title of variants) {
            const params = new URLSearchParams({
                action: 'query',
                prop: 'revisions',
                rvprop: 'content',
                redirects: '1', // follow redirects
                format: 'json',
                titles: title,
                origin: '*'
            });

            const url = `${endpoint}?${params.toString()}`;
            const res = await fetch(url);
            if (!res.ok) continue;
            const data = await res.json();
            const pages = data.query && data.query.pages;
            if (!pages) continue;

            const page = Object.values(pages)[0];
            if (!page) continue;
            const content = extractContentFromPage(page);
            if (!content) continue;

            // Look for common markers of a Deutsch section or templates used on Wiktionary
            const patterns = [
                /==\s*Deutsch\s*==/i,
                /===\s*Deutsch\s*===/i,
                /\{\{\s*Sprache\s*\|\s*Deutsch\s*\}\}/i,
                /\{\{\s*de\s*\}\}/i,
                /\{\{\s*Deutsch\s*\}\}/i
            ];

            for (const re of patterns) {
                if (re.test(content)) return true;
            }
        }

        return false;
    } catch (error) {
        console.debug('Wiktionary check failed (normal fallback):', error);
        return false;
    }
}

// Fungsi untuk mengambil terjemahan menggunakan MyMemory API (gratis, tidak perlu API key)
async function translateToIndonesian(germanWord) {
    try {
        const response = await fetch(
            `https://api.mymemory.translated.net/get?q=${germanWord}&langpair=de|id`
        );
        const data = await response.json();
        return data.responseData.translatedText;
    } catch (error) {
        console.debug('Translation failed (normal fallback):', error);
        return null;
    }
}

// Fungsi untuk menyimpan kata ke data.json
async function saveWordToJSON(germanWord, indonesianTranslation) {
    try {
        const word = {
            word: germanWord.toUpperCase(),
            translation: indonesianTranslation,
            length: germanWord.length,
            timestamp: new Date().toISOString()
        };

        // Baca file data.json yang ada
        const response = await fetch('/data.json');
        const existingData = await response.json();
        
        // Tambahkan kata baru
        if (Array.isArray(existingData)) {
            existingData.push({
                de: word.word,
                en: word.translation // menggunakan format yang sama dengan data existing
            });
        }

        // Simpan kembali ke file
        const saveResponse = await fetch('/save-word.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(existingData)
        });

        return await saveResponse.json();
    } catch (error) {
        console.error('Error saving word:', error);
        return null;
    }
}

// Fungsi untuk mencari kata Jerman dengan panjang tertentu
async function findGermanWords(length = 5) {
    const commonWords = [
        'katze', 'hunde', 'klein', 'gross', 'musik',
        'liebe', 'tisch', 'stuhl', 'bauer', 'leben',
        'essen', 'gehen', 'braun', 'gruen', 'malen',
        'stadt', 'fluss', 'berge', 'gabel', 'sonne'
    ];

    const words = [];
    
    for (const word of commonWords) {
        if (word.length === length) {
            const definition = await getGermanWord(word);
            if (definition) {
                const translation = await translateToIndonesian(word);
                if (translation) {
                    await saveWordToJSON(word, translation);
                    words.push({ german: word, indonesian: translation });
                }
            }
        }
    }

    return words;
}

// Daftar kata Jerman 5 huruf yang umum digunakan
const germanFiveLetterWords = [
    'katze', 'hunde', 'klein', 'gross', 'musik',
    'liebe', 'tisch', 'stuhl', 'bauer', 'leben',
    'essen', 'gehen', 'braun', 'gruen', 'malen',
    'stadt', 'fluss', 'berge', 'gabel', 'sonne',
    'kleid', 'bitte', 'danke', 'guten', 'mauer',
    'blume', 'bauen', 'farbe', 'karte', 'lampe'
];

// Fungsi untuk mendapatkan kata secara hybrid (prioritaskan lokal, toleran terhadap kegagalan API)
async function getHybridWord() {
    try {
        // 1) Coba ambil dari file lokal words5.json terlebih dahulu
        try {
            const res = await fetch('./words5.json');
            if (res.ok) {
                const list = await res.json();
                const five = list
                    .filter(w => w.de && typeof w.de === 'string' && w.de.length === 5)
                    .map(w => w.de);

                if (five.length > 0) {
                    const pick = five[Math.floor(Math.random() * five.length)];
                    let translation = '';
                    try {
                        translation = await translateToIndonesian(pick) || '';
                    } catch (e) {
                        console.warn('Translation failed for local word:', pick, e);
                    }
                    return { de: pick, id: translation };
                }
            }
        } catch (e) {
            console.warn('Could not load local words5.json:', e);
            // lanjut ke seed list
        }

        // 2) Jika lokal tidak tersedia/ kosong, gunakan seed list dan coba validasi/terjemahan
        const shuffled = germanFiveLetterWords.slice().sort(() => 0.5 - Math.random());

        for (const word of shuffled) {
            // Coba validasi terlebih dahulu (toleran terhadap error)
            let isValid = false;
            try {
                isValid = await isGermanWordWiktionary(word);
            } catch (e) {
                // fallback, jangan log
                isValid = false;
            }

            // Coba terjemahan (toleran terhadap error)
            let translation = '';
            try {
                translation = (await translateToIndonesian(word)) || '';
            } catch (e) {
                // fallback, jangan log
            }

            // Terima kata jika setidaknya salah satu mekanisme berhasil:
            // - validasi berhasil OR - terjemahan tersedia
            if (isValid || translation) {
                return { de: word, id: translation };
            }
        }

        // 3) Jika semua langkah gagal karena API/CORS, fallback ke kata seed random tanpa memaksa validasi
        const fallback = germanFiveLetterWords[Math.floor(Math.random() * germanFiveLetterWords.length)];
        let fallbackTranslation = '';
        try { fallbackTranslation = (await translateToIndonesian(fallback)) || ''; } catch (e) { /* ignore */ }
        return { de: fallback, id: fallbackTranslation };
    } catch (error) {
        console.debug('Unexpected error in getHybridWord:', error);
        return { de: 'katze', id: 'kucing' };
    }
}

// Export fungsi-fungsi yang akan digunakan
export {
    getGermanWord,
    isGermanWordWiktionary,
    translateToIndonesian,
    saveWordToJSON,
    findGermanWords,
    getHybridWord  // Tambahkan fungsi baru ke exports
};