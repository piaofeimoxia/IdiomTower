import { EventBus } from '../EventBus';

export type LevelConfig = { name:string; totalEnemies:number; spawnInterval:number };

export class WaveSystem {
    private timer = 0;
    private spawned = 0;

    constructor(private level: LevelConfig) {}

    tick(dt: number) {
        if (this.spawned >= this.level.totalEnemies) return;

        this.timer += dt;

        if (this.timer >= this.level.spawnInterval) {
            this.timer = 0;
            this.spawned++;

            // Event-driven spawn
            EventBus.instance.emit('enemy.spawn', {
                wave: this.level.name,
                index: this.spawned
            });
        }
    }

    reset(level?: LevelConfig) {
        this.timer = 0;
        this.spawned = 0;
        if (level) this.level = level;
    }
}