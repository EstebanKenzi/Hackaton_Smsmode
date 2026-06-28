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
                            │  Serveur Express (3000)   │
                            │  src/server.ts            │
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

- Node.js 20+
- Un compte et une clé API **smsmode** (RCS + SMS)
- Un tunnel public (ex. ngrok) pour recevoir les webhooks RCS

## Installation

```bash
npm install
```

## Configuration

Créez un fichier `.env` à la racine (ou `env/.env.keys`) avec vos identifiants :

```env
API_KEY=<votre_cle_api_smsmode>
ANDRE_PHONE=<numero_destinataire_au_format_international>   # ex. 33600000000
COMPANY_NAME=Cabinet Médical
COMPANY_ADDRESS=12 rue Exemple, Paris
```

> ⚠️ Ne committez jamais de vraie clé API. Vérifiez que `.env` et `env/` sont bien ignorés par git.

L'URL du webhook RCS est définie dans `src/rcs/DoctorAppointement.ts` (`callbackUrlMo`). Remplacez-la par l'URL de votre tunnel public, par exemple :

```
https://<votre-tunnel>.ngrok.dev/webhook/rcs
```

## Lancement

Deux commandes suffisent : lancez le serveur, puis le dashboard.

```bash
# 1. Démarrer le serveur
npm run trigger

# 2. Démarrer le dashboard
npm run dashboard
```

Le serveur écoute sur `http://localhost:3000`.

<details>
<summary>Autres commandes</summary>

```bash
# Serveur principal alternatif (envoie l'invitation au démarrage)
npm run dev

# Lint
npm run lint
```

</details>

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
