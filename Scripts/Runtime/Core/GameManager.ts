/**
 * v0.7 GameManager (Cocos Entry Controller)
 * ----------------------------------------
 * 作用：
 * 1. 作为 Scene → Runtime 的唯一入口
 * 2. 管理生命周期（onLoad/start/update）
 * 3. 只负责调度，不包含任何业务逻辑
 *
 * 架构：
 * Scene (main.scene)
 *     ↓
 * GameManager (this file)
 *     ↓
 * SystemManager (orchestrator)
 *     ↓
 * Systems (pure logic)
 */

import { SystemManager, ISystem } from "./SystemManager";

export class GameManager {

    private static _instance: GameManager;
    public static get instance(): GameManager {
        if (!this._instance) this._instance = new GameManager();
        return this._instance;
    }

    private systemManager: SystemManager = new SystemManager();
    private isRunning: boolean = false;
    private lastTime: number = 0;

    /** 初始化（由 Scene 调用） */
    public init(): void {
        this.registerSystems();
        this.systemManager.debugPrint();
    }

    /** 注册所有游戏系统 */
    private registerSystems(): void {
        // TODO: 后续替换为真实系统实现
        // 当前先用占位结构保证架构闭环

        const letterSystem: ISystem = {
            name: "LetterSystem",
            init: () => console.log("[LetterSystem] init"),
            tick: (dt: number) => {},
            reset: () => console.log("[LetterSystem] reset")
        };

        const idiomSystem: ISystem = {
            name: "IdiomSystem",
            init: () => console.log("[IdiomSystem] init"),
            tick: (dt: number) => {},
            reset: () => console.log("[IdiomSystem] reset")
        };

        const waveSystem: ISystem = {
            name: "WaveSystem",
            init: () => console.log("[WaveSystem] init"),
            tick: (dt: number) => {},
            reset: () => console.log("[WaveSystem] reset")
        };

        this.systemManager.register(letterSystem);
        this.systemManager.register(idiomSystem);
        this.systemManager.register(waveSystem);
    }

    /** 启动游戏 */
    public startGame(): void {
        this.isRunning = true;
        this.lastTime = Date.now();
    }

    /** 暂停游戏 */
    public pauseGame(): void {
        this.isRunning = false;
    }

    /** 重置游戏 */
    public resetGame(): void {
        this.systemManager.reset();
    }

    /** Scene 每帧调用 */
    public update(): void {
        if (!this.isRunning) return;

        const now = Date.now();
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        this.systemManager.tick(dt);
    }

    /** 获取 System */
    public getSystem<T extends ISystem>(name: string): T | null {
        return this.systemManager.get<T>(name);
    }

    /** 调试 */
    public debug(): void {
        this.systemManager.debugPrint();
    }
}