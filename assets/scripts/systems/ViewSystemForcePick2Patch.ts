import { Node, UITransform, Color, Graphics, Vec3, Label, tween } from 'cc';
import { ViewSystem } from './ViewSystem';
import type { RogueliteRewardOption, RewardRarity } from './ViewSystemRoguelitePatch';

type PatchedViewSystem = ViewSystem & {
    effectLayer?: Node | null;
    uiLayer?: Node | null;
    __forcePick2Root?: Node | null;
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

const extraCharPool = ['万', '箭', '齐', '发', '固', '若', '金', '汤', '画', '地', '为', '牢'];

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

function normalizeOptions(options: RogueliteRewardOption[]) {
    const result: RogueliteRewardOption[] = [];
    const usedTitles = new Set<string>();

    for (const opt of options) {
        if (!opt || usedTitles.has(opt.title)) continue;
        usedTitles.add(opt.title);
        result.push(opt);
    }

    for (const ch of extraCharPool) {
        if (result.length >= 5) break;
        const title = `获得字「${ch}」`;
        if (usedTitles.has(title)) continue;
        usedTitles.add(title);
        result.push({
            id: `char:${ch}:${Date.now()}:${Math.random()}`,
            rarity: 'common',
            title,
            desc: '副本 +1，进入成语字池',
        });
    }

    return result.slice(0, 5);
}

function installForcePick2Patch() {
    const proto = ViewSystem.prototype as any;
    if (proto.__forcePick2Patch08631) return;
    proto.__forcePick2Patch08631 = true;

    /**
     * 强制把旧的 showRewardChoices 单选 UI 改成五选二。
     * 兼容 SystemManager 仍调用 showRewardChoices(options, onPick) 的情况。
     */
    proto.showRewardChoices = function(options: RogueliteRewardOption[], onPick: (option: RogueliteRewardOption) => void) {
        const self = this as PatchedViewSystem;
        const parent = self.effectLayer ?? self.uiLayer;
        if (!parent || !parent.isValid) return;

        if (self.__forcePick2Root && self.__forcePick2Root.isValid) {
            self.__forcePick2Root.destroy();
        }

        const finalOptions = normalizeOptions(options);
        const pickCount = 2;
        const root = new Node('force_pick2_reward_root_v08631');
        parent.addChild(root);
        root.setPosition(0, 0, 0);
        root.addComponent(UITransform).setContentSize(1280, 720);
        self.__forcePick2Root = root;

        createPanel(root, 'reward_backdrop', 0, 0, 910, 430, new Color(18, 24, 34, 250), new Color(150, 180, 215, 145), 20);
        createText(root, 'reward_title', '升级奖励：五选二', 0, 170, 820, 42, 32, new Color(255, 236, 170, 255));
        const status = createText(root, 'reward_status', '已选 0/2，战斗暂停', 0, 135, 820, 30, 20, new Color(190, 220, 240, 255));
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

        for (let i = 0; i < finalOptions.length; i++) {
            const opt = finalOptions[i];
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
                setLabel(statusLabel, `已选 ${chosen.length}/2，继续选择`, 20, new Color(255, 232, 170, 255));

                if (chosen.length >= pickCount) {
                    setLabel(statusLabel, '奖励已选择，继续战斗', 20, new Color(170, 240, 190, 255));
                    tween(root)
                        .delay(0.18)
                        .call(() => {
                            if (self.__forcePick2Root && self.__forcePick2Root.isValid) self.__forcePick2Root.destroy();
                            self.__forcePick2Root = null;
                            for (const selected of chosen) onPick(selected);
                        })
                        .start();
                }
            };

            card.on(Node.EventType.TOUCH_END, pick, self);
            card.on(Node.EventType.MOUSE_UP, pick, self);
        }
    };
}

installForcePick2Patch();
