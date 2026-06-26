export type SlotPlacement = {
    occupied: boolean;
    x: number;
    y: number;
};

export type Point2D = {
    x: number;
    y: number;
};

export type TileReleaseAction =
    | { action: 'returnHome' }
    | { action: 'place'; slotIndex: number }
    | { action: 'reset' };

export function chooseSlotForTap(slots: SlotPlacement[]): number {
    return slots.findIndex(slot => !slot.occupied);
}

export function chooseSlotForDrag(slots: SlotPlacement[], position: Point2D, threshold: number): number {
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (slot.occupied) continue;

        const dx = slot.x - position.x;
        const dy = slot.y - position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < threshold && distance < bestDistance) {
            best = i;
            bestDistance = distance;
        }
    }

    return best;
}

export function chooseTileReleaseAction(
    slots: SlotPlacement[],
    options: { startedInSlot: boolean; moved: boolean; position: Point2D; threshold: number },
): TileReleaseAction {
    if (options.startedInSlot && !options.moved) return { action: 'returnHome' };

    const slotIndex = options.moved
        ? chooseSlotForDrag(slots, options.position, options.threshold)
        : chooseSlotForTap(slots);

    return slotIndex >= 0 ? { action: 'place', slotIndex } : { action: 'reset' };
}
