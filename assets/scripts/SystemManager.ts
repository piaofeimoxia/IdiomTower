import { Node, Vec3 } from 'cc';
import { WaveSystem, LevelConfig } from './systems/WaveSystem';
import { EnemySystem } from './systems/EnemySystem';
import { ViewSystem } from './systems/ViewSystem';

/**
 * v0.8.2 稳定系统管理器。
 *
 * 本版接回正式敌人路径：
 * GameBootstrap -> SystemManager -> WaveSystem -> EnemySystem -> ViewSystem
 */
export class SystemManager {

    public readonly waveSystem: WaveSystem;
    public readonly enemySystem: EnemySystem;
    public readonly viewSystem: ViewSystem;

    private initialized = false;
    private baseLife = 10;

    private readonly path = [
        new Vec3(-560, 120, 0),
        new Vec3(-300, 120, 0),
        new Vec3(-300, -80, 0),
        new Vec3(40, -80, 0),
        new Vec3(40, 120, 0),
        new Vec3(560, 120, 0),
    ];

    constructor() {
        const level: Partial<LevelConfig> = {
            name: 'v0.8.2_path_wave',
            totalEnemies: 40,
            spawnInterval: 1.0,
            enemyTypes: ['basic', 'shield', 'basic', 'cavalry', 'archer'],
        };

        this.waveSystem = new WaveSystem(level);
        this.enemySystem = new EnemySystem(this.path);
        this.viewSystem = new ViewSystem();

        this.waveSystem.onWaveStart = (cfg) => {
            this.viewSystem.updateHud(`Wave start: ${cfg.name}`);
        };

        this.waveSystem.onSpawn = (type) => {
            this.enemySystem.spawnEnemy(type);
        };

        this.waveSystem.onWaveComplete = (cfg) => {
            this.viewSystem.updateHud(`Wave complete: ${cfg.name}`);
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
            console.log(`[SystemManager v0.8.2] base hit by enemy #${enemy.id}, life=${this.baseLife}`);
        };
    }

    public initLevel(root: Node) {
        console.log('[SystemManager v0.8.2] initLevel');

        this.baseLife = 10;
        this.viewSystem.init(root, this.path);
        this.enemySystem.clear();
        this.waveSystem.reset({
            name: 'v0.8.2_path_wave',
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
            `${this.waveSystem.getStatusText()} | alive=${this.enemySystem.getAliveCount()} | base=${this.baseLife}`
        );
    }

    public destroy() {
        this.enemySystem.clear();
        this.viewSystem.clear();
        this.initialized = false;
    }
}
