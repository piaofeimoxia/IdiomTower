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

    private readonly totalEnemies = 18;

    private gateHpLabel: Label | null = null;
    private waveLabel: Label | null = null;
    private tipLabel: Label | null = null;

    private canvasW = 1280;
    private canvasH = 720;

    private basicWalkFrames: SpriteFrame[] = [];
    private shieldWalkFrames: SpriteFrame[] = [];

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

        effect_arrow_rain: 'textures/effect_arrow_rain',
        effect_blue_shield: 'textures/effect_blue_shield',
        fail_popup: 'textures/ui_fail_popup',

        env_stone_path_tile: 'textures/env_stone_path_tile',

        enemy_basic_soldier: 'textures/enemy_basic_soldier',
        enemy_shield_soldier: 'textures/enemy_shield_soldier',
        enemy_bing_fallback: 'textures/enemy_bing',

        enemy_basic_walk_0: 'textures/enemy_basic_walk_0',
        enemy_basic_walk_1: 'textures/enemy_basic_walk_1',
        enemy_basic_walk_2: 'textures/enemy_basic_walk_2',
        enemy_basic_walk_3: 'textures/enemy_basic_walk_3',

        enemy_shield_walk_0: 'textures/enemy_shield_walk_0',
        enemy_shield_walk_1: 'textures/enemy_shield_walk_1',
        enemy_shield_walk_2: 'textures/enemy_shield_walk_2',
        enemy_shield_walk_3: 'textures/enemy_shield_walk_3',
    };

    onLoad() {
        console.log('成语塔防 Demo v0.2.13 启动：普通兵走路优化版');
        GameManager.inst = this;
        this.readCanvasSize();
        this.preloadWalkFrames();
        this.setupScene();
    }

    update(dt: number) {
        if (this.gameOver || !this.waveRunning) return;

        // 行走帧未预加载完成前不刷怪，避免第一批敌人没有动画。
        if (!this.walkFramesReady) return;

        this.spawnTimer += dt;
        if (this.spawnedCount < this.totalEnemies && this.spawnTimer >= 1.08) {
            this.spawnTimer = 0;
            this.spawnEnemy();
        }

        if (this.spawnedCount >= this.totalEnemies && this.enemies.length <= 0) {
            this.showResult('守城成功！点击重新开始', true);
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
            if (doneCount >= 2) {
                this.walkFramesReady = true;
                this.createTip('v0.2.13：盾兵保留当前步态，普通兵改为更顺眼的往返步态');
                console.log(`走路帧加载完成：basic=${this.basicWalkFrames.length}, shield=${this.shieldWalkFrames.length}`);
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

        this.createTitle();
        this.createGroundScene();
        this.createGate();
        this.createSlots();
        this.createCharTiles();

        if (this.walkFramesReady) {
            this.createTip('v0.2.13：只重点优化普通小兵走路自然度');
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
            '敌人：0/' + this.totalEnemies,
            -this.canvasW / 2 + 160,
            topY - 58,
            24,
            Color.WHITE
        ).getComponent(Label);
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

    private getGateHpText() {
        if (this.gateShield > 0) return `城门血量：${this.gateHp}  护盾：${this.gateShield}`;
        return `城门血量：${this.gateHp}`;
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

        const chars = ['万', '箭', '齐', '发', '固', '若', '金', '汤', '火', '土'];
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
        const current = this.slots.map(s => s.char).join('');
        if (current === '万箭齐发') this.releaseWanJianQiFa();
        else if (current === '固若金汤') this.releaseGuRuoJinTang();
    }

    private releaseWanJianQiFa() {
        this.createFloatingText('万箭齐发！', 0, 90, new Color(255, 240, 120, 255));
        this.createTip('成语释放：万箭齐发，全屏清怪');

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

        this.clearSlotsAndRespawnTiles();
    }

    private releaseGuRuoJinTang() {
        this.gateShield += 5;
        this.refreshGateHpLabel();

        this.createFloatingText('固若金汤！', this.getGateX(), 135, new Color(120, 220, 255, 255));
        this.createTip('成语释放：固若金汤，城门获得 5 点护盾');

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

        this.clearSlotsAndRespawnTiles();
    }

    private clearSlotsAndRespawnTiles() {
        for (const slot of this.slots) {
            if (slot.tile && slot.tile.node && slot.tile.node.isValid) slot.tile.node.destroy();
            slot.char = '';
            slot.tile = null;
        }
        this.scheduleOnce(() => this.createCharTiles(), 0.3);
    }

    private spawnEnemy() {
        const startX = -this.canvasW / 2 + 120;
        const lanes = [-22, -6, 10, 26, 42];
        const y = lanes[Math.floor(Math.random() * lanes.length)];

        const isShieldEnemy = this.spawnedCount > 0 && this.spawnedCount % 5 === 0;
        const enemyName = isShieldEnemy ? 'enemy_shield' : 'enemy_basic';

        let enemyNode: Node;
        let spriteRoot: Node | null = null;
        let frameNodes: Node[] = [];

        if (isShieldEnemy && this.shieldWalkFrames.length >= 2) {
            const data = this.createAnimatedEnemyNode(`${enemyName}_${this.spawnedCount}`, this.shieldWalkFrames, startX, y, 88, 88);
            enemyNode = data.node;
            spriteRoot = data.spriteRoot;
            frameNodes = data.frames;
        } else if (!isShieldEnemy && this.basicWalkFrames.length >= 2) {
            const data = this.createAnimatedEnemyNode(`${enemyName}_${this.spawnedCount}`, this.basicWalkFrames, startX, y, 82, 82);
            enemyNode = data.node;
            spriteRoot = data.spriteRoot;
            frameNodes = data.frames;
        } else {
            enemyNode = this.createImageNode(
                `${enemyName}_${this.spawnedCount}`,
                isShieldEnemy
                    ? [this.texturePath.enemy_shield_soldier, this.texturePath.enemy_basic_soldier]
                    : [this.texturePath.enemy_basic_soldier, this.texturePath.enemy_bing_fallback],
                startX,
                y,
                isShieldEnemy ? 88 : 82,
                isShieldEnemy ? 88 : 82,
                '兵',
                28
            );
        }

        const enemy = enemyNode.addComponent(Enemy);

        if (frameNodes.length > 0 && spriteRoot) {
            enemy.setAnimatedNodes(spriteRoot, frameNodes, 4, isShieldEnemy ? 'shield' : 'basic');
        }

        if (isShieldEnemy) enemy.init(34 + Math.random() * 8, 3, 1, this.getEnemyHitX());
        else enemy.init(45 + Math.random() * 18, 1, 1, this.getEnemyHitX());

        this.enemies.push(enemy);
        this.spawnedCount++;

        if (this.waveLabel) this.waveLabel.string = `敌人：${this.spawnedCount}/${this.totalEnemies}`;
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
        if (this.gateHp <= 0) this.showResult('城门被破！点击重新开始', false);
    }

    private showResult(msg: string, success: boolean) {
        if (this.gameOver) return;
        this.gameOver = true;

        let panel: Node;
        if (!success) {
            panel = this.createImageNode('result', [this.texturePath.fail_popup], 0, 0, 560, 220, msg, 32);
        } else {
            panel = this.createBox('result', 0, 0, 560, 185, new Color(40, 45, 55, 240), '', 34);
            this.createText('result_text', msg, 0, 0, 34, new Color(255, 240, 180, 255));
        }

        panel.on(Node.EventType.TOUCH_END, () => this.restart(), this);
        panel.on(Node.EventType.MOUSE_UP, () => this.restart(), this);
    }

    private restart() {
        this.gateHp = 12;
        this.gateShield = 0;
        this.spawnedCount = 0;
        this.killedCount = 0;
        this.spawnTimer = 0;
        this.enemies = [];
        this.gameOver = false;
        this.waveRunning = true;
        this.readCanvasSize();
        this.setupScene();
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
