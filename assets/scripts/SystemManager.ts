import { Node } from 'cc';
import { WaveSystem, LevelConfig } from './systems/WaveSystem';
import { ViewSystem } from './systems/ViewSystem';

/**
 * v0.8.1 稳定系统管理器。
 *
 * 这一版只接回最小闭环：
 * GameBootstrap -> SystemManager -> WaveSystem -> ViewSystem
 * 暂不接 EnemySystem / LetterSystem / SkillSystem，避免旧系统再次造成黑屏。
 */
export class SystemManager {

    public readonly waveSystem: WaveSystem;
    public readonly viewSystem: ViewSystem;

    private initialized = false;

    constructor() {
        const level: Partial<LevelConfig> = {
            name: 'v0.8.1_stable_wave',
            totalEnemies: 30,
            spawnInterval: 1.0,
            enemyTypes: ['basic', 'shield'],
        };

        this.waveSystem = new WaveSystem(level);
        this.viewSystem = new ViewSystem();

        this.waveSystem.onWaveStart = (cfg) => {
            this.viewSystem.updateHud(`Wave start: ${cfg.name}`);
        };

        this.waveSystem.onSpawn = (type, payload) => {
            this.viewSystem.spawnEnemy(type, payload);
            this.viewSystem.updateHud(`Spawn ${payload.index}/${payload.total}: ${type}`);
        };

        this.waveSystem.onWaveComplete = (cfg) => {
            this.viewSystem.updateHud(`Wave complete: ${cfg.name}`);
        };
    }

    public initLevel(root: Node) {
        console.log('[SystemManager v0.8.1] initLevel');

        this.viewSystem.init(root);
        this.waveSystem.reset({
            name: 'v0.8.1_stable_wave',
            totalEnemies: 30,
            spawnInterval: 1.0,
            enemyTypes: ['basic', 'shield'],
        });
        this.waveSystem.start();

        this.initialized = true;
    }

    public tick(dt: number) {
        if (!this.initialized) return;

        this.waveSystem.tick(dt);
        this.viewSystem.tick(dt);

        // 保持 HUD 有状态，即使当前秒没有新刷怪。
        this.viewSystem.updateHud(this.waveSystem.getStatusText());
    }

    public destroy() {
        this.viewSystem.clear();
        this.initialized = false;
    }
}
