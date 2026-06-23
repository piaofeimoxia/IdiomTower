import { _decorator, Component } from 'cc';
import { SystemManager } from './SystemManager';
import { EventBus } from './EventBus';

const { ccclass } = _decorator;

/**
 * GameBootstrap
 * 作为 Cocos 场景唯一入口（挂在 Canvas 上）
 * 负责：
 * - 初始化 EventBus
 * - 初始化 SystemManager
 * - 驱动主循环 tick
 */
@ccclass('GameBootstrap')
export class GameBootstrap extends Component {

    private systemManager: SystemManager | null = null;

    onLoad() {
        // 清理事件，避免热重载残留
        EventBus.instance.clear();

        // 初始化系统管理器
        this.systemManager = new SystemManager();

        // 初始化关卡/系统
        this.systemManager.initLevel?.();

        console.log('[GameBootstrap] initialized');
    }

    update(dt: number) {
        if (!this.systemManager) return;
        this.systemManager.tick(dt);
    }

    onDestroy() {
        EventBus.instance.clear();
    }
}