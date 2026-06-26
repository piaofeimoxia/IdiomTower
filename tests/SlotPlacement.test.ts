import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseSlotForTap, chooseSlotForDrag, chooseTileReleaseAction } from '../assets/scripts/core/SlotPlacement';

test('tap placement chooses the first empty slot', () => {
    const slots = [
        { occupied: true, x: -120, y: 0 },
        { occupied: false, x: 0, y: 0 },
        { occupied: false, x: 120, y: 0 },
    ];

    assert.equal(chooseSlotForTap(slots), 1);
});

test('tap placement returns -1 when all slots are occupied', () => {
    assert.equal(chooseSlotForTap([{ occupied: true, x: 0, y: 0 }]), -1);
});

test('drag placement chooses the nearest empty slot inside the threshold', () => {
    const slots = [
        { occupied: false, x: -120, y: 0 },
        { occupied: true, x: 0, y: 0 },
        { occupied: false, x: 120, y: 0 },
    ];

    assert.equal(chooseSlotForDrag(slots, { x: 105, y: 8 }, 70), 2);
});

test('drag placement ignores occupied slots and positions outside the threshold', () => {
    const slots = [
        { occupied: true, x: 0, y: 0 },
        { occupied: false, x: 160, y: 0 },
    ];

    assert.equal(chooseSlotForDrag(slots, { x: 0, y: 0 }, 70), -1);
});

test('tapping a char already in an idiom slot returns it to the battle bag row', () => {
    const slots = [
        { occupied: false, x: -120, y: 0 },
        { occupied: false, x: 0, y: 0 },
    ];

    assert.deepEqual(
        chooseTileReleaseAction(slots, { startedInSlot: true, moved: false, position: { x: -120, y: 0 }, threshold: 70 }),
        { action: 'returnHome' },
    );
});

test('tapping a battle bag char still puts it into the first empty idiom slot', () => {
    const slots = [
        { occupied: true, x: -120, y: 0 },
        { occupied: false, x: 0, y: 0 },
    ];

    assert.deepEqual(
        chooseTileReleaseAction(slots, { startedInSlot: false, moved: false, position: { x: 0, y: -140 }, threshold: 70 }),
        { action: 'place', slotIndex: 1 },
    );
});
