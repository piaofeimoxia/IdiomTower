import { Node, UITransform, Color, Graphics, Vec3, Label, tween } from 'cc';
import { ViewSystem } from './ViewSystem';
import type { RogueliteRewardOption, RewardRarity } from './ViewSystemRoguelitePatch';

type PatchedViewSystem = ViewSystem & {
    effectLayer?: Node | null;
    uiLayer?: Node | null;
    __rewardCancelableRoot?: Node | null;
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

function showCancelablePick2(
    self: PatchedViewSystem,
    rawOptions: RogueliteRewardOption[],
    pickCount: number,
    onComplete: (selected: RogueliteRewardOption[]) => void,
) {
    const parent = self.effectLayer ?? self.uiLayer;
    if (!parent || !parent.isValid) return;

    if (self.__rewardCancelableRoot && self.__rewardCancelableRoot.isValid) {
        self.__rewardCancelableRoot.destroy();
    }

    const options = normalizeOptions(rawOptions);
    const root = new Node('reward_cancelable_pick2_root_v08634');
    parent.addChild(root);
    root.setPosition(0, 0, 0);
    root.addComponent(UITransform).setContentSize(1280, 720);
    self.__rewardCancelableRoot = root;

    createPanel(root, 'reward_backdrop', 0, 0, 930, 456, new Color(18, 24, 34, 250), new Color(150, 180, 215, 145), 20);
    createText(root, 'reward_title', '升级奖励：五选二', 0, 184, 830, 42, 32, new Color(255, 236, 170, 255));
    const status = createText(root, 'reward_status', `已选 0/${pickCount}，点击已选卡片可取消`, 0, 150, 830, 30, 20, new Color(190, 220, 240, 255));
    const statusLabel = status.getComponent(Label)!;

    const positions = [
        new Vec3(-290, 60, 0),
        new Vec3(0, 60, 0),
        new Vec3(290, 60, 0),
        new Vec3(-145, -112, 0),
        new Vec3(145, -112, 0),
    ];

    const chosen: RogueliteRewardOption[] = [];
    const chosenIds = new Set<string>();
    const overlays = new Map<string, Node[]>();

    const confirm = createPanel(root, 'confirm_btn', 0, -198, 190, 48, new Color(62, 68, 78, 245), new Color(150, 165, 185, 150), 14);
    const confirmText = createText(confirm, 'confirm_text', '先选择 2 个', 0, 0, 170, 30, 22, new Color(170, 180, 192, 255));
    const confirmLabel = confirmText.getComponent(Label)!;

    const refreshStatus = () => {
        if (chosen.length >= pickCount) {
            setLabel(statusLabel, `已选 ${chosen.length}/${pickCount}，可确认；点击已选卡片可取消`, 20, new Color(255, 232, 170, 255));
            setLabel(confirmLabel, '确认选择', 22, Color.WHITE);
        } else {
            setLabel(statusLabel, `已选 ${chosen.length}/${pickCount}，点击已选卡片可取消`, 20, new Color(190, 220, 240, 255));
            setLabel(confirmLabel, `先选择 ${pickCount} 个`, 22, new Color(170, 180, 192, 255));
        }
    };

    const unselect = (opt: RogueliteRewardOption) => {
        const idx = chosen.findIndex(item => item.id === opt.id);
        if (idx < 0) return;
        chosen.splice(idx, 1);
        chosenIds.delete(opt.id);
        const nodes = overlays.get(opt.id) ?? [];
        for (const node of nodes) {
            if (node && node.isValid) node.destroy();
        }
        overlays.delete(opt.id);
        refreshStatus();
    };

    for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const pos = positions[i];
        const card = createPanel(root, `reward_card_${i}`, pos.x, pos.y, 220, 142, rarityPanelColor[opt.rarity], rarityColor[opt.rarity], 16);
        createText(card, `rarity_${i}`, rarityName[opt.rarity], 0, 48, 184, 22, 16, rarityColor[opt.rarity]);
        createText(card, `title_${i}`, opt.title, 0, 14, 186, 40, 22, Color.WHITE);
        createText(card, `desc_${i}`, opt.desc, 0, -36, 186, 48, 15, new Color(220, 232, 240, 255));

        const select = () => {
            if (chosenIds.has(opt.id)) {
                unselect(opt);
                return;
            }

            if (chosen.length >= pickCount) {
                setLabel(statusLabel, `已经选满 ${pickCount} 个，先取消一个再换`, 20, new Color(255, 190, 150, 255));
                return;
            }

            chosenIds.add(opt.id);
            chosen.push(opt);
            const badge = createPanel(card, `selected_badge_${i}`, 0, 0, 218, 140, new Color(255, 236, 160, 38), new Color(255, 238, 150, 230), 16);
            const label = createText(card, `selected_text_${i}`, '已选择 / 再点取消', 0, -62, 180, 22, 16, new Color(255, 240, 160, 255));
            overlays.set(opt.id, [badge, label]);
            tween(card).to(0.08, { scale: new Vec3(1.04, 1.04, 1) }).to(0.08, { scale: new Vec3(1, 1, 1) }).start();
            refreshStatus();
        };

        card.on(Node.EventType.TOUCH_END, select, self);
        card.on(Node.EventType.MOUSE_UP, select, self);
    }

    const confirmAction = () => {
        if (chosen.length < pickCount) {
            setLabel(statusLabel, `还需要再选 ${pickCount - chosen.length} 个奖励`, 20, new Color(255, 190, 150, 255));
            return;
        }

        const finalChosen = [...chosen];
        if (self.__rewardCancelableRoot && self.__rewardCancelableRoot.isValid) self.__rewardCancelableRoot.destroy();
        self.__rewardCancelableRoot = null;
        onComplete(finalChosen);
    };

    confirm.on(Node.EventType.TOUCH_END, confirmAction, self);
    confirm.on(Node.EventType.MOUSE_UP, confirmAction, self);
    refreshStatus();
}

function installRewardCancelPatch() {
    const proto = ViewSystem.prototype as any;
    if (proto.__rewardCancelPatch08634) return;
    proto.__rewardCancelPatch08634 = true;

    proto.showRewardChoicesPick2 = function(options: RogueliteRewardOption[], pickCount: number, onComplete: (selected: RogueliteRewardOption[]) => void) {
        showCancelablePick2(this as PatchedViewSystem, options, pickCount, onComplete);
    };

    // 兜底：如果底层仍调用旧的单选 showRewardChoices，也强制走可取消五选二。
    proto.showRewardChoices = function(options: RogueliteRewardOption[], onPick: (option: RogueliteRewardOption) => void) {
        showCancelablePick2(this as PatchedViewSystem, options, 2, (selected) => {
            for (const option of selected) onPick(option);
        });
    };
}

installRewardCancelPatch();
