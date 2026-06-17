import { _decorator, Component, Node, Graphics, Color, UITransform } from 'cc';
import { GameManager } from './GameManager';

const { ccclass } = _decorator;

@ccclass('Enemy')
export class Enemy extends Component {
    public damage = 1;

    private speed = 80;
    private hp = 1;
    private hitX = 145;
    private dead = false;

    private frameNodes: Node[] = [];
    private shadowNode: Node | null = null;

    private animTimer = 0;
    private frameIndex = 0;
    private animFps = 4;

    // 使用正常的 4 帧循环，避免 0-1-2-3-2-1 看起来像顺拐/倒放
    private readonly walkSequence = [0, 1, 2, 3];

    public init(speed: number, hp = 1, damage = 1, hitX = 145) {
        this.speed = speed;
        this.hp = hp;
        this.damage = damage;
        this.hitX = hitX;
        this.animFps = hp >= 3 ? 4 : 4;
        this.createShadow();
        this.applyFrame();
    }

    public setAnimatedNodes(_spriteRoot: Node, frameNodes: Node[], fps = 4) {
        this.frameNodes = frameNodes || [];
        this.animFps = Math.max(2, Math.min(fps, 4));
        this.frameIndex = Math.floor(Math.random() * this.walkSequence.length);
        this.applyFrame();
    }

    private createShadow() {
        this.shadowNode = new Node('enemy_shadow');
        this.shadowNode.parent = this.node;
        this.shadowNode.setSiblingIndex(0);
        this.shadowNode.setPosition(0, -24);

        const ui = this.shadowNode.addComponent(UITransform);
        ui.setContentSize(34, 10);

        const g = this.shadowNode.addComponent(Graphics);
        g.fillColor = new Color(0, 0, 0, 70);
        g.ellipse(0, 0, 15, 4);
        g.fill();
    }

    private applyFrame() {
        if (this.frameNodes.length <= 0) return;
        const idx = this.walkSequence[this.frameIndex % this.walkSequence.length];
        for (let i = 0; i < this.frameNodes.length; i++) {
            const f = this.frameNodes[i];
            if (f && f.isValid) f.active = i === idx;
        }
    }

    update(dt: number) {
        if (this.dead) return;

        const p = this.node.position;
        const nextX = Math.round((p.x + this.speed * dt) * 2) / 2;
        this.node.setPosition(nextX, p.y, p.z);

        if (this.frameNodes.length > 1) {
            this.animTimer += dt;
            const frameTime = 1 / this.animFps;
            while (this.animTimer >= frameTime) {
                this.animTimer -= frameTime;
                this.frameIndex = (this.frameIndex + 1) % this.walkSequence.length;
                this.applyFrame();
            }
        }

        if (this.node.position.x >= this.hitX) {
            GameManager.inst.enemyHitGate(this);
        }
    }

    public takeDamage(damage: number) {
        if (this.dead) return;
        this.hp -= damage;
        if (this.hp <= 0) {
            this.dead = true;
            GameManager.inst.removeEnemy(this, true);
            this.node.destroy();
        }
    }
}
