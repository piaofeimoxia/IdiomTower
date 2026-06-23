import { LevelSystem } from './systems/LevelSystem';
import { WaveSystem } from './systems/WaveSystem';
import { SkillSystem } from './systems/SkillSystem';
import { EnemySystem } from './systems/EnemySystem';
import { LetterSystem } from './systems/LetterSystem';

export class SystemManager {

    public levelSystem = new LevelSystem();
    public waveSystem: WaveSystem;
    public skillSystem = new SkillSystem();
    public enemySystem = new EnemySystem();
    public letterSystem = new LetterSystem();

    constructor() {
        this.waveSystem = new WaveSystem(this.levelSystem.current);

        // Wave -> Enemy bridge
        this.waveSystem.onSpawn = (type: string) => {
            if (this.enemySystem && this.enemySystem.spawnEnemy) {
                this.enemySystem.spawnEnemy(type);
            }
        };
    }

    initLevel() {
        this.waveSystem.reset(this.levelSystem.current);
        if (this.levelSystem.init) {
            this.levelSystem.init();
        }
    }

    tick(dt: number) {
        this.levelSystem.tick?.(dt);
        this.waveSystem.tick(dt);
        this.skillSystem.tick?.(dt);
        this.enemySystem.tick?.(dt);
        this.letterSystem.tick?.(dt);
    }

    nextLevel() {
        this.levelSystem.nextLevel?.();
        this.waveSystem.reset(this.levelSystem.current);
    }
}