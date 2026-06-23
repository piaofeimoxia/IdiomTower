import { _decorator, Component, Node, UITransform, Graphics, Color, Vec3, Label } from 'cc';

const { ccclass } = _decorator;

/**
 * 最小可运行修复版入口。
 * 目的：先验证 Cocos 生命周期和渲染链路一定能跑起来。
 *
 * Canvas 上只挂这个 GameBootstrap。
 * 如果这个版本仍然没有 onLoad / update 打印，说明问题不在代码，而在场景组件绑定或 Creator 缓存。
 */
@ccclass('GameBootstrap')
export class GameBootstrap extends Component {

    private elapsed = 0;
    private enemyIndex = 0;
    private titleLabel: Label | null = null;

    onLoad() {
        console.log('🔥 MINIMAL GameBootstrap onLoad HIT');

        this.ensureCanvasSize();
        this.createBackground();
        this.createTitle();
        this.spawnEnemyBlock('basic');
    }

    start() {
        console.log('✅ MINIMAL GameBootstrap start HIT');
    }

    update(dt: number) {
        this.elapsed += dt;

        // 每 1 秒刷一个测试敌人，保证画面不是黑屏。
        if (this.elapsed >= 1.0) {
            this.elapsed = 0;
            this.spawnEnemyBlock(this.enemyIndex % 2 === 0 ? 'basic' : 'shield');
        }
    }

    private ensureCanvasSize() {
        const ui = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
        if (ui.width <= 0 || ui.height <= 0) {
            ui.setContentSize(1280, 720);
        }
    }

    private createBackground() {
        const bg = new Node('debug_background');
        const ui = bg.addComponent(UITransform);
        ui.setContentSize(1280, 720);

        const g = bg.addComponent(Graphics);
        g.fillColor = new Color(18, 22, 32, 255);
        g.rect(-640, -360, 1280, 720);
        g.fill();

        this.node.addChild(bg);
        bg.setSiblingIndex(0);
    }

    private createTitle() {
        const title = new Node('debug_title');
        this.node.addChild(title);
        title.setPosition(new Vec3(0, 260, 0));

        const label = title.addComponent(Label);
        label.string = '成语塔防 - 最小可运行修复版';
        label.fontSize = 32;
        label.color = new Color(255, 230, 120, 255);
        this.titleLabel = label;
    }

    private spawnEnemyBlock(type: 'basic' | 'shield') {
        const enemy = new Node(`debug_enemy_${this.enemyIndex++}`);
        this.node.addChild(enemy);

        const ui = enemy.addComponent(UITransform);
        ui.setContentSize(60, 60);

        const g = enemy.addComponent(Graphics);
        g.fillColor = type === 'basic'
            ? new Color(230, 70, 70, 255)
            : new Color(70, 170, 255, 255);
        g.rect(-30, -30, 60, 60);
        g.fill();

        const x = -480 + (this.enemyIndex % 8) * 130;
        const y = 40 - Math.floor(this.enemyIndex / 8) * 90;
        enemy.setPosition(new Vec3(x, y, 0));

        console.log(`[MinimalSpawn] ${type} enemy created at ${x},${y}`);
    }
}
