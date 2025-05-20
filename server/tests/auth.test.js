import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateToken, verifyToken } from '../middlewares/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test('Token generation and verification', async (t) => {
    const userId = 1;
    const token = generateToken(userId);
    
    assert.ok(token, 'Token should be generated');
    assert.strictEqual(typeof token, 'string', 'Token should be a string');
    
    const tokenData = verifyToken(token);
    assert.ok(tokenData, 'Token should be verified');
    assert.strictEqual(tokenData.userId, userId, 'Token should contain correct user ID');
});

test('Token expiration', async (t) => {
    const userId = 1;
    const token = generateToken(userId);
    
    // Simulate token expiration by modifying the token data
    const tokenData = verifyToken(token);
    tokenData.createdAt = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
    
    const expiredToken = verifyToken(token);
    assert.strictEqual(expiredToken, null, 'Expired token should return null');
});

test('Invalid token', async (t) => {
    const invalidToken = 'invalid-token';
    const tokenData = verifyToken(invalidToken);
    assert.strictEqual(tokenData, null, 'Invalid token should return null');
}); 