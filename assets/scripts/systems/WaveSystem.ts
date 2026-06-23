export type EnemyType = 'basic' | 'shield' | 'cavalry' | 'archer';

export type LevelConfig = {
    name: string;
    totalEnemies: number;
    spawnInterval: number;
    enemyTypes: EnemyType[];
};

export type SpawnPayload = {
    waveName: string;
    index: number;
    total: number;
    type: EnemyType;
};

/**
 * v0.8.2 稳定刷怪系统。
 *
 * 仍然不依赖 EventBus。
 * WaveSystem 只负责按时间产生 spawn 回调，由 SystemManager 接到 EnemySystem。
 */
export class WaveSystem {

    private level: LevelConfig;
    private timer = 0;
    private spawned = 0;
    private running = false;

    public onWaveStart: ((level: LevelConfig) => void) | null = null;
    public onSpawn: ((type: EnemyType, payload: SpawnPayload) => void) | null = null;
    public onWaveComplete: ((level: LevelConfig) => void) | null = null;

    constructor(level?: Partial<LevelConfig>) {
        this.level = this.buildLevel(level);
    }

    public reset(level?: Partial<LevelConfig>) {
        this.level = this.buildLevel(level);
        this.timer = 0;
        this.spawned = 0;
        this.running = false;
    }

    public start() {
        this.timer = 0;
        this.spawned = 0;
        this.running = true;

        console.log(`[WaveSystem v0.8.2] start: ${this.level.name}`);
        this.onWaveStart?.(this.level);
    }

    public tick(dt: number) {
        if (!this.running) return;

        this.timer += dt;

        // 用 while 防止低帧率时漏刷，但通常一次只刷一个。
        while (this.timer >= this.level.spawnInterval && this.spawned < this.level.totalEnemies) {
            this.timer -= this.level.spawnInterval;
            this.spawned++;

            const type = this.pickEnemyType(this.spawned);
            const payload: SpawnPayload = {
                waveName: this.level.name,
                index: this.spawned,
                total: this.level.totalEnemies,
                type,
            };

            console.log(`[WaveSystem v0.8.2] spawn ${type} ${payload.index}/${payload.total}`);
            this.onSpawn?.(type, payload);
        }

        if (this.spawned >= this.level.totalEnemies) {
            this.running = false;
            console.log(`[WaveSystem v0.8.2] complete: ${this.level.name}`);
            this.onWaveComplete?.(this.level);
        }
    }

    public getStatusText() {
        const state = this.running ? 'RUNNING' : 'STOPPED';
        return `${this.level.name} | ${state} | ${this.spawned}/${this.level.totalEnemies}`;
    }

    private pickEnemyType(spawnIndex: number): EnemyType {
        const types = this.level.enemyTypes.length > 0 ? this.level.enemyTypes : ['basic'];
        return types[(spawnIndex - 1) % types.length];
    }

    private buildLevel(level?: Partial<LevelConfig>): LevelConfig {
        return {
            name: level?.name ?? 'v0.8.2_path_wave',
            totalEnemies: level?.totalEnemies ?? 40,
            spawnInterval: level?.spawnInterval ?? 1.0,
            enemyTypes: level?.enemyTypes ?? ['basic', 'shield', 'basic', 'cavalry', 'archer'],
        };
    }
}
