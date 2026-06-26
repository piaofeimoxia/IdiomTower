import assert from 'node:assert/strict';
import test from 'node:test';
import { BagCycle } from '../assets/scripts/core/BagCycle';

test('discarded char returns only after the current pool is exhausted', () => {
    const cycle = new BagCycle({
        capacity: 3,
        refillInterval: 0.5,
        discardCooldown: 3,
        random: () => 0,
    });
    cycle.reset(['甲', '乙'], ['丙']);

    assert.deepEqual(cycle.discardLeft(), { status: 'discarded', char: '丙' });
    assert.equal(cycle.draw(), '甲');
    assert.equal(cycle.draw(), '乙');
    assert.equal(cycle.draw(), '丙');
});

test('discard cooldown blocks a second discard without changing the bag', () => {
    const cycle = new BagCycle({
        capacity: 3,
        refillInterval: 0.5,
        discardCooldown: 3,
        random: () => 0,
    });
    cycle.reset([], ['甲', '乙']);

    assert.deepEqual(cycle.discardLeft(), { status: 'discarded', char: '甲' });
    assert.deepEqual(cycle.discardLeft(), { status: 'cooldown', remain: 3 });
    assert.deepEqual(cycle.snapshot().bag, ['乙']);

    cycle.tick(3);
    assert.deepEqual(cycle.discardLeft(), { status: 'discarded', char: '乙' });
});

test('discarding selected chars removes them from the bag and delays their return', () => {
    const cycle = new BagCycle({
        capacity: 5,
        refillInterval: 0.5,
        discardCooldown: 3,
        random: () => 0,
    });
    cycle.reset(['丁'], ['甲', '乙', '丙']);

    assert.deepEqual(cycle.discardChars(['甲', '丙']), { status: 'discarded', chars: ['甲', '丙'] });
    assert.deepEqual(cycle.snapshot().bag, ['乙']);
    assert.deepEqual(cycle.snapshot().delayedDiscard, ['甲', '丙']);
    assert.equal(cycle.draw(), '丁');
    assert.equal(cycle.draw(), '甲');
    assert.equal(cycle.draw(), '丙');
});

test('consumed idiom chars leave the bag and return to the available pool', () => {
    const cycle = new BagCycle({
        capacity: 6,
        refillInterval: 0.5,
        discardCooldown: 3,
        random: () => 0,
    });
    cycle.reset([], ['百', '步', '穿', '杨', '百']);

    assert.equal(cycle.consume(['百', '步', '穿', '杨']), true);
    assert.deepEqual(cycle.snapshot().bag, ['百']);
    assert.deepEqual(cycle.snapshot().available, ['百', '步', '穿', '杨']);
});

test('prioritizing chars makes a newly unlocked idiom usable in a full bag', () => {
    const cycle = new BagCycle({
        capacity: 6,
        refillInterval: 0.5,
        discardCooldown: 3,
        random: () => 0,
    });
    cycle.reset(['牢'], ['画', '地', '为', '万', '百', '杨']);

    assert.deepEqual(cycle.prioritizeChars(['画', '地', '为', '牢']), ['牢']);
    assert.deepEqual(cycle.snapshot().bag, ['画', '地', '为', '百', '杨', '牢']);
    assert.deepEqual(cycle.snapshot().delayedDiscard, ['万']);
});
