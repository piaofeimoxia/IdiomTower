import { _decorator, Component, Node, Graphics, Color, UITransform, tween, Vec3, Sprite } from 'cc';
import { GameManager } from './GameManager';

const { ccclass } = _decorator;

@ccclass('Enemy')
export class Enemy extends Component {
    public damage = 1;

    private speed = 80;
    private hp = 1;
    private hitX = 145;
    private dead = false;
    private frozenTimer = 0;

    private spriteRoot: Node | null = null;
    private frameNodes: Node[] = [];
    private shadowNode: Node | null = null;

    private animTimer = 0;
    private seqIndex = 0;
    private motionType: 'basic' | 'shield' | 'cavalry' = 'basic';

    // 普通兵：用 3 姿态往返循环，避开最别扭的一帧，让走路更顺眼
    private readonly basicSequence = [0, 1, 2, 1];
    private readonly basicDurations = [0.20, 0.10, 0.20, 0.10];

    // 盾兵：保留目前更自然的 4 帧完整循环
    private readonly shieldSequence = [0, 1, 2, 3];
    private readonly shieldDurations = [0.18, 0.10, 0.18, 0.10];

    // 骑兵：完整 4 帧循环，主要依靠马腿变化表现步态，避免上下浮动。
    private readonly cavalrySequence = [0, 1, 2, 3];
    private readonly cavalryDurations = [0.16, 0.12, 0.16, 0.12];

    public init(speed: number, hp = 1, damage = 1, hitX = 145) {
        this.speed = speed;
        this.hp = hp;
        this.damage = damage;
        this.hitX = hitX;
        this.createShadow();
        this.applyFramePose();
    }

    public setAnimatedNodes(spriteRoot: Node, frameNodes: Node[], _fps = 4, motionType: 'basic' | 'shield' | 'cavalry' = 'basic') {
        this.spriteRoot = spriteRoot;
        this.frameNodes = frameNodes || [];
        this.motionType = motionType;
        const seq = this.getSequence();
        this.seqIndex = Math.floor(Math.random() * Math.max(1, seq.length));
        this.animTimer = 0;
        this.applyFramePose();
    }

    private getSequence(): number[] {
        if (this.motionType === 'shield') return this.shieldSequence;
        if (this.motionType === 'cavalry') return this.cavalrySequence;
        return this.basicSequence;
    }

    private getDurations(): number[] {
        if (this.motionType === 'shield') return this.shieldDurations;
        if (this.motionType === 'cavalry') return this.cavalryDurations;
        return this.basicDurations;
    }

    private createShadow() {
        this.shadowNode = new Node('enemy_shadow');
        this.shadowNode.parent = this.node;
        this.shadowNode.setSiblingIndex(0);

        const isCavalry = this.motionType === 'cavalry';
        this.shadowNode.setPosition(0, isCavalry ? -36 : -24);

        const ui = this.shadowNode.addComponent(UITransform);
        ui.setContentSize(isCavalry ? 84 : 34, isCavalry ? 18 : 10);

        const g = this.shadowNode.addComponent(Graphics);
        g.fillColor = new Color(0, 0, 0, 72);
        g.ellipse(0, 0, isCavalry ? 39 : 15, isCavalry ? 8.0 : 4);
        g.fill();
    }

    private applyFramePose() {
        if (this.frameNodes.length <= 0) return;

        const seq = this.getSequence();
        const frameIndex = seq[this.seqIndex % seq.length] ?? 0;

        for (let i = 0; i < this.frameNodes.length; i++) {
            const f = this.frameNodes[i];
            if (f && f.isValid) f.active = i === frameIndex;
        }

        // 骑兵避免上下漂浮；步兵只保留极轻的重心变化。
        if (this.spriteRoot && this.spriteRoot.isValid) {
            let yOffset = 0;
            if (this.motionType !== 'cavalry') {
                yOffset = (frameIndex === 1 || frameIndex === 3) ? 1 : 0;
            }
            this.spriteRoot.setPosition(0, yOffset, 0);
        }

        if (this.shadowNode && this.shadowNode.isValid) {
            let scaleX = 1.0;
            if (this.motionType === 'cavalry') {
                scaleX = (frameIndex === 1 || frameIndex === 3) ? 0.97 : 1.02;
            } else {
                scaleX = (frameIndex === 1 || frameIndex === 3) ? 0.92 : 1.0;
            }
            this.shadowNode.setScale(scaleX, 1, 1);
        }
    }


    public freeze(seconds: number) {
        if (this.dead) return;

        this.frozenTimer = Math.max(this.frozenTimer, seconds);

        for (const frame of this.frameNodes) {
            if (!frame || !frame.isValid) continue;
            const sprite = frame.getComponent(Sprite);
            if (sprite) sprite.color = new Color(150, 210, 255, 255);
        }

        if (this.shadowNode && this.shadowNode.isValid) {
            this.shadowNode.setScale(1.08, 1.08, 1);
        }
    }

    private clearFreezeVisual() {
        for (const frame of this.frameNodes) {
            if (!frame || !frame.isValid) continue;
            const sprite = frame.getComponent(Sprite);
            if (sprite) sprite.color = Color.WHITE;
        }

        if (this.shadowNode && this.shadowNode.isValid) {
            this.shadowNode.setScale(1, 1, 1);
        }
    }

    private playHitFeedback() {
        if (this.spriteRoot && this.spriteRoot.isValid) {
            for (const frame of this.frameNodes) {
                if (!frame || !frame.isValid) continue;
                const sprite = frame.getComponent(Sprite);
                if (sprite) sprite.color = new Color(255, 245, 190, 255);
            }

            this.scheduleOnce(() => {
                for (const frame of this.frameNodes) {
                    if (!frame || !frame.isValid) continue;
                    const sprite = frame.getComponent(Sprite);
                    if (sprite) {
                        sprite.color = this.frozenTimer > 0
                            ? new Color(150, 210, 255, 255)
                            : Color.WHITE;
                    }
                }
            }, 0.08);
        }

        tween(this.node)
            .to(0.045, { scale: new Vec3(1.08, 1.08, 1) })
            .to(0.075, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    update(dt: number) {
        if (this.dead) return;

        if (this.frozenTimer > 0) {
            this.frozenTimer = Math.max(0, this.frozenTimer - dt);
            if (this.frozenTimer <= 0) this.clearFreezeVisual();
            return;
        }

        const p = this.node.position;
        const nextX = Math.round((p.x + this.speed * dt) * 2) / 2;
        this.node.setPosition(nextX, p.y, p.z);

        if (this.frameNodes.length > 1) {
            this.animTimer += dt;
            const durations = this.getDurations();
            const duration = durations[this.seqIndex % durations.length] || 0.14;
            while (this.animTimer >= duration) {
                this.animTimer -= duration;
                this.seqIndex = (this.seqIndex + 1) % this.getSequence().length;
                this.applyFramePose();
            }
        }

        if (this.node.position.x >= this.hitX) {
            GameManager.inst.enemyHitGate(this);
        }
    }

    public takeDamage(damage: number) {
        if (this.dead) return;

        this.hp -= damage;
        const killed = this.hp <= 0;
        const p = this.node.position;

        this.playHitFeedback();
        GameManager.inst.showEnemyHitFeedback(p.x, p.y, damage, killed);

        if (killed) {
            this.dead = true;
            GameManager.inst.removeEnemy(this, true);
            this.scheduleOnce(() => {
                if (this.node && this.node.isValid) this.node.destroy();
            }, 0.04);
        }
    }
}
