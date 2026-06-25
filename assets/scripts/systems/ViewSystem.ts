import { Node, UITransform, Color, Graphics, Vec3, Label, EventTouch, tween, resources, SpriteFrame, Sprite } from 'cc';
import type { DamageResult, EnemyState, EnemyRemovedReason } from './EnemySystem';
import type { RogueliteRewardOption, RewardRarity } from '../core/RewardTypes';
import { RewardSelection } from '../core/RewardSelection';
import type { RunSummary } from '../core/RunSummary';

export type PathPoint = Vec3;

type EnemyMotionType = 'basic' | 'shield' | 'cavalry' | 'archer';

type EnemyView = {
    node: Node;
    spriteRoot: Node | null;
    frameNodes: Node[];
    fallbackRoot: Node | null;
    hpFill: Graphics;
    shadowNode: Node | null;
    seqIndex: number;
    animTimer: number;
    motionType: EnemyMotionType;
};

type SlotView = { node: Node; char: string; tile: TileView | null };
type TileView = { node: Node; char: string; homePos: Vec3; slotIndex: number; dragging: boolean };
type EnemyVisualSize = { w: number; h: number; fallback: string };

/**
 * ViewSystem v0.8.5.3
 *
 * 修复重点：
 * - 严格恢复旧版 GameManager + Enemy 的动画播放方式。
 * - 不再用一个 Sprite 反复替换 spriteFrame。
 * - 改为旧版的多个 frame node，通过 active 切换帧。
 * - 普通兵恢复旧版 [0,1,2,1] 序列，避开第 3 帧，避免头部忽大忽小。
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
    private rewardRoot: Node | null = null;
    private failRoot: Node | null = null;

    public onIdiomComplete: ((idiom: string) => void) | null = null;

    private readonly basicSequence = [0, 1, 2, 1];
    private readonly basicDurations = [0.20, 0.10, 0.20, 0.10];
    private readonly shieldSequence = [0, 1, 2, 3];
    private readonly shieldDurations = [0.18, 0.10, 0.18, 0.10];
    private readonly cavalrySequence = [0, 1, 2, 3];
    private readonly cavalryDurations = [0.16, 0.12, 0.16, 0.12];
    private readonly archerWalkSequence = [0, 1, 2, 3];
    private readonly archerWalkDurations = [0.18, 0.10, 0.18, 0.10];

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
        this.showTip('v0.8.5.3：恢复旧版帧序列，修复走动时头部忽大忽小');

        console.log('[ViewSystem v0.8.5.3] initialized');
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
        const motionType = this.getEnemyMotionType(enemy.type);
        const node = new Node(`enemy_${enemy.type}_${enemy.id}`);
        this.enemyLayer.addChild(node);
        node.setPosition(enemy.position.x, enemy.position.y + this.getEnemyYOffset(enemy.type));
        node.addComponent(UITransform).setContentSize(size.w, size.h);

        const shadowNode = this.createEnemyShadow(node, motionType);

        const spriteRoot = new Node(`${node.name}_sprite_root`);
        node.addChild(spriteRoot);
        spriteRoot.setPosition(0, 0, 0);
        spriteRoot.addComponent(UITransform).setContentSize(size.w, size.h);

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
            spriteRoot,
            frameNodes: [],
            fallbackRoot: null,
            hpFill,
            shadowNode,
            seqIndex: motionType === 'archer' ? 0 : Math.floor(Math.random() * this.getSequence(motionType).length),
            animTimer: 0,
            motionType,
        };
        this.enemyViews.set(enemy.id, view);

        this.loadSpriteFrameList(this.getEnemyWalkFramePaths(enemy.type), frames => {
            if (!node.isValid || !spriteRoot.isValid) return;

            if (frames.length > 0) {
                view.frameNodes = this.appendAnimatedFrames(spriteRoot, node.name, frames, size.w, size.h);
                this.applyFramePose(view, enemy);
                console.log(`[ViewSystem v0.8.5.3] walk frame nodes loaded: ${enemy.type}, count=${frames.length}`);
            } else {
                const fallback = this.createImageNode(spriteRoot, `${node.name}_fallback`, this.getEnemyTexturePaths(enemy.type), 0, 0, size.w, size.h, size.fallback, 28);
                view.fallbackRoot = fallback;
            }
        });

        this.updateEnemy(enemy);
        this.refreshEnemyDepthOrder();
        console.log(`[ViewSystem v0.8.5.3] enemy created: #${enemy.id} ${enemy.type}`);
    }

    public updateEnemy(enemy: EnemyState) {
        const view = this.enemyViews.get(enemy.id);
        if (!view || !view.node.isValid) return;
        view.node.setPosition(enemy.position.x, enemy.position.y + this.getEnemyYOffset(enemy.type));
        this.updateEnemyAnimation(view, enemy);
        this.drawHp(view.hpFill, enemy);
        this.refreshEnemyDepthOrder();
    }

    public removeEnemy(enemy: EnemyState, reason: EnemyRemovedReason) {
        const view = this.enemyViews.get(enemy.id);
        if (!view) return;
        this.enemyViews.delete(enemy.id);
        if (view.node.isValid) view.node.destroy();
        console.log(`[ViewSystem v0.8.5.3] enemy removed: #${enemy.id}, reason=${reason}`);
    }

    public showArrowRainEffect() {
        const effect = this.createImageNode(this.effectLayer, 'effect_arrow_rain', [this.texturePath.effect_arrow_rain], 0, 35, 260, 195, '', 0);
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
        const effect = this.createImageNode(this.effectLayer, 'effect_blue_shield', [this.texturePath.effect_blue_shield], gateX, 85, 150, 150, '', 0);
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

    public showRewardChoices(
        options: RogueliteRewardOption[],
        pickCount: number,
        onComplete: (selected: RogueliteRewardOption[]) => void,
    ) {
        const parent = this.effectLayer ?? this.uiLayer;
        if (!parent || !parent.isValid) return;

        if (this.rewardRoot && this.rewardRoot.isValid) this.rewardRoot.destroy();
        const root = new Node('reward_cancelable_pick_root');
        parent.addChild(root);
        root.addComponent(UITransform).setContentSize(1280, 720);
        this.rewardRoot = root;

        this.createPanel(root, 'reward_backdrop', 0, 0, 930, 456, new Color(18, 24, 34, 250), new Color(150, 180, 215, 145), 20);
        this.createSizedText(root, 'reward_title', `升级奖励：${options.length} 选 ${pickCount}`, 0, 184, 830, 42, 32, new Color(255, 236, 170, 255));
        const statusNode = this.createSizedText(
            root,
            'reward_status',
            `已选 0/${pickCount}，点击已选卡片可取消`,
            0,
            150,
            830,
            30,
            20,
            new Color(190, 220, 240, 255),
        );
        const statusLabel = statusNode.getComponent(Label)!;
        const positions = [
            new Vec3(-290, 60, 0),
            new Vec3(0, 60, 0),
            new Vec3(290, 60, 0),
            new Vec3(-145, -112, 0),
            new Vec3(145, -112, 0),
        ];
        const selection = new RewardSelection<RogueliteRewardOption>(pickCount, option => option.id);
        const overlays = new Map<string, Node[]>();
        let completed = false;

        const confirm = this.createPanel(root, 'confirm_btn', 0, -198, 190, 48, new Color(62, 68, 78, 245), new Color(150, 165, 185, 150), 14);
        const confirmText = this.createSizedText(confirm, 'confirm_text', `先选择 ${pickCount} 个`, 0, 0, 170, 30, 22, new Color(170, 180, 192, 255));
        const confirmLabel = confirmText.getComponent(Label)!;

        const refreshStatus = () => {
            const count = selection.values().length;
            if (selection.canConfirm()) {
                this.setSizedLabel(statusLabel, `已选 ${count}/${pickCount}，可确认；点击已选卡片可取消`, 20, new Color(255, 232, 170, 255));
                this.setSizedLabel(confirmLabel, '确认选择', 22, Color.WHITE);
            } else {
                this.setSizedLabel(statusLabel, `已选 ${count}/${pickCount}，点击已选卡片可取消`, 20, new Color(190, 220, 240, 255));
                this.setSizedLabel(confirmLabel, `先选择 ${pickCount} 个`, 22, new Color(170, 180, 192, 255));
            }
        };

        const rarityName: Record<RewardRarity, string> = {
            common: '普通',
            rare: '稀有',
            epic: '史诗',
            gold: '金色',
        };
        const rarityColor: Record<RewardRarity, Color> = {
            common: new Color(230, 232, 224, 255),
            rare: new Color(110, 190, 255, 255),
            epic: new Color(198, 135, 255, 255),
            gold: new Color(255, 214, 86, 255),
        };
        const rarityPanelColor: Record<RewardRarity, Color> = {
            common: new Color(52, 58, 66, 252),
            rare: new Color(30, 62, 104, 252),
            epic: new Color(70, 42, 102, 252),
            gold: new Color(118, 78, 28, 252),
        };

        for (let i = 0; i < Math.min(5, options.length); i++) {
            const option = options[i];
            const pos = positions[i];
            const card = this.createPanel(root, `reward_card_${i}`, pos.x, pos.y, 220, 142, rarityPanelColor[option.rarity], rarityColor[option.rarity], 16);
            this.createSizedText(card, `rarity_${i}`, rarityName[option.rarity], 0, 48, 184, 22, 16, rarityColor[option.rarity]);
            this.createSizedText(card, `title_${i}`, option.title, 0, 14, 186, 40, 22, Color.WHITE);
            this.createSizedText(card, `desc_${i}`, option.desc, 0, -36, 186, 48, 15, new Color(220, 232, 240, 255));

            const toggle = () => {
                if (completed) return;
                const result = selection.toggle(option);
                if (result === 'full') {
                    this.setSizedLabel(statusLabel, `已经选满 ${pickCount} 个，先取消一个再换`, 20, new Color(255, 190, 150, 255));
                    return;
                }
                if (result === 'unselected') {
                    for (const node of overlays.get(option.id) ?? []) {
                        if (node.isValid) node.destroy();
                    }
                    overlays.delete(option.id);
                    refreshStatus();
                    return;
                }

                const badge = this.createPanel(card, `selected_badge_${i}`, 0, 0, 218, 140, new Color(255, 236, 160, 38), new Color(255, 238, 150, 230), 16);
                const selectedText = this.createSizedText(card, `selected_text_${i}`, '已选择 / 再点取消', 0, -62, 180, 22, 16, new Color(255, 240, 160, 255));
                overlays.set(option.id, [badge, selectedText]);
                tween(card).to(0.08, { scale: new Vec3(1.04, 1.04, 1) }).to(0.08, { scale: new Vec3(1, 1, 1) }).start();
                refreshStatus();
            };

            card.on(Node.EventType.TOUCH_END, toggle, this);
            card.on(Node.EventType.MOUSE_UP, toggle, this);
        }

        const confirmAction = () => {
            if (completed) return;
            const selected = selection.confirm();
            if (!selected) {
                this.setSizedLabel(statusLabel, `还需要再选 ${pickCount - selection.values().length} 个奖励`, 20, new Color(255, 190, 150, 255));
                return;
            }
            completed = true;
            if (this.rewardRoot && this.rewardRoot.isValid) this.rewardRoot.destroy();
            this.rewardRoot = null;
            onComplete(selected);
        };
        confirm.on(Node.EventType.TOUCH_END, confirmAction, this);
        confirm.on(Node.EventType.MOUSE_UP, confirmAction, this);
    }

    public showBaiBuPierceEffect(results: DamageResult[]) {
        const parent = this.effectLayer ?? this.uiLayer;
        if (!parent || !parent.isValid || results.length <= 0) return;

        const root = new Node('baibu_pierce_effect');
        parent.addChild(root);
        root.addComponent(UITransform).setContentSize(1280, 720);
        const xs = results.map(result => result.enemy.position.x);
        const ys = results.map(result => result.enemy.position.y + 28);
        const minX = Math.min(...xs) - 38;
        const maxX = Math.max(...xs) + 56;
        const y = ys.reduce((sum, value) => sum + value, 0) / ys.length;

        const line = new Node('pierce_line');
        root.addChild(line);
        line.addComponent(UITransform).setContentSize(1280, 720);
        const graphics = line.addComponent(Graphics);
        graphics.strokeColor = new Color(255, 232, 130, 230);
        graphics.lineWidth = 8;
        graphics.moveTo(minX, y);
        graphics.lineTo(maxX, y + 8);
        graphics.stroke();
        graphics.strokeColor = new Color(255, 255, 245, 220);
        graphics.lineWidth = 3;
        graphics.moveTo(minX + 8, y + 2);
        graphics.lineTo(maxX - 8, y + 10);
        graphics.stroke();

        for (const result of results) {
            const burst = new Node('pierce_burst');
            root.addChild(burst);
            burst.setPosition(result.enemy.position.x, result.enemy.position.y + 28, 0);
            burst.addComponent(UITransform).setContentSize(46, 46);
            const burstGraphics = burst.addComponent(Graphics);
            burstGraphics.fillColor = result.killed ? new Color(255, 200, 85, 210) : new Color(255, 245, 170, 170);
            burstGraphics.circle(0, 0, result.killed ? 23 : 16);
            burstGraphics.fill();
            tween(burst).to(0.10, { scale: new Vec3(1.25, 1.25, 1) }).to(0.16, { scale: new Vec3(0.2, 0.2, 1) }).start();
        }

        this.createSizedText(
            root,
            'pierce_text',
            results.length >= 2 ? `百步穿杨 · 贯穿 x${results.length}` : '百步穿杨！',
            0,
            112,
            620,
            40,
            30,
            new Color(255, 236, 145, 255),
        );
        tween(root).delay(0.46).call(() => root.destroy()).start();
    }

    public showRunFailedPanel(summary: RunSummary, onRetry: () => void, onRevive?: () => void) {
        const parent = this.effectLayer ?? this.uiLayer;
        if (!parent || !parent.isValid) return;

        if (this.failRoot && this.failRoot.isValid) this.failRoot.destroy();
        const root = new Node('run_failed_root');
        parent.addChild(root);
        root.addComponent(UITransform).setContentSize(1280, 720);
        this.failRoot = root;

        this.createPanel(root, 'fail_panel', 0, 8, 620, 300, new Color(34, 28, 32, 250), new Color(255, 150, 130, 170), 20);
        this.createSizedText(root, 'fail_title', '城门被破', 0, 100, 540, 48, 36, new Color(255, 190, 170, 255));
        this.createSizedText(root, 'fail_reason', summary.reason ?? '守城失败', 0, 54, 540, 36, 21, new Color(230, 220, 210, 255));
        this.createSizedText(
            root,
            'fail_stat',
            `击杀：${summary.killCount}    等级：Lv.${summary.rogueLevel ?? 1}`,
            0,
            15,
            540,
            30,
            22,
            new Color(255, 232, 170, 255),
        );
        this.createSizedText(root, 'fail_hint', '失败后战斗已暂停', 0, -28, 540, 30, 18, new Color(190, 210, 225, 255));

        const retryX = onRevive ? 110 : 0;
        const retry = this.createPanel(root, 'retry_btn', retryX, -92, 190, 54, new Color(96, 62, 58, 245), new Color(255, 205, 160, 150), 14);
        this.createSizedText(retry, 'retry_text', '重新开始', 0, 0, 170, 34, 24, Color.WHITE);
        const retryAction = () => {
            if (this.failRoot && this.failRoot.isValid) this.failRoot.destroy();
            this.failRoot = null;
            onRetry();
        };
        retry.on(Node.EventType.TOUCH_END, retryAction, this);
        retry.on(Node.EventType.MOUSE_UP, retryAction, this);

        if (onRevive) {
            const revive = this.createPanel(root, 'revive_btn', -110, -92, 190, 54, new Color(48, 82, 104, 245), new Color(150, 220, 255, 170), 14);
            this.createSizedText(revive, 'revive_text', '复活', 0, 0, 170, 34, 24, Color.WHITE);
            const reviveAction = () => {
                if (this.failRoot && this.failRoot.isValid) this.failRoot.destroy();
                this.failRoot = null;
                onRevive();
            };
            revive.on(Node.EventType.TOUCH_END, reviveAction, this);
            revive.on(Node.EventType.MOUSE_UP, reviveAction, this);
        }
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
        this.rewardRoot = null;
        this.failRoot = null;
        this.slots = [];
        this.tiles = [];
    }

    private ensureCanvasSize(root: Node) {
        const ui = root.getComponent(UITransform) || root.addComponent(UITransform);
        if (ui.width <= 0 || ui.height <= 0) ui.setContentSize(1280, 720);
    }

    private recreateViewRoot(root: Node) {
        for (const name of ['VIEW_ROOT_v0_8_5_3', 'VIEW_ROOT_v0_8_5_2', 'VIEW_ROOT_v0_8_5_1', 'VIEW_ROOT_v0_8_5', 'VIEW_ROOT_v0_8_4', 'VIEW_ROOT_v0_8_3_1', 'VIEW_ROOT_v0_8_3', 'VIEW_ROOT_v0_8_2', 'VIEW_ROOT_v0_8_1']) {
            const old = root.getChildByName(name);
            if (old && old.isValid) old.destroy();
        }
        const viewRoot = new Node('VIEW_ROOT_v0_8_5_3');
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
        this.hudLabel = this.createText(this.uiLayer, 'hud', 'SystemManager v0.8.5.3 ready...', 0, 255, 20, new Color(190, 220, 255, 255)).getComponent(Label);
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

    private appendAnimatedFrames(spriteRoot: Node, namePrefix: string, frames: SpriteFrame[], w: number, h: number) {
        const frameNodes: Node[] = [];
        for (let i = 0; i < frames.length; i++) {
            const frameNode = new Node(`${namePrefix}_frame_${i}`);
            spriteRoot.addChild(frameNode);
            frameNode.setPosition(0, 0);
            frameNode.addComponent(UITransform).setContentSize(w, h);
            const sprite = frameNode.addComponent(Sprite);
            sprite.spriteFrame = frames[i];
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            frameNode.active = i === 0;
            frameNodes.push(frameNode);
        }
        return frameNodes;
    }

    private setActiveFrame(view: EnemyView, activeIndex: number) {
        if (view.frameNodes.length <= 0) return;
        const idx = Math.max(0, Math.min(activeIndex, view.frameNodes.length - 1));
        for (let i = 0; i < view.frameNodes.length; i++) {
            const n = view.frameNodes[i];
            if (n && n.isValid) n.active = i === idx;
        }
    }

    private updateEnemyAnimation(view: EnemyView, enemy: EnemyState) {
        if (!view.spriteRoot || view.frameNodes.length <= 0) return;
        const seq = this.getSequence(view.motionType);
        const durations = this.getDurations(view.motionType);

        if (enemy.frozenRemain > 0) {
            view.seqIndex = 0;
            this.applyFramePose(view, enemy);
            return;
        }

        view.animTimer += 1 / 60;
        const duration = durations[view.seqIndex % durations.length] ?? 0.14;
        if (view.animTimer >= duration) {
            view.animTimer = 0;
            view.seqIndex = (view.seqIndex + 1) % seq.length;
        }
        this.applyFramePose(view, enemy);
    }

    private applyFramePose(view: EnemyView, enemy: EnemyState) {
        const seq = this.getSequence(view.motionType);
        const frameIndex = seq[view.seqIndex % seq.length] ?? 0;
        this.setActiveFrame(view, frameIndex);

        if (view.spriteRoot && view.spriteRoot.isValid) {
            let yOffset = 0;
            let xOffset = 0;
            if (view.motionType === 'cavalry') {
                yOffset = 0;
            } else if (view.motionType === 'archer') {
                yOffset = (frameIndex === 1 || frameIndex === 3) ? 1 : 0;
            } else {
                yOffset = (frameIndex === 1 || frameIndex === 3) ? 1 : 0;
            }
            view.spriteRoot.setPosition(xOffset, yOffset, 0);
        }

        if (view.shadowNode && view.shadowNode.isValid) {
            let scaleX = 1.0;
            if (view.motionType === 'cavalry') {
                scaleX = (frameIndex === 1 || frameIndex === 3) ? 0.97 : 1.02;
            } else if (view.motionType === 'archer') {
                scaleX = (frameIndex === 1 || frameIndex === 3) ? 0.92 : 1.0;
            } else {
                scaleX = (frameIndex === 1 || frameIndex === 3) ? 0.92 : 1.0;
            }
            view.shadowNode.setScale(scaleX, 1, 1);
        }
    }

    private createEnemyShadow(parent: Node, motionType: EnemyMotionType) {
        const shadowNode = new Node('enemy_shadow');
        parent.addChild(shadowNode);
        shadowNode.setSiblingIndex(0);
        const isCavalry = motionType === 'cavalry';
        shadowNode.setPosition(0, isCavalry ? -36 : -24);
        shadowNode.addComponent(UITransform).setContentSize(isCavalry ? 84 : 34, isCavalry ? 18 : 10);
        const g = shadowNode.addComponent(Graphics);
        g.fillColor = new Color(0, 0, 0, 72);
        g.ellipse(0, 0, isCavalry ? 39 : 15, isCavalry ? 8 : 4);
        g.fill();
        return shadowNode;
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
                console.warn(`[ViewSystem v0.8.5.3] texture load failed: ${path}`);
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
                    console.warn(`[ViewSystem v0.8.5.3] walk frame load failed: ${p}/spriteFrame`);
                }
                if (remain <= 0) done(frames.filter(Boolean));
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
        if (text) this.createLabel(parent, `${parent.name}_label`, text, 0, 0, w, h, fontSize, Color.WHITE);
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

    private createPanel(parent: Node, name: string, x: number, y: number, w: number, h: number, color: Color, stroke: Color, radius = 14) {
        const node = new Node(name);
        parent.addChild(node);
        node.setPosition(x, y, 0);
        node.addComponent(UITransform).setContentSize(w, h);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = color;
        graphics.roundRect(-w / 2, -h / 2, w, h, radius);
        graphics.fill();
        graphics.strokeColor = stroke;
        graphics.lineWidth = 2;
        graphics.roundRect(-w / 2, -h / 2, w, h, radius);
        graphics.stroke();
        return node;
    }

    private createSizedText(parent: Node, name: string, text: string, x: number, y: number, w: number, h: number, fontSize: number, color: Color) {
        const node = new Node(name);
        parent.addChild(node);
        node.setPosition(x, y, 0);
        node.addComponent(UITransform).setContentSize(w, h);
        const label = node.addComponent(Label);
        this.setSizedLabel(label, text, fontSize, color);
        return node;
    }

    private setSizedLabel(label: Label, text: string, fontSize: number, color: Color) {
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 7;
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.enableWrapText = true;
        label.overflow = Label.Overflow.SHRINK;
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
        tween(node).by(0.6, { position: new Vec3(0, 90, 0) }).call(() => node.destroy()).start();
    }

    private drawHp(g: Graphics, enemy: EnemyState) {
        const size = this.getEnemyVisualSize(enemy.type);
        const width = Math.min(size.w, 88);
        const ratio = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
        g.clear();
        g.fillColor = enemy.frozenRemain > 0 ? new Color(120, 220, 255, 255) : new Color(80, 230, 120, 255);
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
        for (let i = 0; i < valid.length; i++) valid[i].node.setSiblingIndex(i);
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

    private getEnemyMotionType(type: EnemyState['type']): EnemyMotionType {
        if (type === 'shield') return 'shield';
        if (type === 'cavalry') return 'cavalry';
        if (type === 'archer') return 'archer';
        return 'basic';
    }

    private getSequence(type: EnemyMotionType) {
        if (type === 'shield') return this.shieldSequence;
        if (type === 'cavalry') return this.cavalrySequence;
        if (type === 'archer') return this.archerWalkSequence;
        return this.basicSequence;
    }

    private getDurations(type: EnemyMotionType) {
        if (type === 'shield') return this.shieldDurations;
        if (type === 'cavalry') return this.cavalryDurations;
        if (type === 'archer') return this.archerWalkDurations;
        return this.basicDurations;
    }

    private getEnemyWalkFramePaths(type: EnemyState['type']) {
        if (type === 'shield') return [this.texturePath.enemy_shield_walk_0, this.texturePath.enemy_shield_walk_1, this.texturePath.enemy_shield_walk_2, this.texturePath.enemy_shield_walk_3];
        if (type === 'cavalry') return [this.texturePath.enemy_cavalry_walk_0, this.texturePath.enemy_cavalry_walk_1, this.texturePath.enemy_cavalry_walk_2, this.texturePath.enemy_cavalry_walk_3];
        if (type === 'archer') return [this.texturePath.enemy_archer_walk_0, this.texturePath.enemy_archer_walk_1, this.texturePath.enemy_archer_walk_2, this.texturePath.enemy_archer_walk_3];
        return [this.texturePath.enemy_basic_walk_0, this.texturePath.enemy_basic_walk_1, this.texturePath.enemy_basic_walk_2, this.texturePath.enemy_basic_walk_3];
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
