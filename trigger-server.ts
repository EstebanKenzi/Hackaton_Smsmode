import express from 'express';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getAllSlots } from './slots.js';
import { addGlobalReply, removeGlobalReply, addPhoneReply, removePhoneReply, getAllReplies, getHistory } from './rcs/sessions.js';

const app = express();
app.use(express.json());

const __dirname = dirname(fileURLToPath(import.meta.url));

app.post('/send-rcs', (req, res) => {
  const { phone, type } = req.body as { phone?: string; type?: string };

  if (!phone || !/^\d+$/.test(phone)) {
    res.status(400).json({ error: 'Numéro de téléphone invalide' });
    return;
  }

  const appointmentType = type ?? 'doctor';
  if (appointmentType !== 'doctor') {
    res.status(400).json({ error: `Type inconnu: "${appointmentType}". Types supportés: doctor` });
    return;
  }

  const serverPath = join(__dirname, 'server.ts');
  const child = spawn('npx', ['tsx', serverPath, `--${phone}`, `--${appointmentType}`], {
    cwd: __dirname,
    stdio: 'inherit',
    detached: false,
  });

  child.on('error', err => {
    console.error('Erreur spawn:', err);
  });

  console.log(`Lancement server.ts --${phone} --${appointmentType} (pid ${child.pid})`);
  res.json({ message: 'Message RCS en cours d\'envoi', phone, type: appointmentType });
});

app.get('/api/slots', async (_req, res) => {
  try {
    const slots = await getAllSlots();
    res.json(slots);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/replies', async (_req, res) => {
  try {
    const data = await getAllReplies();
    res.json({ global: data.global, sessions: Object.fromEntries(
      Object.entries(data.sessions).map(([phone, s]) => [phone, s.customReplies])
    )});
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/replies/global', async (req, res) => {
  const { command, reply } = req.body;
  if (!command || !reply) { res.status(400).json({ error: 'command et reply requis' }); return; }
  await addGlobalReply(command, reply);
  res.json({ message: 'Réponse globale ajoutée' });
});

app.delete('/api/replies/global/:command', async (req, res) => {
  await removeGlobalReply(req.params.command);
  res.json({ message: 'Réponse globale supprimée' });
});

app.post('/api/replies/:phone', async (req, res) => {
  const { command, reply } = req.body;
  if (!command || !reply) { res.status(400).json({ error: 'command et reply requis' }); return; }
  await addPhoneReply(req.params.phone, command, reply);
  res.json({ message: 'Réponse ajoutée' });
});

app.delete('/api/replies/:phone/:command', async (req, res) => {
  await removePhoneReply(req.params.phone, req.params.command);
  res.json({ message: 'Réponse supprimée' });
});

app.get('/api/sessions/:phone/history', async (req, res) => {
  const history = await getHistory(req.params.phone);
  res.json(history);
});

app.listen(4000, () => {
  console.log('Trigger server lancé sur http://localhost:4000');
});
