/**
 * Netlify Function: OpenAI Example Sentence Generator
 * Endpoint: /.netlify/functions/openai-example
 * Method: POST
 * Body: { word: "Haus" }
 */

import fetch from 'node-fetch';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Get API key from environment variable
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
    console.warn('⚠️ OPENAI_API_KEY environment variable not set');
}

/**
 * Simple in-memory cache (will be reset on function restart)
 * For persistent cache, use a database or Netlify Blobs
 */
const cache = {};

/**
 * Rate limiting using simple in-memory store
 * For production, consider using a database
 */
const rateLimits = {};
const RATE_LIMIT = 10; // requests per minute
const RATE_WINDOW = 60000; // 1 minute in ms

/**
 * Check rate limit for IP
 */
function checkRateLimit(clientIp) {
    const now = Date.now();
    
    if (!rateLimits[clientIp]) {
        rateLimits[clientIp] = [];
    }
    
    // Remove old timestamps outside the window
    rateLimits[clientIp] = rateLimits[clientIp].filter(
        timestamp => now - timestamp < RATE_WINDOW
    );
    
    // Check if limit exceeded
    if (rateLimits[clientIp].length >= RATE_LIMIT) {
        return false;
    }
    
    // Add current request
    rateLimits[clientIp].push(now);
    return true;
}

/**
 * Verify token with OpenAI
 */
async function generateExample(word) {
    if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
    }

    const prompt = `Buat satu contoh kalimat singkat dalam bahasa Jerman yang menggunakan kata "${word}".
Berikan juga terjemahan dalam bahasa Indonesia.
Output hanya berupa JSON dengan dua properti: "german" dan "translation".
Gunakan Zeitform: {Präsens / Perfekt}.
Gunakan 1 subject {ich, du, er/sie/es, wir, ihr, sie}.
Pastikan konjugasi kata kerja sesuai dengan subjek.
Jika menggunakan Perfekt, pilih auxiliary verb (haben/sein) yang tepat.

Contoh output:
{
  "german": "Das ist ein Beispiel.",
  "translation": "Ini adalah contoh."
}

Jangan tambahan penjelasan lain.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'Kamu asisten yang menulis satu kalimat Jerman singkat dan terjemahannya dalam Bahasa Indonesia. Hanya output JSON, tanpa penjelasan tambahan.',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            max_tokens: 200,
            temperature: 0.5,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid OpenAI response');
    }

    const text = data.choices[0].message.content.trim();

    // Try to parse JSON from the response
    let parsed = null;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        // If not JSON, try to extract lines
        const lines = text.split('\n').filter(line => line.trim());
        parsed = {
            german: lines[0] || text,
            translation: lines[1] || '',
        };
    }

    return {
        german: parsed.german || '',
        translation: parsed.translation || '',
    };
}

/**
 * Netlify Handler
 */
export const handler = async (event, context) => {
    // Set CORS headers
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: 'OK' }),
        };
    }

    // Only POST allowed
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }

    try {
        // Get client IP for rate limiting
        const clientIp = event.headers['x-forwarded-for']?.split(',')[0] ||
                        event.headers['client-ip'] ||
                        'unknown';

        // Check rate limit
        if (!checkRateLimit(clientIp)) {
            return {
                statusCode: 429,
                headers,
                body: JSON.stringify({ error: 'Rate limited', detail: 'Too many requests' }),
            };
        }

        // Parse request body
        const { word } = JSON.parse(event.body || '{}');

        if (!word || word.trim() === '') {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing or empty word parameter' }),
            };
        }

        const cacheKey = word.toLowerCase();

        // Check cache first
        if (cache[cacheKey]) {
            console.log(`Cache hit for word: ${word}`);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    from_cache: true,
                    result: cache[cacheKey],
                }),
            };
        }

        // Generate new example
        console.log(`Generating example for word: ${word}`);
        const result = await generateExample(word);

        // Store in cache
        cache[cacheKey] = result;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                from_cache: false,
                result,
            }),
        };
    } catch (error) {
        console.error('OpenAI function error:', error);

        // Check if it's an API key issue
        if (error.message.includes('not configured')) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    error: 'Configuration error',
                    detail: 'OpenAI API key not set. Add OPENAI_API_KEY to environment variables.',
                }),
            };
        }

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Generation failed',
                detail: error.message,
            }),
        };
    }
};
