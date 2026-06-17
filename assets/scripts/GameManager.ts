import { _decorator, Component, Node, Label, UITransform, Vec3, Color, Graphics, tween } from 'cc';
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

    onLoad() {
        console.log('GameManager onLoad 运行了');
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
            this.showResult('守城成功！点击重新开始');
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
        const topY = this.canvasH / 2 - 55;
        this.createText('title', '成语施法塔防 Demo', 0, topY, 34, new Color(255, 235, 180, 255));
        this.waveLabel = this.createText('wave', '敌人：0/' + this.totalEnemies, -this.canvasW / 2 + 160, topY - 48, 24, Color.WHITE).getComponent(Label);
    }

    private createGate() {
        const gateX = this.canvasW / 2 - 260;
        const gateY = 60;
        this.createBox('gate', gateX, gateY, 130, 190, new Color(80, 60, 45, 255), '城门', 34);
        this.gateHpLabel = this.createText('gateHp', `城门血量：${this.gateHp}`, gateX, gateY + 120, 26, Color.WHITE).getComponent(Label);
    }

    private createSlots() {
        this.slots = [];
        const y = -this.canvasH / 2 + 175;
        const gap = 118;
        const startX = -gap * 1.5;
        for (let i = 0; i < 4; i++) {
            const slot = this.createBox(`slot_${i}`, startX + i * gap, y, 90, 90, new Color(45, 50, 70, 255), '', 30);
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
        const y = -this.canvasH / 2 + 72;
        const gap = 102;
        const startX = -gap * 2.5;
        for (let i = 0; i < chars.length; i++) {
            const tileNode = this.createBox(`tile_${chars[i]}_${i}`, startX + i * gap, y, 82, 82, new Color(240, 210, 140, 255), chars[i], 36);
            const tile = tileNode.addComponent(CharTile);
            tile.init(chars[i], tileNode.position.clone());
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
        this.createFloatingText('万箭齐发！', 0, 80, new Color(255, 240, 120, 255));
        this.createTip('成语释放：万箭齐发，全屏清怪');

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
        const gateX = this.canvasW / 2 - 360;
        const y = 70 + Math.random() * 140 - 70;

        const enemyNode = this.createBox(
            `enemy_${this.spawnedCount}`,
            startX,
            y,
            64,
            64,
            new Color(170, 55, 55, 255),
            '兵',
            30
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
            this.showResult('城门被破！点击重新开始');
        }
    }

    private showResult(msg: string) {
        if (this.gameOver) return;
        this.gameOver = true;
        const result = this.createBox('result', 0, 0, 560, 185, new Color(30, 30, 45, 235), msg, 34);
        result.on(Node.EventType.TOUCH_END, () => this.restart(), this);
        result.on(Node.EventType.MOUSE_UP, () => this.restart(), this);
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
     * 创建带圆角背景的盒子。
     * 背景 Graphics 挂父节点，文字 Label 挂子节点，避免同节点多个渲染组件警告。
     */
    private createBox(name: string, x: number, y: number, w: number, h: number, color: Color, text: string, fontSize: number): Node {
        const node = new Node(name);
        node.parent = this.node;
        node.setPosition(x, y);

        const ui = node.addComponent(UITransform);
        ui.setContentSize(w, h);

        const g = node.addComponent(Graphics);
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

            const labelUI = labelNode.addComponent(UITransform);
            labelUI.setContentSize(w, h);

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
