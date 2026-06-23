import { Vec3 } from 'cc';
import { EnemyType } from './WaveSystem';

export type ArcherState = 'walk' | 'raise' | 'draw' | 'full' | 'release' | 'recover' | 'cooldown';

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

    rangedStopped: boolean;
    rangedAttackX: number;
    rangedAttackInterval: number;
    archerState: ArcherState;
    archerStateTimer: number;
};

export type EnemyRemovedReason = 'dead' | 'base_hit';

export type DamageResult = {
    enemy: EnemyState;
    damage: number;
    killed: boolean;
};

/**
 * v0.8.6.1 敌人平面路径系统。
 *
 * 保留弓兵远程攻击与百步穿杨单体伤害，并降低开局压力。
 */
export class EnemySystem {

    private readonly path: Vec3[];
    private enemies: EnemyState[] = [];
    private nextId = 1;

    private readonly commonLanes = [-22, -6, 10, 26, 42];
    private readonly archerLanes = [-18, -2, 14, 30];
    private readonly archerStopOffsets = [-72, -36, 0, 34, 68];

    private readonly archerRaiseDuration = 0.10;
    private readonly archerDrawDuration = 0.12;
    private readonly archerFullDuration = 0.14;
    private readonly archerReleaseDuration = 0.08;
    private readonly archerRecoverDuration = 0.14;

    public onEnemySpawned: ((enemy: EnemyState) => void) | null = null;
    public onEnemyUpdated: ((enemy: EnemyState) => void) | null = null;
    public onEnemyRemoved: ((enemy: EnemyState, reason: EnemyRemovedReason) => void) | null = null;
    public onBaseHit: ((enemy: EnemyState) => void) | null = null;
    public onRangedAttackGate: ((enemy: EnemyState) => void) | null = null;

    constructor(path: Vec3[]) {
        this.path = path.map(p => p.clone());
    }

    public spawnEnemy(type: EnemyType) {
        const id = this.nextId++;
        const first = this.path[0] ?? new Vec3(-560, 24, 0);
        const stats = this.getStats(type, id);
        const lanes = type === 'archer' ? this.archerLanes : this.commonLanes;
        const laneY = lanes[(id - 1) % lanes.length];

        const laneBias = laneY >= 20 ? -10 : laneY <= -10 ? 10 : 0;
        const gateX = this.path[this.path.length - 1]?.x ?? 400;
        const archerStopX = gateX - 560 + this.archerStopOffsets[(id - 1) % this.archerStopOffsets.length] + laneBias;
        const archerInterval = 1.95 + ((id - 1) % 2) * 0.18;

        const enemy: EnemyState = {
            id,
            type,
            hp: stats.hp,
            maxHp: stats.hp,
            speed: stats.speed,
            position: new Vec3(first.x, laneY, first.z),
            segmentIndex: 0,
            reachedEnd: false,
            frozenRemain: 0,

            rangedStopped: false,
            rangedAttackX: type === 'archer' ? archerStopX : 0,
            rangedAttackInterval: type === 'archer' ? archerInterval : 0,
            archerState: 'walk',
            archerStateTimer: 0,
        };

        this.enemies.push(enemy);
        console.log(`[EnemySystem v0.8.6.1] spawned #${enemy.id} ${enemy.type}`);
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

            if (enemy.type === 'archer') {
                this.updateArcher(enemy, dt);
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

        for (const item of removed) this.removeEnemy(item.enemy, item.reason);
    }

    public damageClosestToBase(amount: number): DamageResult | null {
        if (this.enemies.length <= 0) return null;
        const target = [...this.enemies].filter(enemy => !enemy.reachedEnd).sort((a, b) => b.position.x - a.position.x)[0];
        if (!target) return null;

        target.hp = Math.max(0, target.hp - amount);
        const killed = target.hp <= 0;
        const snapshot = this.cloneEnemy(target);

        if (killed) this.removeEnemy(target, 'dead');
        else this.onEnemyUpdated?.(snapshot);

        return { enemy: snapshot, damage: amount, killed };
    }

    public damageAll(amount: number): DamageResult[] {
        const results: DamageResult[] = [];
        const removed: EnemyState[] = [];

        for (const enemy of this.enemies) {
            enemy.hp = Math.max(0, enemy.hp - amount);
            const killed = enemy.hp <= 0;
            const snapshot = this.cloneEnemy(enemy);
            results.push({ enemy: snapshot, damage: amount, killed });
            if (killed) removed.push(enemy);
            else this.onEnemyUpdated?.(snapshot);
        }

        for (const enemy of removed) this.removeEnemy(enemy, 'dead');
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
        for (const enemy of old) this.onEnemyRemoved?.(this.cloneEnemy(enemy), 'dead');
    }

    private moveFlatLane(enemy: EnemyState, dt: number) {
        const target = this.path[this.path.length - 1] ?? new Vec3(400, 24, 0);
        enemy.position.x += enemy.speed * dt;

        if (enemy.position.x >= target.x) {
            enemy.position.x = target.x;
            enemy.reachedEnd = true;
        }
    }

    private updateArcher(enemy: EnemyState, dt: number) {
        if (!enemy.rangedStopped) {
            if (enemy.position.x >= enemy.rangedAttackX) {
                enemy.rangedStopped = true;
                enemy.position.x = enemy.rangedAttackX;
                enemy.archerState = 'raise';
                enemy.archerStateTimer = 0;
                return;
            }

            enemy.position.x += enemy.speed * dt;
            if (enemy.position.x >= enemy.rangedAttackX) {
                enemy.position.x = enemy.rangedAttackX;
                enemy.rangedStopped = true;
                enemy.archerState = 'raise';
                enemy.archerStateTimer = 0;
            }
            return;
        }

        enemy.archerStateTimer += dt;

        if (enemy.archerState === 'raise' && enemy.archerStateTimer >= this.archerRaiseDuration) {
            enemy.archerState = 'draw';
            enemy.archerStateTimer = 0;
            return;
        }
        if (enemy.archerState === 'draw' && enemy.archerStateTimer >= this.archerDrawDuration) {
            enemy.archerState = 'full';
            enemy.archerStateTimer = 0;
            return;
        }
        if (enemy.archerState === 'full' && enemy.archerStateTimer >= this.archerFullDuration) {
            enemy.archerState = 'release';
            enemy.archerStateTimer = 0;
            this.onRangedAttackGate?.(this.cloneEnemy(enemy));
            return;
        }
        if (enemy.archerState === 'release' && enemy.archerStateTimer >= this.archerReleaseDuration) {
            enemy.archerState = 'recover';
            enemy.archerStateTimer = 0;
            return;
        }
        if (enemy.archerState === 'recover' && enemy.archerStateTimer >= this.archerRecoverDuration) {
            enemy.archerState = 'cooldown';
            enemy.archerStateTimer = 0;
            return;
        }
        if (enemy.archerState === 'cooldown' && enemy.archerStateTimer >= enemy.rangedAttackInterval) {
            enemy.archerState = 'raise';
            enemy.archerStateTimer = 0;
        }
    }

    private removeEnemy(enemy: EnemyState, reason: EnemyRemovedReason) {
        this.enemies = this.enemies.filter(e => e.id !== enemy.id);

        if (reason === 'base_hit') {
            console.log(`[EnemySystem v0.8.6.1] enemy #${enemy.id} reached base`);
            this.onBaseHit?.(this.cloneEnemy(enemy));
        }

        this.onEnemyRemoved?.(this.cloneEnemy(enemy), reason);
    }

    private getStats(type: EnemyType, id: number) {
        // 前 10 个敌人低压，避免第一次奖励时已经兵临城下。
        if (id <= 10) return { hp: 80, speed: 30 };

        if (type === 'shield') return { hp: 150, speed: 34 };
        if (type === 'cavalry') return { hp: 90, speed: 58 };
        if (type === 'archer') return { hp: 80, speed: 38 };
        return { hp: 90, speed: 38 };
    }

    private cloneEnemy(enemy: EnemyState): EnemyState {
        return { ...enemy, position: enemy.position.clone() };
    }
}
