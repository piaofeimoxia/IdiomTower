import { Node, Vec3 } from 'cc';
import { WaveSystem, LevelConfig } from './systems/WaveSystem';
import { EnemySystem, EnemyRemovedReason, EnemyState } from './systems/EnemySystem';
import { ViewSystem } from './systems/ViewSystem';
import './systems/ViewSystemSkillPatch';
import './systems/ViewSystemArcherPatch';
import './systems/ViewSystemRoguelitePatch';
import './systems/ViewSystemRogueliteFlowPatch';
import { BagCycle } from './core/BagCycle';
import type { RogueliteRewardOption } from './core/RewardTypes';

type IdiomDef = {
    idiom: string;
    chars: string[];
    kind: 'single' | 'aoe' | 'shield' | 'freeze';
};

/**
 * v0.8.6.2 强关卡肉鸽核心修正版。
 *
 * 修复点：
 * - 城门血量归零后立即判定失败。
 * - 失败后停止刷怪、停止敌人行动、停止字袋补字。
 * - 显示失败面板，并提供重新开始本局按钮。
 * - 保留 v0.8.6.1 的战斗袋流转、弃字、奖励 UI 和开局低压。
 */
export class SystemManager {

    public readonly waveSystem: WaveSystem;
    public readonly enemySystem: EnemySystem;
    public readonly viewSystem: ViewSystem;

    private initialized = false;
    private gameOver = false;
    private rootNode: Node | null = null;

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

    private readonly bagCycle = new BagCycle({
        capacity: 6,
        refillInterval: 0.55,
        discardCooldown: 3.0,
    });

    private readonly levelKillThresholds = [4, 9, 16, 26, 39, 55, 75, 100, 130];

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
            if (this.gameOver) return;
            this.enemySystem.spawnEnemy(type);
        };

        this.waveSystem.onWaveComplete = (cfg) => {
            if (!this.gameOver) this.viewSystem.showTip(`刷怪完成：${cfg.name}`);
        };

        this.enemySystem.onEnemySpawned = (enemy) => {
            this.viewSystem.createEnemy(enemy);
        };

        this.enemySystem.onEnemyUpdated = (enemy) => {
            if (!this.gameOver) this.viewSystem.updateEnemy(enemy);
        };

        this.enemySystem.onEnemyRemoved = (enemy, reason) => {
            this.viewSystem.removeEnemy(enemy, reason);
            this.onEnemyRemoved(enemy, reason);
        };

        this.enemySystem.onBaseHit = (enemy) => {
            this.applyBaseDamage(1, `敌人 #${enemy.id} 攻到城门`);
        };

        this.enemySystem.onRangedAttackGate = (enemy) => {
            if (this.gameOver) return;
            (this.viewSystem as any).showArcherShot?.(enemy);
            this.applyBaseDamage(1, `弓兵 #${enemy.id} 远程射击城门`);
        };

        this.viewSystem.onIdiomComplete = (idiom) => {
            this.releaseIdiomSkill(idiom);
        };
    }

    public initLevel(root: Node) {
        console.log('[SystemManager v0.8.6.2] initLevel');

        this.rootNode = root;
        this.initialized = false;
        this.gameOver = false;
        this.baseLife = this.maxBaseLife;
        this.baseShield = 0;
        this.killCount = 0;
        this.rogueLevel = 1;
        this.rewardPaused = false;
        this.battleBagCapacity = 6;
        this.idiomCharPoolCapacity = 12;
        this.baiBuDamage = 120;
        this.bagCycle.setCapacity(this.battleBagCapacity);
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

        if (this.gameOver) {
            this.viewSystem.updateHud(
                `${this.waveSystem.getStatusText()} | FAILED | Lv.${this.rogueLevel} | kill=${this.killCount} | gate=${this.baseLife}/${this.maxBaseLife}`
            );
            return;
        }

        if (!this.rewardPaused) {
            if (this.bagCycle.tick(dt)) this.refreshRogueliteTiles();
            this.waveSystem.tick(dt);
            this.enemySystem.tick(dt);
        }

        const bag = this.bagCycle.snapshot();
        this.viewSystem.updateHud(
            `${this.waveSystem.getStatusText()} | Lv.${this.rogueLevel} | kill=${this.killCount} | next=${this.getNextThresholdText()} | gate=${this.baseLife}/${this.maxBaseLife} | shield=${this.baseShield} | bag=${bag.bag.length}/${this.battleBagCapacity} | pool=${bag.available.length}/${this.getOwnedTotal()}`
        );
    }

    public destroy() {
        this.suppressKillCount = true;
        this.enemySystem.clear();
        this.suppressKillCount = false;
        this.viewSystem.clear();
        this.initialized = false;
        this.gameOver = false;
        this.rootNode = null;
    }

    private buildRogueLevelConfig(): Partial<LevelConfig> {
        return {
            name: 'v0.8.6.3.4_reward_cancel_wave',
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
        this.bagCycle.reset();

        for (const ch of ['百', '步', '穿', '杨']) {
            this.addChar(ch, 2, false);
        }

        // 开局直接给一组完整百步穿杨，保证第一发不用等字。
        for (const ch of ['百', '步', '穿', '杨']) this.bagCycle.moveSpecificToBag(ch);
        this.bagCycle.fillInstant();
    }

    private releaseIdiomSkill(idiom: string) {
        if (this.gameOver) return;
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
        const results = this.enemySystem.damagePierceClosestToBase(this.baiBuDamage, 1);
        if (results.length <= 0) {
            this.viewSystem.showTip('百步穿杨：当前没有目标');
            return false;
        }

        this.viewSystem.showBaiBuPierceEffect(results);
        for (const result of results) {
            this.viewSystem.showEnemyHitFeedback(result.enemy, result.damage, result.killed);
        }
        const killCount = results.filter(result => result.killed).length;
        this.viewSystem.showTip(results.length >= 2
            ? `百步穿杨！同排贯穿 ${results.length} 个敌人，击杀 ${killCount} 个`
            : results[0].killed ? '百步穿杨！点杀最前方敌人' : `百步穿杨！造成 ${this.baiBuDamage} 点伤害`);
        console.log(`[SystemManager v0.8.6.3.2] skill 百步穿杨 same_lane_pierce=${results.length}, killed=${killCount}`);
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
        console.log(`[SystemManager v0.8.6.2] skill 万箭齐发 hit=${hitCount}`);
        return true;
    }

    private releaseGuRuoJinTang() {
        const shieldAmount = 5;
        this.baseShield += shieldAmount;
        this.viewSystem.updateGate(this.baseLife, this.maxBaseLife, this.baseShield);
        this.viewSystem.showShieldEffect();
        this.viewSystem.showTip(`固若金汤！城门获得 ${shieldAmount} 点护盾`);
        console.log(`[SystemManager v0.8.6.2] skill 固若金汤 shield=${this.baseShield}`);
        return true;
    }

    private releaseHuaDiWeiLao() {
        const freezeSeconds = 3;
        const count = this.enemySystem.freezeAll(freezeSeconds);
        if (count <= 0) {
            this.viewSystem.showTip('画地为牢：当前没有敌人');
            return false;
        }
        const results = this.enemySystem.damageAll(35);
        this.viewSystem.showFreezeEffect(freezeSeconds);
        for (const result of results.slice(0, 8)) {
            this.viewSystem.showEnemyHitFeedback(result.enemy, result.damage, result.killed);
        }
        const killed = results.filter(result => result.killed).length;
        this.viewSystem.showTip(`画地为牢！冻结 ${count} 个敌人 ${freezeSeconds} 秒，并造成定身伤害，击杀 ${killed} 个`);
        console.log(`[SystemManager v0.8.6.2] skill 画地为牢 freeze=${count}, killed=${killed}`);
        return true;
    }

    private consumeIdiomChars(idiom: string) {
        const def = this.idiomDefs.find(item => item.idiom === idiom);
        if (!def) return;

        // 使用掉的字回到成语字池，之后再按补字间隔伪随机进入战斗袋。
        this.bagCycle.consume(def.chars);
    }

    private discardLeftChar() {
        if (this.gameOver || this.rewardPaused) return;
        const chars = this.viewSystem.getComposingSlotChars();
        if (chars.length <= 0) {
            this.viewSystem.showTip('成语槽为空，没有可弃字');
            return;
        }

        const result = this.bagCycle.discardChars(chars);
        if (result.status === 'cooldown') {
            this.viewSystem.showTip(`弃字冷却中：${Math.ceil(result.remain)} 秒`);
            return;
        }
        if (result.status === 'empty') {
            this.viewSystem.showTip('成语槽字已不在战斗袋中，无法弃字');
            return;
        }

        const discarded = 'chars' in result ? result.chars : [result.char];
        this.viewSystem.discardComposingSlots();
        this.refreshRogueliteTiles();
        this.viewSystem.showTip(`已弃成语槽 ${discarded.length} 个字：${discarded.join('、')}，当前字池抽完后才会回流`);
    }

    private onEnemyRemoved(_enemy: EnemyState, reason: EnemyRemovedReason) {
        if (this.suppressKillCount || this.gameOver || reason !== 'dead') return;
        this.killCount++;
        this.tryOpenLevelReward();
    }

    private tryOpenLevelReward() {
        if (this.rewardPaused || this.gameOver) return;
        const nextThreshold = this.levelKillThresholds[this.rogueLevel - 1];
        if (!nextThreshold || this.killCount < nextThreshold) return;

        this.rogueLevel++;
        this.rewardPaused = true;
        const options = this.generateRewardOptions();
        this.viewSystem.showTip(`升级到 Lv.${this.rogueLevel}，五选二奖励`);
        this.viewSystem.showRewardChoices(options, 2, (selected: RogueliteRewardOption[]) => {
            if (this.gameOver) return;
            for (const option of selected) this.applyReward(option);
            this.rewardPaused = false;
            this.refreshRogueliteTiles();
            this.viewSystem.showTip(`已选择 ${selected.length} 个奖励，继续守城`);
        });
    }

    private generateRewardOptions(): RogueliteRewardOption[] {
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

        pushUnique(this.createCharReward(usedChars));
        pushUnique(this.createCharReward(usedChars));
        pushUnique(this.createCharReward(usedChars));

        if (Math.random() < 0.22) pushUnique(this.createGoldIdiomReward());

        let guard = 0;
        while (options.length < 5 && guard++ < 30) {
            const roll = Math.random();
            if (roll < 0.34) {
                if (pushUnique(this.createRareReward())) continue;
            }
            if (roll < 0.48 && pushUnique(this.createGoldIdiomReward())) continue;
            pushUnique(this.createCharReward(usedChars));
        }

        while (options.length < 5) pushUnique(this.createRareReward());
        return options.slice(0, 5);
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
                this.bagCycle.prioritizeChars(def.chars);
                this.refreshRogueliteTiles();
                this.viewSystem.showTip(`金色奖励：已解锁「${def.idiom}」，四字已优先进入战斗袋`);
            }
            return;
        }

        if (option.id.startsWith('bag:+1')) {
            this.battleBagCapacity += 1;
            this.bagCycle.setCapacity(this.battleBagCapacity);
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
            this.bagCycle.addAvailable(ch);
        }
    }

    private autoUnlockIdioms() {
        for (const def of this.idiomDefs) {
            if (this.unlockedIdioms.has(def.idiom)) continue;
            const hasAll = def.chars.every(ch => (this.ownedCharCounts.get(ch) ?? 0) > 0);
            if (hasAll) {
                this.unlockedIdioms.add(def.idiom);
                this.bagCycle.prioritizeChars(def.chars);
                this.refreshRogueliteTiles();
                this.viewSystem.showTip(`已集齐：${def.idiom}，成语解锁！`);
            }
        }
    }

    private refreshRogueliteTiles() {
        (this.viewSystem as any).setRogueliteState?.(this.bagCycle.snapshot().bag, [...this.unlockedIdioms]);
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
        if (this.gameOver) return;
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
        console.log(`[SystemManager v0.8.6.2] base damage=${damage}, life=${this.baseLife}, shield=${this.baseShield}`);

        if (this.baseLife <= 0) {
            this.triggerGameOver(reason);
        }
    }

    private triggerGameOver(reason: string) {
        if (this.gameOver) return;
        this.gameOver = true;
        this.rewardPaused = true;
        this.baseLife = 0;
        this.baseShield = 0;
        this.viewSystem.updateGate(this.baseLife, this.maxBaseLife, this.baseShield);

        this.suppressKillCount = true;
        this.enemySystem.clear();
        this.suppressKillCount = false;

        this.bagCycle.reset();
        this.refreshRogueliteTiles();
        this.viewSystem.showTip('城门被破，守城失败');
        this.viewSystem.showRunFailedPanel(
            {
                result: 'failed',
                reason,
                roomReached: 1,
                killCount: this.killCount,
                castCount: 0,
                strongestIdiom: null,
                remainingLife: 0,
                rogueLevel: this.rogueLevel,
            },
            () => {
                if (this.rootNode) this.initLevel(this.rootNode);
            },
        );
    }
}
