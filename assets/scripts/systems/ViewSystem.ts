import { Node, UITransform, Color, Graphics, Vec3, Label, EventTouch, tween } from 'cc';
import type { EnemyState, EnemyRemovedReason } from './EnemySystem';

export type PathPoint = Vec3;

type EnemyView = { node: Node; hpFill: Graphics };
type SlotView = { node: Node; char: string; tile: TileView | null };
type TileView = { node: Node; char: string; homePos: Vec3; slotIndex: number; dragging: boolean };

export class ViewSystem {
    private root: Node | null = null;
    private viewRoot: Node | null = null;
    private hudLabel: Label | null = null;
    private tipLabel: Label | null = null;
    private gateLabel: Label | null = null;

    private enemyViews = new Map<number, EnemyView>();
    private slots: SlotView[] = [];
    private tiles: TileView[] = [];
    private path: PathPoint[] = [];

    public onIdiomComplete: ((idiom: string) => void) | null = null;

    public init(root: Node, path: PathPoint[]) {
        this.root = root;
        this.path = path.map(p => p.clone());
        this.enemyViews.clear();
        this.slots = [];
        this.tiles = [];

        this.ensureCanvasSize(root);
        this.recreateViewRoot(root);
        this.createBackground();
        this.createGroundScene();
        this.createPath();
        this.createGate();
        this.createTitle();
        this.createHud();
        this.createSlots();
        this.createCharTiles();
        this.showTip('v0.8.4：技能效果已接回，可释放万箭齐发 / 固若金汤 / 画地为牢');

        console.log('[ViewSystem v0.8.4] initialized');
    }

    public updateHud(text: string) {
        if (this.hudLabel) this.hudLabel.string = text;
    }

    public showTip(text: string) {
        if (this.tipLabel) this.tipLabel.string = text;
    }

    public updateGate(life: number, maxLife: number, shield = 0) {
        if (!this.gateLabel) return;
        this.gateLabel.string = shield > 0
            ? `城门血量：${life}/${maxLife}  护盾：${shield}`
            : `城门血量：${life}/${maxLife}`;
    }

    public createEnemy(enemy: EnemyState) {
        if (!this.viewRoot) return;

        const node = new Node(`enemy_${enemy.type}_${enemy.id}`);
        this.viewRoot.addChild(node);
        node.setPosition(enemy.position);

        const size = enemy.type === 'shield' ? 64 : 56;
        node.addComponent(UITransform).setContentSize(size, size + 16);

        const body = node.addComponent(Graphics);
        body.fillColor = this.getEnemyColor(enemy.type);
        body.rect(-size / 2, -size / 2, size, size);
        body.fill();

        this.createLabel(node, 'enemy_label', `${enemy.id}`, 0, -5, size, 26, 20, Color.WHITE);

        const hpBgNode = new Node('hp_bg');
        node.addChild(hpBgNode);
        hpBgNode.setPosition(new Vec3(0, size / 2 + 8, 0));
        hpBgNode.addComponent(UITransform).setContentSize(size, 8);
        const hpBg = hpBgNode.addComponent(Graphics);
        hpBg.fillColor = new Color(35, 35, 35, 255);
        hpBg.rect(-size / 2, -4, size, 8);
        hpBg.fill();

        const hpFillNode = new Node('hp_fill');
        node.addChild(hpFillNode);
        hpFillNode.setPosition(new Vec3(0, size / 2 + 8, 0));
        hpFillNode.addComponent(UITransform).setContentSize(size, 8);
        const hpFill = hpFillNode.addComponent(Graphics);

        this.enemyViews.set(enemy.id, { node, hpFill });
        this.updateEnemy(enemy);
        console.log(`[ViewSystem v0.8.4] enemy created: #${enemy.id} ${enemy.type}`);
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
        if (view.node.isValid) view.node.destroy();
        console.log(`[ViewSystem v0.8.4] enemy removed: #${enemy.id}, reason=${reason}`);
    }

    public showArrowRainEffect() {
        if (!this.viewRoot) return;

        const effect = new Node('skill_arrow_rain');
        this.viewRoot.addChild(effect);
        effect.setPosition(new Vec3(0, 24, 0));
        effect.addComponent(UITransform).setContentSize(1080, 120);

        const bg = effect.addComponent(Graphics);
        bg.fillColor = new Color(255, 230, 120, 42);
        bg.roundRect(-540, -60, 1080, 120, 24);
        bg.fill();
        bg.strokeColor = new Color(255, 230, 120, 190);
        bg.lineWidth = 3;
        bg.roundRect(-540, -60, 1080, 120, 24);
        bg.stroke();

        for (let i = 0; i < 14; i++) {
            const arrow = new Node(`arrow_${i}`);
            effect.addChild(arrow);
            arrow.setPosition(new Vec3(-490 + i * 75, 48 - (i % 3) * 34, 0));
            arrow.addComponent(UITransform).setContentSize(48, 8);
            const g = arrow.addComponent(Graphics);
            g.fillColor = new Color(255, 240, 150, 235);
            g.rect(-24, -4, 48, 8);
            g.fill();
            arrow.setRotationFromEuler(0, 0, -18);
        }

        this.createFloatingText('万箭齐发！', 0, 110, new Color(255, 240, 130, 255));
        tween(effect)
            .to(0.12, { scale: new Vec3(1.04, 1.12, 1) })
            .to(0.12, { scale: new Vec3(1, 1, 1) })
            .delay(0.35)
            .to(0.18, { scale: new Vec3(0.96, 0.96, 1) })
            .call(() => effect.destroy())
            .start();
    }

    public showShieldEffect() {
        const gateX = this.path.length > 0 ? this.path[this.path.length - 1].x : 400;
        const effect = this.createRoundBox('skill_shield_effect', gateX, 78, 190, 170, new Color(70, 175, 255, 60), '', 0, 28);
        const g = effect.addComponent(Graphics);
        g.strokeColor = new Color(130, 220, 255, 210);
        g.lineWidth = 5;
        g.roundRect(-95, -85, 190, 170, 28);
        g.stroke();

        this.createFloatingText('固若金汤！', gateX, 180, new Color(140, 225, 255, 255));
        tween(effect)
            .to(0.15, { scale: new Vec3(1.10, 1.10, 1) })
            .to(0.18, { scale: new Vec3(1, 1, 1) })
            .delay(0.45)
            .call(() => effect.destroy())
            .start();
    }

    public showFreezeEffect(seconds: number) {
        const effect = this.createRoundBox('skill_freeze_field', 0, 24, 1080, 122, new Color(90, 175, 255, 55), '', 0, 24);
        const g = effect.addComponent(Graphics);
        g.strokeColor = new Color(160, 225, 255, 175);
        g.lineWidth = 4;
        g.roundRect(-540, -61, 1080, 122, 24);
        g.stroke();

        this.createFloatingText(`画地为牢！冻结 ${seconds} 秒`, 0, 112, new Color(145, 225, 255, 255));
        tween(effect)
            .to(0.14, { scale: new Vec3(1.04, 1.08, 1) })
            .to(0.16, { scale: new Vec3(1, 1, 1) })
            .delay(0.65)
            .to(0.18, { scale: new Vec3(0.96, 0.96, 1) })
            .call(() => effect.destroy())
            .start();
    }

    public showEnemyHitFeedback(enemy: EnemyState, damage: number, killed: boolean) {
        const color = killed ? new Color(255, 220, 110, 255) : new Color(255, 245, 220, 255);
        const text = killed ? '击破' : `-${damage}`;
        this.createFloatingText(text, enemy.position.x, enemy.position.y + 56, color);

        if (!this.viewRoot) return;
        const burst = new Node('hit_burst');
        this.viewRoot.addChild(burst);
        burst.setPosition(new Vec3(enemy.position.x, enemy.position.y + 18, 0));
        burst.addComponent(UITransform).setContentSize(killed ? 48 : 28, killed ? 48 : 28);
        const g = burst.addComponent(Graphics);
        g.fillColor = killed ? new Color(255, 190, 90, 190) : new Color(255, 255, 255, 135);
        g.circle(0, 0, killed ? 24 : 14);
        g.fill();

        tween(burst)
            .to(0.10, { scale: new Vec3(1.25, 1.25, 1) })
            .to(0.12, { scale: new Vec3(0.1, 0.1, 1) })
            .call(() => burst.destroy())
            .start();
    }

    public clear() {
        for (const view of this.enemyViews.values()) if (view.node.isValid) view.node.destroy();
        this.enemyViews.clear();
        if (this.viewRoot && this.viewRoot.isValid) this.viewRoot.destroy();
        this.viewRoot = null;
        this.hudLabel = null;
        this.tipLabel = null;
        this.gateLabel = null;
        this.slots = [];
        this.tiles = [];
    }

    private ensureCanvasSize(root: Node) {
        const ui = root.getComponent(UITransform) || root.addComponent(UITransform);
        if (ui.width <= 0 || ui.height <= 0) ui.setContentSize(1280, 720);
    }

    private recreateViewRoot(root: Node) {
        for (const name of ['VIEW_ROOT_v0_8_4', 'VIEW_ROOT_v0_8_3_1', 'VIEW_ROOT_v0_8_3', 'VIEW_ROOT_v0_8_2', 'VIEW_ROOT_v0_8_1']) {
            const old = root.getChildByName(name);
            if (old && old.isValid) old.destroy();
        }
        const viewRoot = new Node('VIEW_ROOT_v0_8_4');
        viewRoot.addComponent(UITransform).setContentSize(1280, 720);
        root.addChild(viewRoot);
        this.viewRoot = viewRoot;
    }

    private createBackground() {
        if (!this.viewRoot) return;
        const bg = new Node('background');
        this.viewRoot.addChild(bg);
        bg.addComponent(UITransform).setContentSize(1280, 720);
        const g = bg.addComponent(Graphics);
        g.fillColor = new Color(18, 22, 32, 255);
        g.rect(-640, -360, 1280, 720);
        g.fill();
    }

    private createGroundScene() {
        this.createRoundBox('ground_back', 0, 10, 1120, 138, new Color(35, 32, 24, 255), '', 0, 20);
        this.createRoundBox('ground_mid', 0, 18, 1030, 96, new Color(62, 52, 38, 235), '', 0, 18);
        this.createRoundBox('ground_front', 0, 24, 960, 58, new Color(96, 80, 54, 220), '', 0, 14);
        for (let i = 0; i < 10; i++) {
            this.createRoundBox(`stone_${i}`, -505 + i * 112, 26, 100, 46, new Color(120, 112, 96, 210), '', 0, 10);
        }
    }

    private createPath() {
        if (!this.viewRoot || this.path.length < 2) return;
        const pathNode = new Node('enemy_path_flat');
        this.viewRoot.addChild(pathNode);
        const g = pathNode.addComponent(Graphics);
        g.lineWidth = 10;
        g.strokeColor = new Color(96, 112, 145, 255);
        g.moveTo(this.path[0].x, this.path[0].y);
        for (let i = 1; i < this.path.length; i++) g.lineTo(this.path[i].x, this.path[i].y);
        g.stroke();
    }

    private createGate() {
        const gateX = this.path.length > 0 ? this.path[this.path.length - 1].x : 400;
        const gateY = 74;
        this.createRoundBox('gate_body', gateX, gateY, 118, 132, new Color(118, 70, 48, 255), '城门', 26, 12);
        this.createRoundBox('gate_top', gateX, gateY + 77, 142, 32, new Color(150, 96, 58, 255), '', 0, 8);
        const label = this.createText('gate_hp', '城门血量：10/10', gateX, gateY + 125, 22, Color.WHITE);
        this.gateLabel = label.getComponent(Label);
    }

    private createTitle() {
        this.createText('title', '成语塔防 v0.8.4 - 技能效果接回版', 0, 305, 31, new Color(255, 230, 120, 255));
    }

    private createHud() {
        this.hudLabel = this.createText('hud', 'SystemManager v0.8.4 ready...', 0, 255, 20, new Color(190, 220, 255, 255)).getComponent(Label);
        this.tipLabel = this.createText('tip', '', 0, 225, 20, new Color(255, 230, 170, 255)).getComponent(Label);
    }

    private createSlots() {
        const y = -205;
        const gap = 112;
        for (let i = 0; i < 4; i++) {
            const node = this.createRoundBox(`slot_${i}`, -gap * 1.5 + i * gap, y, 84, 84, new Color(42, 50, 66, 235), '', 0, 12);
            this.slots.push({ node, char: '', tile: null });
        }
        this.createText('slot_tip', '拖动字块到四个成语槽', 0, -152, 20, new Color(180, 205, 230, 255));
    }

    private createCharTiles() {
        const chars = ['万', '箭', '齐', '发', '固', '若', '金', '汤', '画', '地', '为', '牢', '火', '土'];
        const gap = 58;
        for (let i = 0; i < chars.length; i++) {
            const row = i < 7 ? 0 : 1;
            const col = row === 0 ? i : i - 7;
            const x = -gap * 3 + col * gap;
            const y = row === 0 ? -292 : -342;
            this.createTile(chars[i], i, x, y);
        }
    }

    private createTile(char: string, index: number, x: number, y: number) {
        if (!this.viewRoot) return;
        const node = this.createRoundBox(`tile_${char}_${index}`, x, y, 48, 48, new Color(206, 150, 64, 255), char, 28, 9);
        const tile: TileView = { node, char, homePos: new Vec3(x, y, 0), slotIndex: -1, dragging: false };
        this.tiles.push(tile);
        node.on(Node.EventType.TOUCH_START, () => this.onTileTouchStart(tile), this);
        node.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => this.onTileTouchMove(tile, e), this);
        node.on(Node.EventType.TOUCH_END, () => this.onTileTouchEnd(tile), this);
        node.on(Node.EventType.TOUCH_CANCEL, () => this.onTileTouchEnd(tile), this);
    }

    private onTileTouchStart(tile: TileView) {
        tile.dragging = true;
        tile.node.setScale(1.12, 1.12, 1);
        tile.node.setSiblingIndex(999);
        if (tile.slotIndex >= 0 && this.slots[tile.slotIndex]) {
            this.slots[tile.slotIndex].char = '';
            this.slots[tile.slotIndex].tile = null;
            tile.slotIndex = -1;
        }
    }

    private onTileTouchMove(tile: TileView, event: EventTouch) {
        if (!tile.dragging || !this.viewRoot) return;
        const uiPos = event.getUILocation();
        const parentUI = this.viewRoot.getComponent(UITransform);
        if (!parentUI) return;
        const local = parentUI.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
        tile.node.setPosition(local);
    }

    private onTileTouchEnd(tile: TileView) {
        if (!tile.dragging) return;
        tile.dragging = false;
        tile.node.setScale(1, 1, 1);

        const slotIndex = this.findNearestEmptySlot(tile.node.position);
        if (slotIndex < 0) {
            this.resetTile(tile);
            return;
        }

        const slot = this.slots[slotIndex];
        slot.char = tile.char;
        slot.tile = tile;
        tile.slotIndex = slotIndex;
        tile.node.setPosition(slot.node.position);
        this.checkIdiom();
    }

    private findNearestEmptySlot(pos: Vec3) {
        let best = -1;
        let bestD = 99999;
        for (let i = 0; i < this.slots.length; i++) {
            if (this.slots[i].tile) continue;
            const d = Vec3.distance(pos, this.slots[i].node.position);
            if (d < 72 && d < bestD) {
                best = i;
                bestD = d;
            }
        }
        return best;
    }

    private checkIdiom() {
        const text = this.slots.map(s => s.char).join('');
        if (text.length < 4) return;
        if (text === '万箭齐发' || text === '固若金汤' || text === '画地为牢') {
            this.showTip(`已组成：${text}`);
            this.onIdiomComplete?.(text);
            this.clearSlotsToHome();
        } else {
            this.showTip(`当前组合：${text}`);
        }
    }

    private clearSlotsToHome() {
        for (const slot of this.slots) {
            if (slot.tile) this.resetTile(slot.tile);
            slot.char = '';
            slot.tile = null;
        }
    }

    private resetTile(tile: TileView) {
        tile.slotIndex = -1;
        tile.node.setPosition(tile.homePos);
    }

    private createFloatingText(text: string, x: number, y: number, color: Color) {
        const node = this.createText(`float_${text}`, text, x, y, 24, color);
        tween(node)
            .by(0.45, { position: new Vec3(0, 38, 0) })
            .call(() => node.destroy())
            .start();
    }

    private createRoundBox(name: string, x: number, y: number, w: number, h: number, color: Color, text: string, fontSize: number, radius: number) {
        if (!this.viewRoot) return new Node(name);
        const node = new Node(name);
        this.viewRoot.addChild(node);
        node.setPosition(new Vec3(x, y, 0));
        node.addComponent(UITransform).setContentSize(w, h);
        const g = node.addComponent(Graphics);
        g.fillColor = color;
        g.roundRect(-w / 2, -h / 2, w, h, radius);
        g.fill();
        if (text) this.createLabel(node, `${name}_label`, text, 0, 0, w, h, fontSize, Color.WHITE);
        return node;
    }

    private createText(name: string, text: string, x: number, y: number, size: number, color: Color) {
        if (!this.viewRoot) return new Node(name);
        const node = new Node(name);
        this.viewRoot.addChild(node);
        node.setPosition(new Vec3(x, y, 0));
        node.addComponent(UITransform).setContentSize(1100, 42);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.color = color;
        return node;
    }

    private createLabel(parent: Node, name: string, text: string, x: number, y: number, w: number, h: number, fontSize: number, color: Color) {
        const node = new Node(name);
        parent.addChild(node);
        node.setPosition(new Vec3(x, y, 0));
        node.addComponent(UITransform).setContentSize(w, h);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.color = color;
        return node;
    }

    private drawHp(g: Graphics, enemy: EnemyState) {
        const width = enemy.type === 'shield' ? 64 : 56;
        const ratio = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
        g.clear();
        g.fillColor = enemy.frozenRemain > 0
            ? new Color(120, 220, 255, 255)
            : new Color(80, 230, 120, 255);
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
