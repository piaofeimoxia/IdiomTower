import { SystemManager } from './SystemManager';
import type { RogueliteRewardOption } from './systems/ViewSystemRoguelitePatch';
import type { DamageResult } from './systems/EnemySystem';

function installSystemManagerRewardPatch() {
    const proto = SystemManager.prototype as any;
    if (proto.__rewardPatch08632) return;
    proto.__rewardPatch08632 = true;

    proto.buildRogueLevelConfig = function() {
        return {
            name: 'v0.8.6.3.2_same_lane_pierce_wave',
            totalEnemies: 180,
            spawnInterval: 1.45,
            enemyTypes: [
                'basic', 'basic', 'basic', 'basic', 'basic',
                'basic', 'basic', 'basic', 'basic', 'basic',
                'shield', 'basic', 'basic', 'cavalry', 'basic', 'archer',
            ],
        };
    };

    proto.releaseBaiBuChuanYang = function() {
        const damage = this.baiBuDamage ?? 120;
        const results: DamageResult[] = this.enemySystem.damagePierceClosestToBase
            ? this.enemySystem.damagePierceClosestToBase(damage, 1)
            : [];

        if (!results || results.length <= 0) {
            this.viewSystem.showTip('百步穿杨：当前没有目标');
            return false;
        }

        (this.viewSystem as any).showBaiBuPierceEffect?.(results);
        for (const result of results) {
            this.viewSystem.showEnemyHitFeedback(result.enemy, result.damage, result.killed);
        }

        const killCount = results.filter(r => r.killed).length;
        this.viewSystem.showTip(results.length >= 2
            ? `百步穿杨！同排贯穿 ${results.length} 个敌人，击杀 ${killCount} 个`
            : results[0].killed ? '百步穿杨！点杀最前方敌人' : `百步穿杨！造成 ${damage} 点伤害`);
        console.log(`[SystemManager v0.8.6.3.2] skill 百步穿杨 same_lane_pierce=${results.length}, killed=${killCount}`);
        return true;
    };

    proto.generateRewardOptions = function(): RogueliteRewardOption[] {
        const options: RogueliteRewardOption[] = [];
        const usedTitles = new Set<string>();
        const usedChars = new Set<string>();

        const pushUnique = (option: RogueliteRewardOption | null | undefined) => {
            if (!option) return false;
            if (usedTitles.has(option.title)) return false;
            usedTitles.add(option.title);
            options.push(option);
            if (option.id.startsWith('char:')) usedChars.add(option.id.split(':')[1]);
            return true;
        };

        // 五选二：保证至少 3 个字相关奖励，明显加快新成语成型。
        pushUnique(this.createCharReward(usedChars));
        pushUnique(this.createCharReward(usedChars));
        pushUnique(this.createCharReward(usedChars));

        const gold = Math.random() < 0.22 ? this.createGoldIdiomReward() : null;
        pushUnique(gold);

        let guard = 0;
        while (options.length < 5 && guard++ < 30) {
            const roll = Math.random();
            if (roll < 0.34) {
                if (pushUnique(this.createRareReward())) continue;
            }
            if (roll < 0.48) {
                const g = this.createGoldIdiomReward();
                if (pushUnique(g)) continue;
            }
            pushUnique(this.createCharReward(usedChars));
        }

        while (options.length < 5) pushUnique(this.createRareReward());
        return options.slice(0, 5);
    };

    proto.tryOpenLevelReward = function() {
        if (this.rewardPaused || this.gameOver) return;

        const thresholds = [4, 9, 16, 26, 39, 55, 75, 100, 130];
        const nextThreshold = thresholds[this.rogueLevel - 1];
        if (!nextThreshold || this.killCount < nextThreshold) return;

        this.rogueLevel++;
        this.rewardPaused = true;
        const options: RogueliteRewardOption[] = this.generateRewardOptions();
        this.viewSystem.showTip(`升级到 Lv.${this.rogueLevel}，五选二奖励`);

        const finish = (selected: RogueliteRewardOption[]) => {
            if (this.gameOver) return;
            for (const option of selected) this.applyReward(option);
            this.rewardPaused = false;
            this.refreshRogueliteTiles?.();
            this.viewSystem.showTip(`已选择 ${selected.length} 个奖励，继续守城`);
        };

        if ((this.viewSystem as any).showRewardChoicesPick2) {
            (this.viewSystem as any).showRewardChoicesPick2(options, 2, finish);
        } else {
            (this.viewSystem as any).showRewardChoices(options.slice(0, 3), (option: RogueliteRewardOption) => finish([option]));
        }
    };
}

installSystemManagerRewardPatch();
