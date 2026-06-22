/**
 * v0.7 LetterSystem
 * ------------------
 * Cocos Creator / TypeScript 纯逻辑字系统。
 *
 * 目标：
 * 1. 字块按 Bag + Queue 伪随机一个一个进入候选区。
 * 2. 开局只给简单单体伤害成语「百步穿杨」。
 * 3. 其他成语需要通过奖励加入对应字，避免一开局就出现万箭齐发/固若金汤/画地为牢。
 * 4. 不依赖 Node / Prefab / Scene，GameManager 负责把 queue 渲染成 CharTile。
 */

export type LetterSource = 'base' | 'reward' | 'pollution';

export type LetterEntry = {
    char: string;
    weight: number;
    source?: LetterSource;
};

export type LetterSystemConfig = {
    queueSize: number;
    spawnInterval: number;
    baseLetters: LetterEntry[];
    weightScale?: number;
    fillQueueOnInit?: boolean;
    allowDuplicateInQueue?: boolean;
};

export type PollutionConfig = {
    enabled: boolean;
    ratio: number;
    letters: LetterEntry[];
};

export type LetterQueueChangedHandler = (queue: string[]) => void;

export class LetterSystem {
    public readonly name = 'LetterSystem';

    private queueSize = 8;
    private spawnInterval = 0.75;
    private weightScale = 10;
    private allowDuplicateInQueue = true;
    private timer = 0;

    private basePool: LetterEntry[] = [];
    private rewardPool: LetterEntry[] = [];
    private pollutionPool: LetterEntry[] = [];

    private bag: string[] = [];
    private pollutionBag: string[] = [];
    private queue: string[] = [];

    private pollutionEnabled = false;
    private pollutionRatio = 0;
    private queueChangedHandlers: LetterQueueChangedHandler[] = [];

    public init(config: LetterSystemConfig): void {
        this.queueSize = Math.max(1, config.queueSize);
        this.spawnInterval = Math.max(0.05, config.spawnInterval);
        this.weightScale = Math.max(1, config.weightScale ?? 10);
        this.allowDuplicateInQueue = config.allowDuplicateInQueue ?? true;

        this.basePool = this.normalizePool(config.baseLetters, 'base');
        this.rewardPool = [];
        this.pollutionPool = [];
        this.queue = [];
        this.timer = 0;
        this.rebuildBag();
        this.rebuildPollutionBag();

        if (config.fillQueueOnInit ?? false) this.fillQueue();
        this.emitQueueChanged();
    }

    public tick(dt: number): void {
        if (this.queue.length >= this.queueSize) return;
        this.timer += dt;
        if (this.timer < this.spawnInterval) return;
        this.timer = 0;
        this.spawnOne();
    }

    public spawnOne(): string | null {
        if (this.queue.length >= this.queueSize) return null;
        let next = this.drawLetter();
        if (!next) return null;

        if (!this.allowDuplicateInQueue && this.queue.indexOf(next) >= 0) {
            for (let i = 0; i < 8; i++) {
                const retry = this.drawLetter();
                if (retry && this.queue.indexOf(retry) < 0) {
                    next = retry;
                    break;
                }
            }
        }

        this.queue.push(next);
        this.emitQueueChanged();
        return next;
    }

    public fillQueue(): void {
        while (this.queue.length < this.queueSize) {
            if (!this.spawnOne()) break;
        }
    }

    public consumeAt(index: number): string | null {
        if (index < 0 || index >= this.queue.length) return null;
        const [char] = this.queue.splice(index, 1);
        this.emitQueueChanged();
        return char ?? null;
    }

    public consumeChar(char: string): boolean {
        const index = this.queue.indexOf(char);
        if (index < 0) return false;
        this.consumeAt(index);
        return true;
    }

    public returnToQueue(char: string): boolean {
        if (!char || this.queue.length >= this.queueSize) return false;
        this.queue.push(char);
        this.emitQueueChanged();
        return true;
    }

    public addRewardLetter(char: string, weight = 1): void {
        if (!char) return;
        const found = this.findEntry(char);
        if (found) found.weight += Math.max(0.1, weight);
        else this.rewardPool.push({ char, weight: Math.max(0.1, weight), source: 'reward' });
        this.rebuildBag();
    }

    public addRewardLetters(entries: LetterEntry[]): void {
        for (const entry of entries) this.addRewardLetter(entry.char, entry.weight);
    }

    public setLetterWeight(char: string, weight: number): void {
        const found = this.findEntry(char);
        if (found) found.weight = Math.max(0.1, weight);
        else this.rewardPool.push({ char, weight: Math.max(0.1, weight), source: 'reward' });
        this.rebuildBag();
    }

    public setPollution(config: PollutionConfig): void {
        this.pollutionEnabled = config.enabled;
        this.pollutionRatio = this.clamp01(config.ratio);
        this.pollutionPool = this.normalizePool(config.letters, 'pollution');
        this.rebuildPollutionBag();
    }

    public injectNoise(count = 1): void {
        for (let i = 0; i < count; i++) {
            if (this.queue.length >= this.queueSize) break;
            const noise = this.drawFromPollutionBag();
            if (noise) this.queue.push(noise);
        }
        this.emitQueueChanged();
    }

    public shuffleQueue(): void {
        this.shuffle(this.queue);
        this.emitQueueChanged();
    }

    public clearQueue(): void {
        this.queue = [];
        this.emitQueueChanged();
    }

    public reset(): void {
        this.timer = 0;
        this.queue = [];
        this.rebuildBag();
        this.rebuildPollutionBag();
        this.emitQueueChanged();
    }

    public getQueue(): string[] {
        return [...this.queue];
    }

    public getPoolSnapshot(): LetterEntry[] {
        return [...this.basePool, ...this.rewardPool].map(v => ({ ...v }));
    }

    public onQueueChanged(handler: LetterQueueChangedHandler): void {
        this.queueChangedHandlers.push(handler);
    }

    public offQueueChanged(handler: LetterQueueChangedHandler): void {
        this.queueChangedHandlers = this.queueChangedHandlers.filter(h => h !== handler);
    }

    private drawLetter(): string | null {
        if (this.pollutionEnabled && this.pollutionPool.length > 0 && Math.random() < this.pollutionRatio) {
            return this.drawFromPollutionBag();
        }
        if (this.bag.length <= 0) this.rebuildBag();
        return this.bag.shift() ?? null;
    }

    private drawFromPollutionBag(): string | null {
        if (this.pollutionBag.length <= 0) this.rebuildPollutionBag();
        return this.pollutionBag.shift() ?? null;
    }

    private rebuildBag(): void {
        this.bag = this.buildWeightedBag([...this.basePool, ...this.rewardPool]);
        this.shuffle(this.bag);
    }

    private rebuildPollutionBag(): void {
        this.pollutionBag = this.buildWeightedBag(this.pollutionPool);
        this.shuffle(this.pollutionBag);
    }

    private buildWeightedBag(pool: LetterEntry[]): string[] {
        const result: string[] = [];
        for (const entry of pool) {
            const count = Math.max(1, Math.round(entry.weight * this.weightScale));
            for (let i = 0; i < count; i++) result.push(entry.char);
        }
        return result;
    }

    private normalizePool(pool: LetterEntry[], source: LetterSource): LetterEntry[] {
        const map = new Map<string, LetterEntry>();
        for (const item of pool || []) {
            if (!item.char) continue;
            const weight = Math.max(0.1, item.weight || 1);
            const old = map.get(item.char);
            if (old) old.weight += weight;
            else map.set(item.char, { char: item.char, weight, source });
        }
        return Array.from(map.values());
    }

    private findEntry(char: string): LetterEntry | null {
        return this.basePool.find(v => v.char === char)
            || this.rewardPool.find(v => v.char === char)
            || null;
    }

    private shuffle<T>(arr: T[]): void {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
    }

    private clamp01(v: number): number {
        return Math.max(0, Math.min(1, v));
    }

    private emitQueueChanged(): void {
        const snapshot = this.getQueue();
        for (const handler of this.queueChangedHandlers) handler(snapshot);
    }
}

/**
 * 开局只给一个简单单体伤害成语：百步穿杨。
 * 这样不会一开局就刷出万箭齐发/固若金汤/画地为牢。
 */
export const DEFAULT_STARTER_LETTERS: LetterEntry[] = [
    { char: '百', weight: 1.4 },
    { char: '步', weight: 1.4 },
    { char: '穿', weight: 1.4 },
    { char: '杨', weight: 1.4 },
];

/** 奖励字包：后续奖励系统从这里挑选，让玩家逐步构筑其他成语。 */
export const REWARD_LETTER_PACKS: Record<string, LetterEntry[]> = {
    '万箭齐发': [
        { char: '万', weight: 1.0 },
        { char: '箭', weight: 1.0 },
        { char: '齐', weight: 1.0 },
        { char: '发', weight: 1.0 },
    ],
    '固若金汤': [
        { char: '固', weight: 1.0 },
        { char: '若', weight: 1.0 },
        { char: '金', weight: 1.0 },
        { char: '汤', weight: 1.0 },
    ],
    '画地为牢': [
        { char: '画', weight: 1.0 },
        { char: '地', weight: 1.0 },
        { char: '为', weight: 1.0 },
        { char: '牢', weight: 1.0 },
    ],
    '火上浇油': [
        { char: '火', weight: 1.0 },
        { char: '上', weight: 1.0 },
        { char: '浇', weight: 1.0 },
        { char: '油', weight: 1.0 },
    ],
};

export const DEFAULT_POLLUTION_LETTERS: LetterEntry[] = [
    { char: '的', weight: 1.0 },
    { char: '了', weight: 1.0 },
    { char: '在', weight: 1.0 },
    { char: '是', weight: 1.0 },
    { char: '不', weight: 1.0 },
];
