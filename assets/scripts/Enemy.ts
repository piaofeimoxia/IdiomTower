import { _decorator, Component, Node, Color, UITransform, tween, Vec3, Sprite, Graphics } from 'cc';
import { GameManager } from './GameManager';

const { ccclass } = _decorator;

type ArcherState = 'walk' | 'raise' | 'draw' | 'full' | 'release' | 'recover' | 'cooldown';

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
    private rangedAttackInterval = 1.6;
    private isRangedStopped = false;

    private spriteRoot: Node | null = null;
    private frameNodes: Node[] = [];
    private archerActionNodes: Node[] = [];
    private shadowNode: Node | null = null;

    private animTimer = 0;
    private seqIndex = 0;
    private motionType: 'basic' | 'shield' | 'cavalry' | 'archer' = 'basic';

    private archerState: ArcherState = 'walk';
    private archerStateTimer = 0;
    private readonly archerRaiseDuration = 0.10;
    private readonly archerDrawDuration = 0.12;
    private readonly archerFullDuration = 0.14;
    private readonly archerReleaseDuration = 0.08;
    private readonly archerRecoverDuration = 0.14;

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

    public setAnimatedNodes(
        spriteRoot: Node,
        frameNodes: Node[],
        _fps = 4,
        motionType: 'basic' | 'shield' | 'cavalry' | 'archer' = 'basic',
        archerActionNodes: Node[] = []
    ) {
        this.spriteRoot = spriteRoot;
        this.frameNodes = frameNodes || [];
        this.archerActionNodes = archerActionNodes || [];
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

    private getAllFrameNodes() {
        return [...this.frameNodes, ...this.archerActionNodes];
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

    private setActiveFrameGroup(activeGroup: Node[], activeIndex: number) {
        const all = this.getAllFrameNodes();
        for (const n of all) {
            if (n && n.isValid) n.active = false;
        }
        if (activeGroup.length <= 0) return;
        const idx = Math.max(0, Math.min(activeIndex, activeGroup.length - 1));
        const node = activeGroup[idx];
        if (node && node.isValid) node.active = true;
    }

    private getArcherActionFrameIndex() {
        switch (this.archerState) {
            case 'raise': return 1;
            case 'draw': return 2;
            case 'full': return 3;
            case 'release': return 4;
            case 'recover': return 5;
            case 'cooldown': return 5;
            default: return 0;
        }
    }

    private applyFramePose() {
        if (this.frameNodes.length <= 0) return;

        const seq = this.getSequence();
        let frameIndex = seq[this.seqIndex % seq.length] ?? 0;
        let usingArcherAction = false;

        if (this.motionType === 'archer' && this.isRangedStopped && this.archerActionNodes.length > 0) {
            usingArcherAction = true;
            const actionIndex = this.getArcherActionFrameIndex();
            this.setActiveFrameGroup(this.archerActionNodes, actionIndex);
        } else {
            this.setActiveFrameGroup(this.frameNodes, frameIndex);
        }

        if (this.spriteRoot && this.spriteRoot.isValid) {
            let yOffset = 0;
            let xOffset = 0;

            if (this.motionType === 'cavalry') {
                yOffset = 0;
            } else if (this.motionType === 'archer') {
                if (!usingArcherAction) {
                    yOffset = (frameIndex === 1 || frameIndex === 3) ? 1 : 0;
                } else {
                    switch (this.archerState) {
                        case 'raise': xOffset = -1; break;
                        case 'draw': xOffset = 0; break;
                        case 'full': xOffset = 1; break;
                        case 'release': xOffset = 2; break;
                        case 'recover': xOffset = 0; break;
                        case 'cooldown': xOffset = 0; break;
                    }
                    yOffset = 0;
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
                if (!usingArcherAction) {
                    scaleX = (frameIndex === 1 || frameIndex === 3) ? 0.92 : 1.0;
                } else {
                    scaleX = this.archerState === 'release' ? 0.95 : 0.98;
                }
            } else {
                scaleX = (frameIndex === 1 || frameIndex === 3) ? 0.92 : 1.0;
            }
            this.shadowNode.setScale(scaleX, 1, 1);
        }
    }

    public setRangedAttack(attackX: number, interval = 2.2) {
        this.rangedAttack = true;
        this.rangedAttackX = Math.floor(attackX);
        this.rangedAttackInterval = interval;
        this.isRangedStopped = false;
        this.archerState = 'walk';
        this.archerStateTimer = 0;
    }

    public freeze(seconds: number) {
        if (this.dead) return;

        this.frozenTimer = Math.max(this.frozenTimer, seconds);

        for (const frame of this.getAllFrameNodes()) {
            if (!frame || !frame.isValid) continue;
            const sprite = frame.getComponent(Sprite);
            if (sprite) sprite.color = new Color(150, 210, 255, 255);
        }

        if (this.shadowNode && this.shadowNode.isValid) {
            this.shadowNode.setScale(1.08, 1.08, 1);
        }
    }

    private clearFreezeVisual() {
        for (const frame of this.getAllFrameNodes()) {
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
            for (const frame of this.getAllFrameNodes()) {
                if (!frame || !frame.isValid) continue;
                const sprite = frame.getComponent(Sprite);
                if (sprite) sprite.color = new Color(255, 245, 190, 255);
            }

            this.scheduleOnce(() => {
                for (const frame of this.getAllFrameNodes()) {
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
                this.archerState = 'raise';
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

        if (this.archerState === 'raise') {
            if (this.archerStateTimer >= this.archerRaiseDuration) {
                this.archerState = 'draw';
                this.archerStateTimer = 0;
                this.applyFramePose();
            }
            return;
        }

        if (this.archerState === 'draw') {
            if (this.archerStateTimer >= this.archerDrawDuration) {
                this.archerState = 'full';
                this.archerStateTimer = 0;
                this.applyFramePose();
            }
            return;
        }

        if (this.archerState === 'full') {
            if (this.archerStateTimer >= this.archerFullDuration) {
                this.archerState = 'release';
                this.archerStateTimer = 0;
                this.applyFramePose();
                this.playRangedAttackPose();
                GameManager.inst.enemyRangedAttackGate(this);
            }
            return;
        }

        if (this.archerState === 'release') {
            if (this.archerStateTimer >= this.archerReleaseDuration) {
                this.archerState = 'recover';
                this.archerStateTimer = 0;
                this.applyFramePose();
            }
            return;
        }

        if (this.archerState === 'recover') {
            if (this.archerStateTimer >= this.archerRecoverDuration) {
                this.archerState = 'cooldown';
                this.archerStateTimer = 0;
                this.applyFramePose();
            }
            return;
        }

        if (this.archerState === 'cooldown') {
            if (this.archerStateTimer >= this.rangedAttackInterval) {
                this.archerState = 'raise';
                this.archerStateTimer = 0;
                this.applyFramePose();
            }
        }
    }

    private playRangedAttackPose() {
        if (this.motionType === 'archer') {
            tween(this.node)
                .to(0.05, { scale: new Vec3(1.06, 0.97, 1) })
                .to(0.10, { scale: new Vec3(1, 1, 1) })
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
