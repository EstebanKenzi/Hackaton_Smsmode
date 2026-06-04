import * as dotenv from 'dotenv';
import { SmsmodeRcsClient } from '@smsmode/rcs';
dotenv.config();
const API_KEY = process.env.API_KEY;
const ANDRE_PHONE = process.env.ANDRE_PHONE;
const client = new SmsmodeRcsClient({ apiKey: API_KEY });
// console.log(message.messageId);    // identifiant unique du message
// console.log(message.status.value); // "ENROUTE", "DELIVERED"...
