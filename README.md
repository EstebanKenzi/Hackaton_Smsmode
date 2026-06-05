# Hackaton Smsmode

Plateforme de prise de rendez-vous avec conversation RCS, reservation de creneaux, ajout calendrier et partage d'itineraire.

## Objectif du projet

Automatiser le parcours de rendez-vous patient:

1. Invitation RCS a prendre rendez-vous.
2. Choix d'un creneau disponible.
3. Confirmation + ajout au calendrier.
4. Fallback SMS si RCS non delivre.

## Fonctionnalites presentes

### 1) API de gestion des creneaux

Utilite:
- Centralise les creneaux disponibles/reserves.
- Evite les doubles reservations via mutex.
- Expose des endpoints simples pour un dashboard ou un bot.

Ou c'est code:
- `server.ts`
- `slots.ts`
- `data/slots.json`

Endpoints:
- `GET /api/slots`: retourne tous les creneaux.
- `GET /api/slots/available`: retourne uniquement les creneaux libres.
- `GET /api/slots/:slotId`: detail d'un creneau.
- `POST /api/slots/:slotId/book`: reserve un creneau (body: `{ "phone": "336XXXXXXXX" }`).

Exemple type (recoder cette fonctionnalite):

```ts
import express from 'express';

const app = express();
app.use(express.json());

app.post('/api/slots/:slotId/book', async (req, res) => {
  const { slotId } = req.params;
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone requis' });

  const ok = await bookSlot(slotId, phone);
  if (!ok) return res.status(409).json({ error: 'deja reserve' });

  return res.json({ message: 'reserve', slotId, phone });
});
```

### 2) Conversation RCS de prise de rendez-vous

Utilite:
- Interaction guidée avec boutons de reponse.
- Parcours complet: oui/non/plus tard -> choix de creneau -> confirmation.

Ou c'est code:
- `rcs/DoctorAppointement.ts`
- `server.ts` (`POST /api/ask-appointment` et `POST /webhook/rcs`)

Details du flux:
- Message initial: "Souhaitez-vous prendre un rendez-vous ?"
- Si "Oui": envoi des creneaux disponibles.
- Selection d'un creneau: reservation + confirmation calendrier.
- Reponses reminder gerees: confirmer / annuler / modifier.

Exemple type (recoder l'envoi RCS avec suggestions):

```ts
await client.send({
  recipient: { to: phone },
  callbackUrlMo: 'https://votre-domaine/webhook/rcs',
  body: {
    type: 'TEXT',
    text: 'Souhaitez-vous prendre un rendez-vous ?',
    suggestions: [
      { type: 'REPLY', text: 'Oui', postbackData: 'oui' },
      { type: 'REPLY', text: 'Plus tard', postbackData: 'plus_tard' },
      { type: 'REPLY', text: 'Non', postbackData: 'non' }
    ]
  }
});
```

### 3) Webhook RCS (traitement des reponses)

Utilite:
- Recoit les interactions utilisateur en temps reel.
- Route les actions vers le bon assistant (RDV + map).

Ou c'est code:
- `server.ts` route `POST /webhook/rcs`

Exemple type (recoder le webhook):

```ts
app.post('/webhook/rcs', async (req, res) => {
  const payload = parseWebhookPayload(req.body);
  if (isIncomingMessage(payload)) {
    const action = payload.body?.postbackData ?? payload.body?.text;
    await appointmentHandler.handle(action, payload);
  }
  res.sendStatus(200);
});
```

### 4) Fallback SMS si echec de delivrabilite RCS

Utilite:
- Garantit la continuité du contact client.
- Si le message RCS n'est pas `DELIVERED`, envoi SMS automatique.

Ou c'est code:
- `rcs/DoctorAppointement.ts`
- `rcs/sms.ts`

Exemple type:

```ts
if (deliveryStatus !== 'DELIVERED') {
  await sendSMS(phone, 'Bonjour, souhaitez-vous prendre un RDV ? OUI/NON', apiKey);
}
```

### 5) Ajout au calendrier

Utilite:
- Permet au patient d'ajouter le RDV en un clic (RCS suggestion calendrier).
- Possibilite de telecharger un `.ics` via API.

Ou c'est code:
- `rcs/DoctorAppointement.ts` (suggestion `CREATE_CALENDAR_EVENT`)
- `calendar.ts`
- `server.ts` endpoint `GET /api/slots/:slotId/calendar`

Exemple type (fichier ICS):

```ts
import ICalGenerator from 'ical-generator';

export function toIcs(slot: Slot): string {
  return ICalGenerator({
    name: 'Rendez-vous',
    events: [{
      start: new Date(slot.isoStart),
      end: new Date(slot.isoEnd),
      summary: slot.label,
    }]
  }).toString();
}
```

### 6) Partage de position et guidage carte

Utilite:
- Demande de position au patient.
- Ouvre l'application de navigation choisie.

Ou c'est code:
- `rcs/map.ts`

Flux:
- Demande de geolocalisation (`REQUEST_LOCATION`).
- Proposition du choix d'app (Google Maps / Waze / Apple Plans).
- Envoi du lien route (`OPEN_URL`).

Exemple type:

```ts
await client.send({
  recipient: { to: phone },
  body: {
    type: 'TEXT',
    text: 'Dans quelle application ouvrir le trajet ?',
    suggestions: [
      { type: 'REPLY', text: 'Google Maps', postbackData: 'map_gmaps' },
      { type: 'REPLY', text: 'Waze', postbackData: 'map_waze' }
    ]
  }
});
```

### 7) Scheduler de reminders (module pret)

Utilite:
- Envoi automatique d'un rappel 2h avant RDV.
- Actions rapides: confirmer, annuler, modifier.

Ou c'est code:
- `notifications.ts`

Note:
- Le module existe et est complet, mais n'est pas encore branche dans `server.ts`.

Exemple type (activation):

```ts
const manager = createNotificationManager(client, 'Cabinet Medical', '10 rue Exemple, Paris');
manager.startScheduler();
```

### 8) Dashboard React

Utilite:
- Visualisation simple des creneaux libres vs reserves.
- Formulaire pour inviter un patient (UI en place, envoi RCS a brancher).

Ou c'est code:
- `dashboard/src/App.tsx`
- `dashboard/public/slots.json`

## Comment lancer le projet

### Prerequis

- Node.js 20+
- npm
- Une API key Smsmode valide
- Un endpoint webhook public pour recevoir les callbacks RCS (ex: ngrok)

### 1) Installer les dependances

```bash
npm install
```

### 2) Configurer l'environnement

Creer un fichier `env/.env.keys` (utilise par `server.ts`) avec:

```env
API_KEY=VOTRE_API_KEY_SMSMODE
ANDRE_PHONE=336XXXXXXXX
COMPANY_NAME=Cabinet Medical
COMPANY_ADDRESS=10 rue Exemple, Paris
CALENDAR_TIMEZONE=Europe/Paris
```

### 3) Lancer l'API backend

```bash
npm run dev
```

Serveur:
- `http://localhost:3000`

### 4) Lancer le dashboard

```bash
npm run dashboard
```

Dashboard:
- URL affichee par Vite (souvent `http://localhost:5173`)

## Tests rapides d'API (curl)

Lister les creneaux:

```bash
curl http://localhost:3000/api/slots
```

Creneaux disponibles:

```bash
curl http://localhost:3000/api/slots/available
```

Reserver un creneau:

```bash
curl -X POST http://localhost:3000/api/slots/slot-1/book \
  -H "Content-Type: application/json" \
  -d '{"phone":"33612345678"}'
```

Telecharger le calendrier d'un creneau:

```bash
curl -OJ http://localhost:3000/api/slots/slot-1/calendar
```

Declencher le message initial RCS:

```bash
curl -X POST http://localhost:3000/api/ask-appointment
```

## Structure du projet

- `server.ts`: API Express + webhook RCS + demarrage conversation.
- `slots.ts`: logique de lecture/ecriture des creneaux.
- `calendar.ts`: generation `.ics`.
- `notifications.ts`: scheduler de rappels (a brancher).
- `rcs/DoctorAppointement.ts`: orchestration conversation RDV.
- `rcs/map.ts`: collecte de position et liens de navigation.
- `rcs/sms.ts`: envoi SMS fallback.
- `dashboard/`: interface React (monitoring creneaux).

## Pistes d'amelioration

1. Brancher `createNotificationManager` dans `server.ts` pour activer les rappels automatiques.
2. Connecter le bouton `sendRCS` du dashboard a `POST /api/ask-appointment`.
3. Remplacer le stockage JSON par une base SQL (historique, concurrence, audit).
4. Externaliser les `callbackUrlMo` hardcodes en variable d'environnement.


## Credit
- Nathan MUZAY
- Esteban KENZI
- Achraf NAIT BELKACEM
- André RODRIGUES CRUZ
- Matis FARDEAU