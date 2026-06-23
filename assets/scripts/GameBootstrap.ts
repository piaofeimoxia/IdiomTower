import { _decorator, Component } from 'cc';
import { SystemManager } from './SystemManager';

const { ccclass } = _decorator;

/**
 * GameBootstrap v0.8.1
 *
 * 基于已经验证成功的最小可运行壳，重新接回：
 * GameBootstrap -> SystemManager -> WaveSystem -> ViewSystem
 */
@ccclass('GameBootstrap')
export class GameBootstrap extends Component {

    private systemManager: SystemManager | null = null;

    onLoad() {
        console.log('🔥 GameBootstrap v0.8.1 onLoad HIT');

        try {
            this.systemManager = new SystemManager();
            this.systemManager.initLevel(this.node);
            console.log('✅ GameBootstrap v0.8.1 initialized');
        } catch (err) {
            console.error('[GameBootstrap v0.8.1] init failed', err);
            this.systemManager = null;
        }
    }

    start() {
        console.log('✅ GameBootstrap v0.8.1 start HIT');
    }

    update(dt: number) {
        if (!this.systemManager) return;
        this.systemManager.tick(dt);
    }

    onDestroy() {
        this.systemManager?.destroy();
        this.systemManager = null;
    }
}
