import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

let subtle = globalThis.crypto.subtle;

// same crypto tools as the browser
async function generateAESKey() {
    return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function encryptWithAES(key, data) {
    let iv = crypto.getRandomValues(new Uint8Array(12));
    let encrypted = await subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return { iv, ciphertext: new Uint8Array(encrypted) };
}

async function decryptWithAES(key, iv, ciphertext) {
    return subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
}

async function generateRSAKeyPair() {
    return subtle.generateKey(
        { name: "RSA-OAEP", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
        false,
        ["encrypt", "decrypt"]
    );
}

function generatePadding(length) {
    return crypto.getRandomValues(new Uint8Array(length));
}

// encode: 3-char length + message + random padding = always 1024 bytes
function encodeMessage(realMessage) {
    let len = String(realMessage.length).padStart(3, "0");
    let msgBytes = new TextEncoder().encode(len + realMessage);
    let padding = generatePadding(1024 - msgBytes.byteLength);
    let payload = new Uint8Array(1024);
    payload.set(msgBytes, 0);
    payload.set(padding, msgBytes.byteLength);
    return payload;
}

// decode: first 3 chars = length, then the real message
function decodeMessage(payload) {
    let str = new TextDecoder().decode(payload);
    let len = parseInt(str.slice(0, 3), 10);
    return str.slice(3, 3 + len);
}

// --- tests ---

describe('AES encrypt/decrypt', () => {
    it('encrypt and decrypt returns the same message', async () => {
        let key = await generateAESKey();
        let msg = new TextEncoder().encode('hello world');
        let result = await encryptWithAES(key, msg);
        let decrypted = await decryptWithAES(key, result.iv, result.ciphertext);
        assert.equal(new TextDecoder().decode(decrypted), 'hello world');
    });

    it('wrong key fails to decrypt', async () => {
        let key1 = await generateAESKey();
        let key2 = await generateAESKey();
        let msg = new TextEncoder().encode('secret');
        let result = await encryptWithAES(key1, msg);
        try {
            await decryptWithAES(key2, result.iv, result.ciphertext);
            assert.fail('should have thrown');
        } catch (e) {
            assert.ok(e);
        }
    });
});

describe('RSA encrypt/decrypt', () => {
    it('public key encrypts, private key decrypts', async () => {
        let keyPair = await generateRSAKeyPair();
        let data = new Uint8Array(256);
        crypto.getRandomValues(data);
        let encrypted = await subtle.encrypt({ name: 'RSA-OAEP' }, keyPair.publicKey, data);
        let decrypted = await subtle.decrypt({ name: 'RSA-OAEP' }, keyPair.privateKey, encrypted);
        assert.deepEqual(new Uint8Array(decrypted), data);
    });
});

describe('message encoding', () => {
    it('encode then decode returns the original message', () => {
        let payload = encodeMessage('ciao');
        assert.equal(payload.byteLength, 1024);
        assert.equal(decodeMessage(payload), 'ciao');
    });

    it('empty message (dummy) works too', () => {
        let payload = encodeMessage('');
        assert.equal(payload.byteLength, 1024);
        assert.equal(decodeMessage(payload), '');
    });

    it('always padded to 1024 bytes', () => {
        let payload = encodeMessage('test');
        assert.equal(payload.byteLength, 1024);
    });
});

describe('padding', () => {
    it('has the right length', () => {
        let p = generatePadding(500);
        assert.equal(p.byteLength, 500);
    });

    it('two calls produce different random bytes', () => {
        let a = generatePadding(100);
        let b = generatePadding(100);
        let different = false;
        for (let i = 0; i < 100; i++) {
            if (a[i] !== b[i]) { different = true; break; }
        }
        assert.ok(different);
    });
});
