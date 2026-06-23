import { Node, UITransform, Color, Graphics, Vec3, Label } from 'cc';
import { EnemyType, SpawnPayload } from './WaveSystem';

type EnemyView = {
    node: Node;
    speed: number;
};

/**
 * v0.8.1 稳定可视化系统。
 *
 * 目标：保证 SystemManager 接回后依然有稳定画面。
 * 这一版只使用 Graphics + Label，不依赖外部图片资源。
 */
export class ViewSystem {

    private root: Node | null = null;
    private viewRoot: Node | null = null;
    private hudLabel: Label | null = null;
    private enemies: EnemyView[] = [];

    public init(root: Node) {
        this.root = root;
        this.enemies.length = 0;

        this.ensureCanvasSize(root);
        this.recreateViewRoot(root);
        this.createBackground();
        this.createTitle();
        this.createHud();

        console.log('[ViewSystem v0.8.1] initialized');
    }

    public tick(dt: number) {
        for (const enemy of this.enemies) {
            const p = enemy.node.position;
            enemy.node.setPosition(new Vec3(p.x + enemy.speed * dt, p.y, p.z));

            // 超出右侧后从左侧重新进入，避免跑完后画面空。
            if (enemy.node.position.x > 560) {
                enemy.node.setPosition(new Vec3(-560, enemy.node.position.y, enemy.node.position.z));
            }
        }
    }

    public updateHud(text: string) {
        if (!this.hudLabel) return;
        this.hudLabel.string = text;
    }

    public spawnEnemy(type: EnemyType, payload?: SpawnPayload) {
        if (!this.viewRoot) {
            console.warn('[ViewSystem v0.8.1] spawnEnemy ignored: viewRoot is null');
            return;
        }

        const node = new Node(`enemy_${type}_${payload?.index ?? this.enemies.length + 1}`);
        this.viewRoot.addChild(node);

        const size = type === 'shield' ? 64 : 56;
        const ui = node.addComponent(UITransform);
        ui.setContentSize(size, size);

        const g = node.addComponent(Graphics);
        g.clear();
        g.fillColor = this.getEnemyColor(type);
        g.rect(-size / 2, -size / 2, size, size);
        g.fill();

        const labelNode = new Node('enemy_label');
        node.addChild(labelNode);
        labelNode.setPosition(new Vec3(0, -4, 0));
        const labelTransform = labelNode.addComponent(UITransform);
        labelTransform.setContentSize(size, 28);
        const label = labelNode.addComponent(Label);
        label.string = payload ? `${payload.index}` : type;
        label.fontSize = 20;
        label.color = new Color(255, 255, 255, 255);

        const index = payload?.index ?? this.enemies.length + 1;
        const x = -520;
        const y = 80 - ((index - 1) % 5) * 72;
        node.setPosition(new Vec3(x, y, 0));

        const speed = type === 'shield' ? 48 : 72;
        this.enemies.push({ node, speed });

        console.log(`[ViewSystem v0.8.1] enemy rendered: ${type} #${index}`);
    }

    public clear() {
        if (this.viewRoot && this.viewRoot.isValid) {
            this.viewRoot.destroy();
        }
        this.viewRoot = null;
        this.hudLabel = null;
        this.enemies.length = 0;
    }

    private ensureCanvasSize(root: Node) {
        const ui = root.getComponent(UITransform) || root.addComponent(UITransform);
        if (ui.width <= 0 || ui.height <= 0) {
            ui.setContentSize(1280, 720);
        }
    }

    private recreateViewRoot(root: Node) {
        const old = root.getChildByName('VIEW_ROOT_v0_8_1');
        if (old && old.isValid) {
            old.destroy();
        }

        const viewRoot = new Node('VIEW_ROOT_v0_8_1');
        const ui = viewRoot.addComponent(UITransform);
        ui.setContentSize(1280, 720);
        root.addChild(viewRoot);
        this.viewRoot = viewRoot;
    }

    private createBackground() {
        if (!this.viewRoot) return;

        const bg = new Node('debug_background');
        const ui = bg.addComponent(UITransform);
        ui.setContentSize(1280, 720);

        const g = bg.addComponent(Graphics);
        g.fillColor = new Color(18, 22, 32, 255);
        g.rect(-640, -360, 1280, 720);
        g.fill();

        this.viewRoot.addChild(bg);
        bg.setSiblingIndex(0);
    }

    private createTitle() {
        if (!this.viewRoot) return;

        const title = new Node('title');
        this.viewRoot.addChild(title);
        title.setPosition(new Vec3(0, 260, 0));

        const ui = title.addComponent(UITransform);
        ui.setContentSize(800, 60);

        const label = title.addComponent(Label);
        label.string = '成语塔防 v0.8.1 - SystemManager 接回版';
        label.fontSize = 32;
        label.color = new Color(255, 230, 120, 255);
    }

    private createHud() {
        if (!this.viewRoot) return;

        const hud = new Node('hud');
        this.viewRoot.addChild(hud);
        hud.setPosition(new Vec3(0, -300, 0));

        const ui = hud.addComponent(UITransform);
        ui.setContentSize(900, 40);

        const label = hud.addComponent(Label);
        label.string = 'SystemManager ready...';
        label.fontSize = 22;
        label.color = new Color(190, 220, 255, 255);
        this.hudLabel = label;
    }

    private getEnemyColor(type: EnemyType) {
        if (type === 'shield') return new Color(70, 170, 255, 255);
        if (type === 'cavalry') return new Color(255, 190, 70, 255);
        if (type === 'archer') return new Color(80, 220, 120, 255);
        return new Color(230, 70, 70, 255);
    }
}
