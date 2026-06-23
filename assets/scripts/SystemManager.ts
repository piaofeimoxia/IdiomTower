import { LevelSystem } from './systems/LevelSystem';
import { WaveSystem } from './systems/WaveSystem';
import { SkillSystem } from './systems/SkillSystem';
import { EnemySystem } from './systems/EnemySystem';
import { LetterSystem } from './systems/LetterSystem';
import { ViewSystem } from './systems/ViewSystem';
import { Node } from 'cc';

export class SystemManager {

    public levelSystem = new LevelSystem();
    public waveSystem: WaveSystem;
    public skillSystem = new SkillSystem();
    public enemySystem = new EnemySystem();
    public letterSystem = new LetterSystem();
    public viewSystem = new ViewSystem();

    constructor() {
        this.waveSystem = new WaveSystem(this.levelSystem.current);

        // Wave -> systems bridge (render + logic)
        this.waveSystem.onSpawn = (type: string) => {
            this.enemySystem.spawnEnemy?.(type);
            this.viewSystem.spawnEnemy(type);
        };
    }

    initLevel(root: Node) {
        // bind render root (Canvas)
        this.viewSystem.init(root);

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