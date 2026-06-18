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
    private rangedAttack = false;
    private rangedAttackX = 0;
    private rangedAttackInterval = 2.2;
    private isRangedStopped = false;

    private spriteRoot: Node | null = null;
    private frameNodes: Node[] = [];
    private shadowNode: Node | null = null;

    private animTimer = 0;
    private seqIndex = 0;
    private motionType: 'basic' | 'shield' | 'cavalry' | 'archer' = 'basic';

    private archerState: 'walk' | 'aim' | 'shoot' | 'cooldown' = 'walk';
    private archerStateTimer = 0;
    private archerAimDuration = 0.18;
    private archerShootDuration = 0.12;

    // 普通兵：用 3 姿态往返循环，避开最别扭的一帧，让走路更顺眼
    private readonly basicSequence = [0, 1, 2, 1];
    private readonly basicDurations = [0.20, 0.10, 0.20, 0.10];

    // 盾兵：更稳定的贴地走路节奏
    private readonly shieldSequence = [0, 1, 2, 3];
    private readonly shieldDurations = [0.18, 0.10, 0.18, 0.10];

    // 骑兵：完整 4 帧循环，主要依靠马腿变化表现步态，避免上下漂浮。
    private readonly cavalrySequence = [0, 1, 2, 3];
    private readonly cavalryDurations = [0.16, 0.12, 0.16, 0.12];

    // 弓兵：贴地走路，脚步节奏参考盾兵，但保留自己的持弓姿态。
    private readonly archerWalkSequence = [0, 1, 2, 3];
    private readonly archerWalkDurations = [0.18, 0.10, 0.18, 0.10];

    public init(speed: number, hp = 1, damage = 1, hitX = 145) {
        this.speed = speed;
        this.hp = hp;
        this.damage = damage;
        this.hitX = hitX;
        this.createShadow();
        this.applyFramePose();
    }

    public setAnimatedNodes(spriteRoot: Node, frameNodes: Node[], _fps = 4, motionType: 'basic' | 'shield' | 'cavalry' | 'archer' = 'basic') {
        this.spriteRoot = spriteRoot;
        this.frameNodes = frameNodes || [];
        this.motionType = motionType;
        const seq = this.getSequence();
        this.seqIndex = this.motionType === 'archer'
            ? 0
            : Math.floor(Math.random() * Math.max(1, seq.length));
        this.animTimer = 0;
        if (this.motionType === 'archer') {
            this.archerState = 'walk';
            this.archerStateTimer = 0;
        }
        this.applyFramePose();
    }

    private getSequence(): number[] {
        if (this.motionType === 'shield') return this.shieldSequence;
        if (this.motionType === 'cavalry') return this.cavalrySequence;
        if (this.motionType === 'archer') return this.archerWalkSequence;
        return this.basicSequence;
    }

    private getDurations(): number[] {
        if (this.motionType === 'shield') return this.shieldDurations;
        if (this.motionType === 'cavalry') return this.cavalryDurations;
        if (this.motionType === 'archer') return this.archerWalkDurations;
        return this.basicDurations;
    }

    private createShadow() {
        this.shadowNode = new Node('enemy_shadow');
        this.shadowNode.parent = this.node;
        this.shadowNode.setSiblingIndex(0);

        const isCavalry = this.motionType === 'cavalry';
        const isArcher = this.motionType === 'archer';
        // 弓兵也使用步兵式贴地阴影，不再额外抬高，避免视觉上像飘着走。
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
        let frameIndex = seq[this.seqIndex % seq.length] ?? 0;

        if (this.motionType === 'archer' && this.isRangedStopped) {
            if (this.archerState === 'aim') {
                frameIndex = 1;
            } else if (this.archerState === 'shoot') {
                frameIndex = 3;
            } else if (this.archerState === 'cooldown') {
                frameIndex = 2;
            }
        }

        for (let i = 0; i < this.frameNodes.length; i++) {
            const f = this.frameNodes[i];
            if (f && f.isValid) f.active = i === frameIndex;
        }

        if (this.spriteRoot && this.spriteRoot.isValid) {
            let yOffset = 0;
            let xOffset = 0;

            if (this.motionType === 'cavalry') {
                yOffset = 0;
            } else if (this.motionType === 'archer') {
                if (!this.isRangedStopped) {
                    // 弓兵走路阶段改为与盾兵相同的贴地步态逻辑。
                    yOffset = (frameIndex === 1 || frameIndex === 3) ? 1 : 0;
                } else if (this.archerState === 'shoot') {
                    xOffset = 1;
                }
            } else {
                yOffset = (frameIndex === 1 || frameIndex === 3) ? 1 : 0;
            }

            this.spriteRoot.setPosition(xOffset, yOffset, 0);
        }

        if (this.shadowNode && this.shadowNode.isValid) {
            let scaleX = 1.0;
            if (this.motionType === 'cavalry') {
                scaleX = (frameIndex === 1 || frameIndex === 3) ? 0.97 : 1.02;
            } else if (this.motionType === 'archer') {
                if (!this.isRangedStopped) {
                    // 弓兵走路时阴影缩放也与盾兵一致。
                    scaleX = (frameIndex === 1 || frameIndex === 3) ? 0.92 : 1.0;
                } else if (this.archerState === 'shoot') {
                    scaleX = 0.92;
                } else {
                    scaleX = 0.98;
                }
            } else {
                scaleX = (frameIndex === 1 || frameIndex === 3) ? 0.92 : 1.0;
            }
            this.shadowNode.setScale(scaleX, 1, 1);
        }
    }

    public setRangedAttack(attackX: number, interval = 2.2) {
        this.rangedAttack = true;
        this.rangedAttackX = attackX;
        this.rangedAttackInterval = interval;
        this.isRangedStopped = false;
        this.archerState = 'walk';
        this.archerStateTimer = 0;
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

        if (this.motionType === 'archer' && this.rangedAttack) {
            this.updateArcher(dt);
        } else {
            this.updateWalker(dt);
        }

        if (!this.rangedAttack && this.node.position.x >= this.hitX) {
            GameManager.inst.enemyHitGate(this);
        }
    }

    private updateWalker(dt: number) {
        const p = this.node.position;
        const nextX = Math.round((p.x + this.speed * dt) * 2) / 2;
        this.node.setPosition(nextX, p.y, p.z);
        this.updateWalkAnimation(dt);
    }

    private updateWalkAnimation(dt: number) {
        if (this.frameNodes.length <= 1) return;

        this.animTimer += dt;
        const durations = this.getDurations();
        while (true) {
            const duration = durations[this.seqIndex % durations.length] || 0.14;
            if (this.animTimer < duration) break;
            this.animTimer -= duration;
            this.seqIndex = (this.seqIndex + 1) % this.getSequence().length;
            this.applyFramePose();
        }
    }

    private updateArcher(dt: number) {
        const p = this.node.position;

        if (!this.isRangedStopped) {
            if (p.x >= this.rangedAttackX) {
                this.isRangedStopped = true;
                this.archerState = 'aim';
                this.archerStateTimer = 0;
                this.node.setPosition(this.rangedAttackX, p.y, p.z);
                this.seqIndex = 1;
                this.animTimer = 0;
                this.applyFramePose();
                return;
            }

            const nextX = Math.round((p.x + this.speed * dt) * 2) / 2;
            this.node.setPosition(nextX, p.y, p.z);
            this.updateWalkAnimation(dt);
            return;
        }

        this.archerStateTimer += dt;

        if (this.archerState === 'aim') {
            if (this.archerStateTimer >= this.archerAimDuration) {
                this.archerState = 'shoot';
                this.archerStateTimer = 0;
                this.applyFramePose();
                this.playRangedAttackPose();
                GameManager.inst.enemyRangedAttackGate(this);
            }
            return;
        }

        if (this.archerState === 'shoot') {
            if (this.archerStateTimer >= this.archerShootDuration) {
                this.archerState = 'cooldown';
                this.archerStateTimer = 0;
                this.applyFramePose();
            }
            return;
        }

        if (this.archerState === 'cooldown') {
            if (this.archerStateTimer >= this.rangedAttackInterval) {
                this.archerState = 'aim';
                this.archerStateTimer = 0;
                this.applyFramePose();
            }
        }
    }

    private playRangedAttackPose() {
        if (this.motionType === 'archer') {
            tween(this.node)
                .to(0.04, { scale: new Vec3(1.04, 0.98, 1) })
                .to(0.08, { scale: new Vec3(1, 1, 1) })
                .start();
            return;
        }

        tween(this.node)
            .to(0.06, { scale: new Vec3(1.08, 0.96, 1) })
            .to(0.10, { scale: new Vec3(1, 1, 1) })
            .start();
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
