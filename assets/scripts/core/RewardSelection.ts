export type RewardToggleResult = 'selected' | 'unselected' | 'full';

export class RewardSelection<T> {
    private readonly selected: T[] = [];
    private readonly selectedKeys = new Set<string>();
    private readonly keyOf: (value: T) => string;

    constructor(
        private readonly requiredCount: number,
        keyOf: (value: T) => string = value => String(value),
    ) {
        this.keyOf = keyOf;
    }

    public toggle(value: T): RewardToggleResult {
        const key = this.keyOf(value);
        if (this.selectedKeys.has(key)) {
            const index = this.selected.findIndex(item => this.keyOf(item) === key);
            if (index >= 0) this.selected.splice(index, 1);
            this.selectedKeys.delete(key);
            return 'unselected';
        }
        if (this.selected.length >= this.requiredCount) return 'full';

        this.selected.push(value);
        this.selectedKeys.add(key);
        return 'selected';
    }

    public has(value: T) {
        return this.selectedKeys.has(this.keyOf(value));
    }

    public values(): T[] {
        return [...this.selected];
    }

    public canConfirm() {
        return this.selected.length >= this.requiredCount;
    }

    public confirm(): T[] | null {
        return this.canConfirm() ? this.values() : null;
    }
}
