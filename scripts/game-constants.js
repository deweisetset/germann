// Daftar kata default jika data.json tidak bisa diakses
export const DEFAULT_WORDS = [
    
];

// Helper functions
export const getRandomWord = (words) => {
    return words[Math.floor(Math.random() * words.length)];
};

export const isValidWord = (word, validWords) => {
    return validWords.includes(word.toUpperCase());
};

// Game settings
export const GAME_CONFIG = {
    maxAttempts: 6,
    wordLength: 5,
    animationDelay: 250,
    messageTimeout: 3000
};