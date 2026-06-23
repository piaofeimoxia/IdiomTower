import { EnemySystem, DamageResult, EnemyState } from './EnemySystem';

function cloneEnemy(enemy: EnemyState): EnemyState {
    return {
        ...enemy,
        position: enemy.position.clone(),
    };
}

function installEnemyPiercePatch() {
    const proto = EnemySystem.prototype as any;
    if (proto.__piercePatch08632) return;
    proto.__piercePatch08632 = true;

    /**
     * v0.8.6.3.2：百步穿杨同排贯穿。
     *
     * 修复点：
     * - 不再简单取“最靠近城门的两个敌人”。
     * - 先锁定最靠近城门的主目标。
     * - 只在主目标同一行里继续寻找后方 1 个敌人。
     * - 如果同一行后方没有敌人，则只命中主目标。
     */
    proto.damagePierceClosestToBase = function(amount: number, pierceCount = 1): DamageResult[] {
        const enemies: EnemyState[] = this.enemies ?? [];
        const active = enemies
            .filter(enemy => !enemy.reachedEnd)
            .sort((a, b) => b.position.x - a.position.x);

        if (active.length <= 0) return [];

        const primary = active[0];
        const laneTolerance = 8;
        const sameLaneBehind = active
            .filter(enemy => enemy.id !== primary.id)
            .filter(enemy => Math.abs(enemy.position.y - primary.position.y) <= laneTolerance)
            .filter(enemy => enemy.position.x <= primary.position.x + 4)
            .sort((a, b) => b.position.x - a.position.x)
            .slice(0, Math.max(0, pierceCount));

        const targets = [primary, ...sameLaneBehind];
        const results: DamageResult[] = [];
        const removed: EnemyState[] = [];

        for (const target of targets) {
            target.hp = Math.max(0, target.hp - amount);
            const killed = target.hp <= 0;
            const snapshot = cloneEnemy(target);
            results.push({ enemy: snapshot, damage: amount, killed });

            if (killed) removed.push(target);
            else this.onEnemyUpdated?.(snapshot);
        }

        for (const enemy of removed) {
            this.removeEnemy?.(enemy, 'dead');
        }

        return results;
    };
}

installEnemyPiercePatch();
