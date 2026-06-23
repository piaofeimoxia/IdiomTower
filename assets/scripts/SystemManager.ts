import { Node, Vec3 } from 'cc';
import { WaveSystem, LevelConfig } from './systems/WaveSystem';
import { EnemySystem } from './systems/EnemySystem';
import { ViewSystem } from './systems/ViewSystem';

/**
 * v0.8.4 稳定系统管理器。
 *
 * 本版在 v0.8.3.1 旧版横向路径基础上接回真实技能效果：
 * - 万箭齐发：全体伤害 / 清怪
 * - 固若金汤：城门护盾
 * - 画地为牢：全体冻结
 */
export class SystemManager {

    public readonly waveSystem: WaveSystem;
    public readonly enemySystem: EnemySystem;
    public readonly viewSystem: ViewSystem;

    private initialized = false;
    private baseLife = 10;
    private baseShield = 0;
    private readonly maxBaseLife = 10;

    // 旧版平面路径：敌人从左侧横向推进到右侧城门。
    private readonly path = [
        new Vec3(-560, 24, 0),
        new Vec3(400, 24, 0),
    ];

    constructor() {
        const level: Partial<LevelConfig> = {
            name: 'v0.8.4_skill_wave',
            totalEnemies: 40,
            spawnInterval: 1.0,
            enemyTypes: ['basic', 'shield', 'basic', 'cavalry', 'archer'],
        };

        this.waveSystem = new WaveSystem(level);
        this.enemySystem = new EnemySystem(this.path);
        this.viewSystem = new ViewSystem();

        this.waveSystem.onWaveStart = (cfg) => {
            this.viewSystem.showTip(`关卡开始：${cfg.name}`);
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
        };

        this.enemySystem.onBaseHit = (enemy) => {
            this.applyBaseDamage(1, `敌人 #${enemy.id} 攻到城门`);
        };

        this.viewSystem.onIdiomComplete = (idiom) => {
            this.releaseIdiomSkill(idiom);
        };
    }

    public initLevel(root: Node) {
        console.log('[SystemManager v0.8.4] initLevel');

        this.baseLife = this.maxBaseLife;
        this.baseShield = 0;
        this.viewSystem.init(root, this.path);
        this.viewSystem.updateGate(this.baseLife, this.maxBaseLife, this.baseShield);
        this.enemySystem.clear();
        this.waveSystem.reset({
            name: 'v0.8.4_skill_wave',
            totalEnemies: 40,
            spawnInterval: 1.0,
            enemyTypes: ['basic', 'shield', 'basic', 'cavalry', 'archer'],
        });
        this.waveSystem.start();

        this.initialized = true;
    }

    public tick(dt: number) {
        if (!this.initialized) return;

        this.waveSystem.tick(dt);
        this.enemySystem.tick(dt);

        this.viewSystem.updateHud(
            `${this.waveSystem.getStatusText()} | alive=${this.enemySystem.getAliveCount()} | gate=${this.baseLife}/${this.maxBaseLife} | shield=${this.baseShield}`
        );
    }

    public destroy() {
        this.enemySystem.clear();
        this.viewSystem.clear();
        this.initialized = false;
    }

    private releaseIdiomSkill(idiom: string) {
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

    private releaseWanJianQiFa() {
        const results = this.enemySystem.damageAll(9999);
        this.viewSystem.showArrowRainEffect();

        for (const result of results) {
            this.viewSystem.showEnemyHitFeedback(result.enemy, result.damage, result.killed);
        }

        this.viewSystem.showTip(`万箭齐发！命中 ${results.length} 个敌人`);
        console.log(`[SystemManager v0.8.4] skill 万箭齐发 hit=${results.length}`);
    }

    private releaseGuRuoJinTang() {
        const shieldAmount = 5;
        this.baseShield += shieldAmount;
        this.viewSystem.updateGate(this.baseLife, this.maxBaseLife, this.baseShield);
        this.viewSystem.showShieldEffect();
        this.viewSystem.showTip(`固若金汤！城门获得 ${shieldAmount} 点护盾`);
        console.log(`[SystemManager v0.8.4] skill 固若金汤 shield=${this.baseShield}`);
    }

    private releaseHuaDiWeiLao() {
        const freezeSeconds = 3;
        const count = this.enemySystem.freezeAll(freezeSeconds);
        this.viewSystem.showFreezeEffect(freezeSeconds);
        this.viewSystem.showTip(`画地为牢！冻结 ${count} 个敌人 ${freezeSeconds} 秒`);
        console.log(`[SystemManager v0.8.4] skill 画地为牢 freeze=${count}`);
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
        console.log(`[SystemManager v0.8.4] base damage=${damage}, life=${this.baseLife}, shield=${this.baseShield}`);
    }
}
