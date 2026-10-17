import {randomBytes} from 'node:crypto';
console.log('GMAIL_TOKEN_ENCRYPTION_KEY=' + randomBytes(32).toString('hex'));
