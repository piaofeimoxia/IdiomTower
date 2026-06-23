export type LevelConfig = {
    name: string;
    desc: string;
    totalEnemies: number;
    gateHp: number;
    spawnInterval: number;
    shieldEvery: number;
    cavalryEvery: number;
    archerEvery: number;
};

export class LevelSystem {

    private levels: LevelConfig[] = [];
    private index = 0;

    constructor() {
        this.levels = [
            {
                name: '第 1 关',
                desc: '教学关：熟悉基础操作',
                totalEnemies: 10,
                gateHp: 14,
                spawnInterval: 1.35,
                shieldEvery: 0,
                cavalryEvery: 0,
                archerEvery: 0,
            },
            {
                name: '第 2 关',
                desc: '盾兵出现，节奏提升',
                totalEnemies: 15,
                gateHp: 13,
                spawnInterval: 1.16,
                shieldEvery: 4,
                cavalryEvery: 0,
                archerEvery: 0,
            },
            {
                name: '第 3 关',
                desc: '骑兵加入，压力提升',
                totalEnemies: 21,
                gateHp: 12,
                spawnInterval: 0.98,
                shieldEvery: 4,
                cavalryEvery: 5,
                archerEvery: 0,
            },
            {
                name: '第 4 关',
                desc: '远程弓兵登场',
                totalEnemies: 24,
                gateHp: 12,
                spawnInterval: 0.94,
                shieldEvery: 4,
                cavalryEvery: 6,
                archerEvery: 7,
            }
        ];
    }

    get current(): LevelConfig {
        return this.levels[this.index];
    }

    get currentIndex(): number {
        return this.index;
    }

    nextLevel(): void {
        if (this.index < this.levels.length - 1) {
            this.index++;
        }
    }

    reset(): void {
        this.index = 0;
    }

    isLastLevel(): boolean {
        return this.index >= this.levels.length - 1;
    }
}