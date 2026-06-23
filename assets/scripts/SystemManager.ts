import { Node, Vec3 } from 'cc';
import { WaveSystem, LevelConfig } from './systems/WaveSystem';
import { EnemySystem, EnemyRemovedReason, EnemyState } from './systems/EnemySystem';
import { ViewSystem } from './systems/ViewSystem';
import './systems/ViewSystemSkillPatch';
import './systems/ViewSystemArcherPatch';
import './systems/ViewSystemRoguelitePatch';
import type { RogueliteRewardOption } from './systems/ViewSystemRoguelitePatch';

type IdiomDef = {
    idiom: string;
    chars: string[];
    kind: 'single' | 'aoe' | 'shield' | 'freeze';
};

/**
 * v0.8.6 强关卡肉鸽奖励核心版。
 *
 * 本版按 `成语塔防_方案完成度与后续计划.md` 开始转向肉鸽构筑：
 * - 开局默认百步穿杨。
 * - 击杀升级。
 * - 升级时战斗暂停。
 * - 三选一奖励。
 * - 普通奖励给单字，重复字表示副本 +1。
 * - 金色奖励直接给完整成语并解锁。
 * - 集齐四字自动解锁对应成语。
 */
export class SystemManager {

    public readonly waveSystem: WaveSystem;
    public readonly enemySystem: EnemySystem;
    public readonly viewSystem: ViewSystem;

    private initialized = false;
    private baseLife = 12;
    private baseShield = 0;
    private readonly maxBaseLife = 12;

    private killCount = 0;
    private rogueLevel = 1;
    private rewardPaused = false;
    private suppressKillCount = false;

    private battleBagCapacity = 6;
    private idiomCharPoolCapacity = 12;
    private baiBuDamage = 120;

    private readonly levelKillThresholds = [5, 12, 22, 35, 52, 75, 105, 140];

    private readonly ownedCharCounts = new Map<string, number>();
    private readonly unlockedIdioms = new Set<string>();

    private readonly idiomDefs: IdiomDef[] = [
        { idiom: '百步穿杨', chars: ['百', '步', '穿', '杨'], kind: 'single' },
        { idiom: '万箭齐发', chars: ['万', '箭', '齐', '发'], kind: 'aoe' },
        { idiom: '固若金汤', chars: ['固', '若', '金', '汤'], kind: 'shield' },
        { idiom: '画地为牢', chars: ['画', '地', '为', '牢'], kind: 'freeze' },
    ];

    private readonly path = [
        new Vec3(-560, 24, 0),
        new Vec3(400, 24, 0),
    ];

    constructor() {
        const level: Partial<LevelConfig> = {
            name: 'v0.8.6_roguelite_core_wave',
            totalEnemies: 240,
            spawnInterval: 1.05,
            enemyTypes: ['basic', 'basic', 'basic', 'shield', 'basic', 'cavalry', 'basic', 'archer'],
        };

        this.waveSystem = new WaveSystem(level);
        this.enemySystem = new EnemySystem(this.path);
        this.viewSystem = new ViewSystem();

        this.waveSystem.onWaveStart = (cfg) => {
            this.viewSystem.showTip(`强关卡开始：${cfg.name}`);
        };

        this.waveSystem.onSpawn = (type) => {
            this.enemySystem.spawnEnemy(type);
        };

        this.waveSystem.onWaveComplete = (cfg) => {
            this.viewSystem.showTip(`刷怪完成：${cfg.name}`);
        };

        this.enemySystem.onEnemySpawned = (enemy) => {
            this.viewSystem.createEnemy(enemy);
        };

        this.enemySystem.onEnemyUpdated = (enemy) => {
            this.viewSystem.updateEnemy(enemy);
        };

        this.enemySystem.onEnemyRemoved = (enemy, reason) => {
            this.viewSystem.removeEnemy(enemy, reason);
            this.onEnemyRemoved(enemy, reason);
        };

        this.enemySystem.onBaseHit = (enemy) => {
            this.applyBaseDamage(1, `敌人 #${enemy.id} 攻到城门`);
        };

        this.enemySystem.onRangedAttackGate = (enemy) => {
            (this.viewSystem as any).showArcherShot?.(enemy);
            this.applyBaseDamage(1, `弓兵 #${enemy.id} 远程射击城门`);
        };

        this.viewSystem.onIdiomComplete = (idiom) => {
            this.releaseIdiomSkill(idiom);
        };
    }

    public initLevel(root: Node) {
        console.log('[SystemManager v0.8.6] initLevel');

        this.baseLife = this.maxBaseLife;
        this.baseShield = 0;
        this.killCount = 0;
        this.rogueLevel = 1;
        this.rewardPaused = false;
        this.battleBagCapacity = 6;
        this.idiomCharPoolCapacity = 12;
        this.baiBuDamage = 120;
        this.resetRogueliteBuild();

        this.viewSystem.init(root, this.path);
        this.viewSystem.updateGate(this.baseLife, this.maxBaseLife, this.baseShield);
        this.refreshRogueliteTiles();

        this.suppressKillCount = true;
        this.enemySystem.clear();
        this.suppressKillCount = false;

        this.waveSystem.reset({
            name: 'v0.8.6_roguelite_core_wave',
            totalEnemies: 240,
            spawnInterval: 1.05,
            enemyTypes: ['basic', 'basic', 'basic', 'shield', 'basic', 'cavalry', 'basic', 'archer'],
        });
        this.waveSystem.start();

        this.initialized = true;
        this.viewSystem.showTip('开局成语：百步穿杨。击杀 5 个敌人后获得第一次升级奖励。');
    }

    public tick(dt: number) {
        if (!this.initialized) return;

        if (!this.rewardPaused) {
            this.waveSystem.tick(dt);
            this.enemySystem.tick(dt);
        }

        this.viewSystem.updateHud(
            `${this.waveSystem.getStatusText()} | Lv.${this.rogueLevel} | kill=${this.killCount} | next=${this.getNextThresholdText()} | gate=${this.baseLife}/${this.maxBaseLife} | shield=${this.baseShield} | bag=${this.battleBagCapacity} | pool=${this.getOwnedTotal()}/${this.idiomCharPoolCapacity}`
        );
    }

    public destroy() {
        this.suppressKillCount = true;
        this.enemySystem.clear();
        this.suppressKillCount = false;
        this.viewSystem.clear();
        this.initialized = false;
    }

    private resetRogueliteBuild() {
        this.ownedCharCounts.clear();
        this.unlockedIdioms.clear();
        this.unlockedIdioms.add('百步穿杨');

        for (const ch of ['百', '步', '穿', '杨']) {
            this.addChar(ch, 2, false);
        }
    }

    private releaseIdiomSkill(idiom: string) {
        if (!this.unlockedIdioms.has(idiom)) {
            this.viewSystem.showTip(`尚未解锁：${idiom}`);
            return;
        }

        if (idiom === '百步穿杨') {
            this.releaseBaiBuChuanYang();
            return;
        }

        if (idiom === '万箭齐发') {
            this.releaseWanJianQiFa();
            return;
        }

        if (idiom === '固若金汤') {
            this.releaseGuRuoJinTang();
            return;
        }

        if (idiom === '画地为牢') {
            this.releaseHuaDiWeiLao();
            return;
        }
    }

    private releaseBaiBuChuanYang() {
        const result = this.enemySystem.damageClosestToBase(this.baiBuDamage);
        if (!result) {
            this.viewSystem.showTip('百步穿杨：当前没有目标');
            return;
        }

        this.viewSystem.showEnemyHitFeedback(result.enemy, result.damage, result.killed);
        this.viewSystem.showTip(result.killed
            ? '百步穿杨！点杀最前方敌人'
            : `百步穿杨！造成 ${result.damage} 点伤害`);
        console.log(`[SystemManager v0.8.6] skill 百步穿杨 damage=${result.damage}, killed=${result.killed}`);
    }

    private releaseWanJianQiFa() {
        const results = this.enemySystem.damageAll(9999);
        const hitCount = results.length;

        (this.viewSystem as any).showArrowRainEffect(hitCount);

        const maxBurstCount = Math.min(8, results.length);
        for (let i = 0; i < maxBurstCount; i++) {
            const result = results[i];
            this.viewSystem.showEnemyHitFeedback(result.enemy, result.damage, result.killed);
        }

        this.viewSystem.showTip(`万箭齐发！命中 ${hitCount} 个敌人`);
        console.log(`[SystemManager v0.8.6] skill 万箭齐发 hit=${hitCount}`);
    }

    private releaseGuRuoJinTang() {
        const shieldAmount = 5;
        this.baseShield += shieldAmount;
        this.viewSystem.updateGate(this.baseLife, this.maxBaseLife, this.baseShield);
        this.viewSystem.showShieldEffect();
        this.viewSystem.showTip(`固若金汤！城门获得 ${shieldAmount} 点护盾`);
        console.log(`[SystemManager v0.8.6] skill 固若金汤 shield=${this.baseShield}`);
    }

    private releaseHuaDiWeiLao() {
        const freezeSeconds = 3;
        const count = this.enemySystem.freezeAll(freezeSeconds);
        this.viewSystem.showFreezeEffect(freezeSeconds);
        this.viewSystem.showTip(`画地为牢！冻结 ${count} 个敌人 ${freezeSeconds} 秒`);
        console.log(`[SystemManager v0.8.6] skill 画地为牢 freeze=${count}`);
    }

    private onEnemyRemoved(_enemy: EnemyState, reason: EnemyRemovedReason) {
        if (this.suppressKillCount || reason !== 'dead') return;

        this.killCount++;
        this.tryOpenLevelReward();
    }

    private tryOpenLevelReward() {
        if (this.rewardPaused) return;

        const nextThreshold = this.levelKillThresholds[this.rogueLevel - 1];
        if (!nextThreshold || this.killCount < nextThreshold) return;

        this.rogueLevel++;
        this.rewardPaused = true;
        const options = this.generateRewardOptions();
        this.viewSystem.showTip(`升级到 Lv.${this.rogueLevel}，选择奖励`);
        (this.viewSystem as any).showRewardChoices(options, (option: RogueliteRewardOption) => {
            this.applyReward(option);
            this.rewardPaused = false;
        });
    }

    private generateRewardOptions(): RogueliteRewardOption[] {
        const options: RogueliteRewardOption[] = [];

        // 保证至少一个字相关奖励。
        options.push(this.createCharReward());

        while (options.length < 3) {
            const roll = Math.random();
            if (roll < 0.16) {
                const gold = this.createGoldIdiomReward();
                if (gold) {
                    options.push(gold);
                    continue;
                }
            }

            if (roll < 0.48) {
                options.push(this.createRareReward());
            } else {
                options.push(this.createCharReward());
            }
        }

        return options;
    }

    private createCharReward(): RogueliteRewardOption {
        const candidates = this.idiomDefs
            .filter(def => def.idiom !== '百步穿杨')
            .flatMap(def => def.chars);
        const ch = candidates[Math.floor(Math.random() * candidates.length)] ?? '万';
        return {
            id: `char:${ch}:${Date.now()}:${Math.random()}`,
            rarity: 'common',
            title: `获得字「${ch}」`,
            desc: `该字副本 +1，可用于集齐新成语`,
        };
    }

    private createGoldIdiomReward(): RogueliteRewardOption | null {
        const locked = this.idiomDefs.filter(def => def.idiom !== '百步穿杨' && !this.unlockedIdioms.has(def.idiom));
        if (locked.length <= 0) return null;
        const def = locked[Math.floor(Math.random() * locked.length)];
        return {
            id: `idiom:${def.idiom}:${Date.now()}:${Math.random()}`,
            rarity: 'gold',
            title: `获得成语「${def.idiom}」`,
            desc: `立即加入 ${def.chars.join('、')} 并解锁成语`,
        };
    }

    private createRareReward(): RogueliteRewardOption {
        const options: RogueliteRewardOption[] = [
            {
                id: `bag:+1:${Date.now()}:${Math.random()}`,
                rarity: 'rare',
                title: '战斗袋容量 +1',
                desc: '当前可操作字数量上限提高',
            },
            {
                id: `pool:+2:${Date.now()}:${Math.random()}`,
                rarity: 'rare',
                title: '成语字池容量 +2',
                desc: '本局可容纳更多字副本',
            },
            {
                id: `heal:2:${Date.now()}:${Math.random()}`,
                rarity: 'rare',
                title: '城门修复',
                desc: '城门恢复 2 点血量',
            },
            {
                id: `bai:+20:${Date.now()}:${Math.random()}`,
                rarity: 'rare',
                title: '百步穿杨强化',
                desc: '百步穿杨伤害 +20',
            },
        ];
        return options[Math.floor(Math.random() * options.length)];
    }

    private applyReward(option: RogueliteRewardOption) {
        if (option.id.startsWith('char:')) {
            const ch = option.id.split(':')[1];
            this.addChar(ch, 1, true);
            this.autoUnlockIdioms();
            this.refreshRogueliteTiles();
            this.viewSystem.showTip(`已获得字「${ch}」`);
            return;
        }

        if (option.id.startsWith('idiom:')) {
            const idiom = option.id.split(':')[1];
            const def = this.idiomDefs.find(item => item.idiom === idiom);
            if (def) {
                for (const ch of def.chars) this.addChar(ch, 1, true);
                this.unlockedIdioms.add(def.idiom);
                this.refreshRogueliteTiles();
                this.viewSystem.showTip(`金色奖励：已解锁「${def.idiom}」`);
            }
            return;
        }

        if (option.id.startsWith('bag:+1')) {
            this.battleBagCapacity += 1;
            this.refreshRogueliteTiles();
            this.viewSystem.showTip(`战斗袋容量提升到 ${this.battleBagCapacity}`);
            return;
        }

        if (option.id.startsWith('pool:+2')) {
            this.idiomCharPoolCapacity += 2;
            this.viewSystem.showTip(`成语字池容量提升到 ${this.idiomCharPoolCapacity}`);
            return;
        }

        if (option.id.startsWith('heal:2')) {
            this.baseLife = Math.min(this.maxBaseLife, this.baseLife + 2);
            this.viewSystem.updateGate(this.baseLife, this.maxBaseLife, this.baseShield);
            this.viewSystem.showTip('城门恢复 2 点血量');
            return;
        }

        if (option.id.startsWith('bai:+20')) {
            this.baiBuDamage += 20;
            this.viewSystem.showTip(`百步穿杨伤害提升到 ${this.baiBuDamage}`);
        }
    }

    private addChar(ch: string, count: number, respectCapacity: boolean) {
        if (respectCapacity && this.getOwnedTotal() >= this.idiomCharPoolCapacity) {
            this.idiomCharPoolCapacity += 1;
            this.viewSystem.showTip('成语字池已满，临时扩容 +1');
        }
        this.ownedCharCounts.set(ch, (this.ownedCharCounts.get(ch) ?? 0) + count);
    }

    private autoUnlockIdioms() {
        for (const def of this.idiomDefs) {
            if (this.unlockedIdioms.has(def.idiom)) continue;
            const hasAll = def.chars.every(ch => (this.ownedCharCounts.get(ch) ?? 0) > 0);
            if (hasAll) {
                this.unlockedIdioms.add(def.idiom);
                this.viewSystem.showTip(`已集齐：${def.idiom}，成语解锁！`);
            }
        }
    }

    private refreshRogueliteTiles() {
        const chars = this.buildBattleChars();
        (this.viewSystem as any).setRogueliteState?.(chars, [...this.unlockedIdioms]);
    }

    private buildBattleChars(): string[] {
        const result: string[] = [];

        // 先保证已解锁成语每个字至少有机会出现在战斗袋里。
        for (const idiom of this.unlockedIdioms) {
            const def = this.idiomDefs.find(item => item.idiom === idiom);
            if (!def) continue;
            for (const ch of def.chars) {
                if (result.length >= this.battleBagCapacity) break;
                if ((this.ownedCharCounts.get(ch) ?? 0) > 0 && !result.includes(ch)) result.push(ch);
            }
        }

        const expanded: string[] = [];
        for (const [ch, count] of this.ownedCharCounts.entries()) {
            for (let i = 0; i < count; i++) expanded.push(ch);
        }

        for (const ch of expanded) {
            if (result.length >= this.battleBagCapacity) break;
            result.push(ch);
        }

        return result.slice(0, this.battleBagCapacity);
    }

    private getOwnedTotal() {
        let total = 0;
        for (const count of this.ownedCharCounts.values()) total += count;
        return total;
    }

    private getNextThresholdText() {
        const next = this.levelKillThresholds[this.rogueLevel - 1];
        return next ? `${next}` : 'MAX';
    }

    private applyBaseDamage(damage: number, reason: string) {
        let remain = damage;

        if (this.baseShield > 0) {
            const absorb = Math.min(this.baseShield, remain);
            this.baseShield -= absorb;
            remain -= absorb;
            this.viewSystem.showTip(`${reason}，护盾抵挡 ${absorb} 点伤害`);
        }

        if (remain > 0) {
            this.baseLife = Math.max(0, this.baseLife - remain);
            this.viewSystem.showTip(`${reason}，城门 -${remain}`);
        }

        this.viewSystem.updateGate(this.baseLife, this.maxBaseLife, this.baseShield);
        console.log(`[SystemManager v0.8.6] base damage=${damage}, life=${this.baseLife}, shield=${this.baseShield}`);
    }
}
