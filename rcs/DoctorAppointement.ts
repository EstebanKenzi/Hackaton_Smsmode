import { SmsmodeRcsClient } from '@smsmode/rcs';
import { getAvailableSlots, getAllSlots, bookSlot, getSlotById, Slot, cancelSlot, updateSlot } from '../slots.js';
import { MapAssistant } from './map.js';
import { sendSMS } from './sms.js';
import { findReply, appendToHistory, addPhoneReply, setPatientName } from './sessions.js';

type AppointmentState = 'idle' | 'awaiting_confirmation' | 'awaiting_name' | 'awaiting_schedule' | 'completed';

export class DoctorAppointement
{
    isA2P: boolean;
    phoneNb: string;
    client: SmsmodeRcsClient;
    askForAppointmentMsg: any;
    private state: AppointmentState = 'idle';
    private locationAssistant?: MapAssistant;
    private clinicName: string;
    private bookedSlotId?: string;

    constructor(isA2P: boolean, phone_nb: string, client: SmsmodeRcsClient, locationAssistant?: MapAssistant, clinicName: string = 'Cabinet Médical')
    {
        this.isA2P = isA2P;
        this.phoneNb = phone_nb;
        this.client = client;
        this.locationAssistant = locationAssistant;
        this.clinicName = clinicName;
    };

    private async sendMessage(body: any): Promise<any> {
        const result = await this.client.send({
            recipient: { to: this.phoneNb },
            callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
            body
        });
        const text = body.text ?? JSON.stringify(body);
        await appendToHistory(this.phoneNb, {
            direction: 'out',
            text,
            timestamp: Date.now(),
            senderName: this.clinicName
        });
        return result;
    }

    async addCustomReply(command: string, reply: string): Promise<void> {
        await addPhoneReply(this.phoneNb, command, reply);
    }

    async askForAppointment()
    {
        this.askForAppointmentMsg = await this.sendMessage({
            type: "TEXT",
            text: "Bonjour, souhaitez vous prendre un rendez-vous ?",
            suggestions: [
                { type: "REPLY", text: "Oui", postbackData: "oui" },
                { type: "REPLY", text: "Plus tard", postbackData: "plus tard" },
                { type: "REPLY", text: "Pas intéressé", postbackData: "non" },
            ]
        });
        this.state = 'awaiting_confirmation';
        console.log('Message créneau envoyé ✅', this.askForAppointmentMsg);

        setTimeout(async () => {
            const messageId = this.askForAppointmentMsg?.messageId;
            const response = await fetch(`https://rest.smsmode.com/rcs/v1/messages/${messageId}`, {
                headers: {
                    'X-Api-Key': process.env.API_KEY!,
                    'Accept': 'application/json'
                }
            });
            const data = await response.json();
            if (data.status?.value !== 'DELIVERED') {
                console.log('RCS non délivré → fallback SMS');
                await sendSMS(
                    this.phoneNb,
                    'Bonjour, souhaitez-vous prendre un RDV ? Répondez OUI ou NON.',
                    process.env.API_KEY!
                );
            }
        }, 30000);
    }

    async askForName(): Promise<void> {
        await this.sendMessage({
            type: "TEXT" as const,
            text: "Quel est votre prénom ?"
        });
        this.state = 'awaiting_name';
        console.log('Question prénom envoyée ✅');
    }

    async askForSchedule() {
        const slots = await getAvailableSlots();

        const suggestions: Array<{ type: "REPLY"; text: string; postbackData: string }> = slots.map((slot: Slot) => ({
            type: "REPLY" as const,
            text: slot.label,
            postbackData: slot.id
        }));

        await this.sendMessage({
            type: "TEXT" as const,
            text: "Quel créneau vous convient le mieux ?",
            suggestions
        });

        this.state = 'awaiting_schedule';
        console.log('Créneaux envoyés ✅');
    }

    async waitForScheduleResponse(postbackData: any) {
        const text = String(postbackData ?? '');

        const customReply = await findReply(text, this.phoneNb);
        if (customReply) {
            await appendToHistory(this.phoneNb, {
                direction: 'in', text, timestamp: Date.now(), senderName: this.phoneNb
            });
            await this.sendMessage({ type: "TEXT" as const, text: customReply });
            return true;
        }

        const lowerText = text.toLowerCase().trim();

        if (lowerText === 'annuler') {
            await appendToHistory(this.phoneNb, {
                direction: 'in', text, timestamp: Date.now(), senderName: this.phoneNb
            });
            await this.sendCancelMenu();
            return true;
        }

        if (lowerText === 'modifier') {
            await appendToHistory(this.phoneNb, {
                direction: 'in', text, timestamp: Date.now(), senderName: this.phoneNb
            });
            await this.sendModifyMenu();
            return true;
        }

        if (postbackData === 'calendar_event_confirmed' || postbackData === 'calendar_declined') {
            await appendToHistory(this.phoneNb, {
                direction: 'in', text, timestamp: Date.now(), senderName: this.phoneNb
            });
            if (this.locationAssistant) {
                await this.locationAssistant.askForLocation();
            }
            return true;
        }

        if (postbackData === 'reschedule_appointment' && this.bookedSlotId) {
            await appendToHistory(this.phoneNb, {
                direction: 'in', text, timestamp: Date.now(), senderName: this.phoneNb
            });
            await this.sendModificationMessage(this.bookedSlotId);
            return true;
        }

        if (postbackData === 'cancel_appointment' && this.bookedSlotId) {
            await appendToHistory(this.phoneNb, {
                direction: 'in', text, timestamp: Date.now(), senderName: this.phoneNb
            });
            await this.sendCancellationMessage(this.bookedSlotId);
            return true;
        }

        if (postbackData?.startsWith('appointment_confirmed_')) {
            await appendToHistory(this.phoneNb, {
                direction: 'in', text, timestamp: Date.now(), senderName: this.phoneNb
            });
            const slotId = postbackData.replace('appointment_confirmed_', '');
            await this.sendConfirmationMessage(slotId);
            return true;
        }

        if (postbackData?.startsWith('appointment_cancel_')) {
            await appendToHistory(this.phoneNb, {
                direction: 'in', text, timestamp: Date.now(), senderName: this.phoneNb
            });
            const slotId = postbackData.replace('appointment_cancel_', '');
            await this.sendCancellationMessage(slotId);
            return true;
        }

        if (postbackData?.startsWith('appointment_modify_')) {
            await appendToHistory(this.phoneNb, {
                direction: 'in', text, timestamp: Date.now(), senderName: this.phoneNb
            });
            const slotId = postbackData.replace('appointment_modify_', '');
            await this.sendModificationMessage(slotId);
            return true;
        }

        if (this.state === 'awaiting_confirmation' && postbackData === 'oui') {
            await appendToHistory(this.phoneNb, {
                direction: 'in', text, timestamp: Date.now(), senderName: this.phoneNb
            });
            await this.askForName();
            return true;

        } else if (this.state === 'awaiting_name') {
            const name = text.trim();
            await setPatientName(this.phoneNb, name);
            await appendToHistory(this.phoneNb, {
                direction: 'in', text: name, timestamp: Date.now(), senderName: name
            });
            await this.askForSchedule();
            return true;

        } else if (this.state === 'awaiting_confirmation' && postbackData === 'non') {
            await appendToHistory(this.phoneNb, {
                direction: 'in', text, timestamp: Date.now(), senderName: this.phoneNb
            });
            await this.sendGoodbye();
            this.state = 'idle';
            return true;

        } else if (this.state === 'awaiting_confirmation' && postbackData === 'plus tard') {
            await appendToHistory(this.phoneNb, {
                direction: 'in', text, timestamp: Date.now(), senderName: this.phoneNb
            });
            await this.sendReminder();
            this.state = 'idle';
            return true;

        } else if (this.state === 'awaiting_schedule') {
            await appendToHistory(this.phoneNb, {
                direction: 'in', text, timestamp: Date.now(), senderName: this.phoneNb
            });
            await bookSlot(postbackData, this.phoneNb);
            await updateSlot(postbackData, { bookingTime: Date.now(), notificationSent: false });
            await this.sendCalendar(postbackData);
            this.state = 'completed';
            return true;
        }

        return false;
    }

    async sendCancelMenu() {
        const allSlots = await getAllSlots();
        const mySlots = allSlots.filter((s: Slot) => s.booked && s.bookedBy === this.phoneNb);

        if (mySlots.length === 0) {
            await this.sendMessage({
                type: "TEXT" as const,
                text: "Vous n'avez aucun rendez-vous à annuler."
            });
            return;
        }

        const suggestions = mySlots.map((s: Slot) => ({
            type: "REPLY" as const,
            text: s.label,
            postbackData: `appointment_cancel_${s.id}`
        }));

        const text = mySlots.length === 1
            ? `Voulez-vous annuler votre rendez-vous du ${mySlots[0].label} ?`
            : "Quel rendez-vous souhaitez-vous annuler ?";

        await this.sendMessage({
            type: "TEXT" as const,
            text,
            suggestions
        });
    }

    async sendModifyMenu() {
        const allSlots = await getAllSlots();
        const mySlots = allSlots.filter((s: Slot) => s.booked && s.bookedBy === this.phoneNb);

        if (mySlots.length === 0) {
            await this.sendMessage({
                type: "TEXT" as const,
                text: "Vous n'avez aucun rendez-vous à modifier."
            });
            return;
        }

        if (mySlots.length === 1) {
            await this.sendModificationMessage(mySlots[0].id);
            return;
        }

        const suggestions = mySlots.map((s: Slot) => ({
            type: "REPLY" as const,
            text: s.label,
            postbackData: `appointment_modify_${s.id}`
        }));

        await this.sendMessage({
            type: "TEXT" as const,
            text: "Quel rendez-vous souhaitez-vous modifier ?",
            suggestions
        });
    }

    async sendGoodbye() {
        await this.sendMessage({
            type: "TEXT" as const,
            text: "D'accord, n'hésitez pas à nous recontacter si vous changez d'avis ! 😊"
        });
        console.log('Message au revoir envoyé ✅');
    }

    async sendReminder() {
        await this.sendMessage({
            type: "TEXT" as const,
            text: "Pas de souci, on vous recontacte bientôt ! 😊"
        });
        console.log('Message rappel envoyé ✅');
    }

    async sendCalendar(slotId: string) {
        this.bookedSlotId = slotId;
        const slot = await getSlotById(slotId);

        if (!slot) {
            console.error('Slot non trouvé');
            return;
        }

        await this.sendMessage({
            type: "TEXT" as const,
            text: "Merci ! Votre RDV est confirmé. Ajoutez-le à votre calendrier :",
            suggestions: [
                {
                    type: "CREATE_CALENDAR_EVENT" as const,
                    text: "Ajouter au calendrier",
                    postbackData: "calendar_event_confirmed",
                    title: "RDV Dr Dubois",
                    description: "Consultation médicale",
                    startTime: slot.isoStart,
                    endTime: slot.isoEnd
                },
                { type: "REPLY" as const, text: "Non merci", postbackData: "calendar_declined" },
                { type: "REPLY" as const, text: "Choisir un autre créneau", postbackData: "reschedule_appointment" },
                { type: "REPLY" as const, text: "Annuler le RDV", postbackData: "cancel_appointment" },
            ]
        });
        console.log('Message calendrier envoyé ✅');
    }

    async sendConfirmationMessage(slotId: string) {
        const slot = await getSlotById(slotId);
        if (!slot) {
            console.error('Slot non trouvé pour confirmation');
            return;
        }

        await this.sendMessage({
            type: 'TEXT' as const,
            text: `✅ Merci pour votre confirmation! Votre rendez-vous du ${slot.label} est bien confirmé. À bientôt!`,
        });

        console.log(`✅ Message de confirmation envoyé pour le créneau ${slotId}`);
    }

    async sendCancellationMessage(slotId: string) {
        const slot = await getSlotById(slotId);
        if (!slot) {
            console.error('Slot non trouvé pour annulation');
            return;
        }

        await cancelSlot(slotId);

        await this.sendMessage({
            type: 'TEXT' as const,
            text: `❌ Votre rendez-vous du ${slot.label} a été annulé. N'hésitez pas à nous recontacter pour en prendre un autre!`,
        });

        console.log(`❌ Rendez-vous ${slotId} annulé`);
    }

    async sendModificationMessage(slotId: string) {
        const availableSlots = await getAvailableSlots();
        const currentSlot = await getSlotById(slotId);

        if (!currentSlot) {
            console.error('Slot non trouvé pour modification');
            return;
        }

        await cancelSlot(slotId);

        const suggestions: Array<{ type: "REPLY"; text: string; postbackData: string }> = availableSlots.map((slot: Slot) => ({
            type: "REPLY" as const,
            text: slot.label,
            postbackData: slot.id
        }));

        await this.sendMessage({
            type: 'TEXT' as const,
            text: `🔄 Votre rendez-vous du ${currentSlot.label} a été annulé. Quel autre créneau vous convient?`,
            suggestions
        });

        this.state = 'awaiting_schedule';
        console.log(`🔄 Demande de modification envoyée pour le créneau ${slotId}`);
    }
}
