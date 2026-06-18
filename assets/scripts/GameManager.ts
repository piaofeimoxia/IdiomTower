import {
    _decorator,
    Component,
    Node,
    Label,
    UITransform,
    Vec3,
    Color,
    Graphics,
    tween,
    resources,
    SpriteFrame,
    Sprite,
} from 'cc';
import { CharTile } from './CharTile';
import { Enemy } from './Enemy';

const { ccclass } = _decorator;

type SlotData = {
    node: Node;
    char: string;
    tile: CharTile | null;
};

type AnimatedEnemyNode = {
    node: Node;
    spriteRoot: Node;
    frames: Node[];
};

type EnemyKind = 'basic' | 'shield' | 'cavalry';

@ccclass('GameManager')
export class GameManager extends Component {
    public static inst: GameManager;

    private slots: SlotData[] = [];
    private enemies: Enemy[] = [];

    private gateHp = 12;
    private gateShield = 0;

    private spawnedCount = 0;
    private killedCount = 0;
    private spawnTimer = 0;
    private waveRunning = true;
    private gameOver = false;
    private walkFramesReady = false;
    private lastCavalryAlertSpawn = -999;

    private wanJianCooldownRemain = 0;
    private guRuoCooldownRemain = 0;
    private huaDiCooldownRemain = 0;
    private readonly wanJianCooldown = 5.0;
    private readonly guRuoCooldown = 4.0;
    private readonly huaDiCooldown = 6.0;
    private readonly huaDiFreezeSeconds = 3.0;
    private tileRefreshing = false;

    private gateHpRewardBonus = 0;
    private shieldRewardBonus = 0;
    private wanJianCooldownReduce = 0;
    private cageFreezeBonus = 0;
    private rewardChoiceLocked = false;

    private currentLevelIndex = 0;

    private readonly levelConfigs = [
        {
            name: '第 1 关',
            desc: '教学关：只出现普通士兵，节奏更慢，方便熟悉拖字块',
            totalEnemies: 10,
            gateHp: 14,
            spawnInterval: 1.35,
            shieldEvery: 0,
            cavalryEvery: 0,
        },
        {
            name: '第 2 关',
            desc: '压力关：加入盾兵，敌人数量提升，但节奏仍可控',
            totalEnemies: 15,
            gateHp: 13,
            spawnInterval: 1.16,
            shieldEvery: 4,
            cavalryEvery: 0,
        },
        {
            name: '第 3 关',
            desc: '挑战关：盾兵和骑兵同时出现，节奏更快',
            totalEnemies: 21,
            gateHp: 12,
            spawnInterval: 0.98,
            shieldEvery: 4,
            cavalryEvery: 5,
        },
    ];

    private get currentLevel() {
        return this.levelConfigs[this.currentLevelIndex];
    }

    private gateHpLabel: Label | null = null;
    private waveLabel: Label | null = null;
    private tipLabel: Label | null = null;
    private rewardStatusLabel: Label | null = null;

    private canvasW = 1280;
    private canvasH = 720;

    private basicWalkFrames: SpriteFrame[] = [];
    private shieldWalkFrames: SpriteFrame[] = [];
    private cavalryWalkFrames: SpriteFrame[] = [];

    /**
     * 所有 PNG 统一放在：
     * assets/resources/textures/
     */
    private readonly texturePath: Record<string, string> = {
        title: 'textures/ui_title',
        gate: 'textures/gate',
        slot: 'textures/slot_empty',

        tile_wan: 'textures/tile_wan',
        tile_jian: 'textures/tile_jian',
        tile_qi: 'textures/tile_qi',
        tile_fa: 'textures/tile_fa',

        tile_gu: 'textures/tile_gu',
        tile_ruo: 'textures/tile_ruo',
        tile_jin: 'textures/tile_jin',
        tile_tang: 'textures/tile_tang',

        tile_huo: 'textures/tile_huo',
        tile_tu: 'textures/tile_tu',

        tile_hua: 'textures/tile_hua',
        tile_di: 'textures/tile_di',
        tile_wei: 'textures/tile_wei',
        tile_lao: 'textures/tile_lao',

        effect_arrow_rain: 'textures/effect_arrow_rain',
        effect_blue_shield: 'textures/effect_blue_shield',
        fail_popup: 'textures/ui_fail_popup',

        env_stone_path_tile: 'textures/env_stone_path_tile',

        enemy_basic_soldier: 'textures/enemy_basic_soldier',
        enemy_shield_soldier: 'textures/enemy_shield_soldier',
        enemy_cavalry: 'textures/enemy_cavalry',
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
    };

    onLoad() {
        console.log('成语塔防 Demo v0.4.7 启动：画地为牢奖励联动版');
        GameManager.inst = this;
        this.readCanvasSize();
        this.preloadWalkFrames();
        this.setupScene();
    }

    update(dt: number) {
        if (this.wanJianCooldownRemain > 0) this.wanJianCooldownRemain = Math.max(0, this.wanJianCooldownRemain - dt);
        if (this.guRuoCooldownRemain > 0) this.guRuoCooldownRemain = Math.max(0, this.guRuoCooldownRemain - dt);
        if (this.huaDiCooldownRemain > 0) this.huaDiCooldownRemain = Math.max(0, this.huaDiCooldownRemain - dt);

        if (this.gameOver || !this.waveRunning) return;

        // 行走帧未预加载完成前不刷怪，避免第一批敌人没有动画。
        if (!this.walkFramesReady) return;

        this.spawnTimer += dt;
        if (this.spawnedCount < this.currentLevel.totalEnemies && this.spawnTimer >= this.currentLevel.spawnInterval) {
            this.spawnTimer = 0;
            this.spawnEnemy();
        }

        if (this.spawnedCount >= this.currentLevel.totalEnemies && this.enemies.length <= 0) {
            this.showResult('守城成功！', true);
        }
    }

    private readCanvasSize() {
        const ui = this.node.getComponent(UITransform);
        if (ui) {
            this.canvasW = ui.width;
            this.canvasH = ui.height;
        }
        console.log(`Canvas size = ${this.canvasW} x ${this.canvasH}`);
    }

    private preloadWalkFrames() {
        let doneCount = 0;
        const doneOne = () => {
            doneCount++;
            if (doneCount >= 3) {
                this.walkFramesReady = true;
                if (this.currentLevelIndex === 2) {
                    this.createTip('第 3 关：骑兵更频繁，优先用「万箭齐发」清场');
                } else {
                    this.createTip(`${this.currentLevel.name}：${this.currentLevel.desc}`);
                }
                console.log(`走路帧加载完成：basic=${this.basicWalkFrames.length}, shield=${this.shieldWalkFrames.length}, cavalry=${this.cavalryWalkFrames.length}`);
            }
        };

        this.loadSpriteFrameList(
            [
                this.texturePath.enemy_basic_walk_0,
                this.texturePath.enemy_basic_walk_1,
                this.texturePath.enemy_basic_walk_2,
                this.texturePath.enemy_basic_walk_3,
            ],
            frames => {
                this.basicWalkFrames = frames;
                doneOne();
            }
        );

        this.loadSpriteFrameList(
            [
                this.texturePath.enemy_shield_walk_0,
                this.texturePath.enemy_shield_walk_1,
                this.texturePath.enemy_shield_walk_2,
                this.texturePath.enemy_shield_walk_3,
            ],
            frames => {
                this.shieldWalkFrames = frames;
                doneOne();
            }
        );

        this.loadSpriteFrameList(
            [
                this.texturePath.enemy_cavalry_walk_0,
                this.texturePath.enemy_cavalry_walk_1,
                this.texturePath.enemy_cavalry_walk_2,
                this.texturePath.enemy_cavalry_walk_3,
            ],
            frames => {
                this.cavalryWalkFrames = frames;
                doneOne();
            }
        );
    }

    private loadSpriteFrameList(paths: string[], done: (frames: SpriteFrame[]) => void) {
        const frames: SpriteFrame[] = new Array(paths.length);
        let remain = paths.length;

        paths.forEach((p, index) => {
            resources.load(`${p}/spriteFrame`, SpriteFrame, (err, spriteFrame) => {
                remain--;

                if (!err && spriteFrame) {
                    frames[index] = spriteFrame;
                } else {
                    console.warn(`预加载走路帧失败：${p}/spriteFrame`);
                }

                if (remain <= 0) {
                    done(frames.filter(Boolean));
                }
            });
        });
    }

    private setupScene() {
        this.clearChildren();

        this.slots = [];
        this.enemies = [];
        this.tipLabel = null;
        this.gateHpLabel = null;
        this.waveLabel = null;
        this.rewardStatusLabel = null;
        this.gateHp = this.getLevelGateHp();
        this.gateShield = 0;
        this.tileRefreshing = false;

        this.createTitle();
        this.createLevelSelectButtons();
        this.createRewardStatusBar();
        this.createGroundScene();
        this.createGate();
        this.createSlots();
        this.createCharTiles();

        if (this.walkFramesReady) {
            if (this.currentLevelIndex === 2) {
                this.createTip('第 3 关：骑兵更频繁，优先用「万箭齐发」清场');
            } else {
                this.createTip(`${this.currentLevel.name}：${this.currentLevel.desc}`);
            }
        } else {
            this.createTip('正在加载走路动画帧...');
        }
    }

    private clearChildren() {
        for (const child of [...this.node.children]) {
            if (child.name === 'Camera') continue;
            child.destroy();
        }
    }

    private createTitle() {
        const topY = this.canvasH / 2 - 70;

        this.createImageNode(
            'title_image',
            [this.texturePath.title],
            0,
            topY + 10,
            Math.min(520, this.canvasW - 120),
            120,
            '成语塔防',
            34
        );

        this.waveLabel = this.createText(
            'wave',
            `${this.currentLevel.name}  敌人：0/${this.currentLevel.totalEnemies}`,
            -this.canvasW / 2 + 205,
            topY - 58,
            24,
            Color.WHITE
        ).getComponent(Label);
    }



    private createRewardStatusBar() {
        const topY = this.canvasH / 2 - 158;
        const text = this.getRewardStatusText();
        const color = this.hasAnyReward()
            ? new Color(255, 230, 160, 255)
            : new Color(160, 180, 195, 255);

        this.rewardStatusLabel = this.createText(
            'reward_status',
            text,
            0,
            topY,
            19,
            color
        ).getComponent(Label);
    }

    private refreshRewardStatusBar() {
        if (!this.rewardStatusLabel || !this.rewardStatusLabel.node.isValid) return;
        this.rewardStatusLabel.string = this.getRewardStatusText();
        this.rewardStatusLabel.color = this.hasAnyReward()
            ? new Color(255, 230, 160, 255)
            : new Color(160, 180, 195, 255);
    }

    private hasAnyReward() {
        return this.gateHpRewardBonus > 0 || this.shieldRewardBonus > 0 || this.wanJianCooldownReduce > 0 || this.cageFreezeBonus > 0;
    }

    private getRewardStatusText() {
        if (!this.hasAnyReward()) return '强化：暂无';

        const parts: string[] = [];
        if (this.gateHpRewardBonus > 0) parts.push(`城门+${this.gateHpRewardBonus}`);
        if (this.shieldRewardBonus > 0) parts.push(`护盾+${this.shieldRewardBonus}`);
        if (this.wanJianCooldownReduce > 0) parts.push(`箭雨-${this.wanJianCooldownReduce}s`);
        if (this.cageFreezeBonus > 0) parts.push(`牢笼+${this.cageFreezeBonus}s`);
        return `强化：${parts.join('｜')}`;
    }

    private getFinalRewardSummary() {
        if (!this.hasAnyReward()) return '无';

        const parts: string[] = [];
        if (this.gateHpRewardBonus > 0) parts.push(`城门修复 +${this.gateHpRewardBonus}`);
        if (this.shieldRewardBonus > 0) parts.push(`护盾强化 +${this.shieldRewardBonus}`);
        if (this.wanJianCooldownReduce > 0) parts.push(`箭雨冷却 -${this.wanJianCooldownReduce}秒`);
        if (this.cageFreezeBonus > 0) parts.push(`牢笼定身 +${this.cageFreezeBonus}秒`);
        return parts.join('，');
    }

    private createLevelSelectButtons() {
        const topY = this.canvasH / 2 - 122;
        const startX = -this.canvasW / 2 + 130;
        const gap = 122;

        for (let i = 0; i < this.levelConfigs.length; i++) {
            const selected = i === this.currentLevelIndex;
            const btn = this.createBox(
                `level_btn_${i + 1}`,
                startX + i * gap,
                topY,
                106,
                36,
                selected ? new Color(92, 78, 45, 235) : new Color(38, 45, 58, 215),
                `第${i + 1}关`,
                18
            );

            btn.on(Node.EventType.TOUCH_END, () => this.selectLevel(i), this);
            btn.on(Node.EventType.MOUSE_UP, () => this.selectLevel(i), this);
        }
    }

    private selectLevel(index: number) {
        if (index < 0 || index >= this.levelConfigs.length) return;
        this.currentLevelIndex = index;
        this.resetRunRewards();
        this.restartCurrentLevel();
    }

    private createGroundScene() {
        const centerY = 8;

        this.createGroundBand('ground_band_back', 0, centerY - 18, this.canvasW - 160, 118, new Color(35, 32, 24, 255));
        this.createGroundBand('ground_band_mid', 0, centerY - 10, this.canvasW - 220, 86, new Color(62, 52, 38, 235));
        this.createGroundBand('ground_band_front', 0, centerY, this.canvasW - 280, 54, new Color(96, 80, 54, 220));

        const tileY = centerY + 2;
        const startX = -this.canvasW / 2 + 180;
        const gap = 112;

        for (let i = 0; i < 9; i++) {
            this.createImageNode(
                `ground_tile_${i}`,
                [this.texturePath.env_stone_path_tile],
                startX + i * gap,
                tileY,
                110,
                56,
                '',
                0
            );
        }

        const gateX = this.getGateX();
        this.createImageNode('ground_tile_gate_1', [this.texturePath.env_stone_path_tile], gateX - 58, tileY, 110, 56, '', 0);
        this.createImageNode('ground_tile_gate_2', [this.texturePath.env_stone_path_tile], gateX + 54, tileY, 110, 56, '', 0);

        this.createGroundShadow('gate_shadow', gateX, 0, 220, 36, new Color(0, 0, 0, 95));
    }

    private createGroundBand(name: string, x: number, y: number, w: number, h: number, color: Color) {
        const node = new Node(name);
        node.parent = this.node;
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(w, h);

        const g = node.addComponent(Graphics);
        g.fillColor = color;
        g.roundRect(-w / 2, -h / 2, w, h, 18);
        g.fill();
    }

    private createGroundShadow(name: string, x: number, y: number, w: number, h: number, color: Color) {
        const node = new Node(name);
        node.parent = this.node;
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(w, h);

        const g = node.addComponent(Graphics);
        g.fillColor = color;
        g.ellipse(0, 0, w / 2, h / 2);
        g.fill();
    }

    private createGate() {
        const gateX = this.getGateX();
        const gateY = 74;

        this.createImageNode(
            'gate',
            [this.texturePath.gate],
            gateX,
            gateY,
            220,
            158,
            '城门',
            30
        );

        this.gateHpLabel = this.createText(
            'gateHp',
            this.getGateHpText(),
            gateX,
            gateY + 125,
            26,
            Color.WHITE
        ).getComponent(Label);
    }

    private getGateX() {
        return this.canvasW / 2 - 240;
    }

    private getEnemyHitX() {
        return this.getGateX() - 120;
    }

    private getLevelGateHp() {
        return this.currentLevel.gateHp + this.gateHpRewardBonus;
    }

    private getHuaDiFreezeSeconds() {
        return this.huaDiFreezeSeconds + this.cageFreezeBonus;
    }

    private getWanJianCooldown() {
        return Math.max(3, this.wanJianCooldown - this.wanJianCooldownReduce);
    }

    private resetRunRewards() {
        this.gateHpRewardBonus = 0;
        this.shieldRewardBonus = 0;
        this.wanJianCooldownReduce = 0;
        this.cageFreezeBonus = 0;
        this.rewardChoiceLocked = false;
    }

    private getGateHpText() {
        const hpBonusText = this.gateHpRewardBonus > 0 ? `(+${this.gateHpRewardBonus})` : '';
        if (this.gateShield > 0) return `城门血量：${this.gateHp}${hpBonusText}  护盾：${this.gateShield}`;
        return `城门血量：${this.gateHp}${hpBonusText}`;
    }

    private refreshGateHpLabel() {
        if (this.gateHpLabel) this.gateHpLabel.string = this.getGateHpText();
    }

    private createSlots() {
        this.slots = [];
        const y = -this.canvasH / 2 + 175;
        const gap = 118;
        const startX = -gap * 1.5;

        for (let i = 0; i < 4; i++) {
            const slot = this.createImageNode(
                `slot_${i}`,
                [this.texturePath.slot],
                startX + i * gap,
                y,
                92,
                92,
                '',
                30
            );

            this.slots.push({ node: slot, char: '', tile: null });
        }
    }

    private createCharTiles() {
        for (const child of [...this.node.children]) {
            if (child.name.startsWith('tile_')) child.destroy();
        }

        const chars = ['万', '箭', '齐', '发', '固', '若', '金', '汤', '画', '地', '为', '牢', '火', '土'];
        const pathMap: Record<string, string> = {
            '万': this.texturePath.tile_wan,
            '箭': this.texturePath.tile_jian,
            '齐': this.texturePath.tile_qi,
            '发': this.texturePath.tile_fa,
            '固': this.texturePath.tile_gu,
            '若': this.texturePath.tile_ruo,
            '金': this.texturePath.tile_jin,
            '汤': this.texturePath.tile_tang,
            '火': this.texturePath.tile_huo,
            '土': this.texturePath.tile_tu,
            '画': this.texturePath.tile_hua,
            '地': this.texturePath.tile_di,
            '为': this.texturePath.tile_wei,
            '牢': this.texturePath.tile_lao,
        };

        const gap = 96;
        const row1Y = -this.canvasH / 2 + 88;
        const row2Y = -this.canvasH / 2 + 12;

        for (let i = 0; i < chars.length; i++) {
            const ch = chars[i];
            const row = i < 5 ? 0 : 1;
            const col = row === 0 ? i : i - 5;
            const x = -gap * 2 + col * gap;
            const y = row === 0 ? row1Y : row2Y;

            const tileNode = this.createImageNode(
                `tile_${ch}_${i}`,
                [pathMap[ch]],
                x,
                y,
                76,
                76,
                ch,
                32
            );

            const tile = tileNode.addComponent(CharTile);
            tile.init(ch, tileNode.position.clone());
        }
    }

    public tryPlaceTile(tile: CharTile): boolean {
        if (this.gameOver) return false;

        let targetIndex = -1;
        let bestDistance = 99999;
        const tilePos = tile.node.position;

        for (let i = 0; i < this.slots.length; i++) {
            const slot = this.slots[i];
            const d = Vec3.distance(tilePos, slot.node.position);
            if (d < 70 && d < bestDistance) {
                targetIndex = i;
                bestDistance = d;
            }
        }

        if (targetIndex < 0) return false;

        const targetSlot = this.slots[targetIndex];
        if (targetSlot.tile && targetSlot.tile !== tile) return false;

        if (tile.slotIndex >= 0 && this.slots[tile.slotIndex]) {
            this.slots[tile.slotIndex].tile = null;
            this.slots[tile.slotIndex].char = '';
        }

        targetSlot.tile = tile;
        targetSlot.char = tile.char;
        tile.lockToSlot(targetIndex, targetSlot.node.position.clone());

        this.checkIdiom();
        return true;
    }

    private checkIdiom() {
        if (this.tileRefreshing || this.gameOver) return;

        const current = this.slots.map(s => s.char).join('');
        if (current === '万箭齐发') {
            if (!this.canUseSkill('wanjian')) return;
            this.releaseWanJianQiFa();
        } else if (current === '固若金汤') {
            if (!this.canUseSkill('guruo')) return;
            this.releaseGuRuoJinTang();
        } else if (current === '画地为牢') {
            if (!this.canUseSkill('huadi')) return;
            this.releaseHuaDiWeiLao();
        }
    }

    private canUseSkill(skill: 'wanjian' | 'guruo' | 'huadi'): boolean {
        const remain = skill === 'wanjian'
            ? this.wanJianCooldownRemain
            : skill === 'guruo'
                ? this.guRuoCooldownRemain
                : this.huaDiCooldownRemain;
        const name = skill === 'wanjian'
            ? '万箭齐发'
            : skill === 'guruo'
                ? '固若金汤'
                : '画地为牢';

        if (remain > 0.05) {
            this.createTip(`${name}冷却中：还需 ${Math.ceil(remain)} 秒，已清空成语`);
            this.createFloatingText('冷却中', 0, 110, new Color(170, 210, 255, 255));
            this.clearSlotsAndRespawnTiles(0.45, false);
            return false;
        }

        return true;
    }

    private releaseWanJianQiFa() {
        this.wanJianCooldownRemain = this.getWanJianCooldown();

        this.createFloatingText('万箭齐发！', 0, 90, new Color(255, 240, 120, 255));
        this.createTip(`成语释放：万箭齐发，全屏清怪，冷却 ${this.getWanJianCooldown()} 秒`);

        const effect = this.createImageNode(
            'effect_arrow_rain',
            [this.texturePath.effect_arrow_rain],
            0,
            35,
            260,
            195,
            '',
            0
        );

        tween(effect)
            .to(0.16, { scale: new Vec3(1.15, 1.15, 1) })
            .to(0.16, { scale: new Vec3(1, 1, 1) })
            .delay(0.22)
            .call(() => effect.destroy())
            .start();

        tween(this.node)
            .by(0.04, { position: new Vec3(8, 0, 0) })
            .by(0.04, { position: new Vec3(-16, 0, 0) })
            .by(0.04, { position: new Vec3(8, 0, 0) })
            .start();

        for (const enemy of [...this.enemies]) {
            if (enemy && enemy.node && enemy.node.isValid) enemy.takeDamage(9999);
        }

        this.clearSlotsAndRespawnTiles(0.65);
    }

    private releaseGuRuoJinTang() {
        this.guRuoCooldownRemain = this.guRuoCooldown;

        const shieldAmount = 5 + this.shieldRewardBonus;
        this.gateShield += shieldAmount;
        this.refreshGateHpLabel();

        this.createFloatingText('固若金汤！', this.getGateX(), 135, new Color(120, 220, 255, 255));
        this.createTip(`成语释放：固若金汤，城门获得 ${shieldAmount} 点护盾，冷却 ${this.guRuoCooldown} 秒`);

        const effect = this.createImageNode(
            'effect_blue_shield',
            [this.texturePath.effect_blue_shield],
            this.getGateX(),
            85,
            150,
            150,
            '',
            0
        );

        tween(effect)
            .to(0.18, { scale: new Vec3(1.18, 1.18, 1) })
            .to(0.18, { scale: new Vec3(1, 1, 1) })
            .delay(0.55)
            .call(() => effect.destroy())
            .start();

        this.clearSlotsAndRespawnTiles(0.55);
    }

    private releaseHuaDiWeiLao() {
        this.huaDiCooldownRemain = this.huaDiCooldown;

        const freezeSeconds = this.getHuaDiFreezeSeconds();

        this.createFloatingText('画地为牢！', 0, 95, new Color(145, 220, 255, 255));
        this.createTip(`成语释放：画地为牢，敌人定身 ${freezeSeconds} 秒，冷却 ${this.huaDiCooldown} 秒`);

        this.createFreezeFieldEffect();

        for (const enemy of [...this.enemies]) {
            if (enemy && enemy.node && enemy.node.isValid) {
                enemy.freeze(freezeSeconds);
            }
        }

        this.clearSlotsAndRespawnTiles(0.60);
    }

    private createFreezeFieldEffect() {
        const field = new Node('freeze_field');
        field.parent = this.node;
        field.setPosition(0, 8);
        field.addComponent(UITransform).setContentSize(this.canvasW - 240, 88);

        const g = field.addComponent(Graphics);
        g.fillColor = new Color(90, 170, 255, 58);
        g.roundRect(-(this.canvasW - 240) / 2, -44, this.canvasW - 240, 88, 24);
        g.fill();
        g.strokeColor = new Color(150, 220, 255, 150);
        g.lineWidth = 3;
        g.roundRect(-(this.canvasW - 240) / 2, -44, this.canvasW - 240, 88, 24);
        g.stroke();

        tween(field)
            .to(0.14, { scale: new Vec3(1.03, 1.12, 1) })
            .to(0.16, { scale: new Vec3(1, 1, 1) })
            .delay(0.85)
            .to(0.18, { scale: new Vec3(0.92, 0.92, 1) })
            .call(() => field.destroy())
            .start();
    }

    private clearSlotsAndRespawnTiles(delay = 0.55, showRefreshTip = true) {
        if (this.tileRefreshing) return;
        this.tileRefreshing = true;

        for (const slot of this.slots) {
            if (slot.tile && slot.tile.node && slot.tile.node.isValid) slot.tile.node.destroy();
            slot.char = '';
            slot.tile = null;
        }

        if (showRefreshTip) this.createTip('字块刷新中...');
        this.scheduleOnce(() => {
            this.createCharTiles();
            this.tileRefreshing = false;
            if (!this.gameOver && showRefreshTip) this.createTip('新字块已刷新');
        }, delay);
    }

    private pickEnemyKind(): EnemyKind {
        const level = this.currentLevel;
        const orderNo = this.spawnedCount + 1;

        // 第 3 关开始解锁骑兵，优先级高于盾兵
        if (level.cavalryEvery > 0 && orderNo % level.cavalryEvery === 0) {
            return 'cavalry';
        }

        // 第 2 关开始解锁盾兵
        if (level.shieldEvery > 0 && orderNo % level.shieldEvery === 0) {
            return 'shield';
        }

        return 'basic';
    }

    private spawnEnemy() {
        const startX = -this.canvasW / 2 + 120;
        const lanes = [-22, -6, 10, 26, 42];
        const y = lanes[Math.floor(Math.random() * lanes.length)];

        const kind = this.pickEnemyKind();
        const enemyName = `enemy_${kind}`;

        if (kind === 'cavalry') {
            this.showCavalryAlert();
        }

        let enemyNode: Node;
        let spriteRoot: Node | null = null;
        let frameNodes: Node[] = [];

        if (kind === 'shield' && this.shieldWalkFrames.length >= 2) {
            const data = this.createAnimatedEnemyNode(`${enemyName}_${this.spawnedCount}`, this.shieldWalkFrames, startX, y, 88, 88);
            enemyNode = data.node;
            spriteRoot = data.spriteRoot;
            frameNodes = data.frames;
        } else if (kind === 'basic' && this.basicWalkFrames.length >= 2) {
            const data = this.createAnimatedEnemyNode(`${enemyName}_${this.spawnedCount}`, this.basicWalkFrames, startX, y, 82, 82);
            enemyNode = data.node;
            spriteRoot = data.spriteRoot;
            frameNodes = data.frames;
        } else if (kind === 'cavalry' && this.cavalryWalkFrames.length >= 2) {
            const data = this.createAnimatedEnemyNode(`${enemyName}_${this.spawnedCount}`, this.cavalryWalkFrames, startX, y + 1, 166, 132);
            enemyNode = data.node;
            spriteRoot = data.spriteRoot;
            frameNodes = data.frames;
        } else if (kind === 'cavalry') {
            enemyNode = this.createImageNode(
                `${enemyName}_${this.spawnedCount}`,
                [this.texturePath.enemy_cavalry, this.texturePath.enemy_basic_soldier, this.texturePath.enemy_bing_fallback],
                startX,
                y + 1,
                166,
                132,
                '骑',
                28
            );
        } else {
            enemyNode = this.createImageNode(
                `${enemyName}_${this.spawnedCount}`,
                kind === 'shield'
                    ? [this.texturePath.enemy_shield_soldier, this.texturePath.enemy_basic_soldier]
                    : [this.texturePath.enemy_basic_soldier, this.texturePath.enemy_bing_fallback],
                startX,
                y,
                kind === 'shield' ? 88 : 82,
                kind === 'shield' ? 88 : 82,
                '兵',
                28
            );
        }

        const enemy = enemyNode.addComponent(Enemy);

        if (frameNodes.length > 0 && spriteRoot) {
            const motionType = kind === 'shield' ? 'shield' : kind === 'cavalry' ? 'cavalry' : 'basic';
            enemy.setAnimatedNodes(spriteRoot, frameNodes, 4, motionType);
        }

        if (kind === 'shield') {
            // 盾兵：第 2 关开始出现，速度慢、血量高，用来逼玩家释放技能。
            const shieldSpeed = this.currentLevelIndex >= 2 ? 38 + Math.random() * 7 : 32 + Math.random() * 6;
            const shieldHp = this.currentLevelIndex >= 2 ? 4 : 3;
            enemy.init(shieldSpeed, shieldHp, 1, this.getEnemyHitX());
        } else if (kind === 'cavalry') {
            // 骑兵：第 3 关压迫型敌人，速度快但血量低。
            enemy.init(64 + Math.random() * 8, 1, 1, this.getEnemyHitX());
        } else {
            // 普通兵：随关卡略微加速，第 1 关保持教学友好。
            const basicSpeed = this.currentLevelIndex === 0
                ? 38 + Math.random() * 10
                : this.currentLevelIndex === 1
                    ? 44 + Math.random() * 12
                    : 50 + Math.random() * 14;
            enemy.init(basicSpeed, 1, 1, this.getEnemyHitX());
        }

        this.enemies.push(enemy);
        this.spawnedCount++;

        if (this.waveLabel) {
            this.waveLabel.string = `${this.currentLevel.name}  敌人：${this.spawnedCount}/${this.currentLevel.totalEnemies}`;
        }
    }

    private createAnimatedEnemyNode(name: string, frames: SpriteFrame[], x: number, y: number, w: number, h: number): AnimatedEnemyNode {
        const node = new Node(name);
        node.parent = this.node;
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(w, h);

        const spriteRoot = new Node(`${name}_sprite_root`);
        spriteRoot.parent = node;
        spriteRoot.setPosition(0, 0, 0);
        spriteRoot.addComponent(UITransform).setContentSize(w, h);

        const frameNodes: Node[] = [];

        for (let i = 0; i < frames.length; i++) {
            const frameNode = new Node(`${name}_frame_${i}`);
            frameNode.parent = spriteRoot;
            frameNode.setPosition(0, 0);
            frameNode.addComponent(UITransform).setContentSize(w, h);

            const sprite = frameNode.addComponent(Sprite);
            sprite.spriteFrame = frames[i];
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;

            frameNode.active = i === 0;
            frameNodes.push(frameNode);
        }

        return { node, spriteRoot, frames: frameNodes };
    }

    public removeEnemy(enemy: Enemy, killed: boolean) {
        const idx = this.enemies.indexOf(enemy);
        if (idx >= 0) this.enemies.splice(idx, 1);
        if (killed) this.killedCount++;
    }

    public enemyHitGate(enemy: Enemy) {
        if (this.gameOver) return;

        const damage = enemy.damage || 1;
        this.removeEnemy(enemy, false);
        enemy.node.destroy();

        if (this.gateShield > 0) {
            const absorb = Math.min(this.gateShield, damage);
            this.gateShield -= absorb;
            const remain = damage - absorb;
            if (remain > 0) this.gateHp -= remain;
            this.createTip(`护盾抵挡了 ${absorb} 点伤害`);
        } else {
            this.gateHp -= damage;
        }

        this.refreshGateHpLabel();

        if (this.gateHp <= 4) this.createTip('城门危急！快拼成语救场');
        if (this.gateHp <= 0) this.showResult('城门被破！', false);
    }


    public showEnemyHitFeedback(x: number, y: number, damage: number, killed: boolean) {
        const color = killed ? new Color(255, 220, 110, 255) : new Color(255, 245, 220, 255);
        const text = killed ? '击破' : `-${damage}`;
        this.createFloatingText(text, x, y + 50, color);

        if (killed) {
            this.createHitBurst(x, y + 24, new Color(255, 190, 90, 220), 46);
        } else {
            this.createHitBurst(x, y + 22, new Color(255, 255, 255, 145), 26);
        }
    }

    private createHitBurst(x: number, y: number, color: Color, size: number) {
        const node = new Node('hit_burst');
        node.parent = this.node;
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(size, size);

        const g = node.addComponent(Graphics);
        g.fillColor = color;
        g.circle(0, 0, size / 2);
        g.fill();

        tween(node)
            .to(0.10, { scale: new Vec3(1.25, 1.25, 1) })
            .to(0.12, { scale: new Vec3(0.1, 0.1, 1) })
            .call(() => node.destroy())
            .start();
    }

    private showCavalryAlert() {
        // 骑兵每隔一段刷怪再提示，避免连续刷屏。
        if (this.spawnedCount - this.lastCavalryAlertSpawn < 3) return;
        this.lastCavalryAlertSpawn = this.spawnedCount;

        const y = this.canvasH / 2 - 182;
        const banner = this.createBox('cavalry_alert_banner', 0, y, 320, 48, new Color(130, 54, 42, 235), '骑兵来袭！', 26);

        this.createTip('骑兵速度更快，优先用「万箭齐发」清场');

        tween(banner)
            .to(0.08, { scale: new Vec3(1.12, 1.12, 1) })
            .to(0.10, { scale: new Vec3(1, 1, 1) })
            .delay(0.75)
            .to(0.16, { scale: new Vec3(0.85, 0.85, 1) })
            .call(() => banner.destroy())
            .start();

        tween(this.node)
            .by(0.035, { position: new Vec3(5, 0, 0) })
            .by(0.035, { position: new Vec3(-10, 0, 0) })
            .by(0.035, { position: new Vec3(5, 0, 0) })
            .start();
    }

    private showResult(msg: string, success: boolean) {
        if (this.gameOver) return;

        this.gameOver = true;
        this.waveRunning = false;

        const isLastLevel = this.currentLevelIndex >= this.levelConfigs.length - 1;

        if (success && !isLastLevel) {
            this.showRewardChoice();
            return;
        }

        const title = success ? `${this.currentLevel.name} 胜利！` : '守城失败';
        const subTitle = success
            ? '全部关卡已通关，可以从第1关重开或返回选关'
            : '城门被破，可以重玩本关或返回选关';

        this.createBox(
            'result_panel',
            0,
            8,
            720,
            success ? 290 : 270,
            success ? new Color(42, 54, 65, 245) : new Color(58, 44, 48, 245),
            '',
            28
        );

        this.createText(
            'result_title',
            success ? title : `${msg} ${title}`,
            0,
            success ? 82 : 82,
            34,
            success ? new Color(255, 236, 170, 255) : new Color(255, 185, 185, 255)
        );

        this.createText(
            'result_subtitle',
            subTitle,
            0,
            success ? 38 : 38,
            22,
            new Color(220, 230, 240, 255)
        );

        if (success) {
            this.createText(
                'result_reward_status',
                `本局强化：${this.getFinalRewardSummary()}`,
                0,
                -16,
                20,
                this.hasAnyReward() ? new Color(255, 230, 160, 255) : new Color(180, 200, 215, 255)
            );
            this.createResultButton('result_restart_btn', '从第1关开始', -130, -76, 210, 54, () => this.restartFromFirstLevel(), new Color(72, 112, 78, 245));
            this.createResultButton('result_select_btn', '返回选关', 130, -76, 210, 54, () => this.returnToLevelSelect(), new Color(82, 72, 106, 240));
        } else {
            this.createResultButton('result_retry_btn', '重玩本关', -120, -52, 190, 56, () => this.restartCurrentLevel(), new Color(112, 78, 72, 245));
            this.createResultButton('result_select_btn', '返回选关', 120, -52, 190, 56, () => this.returnToLevelSelect(), new Color(72, 82, 100, 240));
        }
    }

    private showRewardChoice() {
        this.rewardChoiceLocked = false;
        this.createBox('reward_panel', 0, 0, 780, 360, new Color(38, 48, 60, 248), '', 26);

        this.createText(
            'reward_title',
            `${this.currentLevel.name} 胜利！选择一个奖励进入下一关`,
            0,
            132,
            30,
            new Color(255, 236, 170, 255)
        );

        this.createText(
            'reward_subtitle',
            '四选三随机出现，奖励会在后续关卡生效',
            0,
            96,
            20,
            new Color(190, 220, 235, 255)
        );

        const rewardCards = [
            {
                name: 'reward_gate',
                title: '城门修复',
                desc: '后续关卡城门血量 +3',
                pick: () => {
                    this.gateHpRewardBonus += 3;
                    this.showRewardPickedFeedback('已选择：城门修复', '后续关卡城门血量 +3');
                }
            },
            {
                name: 'reward_shield',
                title: '护盾强化',
                desc: '固若金汤护盾 +2',
                pick: () => {
                    this.shieldRewardBonus += 2;
                    this.showRewardPickedFeedback('已选择：护盾强化', '固若金汤护盾 +2');
                }
            },
            {
                name: 'reward_arrow',
                title: '箭雨强化',
                desc: '万箭齐发冷却 -1秒',
                pick: () => {
                    this.wanJianCooldownReduce = Math.min(2, this.wanJianCooldownReduce + 1);
                    this.showRewardPickedFeedback('已选择：箭雨强化', '万箭齐发冷却 -1 秒');
                }
            },
            {
                name: 'reward_cage',
                title: '牢笼强化',
                desc: '画地为牢定身 +1秒',
                pick: () => {
                    this.cageFreezeBonus += 1;
                    this.showRewardPickedFeedback('已选择：牢笼强化', '画地为牢定身 +1 秒');
                }
            }
        ];

        for (let i = rewardCards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = rewardCards[i];
            rewardCards[i] = rewardCards[j];
            rewardCards[j] = temp;
        }

        const xList = [-245, 0, 245];
        const selectedCards = rewardCards.slice(0, 3);

        for (let i = 0; i < selectedCards.length; i++) {
            const card = selectedCards[i];
            this.createRewardCard(
                card.name,
                xList[i],
                -18,
                card.title,
                card.desc,
                () => {
                    if (this.rewardChoiceLocked) return;
                    this.rewardChoiceLocked = true;
                    card.pick();
                    this.refreshRewardStatusBar();
                }
            );
        }

        this.createResultButton('reward_retry_btn', '重玩本关', -120, -154, 180, 46, () => this.restartCurrentLevel(), new Color(72, 82, 100, 235));
        this.createResultButton('reward_select_btn', '返回选关', 120, -154, 180, 46, () => this.returnToLevelSelect(), new Color(82, 72, 106, 235));
    }


    private showRewardPickedFeedback(title: string, desc: string) {
        const panel = this.createBox('reward_picked_panel', 0, 0, 520, 170, new Color(48, 62, 72, 248), '', 24);

        this.createText(
            'reward_picked_title',
            title,
            0,
            36,
            28,
            new Color(255, 236, 170, 255)
        );

        this.createText(
            'reward_picked_desc',
            desc,
            0,
            0,
            21,
            new Color(210, 235, 245, 255)
        );

        this.createText(
            'reward_picked_next',
            '即将进入下一关...',
            0,
            -44,
            18,
            new Color(170, 205, 220, 255)
        );

        tween(panel)
            .to(0.10, { scale: new Vec3(1.05, 1.05, 1) })
            .to(0.10, { scale: new Vec3(1, 1, 1) })
            .delay(0.55)
            .call(() => this.goNextLevel())
            .start();
    }

    private createRewardCard(name: string, x: number, y: number, title: string, desc: string, onClick: () => void) {
        const card = this.createBox(name, x, y, 210, 140, new Color(58, 72, 88, 245), '', 22);

        this.createText(`${name}_title`, title, x, y + 34, 26, new Color(255, 236, 170, 255));
        this.createText(`${name}_desc`, desc, x, y - 8, 19, new Color(220, 232, 240, 255));
        this.createText(`${name}_hint`, '点击选择', x, y - 48, 17, new Color(160, 210, 255, 255));

        card.on(Node.EventType.TOUCH_END, onClick, this);
        card.on(Node.EventType.MOUSE_UP, onClick, this);
        return card;
    }

    private createResultButton(
        name: string,
        text: string,
        x: number,
        y: number,
        w: number,
        h: number,
        onClick: () => void,
        color: Color
    ) {
        const btn = this.createBox(name, x, y, w, h, color, text, 22);
        btn.on(Node.EventType.TOUCH_END, onClick, this);
        btn.on(Node.EventType.MOUSE_UP, onClick, this);
        return btn;
    }

    private restartCurrentLevel() {
        this.gateHp = this.getLevelGateHp();
        this.gateShield = 0;
        this.tileRefreshing = false;
        this.spawnedCount = 0;
        this.killedCount = 0;
        this.spawnTimer = 0;
        this.lastCavalryAlertSpawn = -999;
        this.wanJianCooldownRemain = 0;
        this.guRuoCooldownRemain = 0;
        this.huaDiCooldownRemain = 0;
        this.tileRefreshing = false;
        this.enemies = [];
        this.gameOver = false;
        this.waveRunning = true;
        this.readCanvasSize();
        this.setupScene();
    }

    private restartFromFirstLevel() {
        this.currentLevelIndex = 0;
        this.resetRunRewards();
        this.restartCurrentLevel();
    }

    private goNextLevel() {
        this.rewardChoiceLocked = false;
        if (this.currentLevelIndex < this.levelConfigs.length - 1) {
            this.currentLevelIndex++;
        } else {
            this.currentLevelIndex = 0;
        }

        this.restartCurrentLevel();
    }

    private returnToLevelSelect() {
        this.resetRunRewards();
        this.gateHp = this.getLevelGateHp();
        this.gateShield = 0;
        this.tileRefreshing = false;
        this.spawnedCount = 0;
        this.killedCount = 0;
        this.spawnTimer = 0;
        this.lastCavalryAlertSpawn = -999;
        this.wanJianCooldownRemain = 0;
        this.guRuoCooldownRemain = 0;
        this.huaDiCooldownRemain = 0;
        this.tileRefreshing = false;
        this.enemies = [];
        this.gameOver = false;
        this.waveRunning = false;
        this.readCanvasSize();
        this.setupScene();
        this.createTip('请选择关卡：点击上方「第1关 / 第2关 / 第3关」开始');
        if (this.waveLabel) {
            this.waveLabel.string = '选关模式  点击上方关卡按钮开始';
        }
    }

    private createTip(text: string) {
        const y = -this.canvasH / 2 + 275;
        if (!this.tipLabel || !this.tipLabel.node.isValid) {
            this.tipLabel = this.createText('tip', text, 0, y, 23, new Color(180, 230, 255, 255)).getComponent(Label);
        } else {
            this.tipLabel.string = text;
            this.tipLabel.node.setPosition(0, y);
        }
    }

    private createFloatingText(text: string, x: number, y: number, color: Color) {
        const node = this.createText('floating', text, x, y, 48, color);
        tween(node)
            .by(0.6, { position: new Vec3(0, 90, 0) })
            .call(() => node.destroy())
            .start();
    }

    private createText(name: string, text: string, x: number, y: number, size: number, color: Color): Node {
        const node = new Node(name);
        node.parent = this.node;
        node.setPosition(x, y);

        const ui = node.addComponent(UITransform);
        ui.setContentSize(this.canvasW, size + 18);

        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = size + 8;
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        return node;
    }

    private createImageNode(
        name: string,
        resourcePaths: string[],
        x: number,
        y: number,
        w: number,
        h: number,
        fallbackText: string,
        fallbackFontSize: number
    ): Node {
        const node = new Node(name);
        node.parent = this.node;
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(w, h);

        const spriteNode = new Node(`${name}_sprite`);
        spriteNode.parent = node;
        spriteNode.setPosition(0, 0);
        spriteNode.addComponent(UITransform).setContentSize(w, h);

        this.tryLoadSprite(resourcePaths, 0, spriteNode, w, h, () => {
            this.createFallbackBox(spriteNode, w, h, fallbackText, fallbackFontSize);
        });

        return node;
    }

    private tryLoadSprite(
        resourcePaths: string[],
        index: number,
        spriteNode: Node,
        w: number,
        h: number,
        onFail: () => void
    ) {
        if (index >= resourcePaths.length) {
            onFail();
            return;
        }

        const path = `${resourcePaths[index]}/spriteFrame`;
        resources.load(path, SpriteFrame, (err, spriteFrame) => {
            if (err || !spriteFrame) {
                console.warn(`加载图片失败：${path}`);
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

    private createFallbackBox(parent: Node, w: number, h: number, text: string, fontSize: number) {
        const g = parent.addComponent(Graphics);
        g.fillColor = new Color(70, 75, 95, 255);
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.fill();
        g.strokeColor = new Color(255, 255, 255, 80);
        g.lineWidth = 2;
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.stroke();

        if (text) {
            const labelNode = new Node(`${parent.name}_label`);
            labelNode.parent = parent;
            labelNode.setPosition(0, 0);
            labelNode.addComponent(UITransform).setContentSize(w, h);

            const label = labelNode.addComponent(Label);
            label.string = text;
            label.fontSize = fontSize;
            label.lineHeight = fontSize + 8;
            label.color = Color.WHITE;
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
        }
    }

    private createBox(name: string, x: number, y: number, w: number, h: number, color: Color, text: string, fontSize: number): Node {
        const node = new Node(name);
        node.parent = this.node;
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(w, h);

        const bgNode = new Node(`${name}_bg`);
        bgNode.parent = node;
        bgNode.setPosition(0, 0);
        bgNode.addComponent(UITransform).setContentSize(w, h);

        const g = bgNode.addComponent(Graphics);
        g.fillColor = color;
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.fill();
        g.strokeColor = new Color(255, 255, 255, 80);
        g.lineWidth = 2;
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.stroke();

        if (text) {
            const labelNode = new Node(`${name}_label`);
            labelNode.parent = node;
            labelNode.setPosition(0, 0);
            labelNode.addComponent(UITransform).setContentSize(w, h);

            const label = labelNode.addComponent(Label);
            label.string = text;
            label.fontSize = fontSize;
            label.lineHeight = fontSize + 8;
            label.color = Color.WHITE;
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
        }

        return node;
    }
}
