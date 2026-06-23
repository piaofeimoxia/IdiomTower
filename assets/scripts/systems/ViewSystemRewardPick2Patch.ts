import { Node, UITransform, Color, Graphics, Vec3, Label, tween } from 'cc';
import { ViewSystem } from './ViewSystem';
import type { RogueliteRewardOption, RewardRarity } from './ViewSystemRoguelitePatch';
import type { DamageResult } from './EnemySystem';

type PatchedViewSystem = ViewSystem & {
    effectLayer?: Node | null;
    uiLayer?: Node | null;
    __rewardPick2Root?: Node | null;
};

const rarityName: Record<RewardRarity, string> = {
    common: '普通',
    rare: '稀有',
    epic: '史诗',
    gold: '金色',
};

const rarityColor: Record<RewardRarity, Color> = {
    common: new Color(230, 232, 224, 255),
    rare: new Color(110, 190, 255, 255),
    epic: new Color(198, 135, 255, 255),
    gold: new Color(255, 214, 86, 255),
};

const rarityPanelColor: Record<RewardRarity, Color> = {
    common: new Color(52, 58, 66, 252),
    rare: new Color(30, 62, 104, 252),
    epic: new Color(70, 42, 102, 252),
    gold: new Color(118, 78, 28, 252),
};

function setLabel(label: Label, text: string, fontSize: number, color: Color) {
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 7;
    label.color = color;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.enableWrapText = true;
    label.overflow = Label.Overflow.SHRINK;
}

function createPanel(parent: Node, name: string, x: number, y: number, w: number, h: number, color: Color, stroke: Color, radius = 14) {
    const node = new Node(name);
    parent.addChild(node);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(w, h);
    const g = node.addComponent(Graphics);
    g.fillColor = color;
    g.roundRect(-w / 2, -h / 2, w, h, radius);
    g.fill();
    g.strokeColor = stroke;
    g.lineWidth = 2;
    g.roundRect(-w / 2, -h / 2, w, h, radius);
    g.stroke();
    return node;
}

function createText(parent: Node, name: string, text: string, x: number, y: number, w: number, h: number, fontSize: number, color: Color) {
    const node = new Node(name);
    parent.addChild(node);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(w, h);
    const label = node.addComponent(Label);
    setLabel(label, text, fontSize, color);
    return node;
}

function installRewardPick2Patch() {
    const proto = ViewSystem.prototype as any;
    if (proto.__rewardPick2Patch0863) return;
    proto.__rewardPick2Patch0863 = true;

    proto.showRewardChoicesPick2 = function(options: RogueliteRewardOption[], pickCount: number, onComplete: (selected: RogueliteRewardOption[]) => void) {
        const self = this as PatchedViewSystem;
        const parent = self.effectLayer ?? self.uiLayer;
        if (!parent || !parent.isValid) return;

        if (self.__rewardPick2Root && self.__rewardPick2Root.isValid) {
            self.__rewardPick2Root.destroy();
        }

        const root = new Node('reward_pick2_root_v0863');
        parent.addChild(root);
        root.setPosition(0, 0, 0);
        root.addComponent(UITransform).setContentSize(1280, 720);
        self.__rewardPick2Root = root;

        createPanel(root, 'reward_backdrop', 0, 0, 910, 430, new Color(18, 24, 34, 250), new Color(150, 180, 215, 145), 20);
        createText(root, 'reward_title', '升级奖励：五选二', 0, 170, 820, 42, 32, new Color(255, 236, 170, 255));
        const status = createText(root, 'reward_status', `已选 0/${pickCount}，战斗暂停`, 0, 135, 820, 30, 20, new Color(190, 220, 240, 255));
        const statusLabel = status.getComponent(Label)!;

        const positions = [
            new Vec3(-290, 46, 0),
            new Vec3(0, 46, 0),
            new Vec3(290, 46, 0),
            new Vec3(-145, -126, 0),
            new Vec3(145, -126, 0),
        ];

        const chosen: RogueliteRewardOption[] = [];
        const chosenIds = new Set<string>();

        for (let i = 0; i < Math.min(5, options.length); i++) {
            const opt = options[i];
            const pos = positions[i];
            const card = createPanel(root, `reward_card_${i}`, pos.x, pos.y, 220, 142, rarityPanelColor[opt.rarity], rarityColor[opt.rarity], 16);
            createText(card, `rarity_${i}`, rarityName[opt.rarity], 0, 48, 184, 22, 16, rarityColor[opt.rarity]);
            createText(card, `title_${i}`, opt.title, 0, 14, 186, 40, 22, Color.WHITE);
            createText(card, `desc_${i}`, opt.desc, 0, -36, 186, 48, 15, new Color(220, 232, 240, 255));

            const pick = () => {
                if (chosenIds.has(opt.id)) return;
                if (chosen.length >= pickCount) return;
                chosenIds.add(opt.id);
                chosen.push(opt);

                createPanel(card, `selected_badge_${i}`, 0, 0, 218, 140, new Color(255, 236, 160, 38), new Color(255, 238, 150, 230), 16);
                createText(card, `selected_text_${i}`, '已选择', 0, -62, 160, 22, 17, new Color(255, 240, 160, 255));
                tween(card).to(0.08, { scale: new Vec3(1.04, 1.04, 1) }).to(0.08, { scale: new Vec3(1, 1, 1) }).start();
                setLabel(statusLabel, `已选 ${chosen.length}/${pickCount}，继续选择`, 20, new Color(255, 232, 170, 255));

                if (chosen.length >= pickCount) {
                    setLabel(statusLabel, '奖励已选择，继续战斗', 20, new Color(170, 240, 190, 255));
                    tween(root)
                        .delay(0.18)
                        .call(() => {
                            if (self.__rewardPick2Root && self.__rewardPick2Root.isValid) self.__rewardPick2Root.destroy();
                            self.__rewardPick2Root = null;
                            onComplete(chosen);
                        })
                        .start();
                }
            };

            card.on(Node.EventType.TOUCH_END, pick, self);
            card.on(Node.EventType.MOUSE_UP, pick, self);
        }
    };

    proto.showBaiBuPierceEffect = function(results: DamageResult[]) {
        const self = this as PatchedViewSystem;
        const parent = self.effectLayer ?? self.uiLayer;
        if (!parent || !parent.isValid || results.length <= 0) return;

        const root = new Node('baibu_pierce_effect_v0863');
        parent.addChild(root);
        root.setPosition(0, 0, 0);
        root.addComponent(UITransform).setContentSize(1280, 720);

        const xs = results.map(r => r.enemy.position.x);
        const ys = results.map(r => r.enemy.position.y + 28);
        const minX = Math.min(...xs) - 38;
        const maxX = Math.max(...xs) + 56;
        const y = ys.reduce((a, b) => a + b, 0) / ys.length;

        const line = new Node('pierce_line');
        root.addChild(line);
        line.setPosition(0, 0, 0);
        line.addComponent(UITransform).setContentSize(1280, 720);
        const g = line.addComponent(Graphics);
        g.strokeColor = new Color(255, 232, 130, 230);
        g.lineWidth = 8;
        g.moveTo(minX, y);
        g.lineTo(maxX, y + 8);
        g.stroke();
        g.strokeColor = new Color(255, 255, 245, 220);
        g.lineWidth = 3;
        g.moveTo(minX + 8, y + 2);
        g.lineTo(maxX - 8, y + 10);
        g.stroke();

        for (const result of results) {
            const burst = new Node('pierce_burst');
            root.addChild(burst);
            burst.setPosition(result.enemy.position.x, result.enemy.position.y + 28, 0);
            burst.addComponent(UITransform).setContentSize(46, 46);
            const bg = burst.addComponent(Graphics);
            bg.fillColor = result.killed ? new Color(255, 200, 85, 210) : new Color(255, 245, 170, 170);
            bg.circle(0, 0, result.killed ? 23 : 16);
            bg.fill();
            tween(burst).to(0.10, { scale: new Vec3(1.25, 1.25, 1) }).to(0.16, { scale: new Vec3(0.2, 0.2, 1) }).start();
        }

        createText(root, 'pierce_text', results.length >= 2 ? `百步穿杨 · 贯穿 x${results.length}` : '百步穿杨！', 0, 112, 620, 40, 30, new Color(255, 236, 145, 255));
        tween(root).delay(0.46).call(() => root.destroy()).start();
    };
}

installRewardPick2Patch();
