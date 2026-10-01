# Hackaton Smsmode — Prise de rendez-vous par RCS

Plateforme de prise de rendez-vous conversationnelle bâtie sur l'API **RCS de smsmode**. Le patient reçoit une invitation RCS, choisit un créneau, reçoit une confirmation avec ajout au calendrier et un guidage d'itinéraire — le tout par messages enrichis, avec repli SMS si le RCS n'est pas délivré.

## Fonctionnalités

- **Conversation RCS guidée** — invitation, confirmation, saisie du nom, choix d'un créneau (`DoctorAppointement`).
- **Gestion des créneaux** — liste, disponibilité, réservation atomique (verrou `async-mutex`), persistance fichier (`data/slots.json`).
- **Fichier calendrier** — génération d'un `.ics` téléchargeable (`ical-generator`).
- **Guidage d'itinéraire** — demande de localisation et envoi d'un itinéraire vers le cabinet (`MapAssistant`).
- **Repli SMS** — bascule vers l'API SMS smsmode si le RCS échoue (`src/rcs/sms.ts`).
- **Réponses personnalisées** — réponses automatiques globales ou par numéro, avec historique de conversation (`src/rcs/sessions.ts`).
- **Notifications planifiées** — rappels automatiques via un scheduler (`src/notifications.ts`).
- **Dashboard React** — interface de visualisation/gestion (dossier `dashboard/`, Vite + React 19).

## Architecture

```
┌────────────┐   RCS / SMS    ┌──────────────────────┐
│ Patient    │ ◄────────────► │  API smsmode (RCS)   │
└────────────┘                └──────────┬───────────┘
                                webhook   │
                                          ▼
                            ┌──────────────────────────┐
                            │  Serveur Express (4000)   │
                            │  src/trigger-server.ts    │
                            ├──────────────────────────┤
                            │ DoctorAppointement (flux) │
                            │ MapAssistant (itinéraire) │
                            │ slots  (créneaux + verrou)│
                            │ calendar (.ics)           │
                            │ notifications (scheduler) │
                            │ sessions (historique)     │
                            └──────────────────────────┘
```

### Fichiers clés

| Fichier | Rôle |
|---|---|
| `src/server.ts` | Serveur Express principal : API REST, webhook RCS, envoi de l'invitation |
| `src/trigger-server.ts` | Variante multi-sessions (une conversation par numéro réservé) |
| `src/rcs/DoctorAppointement.ts` | Machine à états du flux rendez-vous (`idle → confirmation → name → schedule → completed`) |
| `src/rcs/map.ts` | Demande de localisation et envoi d'itinéraire |
| `src/rcs/sms.ts` | Repli SMS via l'API REST smsmode |
| `src/rcs/sessions.ts` | Réponses personnalisées + historique de conversation |
| `src/slots.ts` | Lecture/écriture des créneaux avec verrou concurrentiel |
| `src/calendar.ts` | Génération du fichier `.ics` |
| `src/notifications.ts` | Planification des rappels |
| `dashboard/` | Front React (Vite) |

## Prérequis

- Node.js 20+ et npm
- Un compte smsmode avec une clé API active et une configuration RCS attachée au canal utilisé
- ngrok pour exposer le webhook RCS à Internet

Une clé API valide seule ne suffit pas à envoyer des RCS. L’erreur `403.006` indique généralement qu’aucune configuration RCS n’est attachée au canal SMSMode.

## Installation et configuration

```bash
npm install
mkdir -p env
cp .env.example env/.env.keys
```

Renseignez `env/.env.keys` avec vos propres valeurs :

```env
API_KEY=<cle_api_smsmode>
PHONE_NUMBER=33600000000
COMPANY_NAME=Cabinet Médical
COMPANY_ADDRESS=12 rue Exemple, Paris
RCS_CALLBACK_URL=https://<domaine-ngrok>/webhook/rcs
```

`PHONE_NUMBER` est le numéro de destination par défaut, au format international sans `+`. `RCS_CALLBACK_URL` est l’URL publique du webhook. Le fichier `env/.env.keys` et les fichiers `.env` sont ignorés par Git ; ne les forcez jamais dans un commit. `.env.example` ne contient que des valeurs fictives.

### Configurer ngrok

Installez ngrok en suivant les [instructions officielles pour Linux](https://ngrok.com/download/linux), puis associez votre jeton ngrok localement :

```bash
ngrok config add-authtoken <votre-jeton-ngrok>
```

Dans un terminal, démarrez le tunnel vers le serveur de trigger :

```bash
ngrok http 4000
```

Copiez l’URL HTTPS affichée et ajoutez `/webhook/rcs` à la fin dans `RCS_CALLBACK_URL`. Si l’URL ngrok change, mettez cette variable à jour et redémarrez le serveur de trigger. Ne stockez pas le jeton ngrok dans le dépôt.

## Lancement

L’interface utilise le serveur de trigger sur le port `4000`. Démarrez les services dans des terminaux séparés, après avoir configuré l’URL ngrok :

```bash
# Terminal 1 : API, sessions et webhook RCS (http://localhost:4000)
npm run trigger

# Terminal 2 : dashboard React (http://localhost:5173)
npm run dashboard

# Terminal 3 : tunnel public du webhook
ngrok http 4000
```

Ouvrez ensuite http://localhost:5173. Pour envoyer une invitation, utilisez le numéro configuré ou saisissez un numéro dans le dashboard. Cet envoi contacte réellement le destinataire.

Le serveur alternatif `npm run dev` écoute sur le port `3000` et envoie une invitation au démarrage si une clé API est configurée. Il n’est pas le backend utilisé par défaut par le dashboard.

```bash
npm run lint
```

### Cibler un destinataire en ligne de commande

```bash
npm run dev -- --33600000000 --doctor
```

## API REST

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/api/slots` | Tous les créneaux |
| `GET` | `/api/slots/available` | Créneaux disponibles |
| `GET` | `/api/slots/:slotId` | Détails d'un créneau |
| `POST` | `/api/slots/:slotId/book` | Réserver un créneau (`{ "phone": "..." }`) |
| `GET` | `/api/slots/:slotId/calendar` | Télécharger le fichier `.ics` |
| `POST` | `/api/ask-appointment` | Envoyer l'invitation RCS initiale |
| `GET` | `/api/replies` | Lister les réponses automatiques |
| `POST` | `/api/replies/global` | Ajouter une réponse globale (`{ command, reply }`) |
| `DELETE` | `/api/replies/global/:command` | Supprimer une réponse globale |
| `POST` | `/api/replies/:phone` | Ajouter une réponse pour un numéro |
| `DELETE` | `/api/replies/:phone/:command` | Supprimer une réponse pour un numéro |
| `GET` | `/api/sessions/:phone/history` | Historique de conversation |
| `POST` | `/webhook/rcs` | Webhook entrant smsmode (réponses du patient) |

## Flux d'un rendez-vous

1. Le serveur envoie une invitation RCS au patient (`askForAppointment`).
2. Le patient confirme → saisit son nom → choisit un créneau parmi les suggestions.
3. Le créneau est réservé (`bookSlot`) et une confirmation est envoyée avec le fichier calendrier.
4. `MapAssistant` propose un itinéraire vers le cabinet.
5. Si le RCS n'est pas délivré, repli automatique en SMS.
6. Des rappels planifiés sont envoyés via le scheduler de notifications.

## Stack technique

- **Backend** : Node.js, Express 5, TypeScript (ESM), `tsx`
- **Messagerie** : `@smsmode/rcs`, API REST SMS smsmode
- **Calendrier** : `ical-generator`
- **Concurrence** : `async-mutex`
- **Frontend** : React 19, Vite

## Structure du projet

```
.
├── src/                 # Code backend
│   ├── server.ts        # Serveur Express principal
│   ├── trigger-server.ts# Serveur multi-sessions
│   ├── slots.ts         # Gestion des créneaux
│   ├── calendar.ts      # Génération .ics
│   ├── notifications.ts # Rappels planifiés
│   └── rcs/             # Logique conversationnelle (RDV, map, SMS, sessions)
├── dashboard/           # Front React (Vite)
├── data/                # Persistance (slots.json, sessions.json)
└── env/                 # Variables d'environnement
```

---

*Projet réalisé dans le cadre d'un hackathon smsmode.*
