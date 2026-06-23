import { Node, UITransform, Color, Graphics, Vec3, Label, EventTouch, tween, resources, SpriteFrame, Sprite } from 'cc';
import type { EnemyState, EnemyRemovedReason } from './EnemySystem';

export type PathPoint = Vec3;

type EnemyView = {
    node: Node;
    hpFill: Graphics;
    sprite: Sprite | null;
    frames: SpriteFrame[];
    frameIndex: number;
    lastFrameTime: number;
};
type SlotView = { node: Node; char: string; tile: TileView | null };
type TileView = { node: Node; char: string; homePos: Vec3; slotIndex: number; dragging: boolean };
type EnemyVisualSize = { w: number; h: number; fallback: string };

/**
 * ViewSystem v0.8.5.2
 *
 * 修复重点：
 * - 敌人不再使用静态大图，而是恢复旧版 walk_0~walk_3 行走动画帧。
 * - 动画帧加载成功时只显示动画 Sprite，不叠加编号、方块和静态图。
 * - 贴图失败时才显示 fallback 方块和文字。
 * - 尺寸、层级、地面、城门、字块继续沿用 v0.8.5.1 修正版。
 */
export class ViewSystem {
    private root: Node | null = null;
    private viewRoot: Node | null = null;
    private backgroundLayer: Node | null = null;
    private groundLayer: Node | null = null;
    private enemyLayer: Node | null = null;
    private gateLayer: Node | null = null;
    private uiLayer: Node | null = null;
    private effectLayer: Node | null = null;

    private hudLabel: Label | null = null;
    private tipLabel: Label | null = null;
    private gateLabel: Label | null = null;

    private enemyViews = new Map<number, EnemyView>();
    private slots: SlotView[] = [];
    private tiles: TileView[] = [];
    private path: PathPoint[] = [];

    public onIdiomComplete: ((idiom: string) => void) | null = null;

    private readonly texturePath: Record<string, string> = {
        title: 'textures/ui_title',
        gate: 'textures/gate',
        slot: 'textures/slot_empty',
        groundTile: 'textures/env_stone_path_tile',

        tile_wan: 'textures/tile_wan',
        tile_jian: 'textures/tile_jian',
        tile_qi: 'textures/tile_qi',
        tile_fa: 'textures/tile_fa',
        tile_gu: 'textures/tile_gu',
        tile_ruo: 'textures/tile_ruo',
        tile_jin: 'textures/tile_jin',
        tile_tang: 'textures/tile_tang',
        tile_hua: 'textures/tile_hua',
        tile_di: 'textures/tile_di',
        tile_wei: 'textures/tile_wei',
        tile_lao: 'textures/tile_lao',
        tile_huo: 'textures/tile_huo',
        tile_tu: 'textures/tile_tu',

        enemy_basic_soldier: 'textures/enemy_basic_soldier',
        enemy_shield_soldier: 'textures/enemy_shield_soldier',
        enemy_cavalry: 'textures/enemy_cavalry',
        enemy_archer: 'textures/enemy_archer',
        enemy_bing_fallback: 'textures/enemy_bing',

        enemy_basic_walk_0: 'textures/enemy_basic_walk_0',
        enemy_basic_walk_1: 'textures/enemy_basic_walk_1',
        enemy_basic_walk_2: 'textures/enemy_basic_walk_2',
        enemy_basic_walk_3: 'textures/enemy_basic_walk_3',

        enemy_shield_walk_0: 'textures/enemy_shield_walk_0',
        enemy_shield_walk_1: 'textures/enemy_shield_walk_1',
        enemy_shield_walk_2: 'textures/enemy_shield_walk_2',
        enemy_shield_walk_3: 'textures/enemy_shield_walk_3',

        enemy_cavalry_walk_0: 'textures/enemy_cavalry_walk_0',
        enemy_cavalry_walk_1: 'textures/enemy_cavalry_walk_1',
        enemy_cavalry_walk_2: 'textures/enemy_cavalry_walk_2',
        enemy_cavalry_walk_3: 'textures/enemy_cavalry_walk_3',

        enemy_archer_walk_0: 'textures/enemy_archer_walk_0',
        enemy_archer_walk_1: 'textures/enemy_archer_walk_1',
        enemy_archer_walk_2: 'textures/enemy_archer_walk_2',
        enemy_archer_walk_3: 'textures/enemy_archer_walk_3',

        effect_arrow_rain: 'textures/effect_arrow_rain',
        effect_blue_shield: 'textures/effect_blue_shield',
    };

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
        this.createGate();
        this.createTitle();
        this.createHud();
        this.createSlots();
        this.createCharTiles();
        this.showTip('v0.8.5.2：已恢复旧版行走动画帧，避免静态贴图白块');

        console.log('[ViewSystem v0.8.5.2] initialized');
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
        if (!this.enemyLayer) return;

        const size = this.getEnemyVisualSize(enemy.type);
        const node = new Node(`enemy_${enemy.type}_${enemy.id}`);
        this.enemyLayer.addChild(node);
        node.setPosition(enemy.position.x, enemy.position.y + this.getEnemyYOffset(enemy.type));
        node.addComponent(UITransform).setContentSize(size.w, size.h);

        const spriteRoot = new Node(`${node.name}_sprite_root`);
        node.addChild(spriteRoot);
        spriteRoot.setPosition(0, 0, 0);
        spriteRoot.addComponent(UITransform).setContentSize(size.w, size.h);
        const sprite = spriteRoot.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;

        const hpWidth = Math.min(size.w, 88);
        const hpBgNode = new Node('hp_bg');
        node.addChild(hpBgNode);
        hpBgNode.setPosition(new Vec3(0, size.h / 2 + 8, 0));
        hpBgNode.addComponent(UITransform).setContentSize(hpWidth, 8);
        const hpBg = hpBgNode.addComponent(Graphics);
        hpBg.fillColor = new Color(35, 35, 35, 255);
        hpBg.rect(-hpWidth / 2, -4, hpWidth, 8);
        hpBg.fill();

        const hpFillNode = new Node('hp_fill');
        node.addChild(hpFillNode);
        hpFillNode.setPosition(new Vec3(0, size.h / 2 + 8, 0));
        hpFillNode.addComponent(UITransform).setContentSize(hpWidth, 8);
        const hpFill = hpFillNode.addComponent(Graphics);

        const view: EnemyView = {
            node,
            hpFill,
            sprite,
            frames: [],
            frameIndex: 0,
            lastFrameTime: Date.now(),
        };
        this.enemyViews.set(enemy.id, view);

        this.loadSpriteFrameList(this.getEnemyWalkFramePaths(enemy.type), frames => {
            if (!node.isValid || !spriteRoot.isValid) return;

            if (frames.length > 0) {
                view.frames = frames;
                view.frameIndex = 0;
                sprite.spriteFrame = frames[0];
                console.log(`[ViewSystem v0.8.5.2] walk frames loaded: ${enemy.type}, count=${frames.length}`);
            } else {
                // 只有动画帧全失败时才回退静态图；再失败才显示文字方块。
                this.tryLoadSprite(this.getEnemyTexturePaths(enemy.type), 0, spriteRoot, size.w, size.h, () => {
                    this.createFallbackBox(spriteRoot, size.w, size.h, size.fallback, 28);
                });
            }
        });

        this.updateEnemy(enemy);
        this.refreshEnemyDepthOrder();
        console.log(`[ViewSystem v0.8.5.2] enemy created: #${enemy.id} ${enemy.type}`);
    }

    public updateEnemy(enemy: EnemyState) {
        const view = this.enemyViews.get(enemy.id);
        if (!view || !view.node.isValid) return;
        view.node.setPosition(enemy.position.x, enemy.position.y + this.getEnemyYOffset(enemy.type));
        this.animateEnemyView(view, enemy);
        this.drawHp(view.hpFill, enemy);
        this.refreshEnemyDepthOrder();
    }

    public removeEnemy(enemy: EnemyState, reason: EnemyRemovedReason) {
        const view = this.enemyViews.get(enemy.id);
        if (!view) return;
        this.enemyViews.delete(enemy.id);
        if (view.node.isValid) view.node.destroy();
        console.log(`[ViewSystem v0.8.5.2] enemy removed: #${enemy.id}, reason=${reason}`);
    }

    public showArrowRainEffect() {
        const effect = this.createImageNode(
            this.effectLayer,
            'effect_arrow_rain',
            [this.texturePath.effect_arrow_rain],
            0,
            35,
            260,
            195,
            '',
            0
        );

        this.createFloatingText('万箭齐发！', 0, 90, new Color(255, 240, 120, 255));
        tween(effect)
            .to(0.16, { scale: new Vec3(1.15, 1.15, 1) })
            .to(0.16, { scale: new Vec3(1, 1, 1) })
            .delay(0.22)
            .call(() => effect.destroy())
            .start();
    }

    public showShieldEffect() {
        const gateX = this.path.length > 0 ? this.path[this.path.length - 1].x : 400;
        const effect = this.createImageNode(
            this.effectLayer,
            'effect_blue_shield',
            [this.texturePath.effect_blue_shield],
            gateX,
            85,
            150,
            150,
            '',
            0
        );

        this.createFloatingText('固若金汤！', gateX, 135, new Color(120, 220, 255, 255));
        tween(effect)
            .to(0.18, { scale: new Vec3(1.18, 1.18, 1) })
            .to(0.18, { scale: new Vec3(1, 1, 1) })
            .delay(0.55)
            .call(() => effect.destroy())
            .start();
    }

    public showFreezeEffect(seconds: number) {
        if (!this.effectLayer) return;

        const field = new Node('freeze_field');
        this.effectLayer.addChild(field);
        field.setPosition(0, 8);
        field.addComponent(UITransform).setContentSize(1040, 88);

        const g = field.addComponent(Graphics);
        g.fillColor = new Color(90, 170, 255, 58);
        g.roundRect(-520, -44, 1040, 88, 24);
        g.fill();
        g.strokeColor = new Color(150, 220, 255, 150);
        g.lineWidth = 3;
        g.roundRect(-520, -44, 1040, 88, 24);
        g.stroke();

        this.createFloatingText(`画地为牢！冻结 ${seconds} 秒`, 0, 95, new Color(145, 220, 255, 255));
        tween(field)
            .to(0.14, { scale: new Vec3(1.03, 1.12, 1) })
            .to(0.16, { scale: new Vec3(1, 1, 1) })
            .delay(0.85)
            .to(0.18, { scale: new Vec3(0.92, 0.92, 1) })
            .call(() => field.destroy())
            .start();
    }

    public showEnemyHitFeedback(enemy: EnemyState, damage: number, killed: boolean) {
        const color = killed ? new Color(255, 220, 110, 255) : new Color(255, 245, 220, 255);
        const text = killed ? '击破' : `-${damage}`;
        this.createFloatingText(text, enemy.position.x, enemy.position.y + 50, color);

        if (!this.effectLayer) return;
        const burst = new Node('hit_burst');
        this.effectLayer.addChild(burst);
        burst.setPosition(new Vec3(enemy.position.x, enemy.position.y + 24, 0));
        const size = killed ? 46 : 26;
        burst.addComponent(UITransform).setContentSize(size, size);
        const g = burst.addComponent(Graphics);
        g.fillColor = killed ? new Color(255, 190, 90, 220) : new Color(255, 255, 255, 145);
        g.circle(0, 0, size / 2);
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
        this.backgroundLayer = null;
        this.groundLayer = null;
        this.enemyLayer = null;
        this.gateLayer = null;
        this.uiLayer = null;
        this.effectLayer = null;
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
        for (const name of ['VIEW_ROOT_v0_8_5_2', 'VIEW_ROOT_v0_8_5_1', 'VIEW_ROOT_v0_8_5', 'VIEW_ROOT_v0_8_4', 'VIEW_ROOT_v0_8_3_1', 'VIEW_ROOT_v0_8_3', 'VIEW_ROOT_v0_8_2', 'VIEW_ROOT_v0_8_1']) {
            const old = root.getChildByName(name);
            if (old && old.isValid) old.destroy();
        }

        const viewRoot = new Node('VIEW_ROOT_v0_8_5_2');
        viewRoot.addComponent(UITransform).setContentSize(1280, 720);
        root.addChild(viewRoot);
        this.viewRoot = viewRoot;

        this.backgroundLayer = this.createLayer('layer_0_background');
        this.groundLayer = this.createLayer('layer_1_ground');
        this.enemyLayer = this.createLayer('layer_2_enemy');
        this.gateLayer = this.createLayer('layer_3_gate');
        this.uiLayer = this.createLayer('layer_4_ui');
        this.effectLayer = this.createLayer('layer_5_effect');
    }

    private createLayer(name: string) {
        const layer = new Node(name);
        this.viewRoot?.addChild(layer);
        layer.addComponent(UITransform).setContentSize(1280, 720);
        return layer;
    }

    private createBackground() {
        if (!this.backgroundLayer) return;
        const bg = new Node('background');
        this.backgroundLayer.addChild(bg);
        bg.addComponent(UITransform).setContentSize(1280, 720);
        const g = bg.addComponent(Graphics);
        g.fillColor = new Color(18, 22, 32, 255);
        g.rect(-640, -360, 1280, 720);
        g.fill();
    }

    private createGroundScene() {
        this.createGroundBand('ground_band_back', 0, -10, 1120, 118, new Color(35, 32, 24, 255));
        this.createGroundBand('ground_band_mid', 0, -2, 1060, 86, new Color(62, 52, 38, 235));
        this.createGroundBand('ground_band_front', 0, 8, 1000, 54, new Color(96, 80, 54, 220));

        const tileY = 10;
        const startX = -460;
        const gap = 112;
        for (let i = 0; i < 9; i++) {
            this.createImageNode(this.groundLayer, `ground_tile_${i}`, [this.texturePath.groundTile], startX + i * gap, tileY, 110, 56, '', 0);
        }

        const gateX = this.path.length > 0 ? this.path[this.path.length - 1].x : 400;
        this.createImageNode(this.groundLayer, 'ground_tile_gate_1', [this.texturePath.groundTile], gateX - 58, tileY, 110, 56, '', 0);
        this.createImageNode(this.groundLayer, 'ground_tile_gate_2', [this.texturePath.groundTile], gateX + 54, tileY, 110, 56, '', 0);
        this.createGroundShadow('gate_shadow', gateX, 0, 220, 36, new Color(0, 0, 0, 95));
    }

    private createGroundBand(name: string, x: number, y: number, w: number, h: number, color: Color) {
        if (!this.groundLayer) return;
        const node = new Node(name);
        this.groundLayer.addChild(node);
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(w, h);
        const g = node.addComponent(Graphics);
        g.fillColor = color;
        g.roundRect(-w / 2, -h / 2, w, h, 18);
        g.fill();
    }

    private createGroundShadow(name: string, x: number, y: number, w: number, h: number, color: Color) {
        if (!this.groundLayer) return;
        const node = new Node(name);
        this.groundLayer.addChild(node);
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(w, h);
        const g = node.addComponent(Graphics);
        g.fillColor = color;
        g.ellipse(0, 0, w / 2, h / 2);
        g.fill();
    }

    private createGate() {
        const gateX = this.path.length > 0 ? this.path[this.path.length - 1].x : 400;
        const gateY = 74;
        this.createImageNode(this.gateLayer, 'gate', [this.texturePath.gate], gateX, gateY, 220, 158, '城门', 30);
        const label = this.createText(this.uiLayer, 'gate_hp', '城门血量：10/10', gateX, gateY + 125, 26, Color.WHITE);
        this.gateLabel = label.getComponent(Label);
    }

    private createTitle() {
        this.createImageNode(this.uiLayer, 'title_image', [this.texturePath.title], 0, 300, 520, 120, '成语塔防', 34);
    }

    private createHud() {
        this.hudLabel = this.createText(this.uiLayer, 'hud', 'SystemManager v0.8.5.2 ready...', 0, 255, 20, new Color(190, 220, 255, 255)).getComponent(Label);
        this.tipLabel = this.createText(this.uiLayer, 'tip', '', 0, 225, 20, new Color(255, 230, 170, 255)).getComponent(Label);
    }

    private createSlots() {
        const y = -185;
        const gap = 118;
        const startX = -gap * 1.5;
        for (let i = 0; i < 4; i++) {
            const slot = this.createImageNode(this.uiLayer, `slot_${i}`, [this.texturePath.slot], startX + i * gap, y, 92, 92, '', 0);
            this.slots.push({ node: slot, char: '', tile: null });
        }
        this.createText(this.uiLayer, 'slot_tip', '拖动字块到四个成语槽', 0, -132, 20, new Color(180, 205, 230, 255));
    }

    private createCharTiles() {
        const chars = ['万', '箭', '齐', '发', '固', '若', '金', '汤', '画', '地', '为', '牢', '火', '土'];
        const gap = 96;
        const row1Y = -272;
        const row2Y = -348;

        for (let i = 0; i < chars.length; i++) {
            const ch = chars[i];
            const row = i < 5 ? 0 : 1;
            const col = row === 0 ? i : i - 5;
            const x = -gap * 2 + col * gap;
            const y = row === 0 ? row1Y : row2Y;
            this.createTile(ch, i, x, y);
        }
    }

    private createTile(char: string, index: number, x: number, y: number) {
        const node = this.createImageNode(this.uiLayer, `tile_${char}_${index}`, [this.getTileTexture(char)], x, y, 76, 76, char, 32);
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
        if (!tile.dragging || !this.uiLayer) return;
        const uiPos = event.getUILocation();
        const parentUI = this.uiLayer.getComponent(UITransform);
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
            if (d < 70 && d < bestD) {
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

    private createImageNode(parent: Node | null, name: string, resourcePaths: string[], x: number, y: number, w: number, h: number, fallbackText: string, fallbackFontSize: number) {
        const node = new Node(name);
        if (parent) parent.addChild(node);
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(w, h);

        const spriteNode = new Node(`${name}_sprite`);
        node.addChild(spriteNode);
        spriteNode.setPosition(0, 0);
        spriteNode.addComponent(UITransform).setContentSize(w, h);

        this.tryLoadSprite(resourcePaths, 0, spriteNode, w, h, () => {
            this.createFallbackBox(spriteNode, w, h, fallbackText, fallbackFontSize);
        });

        return node;
    }

    private tryLoadSprite(resourcePaths: string[], index: number, spriteNode: Node, w: number, h: number, onFail: () => void) {
        if (index >= resourcePaths.length) {
            onFail();
            return;
        }

        const path = `${resourcePaths[index]}/spriteFrame`;
        resources.load(path, SpriteFrame, (err, spriteFrame) => {
            if (err || !spriteFrame) {
                console.warn(`[ViewSystem v0.8.5.2] texture load failed: ${path}`);
                this.tryLoadSprite(resourcePaths, index + 1, spriteNode, w, h, onFail);
                return;
            }

            if (!spriteNode || !spriteNode.isValid) return;
            let sprite = spriteNode.getComponent(Sprite);
            if (!sprite) sprite = spriteNode.addComponent(Sprite);
            sprite.spriteFrame = spriteFrame;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            const ui = spriteNode.getComponent(UITransform);
            if (ui) ui.setContentSize(w, h);
        });
    }

    private loadSpriteFrameList(paths: string[], done: (frames: SpriteFrame[]) => void) {
        const frames: SpriteFrame[] = new Array(paths.length);
        let remain = paths.length;

        if (paths.length === 0) {
            done([]);
            return;
        }

        paths.forEach((p, index) => {
            resources.load(`${p}/spriteFrame`, SpriteFrame, (err, spriteFrame) => {
                remain--;
                if (!err && spriteFrame) {
                    frames[index] = spriteFrame;
                } else {
                    console.warn(`[ViewSystem v0.8.5.2] walk frame load failed: ${p}/spriteFrame`);
                }

                if (remain <= 0) {
                    done(frames.filter(Boolean));
                }
            });
        });
    }

    private createFallbackBox(parent: Node, w: number, h: number, text: string, fontSize: number) {
        if (!parent || !parent.isValid) return;
        const g = parent.addComponent(Graphics);
        g.fillColor = new Color(70, 75, 95, 255);
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.fill();
        g.strokeColor = new Color(255, 255, 255, 80);
        g.lineWidth = 2;
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.stroke();

        if (text) {
            this.createLabel(parent, `${parent.name}_label`, text, 0, 0, w, h, fontSize, Color.WHITE);
        }
    }

    private createText(parent: Node | null, name: string, text: string, x: number, y: number, size: number, color: Color) {
        const node = new Node(name);
        if (parent) parent.addChild(node);
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(1100, size + 18);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = size + 8;
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
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
        label.lineHeight = fontSize + 8;
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        return node;
    }

    private createFloatingText(text: string, x: number, y: number, color: Color) {
        const node = this.createText(this.effectLayer, `float_${text}`, text, x, y, 34, color);
        tween(node)
            .by(0.6, { position: new Vec3(0, 90, 0) })
            .call(() => node.destroy())
            .start();
    }

    private animateEnemyView(view: EnemyView, enemy: EnemyState) {
        if (!view.sprite || view.frames.length <= 1) return;

        if (enemy.frozenRemain > 0) {
            view.frameIndex = 0;
            view.sprite.spriteFrame = view.frames[0];
            return;
        }

        const now = Date.now();
        const interval = enemy.type === 'cavalry' ? 90 : 125;
        if (now - view.lastFrameTime < interval) return;

        view.lastFrameTime = now;
        view.frameIndex = (view.frameIndex + 1) % view.frames.length;
        view.sprite.spriteFrame = view.frames[view.frameIndex];
    }

    private drawHp(g: Graphics, enemy: EnemyState) {
        const size = this.getEnemyVisualSize(enemy.type);
        const width = Math.min(size.w, 88);
        const ratio = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
        g.clear();
        g.fillColor = enemy.frozenRemain > 0
            ? new Color(120, 220, 255, 255)
            : new Color(80, 230, 120, 255);
        g.rect(-width / 2, -4, width * ratio, 8);
        g.fill();
    }

    private refreshEnemyDepthOrder() {
        if (!this.enemyLayer) return;
        const valid = [...this.enemyViews.values()]
            .filter(v => v.node && v.node.isValid)
            .sort((a, b) => {
                const ay = a.node.position.y;
                const by = b.node.position.y;
                if (ay !== by) return by - ay;
                return a.node.position.x - b.node.position.x;
            });

        for (let i = 0; i < valid.length; i++) {
            valid[i].node.setSiblingIndex(i);
        }
    }

    private getEnemyVisualSize(type: EnemyState['type']): EnemyVisualSize {
        if (type === 'shield') return { w: 88, h: 88, fallback: '盾' };
        if (type === 'cavalry') return { w: 166, h: 132, fallback: '骑' };
        if (type === 'archer') return { w: 92, h: 92, fallback: '弓' };
        return { w: 82, h: 82, fallback: '兵' };
    }

    private getEnemyYOffset(type: EnemyState['type']) {
        if (type === 'cavalry') return 1;
        return 0;
    }

    private getEnemyWalkFramePaths(type: EnemyState['type']) {
        if (type === 'shield') {
            return [
                this.texturePath.enemy_shield_walk_0,
                this.texturePath.enemy_shield_walk_1,
                this.texturePath.enemy_shield_walk_2,
                this.texturePath.enemy_shield_walk_3,
            ];
        }

        if (type === 'cavalry') {
            return [
                this.texturePath.enemy_cavalry_walk_0,
                this.texturePath.enemy_cavalry_walk_1,
                this.texturePath.enemy_cavalry_walk_2,
                this.texturePath.enemy_cavalry_walk_3,
            ];
        }

        if (type === 'archer') {
            return [
                this.texturePath.enemy_archer_walk_0,
                this.texturePath.enemy_archer_walk_1,
                this.texturePath.enemy_archer_walk_2,
                this.texturePath.enemy_archer_walk_3,
            ];
        }

        return [
            this.texturePath.enemy_basic_walk_0,
            this.texturePath.enemy_basic_walk_1,
            this.texturePath.enemy_basic_walk_2,
            this.texturePath.enemy_basic_walk_3,
        ];
    }

    private getEnemyTexturePaths(type: EnemyState['type']) {
        if (type === 'shield') return [this.texturePath.enemy_shield_soldier, this.texturePath.enemy_basic_soldier, this.texturePath.enemy_bing_fallback];
        if (type === 'cavalry') return [this.texturePath.enemy_cavalry, this.texturePath.enemy_basic_soldier, this.texturePath.enemy_bing_fallback];
        if (type === 'archer') return [this.texturePath.enemy_archer, this.texturePath.enemy_basic_soldier, this.texturePath.enemy_bing_fallback];
        return [this.texturePath.enemy_basic_soldier, this.texturePath.enemy_bing_fallback];
    }

    private getTileTexture(char: string) {
        const map: Record<string, string> = {
            '万': this.texturePath.tile_wan,
            '箭': this.texturePath.tile_jian,
            '齐': this.texturePath.tile_qi,
            '发': this.texturePath.tile_fa,
            '固': this.texturePath.tile_gu,
            '若': this.texturePath.tile_ruo,
            '金': this.texturePath.tile_jin,
            '汤': this.texturePath.tile_tang,
            '画': this.texturePath.tile_hua,
            '地': this.texturePath.tile_di,
            '为': this.texturePath.tile_wei,
            '牢': this.texturePath.tile_lao,
            '火': this.texturePath.tile_huo,
            '土': this.texturePath.tile_tu,
        };
        return map[char] || this.texturePath.tile_wan;
    }
}
