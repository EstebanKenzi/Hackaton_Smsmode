import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Mutex } from 'async-mutex';

export interface Slot {
  id: string;
  label: string;
  isoStart: string;
  isoEnd: string;
  booked: boolean;
  bookedBy: string | null;
  notificationSent?: boolean;
  bookingTime?: number;
} 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const slotsFilePath = path.join(__dirname, '..', 'data', 'slots.json');
const mutex = new Mutex();

export async function getAllSlots(): Promise<Slot[]> {
  return mutex.runExclusive(async () => {
    const data = fs.readFileSync(slotsFilePath, 'utf-8');
    return JSON.parse(data) as Slot[];
  });
}

export async function getAvailableSlots(): Promise<Slot[]> {
  const slots = await getAllSlots();
  return slots.filter(slot => !slot.booked);
}

export async function getSlotById(slotId: string): Promise<Slot | null> {
  const slots = await getAllSlots();
  return slots.find(slot => slot.id === slotId) || null;
}

export async function bookSlot(slotId: string, phone: string): Promise<boolean> {
  return mutex.runExclusive(async () => {
    const data = fs.readFileSync(slotsFilePath, 'utf-8');
    const slots = JSON.parse(data) as Slot[];

    const slot = slots.find(s => s.id === slotId);
    if (!slot) {
      throw new Error(`Slot ${slotId} not found`);
    }

    if (slot.booked) {
      return false;
    }

    slot.booked = true;
    slot.bookedBy = phone;

    fs.writeFileSync(slotsFilePath, JSON.stringify(slots, null, 2));
    console.log(`✓ Slot ${slotId} booked by ${phone}`);
    return true;
  });
}

export async function cancelSlot(slotId: string): Promise<void> {
  return mutex.runExclusive(async () => {
    const data = fs.readFileSync(slotsFilePath, 'utf-8');
    const slots = JSON.parse(data) as Slot[];

    const slot = slots.find(s => s.id === slotId);
    if (!slot) {
      throw new Error(`Slot ${slotId} not found`);
    }

    slot.booked = false;
    slot.bookedBy = null;

    fs.writeFileSync(slotsFilePath, JSON.stringify(slots, null, 2));
    console.log(`✓ Slot ${slotId} cancelled`);
  });
}

export async function getBookingInfo(slotId: string): Promise<{ booked: boolean; bookedBy: string | null }> {
  const slot = await getSlotById(slotId);
  if (!slot) {
    throw new Error(`Slot ${slotId} not found`);
  }
  return {
    booked: slot.booked,
    bookedBy: slot.bookedBy
  };
}

export async function updateSlot(slotId: string, updates: Partial<Slot>): Promise<Slot | null> {
  return mutex.runExclusive(async () => {
    const data = fs.readFileSync(slotsFilePath, 'utf-8');
    const slots = JSON.parse(data) as Slot[];

    const slot = slots.find(s => s.id === slotId);
    if (!slot) {
      return null;
    }

    Object.assign(slot, updates);
    fs.writeFileSync(slotsFilePath, JSON.stringify(slots, null, 2));
    return slot;
  });
}

export async function getBookedSlots(): Promise<Slot[]> {
  const slots = await getAllSlots();
  return slots.filter(slot => slot.booked === true);
}
