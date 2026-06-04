import express from 'express';
import dotenv from 'dotenv';
import { SmsmodeRcsClient, parseWebhookPayload, isIncomingMessage } from '@smsmode/rcs';
import { DoctorAppointement } from './rcs/DoctorAppointement.ts';

dotenv.config();

const app = express();
app.use(express.json());

const client = new SmsmodeRcsClient({ apiKey: process.env.API_KEY! });
const andre_phone = process.env.ANDRE_PHONE!;


async function main() {
  let rdv1 = new DoctorAppointement(true, andre_phone, client);
  rdv1.askForAppointment();

  app.post('/webhook/rcs', async (req, res) => {
    console.log('Webhook reçu :', JSON.stringify(req.body, null, 2));
    try {
      const payload = parseWebhookPayload(req.body);
      if (isIncomingMessage(payload)) {
        const postbackData = payload.body.text;
        rdv1.waitForScheduleResponse(postbackData);
      }
    } catch (e) {
      console.error('Webhook invalide :', e);
    }

    res.sendStatus(200);
  });
}

main();

app.listen(3000, () => {
  console.log('Serveur lancé sur http://localhost:3000');
});

// console.log(message.messageId);    // identifiant unique du message
// console.log(message.status.value); // "ENROUTE", "DELIVERED"...
