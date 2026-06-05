import { getBookedSlots, updateSlot } from './slots.js';
const NOTIFICATION_INTERVAL = 60 * 1000;
const REMINDER_TIME_BEFORE = 2 * 60 * 60 * 1000;
export function createNotificationManager(client, companyName, companyDestination) {
    let schedulerInterval = null;
    async function checkAndSendReminders() {
        try {
            const bookedSlots = await getBookedSlots();
            const now = Date.now();
            for (const slot of bookedSlots) {
                if (slot.notificationSent) {
                    continue;
                }
                const slotTime = new Date(slot.isoStart).getTime();
                const timeUntilSlot = slotTime - now;
                if (timeUntilSlot > 0 && timeUntilSlot <= REMINDER_TIME_BEFORE) {
                    if (slot.bookedBy) {
                        await sendReminderNotification(slot.id, slot.bookedBy, slot);
                    }
                }
            }
        }
        catch (error) {
            console.error('Erreur lors de la vérification des reminders:', error);
        }
    }
    async function sendReminderNotification(slotId, phoneNumber, slot) {
        try {
            const slotTime = new Date(slot.isoStart);
            const timeStr = slotTime.toLocaleString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
            });
            await client.send({
                recipient: { to: phoneNumber },
                callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
                body: {
                    type: 'TEXT',
                    text: `📅 Rappel: Vous avez un rendez-vous à ${companyName} dans 2 heures (${timeStr})`,
                    suggestions: [
                        {
                            type: 'REPLY',
                            text: '❌ Annuler',
                            postbackData: `appointment_cancel_${slotId}`,
                        },
                        {
                            type: 'REPLY',
                            text: '🔄 Modifier',
                            postbackData: `appointment_modify_${slotId}`,
                        },
                    ],
                },
            });
            await updateSlot(slotId, { notificationSent: true });
            console.log(`✅ Notification de rappel envoyée pour le créneau ${slotId} à ${phoneNumber}`);
        }
        catch (error) {
            console.error(`❌ Erreur lors de l'envoi du rappel pour ${slotId}:`, error);
        }
    }
    function startScheduler() {
        if (schedulerInterval) {
            console.log('Scheduler déjà actif');
            return;
        }
        console.log('Scheduler de notifications lancé');
        schedulerInterval = setInterval(checkAndSendReminders, NOTIFICATION_INTERVAL);
        checkAndSendReminders();
    }
    function stopScheduler() {
        if (schedulerInterval) {
            clearInterval(schedulerInterval);
            schedulerInterval = null;
            console.log('Scheduler de notifications arrêté');
        }
    }
    return {
        startScheduler,
        stopScheduler,
        sendReminderNotification,
    };
}
