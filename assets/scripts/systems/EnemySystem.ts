import { Vec3 } from 'cc';
import { EnemyType } from './WaveSystem';

export type EnemyState = {
    id: number;
    type: EnemyType;
    hp: number;
    maxHp: number;
    speed: number;
    position: Vec3;
    segmentIndex: number;
    reachedEnd: boolean;
    frozenRemain: number;
};

export type EnemyRemovedReason = 'dead' | 'base_hit';

export type DamageResult = {
    enemy: EnemyState;
    damage: number;
    killed: boolean;
};

/**
 * v0.8.4 敌人平面路径系统。
 *
 * 新增：
 * - 全体伤害：万箭齐发
 * - 全体冻结：画地为牢
 */
export class EnemySystem {

    private readonly path: Vec3[];
    private enemies: EnemyState[] = [];
    private nextId = 1;

    private readonly commonLanes = [-22, -6, 10, 26, 42];
    private readonly archerLanes = [-18, -2, 14, 30];

    public onEnemySpawned: ((enemy: EnemyState) => void) | null = null;
    public onEnemyUpdated: ((enemy: EnemyState) => void) | null = null;
    public onEnemyRemoved: ((enemy: EnemyState, reason: EnemyRemovedReason) => void) | null = null;
    public onBaseHit: ((enemy: EnemyState) => void) | null = null;

    constructor(path: Vec3[]) {
        this.path = path.map(p => p.clone());
    }

    public spawnEnemy(type: EnemyType) {
        const first = this.path[0] ?? new Vec3(-560, 24, 0);
        const stats = this.getStats(type);
        const lanes = type === 'archer' ? this.archerLanes : this.commonLanes;
        const laneY = lanes[(this.nextId - 1) % lanes.length];

        const enemy: EnemyState = {
            id: this.nextId++,
            type,
            hp: stats.hp,
            maxHp: stats.hp,
            speed: stats.speed,
            position: new Vec3(first.x, laneY, first.z),
            segmentIndex: 0,
            reachedEnd: false,
            frozenRemain: 0,
        };

        this.enemies.push(enemy);
        console.log(`[EnemySystem v0.8.4] spawned #${enemy.id} ${enemy.type}`);
        this.onEnemySpawned?.(this.cloneEnemy(enemy));
    }

    public tick(dt: number) {
        const removed: { enemy: EnemyState; reason: EnemyRemovedReason }[] = [];

        for (const enemy of this.enemies) {
            if (enemy.frozenRemain > 0) {
                enemy.frozenRemain = Math.max(0, enemy.frozenRemain - dt);
                this.onEnemyUpdated?.(this.cloneEnemy(enemy));
                continue;
            }

            this.moveFlatLane(enemy, dt);

            if (enemy.reachedEnd) {
                removed.push({ enemy, reason: 'base_hit' });
                continue;
            }

            this.onEnemyUpdated?.(this.cloneEnemy(enemy));
        }

        for (const item of removed) {
            this.removeEnemy(item.enemy, item.reason);
        }
    }

    public damageAll(amount: number): DamageResult[] {
        const results: DamageResult[] = [];
        const removed: EnemyState[] = [];

        for (const enemy of this.enemies) {
            enemy.hp = Math.max(0, enemy.hp - amount);
            const killed = enemy.hp <= 0;
            const snapshot = this.cloneEnemy(enemy);
            results.push({ enemy: snapshot, damage: amount, killed });

            if (killed) {
                removed.push(enemy);
            } else {
                this.onEnemyUpdated?.(snapshot);
            }
        }

        for (const enemy of removed) {
            this.removeEnemy(enemy, 'dead');
        }

        return results;
    }

    public freezeAll(seconds: number): number {
        let count = 0;
        for (const enemy of this.enemies) {
            enemy.frozenRemain = Math.max(enemy.frozenRemain, seconds);
            count++;
            this.onEnemyUpdated?.(this.cloneEnemy(enemy));
        }
        return count;
    }

    public getAliveCount() {
        return this.enemies.length;
    }

    public clear() {
        const old = [...this.enemies];
        this.enemies.length = 0;
        for (const enemy of old) {
            this.onEnemyRemoved?.(this.cloneEnemy(enemy), 'dead');
        }
    }

    private moveFlatLane(enemy: EnemyState, dt: number) {
        const target = this.path[this.path.length - 1] ?? new Vec3(400, 24, 0);
        enemy.position.x += enemy.speed * dt;

        if (enemy.position.x >= target.x) {
            enemy.position.x = target.x;
            enemy.reachedEnd = true;
        }
    }

    private removeEnemy(enemy: EnemyState, reason: EnemyRemovedReason) {
        this.enemies = this.enemies.filter(e => e.id !== enemy.id);

        if (reason === 'base_hit') {
            console.log(`[EnemySystem v0.8.4] enemy #${enemy.id} reached base`);
            this.onBaseHit?.(this.cloneEnemy(enemy));
        }

        this.onEnemyRemoved?.(this.cloneEnemy(enemy), reason);
    }

    private getStats(type: EnemyType) {
        if (type === 'shield') return { hp: 180, speed: 58 };
        if (type === 'cavalry') return { hp: 100, speed: 115 };
        if (type === 'archer') return { hp: 90, speed: 76 };
        return { hp: 100, speed: 82 };
    }

    private cloneEnemy(enemy: EnemyState): EnemyState {
        return {
            ...enemy,
            position: enemy.position.clone(),
        };
    }
}
