export type PierceTarget = {
    id: number;
    x: number;
    y: number;
    reachedEnd?: boolean;
};

export function selectPierceTargetIds(
    targets: PierceTarget[],
    pierceCount = 1,
    laneTolerance = 8,
): number[] {
    const active = targets
        .filter(target => !target.reachedEnd)
        .sort((a, b) => b.x - a.x);
    const primary = active[0];
    if (!primary) return [];

    const sameLaneBehind = active
        .filter(target => target.id !== primary.id)
        .filter(target => Math.abs(target.y - primary.y) <= laneTolerance)
        .filter(target => target.x <= primary.x + 4)
        .sort((a, b) => b.x - a.x)
        .slice(0, Math.max(0, pierceCount));

    return [primary.id, ...sameLaneBehind.map(target => target.id)];
}
