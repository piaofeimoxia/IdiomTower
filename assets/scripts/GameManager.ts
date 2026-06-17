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

@ccclass('GameManager')
export class GameManager extends Component {
    public static inst: GameManager;

    private slots: SlotData[] = [];
    private enemies: Enemy[] = [];

    private gateHp = 12;
    private spawnedCount = 0;
    private killedCount = 0;
    private spawnTimer = 0;
    private waveRunning = true;
    private gameOver = false;

    private readonly totalEnemies = 16;
    private readonly idiomChars = ['万', '箭', '齐', '发'];

    private gateHpLabel: Label | null = null;
    private waveLabel: Label | null = null;
    private tipLabel: Label | null = null;

    private canvasW = 1280;
    private canvasH = 720;

    /**
     * 资源路径说明：
     * 1. 基础素材请放到：assets/resources/textures/
     *    例如：assets/resources/textures/gate.png
     *
     * 2. 后续扩展素材也统一放到：assets/resources/textures/
     *    例如：assets/resources/textures/enemy_basic_soldier.png
     *
     * Cocos 3.x 代码加载 SpriteFrame 时，路径写法为：
     * resources.load('textures/gate/spriteFrame', SpriteFrame, ...)
     */
    private readonly texturePath: Record<string, string> = {
        title: 'textures/ui_title',
        gate: 'textures/gate',
        slot: 'textures/slot_empty',
        tile_wan: 'textures/tile_wan',
        tile_jian: 'textures/tile_jian',
        tile_qi: 'textures/tile_qi',
        tile_fa: 'textures/tile_fa',
        tile_huo: 'textures/tile_huo',
        tile_tu: 'textures/tile_tu',
        effect_arrow_rain: 'textures/effect_arrow_rain',
        fail_popup: 'textures/ui_fail_popup',

        // 所有素材统一放在 assets/resources/textures/ 下。
        enemy_basic_soldier: 'textures/enemy_basic_soldier',
        enemy_bing_fallback: 'textures/enemy_bing',
    };

    onLoad() {
        console.log('GameManager onLoad 运行了：PNG 资源版');
        GameManager.inst = this;
        this.readCanvasSize();
        this.setupScene();
    }

    update(dt: number) {
        if (this.gameOver || !this.waveRunning) return;

        this.spawnTimer += dt;
        if (this.spawnedCount < this.totalEnemies && this.spawnTimer >= 1.15) {
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

    private setupScene() {
        this.clearChildren();

        this.slots = [];
        this.enemies = [];
        this.tipLabel = null;
        this.gateHpLabel = null;
        this.waveLabel = null;

        this.createTitle();
        this.createGate();
        this.createSlots();
        this.createCharTiles();
        this.createTip('拖动“万 箭 齐 发”到 4 个槽位，释放万箭齐发清屏');
    }

    /**
     * 清空运行时创建的节点，但保留 Canvas 下的 Camera。
     */
    private clearChildren() {
        for (const child of [...this.node.children]) {
            if (child.name === 'Camera') {
                continue;
            }
            child.destroy();
        }
    }

    private createTitle() {
        const topY = this.canvasH / 2 - 70;

        // 标题图片
        this.createImageNode(
            'title_image',
            [this.texturePath.title],
            0,
            topY + 10,
            Math.min(520, this.canvasW - 120),
            120,
            '',
            0
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

    private createGate() {
        const gateX = this.canvasW / 2 - 240;
        const gateY = 70;

        this.createImageNode(
            'gate',
            [this.texturePath.gate],
            gateX,
            gateY,
            210,
            150,
            '城门',
            30
        );

        this.gateHpLabel = this.createText(
            'gateHp',
            `城门血量：${this.gateHp}`,
            gateX,
            gateY + 125,
            26,
            Color.WHITE
        ).getComponent(Label);
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
            if (child.name.startsWith('tile_')) {
                child.destroy();
            }
        }

        const chars = ['万', '箭', '齐', '发', '火', '土'];
        const pathMap: Record<string, string> = {
            '万': this.texturePath.tile_wan,
            '箭': this.texturePath.tile_jian,
            '齐': this.texturePath.tile_qi,
            '发': this.texturePath.tile_fa,
            '火': this.texturePath.tile_huo,
            '土': this.texturePath.tile_tu,
        };

        const y = -this.canvasH / 2 + 72;
        const gap = 102;
        const startX = -gap * 2.5;

        for (let i = 0; i < chars.length; i++) {
            const ch = chars[i];
            const tileNode = this.createImageNode(
                `tile_${ch}_${i}`,
                [pathMap[ch]],
                startX + i * gap,
                y,
                86,
                86,
                ch,
                36
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

        if (targetIndex < 0) {
            return false;
        }

        const targetSlot = this.slots[targetIndex];
        if (targetSlot.tile && targetSlot.tile !== tile) {
            return false;
        }

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
        if (current === this.idiomChars.join('')) {
            this.releaseWanJianQiFa();
        }
    }

    private releaseWanJianQiFa() {
        this.createFloatingText('万箭齐发！', 0, 90, new Color(255, 240, 120, 255));
        this.createTip('成语释放：万箭齐发，全屏清怪');

        this.createImageNode(
            'effect_arrow_rain',
            [this.texturePath.effect_arrow_rain],
            0,
            30,
            240,
            180,
            '',
            0
        );

        const effect = this.node.getChildByName('effect_arrow_rain');
        if (effect) {
            tween(effect)
                .to(0.18, { scale: new Vec3(1.15, 1.15, 1) })
                .to(0.18, { scale: new Vec3(1, 1, 1) })
                .delay(0.18)
                .call(() => effect.destroy())
                .start();
        }

        tween(this.node)
            .by(0.04, { position: new Vec3(8, 0, 0) })
            .by(0.04, { position: new Vec3(-16, 0, 0) })
            .by(0.04, { position: new Vec3(8, 0, 0) })
            .start();

        for (const enemy of [...this.enemies]) {
            if (enemy && enemy.node && enemy.node.isValid) {
                enemy.takeDamage(9999);
            }
        }

        this.clearSlotsAndRespawnTiles();
    }

    private clearSlotsAndRespawnTiles() {
        for (const slot of this.slots) {
            if (slot.tile && slot.tile.node && slot.tile.node.isValid) {
                slot.tile.node.destroy();
            }
            slot.char = '';
            slot.tile = null;
        }
        this.scheduleOnce(() => this.createCharTiles(), 0.3);
    }

    private spawnEnemy() {
        const startX = -this.canvasW / 2 + 120;
        const y = 70 + Math.random() * 140 - 70;

        const enemyNode = this.createImageNode(
            `enemy_${this.spawnedCount}`,
            [
                this.texturePath.enemy_basic_soldier,
                this.texturePath.enemy_bing_fallback,
            ],
            startX,
            y,
            72,
            72,
            '兵',
            28
        );

        const enemy = enemyNode.addComponent(Enemy);
        enemy.init(45 + Math.random() * 18);
        this.enemies.push(enemy);
        this.spawnedCount++;

        if (this.waveLabel) {
            this.waveLabel.string = `敌人：${this.spawnedCount}/${this.totalEnemies}`;
        }
    }

    public removeEnemy(enemy: Enemy, killed: boolean) {
        const idx = this.enemies.indexOf(enemy);
        if (idx >= 0) this.enemies.splice(idx, 1);
        if (killed) this.killedCount++;
    }

    public enemyHitGate(enemy: Enemy) {
        if (this.gameOver) return;
        this.removeEnemy(enemy, false);
        enemy.node.destroy();

        this.gateHp -= 1;
        if (this.gateHpLabel) {
            this.gateHpLabel.string = `城门血量：${this.gateHp}`;
        }

        if (this.gateHp <= 4) {
            this.createTip('城门危急！快拼出“万箭齐发”');
        }

        if (this.gateHp <= 0) {
            this.showResult('城门被破！点击重新开始', false);
        }
    }

    private showResult(msg: string, success: boolean) {
        if (this.gameOver) return;
        this.gameOver = true;

        let panel: Node;
        if (!success) {
            panel = this.createImageNode(
                'result',
                [this.texturePath.fail_popup],
                0,
                0,
                560,
                220,
                '',
                0
            );
        } else {
            panel = this.createBox('result', 0, 0, 560, 185, new Color(40, 45, 55, 240), '', 34);
            this.createText('result_text', msg, 0, 0, 34, new Color(255, 240, 180, 255));
        }

        if (!success) {
            // 失败弹窗图片本身已经带“战斗失败/重新开始”，这里补一个透明触控层即可。
            const touchLayer = new Node('result_touch_layer');
            touchLayer.parent = panel;
            touchLayer.addComponent(UITransform).setContentSize(560, 220);
        }

        panel.on(Node.EventType.TOUCH_END, () => this.restart(), this);
        panel.on(Node.EventType.MOUSE_UP, () => this.restart(), this);
    }

    private restart() {
        this.gateHp = 12;
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

    /**
     * 创建图片节点。
     * 注意：图片 Sprite 放在子节点上，父节点只负责位置、大小、触摸。
     * 这样 CharTile 拖拽不会和 Sprite/Label 渲染组件冲突。
     */
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

            const sprite = spriteNode.addComponent(Sprite);
            sprite.spriteFrame = spriteFrame;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;

            const ui = spriteNode.getComponent(UITransform);
            if (ui) {
                ui.setContentSize(w, h);
            }
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

    /**
     * 创建纯色圆角盒子，作为结果面板等临时 UI fallback。
     */
    private createBox(name: string, x: number, y: number, w: number, h: number, color: Color, text: string, fontSize: number): Node {
        const node = new Node(name);
        node.parent = this.node;
        node.setPosition(x, y);

        const ui = node.addComponent(UITransform);
        ui.setContentSize(w, h);

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
