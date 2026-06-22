/**
 * v0.7 SystemManager (Cocos Architecture Core)
 * --------------------------------------------
 * 统一管理所有 gameplay systems，解耦 GameManager 与具体逻辑
 *
 * 架构目标：
 * Scene(UI Layer)
 *    ↓
 * GameManager (Lifecycle)
 *    ↓
 * SystemManager (Orchestrator)
 *    ↓
 * Systems (Pure Logic)
 */

export interface ISystem {
    name: string;
    init?(): void;
    tick?(dt: number): void;
    reset?(): void;
}

export class SystemManager {

    private systems: Map<string, ISystem> = new Map();

    /** 注册系统 */
    register(system: ISystem) {
        if (this.systems.has(system.name)) {
            console.warn(`[SystemManager] system already exists: ${system.name}`);
            return;
        }

        this.systems.set(system.name, system);
        system.init?.();
    }

    /** 获取系统 */
    get<T extends ISystem>(name: string): T | null {
        return (this.systems.get(name) as T) || null;
    }

    /** 游戏主循环 tick */
    tick(dt: number) {
        this.systems.forEach((sys) => {
            sys.tick?.(dt);
        });
    }

    /** 重置所有系统 */
    reset() {
        this.systems.forEach((sys) => {
            sys.reset?.();
        });
    }

    /** 清理所有系统 */
    clear() {
        this.systems.clear();
    }

    /** 调试输出系统列表 */
    debugPrint() {
        console.log("[SystemManager] registered systems:");
        this.systems.forEach((_, key) => {
            console.log(" - " + key);
        });
    }
}
