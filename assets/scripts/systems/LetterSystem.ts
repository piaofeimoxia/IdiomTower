/**
 * v0.7 LetterSystem
 * ------------------
 * Cocos Creator / TypeScript 纯逻辑字系统。
 *
 * 设计目标：
 * 1. 不依赖 Node / Prefab / Scene，方便 GameManager 或 UI 层调用。
 * 2. 用 Bag + Queue 实现“字一个一个出现”的伪随机。
 * 3. 支持奖励加入新字、调整权重、污染字、打乱队列。
 * 4. 保持旧版四字成语玩法可兼容：UI层只需要从 queue 取字生成 CharTile。
 */

export type LetterSource = 'base' | 'reward' | 'pollution';

export type LetterEntry = {
    char: string;
    weight: number;
    source?: LetterSource;
};

export type LetterSystemConfig = {
    /** 当前可见/可用的候选队列长度 */
    queueSize: number;

    /** 每隔多少秒向队列补一个字 */
    spawnInterval: number;

    /** 基础字池 */
    baseLetters: LetterEntry[];

    /** 权重放大倍数。权重会被转换成 Bag 内重复次数 */
    weightScale?: number;

    /** 是否初始化时立刻填满队列 */
    fillQueueOnInit?: boolean;

    /** 是否允许队列里出现重复字 */
    allowDuplicateInQueue?: boolean;
};

export type PollutionConfig = {
    enabled: boolean;
    ratio: number;               // 0~1，抽字时有多少概率走污染字池
    letters: LetterEntry[];
};

export type LetterQueueChangedHandler = (queue: string[]) => void;

export class LetterSystem {
    public readonly name = 'LetterSystem';

    private queueSize = 8;
    private spawnInterval = 0.6;
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

        this.timer = 0;
        this.queue = [];
        this.rebuildBag();
        this.rebuildPollutionBag();

        if (config.fillQueueOnInit ?? true) {
            this.fillQueue();
        }

        this.emitQueueChanged();
    }

    /** Cocos update(dt) 中调用 */
    public tick(dt: number): void {
        if (this.queue.length >= this.queueSize) return;

        this.timer += dt;
        if (this.timer < this.spawnInterval) return;

        this.timer = 0;
        this.spawnOne();
    }

    /** 手动补一个字到队列 */
    public spawnOne(): string | null {
        if (this.queue.length >= this.queueSize) return null;

        const next = this.drawLetter();
        if (!next) return null;

        if (!this.allowDuplicateInQueue && this.queue.indexOf(next) >= 0) {
            // 避免重复时，尝试多抽几次，防止关键字短时间堆满。
            for (let i = 0; i < 8; i++) {
                const retry = this.drawLetter();
                if (retry && this.queue.indexOf(retry) < 0) {
                    this.queue.push(retry);
                    this.emitQueueChanged();
                    return retry;
                }
            }
        }

        this.queue.push(next);
        this.emitQueueChanged();
        return next;
    }

    /** 填满当前队列 */
    public fillQueue(): void {
        while (this.queue.length < this.queueSize) {
            const added = this.spawnOne();
            if (!added) break;
        }
    }

    /** UI拖走/使用某个队列字 */
    public consumeAt(index: number): string | null {
        if (index < 0 || index >= this.queue.length) return null;

        const [char] = this.queue.splice(index, 1);
        this.emitQueueChanged();
        return char ?? null;
    }

    /** 按字值消耗第一个匹配项 */
    public consumeChar(char: string): boolean {
        const index = this.queue.indexOf(char);
        if (index < 0) return false;

        this.consumeAt(index);
        return true;
    }

    /** 错误放置/撤回时，把字放回队列末尾 */
    public returnToQueue(char: string): boolean {
        if (!char || this.queue.length >= this.queueSize) return false;
        this.queue.push(char);
        this.emitQueueChanged();
        return true;
    }

    /** 奖励：加入一个新字，或者提高已有字权重 */
    public addRewardLetter(char: string, weight = 1): void {
        if (!char) return;

        const found = this.findEntry(char);
        if (found) {
            found.weight += weight;
        } else {
            this.rewardPool.push({ char, weight: Math.max(0.1, weight), source: 'reward' });
        }

        this.rebuildBag();
    }

    /** 奖励：批量加入字 */
    public addRewardLetters(entries: LetterEntry[]): void {
        for (const entry of entries) {
            this.addRewardLetter(entry.char, entry.weight);
        }
    }

    /** 奖励/关卡效果：设置某个字的权重 */
    public setLetterWeight(char: string, weight: number): void {
        const found = this.findEntry(char);
        if (!found) {
            this.rewardPool.push({ char, weight: Math.max(0.1, weight), source: 'reward' });
        } else {
            found.weight = Math.max(0.1, weight);
        }

        this.rebuildBag();
    }

    /** Boss/关卡效果：配置污染字 */
    public setPollution(config: PollutionConfig): void {
        this.pollutionEnabled = config.enabled;
        this.pollutionRatio = this.clamp01(config.ratio);
        this.pollutionPool = this.normalizePool(config.letters, 'pollution');
        this.rebuildPollutionBag();
    }

    /** Boss效果：直接向当前队列塞污染字 */
    public injectNoise(count = 1): void {
        if (this.pollutionPool.length <= 0) return;

        for (let i = 0; i < count; i++) {
            if (this.queue.length >= this.queueSize) break;
            const noise = this.drawFromPollutionBag();
            if (noise) this.queue.push(noise);
        }

        this.emitQueueChanged();
    }

    /** Boss效果：打乱当前队列 */
    public shuffleQueue(): void {
        this.shuffle(this.queue);
        this.emitQueueChanged();
    }

    /** 清空队列，通常用于重开/切关 */
    public clearQueue(): void {
        this.queue = [];
        this.emitQueueChanged();
    }

    public reset(): void {
        this.timer = 0;
        this.queue = [];
        this.rebuildBag();
        this.rebuildPollutionBag();
        this.fillQueue();
        this.emitQueueChanged();
    }

    public getQueue(): string[] {
        return [...this.queue];
    }

    public getPoolSnapshot(): LetterEntry[] {
        return [
            ...this.basePool.map(v => ({ ...v })),
            ...this.rewardPool.map(v => ({ ...v })),
        ];
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
        if (this.bag.length <= 0) return null;

        return this.bag.shift() ?? null;
    }

    private drawFromPollutionBag(): string | null {
        if (this.pollutionBag.length <= 0) this.rebuildPollutionBag();
        if (this.pollutionBag.length <= 0) return null;

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
            for (let i = 0; i < count; i++) {
                result.push(entry.char);
            }
        }

        return result;
    }

    private normalizePool(pool: LetterEntry[], source: LetterSource): LetterEntry[] {
        const map = new Map<string, LetterEntry>();

        for (const item of pool || []) {
            if (!item.char) continue;
            const old = map.get(item.char);
            if (old) {
                old.weight += Math.max(0.1, item.weight || 1);
            } else {
                map.set(item.char, {
                    char: item.char,
                    weight: Math.max(0.1, item.weight || 1),
                    source,
                });
            }
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
        if (v < 0) return 0;
        if (v > 1) return 1;
        return v;
    }

    private emitQueueChanged(): void {
        const snapshot = this.getQueue();
        for (const handler of this.queueChangedHandlers) {
            handler(snapshot);
        }
    }
}

/**
 * 默认开局字池：
 * - 万箭齐发：基础攻击
 * - 固若金汤：基础防御
 * - 画地为牢：基础控制
 *
 * 后续“火上浇油 / 草木皆兵”等通过奖励字逐步加入。
 */
export const DEFAULT_STARTER_LETTERS: LetterEntry[] = [
    { char: '万', weight: 1.4 },
    { char: '箭', weight: 1.4 },
    { char: '齐', weight: 1.2 },
    { char: '发', weight: 1.2 },

    { char: '固', weight: 1.0 },
    { char: '若', weight: 1.0 },
    { char: '金', weight: 1.0 },
    { char: '汤', weight: 1.0 },

    { char: '画', weight: 0.8 },
    { char: '地', weight: 0.8 },
    { char: '为', weight: 0.8 },
    { char: '牢', weight: 0.8 },
];

export const DEFAULT_POLLUTION_LETTERS: LetterEntry[] = [
    { char: '的', weight: 1.0 },
    { char: '了', weight: 1.0 },
    { char: '在', weight: 1.0 },
    { char: '是', weight: 1.0 },
    { char: '不', weight: 1.0 },
];
