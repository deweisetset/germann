/**
 * Netlify Function: Google OAuth Token Verification & User Management
 * Endpoint: /.netlify/functions/auth-google
 * Method: POST
 * Body: { access_token: "google-access-token" }
 */

import fetch from 'node-fetch';
import mysql from 'mysql2/promise';

// Database configuration from environment variables
const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'wortle',
};

/**
 * Get a database connection
 */
async function getConnection() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        return connection;
    } catch (error) {
        console.error('Database connection failed:', error);
        throw error;
    }
}

/**
 * Generate random display name (e.g., "kucing#1234")
 */
function generateDisplayName() {
    const animals = ['kucing', 'panda', 'ular', 'burung', 'ikan'];
    const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
    const randomNumber = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return `${randomAnimal}#${randomNumber}`;
}

/**
 * Verify Google access token
 */
async function verifyGoogleToken(accessToken) {
    try {
        const verifyUrl = `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`;
        const response = await fetch(verifyUrl);
        
        if (!response.ok) {
            throw new Error(`Google verification failed: ${response.status}`);
        }
        
        const tokenInfo = await response.json();
        
        if (!tokenInfo.sub) {
            throw new Error('Invalid token: missing sub claim');
        }
        
        return tokenInfo;
    } catch (error) {
        console.error('Token verification error:', error);
        throw error;
    }
}

/**
 * Upsert user in database
 */
async function upsertUser(googleId, email, name, picture) {
    const connection = await getConnection();
    
    try {
        // Check if user exists
        const [existingUsers] = await connection.query(
            'SELECT id, display_name, total_score FROM users WHERE google_id = ?',
            [googleId]
        );
        
        let userId, displayName, totalScore;
        
        if (existingUsers.length > 0) {
            // Update existing user
            const user = existingUsers[0];
            userId = user.id;
            displayName = user.display_name;
            totalScore = user.total_score;
            
            await connection.query(
                'UPDATE users SET email = ?, name = ?, picture = ? WHERE id = ?',
                [email, name, picture, userId]
            );
        } else {
            // Create new user
            displayName = generateDisplayName();
            totalScore = 0;
            
            const [result] = await connection.query(
                'INSERT INTO users (google_id, email, name, picture, display_name, total_score) VALUES (?, ?, ?, ?, ?, ?)',
                [googleId, email, name, picture, displayName, totalScore]
            );
            
            userId = result.insertId;
        }
        
        return {
            id: userId,
            google_id: googleId,
            email,
            name,
            picture,
            display_name: displayName,
            total_score: totalScore,
        };
    } finally {
        await connection.end();
    }
}

/**
 * Netlify Handler
 */
export const handler = async (event, context) => {
    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            body: JSON.stringify({ message: 'OK' }),
        };
    }
    
    // Only POST allowed
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }
    
    try {
        const { access_token } = JSON.parse(event.body || '{}');
        
        if (!access_token) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Missing access_token' }),
            };
        }
        
        // Verify token with Google
        const tokenInfo = await verifyGoogleToken(access_token);
        
        const googleId = tokenInfo.sub;
        const email = tokenInfo.email || null;
        const name = tokenInfo.name || null;
        const picture = tokenInfo.picture || null;
        
        // Upsert user in database
        const user = await upsertUser(googleId, email, name, picture);
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
            },
            body: JSON.stringify({ user }),
        };
    } catch (error) {
        console.error('Auth error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: 'Authentication failed',
                detail: error.message,
            }),
        };
    }
};
