import { Node, UITransform, Color, Graphics, Vec3, Label, tween, resources, SpriteFrame, Sprite } from 'cc';
import { ViewSystem } from './ViewSystem';
import type { EnemyState } from './EnemySystem';

type PatchedViewSystem = ViewSystem & {
    effectLayer?: Node | null;
    texturePath?: Record<string, string>;
};

function createCenteredText(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color) {
    const node = new Node(name);
    parent.addChild(node);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(820, fontSize + 18);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 8;
    label.color = color;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    return node;
}

function tryAttachSprite(parent: Node, texturePath: string, width: number, height: number) {
    const spriteNode = new Node('arrow_rain_sprite');
    parent.addChild(spriteNode);
    spriteNode.addComponent(UITransform).setContentSize(width, height);
    const sprite = spriteNode.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;

    resources.load(`${texturePath}/spriteFrame`, SpriteFrame, (err, spriteFrame) => {
        if (!spriteNode.isValid) return;
        if (err || !spriteFrame) {
            console.warn(`[ViewSystemSkillPatch v0.8.5.4] texture load failed: ${texturePath}/spriteFrame`);
            spriteNode.destroy();
            return;
        }
        sprite.spriteFrame = spriteFrame;
    });

    return spriteNode;
}

function installArrowRainVisualPatch() {
    const proto = ViewSystem.prototype as any;
    if (proto.__arrowRainVisualPatch0854) return;
    proto.__arrowRainVisualPatch0854 = true;

    /**
     * v0.8.5.4 万箭齐发视觉优化。
     * 只优化表现，不改技能伤害逻辑。
     */
    proto.showArrowRainEffect = function(hitCount = 0) {
        const self = this as PatchedViewSystem;
        const effectLayer = self.effectLayer;
        if (!effectLayer || !effectLayer.isValid) return;

        const root = new Node('skill_arrow_rain_compact_v0854');
        effectLayer.addChild(root);
        root.setPosition(0, 0, 0);
        root.addComponent(UITransform).setContentSize(1280, 720);

        // 1. 路面快速扫光：表现“全屏清怪”，但不遮住整条地面。
        const laneFlash = new Node('arrow_lane_flash');
        root.addChild(laneFlash);
        laneFlash.setPosition(0, 20, 0);
        laneFlash.addComponent(UITransform).setContentSize(1040, 72);
        const flashG = laneFlash.addComponent(Graphics);
        flashG.fillColor = new Color(255, 230, 120, 52);
        flashG.roundRect(-520, -36, 1040, 72, 22);
        flashG.fill();
        flashG.strokeColor = new Color(255, 238, 160, 128);
        flashG.lineWidth = 3;
        flashG.roundRect(-520, -36, 1040, 72, 22);
        flashG.stroke();

        // 2. 箭雨贴图缩小并上移，避免压住地面中心。
        const effectTexture = self.texturePath?.effect_arrow_rain ?? 'textures/effect_arrow_rain';
        const spriteHolder = new Node('arrow_rain_holder');
        root.addChild(spriteHolder);
        spriteHolder.setPosition(0, 78, 0);
        spriteHolder.addComponent(UITransform).setContentSize(190, 142);
        tryAttachSprite(spriteHolder, effectTexture, 190, 142);

        // 3. 补几条轻量箭线，形成横向覆盖感。
        for (let i = 0; i < 10; i++) {
            const arrow = new Node(`arrow_streak_${i}`);
            root.addChild(arrow);
            arrow.setPosition(-430 + i * 95, 66 - (i % 3) * 18, 0);
            arrow.addComponent(UITransform).setContentSize(58, 7);
            const g = arrow.addComponent(Graphics);
            g.fillColor = new Color(255, 238, 150, 210);
            g.rect(-29, -3.5, 58, 7);
            g.fill();
            arrow.setRotationFromEuler(0, 0, -16);
        }

        // 4. 技能名与击破统计分层显示，不再压贴图。
        const title = createCenteredText(root, 'skill_title', '万箭齐发！', 0, 150, 34, new Color(255, 238, 120, 255));
        const summary = hitCount > 0
            ? createCenteredText(root, 'skill_summary', `击破 ${hitCount} 个敌人`, 0, 112, 24, new Color(255, 230, 150, 255))
            : null;

        tween(laneFlash)
            .to(0.10, { scale: new Vec3(1.04, 1.20, 1) })
            .to(0.12, { scale: new Vec3(1, 1, 1) })
            .start();

        tween(spriteHolder)
            .to(0.12, { scale: new Vec3(1.08, 1.08, 1) })
            .to(0.14, { scale: new Vec3(1, 1, 1) })
            .start();

        tween(title)
            .by(0.42, { position: new Vec3(0, 16, 0) })
            .start();

        if (summary) {
            tween(summary)
                .by(0.42, { position: new Vec3(0, 12, 0) })
                .start();
        }

        tween(root)
            .delay(0.50)
            .to(0.12, { scale: new Vec3(0.98, 0.98, 1) })
            .call(() => root.destroy())
            .start();
    };

    /**
     * v0.8.5.4：单个敌人的击破反馈只保留小爆点，不再满屏散落“击破”文字。
     */
    proto.showEnemyHitFeedback = function(enemy: EnemyState, _damage: number, killed: boolean) {
        const self = this as PatchedViewSystem;
        const effectLayer = self.effectLayer;
        if (!effectLayer || !effectLayer.isValid) return;

        const burst = new Node('hit_burst_compact_v0854');
        effectLayer.addChild(burst);
        burst.setPosition(enemy.position.x, enemy.position.y + 26, 0);
        const size = killed ? 30 : 18;
        burst.addComponent(UITransform).setContentSize(size, size);
        const g = burst.addComponent(Graphics);
        g.fillColor = killed ? new Color(255, 205, 95, 170) : new Color(255, 255, 255, 105);
        g.circle(0, 0, size / 2);
        g.fill();

        tween(burst)
            .to(0.08, { scale: new Vec3(1.18, 1.18, 1) })
            .to(0.12, { scale: new Vec3(0.12, 0.12, 1) })
            .call(() => burst.destroy())
            .start();
    };
}

installArrowRainVisualPatch();
