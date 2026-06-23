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
};

export type EnemyRemovedReason = 'dead' | 'base_hit';

/**
 * v0.8.2 敌人正式路径系统。
 *
 * 只负责敌人数据、路径移动、到达终点判定。
 * 不直接创建 Cocos 节点，渲染交给 ViewSystem。
 */
export class EnemySystem {

    private readonly path: Vec3[];
    private enemies: EnemyState[] = [];
    private nextId = 1;

    public onEnemySpawned: ((enemy: EnemyState) => void) | null = null;
    public onEnemyUpdated: ((enemy: EnemyState) => void) | null = null;
    public onEnemyRemoved: ((enemy: EnemyState, reason: EnemyRemovedReason) => void) | null = null;
    public onBaseHit: ((enemy: EnemyState) => void) | null = null;

    constructor(path: Vec3[]) {
        this.path = path.map(p => p.clone());
    }

    public spawnEnemy(type: EnemyType) {
        const first = this.path[0] ?? new Vec3(-560, 0, 0);
        const stats = this.getStats(type);

        const enemy: EnemyState = {
            id: this.nextId++,
            type,
            hp: stats.hp,
            maxHp: stats.hp,
            speed: stats.speed,
            position: first.clone(),
            segmentIndex: 0,
            reachedEnd: false,
        };

        this.enemies.push(enemy);
        console.log(`[EnemySystem v0.8.2] spawned #${enemy.id} ${enemy.type}`);
        this.onEnemySpawned?.(this.cloneEnemy(enemy));
    }

    public tick(dt: number) {
        if (this.path.length < 2) return;

        const removed: { enemy: EnemyState; reason: EnemyRemovedReason }[] = [];

        for (const enemy of this.enemies) {
            this.moveAlongPath(enemy, dt);

            if (enemy.reachedEnd) {
                removed.push({ enemy, reason: 'base_hit' });
                continue;
            }

            this.onEnemyUpdated?.(this.cloneEnemy(enemy));
        }

        if (removed.length > 0) {
            for (const item of removed) {
                this.removeEnemy(item.enemy, item.reason);
            }
        }
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

    private moveAlongPath(enemy: EnemyState, dt: number) {
        let remainDistance = enemy.speed * dt;

        while (remainDistance > 0 && !enemy.reachedEnd) {
            const nextPoint = this.path[enemy.segmentIndex + 1];
            if (!nextPoint) {
                enemy.reachedEnd = true;
                return;
            }

            const dx = nextPoint.x - enemy.position.x;
            const dy = nextPoint.y - enemy.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= 0.001) {
                enemy.segmentIndex++;
                if (enemy.segmentIndex >= this.path.length - 1) {
                    enemy.reachedEnd = true;
                }
                continue;
            }

            if (remainDistance >= distance) {
                enemy.position.set(nextPoint.x, nextPoint.y, nextPoint.z);
                remainDistance -= distance;
                enemy.segmentIndex++;

                if (enemy.segmentIndex >= this.path.length - 1) {
                    enemy.reachedEnd = true;
                }
            } else {
                const ratio = remainDistance / distance;
                enemy.position.set(
                    enemy.position.x + dx * ratio,
                    enemy.position.y + dy * ratio,
                    enemy.position.z,
                );
                remainDistance = 0;
            }
        }
    }

    private removeEnemy(enemy: EnemyState, reason: EnemyRemovedReason) {
        this.enemies = this.enemies.filter(e => e.id !== enemy.id);

        if (reason === 'base_hit') {
            console.log(`[EnemySystem v0.8.2] enemy #${enemy.id} reached base`);
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
