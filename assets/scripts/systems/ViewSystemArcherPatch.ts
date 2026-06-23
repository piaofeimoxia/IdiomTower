import { Node, UITransform, Color, Graphics, Vec3, tween, resources, SpriteFrame, Sprite } from 'cc';
import { ViewSystem } from './ViewSystem';
import type { EnemyState, ArcherState } from './EnemySystem';

type PatchedViewSystem = ViewSystem & {
    enemyViews?: Map<number, any>;
    effectLayer?: Node | null;
    texturePath?: Record<string, string>;
    loadSpriteFrameList?: (paths: string[], done: (frames: SpriteFrame[]) => void) => void;
    appendAnimatedFrames?: (spriteRoot: Node, namePrefix: string, frames: SpriteFrame[], w: number, h: number) => Node[];
};

const archerShootPaths = [
    'textures/enemy_archer_shoot_0',
    'textures/enemy_archer_shoot_1',
    'textures/enemy_archer_shoot_2',
    'textures/enemy_archer_shoot_3',
    'textures/enemy_archer_shoot_4',
    'textures/enemy_archer_shoot_5',
];

function getActionFrameIndex(state: ArcherState) {
    switch (state) {
        case 'raise': return 1;
        case 'draw': return 2;
        case 'full': return 3;
        case 'release': return 4;
        case 'recover': return 5;
        case 'cooldown': return 5;
        default: return 0;
    }
}

function hideNodes(nodes: Node[] | undefined) {
    if (!nodes) return;
    for (const n of nodes) {
        if (n && n.isValid) n.active = false;
    }
}

function showOnly(nodes: Node[] | undefined, index: number) {
    if (!nodes || nodes.length <= 0) return;
    const idx = Math.max(0, Math.min(index, nodes.length - 1));
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n && n.isValid) n.active = i === idx;
    }
}

function loadFrames(paths: string[], done: (frames: SpriteFrame[]) => void) {
    const frames: SpriteFrame[] = new Array(paths.length);
    let remain = paths.length;

    paths.forEach((p, index) => {
        resources.load(`${p}/spriteFrame`, SpriteFrame, (err, spriteFrame) => {
            remain--;
            if (!err && spriteFrame) {
                frames[index] = spriteFrame;
            } else {
                console.warn(`[ViewSystemArcherPatch v0.8.5.5] archer shoot frame load failed: ${p}/spriteFrame`);
            }

            if (remain <= 0) {
                done(frames.filter(Boolean));
            }
        });
    });
}

function appendFrames(spriteRoot: Node, namePrefix: string, frames: SpriteFrame[], w: number, h: number) {
    const nodes: Node[] = [];
    for (let i = 0; i < frames.length; i++) {
        const frameNode = new Node(`${namePrefix}_shoot_${i}`);
        spriteRoot.addChild(frameNode);
        frameNode.setPosition(0, 0, 0);
        frameNode.addComponent(UITransform).setContentSize(w, h);
        const sprite = frameNode.addComponent(Sprite);
        sprite.spriteFrame = frames[i];
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        frameNode.active = false;
        nodes.push(frameNode);
    }
    return nodes;
}

function applyArcherActionPose(view: any, enemy: EnemyState) {
    if (!view || !view.spriteRoot || !view.spriteRoot.isValid) return;

    if (enemy.type !== 'archer' || !enemy.rangedStopped || enemy.archerState === 'walk') {
        return;
    }

    const actionNodes = view.archerActionNodes as Node[] | undefined;
    if (!actionNodes || actionNodes.length <= 0) return;

    hideNodes(view.frameNodes);
    showOnly(actionNodes, getActionFrameIndex(enemy.archerState));

    let xOffset = 0;
    switch (enemy.archerState) {
        case 'raise': xOffset = -1; break;
        case 'draw': xOffset = 0; break;
        case 'full': xOffset = 1; break;
        case 'release': xOffset = 2; break;
        default: xOffset = 0; break;
    }
    view.spriteRoot.setPosition(xOffset, 0, 0);

    if (view.shadowNode && view.shadowNode.isValid) {
        const scaleX = enemy.archerState === 'release' ? 0.95 : 0.98;
        view.shadowNode.setScale(scaleX, 1, 1);
    }
}

function createArrowShotEffect(effectLayer: Node, fromX: number, fromY: number, toX: number, toY: number) {
    const arrow = new Node('archer_arrow');
    effectLayer.addChild(arrow);
    arrow.setPosition(fromX, fromY, 0);
    arrow.addComponent(UITransform).setContentSize(42, 8);
    const g = arrow.addComponent(Graphics);
    g.fillColor = new Color(215, 180, 90, 230);
    g.rect(-21, -4, 42, 8);
    g.fill();
    arrow.setRotationFromEuler(0, 0, 8);

    tween(arrow)
        .to(0.24, { position: new Vec3(toX, toY, 0) })
        .call(() => {
            const burst = new Node('archer_arrow_hit_burst');
            effectLayer.addChild(burst);
            burst.setPosition(toX, toY, 0);
            burst.addComponent(UITransform).setContentSize(24, 24);
            const bg = burst.addComponent(Graphics);
            bg.fillColor = new Color(255, 210, 120, 180);
            bg.circle(0, 0, 12);
            bg.fill();
            tween(burst)
                .to(0.10, { scale: new Vec3(1.25, 1.25, 1) })
                .to(0.12, { scale: new Vec3(0.1, 0.1, 1) })
                .call(() => burst.destroy())
                .start();
            arrow.destroy();
        })
        .start();
}

function installArcherPatch() {
    const proto = ViewSystem.prototype as any;
    if (proto.__archerPatch0855) return;
    proto.__archerPatch0855 = true;

    const oldCreateEnemy = proto.createEnemy;
    const oldUpdateEnemy = proto.updateEnemy;

    proto.createEnemy = function(enemy: EnemyState) {
        oldCreateEnemy.call(this, enemy);

        if (enemy.type !== 'archer') return;
        const self = this as PatchedViewSystem;
        const view = self.enemyViews?.get(enemy.id);
        if (!view || !view.spriteRoot || !view.spriteRoot.isValid) return;

        loadFrames(archerShootPaths, frames => {
            if (!view.spriteRoot || !view.spriteRoot.isValid || frames.length <= 0) return;
            view.archerActionNodes = appendFrames(view.spriteRoot, `enemy_archer_${enemy.id}`, frames, 92, 92);
            console.log(`[ViewSystemArcherPatch v0.8.5.5] archer shoot frames loaded: #${enemy.id}, count=${frames.length}`);
        });
    };

    proto.updateEnemy = function(enemy: EnemyState) {
        oldUpdateEnemy.call(this, enemy);

        if (enemy.type !== 'archer') return;
        const self = this as PatchedViewSystem;
        const view = self.enemyViews?.get(enemy.id);
        applyArcherActionPose(view, enemy);
    };

    proto.showArcherShot = function(enemy: EnemyState) {
        const self = this as PatchedViewSystem;
        const effectLayer = self.effectLayer;
        if (!effectLayer || !effectLayer.isValid) return;

        const gateX = 400;
        createArrowShotEffect(effectLayer, enemy.position.x + 34, enemy.position.y + 18, gateX - 40, 94);
    };
}

installArcherPatch();
