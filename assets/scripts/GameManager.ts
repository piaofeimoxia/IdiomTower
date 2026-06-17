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
    private gateShield = 0;

    private spawnedCount = 0;
    private killedCount = 0;
    private spawnTimer = 0;
    private waveRunning = true;
    private gameOver = false;

    private readonly totalEnemies = 18;

    private gateHpLabel: Label | null = null;
    private waveLabel: Label | null = null;
    private tipLabel: Label | null = null;

    private canvasW = 1280;
    private canvasH = 720;

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

        enemy_basic_soldier: 'textures/enemy_basic_soldier',
        enemy_shield_soldier: 'textures/enemy_shield_soldier',
        enemy_bing_fallback: 'textures/enemy_bing',
    };

    onLoad() {
        console.log('成语塔防 Demo v0.2 启动');
        GameManager.inst = this;
        this.readCanvasSize();
        this.setupScene();
    }

    update(dt: number) {
        if (this.gameOver || !this.waveRunning) return;

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
        this.createTip('v0.2：万箭齐发清怪，固若金汤加护盾');
    }

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

    private createGate() {
        const gateX = this.getGateX();
        const gateY = 70;

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
        if (this.gateShield > 0) {
            return `城门血量：${this.gateHp}  护盾：${this.gateShield}`;
        }
        return `城门血量：${this.gateHp}`;
    }

    private refreshGateHpLabel() {
        if (this.gateHpLabel) {
            this.gateHpLabel.string = this.getGateHpText();
        }
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

        if (current === '万箭齐发') {
            this.releaseWanJianQiFa();
        } else if (current === '固若金汤') {
            this.releaseGuRuoJinTang();
        }
    }

    private releaseWanJianQiFa() {
        this.createFloatingText('万箭齐发！', 0, 90, new Color(255, 240, 120, 255));
        this.createTip('成语释放：万箭齐发，全屏清怪');

        this.createImageNode(
            'effect_arrow_rain',
            [this.texturePath.effect_arrow_rain],
            0,
            35,
            260,
            195,
            '',
            0
        );

        const effect = this.node.getChildByName('effect_arrow_rain');
        if (effect) {
            tween(effect)
                .to(0.16, { scale: new Vec3(1.15, 1.15, 1) })
                .to(0.16, { scale: new Vec3(1, 1, 1) })
                .delay(0.22)
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
        const y = 70 + Math.random() * 145 - 72;

        const isShieldEnemy = this.spawnedCount > 0 && this.spawnedCount % 5 === 0;
        const enemyName = isShieldEnemy ? 'enemy_shield' : 'enemy_basic';

        const enemyNode = this.createImageNode(
            `${enemyName}_${this.spawnedCount}`,
            isShieldEnemy
                ? [this.texturePath.enemy_shield_soldier, this.texturePath.enemy_basic_soldier, this.texturePath.enemy_bing_fallback]
                : [this.texturePath.enemy_basic_soldier, this.texturePath.enemy_bing_fallback],
            startX,
            y,
            isShieldEnemy ? 78 : 70,
            isShieldEnemy ? 78 : 70,
            '兵',
            28
        );

        const enemy = enemyNode.addComponent(Enemy);
        if (isShieldEnemy) {
            enemy.init(34 + Math.random() * 8, 3, 1, this.getEnemyHitX());
        } else {
            enemy.init(45 + Math.random() * 18, 1, 1, this.getEnemyHitX());
        }

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

        const damage = enemy.damage || 1;

        this.removeEnemy(enemy, false);
        enemy.node.destroy();

        if (this.gateShield > 0) {
            const absorb = Math.min(this.gateShield, damage);
            this.gateShield -= absorb;
            const remain = damage - absorb;
            if (remain > 0) {
                this.gateHp -= remain;
            }
            this.createTip(`护盾抵挡了 ${absorb} 点伤害`);
        } else {
            this.gateHp -= damage;
        }

        this.refreshGateHpLabel();

        if (this.gateHp <= 4) {
            this.createTip('城门危急！快拼成语救场');
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
                msg,
                32
            );
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
