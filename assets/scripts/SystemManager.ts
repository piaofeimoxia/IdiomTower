import { Node, Vec3 } from 'cc';
import { WaveSystem, LevelConfig } from './systems/WaveSystem';
import { EnemySystem, EnemyRemovedReason, EnemyState } from './systems/EnemySystem';
import { ViewSystem } from './systems/ViewSystem';
import './systems/ViewSystemSkillPatch';
import './systems/ViewSystemArcherPatch';
import './systems/ViewSystemRoguelitePatch';
import './systems/ViewSystemRogueliteFlowPatch';
import type { RogueliteRewardOption } from './systems/ViewSystemRoguelitePatch';

type IdiomDef = {
    idiom: string;
    chars: string[];
    kind: 'single' | 'aoe' | 'shield' | 'freeze';
};

/**
 * v0.8.6.1 强关卡肉鸽核心修正版。
 *
 * 修复点：
 * - 战斗袋不再固定显示百步穿杨百百。
 * - 战斗袋使用后向前压缩，空位随时间从成语字池伪随机补入。
 * - 加入“弃左字”按钮，避免战斗袋卡死。
 * - 奖励三选一界面重排，减少文字重叠。
 * - 降低第一次奖励前的敌人压力。
 */
export class SystemManager {

    public readonly waveSystem: WaveSystem;
    public readonly enemySystem: EnemySystem;
    public readonly viewSystem: ViewSystem;

    private initialized = false;
    private baseLife = 14;
    private baseShield = 0;
    private readonly maxBaseLife = 14;

    private killCount = 0;
    private rogueLevel = 1;
    private rewardPaused = false;
    private suppressKillCount = false;

    private battleBagCapacity = 6;
    private idiomCharPoolCapacity = 12;
    private baiBuDamage = 120;

    private battleBag: string[] = [];
    private availableCharPool: string[] = [];
    private refillTimer = 0;
    private refillInterval = 0.55;
    private discardCooldown = 0;
    private readonly discardCooldownMax = 3.0;

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
        const level: Partial<LevelConfig> = this.buildRogueLevelConfig();

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
        console.log('[SystemManager v0.8.6.1] initLevel');

        this.baseLife = this.maxBaseLife;
        this.baseShield = 0;
        this.killCount = 0;
        this.rogueLevel = 1;
        this.rewardPaused = false;
        this.battleBagCapacity = 6;
        this.idiomCharPoolCapacity = 12;
        this.baiBuDamage = 120;
        this.refillTimer = 0;
        this.discardCooldown = 0;
        this.resetRogueliteBuild();

        this.viewSystem.init(root, this.path);
        this.viewSystem.updateGate(this.baseLife, this.maxBaseLife, this.baseShield);
        (this.viewSystem as any).setRogueliteDiscardHandler?.(() => this.discardLeftChar());
        this.refreshRogueliteTiles();

        this.suppressKillCount = true;
        this.enemySystem.clear();
        this.suppressKillCount = false;

        this.waveSystem.reset(this.buildRogueLevelConfig());
        this.waveSystem.start();

        this.initialized = true;
        this.viewSystem.showTip('开局已给完整百步穿杨，击杀 5 个敌人后升级。');
    }

    public tick(dt: number) {
        if (!this.initialized) return;

        if (this.discardCooldown > 0 && !this.rewardPaused) {
            this.discardCooldown = Math.max(0, this.discardCooldown - dt);
        }

        if (!this.rewardPaused) {
            this.refillBattleBag(dt);
            this.waveSystem.tick(dt);
            this.enemySystem.tick(dt);
        }

        this.viewSystem.updateHud(
            `${this.waveSystem.getStatusText()} | Lv.${this.rogueLevel} | kill=${this.killCount} | next=${this.getNextThresholdText()} | gate=${this.baseLife}/${this.maxBaseLife} | shield=${this.baseShield} | bag=${this.battleBag.length}/${this.battleBagCapacity} | pool=${this.availableCharPool.length}/${this.getOwnedTotal()}`
        );
    }

    public destroy() {
        this.suppressKillCount = true;
        this.enemySystem.clear();
        this.suppressKillCount = false;
        this.viewSystem.clear();
        this.initialized = false;
    }

    private buildRogueLevelConfig(): Partial<LevelConfig> {
        return {
            name: 'v0.8.6.1_rogue_bag_flow_wave',
            totalEnemies: 180,
            spawnInterval: 1.45,
            enemyTypes: [
                'basic', 'basic', 'basic', 'basic', 'basic',
                'basic', 'basic', 'basic', 'basic', 'basic',
                'shield', 'basic', 'basic', 'cavalry', 'basic', 'archer',
            ],
        };
    }

    private resetRogueliteBuild() {
        this.ownedCharCounts.clear();
        this.unlockedIdioms.clear();
        this.unlockedIdioms.add('百步穿杨');
        this.availableCharPool = [];
        this.battleBag = [];

        for (const ch of ['百', '步', '穿', '杨']) {
            this.addChar(ch, 2, false);
        }

        // 开局直接给一组完整百步穿杨，保证第一发不用等字。
        for (const ch of ['百', '步', '穿', '杨']) this.moveSpecificCharFromPoolToBag(ch);
        this.fillBattleBagInstant();
    }

    private releaseIdiomSkill(idiom: string) {
        if (!this.unlockedIdioms.has(idiom)) {
            this.viewSystem.showTip(`尚未解锁：${idiom}`);
            return;
        }

        let released = false;
        if (idiom === '百步穿杨') released = this.releaseBaiBuChuanYang();
        else if (idiom === '万箭齐发') released = this.releaseWanJianQiFa();
        else if (idiom === '固若金汤') released = this.releaseGuRuoJinTang();
        else if (idiom === '画地为牢') released = this.releaseHuaDiWeiLao();

        if (released) {
            this.consumeIdiomChars(idiom);
            this.refreshRogueliteTiles();
        }
    }

    private releaseBaiBuChuanYang() {
        const result = this.enemySystem.damageClosestToBase(this.baiBuDamage);
        if (!result) {
            this.viewSystem.showTip('百步穿杨：当前没有目标');
            return false;
        }

        this.viewSystem.showEnemyHitFeedback(result.enemy, result.damage, result.killed);
        this.viewSystem.showTip(result.killed ? '百步穿杨！点杀最前方敌人' : `百步穿杨！造成 ${result.damage} 点伤害`);
        console.log(`[SystemManager v0.8.6.1] skill 百步穿杨 damage=${result.damage}, killed=${result.killed}`);
        return true;
    }

    private releaseWanJianQiFa() {
        const results = this.enemySystem.damageAll(9999);
        const hitCount = results.length;
        if (hitCount <= 0) {
            this.viewSystem.showTip('万箭齐发：当前没有敌人');
            return false;
        }

        (this.viewSystem as any).showArrowRainEffect(hitCount);
        const maxBurstCount = Math.min(8, results.length);
        for (let i = 0; i < maxBurstCount; i++) {
            const result = results[i];
            this.viewSystem.showEnemyHitFeedback(result.enemy, result.damage, result.killed);
        }

        this.viewSystem.showTip(`万箭齐发！命中 ${hitCount} 个敌人`);
        console.log(`[SystemManager v0.8.6.1] skill 万箭齐发 hit=${hitCount}`);
        return true;
    }

    private releaseGuRuoJinTang() {
        const shieldAmount = 5;
        this.baseShield += shieldAmount;
        this.viewSystem.updateGate(this.baseLife, this.maxBaseLife, this.baseShield);
        this.viewSystem.showShieldEffect();
        this.viewSystem.showTip(`固若金汤！城门获得 ${shieldAmount} 点护盾`);
        console.log(`[SystemManager v0.8.6.1] skill 固若金汤 shield=${this.baseShield}`);
        return true;
    }

    private releaseHuaDiWeiLao() {
        const freezeSeconds = 3;
        const count = this.enemySystem.freezeAll(freezeSeconds);
        if (count <= 0) {
            this.viewSystem.showTip('画地为牢：当前没有敌人');
            return false;
        }
        this.viewSystem.showFreezeEffect(freezeSeconds);
        this.viewSystem.showTip(`画地为牢！冻结 ${count} 个敌人 ${freezeSeconds} 秒`);
        console.log(`[SystemManager v0.8.6.1] skill 画地为牢 freeze=${count}`);
        return true;
    }

    private consumeIdiomChars(idiom: string) {
        const def = this.idiomDefs.find(item => item.idiom === idiom);
        if (!def) return;

        for (const ch of def.chars) {
            const idx = this.battleBag.indexOf(ch);
            if (idx >= 0) this.battleBag.splice(idx, 1);
        }

        // 使用掉的字回到成语字池，之后再按补字间隔伪随机进入战斗袋。
        for (const ch of def.chars) this.availableCharPool.push(ch);
        this.refillTimer = 0;
    }

    private discardLeftChar() {
        if (this.rewardPaused) return;
        if (this.discardCooldown > 0) {
            this.viewSystem.showTip(`弃字冷却中：${Math.ceil(this.discardCooldown)} 秒`);
            return;
        }
        if (this.battleBag.length <= 0) {
            this.viewSystem.showTip('当前没有可弃字');
            return;
        }

        const ch = this.battleBag.shift();
        if (ch) this.availableCharPool.push(ch);
        this.discardCooldown = this.discardCooldownMax;
        this.refillTimer = 0;
        this.refreshRogueliteTiles();
        this.viewSystem.showTip(`已弃左侧字「${ch}」，稍后补入新字`);
    }

    private refillBattleBag(dt: number) {
        if (this.battleBag.length >= this.battleBagCapacity) return;
        if (this.availableCharPool.length <= 0) return;

        this.refillTimer += dt;
        while (this.refillTimer >= this.refillInterval && this.battleBag.length < this.battleBagCapacity && this.availableCharPool.length > 0) {
            this.refillTimer -= this.refillInterval;
            const ch = this.drawPseudoRandomCharFromPool();
            if (!ch) break;
            this.battleBag.push(ch);
            this.refreshRogueliteTiles();
        }
    }

    private fillBattleBagInstant() {
        while (this.battleBag.length < this.battleBagCapacity && this.availableCharPool.length > 0) {
            const ch = this.drawPseudoRandomCharFromPool();
            if (!ch) break;
            this.battleBag.push(ch);
        }
    }

    private moveSpecificCharFromPoolToBag(ch: string) {
        const idx = this.availableCharPool.indexOf(ch);
        if (idx < 0) return;
        this.availableCharPool.splice(idx, 1);
        this.battleBag.push(ch);
    }

    private drawPseudoRandomCharFromPool() {
        if (this.availableCharPool.length <= 0) return '';
        const recent = this.battleBag.slice(-2);
        const candidates = this.availableCharPool
            .map((ch, index) => ({ ch, index }))
            .filter(item => !(recent.length >= 2 && recent[0] === item.ch && recent[1] === item.ch));
        const pool = candidates.length > 0 ? candidates : this.availableCharPool.map((ch, index) => ({ ch, index }));
        const picked = pool[Math.floor(Math.random() * pool.length)];
        this.availableCharPool.splice(picked.index, 1);
        return picked.ch;
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
        const usedTitles = new Set<string>();
        const usedChars = new Set<string>();

        const pushUnique = (option: RogueliteRewardOption) => {
            if (usedTitles.has(option.title)) return false;
            usedTitles.add(option.title);
            options.push(option);
            if (option.id.startsWith('char:')) usedChars.add(option.id.split(':')[1]);
            return true;
        };

        pushUnique(this.createCharReward(usedChars));

        let guard = 0;
        while (options.length < 3 && guard++ < 20) {
            const roll = Math.random();
            if (roll < 0.12) {
                const gold = this.createGoldIdiomReward();
                if (gold && pushUnique(gold)) continue;
            }
            if (roll < 0.48) {
                if (pushUnique(this.createRareReward())) continue;
            }
            pushUnique(this.createCharReward(usedChars));
        }

        while (options.length < 3) pushUnique(this.createRareReward());
        return options.slice(0, 3);
    }

    private createCharReward(excludeChars?: Set<string>): RogueliteRewardOption {
        const all = this.idiomDefs.filter(def => def.idiom !== '百步穿杨').flatMap(def => def.chars);
        const candidates = all.filter(ch => !excludeChars?.has(ch));
        const source = candidates.length > 0 ? candidates : all;
        const ch = source[Math.floor(Math.random() * source.length)] ?? '万';
        return {
            id: `char:${ch}:${Date.now()}:${Math.random()}`,
            rarity: 'common',
            title: `获得字「${ch}」`,
            desc: `副本 +1，进入成语字池`,
        };
    }

    private createGoldIdiomReward(): RogueliteRewardOption | null {
        const locked = this.idiomDefs.filter(def => def.idiom !== '百步穿杨' && !this.unlockedIdioms.has(def.idiom));
        if (locked.length <= 0) return null;
        const def = locked[Math.floor(Math.random() * locked.length)];
        return {
            id: `idiom:${def.idiom}:${Date.now()}:${Math.random()}`,
            rarity: 'gold',
            title: `成语「${def.idiom}」`,
            desc: `四字加入，并立即解锁`,
        };
    }

    private createRareReward(): RogueliteRewardOption {
        const options: RogueliteRewardOption[] = [
            { id: `bag:+1:${Date.now()}:${Math.random()}`, rarity: 'rare', title: '战斗袋容量 +1', desc: '可操作字上限提高' },
            { id: `pool:+2:${Date.now()}:${Math.random()}`, rarity: 'rare', title: '成语字池容量 +2', desc: '可容纳更多字副本' },
            { id: `heal:2:${Date.now()}:${Math.random()}`, rarity: 'rare', title: '城门修复', desc: '城门恢复 2 点血量' },
            { id: `bai:+20:${Date.now()}:${Math.random()}`, rarity: 'rare', title: '百步穿杨强化', desc: '单体伤害 +20' },
        ];
        return options[Math.floor(Math.random() * options.length)];
    }

    private applyReward(option: RogueliteRewardOption) {
        if (option.id.startsWith('char:')) {
            const ch = option.id.split(':')[1];
            this.addChar(ch, 1, true);
            this.autoUnlockIdioms();
            this.viewSystem.showTip(`已获得字「${ch}」，会随时间补入战斗袋`);
            return;
        }

        if (option.id.startsWith('idiom:')) {
            const idiom = option.id.split(':')[1];
            const def = this.idiomDefs.find(item => item.idiom === idiom);
            if (def) {
                for (const ch of def.chars) this.addChar(ch, 1, true);
                this.unlockedIdioms.add(def.idiom);
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
        for (let i = 0; i < count; i++) {
            if (respectCapacity && this.getOwnedTotal() >= this.idiomCharPoolCapacity) {
                this.idiomCharPoolCapacity += 1;
                this.viewSystem.showTip('成语字池已满，临时扩容 +1');
            }
            this.ownedCharCounts.set(ch, (this.ownedCharCounts.get(ch) ?? 0) + 1);
            this.availableCharPool.push(ch);
        }
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
        (this.viewSystem as any).setRogueliteState?.([...this.battleBag], [...this.unlockedIdioms]);
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
        console.log(`[SystemManager v0.8.6.1] base damage=${damage}, life=${this.baseLife}, shield=${this.baseShield}`);
    }
}
