import { _decorator, Component } from 'cc';
import { SystemManager } from './SystemManager';

const { ccclass } = _decorator;

/**
 * GameBootstrap v0.8.5
 *
 * 入口保持稳定，只负责启动 SystemManager。
 */
@ccclass('GameBootstrap')
export class GameBootstrap extends Component {

    private systemManager: SystemManager | null = null;

    onLoad() {
        console.log('[GameBootstrap v0.8.5] onLoad');

        try {
            this.systemManager = new SystemManager();
            this.systemManager.initLevel(this.node);
            console.log('[GameBootstrap v0.8.5] initialized');
        } catch (err) {
            console.error('[GameBootstrap v0.8.5] init failed', err);
            this.systemManager = null;
        }
    }

    start() {
        console.log('[GameBootstrap v0.8.5] start');
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
