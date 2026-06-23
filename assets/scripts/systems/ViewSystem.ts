import { Node, UITransform, Color, Graphics, Vec3, Label } from 'cc';
import type { EnemyState, EnemyRemovedReason } from './EnemySystem';

export type PathPoint = Vec3;

type EnemyView = {
    node: Node;
    hpFill: Graphics;
};

/**
 * v0.8.2 正式路径可视化系统。
 *
 * 负责：
 * - 画背景
 * - 画敌人路径
 * - 创建 / 更新 / 移除敌人节点
 * - 显示 HUD 状态
 */
export class ViewSystem {

    private root: Node | null = null;
    private viewRoot: Node | null = null;
    private hudLabel: Label | null = null;
    private enemyViews = new Map<number, EnemyView>();
    private path: PathPoint[] = [];

    public init(root: Node, path: PathPoint[]) {
        this.root = root;
        this.path = path.map(p => p.clone());
        this.enemyViews.clear();

        this.ensureCanvasSize(root);
        this.recreateViewRoot(root);
        this.createBackground();
        this.createPath();
        this.createTitle();
        this.createHud();
        this.createBaseMarkers();

        console.log('[ViewSystem v0.8.2] initialized');
    }

    public updateHud(text: string) {
        if (!this.hudLabel) return;
        this.hudLabel.string = text;
    }

    public createEnemy(enemy: EnemyState) {
        if (!this.viewRoot) {
            console.warn('[ViewSystem v0.8.2] createEnemy ignored: viewRoot is null');
            return;
        }

        const node = new Node(`enemy_${enemy.type}_${enemy.id}`);
        this.viewRoot.addChild(node);
        node.setPosition(enemy.position);

        const size = enemy.type === 'shield' ? 64 : 56;
        const ui = node.addComponent(UITransform);
        ui.setContentSize(size, size + 16);

        const body = node.addComponent(Graphics);
        body.fillColor = this.getEnemyColor(enemy.type);
        body.rect(-size / 2, -size / 2, size, size);
        body.fill();

        const labelNode = new Node('enemy_label');
        node.addChild(labelNode);
        labelNode.setPosition(new Vec3(0, -5, 0));
        const labelUi = labelNode.addComponent(UITransform);
        labelUi.setContentSize(size, 26);
        const label = labelNode.addComponent(Label);
        label.string = `${enemy.id}`;
        label.fontSize = 20;
        label.color = new Color(255, 255, 255, 255);

        const hpBgNode = new Node('hp_bg');
        node.addChild(hpBgNode);
        hpBgNode.setPosition(new Vec3(0, size / 2 + 8, 0));
        const hpBgUi = hpBgNode.addComponent(UITransform);
        hpBgUi.setContentSize(size, 8);
        const hpBg = hpBgNode.addComponent(Graphics);
        hpBg.fillColor = new Color(35, 35, 35, 255);
        hpBg.rect(-size / 2, -4, size, 8);
        hpBg.fill();

        const hpFillNode = new Node('hp_fill');
        node.addChild(hpFillNode);
        hpFillNode.setPosition(new Vec3(0, size / 2 + 8, 0));
        const hpFillUi = hpFillNode.addComponent(UITransform);
        hpFillUi.setContentSize(size, 8);
        const hpFill = hpFillNode.addComponent(Graphics);

        this.enemyViews.set(enemy.id, { node, hpFill });
        this.updateEnemy(enemy);

        console.log(`[ViewSystem v0.8.2] enemy created: #${enemy.id} ${enemy.type}`);
    }

    public updateEnemy(enemy: EnemyState) {
        const view = this.enemyViews.get(enemy.id);
        if (!view || !view.node.isValid) return;

        view.node.setPosition(enemy.position);
        this.drawHp(view.hpFill, enemy);
    }

    public removeEnemy(enemy: EnemyState, reason: EnemyRemovedReason) {
        const view = this.enemyViews.get(enemy.id);
        if (!view) return;

        this.enemyViews.delete(enemy.id);
        if (view.node.isValid) {
            view.node.destroy();
        }

        console.log(`[ViewSystem v0.8.2] enemy removed: #${enemy.id}, reason=${reason}`);
    }

    public clear() {
        for (const view of this.enemyViews.values()) {
            if (view.node.isValid) view.node.destroy();
        }
        this.enemyViews.clear();

        if (this.viewRoot && this.viewRoot.isValid) {
            this.viewRoot.destroy();
        }
        this.viewRoot = null;
        this.hudLabel = null;
    }

    private ensureCanvasSize(root: Node) {
        const ui = root.getComponent(UITransform) || root.addComponent(UITransform);
        if (ui.width <= 0 || ui.height <= 0) {
            ui.setContentSize(1280, 720);
        }
    }

    private recreateViewRoot(root: Node) {
        const old = root.getChildByName('VIEW_ROOT_v0_8_2');
        if (old && old.isValid) {
            old.destroy();
        }

        // 清理上一版调试节点，避免从 v0.8.1 热更新时叠层。
        const old081 = root.getChildByName('VIEW_ROOT_v0_8_1');
        if (old081 && old081.isValid) {
            old081.destroy();
        }

        const viewRoot = new Node('VIEW_ROOT_v0_8_2');
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

    private createPath() {
        if (!this.viewRoot || this.path.length < 2) return;

        const pathNode = new Node('enemy_path');
        this.viewRoot.addChild(pathNode);

        const g = pathNode.addComponent(Graphics);
        g.lineWidth = 12;
        g.strokeColor = new Color(80, 95, 125, 255);
        g.moveTo(this.path[0].x, this.path[0].y);
        for (let i = 1; i < this.path.length; i++) {
            g.lineTo(this.path[i].x, this.path[i].y);
        }
        g.stroke();

        const g2 = pathNode.addComponent(Graphics);
        g2.lineWidth = 4;
        g2.strokeColor = new Color(160, 190, 255, 255);
        g2.moveTo(this.path[0].x, this.path[0].y);
        for (let i = 1; i < this.path.length; i++) {
            g2.lineTo(this.path[i].x, this.path[i].y);
        }
        g2.stroke();
    }

    private createTitle() {
        if (!this.viewRoot) return;

        const title = new Node('title');
        this.viewRoot.addChild(title);
        title.setPosition(new Vec3(0, 280, 0));

        const ui = title.addComponent(UITransform);
        ui.setContentSize(900, 60);

        const label = title.addComponent(Label);
        label.string = '成语塔防 v0.8.2 - 敌人正式路径版';
        label.fontSize = 32;
        label.color = new Color(255, 230, 120, 255);
    }

    private createHud() {
        if (!this.viewRoot) return;

        const hud = new Node('hud');
        this.viewRoot.addChild(hud);
        hud.setPosition(new Vec3(0, -310, 0));

        const ui = hud.addComponent(UITransform);
        ui.setContentSize(1100, 40);

        const label = hud.addComponent(Label);
        label.string = 'SystemManager v0.8.2 ready...';
        label.fontSize = 22;
        label.color = new Color(190, 220, 255, 255);
        this.hudLabel = label;
    }

    private createBaseMarkers() {
        if (!this.viewRoot || this.path.length < 2) return;

        this.createMarker('入口', this.path[0], new Color(80, 220, 120, 255));
        this.createMarker('基地', this.path[this.path.length - 1], new Color(255, 100, 100, 255));
    }

    private createMarker(text: string, position: Vec3, color: Color) {
        if (!this.viewRoot) return;

        const node = new Node(`marker_${text}`);
        this.viewRoot.addChild(node);
        node.setPosition(position);

        const ui = node.addComponent(UITransform);
        ui.setContentSize(80, 36);

        const g = node.addComponent(Graphics);
        g.fillColor = color;
        g.rect(-36, -18, 72, 36);
        g.fill();

        const labelNode = new Node('label');
        node.addChild(labelNode);
        const labelUi = labelNode.addComponent(UITransform);
        labelUi.setContentSize(80, 28);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = 18;
        label.color = new Color(255, 255, 255, 255);
    }

    private drawHp(g: Graphics, enemy: EnemyState) {
        const width = enemy.type === 'shield' ? 64 : 56;
        const ratio = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
        g.clear();
        g.fillColor = new Color(80, 230, 120, 255);
        g.rect(-width / 2, -4, width * ratio, 8);
        g.fill();
    }

    private getEnemyColor(type: EnemyState['type']) {
        if (type === 'shield') return new Color(70, 170, 255, 255);
        if (type === 'cavalry') return new Color(255, 190, 70, 255);
        if (type === 'archer') return new Color(80, 220, 120, 255);
        return new Color(230, 70, 70, 255);
    }
}
