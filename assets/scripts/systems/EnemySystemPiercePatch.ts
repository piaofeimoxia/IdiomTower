import { EnemySystem, DamageResult, EnemyState } from './EnemySystem';

function cloneEnemy(enemy: EnemyState): EnemyState {
    return {
        ...enemy,
        position: enemy.position.clone(),
    };
}

function installEnemyPiercePatch() {
    const proto = EnemySystem.prototype as any;
    if (proto.__piercePatch0863) return;
    proto.__piercePatch0863 = true;

    /**
     * v0.8.6.3：百步穿杨贯穿。
     * 目标：最靠近城门的敌人 + 其后 1 个敌人。
     */
    proto.damagePierceClosestToBase = function(amount: number, pierceCount = 1): DamageResult[] {
        const enemies: EnemyState[] = this.enemies ?? [];
        if (enemies.length <= 0) return [];

        const targets = [...enemies]
            .filter(enemy => !enemy.reachedEnd)
            .sort((a, b) => b.position.x - a.position.x)
            .slice(0, Math.max(1, pierceCount + 1));

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
