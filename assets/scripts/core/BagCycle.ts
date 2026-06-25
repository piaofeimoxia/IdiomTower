export type BagCycleConfig = {
    capacity: number;
    refillInterval: number;
    discardCooldown: number;
    random?: () => number;
};

export type DiscardResult =
    | { status: 'discarded'; char: string }
    | { status: 'cooldown'; remain: number }
    | { status: 'empty' };

export type BagCycleSnapshot = {
    bag: string[];
    available: string[];
    delayedDiscard: string[];
    cooldownRemain: number;
    capacity: number;
};

export class BagCycle {
    private capacity: number;
    private readonly refillInterval: number;
    private readonly discardCooldown: number;
    private readonly random: () => number;

    private bag: string[] = [];
    private available: string[] = [];
    private delayedDiscard: string[] = [];
    private cooldownRemain = 0;
    private refillTimer = 0;

    constructor(config: BagCycleConfig) {
        this.capacity = Math.max(1, config.capacity);
        this.refillInterval = Math.max(0.01, config.refillInterval);
        this.discardCooldown = Math.max(0, config.discardCooldown);
        this.random = config.random ?? Math.random;
    }

    public reset(available: string[] = [], bag: string[] = []) {
        this.available = [...available];
        this.bag = [...bag].slice(0, this.capacity);
        this.delayedDiscard = [];
        this.cooldownRemain = 0;
        this.refillTimer = 0;
    }

    public setCapacity(capacity: number) {
        this.capacity = Math.max(1, capacity);
    }

    public addAvailable(chars: string[] | string) {
        if (Array.isArray(chars)) this.available.push(...chars);
        else if (chars) this.available.push(chars);
    }

    public moveSpecificToBag(char: string): boolean {
        if (this.bag.length >= this.capacity) return false;
        const index = this.available.indexOf(char);
        if (index < 0) return false;
        this.available.splice(index, 1);
        this.bag.push(char);
        return true;
    }

    public fillInstant(): boolean {
        let changed = false;
        while (this.bag.length < this.capacity) {
            const char = this.draw();
            if (!char) break;
            this.bag.push(char);
            changed = true;
        }
        return changed;
    }

    public tick(dt: number): boolean {
        this.cooldownRemain = Math.max(0, this.cooldownRemain - Math.max(0, dt));
        if (this.bag.length >= this.capacity) return false;
        if (!this.hasDrawableChar()) return false;

        let changed = false;
        this.refillTimer += Math.max(0, dt);
        while (this.refillTimer >= this.refillInterval && this.bag.length < this.capacity) {
            this.refillTimer -= this.refillInterval;
            const char = this.draw();
            if (!char) break;
            this.bag.push(char);
            changed = true;
        }
        return changed;
    }

    public draw(): string {
        this.releaseDelayedIfNeeded();
        if (this.available.length <= 0) return '';

        const recent = this.bag.slice(-2);
        const candidates = this.available
            .map((char, index) => ({ char, index }))
            .filter(item => !(recent.length >= 2 && recent[0] === item.char && recent[1] === item.char));
        const pool = candidates.length > 0
            ? candidates
            : this.available.map((char, index) => ({ char, index }));
        const picked = pool[Math.floor(this.random() * pool.length)] ?? pool[0];
        if (!picked) return '';
        this.available.splice(picked.index, 1);
        return picked.char;
    }

    public consume(chars: string[]): boolean {
        const nextBag = [...this.bag];
        for (const char of chars) {
            const index = nextBag.indexOf(char);
            if (index < 0) return false;
            nextBag.splice(index, 1);
        }

        this.bag = nextBag;
        this.available.push(...chars);
        this.refillTimer = 0;
        return true;
    }

    public discardLeft(): DiscardResult {
        if (this.cooldownRemain > 0) {
            return { status: 'cooldown', remain: this.cooldownRemain };
        }
        const char = this.bag.shift();
        if (!char) return { status: 'empty' };

        this.delayedDiscard.push(char);
        this.cooldownRemain = this.discardCooldown;
        this.refillTimer = 0;
        return { status: 'discarded', char };
    }

    public snapshot(): BagCycleSnapshot {
        return {
            bag: [...this.bag],
            available: [...this.available],
            delayedDiscard: [...this.delayedDiscard],
            cooldownRemain: this.cooldownRemain,
            capacity: this.capacity,
        };
    }

    private hasDrawableChar() {
        return this.available.length > 0 || this.delayedDiscard.length > 0;
    }

    private releaseDelayedIfNeeded() {
        if (this.available.length > 0 || this.delayedDiscard.length <= 0) return;
        this.available.push(...this.delayedDiscard);
        this.delayedDiscard = [];
    }
}
