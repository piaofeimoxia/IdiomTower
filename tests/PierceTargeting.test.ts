import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPierceTargetIds } from '../assets/scripts/core/PierceTargeting';

type Target = {
    id: number;
    x: number;
    y: number;
    reachedEnd?: boolean;
};

test('selects the closest enemy and only same-lane enemies behind it', () => {
    const targets: Target[] = [
        { id: 1, x: 300, y: 10 },
        { id: 2, x: 250, y: 12 },
        { id: 3, x: 280, y: 35 },
    ];

    assert.deepEqual(selectPierceTargetIds(targets, 1, 8), [1, 2]);
});

test('does not substitute an enemy from another lane when no same-lane target exists', () => {
    const targets: Target[] = [
        { id: 1, x: 300, y: 10 },
        { id: 2, x: 290, y: 30 },
    ];

    assert.deepEqual(selectPierceTargetIds(targets, 1, 8), [1]);
});

test('ignores enemies that already reached the base', () => {
    const targets: Target[] = [
        { id: 1, x: 400, y: 10, reachedEnd: true },
        { id: 2, x: 280, y: 10 },
        { id: 3, x: 240, y: 10 },
    ];

    assert.deepEqual(selectPierceTargetIds(targets, 1, 8), [2, 3]);
});
