import { Node, Vec3 } from 'cc';
import { WaveSystem, LevelConfig } from './systems/WaveSystem';
import { EnemySystem } from './systems/EnemySystem';
import { ViewSystem } from './systems/ViewSystem';

/**
 * v0.8.3.1 稳定系统管理器。
 *
 * 修复点：把 v0.8.2/v0.8.3 的折线路径改回旧版横向路径平面。
 */
export class SystemManager {

    public readonly waveSystem: WaveSystem;
    public readonly enemySystem: EnemySystem;
    public readonly viewSystem: ViewSystem;

    private initialized = false;
    private baseLife = 10;
    private readonly maxBaseLife = 10;

    // 旧版平面路径：敌人从左侧横向推进到右侧城门。
    private readonly path = [
        new Vec3(-560, 24, 0),
        new Vec3(400, 24, 0),
    ];

    constructor() {
        const level: Partial<LevelConfig> = {
            name: 'v0.8.3.1_flat_lane_wave',
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
            this.baseLife = Math.max(0, this.baseLife - 1);
            this.viewSystem.updateGate(this.baseLife, this.maxBaseLife);
            this.viewSystem.showTip(`敌人 #${enemy.id} 攻到城门，城门 -1`);
            console.log(`[SystemManager v0.8.3.1] base hit by enemy #${enemy.id}, life=${this.baseLife}`);
        };

        this.viewSystem.onIdiomComplete = (idiom) => {
            console.log(`[SystemManager v0.8.3.1] idiom ready: ${idiom}`);
            this.viewSystem.showTip(`已组成：${idiom}，技能效果将在 v0.8.4 接回`);
        };
    }

    public initLevel(root: Node) {
        console.log('[SystemManager v0.8.3.1] initLevel');

        this.baseLife = this.maxBaseLife;
        this.viewSystem.init(root, this.path);
        this.viewSystem.updateGate(this.baseLife, this.maxBaseLife);
        this.enemySystem.clear();
        this.waveSystem.reset({
            name: 'v0.8.3.1_flat_lane_wave',
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
            `${this.waveSystem.getStatusText()} | alive=${this.enemySystem.getAliveCount()} | gate=${this.baseLife}/${this.maxBaseLife}`
        );
    }

    public destroy() {
        this.enemySystem.clear();
        this.viewSystem.clear();
        this.initialized = false;
    }
}
