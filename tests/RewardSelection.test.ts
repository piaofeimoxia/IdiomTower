import assert from 'node:assert/strict';
import test from 'node:test';
import { RewardSelection } from '../assets/scripts/core/RewardSelection';

test('selects up to the requested count and rejects extra selections', () => {
    const selection = new RewardSelection<string>(2);

    assert.equal(selection.toggle('a'), 'selected');
    assert.equal(selection.toggle('b'), 'selected');
    assert.equal(selection.toggle('c'), 'full');
    assert.deepEqual(selection.values(), ['a', 'b']);
});

test('toggling a selected reward cancels it', () => {
    const selection = new RewardSelection<string>(2);
    selection.toggle('a');
    selection.toggle('b');

    assert.equal(selection.toggle('a'), 'unselected');
    assert.deepEqual(selection.values(), ['b']);
    assert.equal(selection.canConfirm(), false);
});

test('confirmation requires the full selection and returns a snapshot', () => {
    const selection = new RewardSelection<{ id: string }>(2, reward => reward.id);
    const first = { id: 'a' };
    const second = { id: 'b' };

    selection.toggle(first);
    assert.equal(selection.confirm(), null);
    selection.toggle(second);

    const confirmed = selection.confirm();
    assert.deepEqual(confirmed, [first, second]);
    confirmed?.splice(0, 1);
    assert.deepEqual(selection.values(), [first, second]);
});
